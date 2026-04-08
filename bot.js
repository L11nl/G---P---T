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

async function generateRandomEmail() {
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
        const response = await axios.get(`${API_BASE_URL}/api/public/rooms/master/domains`, { headers });
        let domains = response.data?.success && response.data?.domains ? response.data.domains : ["usmail.my.id", "toolsmail.me", "funtechme.me", "doestech.web.id"];
        const domain = domains[Math.floor(Math.random() * domains.length)];
        return { email: `${username}@${domain}`, username: username };
    } catch (error) {
        const fallback = ["usmail.my.id", "toolsmail.me"];
        return { email: `${username}@${fallback[0]}`, username: username };
    }
}

// ✅ جلب الكود كل 0.5 ثانية مع بحث متقدم
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
            const res = await axios.get(messagesUrl, { headers });
            const responseText = JSON.stringify(res.data);
            
            // البحث عن أي رقم 6 خانات (كود التحقق)
            const matches = [...responseText.matchAll(/\b\d{6}\b/g)];
            if (matches.length > 0) {
                const code = matches[matches.length - 1][0];
                await bot.sendMessage(chatId, `📩 **تم استخراج الكود:** \`${code}\``, { parse_mode: 'Markdown' });
                return code;
            }

            // البحث في الحقول المحددة
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
        } catch (e) {
            // تجاهل الأخطاء المؤقتة
        }
        await sleep(500); // فحص كل نصف ثانية
    }
    return null;
}

// ✅ بث مباشر حقيقي (تعديل نفس رسالة الصورة)
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
                // أول إرسال
                const sent = await bot.sendPhoto(chatId, screenshotPath, {
                    caption: '🔴 بث مباشر | جاري العمل...'
                });
                messageId = sent.message_id;
            } else {
                // تعديل الوسائط بنفس الرسالة
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
                    // إذا فشل التعديل (ربما حذف المستخدم الرسالة)، نرسل جديدة
                    if (err.response?.statusCode === 400) {
                        const sent = await bot.sendPhoto(chatId, screenshotPath, {
                            caption: '🔴 بث مباشر | جاري العمل...'
                        });
                        messageId = sent.message_id;
                    }
                });
            }
            // حذف الملف المؤقت
            fs.unlinkSync(screenshotPath);
        } catch (err) {
            // نتجاهل الأخطاء الطفيفة للحفاظ على البث
        }
    };

    // بدء فوري
    updateFrame();
    timer = setInterval(updateFrame, intervalMs);

    const stop = () => {
        stopped = true;
        if (timer) clearInterval(timer);
    };

    return { stop };
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
        emailData = await generateRandomEmail();
        password = generateSecurePassword();
    } catch (e) {
        await bot.editMessageText(`❌ خطأ: ${e.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
        return false;
    }

    const { email, username } = emailData;
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;

    await bot.editMessageText(`📧 \`${email}\`\n🔑 \`${password}\`\n🚀 سريع ومباشر!`, {
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

        // ✅ بدء البث الحي
        liveStream = startLiveStream(page, chatId, 500); // تحديث كل 0.5 ثانية

        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 45000 });
        await simulateHumanActivityFast(page);

        const signupBtn = page.locator('button:has-text("Sign up")');
        await signupBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        if (await signupBtn.isVisible()) await signupBtn.click();

        const emailInput = page.locator('input[id="email-input"], input[name="email"]');
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });
        await emailInput.fill(email);
        await page.keyboard.press('Enter');

        const passInput = page.locator('input[type="password"]');
        await passInput.waitFor({ state: 'visible', timeout: 15000 });
        await passInput.fill(password);
        await page.keyboard.press('Enter');

        await sleep(3000);

        // التحقق من منع الحساب
        try {
            await page.waitForSelector('text="Failed to create account"', { timeout: 3000 });
            throw new Error("مرفوض من السيرفر (حظر مؤقت).");
        } catch (e) {
            if (e.message.includes("مرفوض")) throw e;
        }

        await bot.sendMessage(chatId, "⏳ في انتظار وصول كود التحقق إلى الإيميل...");

        // جلب الكود مع محاولات كثيرة
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

        // ✅ إدخال الكود في الحقل الصحيح بكل الطرق الممكنة
        await bot.sendMessage(chatId, `✏️ جاري إدخال الكود \`${code}\` في ChatGPT...`, { parse_mode: 'Markdown' });

        // الانتظار لحين ظهور حقل الكود
        await page.waitForTimeout(2000);

        // محاولة ملء الحقل باستخدام selectors دقيقة
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
                    await input.click({ clickCount: 3 }); // تحديد النص الموجود
                    await input.fill(code);
                    filled = true;
                    break;
                }
            } catch {}
        }

        if (!filled) {
            // خطة بديلة: الضغط على Tab للوصول إلى الحقل ثم الكتابة
            await page.keyboard.press('Tab');
            await page.keyboard.type(code);
        }

        // متابعة الاسم
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

        // ✅ إيقاف البث الحي
        if (liveStream) liveStream.stop();

        await context.close();
        return true;

    } catch (error) {
        await bot.sendMessage(chatId, `❌ فشل: ${error.message}`);

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
