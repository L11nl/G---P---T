/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار 21
 * ==========================================================
 * - إجبار الترتيب: ملء الاسم -> الانتظار -> مسح وتعبئة المواليد -> الانتظار -> الضغط على Finish.
 * - استخدام طريقة المسح التكراري (Backspace/Delete) لضمان إفراغ حقل المواليد.
 * - تحديد المواليد كـ 04/24/2000.
 * ==========================================================
 */

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

// ✅ وظيفة لإرسال وحذف الصور بالتتابع
async function sendStepPhotoAndCleanup(page, chatId, caption, previousPhotoId = null) {
    try {
        if (previousPhotoId) {
            await bot.deleteMessage(chatId, previousPhotoId).catch(() => {});
        }
        const screenshotPath = path.join(__dirname, `step_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        const sent = await bot.sendPhoto(chatId, screenshotPath, { caption: caption });
        if (fs.existsSync(screenshotPath)) { fs.unlinkSync(screenshotPath); }
        return sent.message_id;
    } catch (err) {
        console.error("خطأ في إرسال الصورة:", err.message);
        return previousPhotoId;
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
// الدالة الرئيسية لإنشاء الحساب
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

    const maxEmailAttempts = isManual ? 1 : 4; 
    let currentPhotoId = null; 

    for (let emailAttempt = 1; emailAttempt <= maxEmailAttempts; emailAttempt++) {
        
        if (!isManual && emailAttempt > 1) {
            await bot.sendMessage(chatId, `🔄 محاولة تغيير الإيميل رقم [${emailAttempt}/${maxEmailAttempts}]...`);
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
                return false; 
            }
        }

        const chatGptPassword = isManual ? manualData.password : generateSecurePassword(); 
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
                timeout: 45000
            };
            if (activeProxy) browserOptions.proxy = { server: activeProxy.server };

            context = await chromium.launchPersistentContext(tempDir, browserOptions);
            page = await context.newPage();

            await updateStatus("جاري تحميل صفحة ChatGPT...");
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🌐 فتح المتصفح", currentPhotoId);

            await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 70000 });
            await simulateHumanActivityFast(page);

            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🖱️ الضغط على Sign up", currentPhotoId);
            const signupBtn = page.locator('button:has-text("Sign up")');
            await signupBtn.waitFor({ state: 'visible', timeout: 30000 });
            await signupBtn.click();

            await page.waitForSelector('input[id="email-input"], input[name="email"]', {timeout: 30000});
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `📝 إدخال الإيميل: ${email}`, currentPhotoId);
            const emailInput = page.locator('input[id="email-input"], input[name="email"]');
            await emailInput.fill(email);
            await sleep(1000);
            await page.keyboard.press('Enter');

            await page.waitForSelector('input[type="password"]', {timeout: 30000});
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🔐 إدخال كلمة المرور", currentPhotoId);
            const passInput = page.locator('input[type="password"]');
            await passInput.fill(chatGptPassword);
            await sleep(1000);
            await page.keyboard.press('Enter');

            await updateStatus("جاري التحقق من قبول البيانات...");
            await sleep(7000); 

            const failedErrorSelector = 'text="Failed to create account"';
            if (await page.isVisible(failedErrorSelector).catch(()=>false)) {
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "❌ ظهر خطأ: Failed to create account", currentPhotoId);
                if (!isManual) {
                    shouldRetryWithNewEmail = true;
                    throw new Error("SERVER_REJECTED_EMAIL"); 
                } else {
                    throw new Error("السيرفر رفض هذا الإيميل اليدوي. يرجى محاولة إيميل آخر لاحقاً.");
                }
            }

            await updateStatus("في انتظار صفحة كود التحقق...");
            await page.waitForSelector('input[aria-label="Verification code"], input[inputmode="numeric"]', {timeout: 45000})
                .catch(()=>{ throw new Error("لم تظهر صفحة إدخال الكود."); });

            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🧩 صفحة الكود مفتوحة", currentPhotoId);

            let code = null;

            if (isManual) {
                await updateStatus("🛑 توقف المتصفح. يرجى إرسال كود التحقق الآن هنا في الشات.");
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "💬 بانتظار الكود منك...", currentPhotoId);
                
                code = await new Promise((resolve) => {
                    const listener = (msg) => {
                        if (msg.chat.id === chatId && msg.text && /^\d{6}$/.test(msg.text.trim())) {
                            bot.removeListener('message', listener); 
                            bot.sendMessage(chatId, "✅ تم استلام الكود، جاري إكماله...");
                            resolve(msg.text.trim());
                        } else if (msg.chat.id === chatId && msg.text && msg.text.startsWith('/')) {
                            bot.removeListener('message', listener);
                            resolve(null);
                        }
                    };
                    bot.on('message', listener);
                    setTimeout(() => { 
                        bot.removeListener('message', listener); 
                        resolve(null); 
                    }, 120000);
                });

                if (!code) throw new Error("تم إلغاء العملية أو انتهى وقت انتظار الكود.");

            } else {
                code = await waitForMailTmCode(email, mailToken, chatId, 100);
                
                if (!code) {
                    const resendBtn = page.locator('button:has-text("Resend email")');
                    if (await resendBtn.isVisible().catch(() => false)) {
                        await resendBtn.click();
                        await bot.sendMessage(chatId, "🔄 تم ضغط إعادة إرسال الكود في المتصفح...");
                        code = await waitForMailTmCode(email, mailToken, chatId, 70);
                    }
                }
                if (!code) throw new Error("لم يتم استلام الكود تلقائياً بعد المحاولات.");
            }

            await updateStatus(`جاري إدخال الكود: \`${code}\`...`);
            
            const codeInput = await page.$('input[aria-label="Verification code"], input[inputmode="numeric"]');
            if (codeInput) {
                await codeInput.click();
                await page.keyboard.type(code, { delay: 100 });
            } else {
                await page.keyboard.press('Tab');
                await page.keyboard.type(code, { delay: 100 });
            }

            await sleep(3000);
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "⏳ تم ملء الكود وجاري الانتقال لزر التقديم", currentPhotoId);

            await updateStatus("جاري البحث عن زر Continue للضغط عليه...");
            const continueCodeBtn = page.locator('button:has-text("Continue")');
            await continueCodeBtn.waitFor({ state: 'visible', timeout: 20000 })
                .catch(()=>{ throw new Error("لم يظهر زر Continue بعد ملء الكود."); });

            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🖱️ جاري الضغط صراحة على زر Continue", currentPhotoId);
            await continueCodeBtn.click();
            await sleep(8000); 

            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "⏳ جاري الانتظار بعد الضغط على Continue", currentPhotoId);

            // ==========================================================
            // 📸 التحديث الأهم (الاصدار 21): إجبار التسلسل الصارم (الاسم -> المواليد -> الزر)
            // ==========================================================
            await updateStatus("جاري التحقق من طلب الاسم والمواليد...");
            
            // ننتظر ظهور حقل الاسم أولاً للتأكد من تحميل الصفحة
            const nameInput = page.locator('input[name="name"]').first();
            await nameInput.waitFor({ state: 'visible', timeout: 25000 }).catch(() => null);
            
            if (await nameInput.isVisible()) {
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "👤 صفحة طلب الاسم مفتوحة", currentPhotoId);
                
                // 1. تعبئة الاسم 
                await nameInput.click({ clickCount: 3 });
                await page.keyboard.press('Backspace');
                await nameInput.type(fullName, { delay: 50 });
                await sleep(1500); // استراحة
                
                // 2. تعبئة المواليد
                const bdayStr = '04/24/2000'; // تاريخ 2000/4/24 بصيغة الموقع
                const bdayInput = page.locator('input[name="birthday"], input[id*="birth" i], input[placeholder*="birth" i]').first();
                
                // انتظار الحقل حتى يصبح مرئياً
                await bdayInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
                
                if (await bdayInput.isVisible()) {
                    await bdayInput.click();
                    await sleep(500);
                    
                    // مسح متكرر لحقل المواليد (طريقة فعالة جداً لتفريغ الـ React Masks)
                    for (let i = 0; i < 15; i++) {
                        await page.keyboard.press('Backspace');
                        await page.keyboard.press('Delete');
                    }
                    await sleep(500);
                    
                    // الكتابة التدريجية للمواليد
                    await page.keyboard.type(bdayStr, { delay: 150 });
                    await sleep(2000); // إعطاء الموقع وقتاً إضافياً لاستيعاب التاريخ
                    currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `🎂 تم إدخال المواليد بنجاح: ${bdayStr}`, currentPhotoId);
                } else {
                    console.log("حقل المواليد غير موجود، سنكمل...");
                }

                // 3. الضغط على زر Finish creating account 
                // نضمن أننا لن نضغط على الزر إلا بعد الانتهاء من المواليد
                const finishBtn = page.locator('button:has-text("Finish creating account")').first();
                await finishBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
                
                if (await finishBtn.isVisible()) {
                    currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🖱️ جاري الضغط على Finish creating account", currentPhotoId);
                    await finishBtn.click({ force: true });
                } else {
                    await page.keyboard.press('Enter');
                }

                await sleep(8000); 
            }

            await updateStatus("في انتظار الوصول للصفحة الرئيسية...");
            await page.waitForURL('**/chat', {timeout: 30000}).catch(()=>{});
            
            if (page.url().includes('/chat')) {
                 const result = `${email}|${chatGptPassword}`;
                 fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
                 currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🎉 تم الدخول للصفحة الرئيسية بنجاح!", currentPhotoId);
                 await bot.sendMessage(chatId, `✅ **تم إنشاء الحساب بنجاح ${modeText}:**\n\`${result}\``, { parse_mode: 'Markdown' });
                 accountCreatedSuccessfully = true;
            } else {
                throw new Error("تم إدخال البيانات ولكن لم يتم تحويلنا للصفحة الرئيسية (قد يكون الحساب حُظر).");
            }

        } catch (error) {
            if (shouldRetryWithNewEmail) {
                console.log("إعادة المحاولة بإيميل جديد...");
            } else {
                await reportErrorWithScreenshot(page, chatId, error.message, tempDir);
            }
        } finally {
            if (context) await context.close().catch(()=>{});
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
            if (currentPhotoId) { await bot.deleteMessage(chatId, currentPhotoId).catch(()=>{}); currentPhotoId = null; }
        }

        if (accountCreatedSuccessfully) return true;
        if (!shouldRetryWithNewEmail) return false; 
    }

    if (!isManual) {
        await bot.sendMessage(chatId, `❌ فشل إنشاء الحساب بعد ${maxEmailAttempts} محاولات لتغيير الإيميل.`);
    }
    return false;
}

// === أوامر البوت ===

bot.onText(/\/start/, (msg) => {
    const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🤖 إنشاء تلقائي (حساب 1)', callback_data: 'create_auto' }],
                [{ text: '✍️ إنشاء يدوي', callback_data: 'create_manual' }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, "👋 أهلاً بك! اختر طريقة إنشاء الحساب:", opts);
});

// معالجة ضغطات الأزرار
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    bot.answerCallbackQuery(query.id).catch(() => {});

    if (data === 'create_auto') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول حالياً بعملية أخرى.");
        delete userState[chatId];
        isProcessing = true;
        
        bot.sendMessage(chatId, "🚀 بدء الإنشاء التلقائي...");
        await createAccountLogic(chatId, 1, 1, null);
        
        isProcessing = false;
        bot.sendMessage(chatId, "🏁 اكتملت العملية التلقائية.");
    } 
    else if (data === 'create_manual') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول حالياً بعملية أخرى.");
        userState[chatId] = { step: 'awaiting_email' };
        bot.sendMessage(chatId, "➡️ [إنشاء يدوي] يرجى إرسال **الإيميل** الذي تريد استخدامه فقط (وسأقوم بتوليد الباسورد لك):", {parse_mode: 'Markdown'});
    }
});

// ملقف الرسائل للخطوات اليدوية (إيميل فقط)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : null;

    if (!userState[chatId] || !text || text.startsWith('/')) return; 

    const state = userState[chatId];

    if (state.step === 'awaiting_email') {
        if (!text.includes('@') || !text.includes('.')) {
            return bot.sendMessage(chatId, "❌ يرجى إرسال إيميل صحيح.");
        }
        
        const emailToUse = text;
        const autoGeneratedPassword = generateSecurePassword(); 
        
        delete userState[chatId];
        
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت انشغل بعملية أخرى للتو، ألغيت العملية اليدوية.");
        
        isProcessing = true;
        bot.sendMessage(chatId, `✅ تم تسجيل الإيميل.\n🔑 تم توليد كلمة مرور تلقائية: \`${autoGeneratedPassword}\`\n🚀 جاري بدء الإنشاء اليدوي...`, {parse_mode: 'Markdown'});
        
        await createAccountLogic(chatId, 1, 1, { email: emailToUse, password: autoGeneratedPassword });
        
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

process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection at:', promise, 'reason:', reason); });

console.log("🤖 البوت يعمل الآن (الاصدار 21)...");
