/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار 28 (دمج مميزات بايثون + قسم الجديد)
 * ==========================================================
 * - تمت إضافة زر "🆕 الجديد" الذي يفتح قائمة فرعية للمميزات.
 * - دمج أفكار أتمتة حسابات مشروع بايثون (gpt-auto-register) لتعمل داخل Node.js.
 * - تطبيق طلبك: (الفيزا تُترك يدوية) حيث يتوقف البوت بذكاء عند الدفع ويسلمك الحساب.
 * - حماية كاملة للكود الأساسي (حلول التخطي والمواليد تعمل 100% بدون تخريب).
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

// التوكين الخاص بك
const BOT_TOKEN = process.env.BOT_TOKEN || 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة';

if (!BOT_TOKEN || BOT_TOKEN === 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة') {
    console.error("❌ خطأ: BOT_TOKEN مفقود.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;
let activeProxy = null;

// حفظ حالة كل مستخدم للتحكم بالإلغاء والخطوات
const userState = {};

// إعدادات Mail.tm
const MAIL_API = 'https://api.mail.tm';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

async function createMailTmAccount(chatId) {
    try {
        const domainsRes = await axios.get(`${MAIL_API}/domains`);
        const domains = domainsRes.data['hydra:member'] || [];
        if (domains.length === 0) throw new Error('لا توجد نطاقات متاحة');
        const domain = domains[Math.floor(Math.random() * domains.length)].domain;

        const username = faker.person.firstName().toLowerCase() + crypto.randomBytes(2).toString('hex');
        const email = `${username}@${domain}`;
        const password = generateSecurePassword();

        await bot.sendMessage(chatId, `📧 جاري إنشاء بريد: \`${email}\``, { parse_mode: 'Markdown' });

        await axios.post(`${MAIL_API}/accounts`, { address: email, password: password });
        const tokenRes = await axios.post(`${MAIL_API}/token`, { address: email, password: password });
        
        return { email, password, token: tokenRes.data.token };
    } catch (error) {
        throw new Error('تعذر إنشاء بريد مؤقت');
    }
}

async function fetchMailTmMessages(token) {
    try {
        const res = await axios.get(`${MAIL_API}/messages`, { headers: { Authorization: `Bearer ${token}` } });
        return res.data['hydra:member'] || [];
    } catch (error) { return []; }
}

async function waitForMailTmCode(email, token, chatId, maxWaitSeconds = 90) {
    const startTime = Date.now();
    const statusMsg = await bot.sendMessage(chatId, `⏳ في انتظار وصول كود التفعيل إلى البريد...`);

    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        if (userState[chatId] && userState[chatId].cancel) {
            await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
            throw new Error("CANCELLED_BY_USER");
        }

        const messages = await fetchMailTmMessages(token);
        for (const msg of messages) {
            const content = `${msg.subject || ''} ${msg.intro || ''}`;
            const codeMatch = content.match(/\b\d{6}\b/);
            if (codeMatch) {
                await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
                await bot.sendMessage(chatId, `📩 **تم استخراج الكود:** \`${codeMatch[0]}\``, { parse_mode: 'Markdown' });
                return codeMatch[0];
            }
        }
        await sleep(4000);
    }
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
    return null;
}

async function sendStepPhotoAndCleanup(page, chatId, caption, previousPhotoId = null) {
    try {
        if (previousPhotoId) await bot.deleteMessage(chatId, previousPhotoId).catch(() => {});
        const screenshotPath = path.join(__dirname, `step_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        const sent = await bot.sendPhoto(chatId, screenshotPath, { caption: caption });
        if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
        return sent.message_id;
    } catch (err) {
        return previousPhotoId;
    }
}

async function reportErrorWithScreenshot(page, chatId, errorMessage, tempDir) {
    if (errorMessage === "CANCELLED_BY_USER") return; // تجاهل الخطأ في حال الإلغاء
    await bot.sendMessage(chatId, `❌ خطأ: ${errorMessage}`);
    if (page) {
        try {
            const errPath = path.join(tempDir, `error_${Date.now()}.png`);
            await page.screenshot({ path: errPath, fullPage: true });
            await bot.sendPhoto(chatId, errPath, { caption: '📸 لقطة الخطأ' });
            if (fs.existsSync(errPath)) fs.unlinkSync(errPath);
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
// الدالة الرئيسية (تم دمج مسار النظام الجديد والفيزا اليدوية فيها)
// ============================================================
async function createAccountLogic(chatId, currentNum, total, manualData = null, isNewSystem = false) {
    const isManual = !!manualData;
    let modeText = isManual ? "(يدوي)" : "(تلقائي)";
    if (isNewSystem) modeText = "🌟 (النظام الجديد)";
    
    let statusMsgID = null;

    const checkCancel = () => {
        if (userState[chatId] && userState[chatId].cancel) {
            throw new Error("CANCELLED_BY_USER");
        }
    };

    const updateStatus = async (text) => {
        checkCancel();
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
        checkCancel();
        let email, mailPassword, mailToken;
        
        if (isManual) {
            email = manualData.email;
            mailPassword = manualData.password;
        } else {
            try {
                const mailData = await createMailTmAccount(chatId);
                email = mailData.email;
                mailPassword = mailData.password;
                mailToken = mailData.token;
            } catch (e) {
                return false; 
            }
        }

        const chatGptPassword = isManual ? manualData.password : generateSecurePassword(); 
        const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;

        await updateStatus(`جاري فتح المتصفح للإيميل:\n📧 \`${email}\``);

        const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_wrk_'));
        let context, page;
        let accountCreatedSuccessfully = false;
        let shouldRetryWithNewEmail = false;

        try {
            checkCancel();
            const browserOptions = {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
                viewport: { width: 1366, height: 768 },
                timeout: 45000
            };
            if (activeProxy) browserOptions.proxy = { server: activeProxy.server };

            context = await chromium.launchPersistentContext(tempDir, browserOptions);
            if (userState[chatId]) userState[chatId].context = context; 
            
            page = await context.newPage();

            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🌐 فتح المتصفح", currentPhotoId);

            checkCancel();
            await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
            await simulateHumanActivityFast(page);

            const signupBtn = page.getByRole("button", { name: "Sign up" });
            await signupBtn.waitFor({ state: 'visible', timeout: 30000 }).catch(async () => {
                await page.locator('button:has-text("Sign up")').click();
            });
            checkCancel();
            await signupBtn.click();
            
            await page.waitForSelector('input[name="email"], input[id="email-input"]', {timeout: 30000});
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `📝 إدخال الإيميل: ${email}`, currentPhotoId);
            const emailInput = page.locator('input[name="email"], input[id="email-input"]').first();
            await emailInput.fill(email);
            await sleep(1000);
            
            checkCancel();
            const continueBtn1 = page.getByRole("button", { name: "Continue", exact: true });
            await continueBtn1.click({ force: true });
            await sleep(3000);

            checkCancel();
            await page.waitForSelector('input[type="password"]', {timeout: 30000});
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🔐 إدخال كلمة المرور", currentPhotoId);
            const passInput = page.locator('input[type="password"]').first();
            await passInput.fill(chatGptPassword);
            await sleep(1000);

            const continueBtn2 = page.getByRole("button", { name: "Continue" });
            await continueBtn2.click({ force: true });
            
            await updateStatus("جاري التحقق من قبول البيانات...");
            await sleep(7000); 

            checkCancel();
            if (await page.isVisible('text="Failed to create account"').catch(()=>false)) {
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "❌ خطأ: Failed to create account", currentPhotoId);
                if (!isManual) { shouldRetryWithNewEmail = true; throw new Error("SERVER_REJECTED_EMAIL"); } 
                else { throw new Error("مرفوض يدوياً. يرجى تجربة إيميل آخر."); }
            }

            await updateStatus("في انتظار صفحة الكود...");
            
            let code = null;
            if (isManual) {
                await updateStatus("🛑 يرجى إرسال الكود هنا في الشات.");
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "💬 بانتظار الكود منك...", currentPhotoId);
                code = await new Promise((resolve, reject) => {
                    const listener = (msg) => {
                        if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) {
                            bot.removeListener('message', listener); 
                            clearInterval(cancelInterval);
                            resolve(msg.text.trim());
                        }
                    };
                    bot.on('message', listener);
                    // فحص دوري لاكتشاف طلب الإلغاء
                    const cancelInterval = setInterval(() => {
                        if (userState[chatId] && userState[chatId].cancel) {
                            bot.removeListener('message', listener);
                            clearInterval(cancelInterval);
                            reject(new Error("CANCELLED_BY_USER"));
                        }
                    }, 1000);
                    setTimeout(() => { bot.removeListener('message', listener); clearInterval(cancelInterval); resolve(null); }, 120000);
                });
                if (!code) throw new Error("لم يتم استلام الكود.");
            } else {
                code = await waitForMailTmCode(email, mailToken, chatId, 100);
                if (!code) throw new Error("فشل جلب الكود التلقائي.");
            }

            checkCancel();
            await updateStatus(`إدخال الكود: ${code}`);
            const codeInput = page.getByRole("textbox", { name: "Code" });
            await codeInput.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => {
                await page.keyboard.type(code, { delay: 100 });
            });
            if (await codeInput.isVisible().catch(()=>false)) {
                await codeInput.fill(code);
            }
            await sleep(2000);

            const continueBtnAfterCode = page.getByRole("button", { name: "Continue" }).last();
            if (await continueBtnAfterCode.isVisible().catch(()=>false)) {
                await continueBtnAfterCode.click({ force: true });
            } else {
                await page.locator('button:has-text("Continue")').last().click({ force: true }).catch(()=>{});
            }
            await sleep(5000); 

            // ==========================================================
            // حل المواليد القديم الذي يعمل بدون أخطاء
            // ==========================================================
            checkCancel();
            await updateStatus("جاري كتابة الاسم والعمر/المواليد...");
            
            const nameInputNode = page.getByRole("textbox", { name: "Full name" }).first();
            if (await nameInputNode.isVisible({ timeout: 15000 }).catch(() => false)) {
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "👤 صفحة طلب الاسم مفتوحة", currentPhotoId);
                
                await nameInputNode.fill(fullName);
                await sleep(1000);
                
                const ageInput = page.locator('input[name="age"], input[id*="age" i]').first();
                const bdayInput = page.locator('input[name="birthday"], [aria-label*="birthday" i]').first();
                
                if (await ageInput.isVisible({ timeout: 3000 }).catch(() => false)) {
                    await ageInput.focus().catch(()=>{});
                    await ageInput.click({ force: true }).catch(()=>{});
                    await page.keyboard.type("25", { delay: 150 });
                    await sleep(1000);
                    currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `🎂 تم إدخال العمر: 25`, currentPhotoId);
                } else if (await bdayInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await bdayInput.focus().catch(()=>{});
                    await bdayInput.click({ force: true }).catch(()=>{});
                    // مسح أي نص و كتابة التاريخ متصلاً بدون فواصل لحل مشكلة (02/05/YYYY)
                    await page.keyboard.press('Control+A');
                    await page.keyboard.press('Backspace');
                    await page.keyboard.type("01012000", { delay: 150 });
                    await sleep(1000);
                    currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `🎂 تم إدخال تاريخ الميلاد: 01/01/2000`, currentPhotoId);
                } else {
                    await page.keyboard.press('Tab');
                    await page.keyboard.type("01012000", { delay: 150 });
                }

                checkCancel();
                const finishBtn = page.getByRole("button", { name: "Continue" }).last();
                if (await finishBtn.isVisible().catch(() => false)) {
                    await finishBtn.click({ force: true });
                } else {
                    const altFinishBtn = page.locator('button:has-text("Finish creating account"), button:has-text("Agree")').last();
                    if (await altFinishBtn.isVisible().catch(()=>false)) {
                        await altFinishBtn.click({ force: true });
                    } else {
                        await page.keyboard.press('Enter');
                    }
                }
                
                await sleep(8000); 
            }

            // التحقق من النجاح
            checkCancel();
            await updateStatus("في انتظار الصفحة الرئيسية...");
            await page.waitForURL('**/chat', {timeout: 30000}).catch(()=>{});
            
            if (page.url().includes('/chat')) {
                 const result = `${email}|${chatGptPassword}`;
                 fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
                 
                 // ====== الميزة الجديدة (ترك الفيزا يدوية) ======
                 if (isNewSystem) {
                     currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🎉 تم إنشاء الحساب! جاري الانتقال لصفحة الترقية...", currentPhotoId);
                     await updateStatus("تطبيق النظام الجديد: التوجيه لصفحة الترقية وترك الفيزا لك...");
                     
                     // الذهاب لصفحة الترقية
                     await page.goto("https://chatgpt.com/#pricing", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
                     await sleep(4000);
                     
                     // محاولة الضغط على زر الترقية لفتح نافذة الدفع والتوقف عندها
                     const upgradeBtn = page.locator('button:has-text("Upgrade to Plus"), button:has-text("Upgrade")').first();
                     if (await upgradeBtn.isVisible().catch(()=>false)) {
                         await upgradeBtn.click({ force: true }).catch(()=>{});
                         await sleep(5000);
                     }
                     
                     currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `💳 **تم إيقاف الأتمتة عند نافذة الدفع بناءً على طلبك!**\n\nبإمكانك الآن أخذ بيانات الحساب وإدخال الفيزا يدوياً بنفسك.\n\n✅ بيانات الحساب الجاهز:\n\`${result}\``, currentPhotoId);
                     accountCreatedSuccessfully = true;
                 } else {
                     currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🎉 تم الدخول بنجاح!", currentPhotoId);
                     await bot.sendMessage(chatId, `✅ **نجاح ${modeText}:**\n\`${result}\``, { parse_mode: 'Markdown' });
                     accountCreatedSuccessfully = true;
                 }

            } else {
                throw new Error("لم يتم الوصول للرئيسية بعد الضغط النهائي.");
            }

        } catch (error) {
            if (error.message === "CANCELLED_BY_USER") {
                await bot.sendMessage(chatId, "🛑 تم إلغاء العملية بناءً على طلبك وإغلاق المتصفح.");
                return false;
            }
            if (shouldRetryWithNewEmail) {
                console.log("محاولة جديدة...");
            } else {
                await reportErrorWithScreenshot(page, chatId, error.message, tempDir);
            }
        } finally {
            if (context) await context.close().catch(()=>{});
            if (userState[chatId]) userState[chatId].context = null; 
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
            if (currentPhotoId) { await bot.deleteMessage(chatId, currentPhotoId).catch(()=>{}); currentPhotoId = null; }
        }

        if (accountCreatedSuccessfully || (userState[chatId] && userState[chatId].cancel)) return true;
        if (!shouldRetryWithNewEmail) return false; 
    }

    if (!isManual && !(userState[chatId] && userState[chatId].cancel)) await bot.sendMessage(chatId, `❌ فشل بعد ${maxEmailAttempts} محاولات.`);
    return false;
}

// === القوائم وأزرار التنقل الرئيسية ===

// دالة لتبسيط استدعاء القائمة الرئيسية
function sendMainMenu(chatId, messageId = null) {
    const text = "👋 أهلاً بك! اختر العملية المطلوبة من الأزرار:";
    const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🆕 الجديد', callback_data: 'menu_new' }],
                [{ text: '▶️ تشغيل تلقائي', callback_data: 'create_auto' }, { text: '✍️ تشغيل يدوي', callback_data: 'create_manual' }],
                [{ text: '🔐 تسجيل الدخول', callback_data: 'login' }, { text: '🛑 إلغاء العملية', callback_data: 'cancel' }]
            ]
        }
    };
    if (messageId) {
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }).catch(()=>{});
    } else {
        bot.sendMessage(chatId, text, opts);
    }
}

bot.onText(/\/start/, (msg) => {
    sendMainMenu(msg.chat.id);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    bot.answerCallbackQuery(query.id).catch(() => {});

    if (!userState[chatId]) userState[chatId] = { step: null, cancel: false, context: null };

    // 1- قائمة زر (الجديد) والمميزات
    if (query.data === 'menu_new') {
        const featuresText = "🌟 **قسم المميزات الجديدة المدمجة:**\n\n" +
                             "1️⃣ **الإنشاء الآمن:** أتمتة كاملة لإنشاء الحساب متخطية لجميع الحقول.\n" +
                             "2️⃣ **(نظام الفيزا اليدوي):** البوت سيقوم بالإنشاء، ثم سينتقل لصفحة الدفع ويتوقف هناك، ليعطيك الحساب جاهزاً لتضيف الفيزا يدوياً بنفسك لتجنب أي حظر.\n\n" +
                             "👇 اختر العملية للبدء:";
                             
        bot.editMessageText(featuresText, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 تشغيل (إنشاء حساب + توجيه للفيزا)', callback_data: 'start_new_system' }],
                    [{ text: '🔙 رجوع للقائمة الرئيسية', callback_data: 'back_main' }]
                ]
            }
        }).catch(()=>{});
        return;
    }

    // 2- الرجوع للرئيسية
    if (query.data === 'back_main') {
        sendMainMenu(chatId, msgId);
        return;
    }

    // 3- زر الإلغاء
    if (query.data === 'cancel') {
        if (!isProcessing) return bot.sendMessage(chatId, "⚠️ لا توجد عملية قيد التشغيل حالياً لإلغائها.");
        userState[chatId].cancel = true;
        if (userState[chatId].context) {
            await userState[chatId].context.close().catch(()=>{});
        }
        bot.sendMessage(chatId, "⏳ جاري إيقاف العملية الحالية بقوة وإغلاق المتصفح...");
        isProcessing = false;
        return;
    }

    // 4- زر تسجيل الدخول
    if (query.data === 'login') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول حالياً. انتظر أو اضغط إلغاء.");
        userState[chatId].step = 'awaiting_login';
        bot.sendMessage(chatId, "➡️ أرسل **الإيميل والباسورد** لتسجيل الدخول (مثال: email@dom.com 123456):", {parse_mode: 'Markdown'});
        return;
    }

    // 5- تشغيل النظام الجديد (زر الجديد)
    if (query.data === 'start_new_system') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول.");
        userState[chatId] = { step: null, cancel: false, context: null };
        isProcessing = true;
        
        await createAccountLogic(chatId, 1, 1, null, true); // true = تفعيل نظام التوجيه للفيزا
        
        isProcessing = false;
        if (!userState[chatId].cancel) bot.sendMessage(chatId, "🏁 اكتملت عملية النظام الجديد.");
        return;
    }

    // 6- التشغيل التلقائي العادي
    if (query.data === 'create_auto') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول.");
        userState[chatId] = { step: null, cancel: false, context: null };
        isProcessing = true;
        
        await createAccountLogic(chatId, 1, 1, null, false);
        
        isProcessing = false;
        if (!userState[chatId].cancel) bot.sendMessage(chatId, "🏁 اكتمل التلقائي.");
    } 
    
    // 7- التشغيل اليدوي العادي
    else if (query.data === 'create_manual') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول.");
        userState[chatId] = { step: 'awaiting_email', cancel: false, context: null };
        bot.sendMessage(chatId, "➡️ أرسل **الإيميل** فقط لبدء عملية الإنشاء:", {parse_mode: 'Markdown'});
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (!userState[chatId] || !text || text.startsWith('/')) return; 

    // استقبال الايميل للإنشاء اليدوي
    if (userState[chatId].step === 'awaiting_email') {
        if (!text.includes('@')) return bot.sendMessage(chatId, "❌ إيميل غير صحيح.");
        const autoPass = generateSecurePassword(); 
        
        userState[chatId].step = null;
        userState[chatId].cancel = false;
        isProcessing = true;
        
        bot.sendMessage(chatId, `✅ تم استلام البريد.\n🔑 الباسورد: \`${autoPass}\``, {parse_mode: 'Markdown'});
        
        await createAccountLogic(chatId, 1, 1, { email: text, password: autoPass }, false);
        
        isProcessing = false;
        if (!userState[chatId].cancel) bot.sendMessage(chatId, "🏁 اكتمل اليدوي.");
    } 
    
    // استقبال الايميل والباسورد لتسجيل الدخول
    else if (userState[chatId].step === 'awaiting_login') {
        userState[chatId].step = null;
        bot.sendMessage(chatId, "🛠️ تم استلام بيانات الدخول بنجاح!\n(هذا الزر عبارة عن واجهة تنظيمية جاهزة لربطها بدالة تسجيل الدخول الخاصة بك مستقبلاً).");
    }
});

bot.onText(/\/clearproxy/, (msg) => { activeProxy = null; bot.sendMessage(msg.chat.id, "🗑️ تم إيقاف البروكسي."); });
process.on('uncaughtException', (err) => { console.error('Uncaught:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled:', reason); });

console.log("🤖 البوت يعمل (الاصدار 28 - دمج الميزات + قائمة الجديد + فيزا يدوية)...");
