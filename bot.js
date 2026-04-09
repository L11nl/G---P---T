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

// ========== إعدادات API الجديد (Mail.tm) ==========
const MAIL_API = 'https://api.mail.tm';

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

// ✅ إنشاء حساب بريد مؤقت على Mail.tm
async function createMailTmAccount(chatId) {
    try {
        // 1. جلب النطاقات المتاحة
        const domainsRes = await axios.get(`${MAIL_API}/domains`);
        const domains = domainsRes.data['hydra:member'] || [];
        if (domains.length === 0) throw new Error('لا توجد نطاقات متاحة');
        const domain = domains[Math.floor(Math.random() * domains.length)].domain;

        // 2. توليد اسم وبريد
        const username = faker.person.firstName().toLowerCase() + crypto.randomBytes(2).toString('hex');
        const email = `${username}@${domain}`;
        const password = generateSecurePassword();

        await bot.sendMessage(chatId, `📧 جاري إنشاء بريد: \`${email}\``, { parse_mode: 'Markdown' });

        // 3. إنشاء الحساب
        await axios.post(`${MAIL_API}/accounts`, {
            address: email,
            password: password
        });

        // 4. تسجيل الدخول للحصول على Token
        const tokenRes = await axios.post(`${MAIL_API}/token`, {
            address: email,
            password: password
        });
        const token = tokenRes.data.token;

        return { email, password, token };
    } catch (error) {
        console.error('فشل إنشاء حساب Mail.tm:', error.response?.data || error.message);
        throw new Error('تعذر إنشاء بريد مؤقت');
    }
}

// ✅ جلب الرسائل من Mail.tm
async function fetchMailTmMessages(token) {
    try {
        const res = await axios.get(`${MAIL_API}/messages`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data['hydra:member'] || [];
    } catch (error) {
        return [];
    }
}

// ✅ انتظار كود التفعيل من Mail.tm
async function waitForMailTmCode(email, password, token, chatId, maxWaitSeconds = 90) {
    const startTime = Date.now();
    await bot.sendMessage(chatId, `⏳ في انتظار وصول كود التفعيل إلى البريد...`);

    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        const messages = await fetchMailTmMessages(token);
        
        for (const msg of messages) {
            // محاولة استخراج الكود من subject أو intro
            const content = `${msg.subject || ''} ${msg.intro || ''}`;
            const codeMatch = content.match(/\b\d{6}\b/); // كود 6 أرقام
            if (codeMatch) {
                await bot.sendMessage(chatId, `📩 **تم استخراج الكود:** \`${codeMatch[0]}\``, { parse_mode: 'Markdown' });
                return codeMatch[0];
            }
        }
        await sleep(4000); // فحص كل 4 ثوانٍ
    }
    return null;
}

// ✅ بث مباشر حقيقي (تعديل نفس الرسالة)
function startLiveStream(page, chatId, intervalMs = 600) {
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

    let mailData;
    try {
        await bot.editMessageText(`⚙️ جاري إنشاء بريد مؤقت...`, { chat_id: chatId, message_id: statusMsg.message_id });
        mailData = await createMailTmAccount(chatId);
    } catch (e) {
        await bot.editMessageText(`❌ فشل إنشاء البريد: ${e.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
        return false;
    }

    const { email, password: mailPassword, token } = mailData;
    const chatGptPassword = generateSecurePassword(); // كلمة مرور منفصلة لحساب ChatGPT
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;

    await bot.editMessageText(`📧 \`${email}\`\n🔑 \`${chatGptPassword}\`\n🚀 جاري فتح المتصفح...`, {
        chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown'
    });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_fast_'));
    let context, page;
    let liveStream = null;

    try {
        const browserOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1366, height: 768 },
            timeout: 30000
        };
        if (activeProxy) browserOptions.proxy = { server: activeProxy.server };

        context = await Promise.race([
            chromium.launchPersistentContext(tempDir, browserOptions),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout أثناء فتح المتصفح')), 40000))
        ]);
        
        page = await context.newPage();
        await bot.editMessageText(`🌐 تم فتح المتصفح، جاري تحميل صفحة ChatGPT...`, {
            chat_id: chatId, message_id: statusMsg.message_id
        });

        liveStream = startLiveStream(page, chatId, 600);

        await Promise.race([
            page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 45000 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout أثناء تحميل صفحة ChatGPT')), 50000))
        ]);

        await simulateHumanActivityFast(page);
        await bot.editMessageText(`🖱️ الضغط على زر Sign up...`, { chat_id: chatId, message_id: statusMsg.message_id });

        const signupBtn = page.locator('button:has-text("Sign up")');
        await signupBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
            throw new Error('زر Sign up غير موجود');
        });
        await signupBtn.click();

        await bot.editMessageText(`📝 إدخال الإيميل...`, { chat_id: chatId, message_id: statusMsg.message_id });
        const emailInput = page.locator('input[id="email-input"], input[name="email"]');
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });
        await emailInput.fill(email);
        await page.keyboard.press('Enter');

        await bot.editMessageText(`🔐 إدخال كلمة المرور...`, { chat_id: chatId, message_id: statusMsg.message_id });
        const passInput = page.locator('input[type="password"]');
        await passInput.waitFor({ state: 'visible', timeout: 15000 });
        await passInput.fill(chatGptPassword);
        await page.keyboard.press('Enter');

        await sleep(3000);

        try {
            await page.waitForSelector('text="Failed to create account"', { timeout: 3000 });
            throw new Error("الحساب مرفوض من السيرفر (حظر مؤقت).");
        } catch (e) {
            if (e.message.includes("مرفوض")) throw e;
        }

        await bot.editMessageText(`⏳ في انتظار وصول كود التحقق إلى الإيميل...`, { chat_id: chatId, message_id: statusMsg.message_id });

        // ✅ استخدام API Mail.tm لانتظار الكود
        let code = await waitForMailTmCode(email, mailPassword, token, chatId, 90);

        if (!code) {
            const resendBtn = page.locator('button:has-text("Resend email")');
            if (await resendBtn.isVisible().catch(() => false)) {
                await resendBtn.click();
                await bot.sendMessage(chatId, "🔄 ضغطنا إعادة إرسال الكود...");
                code = await waitForMailTmCode(email, mailPassword, token, chatId, 60);
            }
        }

        if (!code) throw new Error("لم يتم استلام الكود بعد محاولات كثيرة.");

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

        await sleep(2000);
        const nameInput = await page.waitForSelector('input[name="name"]', { timeout: 10000 }).catch(() => null);
        if (nameInput) {
            await nameInput.fill(fullName);
            await page.keyboard.press('Enter');
            await sleep(3000);
        }

        const result = `${email}|${chatGptPassword}`;
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
