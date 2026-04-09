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
    console.error("❌ BOT_TOKEN مفقود في متغيرات البيئة.");
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
        // الانتقال لصفحة الإيميل لتسجيل الدخول وإدخال المفتاح
        // ==========================================
        frameId = await sendMovingFrame(page, chatId, frameId, "طلب رمز التحقق.. جاري فتح صفحة الإيميل والمفتاح 🔄");
        
        emailPage = await context.newPage(); 
        await emailPage.goto(`${API_BASE_URL}/room/${username}`, { waitUntil: "domcontentloaded" });
        frameId = await sendMovingFrame(emailPage, chatId, frameId, `جاري فحص حالة صندوق الإيميل..`);
        await sleep(2000);

        // 1. المعالجة القهرية الجديدة (طباعة حرف بحرف)
        try {
            const keyInput = emailPage.locator('input').first();
            if (await keyInput.isVisible({ timeout: 5000 })) {
                await keyInput.click();
                await sleep(500);
                await keyInput.pressSequentially(API_LICENSE_KEY, { delay: 150 });
                frameId = await sendMovingFrame(emailPage, chatId, frameId, `تم طباعة المفتاح حرفاً بحرف ⌨️`);
                await sleep(1500);
                await keyInput.press('Enter');
                await sleep(2000);
                
                // --- ✅ الضغط على زر Buka Dashboard بكل الطرق الممكنة ---
                frameId = await sendMovingFrame(emailPage, chatId, frameId, `جاري الضغط على زر "Buka Dashboard"...`);
                await sleep(3000);
                
                let buttonClicked = false;
                const possibleSelectors = [
                    'button:has-text("Buka")',
                    'button:has-text("Dashboard")',
                    'button:has-text("Go")',
                    'button:has-text("Access")',
                    'button:has-text("Open")',
                    'a:has-text("Buka")',
                    'a:has-text("Dashboard")',
                    'button[type="submit"]',
                    '.btn-success',
                    '.btn-primary',
                    'button.btn'
                ];
                
                for (const selector of possibleSelectors) {
                    try {
                        const btn = emailPage.locator(selector).first();
                        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
                            await btn.click({ force: true, noWaitAfter: true });
                            console.log(`✅ تم الضغط على الزر باستخدام المحدد: ${selector}`);
                            frameId = await sendMovingFrame(emailPage, chatId, frameId, `✅ تم الضغط على الزر الأخضر 🖱️ (${selector})`);
                            buttonClicked = true;
                            await sleep(2000);
                            break;
                        }
                    } catch (e) {}
                }
                
                if (!buttonClicked) {
                    try {
                        const buttons = await emailPage.$$('button');
                        for (const btn of buttons) {
                            const text = await btn.textContent().catch(() => '');
                            if (text && (text.includes('Buka') || text.includes('Dashboard') || text.includes('Access') || text.includes('Go'))) {
                                await btn.click({ force: true, noWaitAfter: true });
                                console.log(`✅ تم الضغط على الزر عبر البحث النصي: "${text}"`);
                                frameId = await sendMovingFrame(emailPage, chatId, frameId, `✅ تم الضغط على الزر الأخضر (نص: ${text})`);
                                buttonClicked = true;
                                await sleep(2000);
                                break;
                            }
                        }
                    } catch (e) {}
                }
                
                if (!buttonClicked) {
                    try {
                        const jsClick = async (textToFind) => {
                            await emailPage.evaluate((text) => {
                                const elements = document.querySelectorAll('button, a, div[role="button"]');
                                for (const el of elements) {
                                    if (el.textContent && el.textContent.includes(text)) {
                                        el.click();
                                        return true;
                                    }
                                }
                                return false;
                            }, textToFind);
                        };
                        
                        if (await jsClick('Buka')) {
                            buttonClicked = true;
                            frameId = await sendMovingFrame(emailPage, chatId, frameId, `✅ تم الضغط على الزر باستخدام JavaScript (Buka)`);
                        } else if (await jsClick('Dashboard')) {
                            buttonClicked = true;
                            frameId = await sendMovingFrame(emailPage, chatId, frameId, `✅ تم الضغط على الزر باستخدام JavaScript (Dashboard)`);
                        }
                        await sleep(2000);
                    } catch (e) {}
                }
                
                if (!buttonClicked) {
                    try {
                        const btn = emailPage.getByRole('button', { name: /Buka|Dashboard|Access|Go/i }).first();
                        if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
                            await btn.click({ force: true, noWaitAfter: true });
                            buttonClicked = true;
                            frameId = await sendMovingFrame(emailPage, chatId, frameId, `✅ تم الضغط على الزر الأخضر (getByRole)`);
                            await sleep(2000);
                        }
                    } catch (e) {}
                }
                
                if (!buttonClicked) {
                    frameId = await sendMovingFrame(emailPage, chatId, frameId, `⚠️ لم يتم العثور على زر "Buka Dashboard"، استمرار العملية...`);
                }
                
                await sleep(4000);
            }
        } catch(e) {
            console.log("تخطي خطوة المفتاح...");
        }

        // 2. وضع الإيميل المؤقت في حال طلبه الموقع بعد فتح القفل
        try {
            const roomInput = emailPage.locator('input[placeholder*="username" i], input[placeholder*="email" i], input[name="room"]').first();
            if (await roomInput.isVisible({ timeout: 4000 })) {
                await roomInput.fill(username);
                frameId = await sendMovingFrame(emailPage, chatId, frameId, `تم كتابة الإيميل المؤقت..`);
                await roomInput.press('Enter');
                await sleep(3000);
            }
        } catch(e) {}

        // 3. النزول للأسفل لانتظار الكود
        await emailPage.mouse.wheel(0, 400); 
        frameId = await sendMovingFrame(emailPage, chatId, frameId, `صندوق الوارد (الدخول تم): ${email} - ننتظر الرسالة ⬇️`);

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

        await emailPage.close(); 
        await page.bringToFront(); 
        frameId = await sendMovingFrame(page, chatId, frameId, "العودة لـ ChatGPT لإدخال الكود 🔙");
        await sleep(1000);

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
        if (page) {
            const errBuffer = await page.screenshot({ fullPage: true, quality: 75, type: 'jpeg' });
            await bot.sendPhoto(chatId, errBuffer, { caption: '📸 الشاشة وقت حدوث المشكلة' }, { filename: 'error.jpg', contentType: 'image/jpeg' });
        }
    } finally {
        if (context) await context.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
    }
}

// ==========================================
// أوامر البوت مع أزرار إنلاين
// ==========================================
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🆕 إنشاء حساب واحد", callback_data: "create_1" }],
                [{ text: "📦 إنشاء عدة حسابات", callback_data: "create_multi" }]
            ]
        }
    };
    bot.sendMessage(chatId, "👋 أهلاً بك! البوت جاهز لإنشاء حسابات ChatGPT.\n\nاختر أحد الخيارات:", opts);
});

// معالجة ضغطات الأزرار
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    // الرد على الاستعلام لإزالة علامة التحميل
    bot.answerCallbackQuery(query.id);
    
    if (data === 'create_1') {
        if (isProcessing) {
            return bot.sendMessage(chatId, "⚠️ البوت يعمل على حساب حالياً. انتظر حتى ينتهي.");
        }
        isProcessing = true;
        await createAccount(chatId, 1, 1);
        isProcessing = false;
        bot.sendMessage(chatId, "🏁 تم إنشاء الحساب بنجاح.");
        
    } else if (data === 'create_multi') {
        if (isProcessing) {
            return bot.sendMessage(chatId, "⚠️ البوت يعمل على حساب حالياً. انتظر حتى ينتهي.");
        }
        bot.sendMessage(chatId, "🔢 كم حساباً تريد إنشاء؟ أرسل الرقم فقط (مثلاً: 5)");
        
        // إنشاء مستمع لمرة واحدة لالتقاط العدد
        const listenerId = bot.onReplyToMessage(chatId, query.message.message_id, async (replyMsg) => {
            const num = parseInt(replyMsg.text);
            if (isNaN(num) || num < 1) {
                return bot.sendMessage(chatId, "❌ الرجاء إرسال رقم صحيح أكبر من صفر.");
            }
            
            // إزالة المستمع المؤقت
            bot.removeReplyListener(listenerId);
            
            isProcessing = true;
            for (let i = 1; i <= num; i++) {
                await createAccount(chatId, i, num);
                await sleep(2000);
            }
            isProcessing = false;
            bot.sendMessage(chatId, "🏁 انتهت جميع المهمات.");
        });
    }
});

// أوامر البروكسي (اختيارية)
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

// أمر إيقاف العملية (اختياري)
bot.onText(/\/stop/, (msg) => {
    if (!isProcessing) {
        return bot.sendMessage(msg.chat.id, "ℹ️ لا توجد عملية جارية حالياً.");
    }
    // يمكن إضافة آلية إيقاف إذا أردت
    bot.sendMessage(msg.chat.id, "⚠️ لا يمكن إيقاف العملية مباشرة حالياً، لكنها ستتوقف بعد انتهاء الحساب الحالي.");
});

console.log("🤖 البوت يعمل الآن...");
