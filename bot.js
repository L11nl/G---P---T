const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright-extra'); 
const stealth = require('puppeteer-extra-plugin-stealth')();
const axios = require('axios');
const cheerio = require('cheerio');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

chromium.use(stealth);

// جلب التوكن من Railway
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ خطأ: BOT_TOKEN مفقود.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;

// متغير عالمي لحفظ البروكسي اللي تضيفه من البوت
let activeProxy = null; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function generateSecurePassword() {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 15; i++) password += charset[crypto.randomInt(0, charset.length)];
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
        return `${faker.person.firstName()}${faker.person.lastName()}${crypto.randomBytes(3).toString('hex')}@${domain}`.toLowerCase();
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
            const codeMatch = cheerio.load(res.data)("body").text().match(/\b\d{6}\b/);
            if (codeMatch) return codeMatch[0];
        } catch (e) {}
        await sleep(5000);
    }
    return null;
}

async function createAccount(chatId, currentNum, total) {
    const statusMsg = await bot.sendMessage(chatId, `⚙️ جاري العمل على الحساب [${currentNum}/${total}]...`);
    const email = await generateRandomEmail();
    const password = generateSecurePassword();
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    
    await bot.editMessageText(`📧 إيميل: \`${email}\`\n🔑 باسورد: \`${password}\``, {
        chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown'
    });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_'));
    let context, page;

    try {
        const browserOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            ignoreDefaultArgs: ["--enable-automation"]
        };

        // استخدام البروكسي إذا تم إضافته من التليجرام
        if (activeProxy) {
            bot.sendMessage(chatId, `🌍 جاري الاتصال عبر البروكسي:\n\`${activeProxy.server}\``, { parse_mode: 'Markdown' });
            browserOptions.proxy = { server: activeProxy.server };
            if (activeProxy.username && activeProxy.password) {
                browserOptions.proxy.username = activeProxy.username;
                browserOptions.proxy.password = activeProxy.password;
            }
        } else {
            bot.sendMessage(chatId, "⚠️ تحذير: البوت يعمل بدون بروكسي.");
        }

        context = await chromium.launchPersistentContext(tempDir, browserOptions);
        page = await context.newPage();

        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(6000);

        bot.sendMessage(chatId, "🛡️ جاري فحص الحماية...");
        try {
            const cfCheckbox = page.frameLocator('iframe').locator('input[type="checkbox"]');
            if (await cfCheckbox.isVisible({ timeout: 5000 })) {
                await cfCheckbox.click();
                await sleep(5000);
            }
        } catch(e) {}

        await page.click('button:has-text("Sign up")', { timeout: 15000 }).catch(() => {});
        await sleep(3000);
        await page.fill('input[id="email-input"], input[name="email"]', email);
        await sleep(1000);
        await page.keyboard.press('Enter');
        
        bot.sendMessage(chatId, "✍️ جاري كتابة الباسورد...");
        await sleep(6000);
        const passInput = page.locator('input[type="password"]');
        await passInput.waitFor({ state: 'visible', timeout: 15000 });
        await passInput.fill(password);
        await sleep(1000);
        await passInput.press('Enter');

        bot.sendMessage(chatId, "⏳ بانتظار كود التفعيل...");
        const code = await getVerificationCode(email);
        if (!code) throw new Error("لم يصل كود التفعيل.");

        await page.fill('input[aria-label="Verification code"], input[type="text"]', code);
        await sleep(3000);

        await page.fill('input[name="name"]', fullName).catch(() => {});

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
            await bot.sendPhoto(chatId, sc, { caption: `صورة المشكلة الأخيرة:` });
        }
        if (context) await context.close();
        return false;
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

// ================= أوامر البوت =================

bot.onText(/\/start/, (msg) => {
    const text = `أهلاً نبيل! 🤖\n\n` +
                 `🔹 لإنشاء حسابات: \`/create 1\`\n` +
                 `🔹 لإضافة بروكسي: \`/setproxy IP:PORT\`\n` +
                 `🔹 لمسح البروكسي: \`/clearproxy\``;
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/setproxy (.+)/, (msg, match) => {
    const parts = match[1].split(' ');
    let server = parts[0];
    
    // تأكد من إضافة http:// إذا ما كانت موجودة
    if (!server.startsWith('http://') && !server.startsWith('socks5://')) {
        server = 'http://' + server;
    }

    activeProxy = { server: server };
    
    // إذا اكو يوزر وباسورد
    if (parts.length >= 3) {
        activeProxy.username = parts[1];
        activeProxy.password = parts[2];
        bot.sendMessage(msg.chat.id, `✅ تم حفظ البروكسي المدفوع بنجاح!\nالسيرفر: \`${server}\``, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(msg.chat.id, `✅ تم حفظ البروكسي بنجاح!\nالسيرفر: \`${server}\``, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/clearproxy/, (msg) => {
    activeProxy = null;
    bot.sendMessage(msg.chat.id, "🗑️ تم مسح البروكسي! البوت هسه راح يشتغل على اتصال السيرفر المباشر.");
});

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
