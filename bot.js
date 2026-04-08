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

async function generateRandomEmail(chatId) {
    try {
        const response = await axios.get("https://generator.email/", {
            headers: {
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "accept-encoding": "gzip, deflate, br"
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
        bot.sendMessage(chatId, `⚠️ خطأ بتوليد الإيميل: ${error.message}`);
        throw error;
    }
}

function generateRandomBirthday() {
    const today = new Date();
    const minYear = today.getFullYear() - 65;
    const maxYear = today.getFullYear() - 18;

    const year = Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;
    const month = Math.floor(Math.random() * 12) + 1;
    let maxDay = 31;

    if ([4, 6, 9, 11].includes(month)) maxDay = 30;
    else if (month === 2) maxDay = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28;

    const day = Math.floor(Math.random() * maxDay) + 1;
    return { year, month, day };
}

async function getVerificationCode(email, chatId, maxRetries = 10, delayMs = 3000) {
    const [username, domain] = email.split("@");
    let inboxUrl = `https://generator.email/${domain}/${username}`;

    try {
        const mainRes = await axios.get("https://generator.email/", {
            headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });
        const $ = cheerio.load(mainRes.data);
        const inboxLink = $("a[href*='inbox']").attr("href");
        if (inboxLink) {
            const match = inboxLink.match(/\/(inbox\d+)/);
            if (match) inboxUrl = `https://generator.email/${match[1]}/${domain}/${username}`;
        }
    } catch (e) {
        console.log("استخدام الرابط المباشر للإيميل...");
    }

    bot.sendMessage(chatId, `⏳ جاري انتظار كود التفعيل للإيميل...\nالرجاء الانتظار.`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await axios.get(inboxUrl, {
                headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
            });
            const $ = cheerio.load(response.data);
            
            const otpText = $("div.e7m.subj_div_45g45gg").text().trim() || $("body").text();
            const codeMatch = otpText.match(/\b\d{6}\b/);
            
            if (codeMatch) {
                const code = codeMatch[0];
                bot.sendMessage(chatId, `✅ تم استلام الكود: ${code}`);
                return code;
            }
        } catch (e) {
            // محاولة صامتة
        }
        await sleep(delayMs);
    }
    return null;
}

async function createAccount(chatId, currentAccountNum, totalAccounts) {
    const statusMsg = await bot.sendMessage(chatId, `⚙️ بدء إنشاء الحساب [${currentAccountNum}/${totalAccounts}]...`);
    
    const { email, firstName, lastName } = await generateRandomEmail(chatId);
    const fullName = `${firstName} ${lastName}`;
    const birthday = generateRandomBirthday();
    
    await bot.editMessageText(`📧 الإيميل المستخدم:\n${email}`, { chat_id: chatId, message_id: statusMsg.message_id });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_profile_'));
    let context;

    try {
        context = await firefox.launchPersistentContext(tempDir, {
            headless: true, // مهم جداً للسيرفرات (Railway)
            viewport: { width: 1366, height: 768 },
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
            ignoreHTTPSErrors: true,
            bypassCSP: true,
            extraHTTPHeaders: {
                "Accept-Language": "en-US,en;q=0.5"
            }
        });

        const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            delete navigator.__marionette;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
        });

        bot.sendMessage(chatId, "🌐 التوجه لموقع ChatGPT...");
        await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
        await sleep(2000);

        bot.sendMessage(chatId, "🖱️ جاري الضغط على Sign up...");
        try {
            const signupBtn = page.getByRole("button", { name: "Sign up" });
            await signupBtn.waitFor({ state: "visible", timeout: 10000 });
            await signupBtn.click({ force: true });
        } catch {
            await page.locator('button:has-text("Sign up")').click({ force: true });
        }
        
        await sleep(2000);

        const emailInput = page.getByRole("textbox", { name: "Email address" });
        await emailInput.waitFor({ state: "visible" });
        await emailInput.fill(email);
        await emailInput.blur();
        await sleep(1500);

        let continueBtn = page.getByRole("button", { name: "Continue", exact: true });
        await continueBtn.click({ force: true });
        await sleep(4000);

        bot.sendMessage(chatId, "🔑 جاري كتابة الباسورد...");
        const passInput = page.getByRole("textbox", { name: "Password" });
        await passInput.waitFor({ state: "visible" });
        await passInput.fill(DEFAULT_PASSWORD);
        await sleep(1500);

        continueBtn = page.getByRole("button", { name: "Continue" });
        await continueBtn.click({ force: true });
        
        await sleep(8000);
        const code = await getVerificationCode(email, chatId);
        if (!code) throw new Error("لم يتم استلام كود التفعيل.");

        const codeInput = page.getByRole("textbox", { name: "Code" });
        await codeInput.fill(code);
        await sleep(2000);

        try {
            await page.getByRole("button", { name: "Continue" }).click({ force: true });
        } catch (e) {}

        bot.sendMessage(chatId, "👤 جاري إدخال الاسم وتاريخ الميلاد...");
        const nameInput = page.getByRole("textbox", { name: "Full name" });
        await nameInput.waitFor({ state: "visible" });
        await nameInput.fill(fullName);
        await sleep(1000);

        const bdayString = `${String(birthday.month).padStart(2, '0')}${String(birthday.day).padStart(2, '0')}${birthday.year}`;
        await page.locator('xpath=/html/body/div[1]/div/fieldset/form/div[1]/div/div[2]/div/div/div/div').click();
        await sleep(500);
        await page.keyboard.type(bdayString, { delay: 100 });
        await sleep(1000);

        continueBtn = page.getByRole("button", { name: "Continue" });
        await continueBtn.click({ force: true });
        await sleep(5000);

        const accountData = `${email}|${DEFAULT_PASSWORD}`;
        fs.appendFileSync(ACCOUNTS_FILE, accountData + '\n');
        
        await bot.sendMessage(chatId, `✅ **تم إنشاء الحساب بنجاح!**\n\n\`${accountData}\``, { parse_mode: 'Markdown' });
        
        await context.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
        return true;

    } catch (error) {
        bot.sendMessage(chatId, `❌ **فشل إنشاء الحساب:**\n${error.message}`);
        if (context) await context.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
        return false;
    }
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (ADMIN_ID !== 0 && chatId !== ADMIN_ID) return bot.sendMessage(chatId, "عذراً، هذا البوت خاص.");
    
    bot.sendMessage(chatId, `هلا بيك! 🤖\nأني بوت متخصص بإنشاء حسابات ChatGPT تلقائياً.\n\nاستخدم الأمر التالي للبدء:\n\`/create 1\` لإنشاء حساب واحد\n\`/create 5\` لإنشاء 5 حسابات وهكذا.`, { parse_mode: 'Markdown' });
});

bot.onText(/\/create (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (ADMIN_ID !== 0 && chatId !== ADMIN_ID) return;

    if (isProcessing) {
        return bot.sendMessage(chatId, "⚠️ البوت مشغول حالياً بإنشاء حسابات. انتظر لحد ما يخلص.");
    }

    const numAccounts = parseInt(match[1]);
    if (isNaN(numAccounts) || numAccounts <= 0) {
        return bot.sendMessage(chatId, "رجاءً اكتب رقم صحيح. مثلاً: /create 3");
    }

    isProcessing = true;
    bot.sendMessage(chatId, `🚀 تم استلام الطلب! سيتم البدء بإنشاء ${numAccounts} حساب(ات) بالتسلسل.`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 1; i <= numAccounts; i++) {
        const success = await createAccount(chatId, i, numAccounts);
        if (success) successCount++;
        else failCount++;

        if (i < numAccounts) {
            bot.sendMessage(chatId, "⏳ استراحة قصيرة قبل الحساب التالي...");
            await sleep(5000);
        }
    }

    isProcessing = false;
    bot.sendMessage(chatId, `📊 **ملخص العملية:**\n\n✅ ناجح: ${successCount}\n❌ فاشل: ${failCount}\n\nتم حفظ الحسابات في السيرفر.`, { parse_mode: 'Markdown' });
});

console.log("🤖 البوت يعمل الآن على Railway...");
