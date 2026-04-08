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

const API_BASE_URL = 'https://usmail.my.id';
const API_LICENSE_KEY = 'USMAIL-166T-DEMO';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// توليد كلمة مرور آمنة
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

// توليد إيميل سريع
async function generateRandomEmail(chatId) {
    const username = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(3).toString('hex')}`;
    const headers = {
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'X-License-Key': API_LICENSE_KEY,
        'Referer': `${API_BASE_URL}/room/master`
    };

    try {
        const response = await Promise.race([
            axios.get(`${API_BASE_URL}/api/public/rooms/master/domains`, { headers, timeout: 5000 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('API timeout')), 6000))
        ]);

        let domains = response.data?.success && response.data?.domains ? response.data.domains : ["usmail.my.id", "toolsmail.me"];
        const domain = domains[Math.floor(Math.random() * domains.length)];
        return { email: `${username}@${domain}`, username };
    } catch (error) {
        await bot.sendMessage(chatId, `⚠️ تعذر الاتصال بـ API الإيميل، تم استخدام نطاق احتياطي.`);
        return { email: `${username}@usmail.my.id`, username };
    }
}

// جلب الكود من الإيميل بسرعة
async function getVerificationCode(username, chatId, maxRetries = 40) {
    const headers = {
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'X-License-Key': API_LICENSE_KEY,
        'Referer': `${API_BASE_URL}/room/${username}`
    };
    const messagesUrl = `${API_BASE_URL}/api/public/rooms/${username}/messages`;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await axios.get(messagesUrl, { headers, timeout: 3000 });
            const responseText = JSON.stringify(res.data);
            
            const matches = [...responseText.matchAll(/\b\d{6}\b/g)];
            if (matches.length > 0) {
                const code = matches[matches.length - 1][0];
                await bot.sendMessage(chatId, `📩 **تم سحب الكود من الإيميل:** \`${code}\``, { parse_mode: 'Markdown' });
                return code;
            }
        } catch (e) {}
        await sleep(1500); // فحص سريع كل ثانية ونصف
    }
    return null;
}

// نظام البث المباشر (بتعديل نفس الصورة بدون سبام)
function startLiveStream(page, chatId, intervalMs = 2000) {
    let messageId = null;
    let stopped = false;
    let timer = null;

    const updateFrame = async () => {
        if (stopped || !page || page.isClosed()) return;
        try {
            const screenshotPath = path.join(__dirname, `live_${chatId}_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath });

            if (!messageId) {
                const sent = await bot.sendPhoto(chatId, screenshotPath, {
                    caption: '🔴 بث مباشر | المتصفح يعمل الآن...'
                });
                messageId = sent.message_id;
            } else {
                // تعديل نفس الرسالة بصورة جديدة
                try {
                    await bot.editMessageMedia(
                        {
                            type: 'photo',
                            media: fs.createReadStream(screenshotPath)
                        },
                        {
                            chat_id: chatId,
                            message_id: messageId
                        }
                    );
                } catch (err) {
                    // تجاهل أخطاء التعديل المتكرر التي يفرضها تليجرام
                }
            }
            // حذف الصورة من السيرفر بعد إرسالها لتوفير المساحة
            if (fs.existsSync(screenshotPath)) {
                fs.unlinkSync(screenshotPath);
            }
        } catch (err) {}
    };

    updateFrame();
    // تليجرام يقبل تعديل الرسائل كل ثانيتين تقريباً لتجنب الحظر
    timer = setInterval(updateFrame, intervalMs);

    return { stop: () => { stopped = true; clearInterval(timer); } };
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
        await bot.editMessageText(`⚙️ جاري توليد الإيميل...`, { chat_id: chatId, message_id: statusMsg.message_id });
        emailData = await generateRandomEmail(chatId);
        password = generateSecurePassword();
    } catch (e) {
        await bot.editMessageText(`❌ فشل توليد الإيميل: ${e.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
        return false;
    }

    const { email, username } = emailData;
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;

    await bot.editMessageText(`📧 \`${email}\`\n🔑 \`${password}\`\n🚀 جاري تشغيل المتصفح...`, {
        chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown'
    });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_fast_'));
    let context, page;
    let liveStream = null;

    try {
        const browserOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1366, height: 768 }
        };
        if (activeProxy) browserOptions.proxy = { server: activeProxy.server };

        context = await chromium.launchPersistentContext(tempDir, browserOptions);
        page = await context.newPage();

        // بدء البث المباشر للشاشة
        liveStream = startLiveStream(page, chatId, 2000);

        await bot.editMessageText(`🌐 جاري تحميل صفحة ChatGPT...`, { chat_id: chatId, message_id: statusMsg.message_id });
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 45000 });

        await simulateHumanActivityFast(page);

        // الضغط على زر التسجيل
        const signupBtn = page.locator('button:has-text("Sign up")');
        await signupBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        if (await signupBtn.isVisible()) await signupBtn.click();

        // إدخال الإيميل
        await bot.editMessageText(`📝 جاري كتابة الإيميل...`, { chat_id: chatId, message_id: statusMsg.message_id });
        const emailInput = page.locator('input[id="email-input"], input[name="email"]');
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });
        await emailInput.fill(email);
        await page.keyboard.press('Enter');

        // إدخال الباسورد
        await bot.editMessageText(`🔐 جاري كتابة كلمة المرور...`, { chat_id: chatId, message_id: statusMsg.message_id });
        const passInput = page.locator('input[type="password"]');
        await passInput.waitFor({ state: 'visible', timeout: 15000 });
        await passInput.fill(password);
        await page.keyboard.press('Enter');

        await sleep(3000);

        // التحقق من الحظر
        try {
            await page.waitForSelector('text="Failed to create account"', { timeout: 3000 });
            throw new Error("الحساب مرفوض من السيرفر (حظر مؤقت).");
        } catch (e) {
            if (e.message.includes("مرفوض")) throw e;
        }

        // سحب الكود من الإيميل (في الخلفية)
        await bot.editMessageText(`⏳ جاري فحص صندوق الوارد لنسخ الكود...`, { chat_id: chatId, message_id: statusMsg.message_id });
        let code = await getVerificationCode(username, chatId, 40);

        if (!code) {
            const resendBtn = page.locator('button:has-text("Resend email")');
            if (await resendBtn.isVisible().catch(() => false)) {
                await resendBtn.click();
                await bot.sendMessage(chatId, "🔄 تأخر الكود، تم الضغط على إعادة الإرسال...");
                code = await getVerificationCode(username, chatId, 20);
            }
        }

        if (!code) throw new Error("لم يتم استلام الكود نهائياً.");

        // إدخال الكود في مربعات ChatGPT
        await bot.editMessageText(`✏️ جاري لصق الكود في المتصفح...`, { chat_id: chatId, message_id: statusMsg.message_id });
        const codeInput = page.locator('input[aria-label="Verification code"], input[type="text"]');
        await codeInput.waitFor({ state: 'visible' }).catch(() => {});
        
        // النقر على أول مربع وكتابة الكود بالكيبورد ليتوزع على المربعات الـ 6
        await page.mouse.click(500, 400); // محاولة تنشيط الصفحة
        await page.keyboard.type(code, { delay: 100 });
        
        await sleep(3000);

        // إدخال الاسم إذا طلبه
        const nameInput = page.locator('input[name="name"]');
        await nameInput.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
        if (await nameInput.isVisible()) {
            await nameInput.fill(fullName);
            await page.keyboard.press('Enter');
            await sleep(4000);
        }

        // حفظ الحساب وإرساله بشكل نظيف
        const result = `${email}|${password}`;
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
        await bot.sendMessage(chatId, `\`${result}\``, { parse_mode: 'Markdown' });

        if (liveStream) liveStream.stop();
        await context.close();
        return true;

    } catch (error) {
        await bot.sendMessage(chatId, `❌ توقف العمل: ${error.message}`);
        
        // أخذ صورة نهائية للخطأ
        if (page) {
            try {
                const errPath = path.join(tempDir, 'error_final.png');
                await page.screenshot({ path: errPath, fullPage: true });
                await bot.sendPhoto(chatId, errPath, { caption: '📸 الشاشة وقت حدوث المشكلة:' });
            } catch {}
        }
        
        if (liveStream) liveStream.stop();
        if (context) await context.close();
        return false;
    } finally {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "أهلاً! البوت محدث ويدعم البث المباشر الذكي 📺\nاستخدم `/create 1`");
});

bot.onText(/\/create (.+)/, async (msg, match) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت يعمل على حساب حالياً.");
    const num = parseInt(match[1]);
    if (isNaN(num) || num <= 0) return bot.sendMessage(msg.chat.id, "اكتب رقم صحيح.");

    isProcessing = true;
    for (let i = 1; i <= num; i++) {
        await createAccount(msg.chat.id, i, num);
        await sleep(2000);
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 انتهت العملية.");
});

bot.onText(/\/setproxy (.+)/, (msg, match) => {
    let server = match[1].trim();
    if (!server.startsWith('http://')) server = 'http://' + server;
    activeProxy = { server };
    bot.sendMessage(msg.chat.id, `✅ تم تفعيل البروكسي: \`${server}\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/clearproxy/, (msg) => {
    activeProxy = null;
    bot.sendMessage(msg.chat.id, "🗑️ تم إيقاف البروكسي.");
});
