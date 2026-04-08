const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright-extra'); 
const stealth = require('puppeteer-extra-plugin-stealth')();
const axios = require('axios');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

chromium.use(stealth);

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN مفقود");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;

const API_BASE_URL = 'https://usmail.my.id';
const API_LICENSE_KEY = 'USMAIL-166T-DEMO';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function generateSecurePassword() {
    return crypto.randomBytes(10).toString('hex') + "Aa1!";
}

// توليد ايميل
async function generateRandomEmail() {
    const username = faker.internet.username().replace(/[^a-z0-9]/gi, '').toLowerCase() + crypto.randomBytes(2).toString('hex');

    return {
        email: `${username}@usmail.my.id`,
        username
    };
}

// ✅ نسخة محسنة لجلب الكود
async function getVerificationCode(username, chatId, maxRetries = 20) {
    const url = `${API_BASE_URL}/api/public/rooms/${username}/messages`;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await axios.get(url, {
                headers: {
                    'X-License-Key': API_LICENSE_KEY
                }
            });

            const messages = res.data?.messages || res.data;

            if (messages && messages.length > 0) {
                for (let msg of messages) {
                    const content = (msg.subject || "") + " " + (msg.body || "");

                    // استخراج الكود من النص فقط
                    const match = content.match(/\b\d{6}\b/);

                    if (match) {
                        const code = match[0];
                        await bot.sendMessage(chatId, `📩 الكود وصل: ${code}`);
                        return code;
                    }
                }
            }

            console.log("📭 لا يوجد كود بعد...");
        } catch (err) {
            console.log("خطأ API:", err.message);
        }

        await sleep(3000);
    }

    return null;
}

async function createAccount(chatId) {
    const { email, username } = await generateRandomEmail();
    const password = generateSecurePassword();

    await bot.sendMessage(chatId, `📧 ${email}\n🔑 ${password}`);

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'tmp_'));

    let context, page;

    try {
        context = await chromium.launchPersistentContext(tempDir, {
            headless: true,
            args: ['--no-sandbox']
        });

        page = await context.newPage();

        await page.goto("https://chatgpt.com/auth/login");

        await page.click('text=Sign up');

        await page.fill('input[name="email"]', email);
        await page.keyboard.press('Enter');

        await page.fill('input[type="password"]', password);
        await page.keyboard.press('Enter');

        await bot.sendMessage(chatId, "⏳ ننتظر الكود...");

        let code = await getVerificationCode(username, chatId);

        if (!code) throw new Error("❌ الكود ما وصل");

        await page.fill('input[type="text"]', code);

        fs.appendFileSync(ACCOUNTS_FILE, `${email}|${password}\n`);

        await bot.sendMessage(chatId, "✅ تم إنشاء الحساب");

        await context.close();

    } catch (err) {
        await bot.sendMessage(chatId, "❌ خطأ: " + err.message);

        if (page) {
            try {
                const sc = path.join(tempDir, 'error.png');
                await page.screenshot({ path: sc });
                await bot.sendPhoto(chatId, sc);
            } catch {}
        }

        if (context) await context.close();
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 اكتب /create");
});

bot.onText(/\/create/, async (msg) => {
    if (isProcessing) return;

    isProcessing = true;

    await createAccount(msg.chat.id);

    isProcessing = false;
});
