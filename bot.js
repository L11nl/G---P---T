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
    console.error("❌ BOT_TOKEN مفقود في متغيرات Railway.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;
let activeProxy = null;

const API_BASE_URL = 'https://usmail.my.id';
const API_LICENSE_KEY = 'USMAIL-166T-DEMO'; // المفتاح المطلوب

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function generateSecurePassword() {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 16; i++) password += charset[crypto.randomInt(0, charset.length)];
    return password;
}

// 1. توليد الإيميل من API usmail
async function generateRandomEmail() {
    const username = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(3).toString('hex')}`;
    const headers = {
        'Accept': '*/*',
        'X-License-Key': API_LICENSE_KEY,
        'Referer': `${API_BASE_URL}/room/master`
    };
    try {
        const res = await axios.get(`${API_BASE_URL}/api/public/rooms/master/domains`, { headers, timeout: 5000 });
        const domains = (res.data && res.data.success) ? res.data.domains : ["usmail.my.id", "toolsmail.me"];
        return { email: `${username}@${domains[Math.floor(Math.random() * domains.length)]}`, username };
    } catch (e) {
        return { email: `${username}@usmail.my.id`, username };
    }
}

// ==========================================
// نظام تحريك الفريمات (إرسال صورة وحذف القديمة)
// ==========================================
async function sendMovingFrame(page, chatId, oldMessageId, caption) {
    if (!page || page.isClosed()) return oldMessageId;
    try {
        const imageBuffer = await page.screenshot({ quality: 75, type: 'jpeg' });
        if (oldMessageId) await bot.deleteMessage(chatId, oldMessageId).catch(() => {});
        const sentMsg = await bot.sendPhoto(chatId, imageBuffer, { caption: `🔴 المتصفح الآن | ${caption}` }, { filename: 'frame.jpg', contentType: 'image/jpeg' });
        return sentMsg.message_id;
    } catch (err) {
        return oldMessageId;
    }
}

async function createAccount(chatId, current, total) {
    const status = await bot.sendMessage(chatId, `🚀 بدأت عملية الحساب [${current}/${total}]...`);
    
    const { email, username } = await generateRandomEmail();
    const password = generateSecurePassword();
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;

    await bot.editMessageText(`📧 \`${email}\`\n🔑 \`${password}\`\n🚀 جاري تشغيل المتصفح...`, { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_bot_'));
    let context, page, emailPage, frameId = null;

    try {
        context = await chromium.launchPersistentContext(tempDir, {
            headless: true,
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1280, height: 720 }
        });
        page = await context.newPage();
        
        frameId = await sendMovingFrame(page, chatId, frameId, "فتح موقع ChatGPT");
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 45000 });
        await sleep(2000);

        const signup = page.locator('button:has-text("Sign up")');
        await signup.waitFor({ state: 'visible', timeout: 15000 });
        frameId = await sendMovingFrame(page, chatId, frameId, "الضغط على التسجيل (Sign up)");
        await signup.click();
        await sleep(3000);

        const emailInp = page.locator('input[name="email"]');
        await emailInp.waitFor({ state: 'visible', timeout: 15000 });
        await emailInp.fill(email);
        frameId = await sendMovingFrame(page, chatId, frameId, `كتابة الإيميل: ${email}`);
        await page.keyboard.press('Enter');
        await sleep(4000);

        const passInp = page.locator('input[type="password"]');
        await passInp.waitFor({ state: 'visible', timeout: 15000 });
        await passInp.fill(password);
        frameId = await sendMovingFrame(page, chatId, frameId, "كتابة الباسورد");
        await page.keyboard.press('Enter');
        await sleep(5000);

        // ==========================================
        // الانتقال لصفحة الإيميل لتنفيذ طلب تسجيل الدخول بالمفتاح
        // ==========================================
        frameId = await sendMovingFrame(page, chatId, frameId, "طلب رمز التحقق.. جاري فتح صفحة الإيميل والمفتاح 🔄");
        
        emailPage = await context.newPage(); // فتح تاب جديد لموقع الإيميل
        
        // الانتقال لصفحة تسجيل الدخول بالمفتاح المذكورة في الصورة
        await emailPage.goto(`${API_BASE_URL}/room/master`, { waitUntil: "domcontentloaded" });
        frameId = await sendMovingFrame(emailPage, chatId, frameId, `جاري وضع المفتاح ${API_LICENSE_KEY} للدخول..`);

        // تنفيذ عملية تسجيل الدخول كما في الصورة (image_1.png)
        try {
            const keyInput = emailPage.locator('input[name="key"]');
            await keyInput.waitFor({ state: 'visible', timeout: 10000 });
            await keyInput.fill(API_LICENSE_KEY); // وضع المفتاح تلقائياً
            await sleep(1000);
            
            frameId = await sendMovingFrame(emailPage, chatId, frameId, `تم وضع المفتاح.. جاري الضغط على ENTER للمتابعة 🖱️`);
            
            const enterBtn = emailPage.locator('button:has-text("ENTER")');
            await enterBtn.click();
            await sleep(2000);
            
            // الانتظار حتى يتحول الرابط إلى رابط صندوق الإيميل المخصص للإيميل المستخدم
            await emailPage.waitForURL(`${API_BASE_URL}/room/${username}`, { timeout: 15000 });
        } catch(e) {
            console.log("تعذر تسجيل الدخول بالمفتاح، جاري محاولة الدخول المباشر...");
            // في حال فشل تسجيل الدخول بالمفتاح، نحاول الدخول المباشر كما كان الكود القديم
            await emailPage.goto(`${API_BASE_URL}/room/${username}`, { waitUntil: "domcontentloaded" });
        }

        // الآن تم الدخول للصندوق، نأخذ فريم أول
        frameId = await sendMovingFrame(emailPage, chatId, frameId, `صندوق الوارد للإيميل (الدخول تم): ${email}`);

        let code = null;
        const headers = {
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'X-License-Key': API_LICENSE_KEY,
            'Referer': `${API_BASE_URL}/room/${username}`
        };
        const messagesUrl = `${API_BASE_URL}/api/public/rooms/${username}/messages`;

        for (let i = 0; i < 20; i++) {
            try {
                const res = await axios.get(messagesUrl, { headers, timeout: 3000 });
                const matches = JSON.stringify(res.data).match(/\b\d{6}\b/g);
                if (matches) {
                    code = matches[matches.length - 1];
                    frameId = await sendMovingFrame(emailPage, chatId, frameId, `✅ تم استلام الكود بنجاح: ${code}`);
                    break;
                }
            } catch (e) {}
            
            if (i % 2 === 0 && !code) {
                frameId = await sendMovingFrame(emailPage, chatId, frameId, `⏳ ننتظر وصول رسالة OpenAI... (محاولة ${i+1})`);
            }
            await sleep(2500);
        }

        if (!code) throw new Error("لم يصل الكود للصندوق.");

        await emailPage.close(); // إغلاق تاب الإيميل
        await page.bringToFront(); // العودة لـ ChatGPT
        frameId = await sendMovingFrame(page, chatId, frameId, "العودة لـ ChatGPT لإدخال الكود 🔙");
        await sleep(1000);

        // إدخال الكود (النقر ثم الكتابة لضمان التوزيع على المربعات)
        const codeInputSelectors = ['input[aria-label="Verification code"]', 'input[type="text"]', 'input[inputmode="numeric"]'];
        let isCodeFilled = false;
        
        for (const sel of codeInputSelectors) {
            const input = page.locator(sel).first();
            if (await input.isVisible().catch(()=>false)) {
                await input.click();
                await input.fill(code);
                isCodeFilled = true;
                break;
            }
        }
        
        if (!isCodeFilled) {
            await page.mouse.click(500, 400); 
            await page.keyboard.type(code, { delay: 100 });
        }

        frameId = await sendMovingFrame(page, chatId, frameId, `تم كتابة الكود بنجاح`);
        await sleep(5000);

        // إدخال الاسم
        const nameInp = page.locator('input[name="name"]');
        if (await nameInp.isVisible({ timeout: 5000 }).catch(()=>false)) {
            await nameInp.fill(fullName);
            frameId = await sendMovingFrame(page, chatId, frameId, `إدخال الاسم: ${fullName}`);
            await page.keyboard.press('Enter');
            await sleep(5000);
        }

        const result = `${email}|${password}`;
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
        
        if (frameId) await bot.deleteMessage(chatId, frameId).catch(() => {});
        await bot.sendMessage(chatId, `\`${result}\``, { parse_mode: 'Markdown' });

    } catch (error) {
        await bot.sendMessage(chatId, `❌ توقف العمل: ${error.message}`);
        // صورة الخطأ النهائية
        if (page) {
            const errBuffer = await page.screenshot({ fullPage: true, quality: 75, type: 'jpeg' });
            await bot.sendPhoto(chatId, errBuffer, { caption: '📸 الشاشة وقت حدوث المشكلة' }, { filename: 'error.jpg', contentType: 'image/jpeg' });
        }
    } finally {
        if (context) await context.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
    }
}

// 2. تحديث رسالة ستارت إلى نسخة 14
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 أهلاً نبيل! البوت المحدث (نسخة 14) جاهز لإنشاء حسابات ChatGPT على دومين asistx.net بدقة واحترافية عالية 🚀\nاستخدم أمر `/create 1` للبدء.");
});

bot.onText(/\/create (.+)/, async (msg, match) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت يعمل على حساب حالياً.");
    isProcessing = true;
    const num = parseInt(match[1]) || 1;
    for (let i = 1; i <= num; i++) {
        await createAccount(msg.chat.id, i, num);
        await sleep(2000);
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 انتهت جميع المهمات.");
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
