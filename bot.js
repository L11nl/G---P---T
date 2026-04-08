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
const API_LICENSE_KEY = 'USMAIL-166T-DEMO';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function generateSecurePassword() {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 16; i++) password += charset[crypto.randomInt(0, charset.length)];
    return password;
}

// توليد إيميل من API usmail
async function generateRandomEmail() {
    const username = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(3).toString('hex')}`;
    const headers = { 'X-License-Key': API_LICENSE_KEY, 'Referer': `${API_BASE_URL}/room/master` };
    try {
        const res = await axios.get(`${API_BASE_URL}/api/public/rooms/master/domains`, { headers, timeout: 5000 });
        const domains = res.data?.domains || ["usmail.my.id"];
        return { email: `${username}@${domains[Math.floor(Math.random() * domains.length)]}`, username };
    } catch (e) {
        return { email: `${username}@usmail.my.id`, username };
    }
}

// جلب الكود بذكاء
async function getVerificationCode(username, chatId) {
    const headers = { 'X-License-Key': API_LICENSE_KEY };
    const url = `${API_BASE_URL}/api/public/rooms/${username}/messages`;
    for (let i = 0; i < 40; i++) {
        try {
            const res = await axios.get(url, { headers, timeout: 3000 });
            const dataStr = JSON.stringify(res.data);
            const matches = dataStr.match(/\b\d{6}\b/g);
            if (matches) {
                const code = matches[matches.length - 1];
                await bot.sendMessage(chatId, `📩 **الكود المستخرج:** \`${code}\``, { parse_mode: 'Markdown' });
                return code;
            }
        } catch (e) {}
        await sleep(2000);
    }
    return null;
}

// ==========================================
// التحديث الجديد: إرسال صورة، وحذف القديمة لضمان الحركة
// ==========================================
async function sendMovingFrame(page, chatId, oldMessageId, caption) {
    if (!page || page.isClosed()) return oldMessageId;
    try {
        // أخذ الصورة كـ Buffer لسرعة النقل (بدون حفظ بالملفات)
        const imageBuffer = await page.screenshot({ quality: 70, type: 'jpeg' });

        // 1. حذف الصورة القديمة (كما طلبت)
        if (oldMessageId) {
            await bot.deleteMessage(chatId, oldMessageId).catch(() => {});
        }

        // 2. إرسال الصورة الجديدة مكانها
        const sentMsg = await bot.sendPhoto(chatId, imageBuffer, { caption: `🔴 المتصفح الآن | ${caption}` }, { filename: 'frame.jpg', contentType: 'image/jpeg' });
        
        // إرجاع الآي دي الجديد حتى نحذفه بالخطوة الجاية
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

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_steady_'));
    let context, page, frameId = null;

    try {
        context = await chromium.launchPersistentContext(tempDir, {
            headless: true,
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1280, height: 720 }
        });
        page = await context.newPage();
        
        // فريم 1
        frameId = await sendMovingFrame(page, chatId, frameId, "المتصفح جاهز للعمل");

        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 45000 });
        
        // فريم 2
        frameId = await sendMovingFrame(page, chatId, frameId, "تم تحميل موقع ChatGPT");
        await sleep(2000);

        // فريم 3
        const signup = page.locator('button:has-text("Sign up")');
        await signup.waitFor({ state: 'visible' });
        frameId = await sendMovingFrame(page, chatId, frameId, "الضغط على التسجيل (Sign up)");
        await signup.click();
        await sleep(3000);

        // فريم 4
        const emailInp = page.locator('input[name="email"]');
        await emailInp.waitFor({ state: 'visible' });
        await emailInp.fill(email);
        frameId = await sendMovingFrame(page, chatId, frameId, `كتابة الإيميل: ${email}`);
        await page.keyboard.press('Enter');
        await sleep(4000);

        // فريم 5
        const passInp = page.locator('input[type="password"]');
        await passInp.waitFor({ state: 'visible' });
        await passInp.fill(password);
        frameId = await sendMovingFrame(page, chatId, frameId, "كتابة الباسورد");
        await page.keyboard.press('Enter');
        await sleep(5000);

        // فريم 6
        frameId = await sendMovingFrame(page, chatId, frameId, "في صفحة الكود، جاري سحب الكود من usmail...");
        const code = await getVerificationCode(username, chatId);
        if (!code) throw new Error("الكود لم يصل.");

        // فريم 7
        await page.keyboard.type(code, { delay: 100 });
        frameId = await sendMovingFrame(page, chatId, frameId, `تم إدخال الكود بنجاح: ${code}`);
        await sleep(6000);

        // فريم 8
        const nameInp = page.locator('input[name="name"]');
        if (await nameInp.isVisible()) {
            await nameInp.fill(fullName);
            frameId = await sendMovingFrame(page, chatId, frameId, `إدخال الاسم: ${fullName}`);
            await page.keyboard.press('Enter');
            await sleep(5000);
        }

        const result = `${email}|${password}`;
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
        
        // مسح آخر صورة بعد النجاح حتى يبقى الشات نظيف
        if (frameId) await bot.deleteMessage(chatId, frameId).catch(() => {});
        
        await bot.sendMessage(chatId, `\`${result}\``, { parse_mode: 'Markdown' });

    } catch (error) {
        await bot.sendMessage(chatId, `❌ خطأ: ${error.message}`);
        // صورة الخطأ النهائية
        if (page) {
            const errBuffer = await page.screenshot({ fullPage: true });
            await bot.sendPhoto(chatId, errBuffer, { caption: '📸 الشاشة وقت حدوث المشكلة' }, { filename: 'error.jpg', contentType: 'image/jpeg' });
        }
    } finally {
        if (context) await context.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
    }
}

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "أهلاً نبيل! البوت جاهز 📺\nاستخدم `/create 1`"));

bot.onText(/\/create (.+)/, async (msg, match) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت يعمل على حساب حالياً.");
    isProcessing = true;
    const num = parseInt(match[1]) || 1;
    for (let i = 1; i <= num; i++) {
        await createAccount(msg.chat.id, i, num);
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
