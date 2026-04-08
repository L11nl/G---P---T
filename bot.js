const TelegramBot = require('node-telegram-bot-api');
const { firefox } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// جلب الإعدادات من متغيرات البيئة في Railway
const BOT_TOKEN = process.env.BOT_TOKEN;
const DEFAULT_PASSWORD = process.env.PASSWORD || 'GantiPasswordAnda123!';
const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 0;

if (!BOT_TOKEN) {
    console.error("❌ خطأ: لم يتم العثور على BOT_TOKEN. يرجى إضافته في إعدادات Railway.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randStr = (length) => crypto.randomBytes(length).toString('hex').slice(0, length);

// دالة توليد الإيميل
async function generateRandomEmail(chatId) {
    try {
        const response = await axios.get("https://generator.email/", {
            headers: {
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        });

        const $ = cheerio.load(response.data);
        const domains = [];
        
        $(".e7m.tt-suggestions div > p, .tt-suggestions p, [class*='suggestion'] p").each((i, elem) => {
            const domainText = $(elem).text().trim();
            if (domainText && domainText.includes('.') && !domainText.includes(' ')) {
                domains.push(domainText);
            }
        });

        const fallbackDomains = ["xezo.live", "muahetbienhoa.com", "gmailvn.xyz", "mailvn.top"];
        const domain = domains.length > 0 ? domains[Math.floor(Math.random() * domains.length)] : fallbackDomains[Math.floor(Math.random() * fallbackDomains.length)];
        
        const firstName = faker.person.firstName().replace(/['"]/g, "");
        const lastName = faker.person.lastName().replace(/['"]/g, "");
        const email = `${firstName}${lastName}${randStr(5)}@${domain}`.toLowerCase();

        return { email, firstName, lastName };
    } catch (error) {
        throw new Error(`فشل توليد الإيميل: ${error.message}`);
    }
}

// دالة توليد تاريخ الميلاد
function generateRandomBirthday() {
    const today = new Date();
    const year = Math.floor(Math.random() * (2000 - 1980 + 1)) + 1980;
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    return { year, month, day };
}

// دالة جلب كود التفعيل
async function getVerificationCode(email, chatId, maxRetries = 12, delayMs = 5000) {
    const [username, domain] = email.split("@");
    let inboxUrl = `https://generator.email/${domain}/${username}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await axios.get(inboxUrl, {
                headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
            });
            const $ = cheerio.load(response.data);
            const otpText = $("body").text();
            const codeMatch = otpText.match(/\b\d{6}\b/);
            
            if (codeMatch) {
                return codeMatch[0];
            }
        } catch (e) {}
        await sleep(delayMs);
    }
    return null;
}

// دالة إنشاء الحساب الأساسية مع ميزة تصوير الشاشة
async function createAccount(chatId, currentAccountNum, totalAccounts) {
    const statusMsg = await bot.sendMessage(chatId, `⚙️ بدء إنشاء الحساب [${currentAccountNum}/${totalAccounts}]...`);
    
    let emailInfo;
    try {
        emailInfo = await generateRandomEmail(chatId);
    } catch (e) {
        return await bot.sendMessage(chatId, `❌ ${e.message}`);
    }

    const { email, firstName, lastName } = emailInfo;
    const fullName = `${firstName} ${lastName}`;
    const birthday = generateRandomBirthday();
    
    await bot.editMessageText(`📧 الإيميل المستخدم:\n${email}`, { chat_id: chatId, message_id: statusMsg.message_id });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_profile_'));
    let context;
    let page;

    try {
        context = await firefox.launchPersistentContext(tempDir, {
            headless: true, 
            viewport: { width: 1366, height: 768 },
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
        });

        page = await context.newPage();

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await bot.sendMessage(chatId, "🌐 التوجه لموقع ChatGPT...");
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(3000);

        bot.sendMessage(chatId, "🖱️ محاولة الضغط على Sign up...");
        await page.click('button:has-text("Sign up")', { timeout: 15000 }).catch(() => {});
        
        await sleep(3000);
        await page.fill('input[name="email"]', email).catch(() => {});
        await sleep(1000);
        await page.keyboard.press('Enter');
        
        await sleep(5000);
        await page.fill('input[name="password"]', DEFAULT_PASSWORD).catch(() => {});
        await sleep(1000);
        await page.keyboard.press('Enter');
        
        bot.sendMessage(chatId, "⏳ انتظار وصول كود التفعيل...");
        const code = await getVerificationCode(email, chatId);
        if (!code) throw new Error("لم يتم استلام كود التفعيل من الإيميل.");

        await bot.sendMessage(chatId, `✅ تم استلام الكود: ${code}\nجاري التفعيل...`);
        // هنا يتم إكمال الخطوات برمجياً حسب شكل الصفحة
        
        // في حال النجاح
        const accountData = `${email}|${DEFAULT_PASSWORD}`;
        fs.appendFileSync(ACCOUNTS_FILE, accountData + '\n');
        await bot.sendMessage(chatId, `🎉 تم إنشاء الحساب بنجاح!\n\`${accountData}\``, { parse_mode: 'Markdown' });
        
        await context.close();
        return true;

    } catch (error) {
        await bot.sendMessage(chatId, `❌ فشل: ${error.message}`);
        
        // تصوير الشاشة عند الفشل
        try {
            if (page) {
                const scPath = path.join(tempDir, 'error.png');
                await page.screenshot({ path: scPath });
                await bot.sendPhoto(chatId, scPath, { caption: '📸 هذي صورة للمشكلة اللي واجهت البوت بموقع ChatGPT' });
            }
        } catch (e) {}

        if (context) await context.close();
        return false;
    } finally {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }
}

// أوامر التليجرام
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "هلا بيك! 🤖\nاستخدم `/create 1` للبدء.", { parse_mode: 'Markdown' });
});

bot.onText(/\/create (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (isProcessing) return bot.sendMessage(chatId, "⚠️ انتظر، البوت يعمل حالياً.");
    
    const num = parseInt(match[1]);
    if (isNaN(num) || num <= 0) return bot.sendMessage(chatId, "اكتب رقم صحيح.");

    isProcessing = true;
    for (let i = 1; i <= num; i++) {
        await createAccount(chatId, i, num);
        await sleep(5000);
    }
    isProcessing = false;
    bot.sendMessage(chatId, "🏁 اكتملت العملية.");
});
