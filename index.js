/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار 24 (المحسن للعمل على Railway)
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

// جلب التوكن من متغيرات البيئة في Railway
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ خطأ: BOT_TOKEN غير موجود في متغيرات البيئة.");
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
    const all = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) password += all[crypto.randomInt(0, all.length)];
    return password;
}

async function createMailTmAccount(chatId) {
    try {
        const domainsRes = await axios.get(`${MAIL_API}/domains`);
        const domain = domainsRes.data['hydra:member'][0].domain;
        const username = faker.internet.userName().toLowerCase().replace(/[^a-z0-9]/g, '') + crypto.randomBytes(2).toString('hex');
        const email = `${username}@${domain}`;
        const password = generateSecurePassword();

        await bot.sendMessage(chatId, `📧 جاري إنشاء بريد: \`${email}\``, { parse_mode: 'Markdown' });
        await axios.post(`${MAIL_API}/accounts`, { address: email, password: password });
        const tokenRes = await axios.post(`${MAIL_API}/token`, { address: email, password: password });
        return { email, password, token: tokenRes.data.token };
    } catch (error) {
        throw new Error('فشل إنشاء البريد المؤقت');
    }
}

async function waitForMailTmCode(token, chatId) {
    const startTime = Date.now();
    const statusMsg = await bot.sendMessage(chatId, `⏳ في انتظار وصول كود التفعيل...`);
    while ((Date.now() - startTime) < 100000) {
        try {
            const res = await axios.get(`${MAIL_API}/messages`, { headers: { Authorization: `Bearer ${token}` } });
            const messages = res.data['hydra:member'] || [];
            for (const msg of messages) {
                const codeMatch = (msg.subject + msg.intro).match(/\b\d{6}\b/);
                if (codeMatch) {
                    await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
                    return codeMatch[0];
                }
            }
        } catch (e) {}
        await sleep(5000);
    }
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
    return null;
}

async function sendStepPhoto(page, chatId, caption, prevId) {
    try {
        if (prevId) await bot.deleteMessage(chatId, prevId).catch(() => {});
        const imgPath = path.join(__dirname, `step_${Date.now()}.png`);
        await page.screenshot({ path: imgPath });
        const sent = await bot.sendPhoto(chatId, imgPath, { caption });
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        return sent.message_id;
    } catch (e) { return prevId; }
}

async function createAccountLogic(chatId, isManual, manualData = null) {
    const mode = isManual ? "(يدوي)" : "(تلقائي)";
    let currentPhotoId = null;
    let email, mailToken, chatGptPassword;

    try {
        if (isManual) {
            email = manualData.email;
            chatGptPassword = manualData.password;
        } else {
            const mail = await createMailTmAccount(chatId);
            email = mail.email;
            mailToken = mail.token;
            chatGptPassword = generateSecurePassword();
        }

        const tempDir = fs.mkdtempSync(path.join(__dirname, 'worker_'));
        const browserOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            viewport: { width: 1280, height: 720 }
        };

        const context = await chromium.launchPersistentContext(tempDir, browserOptions);
        const page = await context.newPage();

        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "networkidle", timeout: 60000 });
        await page.click('button:has-text("Sign up")');
        
        await page.waitForSelector('input[name="email"]');
        await page.fill('input[name="email"]', email);
        await page.click('button:has-text("Continue")');

        await page.waitForSelector('input[type="password"]');
        await page.fill('input[type="password"]', chatGptPassword);
        await page.click('button:has-text("Continue")');

        let code;
        if (isManual) {
            await bot.sendMessage(chatId, "📩 أرسل كود التفعيل المكون من 6 أرقام الآن:");
            code = await new Promise(r => {
                const l = (m) => { if(m.chat.id === chatId && /^\d{6}$/.test(m.text)) { bot.removeListener('message', l); r(m.text); }};
                bot.on('message', l);
                setTimeout(() => { bot.removeListener('message', l); r(null); }, 60000);
            });
        } else {
            code = await waitForMailTmCode(mailToken, chatId);
        }

        if (!code) throw new Error("لم يتم الحصول على الكود");

        await page.keyboard.type(code, { delay: 100 });
        await sleep(5000);

        // إدخال الاسم والمواليد (منطق المواليد 04242000)
        const nameInput = page.locator('input[name="name"], [role="textbox"]').first();
        if (await nameInput.isVisible({ timeout: 10000 })) {
            await nameInput.fill(`${faker.person.firstName()} ${faker.person.lastName()}`);
            const monthSpin = page.locator('[role="spinbutton"][aria-label*="month" i]').first();
            if (await monthSpin.isVisible()) {
                await monthSpin.click();
                await page.keyboard.type("04242000", { delay: 150 });
            }
            
            // محاولة الضغط على زر الإنهاء بمختلف التسميات
            const finishSelectors = ['button:has-text("Continue")', 'button:has-text("Finish")', 'button:has-text("Agree")'];
            for (let sel of finishSelectors) {
                const btn = page.locator(sel).last();
                if (await btn.isVisible()) { await btn.click(); break; }
            }
        }

        await page.waitForURL('**/chat', { timeout: 30000 });
        const result = `${email}|${chatGptPassword}`;
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
        await bot.sendMessage(chatId, `🎉 تم إنشاء الحساب بنجاح!\n\`${result}\``, { parse_mode: 'Markdown' });

        await context.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
        await bot.sendMessage(chatId, `❌ خطأ: ${e.message}`);
    }
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🤖 بوت إنشاء حسابات ChatGPT جاهز.", {
        reply_markup: { inline_keyboard: [[{ text: '🤖 تلقائي', callback_data: 'auto' }, { text: '✍️ يدوي', callback_data: 'manual' }]] }
    });
});

bot.on('callback_query', async (q) => {
    if (q.data === 'auto') await createAccountLogic(q.message.chat.id, false);
    if (q.data === 'manual') {
        userState[q.message.chat.id] = { step: 'email' };
        bot.sendMessage(q.message.chat.id, "أرسل الإيميل المستخدم:");
    }
});

bot.on('message', async (msg) => {
    const state = userState[msg.chat.id];
    if (state?.step === 'email') {
        state.email = msg.text;
        state.step = 'pass';
        bot.sendMessage(msg.chat.id, "أرسل الباسورد:");
    } else if (state?.step === 'pass') {
        const data = { email: state.email, password: msg.text };
        delete userState[msg.chat.id];
        await createAccountLogic(msg.chat.id, true, data);
    }
});

console.log("🚀 البوت يعمل...");
