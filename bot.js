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
// نظام الفريمات الثابتة والمستقرة (بث أبطأ وأوضح)
// ==========================================
async function sendSteadyFrame(page, chatId, messageId, caption) {
    if (!page || page.isClosed()) return null;
    try {
        const scPath = path.join(__dirname, `steady_${chatId}.jpg`);
        // جودة JPEG ممتازة للنقل المستقر
        await page.screenshot({ path: scPath, quality: 80, type: 'jpeg' });

        if (!messageId) {
            const sent = await bot.sendPhoto(chatId, scPath, { caption: `🔴 فريم ثابت | ${caption}` });
            fs.unlinkSync(scPath);
            return sent.message_id;
        } else {
            // تعديل نفس الصورة ببطء لتوفير السلاسة
            await bot.editMessageMedia(
                { type: 'photo', media: `attach://live`, caption: `🔴 فريم ثابت | ${caption}` },
                { chat_id: chatId, message_id: messageId }
            ).catch(() => {});
            if (fs.existsSync(scPath)) fs.unlinkSync(scPath);
            return messageId;
        }
    } catch (err) {
        return messageId;
    }
}

async function createAccount(chatId, current, total) {
    const status = await bot.sendMessage(chatId, `🚀 بدأت عملية الحساب المستقرة [${current}/${total}]...`);
    
    const { email, username } = await generateRandomEmail();
    const password = generateSecurePassword();
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;

    await bot.editMessageText(`📧 \`${email}\`\n🔑 \`${password}\`\n🚀 جاري تشغيل المتصفح...`, { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_steady_'));
    let context, page, frameMessageId = null;

    try {
        context = await chromium.launchPersistentContext(tempDir, {
            headless: true,
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1280, height: 720 }
        });
        page = await context.newPage();
        
        // فريم 1: المتصفح جاهز
        frameMessageId = await sendSteadyFrame(page, chatId, frameMessageId, "المتصفح جاهز");

        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 45000 });
        // فريم 2: تم تحميل الصفحة
        frameMessageId = await sendSteadyFrame(page, chatId, frameMessageId, "تم تحميل الصفحة");
        await sleep(3000); // انتظر قليلاً للمشاهدة

        // فريم 3: جاري الضغط على Sign up
        const signup = page.locator('button:has-text("Sign up")');
        await signup.waitFor({ state: 'visible' });
        frameMessageId = await sendSteadyFrame(page, chatId, frameMessageId, "جاري الضغط على التسجيل");
        await signup.click();
        await sleep(3000); // انتظر حتى تفتح الصفحة الجديدة

        // فريم 4: كتابة الإيميل
        const emailInp = page.locator('input[name="email"]');
        await emailInp.waitFor({ state: 'visible' });
        await emailInp.fill(email);
        frameMessageId = await sendSteadyFrame(page, chatId, frameMessageId, `تم كتابة الإيميل: ${email}`);
        await page.keyboard.press('Enter');
        await sleep(5000); // انتظر وقت أطول لصفحة الباسورد

        // فريم 5: كتابة الباسورد
        const passInp = page.locator('input[type="password"]');
        await passInp.waitFor({ state: 'visible' });
        await passInp.fill(password);
        frameMessageId = await sendSteadyFrame(page, chatId, frameMessageId, "تم كتابة الباسورد");
        await page.keyboard.press('Enter');
        await sleep(5000); // انتظر صفحة الكود

        // فريم 6: صفحة الكود
        frameMessageId = await sendSteadyFrame(page, chatId, frameMessageId, "في صفحة الكود، جاري السحب...");
        const code = await getVerificationCode(username, chatId);
        if (!code) throw new Error("الكود لم يصل.");

        // فريم 7: كتابة الكود
        await page.keyboard.type(code, { delay: 100 });
        frameMessageId = await sendSteadyFrame(page, chatId, frameMessageId, `تم كتابة الكود: ${code}`);
        await sleep(8000); // انتظر وقت طويل لتاريخ الميلاد/الاسم

        // فريم 8: إدخال الاسم
        const nameInp = page.locator('input[name="name"]');
        if (await nameInp.isVisible()) {
            await nameInp.fill(fullName);
            frameMessageId = await sendSteadyFrame(page, chatId, frameMessageId, `تم كتابة الاسم: ${fullName}`);
            await page.keyboard.press('Enter');
            await sleep(5000);
        }

        const result = `${email}|${password}`;
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
        await bot.sendMessage(chatId, `🎉 **مبروك! الحساب جاهز:**\n\`${result}\``, { parse_mode: 'Markdown' });

    } catch (error) {
        await bot.sendMessage(chatId, `❌ خطأ في أي خطوة: ${error.message}`);
        // صورة الخطأ النهائية ثابتة دائماً
        if (page) await page.screenshot({ path: 'steady_error.png', fullPage: true });
        if (fs.existsSync('steady_error.png')) await bot.sendPhoto(chatId, 'steady_error.png', { caption: 'آخر فريم قبل الفشل' });
    } finally {
        if (context) await context.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
    }
}

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "أهلاً نبيل! البوت جاهز مع نظام الفريمات الثابتة والمستقرة Steady Frames 📺\nاستخدم `/create 1`"));

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
