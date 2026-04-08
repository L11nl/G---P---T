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
    console.error("❌ خطأ: BOT_TOKEN مفقود في إعدادات Railway.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;
let activeProxy = null; 

// إعدادات الـ API الجديد
const API_BASE_URL = 'https://usmail.my.id';
const API_LICENSE_KEY = 'USMAIL-166T-DEMO';

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

// 1. توليد الإيميل من الـ API المخصص
async function generateRandomEmail() {
    const username = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(3).toString('hex')}`;
    const headers = {
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9,ar-IQ;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'X-License-Key': API_LICENSE_KEY,
        'Referer': `${API_BASE_URL}/room/master`
    };

    try {
        const response = await axios.get(`${API_BASE_URL}/api/public/rooms/master/domains`, { headers });
        let domains = [];
        
        if (response.data && response.data.success && response.data.domains) {
            domains = response.data.domains;
        } else {
            domains = ["usmail.my.id", "toolsmail.me", "funtechme.me", "doestech.web.id", "studentx.me", "lostsaga.me"];
        }
        
        const domain = domains[Math.floor(Math.random() * domains.length)];
        return { email: `${username}@${domain}`, username: username };
    } catch (error) {
        const fallbackDomains = ["usmail.my.id", "toolsmail.me", "funtechme.me"];
        const domain = fallbackDomains[Math.floor(Math.random() * fallbackDomains.length)];
        return { email: `${username}@${domain}`, username: username };
    }
}

// 2. جلب الكود من الـ API المخصص
async function getVerificationCode(username, chatId, maxRetries = 20) {
    const headers = {
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9,ar-IQ;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'X-License-Key': API_LICENSE_KEY,
        'Referer': `${API_BASE_URL}/room/${username}`
    };

    // مسار الرسائل الافتراضي بناءً على مسار الدومينات
    const messagesUrl = `${API_BASE_URL}/api/public/rooms/${username}/messages`;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await axios.get(messagesUrl, { headers });
            
            // تحويل الاستجابة بالكامل لنص والبحث عن أي 6 أرقام متتالية (الكود)
            const dataStr = JSON.stringify(res.data);
            const codeMatch = dataStr.match(/\b\d{6}\b/);
            
            if (codeMatch) {
                const code = codeMatch[0];
                await bot.sendMessage(chatId, `📩 **وصل الكود:** \`${code}\``, { parse_mode: 'Markdown' });
                return code;
            }
        } catch (e) {}
        await sleep(3000); // فحص سريع كل 3 ثواني
    }
    return null;
}

async function simulateHumanActivityFast(page) {
    try {
        await page.mouse.wheel(0, 300);
        await sleep(300);
        await page.mouse.move(500, 400, { steps: 3 });
    } catch (e) {}
}

async function createAccount(chatId, currentNum, total) {
    const statusMsg = await bot.sendMessage(chatId, `⚡ جاري العمل على [${currentNum}/${total}]...`);
    
    let emailData, password;
    try {
        emailData = await generateRandomEmail();
        password = generateSecurePassword();
    } catch (e) {
        await bot.editMessageText(`❌ خطأ: ${e.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
        return false;
    }

    const email = emailData.email;
    const emailUsername = emailData.username; // استخرجنا اليوزرنيم حتى نستخدمه بالرسائل
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    
    await bot.editMessageText(`📧 \`${email}\`\n🔑 \`${password}\`\n🚀 سريع ومباشر!`, {
        chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown'
    });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_fast_'));
    let context, page;

    try {
        const browserOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1366, height: 768 }
        };

        if (activeProxy) browserOptions.proxy = { server: activeProxy.server };

        context = await chromium.launchPersistentContext(tempDir, browserOptions);
        page = await context.newPage();

        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 45000 });
        
        await simulateHumanActivityFast(page);

        const signupBtn = page.locator('button:has-text("Sign up")');
        await signupBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        if (await signupBtn.isVisible()) await signupBtn.click();
        
        const emailInput = page.locator('input[id="email-input"], input[name="email"]');
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });
        await emailInput.fill(email);
        await page.keyboard.press('Enter');
        
        const passInput = page.locator('input[type="password"]');
        await passInput.waitFor({ state: 'visible', timeout: 15000 });
        await passInput.fill(password);
        await page.keyboard.press('Enter');

        try {
            await page.waitForSelector('text="Failed to create account"', { timeout: 3000 });
            throw new Error("مرفوض من السيرفر (حظر مؤقت).");
        } catch (e) {
            if (e.message.includes("مرفوض")) throw e;
        }

        bot.sendMessage(chatId, "⏳ بانتظار الكود...");
        // استخدام اليوزرنيم الخاص بالإيميل لجلب الكود من الـ API
        let code = await getVerificationCode(emailUsername, chatId, 15);
        
        if (!code) {
            const resend = page.locator('button:has-text("Resend email"), a:has-text("Resend email")');
            if (await resend.isVisible({ timeout: 3000 })) {
                await resend.click();
                bot.sendMessage(chatId, "🔄 ضغطنا إعادة إرسال...");
                code = await getVerificationCode(emailUsername, chatId, 10);
            }
        }

        if (!code) throw new Error("الكود ما وصل.");

        const codeInput = page.locator('input[aria-label="Verification code"], input[type="text"]');
        await codeInput.waitFor({ state: 'visible' });
        await codeInput.fill(code);

        const nameInput = page.locator('input[name="name"]');
        await nameInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        if (await nameInput.isVisible()) {
            await nameInput.fill(fullName);
            await page.keyboard.press('Enter');
            await sleep(3000);
        }

        // الرسالة النظيفة فقط للنسخ
        const result = `${email}|${password}`;
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
        await bot.sendMessage(chatId, `\`${result}\``, { parse_mode: 'Markdown' });
        
        await context.close();
        return true;

    } catch (error) {
        await bot.sendMessage(chatId, `❌ خطأ: ${error.message}`);
        if (context) await context.close();
        return false;
    } finally {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }
}

// ================= الأوامر =================

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "أهلاً نبيل! البوت مربوط بـ API موقع usmail.my.id 🚀\nاستخدم `/create 1`");
});

bot.onText(/\/create (.+)/, async (msg, match) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت ديشتغل هسه.");
    const num = parseInt(match[1]);
    if (isNaN(num) || num <= 0) return bot.sendMessage(msg.chat.id, "اكتب رقم صحيح.");
    
    isProcessing = true;
    for (let i = 1; i <= num; i++) {
        await createAccount(msg.chat.id, i, num);
        await sleep(2000); 
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 اكتملت العملية.");
});

bot.onText(/\/setproxy (.+)/, (msg, match) => {
    let server = match[1].trim();
    if (!server.startsWith('http://')) server = 'http://' + server;
    activeProxy = { server };
    bot.sendMessage(msg.chat.id, `✅ بروكسي تفعل: \`${server}\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/clearproxy/, (msg) => {
    activeProxy = null;
    bot.sendMessage(msg.chat.id, "🗑️ تم إيقاف البروكسي.");
});
