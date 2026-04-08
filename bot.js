const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright-extra'); 
const stealth = require('puppeteer-extra-plugin-stealth')();
const axios = require('axios');
const cheerio = require('cheerio'); // ما زلنا نحتاجها إذا احتجناها مستقبلاً، لكن الإيميل الجديد لا يحتاجها
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
    
    for (let i = 0; i < length - 4; i++) {
        password += all[crypto.randomInt(0, all.length)];
    }
    return password.split('').sort(() => 0.5 - Math.random()).join('');
}

// ==========================================
// 1. التحديث الجديد: استخدام API موقع 1secmail لتوليد الإيميل
// ==========================================
async function generateRandomEmail() {
    try {
        // سحب قائمة الدومينات الشغالة حالياً من الموقع
        const response = await axios.get("https://www.1secmail.com/api/v1/?action=getDomainList");
        const domains = response.data;
        const domain = domains[Math.floor(Math.random() * domains.length)];
        const username = `${faker.person.firstName()}${faker.person.lastName()}${crypto.randomBytes(3).toString('hex')}`.toLowerCase();
        
        return `${username}@${domain}`;
    } catch (error) {
        // قائمة احتياطية في حال فشل الاتصال
        const fallbackDomains = ["1secmail.com", "1secmail.org", "1secmail.net", "kzccv.com"];
        const domain = fallbackDomains[Math.floor(Math.random() * fallbackDomains.length)];
        const username = `${faker.person.firstName()}${faker.person.lastName()}${crypto.randomBytes(3).toString('hex')}`.toLowerCase();
        
        return `${username}@${domain}`;
    }
}

// ==========================================
// 2. التحديث الجديد: جلب كود التفعيل عبر API بشكل صاروخي
// ==========================================
async function getVerificationCode(email, maxRetries = 20) {
    const [username, domain] = email.split("@");
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            // فحص صندوق الوارد
            const inboxRes = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${username}&domain=${domain}`);
            const messages = inboxRes.data;

            if (messages && messages.length > 0) {
                // سحب رقم تعريف أول رسالة (أحدث رسالة)
                const msgId = messages[0].id;
                
                // فتح الرسالة وقراءة محتواها
                const msgRes = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${username}&domain=${domain}&id=${msgId}`);
                const content = msgRes.data.textBody || msgRes.data.body || "";

                // استخراج الكود المكون من 6 أرقام
                const codeMatch = content.match(/\b\d{6}\b/);
                if (codeMatch) {
                    return codeMatch[0];
                }
            }
        } catch (e) {
            console.log("جارٍ انتظار الرسالة...");
        }
        await sleep(4000); // الانتظار 4 ثواني قبل الفحص مرة ثانية
    }
    return null;
}

async function simulateHumanActivity(page) {
    try {
        await page.mouse.wheel(0, 500);
        await sleep(randomFloat(500, 1000));
        await page.mouse.wheel(0, -200);
        await sleep(randomFloat(500, 1000));
        const width = await page.evaluate(() => window.innerWidth);
        const height = await page.evaluate(() => window.innerHeight);
        await page.mouse.move(randomFloat(0, width), randomFloat(0, height), { steps: 10 });
    } catch (e) {}
}
const randomFloat = (min, max) => Math.random() * (max - min) + min;

async function createAccount(chatId, currentNum, total) {
    const statusMsg = await bot.sendMessage(chatId, `⚙️ جاري العمل على الحساب [${currentNum}/${total}]...`);
    
    let email, password;
    try {
        email = await generateRandomEmail();
        password = generateSecurePassword();
    } catch (e) {
        await bot.editMessageText(`❌ خطأ في توليد البيانات: ${e.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
        return false;
    }

    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    const accountsPath = path.join(__dirname, ACCOUNTS_FILE);
    
    await bot.editMessageText(`📧 إيميل: \`${email}\`\n🔑 باسورد: \`${password}\`\n👤 الاسم: ${fullName}`, {
        chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown'
    });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_profile_'));
    let context, page;

    try {
        const browserOptions = {
            headless: true,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', 
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars', '--window-size=1366,768',
                '--lang=en-US,en;q=0.9'
            ],
            ignoreDefaultArgs: ["--enable-automation"],
            viewport: { width: 1366, height: 768 }
        };

        if (activeProxy) {
            browserOptions.proxy = { server: activeProxy.server };
            if (activeProxy.username && activeProxy.password) {
                browserOptions.proxy.username = activeProxy.username;
                browserOptions.proxy.password = activeProxy.password;
            }
        }

        context = await chromium.launchPersistentContext(tempDir, browserOptions);
        page = await context.newPage();

        bot.sendMessage(chatId, "🌐 فتح صفحة ChatGPT...");
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(5000);

        await simulateHumanActivity(page);
        try {
            const cfCheckbox = page.frameLocator('iframe[title*="Cloudflare"]').locator('input[type="checkbox"]');
            if (await cfCheckbox.isVisible({ timeout: 8000 })) {
                await cfCheckbox.click();
                await sleep(5000);
            }
        } catch(e) {}

        if (await page.isVisible('button:has-text("More options")')) {
            await page.click('button:has-text("More options")');
            await sleep(2000);
            await page.click('button:has-text("Sign up")');
            await sleep(4000);
        } else {
            await page.click('button:has-text("Sign up")', { timeout: 15000 }).catch(() => {});
            await sleep(3000);
        }

        const emailInput = page.locator('input[id="email-input"], input[name="email"]');
        await emailInput.waitFor({ state: 'visible', timeout: 20000 });
        await emailInput.fill(email);
        await sleep(1000);
        await page.keyboard.press('Enter');
        
        await bot.sendMessage(chatId, "🔑🖤 كتابة الباسورد...");
        await sleep(6000);
        const passInput = page.locator('input[type="password"]');
        await passInput.waitFor({ state: 'visible', timeout: 20000 });
        await passInput.fill(password);
        await sleep(1000);
        await passInput.press('Enter');

        await sleep(5000);
        if (await page.isVisible('div:has-text("Failed to create account")') || await page.isVisible('text="Failed to create account"')) {
            throw new Error("سيرفر ChatGPT رفض الإنشاء (تم حظر هذا الدومين أو الآي بي).");
        }

        await bot.sendMessage(chatId, "⏳ انتظار كود التفعيل (المحاولة الأولى)...");
        let code = await getVerificationCode(email, 15);

        if (!code) {
            await bot.sendMessage(chatId, "⚠️ الكود تأخر، جاري الضغط على Resend email...");
            try {
                const resendBtn = page.locator('button:has-text("Resend email"), a:has-text("Resend email")');
                if (await resendBtn.isVisible({ timeout: 5000 })) {
                    await resendBtn.click();
                    await sleep(3000);
                    await bot.sendMessage(chatId, "⏳ انتظار الكود (المحاولة الثانية)...");
                    code = await getVerificationCode(email, 15);
                } else {
                    bot.sendMessage(chatId, "لم يتم العثور على زر إعادة الإرسال، جاري الانتظار قليلاً...");
                    code = await getVerificationCode(email, 5);
                }
            } catch (e) {
                console.log("خطأ في الضغط على إعادة الإرسال", e);
            }
        }

        if (!code) throw new Error("لم يصل كود التفعيل حتى بعد إعادة الإرسال.");

        await bot.sendMessage(chatId, `✅ كود التفعيل: \`${code}\``, { parse_mode: 'Markdown' });
        const codeInput = page.locator('input[aria-label="Verification code"], input[type="text"]');
        await codeInput.waitFor({ state: 'visible' });
        await codeInput.fill(code);
        await sleep(4000);

        try {
            const nameInput = page.locator('input[name="name"]');
            if (await nameInput.isVisible({ timeout: 10000 })) {
                await nameInput.fill(fullName);
                await sleep(1000);
                await page.keyboard.press('Enter');
                await sleep(5000);
            }
        } catch(e) {}

        const result = `${email}|${password}`;
        fs.appendFileSync(accountsPath, result + '\n');
        await bot.sendMessage(chatId, `🎉 **تم إنشاء الحساب بنجاح!**\n\n\`${result}\``, { parse_mode: 'Markdown' });
        
        await context.close();
        return true;

    } catch (error) {
        await bot.sendMessage(chatId, `❌ فشل الحساب: ${error.message}`);
        
        if (page) {
            try {
                const scPath = path.join(tempDir, 'fail.png');
                await page.screenshot({ path: scPath });
                await bot.sendPhoto(chatId, scPath, { caption: `آخر حالة للصفحة قبل الفشل` });
            } catch(e) {}
        }
        if (context) await context.close();
        return false;
    } finally {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }
}

bot.onText(/\/start/, (msg) => {
    const text = `أهلاً بيك! البوت محدث لأحدث إصدار ✅\n\n` +
                 `🔹 إنشاء حسابات: \`/create 1\`\n` +
                 `🔹 وضع بروكسي: \`/setproxy IP:PORT\`\n` +
                 `🔹 إيقاف البروكسي: \`/clearproxy\``;
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/setproxy (.+)/, (msg, match) => {
    let server = match[1].trim();
    if (!server.startsWith('http://')) server = 'http://' + server;
    activeProxy = { server };
    bot.sendMessage(msg.chat.id, `✅ تم تفعيل البروكسي: \`${server}\`\nسيتم استخدامه في الحساب القادم.`, { parse_mode: 'Markdown' });
});

bot.onText(/\/clearproxy/, (msg) => {
    activeProxy = null;
    bot.sendMessage(msg.chat.id, "🗑️ تم إيقاف البروكسي. البوت سيعمل الآن مباشرة من السيرفر.");
});

bot.onText(/\/create (.+)/, async (msg, match) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت مشغول حالياً، انتظر من فضلك.");
    const num = parseInt(match[1]);
    if (isNaN(num) || num <= 0) return bot.sendMessage(msg.chat.id, "اكتب رقم صحيح (مثال: /create 3).");
    
    isProcessing = true;
    for (let i = 1; i <= num; i++) {
        await createAccount(msg.chat.id, i, num);
        await sleep(5000); 
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 اكتملت العملية.");
});
