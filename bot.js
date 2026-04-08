const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright-extra'); 
const stealth = require('puppeteer-extra-plugin-stealth')();
const axios = require('axios');
const cheerio = require('cheerio');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// تفعيل إضافات التخفي الاحترافية
chromium.use(stealth);

// جلب التوكن من Railway (يجب إضافته في Variables)
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ خطأ: BOT_TOKEN مفقود في إعدادات Railway.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;

// متغير عالمي لحفظ البروكسي الديناميكي
let activeProxy = null; 

// دوال مساعدة احترافية
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// حل مشكلة (image_4.png): توليد باسورد قوي جداً ومضمون الطول (+16 حرف)
function generateSecurePassword() {
    const length = 16;
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const nums = "0123456789";
    const symbols = "!@#$%^&*";
    const all = lower + upper + nums + symbols;
    
    let password = "";
    // ضمان وجود حرف كبـير، حرف صغير، رقم، ورمز
    password += lower[crypto.randomInt(0, lower.length)];
    password += upper[crypto.randomInt(0, upper.length)];
    password += nums[crypto.randomInt(0, nums.length)];
    password += symbols[crypto.randomInt(0, symbols.length)];
    
    // إكمال الباقي عشوائياً
    for (let i = 0; i < length - 4; i++) {
        password += all[crypto.randomInt(0, all.length)];
    }
    
    // خلط الباسورد لزيادة العشوائية
    return password.split('').sort(() => 0.5 - Math.random()).join('');
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

async function getVerificationCode(email, maxRetries = 20) {
    const [username, domain] = email.split("@");
    const inboxUrl = `https://generator.email/${domain}/${username}`;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await axios.get(inboxUrl, { headers: { "user-agent": "Mozilla/5.0" } });
            const $ = cheerio.load(res.data);
            // محاولة جلب الكود من أماكن مختلفة بالإيميل
            const codeMatch = $("body").text().match(/\b\d{6}\b/) || $("#email_content").text().match(/\b\d{6}\b/);
            if (codeMatch) return codeMatch[0];
        } catch (e) {}
        await sleep(5000);
    }
    return null;
}

// دالة لمحاكاة حركة البشر (Scrolling & Mouse)
async function simulateHumanActivity(page) {
    try {
        // Scroll عشوائي
        await page.mouse.wheel(0, 500);
        await sleep(randomFloat(500, 1000));
        await page.mouse.wheel(0, -200);
        await sleep(randomFloat(500, 1000));
        
        // تحريك الماوس لمكان عشوائي
        const width = await page.evaluate(() => window.innerWidth);
        const height = await page.evaluate(() => window.innerHeight);
        await page.mouse.move(randomFloat(0, width), randomFloat(0, height), { steps: 10 });
    } catch (e) {}
}
const randomFloat = (min, max) => Math.random() * (max - min) + min;

// ==========================================
// عملية إنشاء الحساب الاحترافية (حلالة المشاكل)
// ==========================================
async function createAccount(chatId, currentNum, total) {
    const statusMsg = await bot.sendMessage(chatId, `⚙️ جاري العمل على الحساب [${currentNum}/${total}]...`);
    
    let email, password;
    try {
        email = await generateRandomEmail();
        password = generateSecurePassword(); // حل مشكلة (image_4.png)
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
            headless: true, // مهم جداً لسيرفر Railway
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1366,768',
                '--lang=en-US,en;q=0.9'
            ],
            ignoreDefaultArgs: ["--enable-automation"],
            viewport: { width: 1366, height: 768 }
        };

        // استخدام البروكسي الديناميكي إذا كان مفعلاً
        if (activeProxy) {
            bot.sendMessage(chatId, `🌍 الاتصال عبر بروكسي الفلبين...`);
            browserOptions.proxy = { server: activeProxy.server };
            if (activeProxy.username && activeProxy.password) {
                browserOptions.proxy.username = activeProxy.username;
                browserOptions.proxy.password = activeProxy.password;
            }
        }

        context = await chromium.launchPersistentContext(tempDir, browserOptions);
        page = await context.newPage();

        // التوجه المباشر لصفحة التسجيل لتفادي صفحة (image_7.png)
        bot.sendMessage(chatId, "🌐 فتح صفحة ChatGPT...");
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(5000);

        // حل مشكلة (image_5.png): تجاوز Cloudflare بذكاء
        bot.sendMessage(chatId, "🛡️ تجاوز حماية Cloudflare...");
        await simulateHumanActivity(page);
        try {
            const cfCheckbox = page.frameLocator('iframe[title*="Cloudflare"]').locator('input[type="checkbox"]');
            if (await cfCheckbox.isVisible({ timeout: 8000 })) {
                await cfCheckbox.click();
                bot.sendMessage(chatId, "✅ تم الضغط على التحقق.");
                await sleep(5000); // انتظار التخطي
            }
        } catch(e) {}

        // حل مشكلة (image_7.png): التعامل مع صفحة "More options"
        if (await page.isVisible('button:has-text("More options")')) {
            bot.sendMessage(chatId, "👆 صفحة خيارات إضافية، جاري الضغط على Sign up...");
            await page.click('button:has-text("More options")');
            await sleep(2000);
            await page.click('button:has-text("Sign up")');
            await sleep(4000);
        } else {
            // الضغط الطبيعي على Sign up
            await page.click('button:has-text("Sign up")', { timeout: 15000 }).catch(() => {});
            await sleep(3000);
        }

        // كتابة الإيميل ببطء
        await bot.sendMessage(chatId, "✍️ كتابة الإيميل...");
        const emailInput = page.locator('input[id="email-input"], input[name="email"]');
        await emailInput.waitFor({ state: 'visible', timeout: 20000 });
        await emailInput.fill(email);
        await sleep(1000);
        await page.keyboard.press('Enter');
        
        // كتابة الباسورد ببطء (image_4.png محلولة بفضل generateSecurePassword)
        await bot.sendMessage(chatId, "🔑 كتابة الباسورد...");
        await sleep(6000); // انتظار تحميل الصفحة
        const passInput = page.locator('input[type="password"]');
        await passInput.waitFor({ state: 'visible', timeout: 20000 });
        await passInput.fill(password);
        await sleep(1000);
        await passInput.press('Enter');

        // حل مشكلة (image_6.png): كشف فشل الإنشاء فوراً
        await sleep(5000);
        if (await page.isVisible('div:has-text("Failed to create account")')) {
            throw new Error("سيرفر ChatGPT رفض الإنشاء (غالباً حظر IP لآي بي السيرفر).");
        }

        // مرحلة كود التفعيل (image_8.png)
        await bot.sendMessage(chatId, "⏳ انتظار كود التفعيل...");
        const code = await getVerificationCode(email);
        if (!code) throw new Error("لم يصل كود التفعيل للإيميل (انتهى الوقت).");

        await bot.sendMessage(chatId, `✅ كود التفعيل: \`${code}\``, { parse_mode: 'Markdown' });
        const codeInput = page.locator('input[aria-label="Verification code"], input[type="text"]');
        await codeInput.waitFor({ state: 'visible' });
        await codeInput.fill(code);
        await sleep(4000);

        // إدخال الاسم
        try {
            const nameInput = page.locator('input[name="name"]');
            if (await nameInput.isVisible({ timeout: 10000 })) {
                await nameInput.fill(fullName);
                await sleep(1000);
                await page.keyboard.press('Enter');
                await sleep(5000);
            }
        } catch(e) {}

        // حفظ النتيجة النهائية
        const result = `${email}|${password}`;
        fs.appendFileSync(accountsPath, result + '\n');
        await bot.sendMessage(chatId, `🎉 **تم إنشاء الحساب بنجاح!**\n\n\`${result}\``, { parse_mode: 'Markdown' });
        
        await context.close();
        return true;

    } catch (error) {
        await bot.sendMessage(chatId, `❌ فشل الحساب: ${error.message}`);
        
        // تصوير الشاشة النهائي لمعرفة الحالة
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

// ================= أوامر البوت الأساسية =================

bot.onText(/\/start/, (msg) => {
    const text = `أهلاً نبيل! البوت يعمل الآن بكفاءة ✅\n\n` +
                 `🔹 إنشاء حسابات: \`/create 1\`\n` +
                 `🔹 وضع بروكسي (الفلبين): \`/setproxy IP:PORT\`\n` +
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
        await sleep(5000); // استراحة بـين الحسابات
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 اكتملت العملية.");
});
