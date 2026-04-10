/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار 28 (المعدل)
 * ==========================================================
 * - إضافة زر: إنشاء حساب يدوي + توجيه للفيزا.
 * - دعم التوقف عند صفحة الدفع في المسار اليدوي والتلقائي.
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
const BOT_TOKEN = process.env.BOT_TOKEN || 'ضع_توكن_البوت_هنا';

if (!BOT_TOKEN || BOT_TOKEN === 'ضع_توكن_البوت_هنا') {
    console.error("❌ خطأ: BOT_TOKEN مفقود.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;
let activeProxy = null;

const userState = {};
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
        await page.screenshot({ path: screenshotPath });
        const sent = await bot.sendPhoto(chatId, screenshotPath, { caption: caption });
        if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
        return sent.message_id;
    } catch (err) { return previousPhotoId; }
}

async function reportErrorWithScreenshot(page, chatId, errorMessage, tempDir) {
    if (errorMessage === "CANCELLED_BY_USER") return;
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

async function createAccountLogic(chatId, currentNum, total, manualData = null, isNewSystem = false) {
    const isManual = !!manualData;
    let modeText = isManual ? "(يدوي)" : "(تلقائي)";
    if (isNewSystem) modeText = "🌟 (النظام الجديد)";
    
    let statusMsgID = null;
    const checkCancel = () => { if (userState[chatId] && userState[chatId].cancel) throw new Error("CANCELLED_BY_USER"); };

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
            } catch (e) { return false; }
        }

        const chatGptPassword = isManual ? manualData.password : generateSecurePassword(); 
        const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;
        const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_wrk_'));
        let context, page, accountCreatedSuccessfully = false, shouldRetryWithNewEmail = false;

        try {
            checkCancel();
            const browserOptions = {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
                viewport: { width: 1366, height: 768 }
            };
            if (activeProxy) browserOptions.proxy = { server: activeProxy.server };

            context = await chromium.launchPersistentContext(tempDir, browserOptions);
            if (userState[chatId]) userState[chatId].context = context; 
            page = await context.newPage();

            await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
            await simulateHumanActivityFast(page);

            const signupBtn = page.getByRole("button", { name: "Sign up" });
            await signupBtn.waitFor({ state: 'visible', timeout: 30000 }).catch(async () => {
                await page.locator('button:has-text("Sign up")').click();
            });
            
            await page.waitForSelector('input[name="email"], input[id="email-input"]', {timeout: 30000});
            await page.locator('input[name="email"], input[id="email-input"]').first().fill(email);
            await page.getByRole("button", { name: "Continue", exact: true }).click({ force: true });
            
            await page.waitForSelector('input[type="password"]', {timeout: 30000});
            await page.locator('input[type="password"]').first().fill(chatGptPassword);
            await page.getByRole("button", { name: "Continue" }).click({ force: true });
            
            await updateStatus("جاري التحقق وانتظار الكود...");
            
            let code = null;
            if (isManual) {
                await updateStatus("🛑 أرسل الكود (6 أرقام) هنا الآن:");
                code = await new Promise((resolve, reject) => {
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
            }

            if (!code) throw new Error("فشل الحصول على الكود.");
            await page.getByRole("textbox", { name: "Code" }).fill(code);
            await sleep(5000);

            // إدخال المواليد
            const nameInput = page.getByRole("textbox", { name: "Full name" }).first();
            if (await nameInput.isVisible({ timeout: 15000 }).catch(() => false)) {
                await nameInput.fill(fullName);
                await page.keyboard.press('Tab');
                await page.keyboard.type("01012000", { delay: 100 });
                await page.keyboard.press('Enter');
                await sleep(8000);
            }

            await page.waitForURL('**/chat', {timeout: 30000}).catch(()=>{});
            
            if (page.url().includes('/chat')) {
                 const result = `${email}|${chatGptPassword}`;
                 fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
                 
                 if (isNewSystem) {
                     await updateStatus("جاري التوجه لصفحة الترقية...");
                     await page.goto("https://chatgpt.com/#pricing", { waitUntil: "domcontentloaded" }).catch(()=>{});
                     await sleep(3000);
                     const upgradeBtn = page.locator('button:has-text("Upgrade to Plus"), button:has-text("Upgrade")').first();
                     if (await upgradeBtn.isVisible()) await upgradeBtn.click({ force: true });
                     await sleep(5000);
                     
                     currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `💳 **توقفت الأتمتة عند الدفع!**\n\n✅ الحساب:\n\`${result}\``, currentPhotoId);
                     accountCreatedSuccessfully = true;
                 } else {
                     await bot.sendMessage(chatId, `✅ **نجاح:**\n\`${result}\``, { parse_mode: 'Markdown' });
                     accountCreatedSuccessfully = true;
                 }
            } else { throw new Error("فشل الوصول للرئيسية."); }

        } catch (error) {
            if (error.message === "CANCELLED_BY_USER") return false;
            await reportErrorWithScreenshot(page, chatId, error.message, tempDir);
        } finally {
            if (context) await context.close().catch(()=>{});
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
        }
        if (accountCreatedSuccessfully) return true;
    }
    return false;
}

function sendMainMenu(chatId, messageId = null) {
    const text = "👋 أهلاً بك! اختر العملية المطلوبة:";
    const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🆕 الجديد', callback_data: 'menu_new' }],
                [{ text: '▶️ تشغيل تلقائي', callback_data: 'create_auto' }, { text: '✍️ تشغيل يدوي', callback_data: 'create_manual' }],
                [{ text: '🛑 إلغاء العملية', callback_data: 'cancel' }]
            ]
        }
    };
    if (messageId) bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }).catch(()=>{});
    else bot.sendMessage(chatId, text, opts);
}

bot.onText(/\/start/, (msg) => sendMainMenu(msg.chat.id));

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    bot.answerCallbackQuery(query.id).catch(() => {});

    if (!userState[chatId]) userState[chatId] = { step: null, cancel: false, context: null };

    if (query.data === 'menu_new') {
        bot.editMessageText("🌟 **المميزات الجديدة (توجيه للفيزا):**\n\nاختر كيف تريد إنشاء الحساب قبل التوجه للدفع:", {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 تشغيل تلقائي + توجيه للفيزا', callback_data: 'start_new_system' }],
                    [{ text: '✍️ إنشاء حساب يدوي + توجيه للفيزا', callback_data: 'start_manual_new_system' }],
                    [{ text: '🔙 رجوع', callback_data: 'back_main' }]
                ]
            }
        });
    }

    if (query.data === 'back_main') sendMainMenu(chatId, msgId);

    if (query.data === 'cancel') {
        userState[chatId].cancel = true;
        if (userState[chatId].context) await userState[chatId].context.close().catch(()=>{});
        bot.sendMessage(chatId, "🛑 تم الإلغاء.");
        isProcessing = false;
    }

    if (query.data === 'start_new_system') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ مشغول.");
        isProcessing = true;
        await createAccountLogic(chatId, 1, 1, null, true);
        isProcessing = false;
    }

    if (query.data === 'start_manual_new_system') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ مشغول.");
        userState[chatId].step = 'awaiting_email_new_system';
        bot.sendMessage(chatId, "➡️ أرسل **الإيميل** للبدء (نظام الفيزا اليدوي):");
    }

    if (query.data === 'create_auto') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ مشغول.");
        isProcessing = true;
        await createAccountLogic(chatId, 1, 1, null, false);
        isProcessing = false;
    }

    if (query.data === 'create_manual') {
        userState[chatId].step = 'awaiting_email';
        bot.sendMessage(chatId, "➡️ أرسل الإيميل للإنشاء العادي:");
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!userState[chatId] || !text || text.startsWith('/')) return;

    if (userState[chatId].step === 'awaiting_email' || userState[chatId].step === 'awaiting_email_new_system') {
        const isNewSys = userState[chatId].step === 'awaiting_email_new_system';
        const pass = generateSecurePassword();
        userState[chatId].step = null;
        isProcessing = true;
        await createAccountLogic(chatId, 1, 1, { email: text, password: pass }, isNewSys);
        isProcessing = false;
    }
});

console.log("🤖 البوت يعمل...");
