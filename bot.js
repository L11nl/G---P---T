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

// ✅ توليد إيميل سريع مع timeout لعدم التعليق
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
        // استخدام Promise.race لتحديد مهلة 5 ثواني
        const response = await Promise.race([
            axios.get(`${API_BASE_URL}/api/public/rooms/master/domains`, { headers, timeout: 5000 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('API timeout')), 6000))
        ]);

        let domains = response.data?.success && response.data?.domains ? response.data.domains : ["usmail.my.id", "toolsmail.me"];
        const domain = domains[Math.floor(Math.random() * domains.length)];
        return { email: `${username}@${domain}`, username };
    } catch (error) {
        await bot.sendMessage(chatId, `⚠️ تعذر الاتصال بـ API الإيميل، استخدام نطاق احتياطي.`);
        return { email: `${username}@usmail.my.id`, username };
    }
}

// ✅ جلب الكود كل 0.5 ثانية
async function getVerificationCode(username, chatId, maxRetries = 80) {
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
                await bot.sendMessage(chatId, `📩 **تم استخراج الكود:** \`${code}\``, { parse_mode: 'Markdown' });
                return code;
            }

            if (res.data?.success && Array.isArray(res.data.messages)) {
                for (const msg of res.data.messages) {
                    const combined = `${msg.subject || ''} ${msg.text || ''} ${msg.html || ''}`;
                    const match = combined.match(/\b\d{6}\b/);
                    if (match) {
                        await bot.sendMessage(chatId, `📩 **تم استخراج الكود:** \`${match[0]}\``, { parse_mode: 'Markdown' });
                        return match[0];
                    }
                }
            }
        } catch (e) {}
        await sleep(500);
    }
    return null;
}

// ✅ بث مباشر حقيقي (تعديل نفس الرسالة)
function startLiveStream(page, chatId, intervalMs = 500) {
    let messageId = null;
    let stopped = false;
    let timer = null;

    const updateFrame = async () => {
        if (stopped || !page || page.isClosed()) return;
        try {
            const screenshotPath = path.join(__dirname, `live_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });

            if (!messageId) {
                const sent = await bot.sendPhoto(chatId, screenshotPath, {
                    caption: '🔴 بث مباشر | جاري العمل...'
                });
                messageId = sent.message_id;
            } else {
                await bot.editMessageMedia(
                    {
                        type: 'photo',
                        media: `attach://${path.basename(screenshotPath)}`,
                        caption: '🔴 بث مباشر | جاري العمل...'
                    },
                    {
                        chat_id: chatId,
                        message_id: messageId
                    }
                ).catch(async (err) => {
                    if (err.response?.statusCode === 400) {
                        const sent = await bot.sendPhoto(chatId, screenshotPath, {
                            caption: '🔴 بث مباشر | جاري العمل...'
                        });
                        messageId = sent.message_id;
                    }
                });
            }
            fs.unlinkSync(screenshotPath);
        } catch (err) {}
    };

    updateFrame();
    timer = setInterval(updateFrame, intervalMs);

    return { stop: () => { stopped = true; clearInterval(timer); } };
}

// محاكاة نشاط بشري
async function simulateHumanActivityFast(page) {
    try {
        await page.mouse.wheel(0, 300);
        await sleep(300);
        await page.mouse.move(500, 400, { steps: 3 });
    } catch (e) {}
}

// الدالة الرئيسية لإنشاء الحساب
async function createAccount(chatId, currentNum, total) {
    const statusMsg = await bot.sendMessage(chatId, `⚡ جاري العمل على [${currentNum}/${total}]...`);

    // === المرحلة 1: توليد البيانات ===
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

    await bot.editMessageText(`📧 \`${email}\`\n🔑 \`${password}\`\n🚀 جاري فتح المتصفح...`, {
        chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown'
    });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_fast_'));
    let context, page;
    let liveStream = null;

    try {
        // === المرحلة 2: فتح المتصفح ===
        const browserOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1366, height: 768 },
            timeout: 30000 // timeout للإطلاق
        };
        if (activeProxy) browserOptions.proxy = { server: activeProxy.server };

        // نستخدم Promise.race لعدم التعليق
        context = await Promise.race([
            chromium.launchPersistentContext(tempDir, browserOptions),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout أثناء فتح المتصفح')), 40000))
        ]);
        
        page = await context.newPage();
        await bot.editMessageText(`🌐 تم فتح المتصفح، جاري تحميل صفحة ChatGPT...`, {
            chat_id: chatId, message_id: statusMsg.message_id
        });

        // === بدء البث الحي بعد التأكد من وجود page ===
        liveStream = startLiveStream(page, chatId, 600);

        // === المرحلة 3: تحميل صفحة التسجيل ===
        await Promise.race([
            page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 45000 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout أثناء تحميل صفحة ChatGPT')), 50000))
        ]);

        await simulateHumanActivityFast(page);
        await bot.editMessageText(`🖱️ الضغط على زر Sign up...`, { chat_id: chatId, message_id: statusMsg.message_id });

        // النقر على Sign up
        const signupBtn = page.locator('button:has-text("Sign up")');
        await signupBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
            throw new Error('زر Sign up غير موجود');
        });
        await signupBtn.click();

        // إدخال الإيميل
        await bot.editMessageText(`📝 إدخال الإيميل...`, { chat_id: chatId, message_id: statusMsg.message_id });
        const emailInput = page.locator('input[id="email-input"], input[name="email"]');
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });
        await emailInput.fill(email);
        await page.keyboard.press('Enter');

        // إدخال كلمة المرور
        await bot.editMessageText(`🔐 إدخال كلمة المرور...`, { chat_id: chatId, message_id: statusMsg.message_id });
        const passInput = page.locator('input[type="password"]');
        await passInput.waitFor({ state: 'visible', timeout: 15000 });
        await passInput.fill(password);
        await page.keyboard.press('Enter');

        await sleep(3000);

        // التحقق من خطأ سريع
        try {
            await page.waitForSelector('text="Failed to create account"', { timeout: 3000 });
            throw new Error("الحساب مرفوض من السيرفر (حظر مؤقت).");
        } catch (e) {
            if (e.message.includes("مرفوض")) throw e;
        }

        await bot.editMessageText(`⏳ في انتظار وصول كود التحقق إلى الإيميل...`, { chat_id: chatId, message_id: statusMsg.message_id });

        // جلب الكود
        let code = await getVerificationCode(username, chatId, 80);

        if (!code) {
            const resendBtn = page.locator('button:has-text("Resend email")');
            if (await resendBtn.isVisible().catch(() => false)) {
                await resendBtn.click();
                await bot.sendMessage(chatId, "🔄 ضغطنا إعادة إرسال الكود...");
                code = await getVerificationCode(username, chatId, 40);
            }
        }

        if (!code) throw new Error("لم يتم استلام الكود بعد محاولات كثيرة.");

        // إدخال الكود
        await bot.editMessageText(`✏️ إدخال الكود \`${code}\`...`, {
            chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown'
        });

        const codeSelectors = [
            'input[aria-label="Verification code"]',
            'input[inputmode="numeric"]',
            'input[placeholder*="code" i]',
            'input[placeholder*="verification" i]',
            'input[type="text"]',
            'input[type="number"]'
        ];

        let filled = false;
        for (const sel of codeSelectors) {
            try {
                const input = await page.waitForSelector(sel, { timeout: 3000 });
                if (input) {
                    await input.click({ clickCount: 3 });
                    await input.fill(code);
                    filled = true;
                    break;
                }
            } catch {}
        }

        if (!filled) {
            await page.keyboard.press('Tab');
            await page.keyboard.type(code);
        }

        // الاسم
        await sleep(2000);
        const nameInput = await page.waitForSelector('input[name="name"]', { timeout: 10000 }).catch(() => null);
        if (nameInput) {
            await nameInput.fill(fullName);
            await page.keyboard.press('Enter');
            await sleep(3000);
        }

        // حفظ الحساب
        const result = `${email}|${password}`;
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
        await bot.sendMessage(chatId, `✅ **تم إنشاء الحساب بنجاح:**\n\`${result}\``, { parse_mode: 'Markdown' });

        if (liveStream) liveStream.stop();
        await context.close();
        return true;

    } catch (error) {
        await bot.sendMessage(chatId, `❌ خطأ أثناء التنفيذ: ${error.message}`);
        if (page) {
            try {
                const errPath = path.join(tempDir, 'error.png');
                await page.screenshot({ path: errPath, fullPage: true });
                await bot.sendPhoto(chatId, errPath, { caption: '📸 لقطة للخطأ' });
            } catch {}
        }
        if (liveStream) liveStream.stop();
        if (context) await context.close();
        return false;
    } finally {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
}

// === أوامر البوت ===
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 أهلاً! استخدم `/create 1` لإنشاء حساب ChatGPT مع بث مباشر للشاشة.");
});

bot.onText(/\/create (.+)/, async (msg, match) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت مشغول حالياً.");
    const num = parseInt(match[1]);
    if (isNaN(num) || num <= 0) return bot.sendMessage(msg.chat.id, "يرجى كتابة رقم صحيح.");

    isProcessing = true;
    for (let i = 1; i <= num; i++) {
        await createAccount(msg.chat.id, i, num);
        await sleep(2000);
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 اكتملت جميع العمليات.");
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
