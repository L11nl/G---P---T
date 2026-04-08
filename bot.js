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
    console.error("❌ BOT_TOKEN missing in Railway variables.");
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

// جلب الكود بذكاء وسرعة
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
        await sleep(1500);
    }
    return null;
}

// ==========================================
// نظام البث الحي فائق السرعة (محاكاة الفيديو)
// ==========================================
function startLiveVideo(page, chatId) {
    let messageId = null;
    let isStopped = false;

    const stream = async () => {
        if (isStopped || !page || page.isClosed()) return;
        
        try {
            const scPath = path.join(__dirname, `v_${chatId}.jpg`);
            // التقاط سكرين شوت بجودة 60% لضمان سرعة النقل كالفيديو
            await page.screenshot({ path: scPath, quality: 60, type: 'jpeg' });

            if (!messageId) {
                const sent = await bot.sendPhoto(chatId, scPath, { caption: '🔴 بث حي | جاري المعالجة...' });
                messageId = sent.message_id;
            } else {
                await bot.editMessageMedia(
                    { type: 'photo', media: `attach://live`, caption: '🔴 بث حي | فيديو مباشر للمتصفح' },
                    { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }
                ).catch(() => {}); 
                // نستخدم التعديل المباشر لمحاكاة الفيديو
                await bot.sendChatAction(chatId, 'upload_photo');
            }
            
            if (fs.existsSync(scPath)) fs.unlinkSync(scPath);
        } catch (err) {}

        // التكرار بأسرع وقت ممكن (تلقائياً حسب سرعة السيرفر والتليجرام)
        setTimeout(stream, 1000); 
    };

    stream();
    return { stop: () => { isStopped = true; } };
}

async function createAccount(chatId, current, total) {
    const status = await bot.sendMessage(chatId, `🚀 بدأت عملية الحساب [${current}/${total}]...`);
    
    const { email, username } = await generateRandomEmail();
    const password = generateSecurePassword();
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;

    await bot.editMessageText(`📧 \`${email}\`\n🔑 \`${password}\``, { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_stream_'));
    let context, page, video;

    try {
        context = await chromium.launchPersistentContext(tempDir, {
            headless: true,
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1280, height: 720 }
        });
        page = await context.newPage();
        
        // تشغيل الفيديو المباشر
        video = startLiveVideo(page, chatId);

        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 45000 });
        
        // الضغط على Sign up
        const signup = page.locator('button:has-text("Sign up")');
        await signup.waitFor({ state: 'visible' });
        await signup.click();

        // إدخال الإيميل
        const emailInp = page.locator('input[name="email"]');
        await emailInp.waitFor({ state: 'visible' });
        await emailInp.fill(email);
        await page.keyboard.press('Enter');

        // إدخال الباسورد
        const passInp = page.locator('input[type="password"]');
        await passInp.waitFor({ state: 'visible' });
        await passInp.fill(password);
        await page.keyboard.press('Enter');

        // انتظار صفحة الكود
        await bot.sendMessage(chatId, "⏳ المتصفح الآن في صفحة الكود، جاري السحب...");
        const code = await getVerificationCode(username, chatId);
        if (!code) throw new Error("الكود لم يصل.");

        // كتابة الكود
        await page.keyboard.type(code, { delay: 100 });
        await sleep(5000);

        // إدخال الاسم
        const nameInp = page.locator('input[name="name"]');
        if (await nameInp.isVisible()) {
            await nameInp.fill(fullName);
            await page.keyboard.press('Enter');
            await sleep(5000);
        }

        const result = `${email}|${password}`;
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
        await bot.sendMessage(chatId, `\`${result}\``, { parse_mode: 'Markdown' });

    } catch (error) {
        await bot.sendMessage(chatId, `❌ خطأ: ${error.message}`);
        // صورة الخطأ النهائية دائماً موجودة
        if (page) await page.screenshot({ path: 'error.png', fullPage: true });
        if (fs.existsSync('error.png')) await bot.sendPhoto(chatId, 'error.png', { caption: 'آخر لقطة قبل الفشل' });
    } finally {
        if (video) video.stop();
        if (context) await context.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
    }
}

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "أهلاً نبيل! البوت جاهز مع بث فيديو مباشر 📺\nاستخدم `/create 1`"));

bot.onText(/\/create (.+)/, async (msg, match) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ البوت يعمل حالياً.");
    isProcessing = true;
    const num = parseInt(match[1]) || 1;
    for (let i = 1; i <= num; i++) {
        await createAccount(msg.chat.id, i, num);
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 اكتملت المهمة.");
});
