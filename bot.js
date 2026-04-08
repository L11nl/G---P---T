const TelegramBot = require('node-telegram-bot-api');
const { firefox } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// جلب الإعدادات من Railway
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 0;

if (!BOT_TOKEN) {
    console.error("❌ خطأ: BOT_TOKEN مفقود في إعدادات Railway.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// دالة توليد باسورد عشوائي قوي (أكثر من 12 حرف)
function generateSecurePassword() {
    const length = 15;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = crypto.randomInt(0, charset.length);
        password += charset[randomIndex];
    }
    return password;
}

async function generateRandomEmail() {
    try {
        const response = await axios.get("https://generator.email/", {
            headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });
        const $ = cheerio.load(response.data);
        const domains = [];
        $(".e7m.tt-suggestions div > p, .tt-suggestions p").each((i, elem) => {
            const domainText = $(elem).text().trim();
            if (domainText.includes('.')) domains.push(domainText);
        });
        const domain = domains.length > 0 ? domains[Math.floor(Math.random() * domains.length)] : "xezo.live";
        const email = `${faker.person.firstName()}${faker.person.lastName()}${crypto.randomBytes(3).toString('hex')}@${domain}`.toLowerCase();
        return email;
    } catch (error) {
        throw new Error("فشل في توليد الإيميل.");
    }
}

async function getVerificationCode(email, maxRetries = 15) {
    const [username, domain] = email.split("@");
    const inboxUrl = `https://generator.email/${domain}/${username}`;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await axios.get(inboxUrl, { headers: { "user-agent": "Mozilla/5.0" } });
            const $ = cheerio.load(res.data);
            const codeMatch = $("body").text().match(/\b\d{6}\b/);
            if (codeMatch) return codeMatch[0];
        } catch (e) {}
        await sleep(5000);
    }
    return null;
}

async function createAccount(chatId, currentNum, total) {
    const statusMsg = await bot.sendMessage(chatId, `⚙️ جاري العمل على الحساب [${currentNum}/${total}]...`);
    const email = await generateRandomEmail();
    const password = generateSecurePassword(); // توليد الباسورد العشوائي هنا
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    
    await bot.editMessageText(`📧 إيميل: \`${email}\`\n🔑 باسورد عشوائي: \`${password}\``, {
        chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown'
    });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_'));
    let context, page;

    try {
        context = await firefox.launchPersistentContext(tempDir, { headless: true });
        page = await context.newPage();

        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" });
        await sleep(4000);

        // مرحلة الإيميل
        await page.click('button:has-text("Sign up")', { timeout: 10000 }).catch(() => {});
        await sleep(2000);
        await page.fill('input[id="email-input"], input[name="email"]', email);
        await page.keyboard.press('Enter');
        
        // مرحلة الباسورد
        bot.sendMessage(chatId, "✍️ جاري كتابة الباسورد العشوائي...");
        await sleep(5000);
        const passInput = page.locator('input[type="password"]');
        await passInput.waitFor({ state: 'visible', timeout: 15000 });
        await passInput.fill(password);
        await sleep(1000);
        await passInput.press('Enter');

        // مرحلة الكود
        bot.sendMessage(chatId, "⏳ بانتظار كود التفعيل...");
        const code = await getVerificationCode(email);
        if (!code) throw new Error("لم يصل كود التفعيل.");

        await page.fill('input[aria-label="Verification code"], input[type="text"]', code);
        await sleep(3000);

        // إدخال الاسم وتاريخ الميلاد
        await page.fill('input[name="name"]', fullName).catch(() => {});
        // (إضافة كود تاريخ الميلاد هنا كما في النسخ السابقة...)

        const result = `${email}|${password}`;
        fs.appendFileSync(ACCOUNTS_FILE, result + '\n');
        await bot.sendMessage(chatId, `✅ **تم بنجاح!**\n\n\`${result}\``, { parse_mode: 'Markdown' });
        
        await context.close();
        return true;

    } catch (error) {
        await bot.sendMessage(chatId, `❌ فشل الحساب: ${error.message}`);
        if (page) {
            const sc = path.join(tempDir, 'fail.png');
            await page.screenshot({ path: sc });
            await bot.sendPhoto(chatId, sc, { caption: `آخر مشكلة ويه الباسورد: ${password}` });
        }
        if (context) await context.close();
        return false;
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "أهلاً نبيل! دز `/create 1` حتى أبلش."));

bot.onText(/\/create (.+)/, async (msg, match) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت ديشتغل حالياً، اصبر شوية.");
    const num = parseInt(match[1]);
    if (isNaN(num) || num <= 0) return bot.sendMessage(msg.chat.id, "اكتب رقم صحيح عيوني.");
    
    isProcessing = true;
    for (let i = 1; i <= num; i++) {
        await createAccount(msg.chat.id, i, num);
        await sleep(5000);
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 كملت كل الحسابات.");
});
