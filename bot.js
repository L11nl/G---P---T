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

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("❌ خطأ: BOT_TOKEN مفقود في إعدادات Railway.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
const FIXED_DOMAIN = 'asistx.net'; // الدومين المطلوب
let isProcessing = false;
let activeProxy = null; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function generateSecurePassword() {
    const length = 16;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) password += charset[crypto.randomInt(0, charset.length)];
    return password;
}

// تعديل: إنشاء إيميل حصراً على دومين asistx.net
async function generateRandomEmail() {
    const username = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(3).toString('hex')}`;
    return `${username}@${FIXED_DOMAIN}`;
}

// تعديل: جلب الكود وإرساله فوراً للتليجرام
async function getVerificationCode(email, chatId, maxRetries = 20) {
    const [username, domain] = email.split("@");
    const inboxUrl = `https://generator.email/${domain}/${username}`;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await axios.get(inboxUrl, { headers: { "user-agent": "Mozilla/5.0" } });
            const $ = cheerio.load(res.data);
            const codeMatch = $("body").text().match(/\b\d{6}\b/) || $("#email_content").text().match(/\b\d{6}\b/);
            
            if (codeMatch) {
                const code = codeMatch[0];
                // إرسال الكود فوراً للبوت كرسالة منفصلة
                await bot.sendMessage(chatId, `📩 **وصل كود التفعيل الآن:**\n\nالإيميل: \`${email}\`\nالكود: \`${code}\``, { parse_mode: 'Markdown' });
                return code;
            }
        } catch (e) {}
        await sleep(5000);
    }
    return null;
}

async function simulateHumanActivity(page) {
    try {
        const width = 1366, height = 768;
        await page.mouse.move(Math.random() * width, Math.random() * height, { steps: 5 });
        await page.mouse.wheel(0, 300);
    } catch (e) {}
}

async function createAccount(chatId, currentNum, total) {
    const statusMsg = await bot.sendMessage(chatId, `⚙️ جاري العمل على الحساب [${currentNum}/${total}]...`);
    
    const email = await generateRandomEmail();
    const password = generateSecurePassword();
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    
    await bot.editMessageText(`📧 إيميل: \`${email}\`\n🔑 باسورد: \`${password}\`\n🌐 الدومين: @${FIXED_DOMAIN}`, {
        chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown'
    });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_profile_'));
    let context, page;

    try {
        const browserOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1366, height: 768 }
        };

        if (activeProxy) {
            browserOptions.proxy = { server: activeProxy.server };
        }

        context = await chromium.launchPersistentContext(tempDir, browserOptions);
        page = await context.newPage();

        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(5000);

        // تجاوز Cloudflare
        try {
            const cf = page.frameLocator('iframe[title*="Cloudflare"]').locator('input[type="checkbox"]');
            if (await cf.isVisible({ timeout: 5000 })) await cf.click();
        } catch(e) {}

        await page.click('button:has-text("Sign up")', { timeout: 15000 }).catch(() => {});
        await sleep(3000);

        await page.fill('input[id="email-input"], input[name="email"]', email);
        await page.keyboard.press('Enter');
        
        await sleep(6000);
        await page.fill('input[type="password"]', password);
        await page.keyboard.press('Enter');

        await sleep(5000);
        if (await page.isVisible('text="Failed to create account"')) {
            throw new Error("رفض السيرفر الإنشاء لهذا الدومين حالياً.");
        }

        // انتظار الكود وإرساله للبوت
        bot.sendMessage(chatId, "⏳ بانتظار وصول الكود إلى الصندوق...");
        const code = await getVerificationCode(email, chatId);
        
        if (!code) {
            // محاولة إعادة الإرسال إذا تأخر
            const resend = page.locator('button:has-text("Resend email")');
            if (await resend.isVisible()) {
                await resend.click();
                bot.sendMessage(chatId, "🔄 تم الضغط على إعادة إرسال الكود...");
                const codeRetry = await getVerificationCode(email, chatId);
                if (codeRetry) {
                    await page.fill('input[type="text"]', codeRetry);
                } else throw new Error("لم يصل الكود حتى بعد إعادة الإرسال.");
            } else throw new Error("انتهى وقت انتظار الكود.");
        } else {
            await page.fill('input[type="text"]', code);
        }

        await sleep(4000);
        // إكمال الاسم
        try {
            const nameInput = page.locator('input[name="name"]');
            if (await nameInput.isVisible()) {
                await nameInput.fill(fullName);
                await page.keyboard.press('Enter');
                await sleep(5000);
            }
        } catch(e) {}

        const result = `${email}|${password}`;
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
        await bot.sendMessage(chatId, `🎉 **مبروك! اكتمل الحساب:**\n\n\`${result}\``, { parse_mode: 'Markdown' });
        
        await context.close();
        return true;

    } catch (error) {
        await bot.sendMessage(chatId, `❌ توقف العمل: ${error.message}`);
        if (context) await context.close();
        return false;
    } finally {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "أهلاً نبيل! البوت جاهز لإنشاء الحسابات على دومين @asistx.net 🚀");
});

bot.onText(/\/create (.+)/, async (msg, match) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت قيد العمل...");
    const num = parseInt(match[1]);
    if (isNaN(num) || num <= 0) return bot.sendMessage(msg.chat.id, "حدد عدد الحسابات.");
    
    isProcessing = true;
    for (let i = 1; i <= num; i++) {
        await createAccount(msg.chat.id, i, num);
        await sleep(5000); 
    }
    isProcessing = false;
});

bot.onText(/\/setproxy (.+)/, (msg, match) => {
    let server = match[1].trim();
    if (!server.startsWith('http://')) server = 'http://' + server;
    activeProxy = { server };
    bot.sendMessage(msg.chat.id, `✅ تم تفعيل البروكسي: \`${server}\``);
});

bot.onText(/\/clearproxy/, (msg) => {
    activeProxy = null;
    bot.sendMessage(msg.chat.id, "🗑️ تم إيقاف البروكسي.");
});
