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
let isProcessing = false;
let activeProxy = null; 

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

// استرجاع الدومينات العشوائية القديمة والمنوعة
async function generateRandomEmail() {
    try {
        const response = await axios.get("https://generator.email/", {
            headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });
        const $ = cheerio.load(response.data);
        const domains = [];
        $(".e7m.tt-suggestions div > p, .tt-suggestions p").each((i, elem) => {
            const domainText = $(elem).text().trim();
            if (domainText.includes('.') && !domainText.includes(' ')) {
                domains.push(domainText);
            }
        });
        
        const fallbackDomains = [
            "xezo.live", "muahetbienhoa.com", "gmailvn.xyz", "mailvn.top", 
            "finews.biz", "nonicorp.com", "yopmail.com", "fomosi.com"
        ];
        
        const domain = domains.length > 5 ? domains[Math.floor(Math.random() * domains.length)] : fallbackDomains[Math.floor(Math.random() * fallbackDomains.length)];
        return `${faker.person.firstName()}${faker.person.lastName()}${crypto.randomBytes(3).toString('hex')}@${domain}`.toLowerCase();
    } catch (error) {
        throw new Error("فشل في توليد الإيميل.");
    }
}

// تسريع جلب الكود (فحص كل 3 ثواني بدل 5)
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
                await bot.sendMessage(chatId, `📩 **وصل كود التفعيل الآن:** \`${code}\``, { parse_mode: 'Markdown' });
                return code;
            }
        } catch (e) {}
        await sleep(3000); // تقليل وقت الانتظار لتسريع العملية
    }
    return null;
}

// تسريع الحركة العشوائية
async function simulateHumanActivityFast(page) {
    try {
        await page.mouse.wheel(0, 300);
        await sleep(300);
        await page.mouse.move(500, 400, { steps: 3 });
    } catch (e) {}
}

async function createAccount(chatId, currentNum, total) {
    const statusMsg = await bot.sendMessage(chatId, `⚡ جاري العمل السريع على [${currentNum}/${total}]...`);
    
    let email, password;
    try {
        email = await generateRandomEmail();
        password = generateSecurePassword();
    } catch (e) {
        await bot.editMessageText(`❌ خطأ: ${e.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
        return false;
    }

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

        // الانتظار الذكي للأزرار بدون Sleep ثابت
        const signupBtn = page.locator('button:has-text("Sign up")');
        await signupBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        if (await signupBtn.isVisible()) await signupBtn.click();
        
        // الإيميل
        const emailInput = page.locator('input[id="email-input"], input[name="email"]');
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });
        await emailInput.fill(email);
        await page.keyboard.press('Enter');
        
        // الباسورد (الانتظار الذكي)
        const passInput = page.locator('input[type="password"]');
        await passInput.waitFor({ state: 'visible', timeout: 15000 });
        await passInput.fill(password);
        await page.keyboard.press('Enter');

        // كشف الفشل السريع
        try {
            await page.waitForSelector('text="Failed to create account"', { timeout: 3000 });
            throw new Error("مرفوض من سيرفر OpenAI (حظر IP أو دومين).");
        } catch (e) {
            if (e.message.includes("مرفوض")) throw e;
            // إذا لم يظهر الخطأ، يكمل طبيعي
        }

        // الكود
        bot.sendMessage(chatId, "⏳ بانتظار الكود...");
        let code = await getVerificationCode(email, chatId, 15);
        
        if (!code) {
            const resend = page.locator('button:has-text("Resend email"), a:has-text("Resend email")');
            if (await resend.isVisible({ timeout: 3000 })) {
                await resend.click();
                bot.sendMessage(chatId, "🔄 ضغطنا Resend...");
                code = await getVerificationCode(email, chatId, 10);
            }
        }

        if (!code) throw new Error("الكود ما وصل.");

        const codeInput = page.locator('input[aria-label="Verification code"], input[type="text"]');
        await codeInput.waitFor({ state: 'visible' });
        await codeInput.fill(code);

        // الاسم
        const nameInput = page.locator('input[name="name"]');
        await nameInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        if (await nameInput.isVisible()) {
            await nameInput.fill(fullName);
            await page.keyboard.press('Enter');
            await sleep(3000);
        }

        const result = `${email}|${password}`;
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
        await bot.sendMessage(chatId, `🎉 **تم سريعاً!**\n\n\`${result}\``, { parse_mode: 'Markdown' });
        
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

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "أهلاً نبيل! النسخة السريعة جاهزة ⚡\nاستخدم `/create 1`");
});

bot.onText(/\/create (.+)/, async (msg, match) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت ديشتغل هسه.");
    const num = parseInt(match[1]);
    if (isNaN(num) || num <= 0) return bot.sendMessage(msg.chat.id, "اكتب رقم صحيح.");
    
    isProcessing = true;
    for (let i = 1; i <= num; i++) {
        await createAccount(msg.chat.id, i, num);
        await sleep(2000); // استراحة قصيرة جداً
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 كملت.");
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
