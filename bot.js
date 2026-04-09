const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const axios = require('axios');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

chromium.use(stealth);

// استخدم التوكين الخاص بك هنا مباشرة إذا لم تكن تستخدم متغيرات البيئة
const BOT_TOKEN = process.env.BOT_TOKEN || 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة';

if (!BOT_TOKEN || BOT_TOKEN === 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة') {
    console.error("❌ خطأ: BOT_TOKEN مفقود.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;
let activeProxy = null;

// تخزين حالة المستخدم لإنشاء الحساب اليدوي
const userState = {};

// ========== إعدادات API البريد (Mail.tm) ==========
const MAIL_API = 'https://api.mail.tm';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// توليد كلمة مرور آمنة
function generateSecurePassword() {
    const length = 16;
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const nums = "0123456789";
    const symbols = "!@#$%^&*";
    const all = lower + upper + nums + symbols;

    let password = "";
    password += lower[crypto.randomInt(0, lower.length)];
    password += upper[crypto.randomInt(0, upper.length)];
    password += nums[crypto.randomInt(0, nums.length)];
    password += symbols[crypto.randomInt(0, symbols.length)];

    for (let i = 0; i < length - 4; i++) password += all[crypto.randomInt(0, all.length)];
    return password.split('').sort(() => 0.5 - Math.random()).join('');
}

// ✅ إنشاء حساب بريد مؤقت على Mail.tm
async function createMailTmAccount(chatId) {
    try {
        const domainsRes = await axios.get(`${MAIL_API}/domains`);
        const domains = domainsRes.data['hydra:member'] || [];
        if (domains.length === 0) throw new Error('لا توجد نطاقات متاحة');
        const domain = domains[Math.floor(Math.random() * domains.length)].domain;

        const username = faker.person.firstName().toLowerCase() + crypto.randomBytes(2).toString('hex');
        const email = `${username}@${domain}`;
        const password = generateSecurePassword();

        await bot.sendMessage(chatId, `📧 جاري إنشاء بريد تلقائي: \`${email}\``, { parse_mode: 'Markdown' });

        await axios.post(`${MAIL_API}/accounts`, { address: email, password: password });

        const tokenRes = await axios.post(`${MAIL_API}/token`, { address: email, password: password });
        const token = tokenRes.data.token;

        return { email, password, token };
    } catch (error) {
        console.error('فشل إنشاء حساب Mail.tm:', error.response?.data || error.message);
        throw new Error('تعذر إنشاء بريد مؤقت تلقائي');
    }
}

// ✅ جلب الرسائل من Mail.tm
async function fetchMailTmMessages(token) {
    try {
        const res = await axios.get(`${MAIL_API}/messages`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data['hydra:member'] || [];
    } catch (error) { return []; }
}

// ✅ انتظار كود التفعيل من Mail.tm (للتلقائي)
async function waitForMailTmCode(email, token, chatId, maxWaitSeconds = 90) {
    const startTime = Date.now();
    const statusMsg = await bot.sendMessage(chatId, `⏳ في انتظار وصول كود التفعيل إلى البريد تلقائياً...`);

    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        const messages = await fetchMailTmMessages(token);
        for (const msg of messages) {
            const content = `${msg.subject || ''} ${msg.intro || ''}`;
            const codeMatch = content.match(/\b\d{6}\b/);
            if (codeMatch) {
                await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
                await bot.sendMessage(chatId, `📩 **تم استخراج الكود تلقائياً:** \`${codeMatch[0]}\``, { parse_mode: 'Markdown' });
                return codeMatch[0];
            }
        }
        await sleep(4000);
    }
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
    return null;
}

// ✅ وظيفة جديدة لإرسال وحذف الصور بالتتابع (بدل البث المباشر القديم)
async function sendStepPhotoAndCleanup(page, chatId, caption, previousPhotoId = null) {
    try {
        // حذف الصورة السابقة إن وجدت
        if (previousPhotoId) {
            await bot.deleteMessage(chatId, previousPhotoId).catch(() => {});
        }

        const screenshotPath = path.join(__dirname, `step_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false }); // fullPage false لأداء أسرع

        const sent = await bot.sendPhoto(chatId, screenshotPath, { caption: caption });
        
        // حذف الملف المحلي
        if (fs.existsSync(screenshotPath)) { fs.unlinkSync(screenshotPath); }
        
        return sent.message_id; // إرجاع الآيدي لحذفه في الخطوة القادمة
    } catch (err) {
        console.error("خطأ في إرسال الصورة:", err.message);
        return previousPhotoId; // في حال الخطأ نُعيد نفس الآيدي لضمان المحاولة لاحقاً
    }
}

// دالة لالتقاط وإرسال صورة الخطأ
async function reportErrorWithScreenshot(page, chatId, errorMessage, tempDir) {
    await bot.sendMessage(chatId, `❌ خطأ: ${errorMessage}`);
    if (page) {
        try {
            const errPath = path.join(tempDir, `error_${Date.now()}.png`);
            await page.screenshot({ path: errPath, fullPage: true });
            await bot.sendPhoto(chatId, errPath, { caption: '📸 لقطة شاشة لمكان الخطأ' });
            if (fs.existsSync(errPath)) { fs.unlinkSync(errPath); }
        } catch (e) {}
    }
}

async function simulateHumanActivityFast(page) {
    try {
        await page.mouse.wheel(0, 300);
        await sleep(300);
        await page.mouse.move(500, 400, { steps: 3 });
    } catch (e) {}
}

// ============================================================
// الدالة الرئيسية لإنشاء الحساب (تم تعديلها كلياً لتلبية الطلبات)
// ============================================================
async function createAccountLogic(chatId, currentNum, total, manualData = null) {
    const isManual = !!manualData;
    const modeText = isManual ? "(يدوي)" : "(تلقائي)";
    
    let statusMsgID = null;
    const updateStatus = async (text) => {
        if (!statusMsgID) {
            const sent = await bot.sendMessage(chatId, `⚡ [${currentNum}/${total}] ${modeText}: ${text}`);
            statusMsgID = sent.message_id;
        } else {
            await bot.editMessageText(`⚡ [${currentNum}/${total}] ${modeText}: ${text}`, { chat_id: chatId, message_id: statusMsgID }).catch(()=>{});
        }
    };

    await updateStatus("بدء العملية...");

    // محاولات الإيميل (حتى 4 مرات في حال خطأ Failed to create)
    const maxEmailAttempts = isManual ? 1 : 4; 
    let currentPhotoId = null; // لتتبع الصور وحذفها

    for (let emailAttempt = 1; emailAttempt <= maxEmailAttempts; emailAttempt++) {
        
        if (!isManual && emailAttempt > 1) {
            await bot.sendMessage(chatId, `🔄 محاولة تغيير الإيميل رقم [${emailAttempt}/${maxEmailAttempts}] بسبب رفض السيرفر...`);
        }

        let email, mailPassword, mailToken;
        
        if (isManual) {
            email = manualData.email;
            mailPassword = manualData.password;
        } else {
            try {
                await updateStatus(`جاري إنشاء بريد مؤقت... (محاولة ${emailAttempt})`);
                const mailData = await createMailTmAccount(chatId);
                email = mailData.email;
                mailPassword = mailData.password;
                mailToken = mailData.token;
            } catch (e) {
                await updateStatus(`❌ فشل إنشاء البريد التلقائي: ${e.message}`);
                return false; // فشل في الحصول على إيميل، ننهي الدورة
            }
        }

        // كلمة مرور ChatGPT (عشوائية دائماً لضمان القبول)
        const chatGptPassword = generateSecurePassword(); 
        const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;

        await updateStatus(`بيانات الحساب جاهزة.\n📧 \`${email}\`\n🔑 \`${chatGptPassword}\`\nجاري فتح المتصفح...`);

        const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_wrk_'));
        let context, page;
        let accountCreatedSuccessfully = false;
        let shouldRetryWithNewEmail = false;

        try {
            const browserOptions = {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
                viewport: { width: 1366, height: 768 },
                timeout: 30000
            };
            if (activeProxy) browserOptions.proxy = { server: activeProxy.server };

            context = await chromium.launchPersistentContext(tempDir, browserOptions);
            page = await context.newPage();

            await updateStatus("جاري تحميل صفحة ChatGPT...");
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🌐 فتح المتصفح", currentPhotoId);

            await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
            await simulateHumanActivityFast(page);

            // الضغط على Sign up
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🖱️ الضغط على Sign up", currentPhotoId);
            const signupBtn = page.locator('button:has-text("Sign up")');
            await signupBtn.waitFor({ state: 'visible', timeout: 20000 });
            await signupBtn.click();

            // إدخال الإيميل
            await page.waitForSelector('input[id="email-input"], input[name="email"]', {timeout: 20000});
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `📝 إدخال الإيميل: ${email}`, currentPhotoId);
            const emailInput = page.locator('input[id="email-input"], input[name="email"]');
            await emailInput.fill(email);
            await sleep(1000);
            await page.keyboard.press('Enter');

            // إدخال كلمة المرور
            await page.waitForSelector('input[type="password"]', {timeout: 20000});
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🔐 إدخال كلمة المرور", currentPhotoId);
            const passInput = page.locator('input[type="password"]');
            await passInput.fill(chatGptPassword);
            await sleep(1000);
            await page.keyboard.press('Enter');

            await updateStatus("جاري التحقق من قبول البيانات...");
            await sleep(5000); // وقت كافٍ لظهور الخطأ المحتمل

            // 📸 [التعديل الأهم 1] التحقق من خطأ "Failed to create account"
            const failedErrorSelector = 'text="Failed to create account"';
            if (await page.isVisible(failedErrorSelector).catch(()=>false)) {
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "❌ ظهر خطأ: Failed to create account", currentPhotoId);
                if (!isManual) {
                    shouldRetryWithNewEmail = true;
                    throw new Error("SERVER_REJECTED_EMAIL"); // الخروج للـ catch لبدء المحاولة التالية
                } else {
                    throw new Error("السيرفر رفض هذا الإيميل اليدوي. يرجى محاولة إيميل آخر لاحقاً.");
                }
            }

            // إذا وصلنا هنا، لم يظهر الخطأ، ننتقل للكود
            await updateStatus("في انتظار صفحة كود التحقق...");
            // ننتظر ظهور حقل الكود للتأكد أننا في الصفحة الصحيحة
            await page.waitForSelector('input[aria-label="Verification code"], input[inputmode="numeric"]', {timeout: 30000})
                .catch(()=>{ throw new Error("لم تظهر صفحة إدخال الكود."); });

            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🧩 صفحة الكود مفتوحة", currentPhotoId);

            let code = null;

            if (isManual) {
                // 📸 [التعديل الأهم 2] الإنشاء اليدوي - طلب الكود من المستخدم
                await updateStatus("🛑 توقف المتصفح. يرجى إرسال كود التحقق الآن هنا في الشات.");
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "💬 بانتظار الكود منك...", currentPhotoId);
                
                code = await new Promise((resolve) => {
                    // تعريف مستمع لرسالة واحدة فقط
                    const listener = (msg) => {
                        if (msg.chat.id === chatId && msg.text && /^\d{6}$/.test(msg.text.trim())) {
                            bot.removeListener('message', listener); // إزالة المستمع فوراً
                            bot.sendMessage(chatId, "✅ تم استلام الكود، جاري إكماله...");
                            resolve(msg.text.trim());
                        } else if (msg.chat.id === chatId && msg.text && msg.text.startsWith('/')) {
                            // إذا أرسل أمراً آخر، نلغي الانتظار
                            bot.removeListener('message', listener);
                            resolve(null);
                        }
                        // نتجاهل الرسائل الخاطئة ونستمر في الانتظار
                    };
                    bot.on('message', listener);
                    // مهلة انتظار للمستخدم دقيقتين
                    setTimeout(() => { 
                        bot.removeListener('message', listener); 
                        resolve(null); 
                    }, 120000);
                });

                if (!code) throw new Error("تم إلغاء العملية أو انتهى وقت انتظار الكود.");

            } else {
                // الإنشاء التلقائي - جلب الكود من API
                code = await waitForMailTmCode(email, mailToken, chatId, 100);
                
                if (!code) {
                    // محاولة ضغط إعادة الإرسال مرة واحدة
                    const resendBtn = page.locator('button:has-text("Resend email")');
                    if (await resendBtn.isVisible().catch(() => false)) {
                        await resendBtn.click();
                        await bot.sendMessage(chatId, "🔄 تم ضغط إعادة إرسال الكود في المتصفح...");
                        code = await waitForMailTmCode(email, mailToken, chatId, 70);
                    }
                }
                if (!code) throw new Error("لم يتم استلام الكود تلقائياً بعد المحاولات.");
            }

            // إدخال الكود في المتصفح
            await updateStatus(`جاري إدخال الكود: \`${code}\`...`);
            
            // محاولة ذكية لإدخال الكود
            const codeInput = await page.$('input[aria-label="Verification code"], input[inputmode="numeric"]');
            if (codeInput) {
                await codeInput.click();
                await page.keyboard.type(code, { delay: 100 });
            } else {
                // سقطة احتياطية
                await page.keyboard.press('Tab');
                await page.keyboard.type(code, { delay: 100 });
            }

            await sleep(5000);
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "⏳ جاري معالجة الكود وإكمال البيانات", currentPhotoId);

            // إدخال الاسم إذا طلب
            const nameInput = await page.waitForSelector('input[name="name"]', { timeout: 15000 }).catch(() => null);
            if (nameInput) {
                await nameInput.fill(fullName);
                await sleep(1000);
                await page.keyboard.press('Enter');
                await sleep(5000);
            }

            // التحقق من النجاح النهائي (الوصول للصفحة الرئيسية)
            await page.waitForURL('**/chat', {timeout: 20000}).catch(()=>{});
            
            if (page.url().includes('/chat')) {
                 const result = `${email}|${chatGptPassword}`;
                 fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
                 currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🎉 تم الدخول للصفحة الرئيسية بنجاح!", currentPhotoId);
                 await bot.sendMessage(chatId, `✅ **تم إنشاء الحساب بنجاح ${modeText}:**\n\`${result}\``, { parse_mode: 'Markdown' });
                 accountCreatedSuccessfully = true;
            } else {
                throw new Error("تم إدخال الكود ولكن لم يتم تحويلنا للصفحة الرئيسية (قد يكون الحساب حُظر فوراً).");
            }

        } catch (error) {
            // معالجة الأخطاء
            if (shouldRetryWithNewEmail) {
                console.log("إعادة المحاولة بإيميل جديد...");
            } else {
                // 📸 [تعديل 3] تصوير الخطأ قبل الإغلاق
                await reportErrorWithScreenshot(page, chatId, error.message, tempDir);
            }
        } finally {
            // التنظيف وإغلاق المتصفح في كل محاولة إيميل
            if (context) await context.close().catch(()=>{});
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
            
            // حذف آخر صورة للخطوات ليبقى الشات نظيفاً (الا لقطة الخطأ ترسل منفردة)
            if (currentPhotoId) { await bot.deleteMessage(chatId, currentPhotoId).catch(()=>{}); currentPhotoId = null; }
        }

        // إذا نجح إنشاء الحساب، نخرج من حلقة محاولات الإيميل
        if (accountCreatedSuccessfully) return true;
        
        // إذا لم يكن خطأ رغبة في الإعادة بإيميل جديد، نوقف العمليات كلياً لهذا الحساب
        if (!shouldRetryWithNewEmail) return false; 
    }

    // إذا وصلنا هنا، يعني استنفدنا الـ 4 محاولات إيميل (في التلقائي) ولم ينجح
    if (!isManual) {
        await bot.sendMessage(chatId, `❌ فشل إنشاء الحساب بعد ${maxEmailAttempts} محاولات لتغيير الإيميل.`);
    }
    return false;
}

// === أوامر البوت ===

bot.onText(/\/start/, (msg) => {
    const opts = { parse_mode: 'Markdown' };
    bot.sendMessage(msg.chat.id, 
        "👋 أهلاً بك!\n\n" +
        "🤖 **الإنشاء التلقائي:**\n" +
        "استخدم `/create 1` لإنشاء حساب واحد (سيقوم البوت بكل شيء، ويغير الإيميل تلقائياً إذا رُفض حتى 4 مرات).\n\n" +
        "✍️ **الإنشاء اليدوي:**\n" +
        "استخدم `/manual_create` (سيطلب منك الإيميل والباسورد، ثم سيطلب منك الكود عندما يصلك)."
    , opts);
});

// أمر الإنشاء التلقائي
bot.onText(/\/create (.+)/, async (msg, match) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت مشغول حالياً بعملية أخرى.");
    
    // إلغاء أي حالة يدوية معلقة
    delete userState[msg.chat.id];

    const num = parseInt(match[1]);
    if (isNaN(num) || num <= 0) return bot.sendMessage(msg.chat.id, "❌ يرجى كتابة رقم صحيح. مثال: `/create 1`", {parse_mode:'Markdown'});

    isProcessing = true;
    for (let i = 1; i <= num; i++) {
        await createAccountLogic(msg.chat.id, i, num, null); // null تعني تلقائي
        await sleep(3000); // راحة بين الحسابات
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 اكتملت جميع العمليات التلقائية.");
});

// امر الإنشاء اليدوي - البداية
bot.onText(/\/manual_create/, (msg) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت مشغول حالياً.");
    
    userState[msg.chat.id] = { step: 'awaiting_email' };
    bot.sendMessage(msg.chat.id, "➡️ [إنشاء يدوي] يرجى إرسال **الإيميل** الذي تريد استخدامه:", {parse_mode: 'Markdown'});
});

// ملقف الرسائل للخطوات اليدوية (إيميل -> باسورد)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : null;

    if (!userState[chatId] || !text || text.startsWith('/')) return; // تجاهل إذا لم تكن هناك حالة أو كان أمراً

    const state = userState[chatId];

    if (state.step === 'awaiting_email') {
        // تحقق بسيط من صيغة الإيميل
        if (!text.includes('@') || !text.includes('.')) {
            return bot.sendMessage(chatId, "❌ يرجى إرسال إيميل صحيح.");
        }
        state.email = text;
        state.step = 'awaiting_password';
        bot.sendMessage(chatId, `✅ تم تسجيل الإيميل.\n➡️ الآن يرجى إرسال **الباسورد** الخاص بهذا الإيميل (ليتمكن البوت من قراءة الكود إذا كان Mail.tm، أو للبقاء كمرجع لديك):`, {parse_mode: 'Markdown'});
    
    } else if (state.step === 'awaiting_password') {
        state.password = text;
        const emailToUse = state.email;
        const passToUse = state.password;
        
        // تنظيف الحالة وبدء المعالجة
        delete userState[chatId];
        
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت انشغل بعملية أخرى للتو، ألغيت العملية اليدوية.");
        
        isProcessing = true;
        bot.sendMessage(chatId, "🚀 جاري بدء الإنشاء اليدوي...");
        
        // استدعاء الدالة الرئيسية مع بيانات يدوي
        await createAccountLogic(chatId, 1, 1, { email: emailToUse, password: passToUse });
        
        isProcessing = false;
        bot.sendMessage(chatId, "🏁 انتهت العملية اليدوية.");
    }
});


bot.onText(/\/setproxy (.+)/, (msg, match) => {
    let server = match[1].trim();
    if (!server.startsWith('http://') && !server.startsWith('https://')) server = 'http://' + server;
    activeProxy = { server };
    bot.sendMessage(msg.chat.id, `✅ تم تفعيل البروكسي: \`${server}\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/clearproxy/, (msg) => {
    activeProxy = null;
    bot.sendMessage(msg.chat.id, "🗑️ تم إيقاف البروكسي.");
});

// معالجة الأخطاء غير المتوقعة لمنع توقف البوت
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection at:', promise, 'reason:', reason); });

console.log("🤖 البوت يعمل الآن...");
