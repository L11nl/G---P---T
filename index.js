/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار 24 (مستوحى من كود Python الناجح)
 * ==========================================================
 * - تم تحويل استراتيجية المواليد من كود Python الأصلي إلى JS.
 * - البوت يبحث عن حقل (spinbutton) الخاص بالشهر ويضغط عليه.
 * - يكتب الأرقام متصلة (04242000) لتعني 2000/4/24 ليوزعها الموقع تلقائياً.
 * - تم دمج Mail.tm والأزرار اليدوية/التلقائية بنجاح.
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
// الدالة الرئيسية (مع دمج منطق الـ Python)
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
            const browserOptions = {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
                viewport: { width: 1366, height: 768 },
                timeout: 45000
            };
            if (activeProxy) browserOptions.proxy = { server: activeProxy.server };

            context = await chromium.launchPersistentContext(tempDir, browserOptions);
            page = await context.newPage();

            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🌐 فتح المتصفح", currentPhotoId);

            // الذهاب لموقع ChatGPT
            await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
            await simulateHumanActivityFast(page);

            // الضغط على زر Sign up (بمحاكاة كود البايثون)
            const signupBtn = page.getByRole("button", { name: "Sign up" });
            await signupBtn.waitFor({ state: 'visible', timeout: 30000 }).catch(async () => {
                await page.locator('button:has-text("Sign up")').click();
            });
            await signupBtn.click();
            
            // إدخال الإيميل
            await page.waitForSelector('input[name="email"], input[id="email-input"]', {timeout: 30000});
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `📝 إدخال الإيميل: ${email}`, currentPhotoId);
            const emailInput = page.locator('input[name="email"], input[id="email-input"]').first();
            await emailInput.fill(email);
            await sleep(1000);
            
            // زر Continue بعد الإيميل
            const continueBtn1 = page.getByRole("button", { name: "Continue", exact: true });
            await continueBtn1.click({ force: true });
            await sleep(3000);

            // إدخال الباسورد
            await page.waitForSelector('input[type="password"]', {timeout: 30000});
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🔐 إدخال كلمة المرور", currentPhotoId);
            const passInput = page.locator('input[type="password"]').first();
            await passInput.fill(chatGptPassword);
            await sleep(1000);

            // زر Continue بعد الباسورد
            const continueBtn2 = page.getByRole("button", { name: "Continue" });
            await continueBtn2.click({ force: true });
            
            await updateStatus("جاري التحقق من قبول البيانات...");
            await sleep(7000); 

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
                code = await new Promise((resolve) => {
                    const listener = (msg) => {
                        if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) {
                            bot.removeListener('message', listener); 
                            resolve(msg.text.trim());
                        }
                    };
                    bot.on('message', listener);
                    setTimeout(() => { bot.removeListener('message', listener); resolve(null); }, 120000);
                });
                if (!code) throw new Error("لم يتم استلام الكود.");
            } else {
                code = await waitForMailTmCode(email, mailToken, chatId, 100);
                if (!code) throw new Error("فشل جلب الكود التلقائي.");
            }

            // إدخال الكود
            await updateStatus(`إدخال الكود: ${code}`);
            const codeInput = page.getByRole("textbox", { name: "Code" });
            await codeInput.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => {
                await page.keyboard.type(code, { delay: 100 });
            });
            if (await codeInput.isVisible().catch(()=>false)) {
                await codeInput.fill(code);
            }
            await sleep(2000);

            // زر Continue بعد الكود (مهم جداً)
            const continueBtnAfterCode = page.getByRole("button", { name: "Continue" }).last();
            if (await continueBtnAfterCode.isVisible().catch(()=>false)) {
                await continueBtnAfterCode.click({ force: true });
            } else {
                await page.locator('button:has-text("Continue")').last().click({ force: true }).catch(()=>{});
            }
            await sleep(5000); 

            // ==========================================================
            // 📸 منطق البايثون للاسم والمواليد (تم التعديل للصيغة المطلوبة)
            // ==========================================================
            await updateStatus("جاري كتابة الاسم والمواليد...");
            
            // 1. الاسم
            const nameInputNode = page.getByRole("textbox", { name: "Full name" }).first();
            if (await nameInputNode.isVisible({ timeout: 15000 }).catch(() => false)) {
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "👤 صفحة طلب الاسم مفتوحة", currentPhotoId);
                
                await nameInputNode.fill(fullName);
                await sleep(1000);
                
                // 2. المواليد (تم التعديل لإضافة الشرطات المائلة /)
                const birthdayString = "01/01/2000"; 
                
                // البحث عن حقل المواليد
                const monthSpin = page.locator('[role="spinbutton"][aria-label*="month" i], input[aria-label*="birthday" i], input[name="birthday"]').first();
                
                if (await monthSpin.isVisible({ timeout: 5000 }).catch(() => false)) {
                    await monthSpin.click();
                    await sleep(500);
                    
                    // كتابة التاريخ بالصيغة المطلوبة
                    await page.keyboard.type(birthdayString, { delay: 150 });
                    await sleep(1500);
                    
                    currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `🎂 تم إدخال المواليد بالصيغة الجديدة: ${birthdayString}`, currentPhotoId);
                } else {
                    // محاولة أخيرة في حال اختلف شكل الحقل
                    await page.keyboard.press('Tab');
                    await page.keyboard.type(birthdayString, { delay: 100 });
                }

                // 3. الضغط على زر الإنهاء
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
            await updateStatus("في انتظار الصفحة الرئيسية...");
            await page.waitForURL('**/chat', {timeout: 30000}).catch(()=>{});
            
            if (page.url().includes('/chat')) {
                 const result = `${email}|${chatGptPassword}`;
                 fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
                 currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🎉 تم الدخول بنجاح!", currentPhotoId);
                 await bot.sendMessage(chatId, `✅ **نجاح ${modeText}:**\n\`${result}\``, { parse_mode: 'Markdown' });
                 accountCreatedSuccessfully = true;
            } else {
                throw new Error("لم يتم الوصول للرئيسية بعد الضغط النهائي.");
            }

        } catch (error) {
            if (shouldRetryWithNewEmail) {
                console.log("محاولة جديدة...");
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

    if (!isManual) await bot.sendMessage(chatId, `❌ فشل بعد ${maxEmailAttempts} محاولات.`);
    return false;
}

// === أوامر البوت ===

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 أهلاً بك! اختر طريقة الإنشاء:", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🤖 تلقائي (حساب 1)', callback_data: 'create_auto' }],
                [{ text: '✍️ يدوي', callback_data: 'create_manual' }]
            ]
        }
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    bot.answerCallbackQuery(query.id).catch(() => {});

    if (query.data === 'create_auto') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ مشغول.");
        delete userState[chatId];
        isProcessing = true;
        await createAccountLogic(chatId, 1, 1, null);
        isProcessing = false;
        bot.sendMessage(chatId, "🏁 اكتمل التلقائي.");
    } 
    else if (query.data === 'create_manual') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ مشغول.");
        userState[chatId] = { step: 'awaiting_email' };
        bot.sendMessage(chatId, "➡️ أرسل **الإيميل** فقط:", {parse_mode: 'Markdown'});
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (!userState[chatId] || !text || text.startsWith('/')) return; 

    if (userState[chatId].step === 'awaiting_email') {
        if (!text.includes('@')) return bot.sendMessage(chatId, "❌ إيميل غير صحيح.");
        const autoPass = generateSecurePassword(); 
        delete userState[chatId];
        isProcessing = true;
        bot.sendMessage(chatId, `✅ تم.\n🔑 الباسورد: \`${autoPass}\``, {parse_mode: 'Markdown'});
        await createAccountLogic(chatId, 1, 1, { email: text, password: autoPass });
        isProcessing = false;
        bot.sendMessage(chatId, "🏁 اكتمل اليدوي.");
    }
});

bot.onText(/\/clearproxy/, (msg) => { activeProxy = null; bot.sendMessage(msg.chat.id, "🗑️ تم إيقاف البروكسي."); });
process.on('uncaughtException', (err) => { console.error('Uncaught:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled:', reason); });

console.log("🤖 البوت يعمل (الاصدار 24 - كود البايثون المدمج)...");
