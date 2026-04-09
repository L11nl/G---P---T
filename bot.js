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
const API_LICENSE_KEY = 'USMAIL-166T-DEMO';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function generateSecurePassword() {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 16; i++) password += charset[crypto.randomInt(0, charset.length)];
    return password;
}

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

        frameId = await sendMovingFrame(page, chatId, frameId, "طلب رمز التحقق.. جاري فتح صفحة الإيميل والمفتاح 🔄");
        
        emailPage = await context.newPage(); 
        await emailPage.goto(`${API_BASE_URL}/room/${username}`, { waitUntil: "domcontentloaded" });
        frameId = await sendMovingFrame(emailPage, chatId, frameId, `جاري فحص حالة صندوق الإيميل..`);
        await sleep(2000);

        // ===================== التعديل الأساسي هنا =====================
        // بدلاً من الضغط على Enter، سنبحث عن الزر ونضغط عليه بالماوس
        try {
            const keyInput = emailPage.locator('input').first();
            if (await keyInput.isVisible({ timeout: 5000 })) {
                await keyInput.click();
                await sleep(500);
                
                // طباعة المفتاح حرفاً بحرف
                await keyInput.pressSequentially(API_LICENSE_KEY, { delay: 150 });
                frameId = await sendMovingFrame(emailPage, chatId, frameId, `تم طباعة المفتاح حرفاً بحرف ⌨️`);
                await sleep(1500);
                
                // 🔥🔥🔥 الضغط بالماوس على الزر المناسب 🔥🔥🔥
                frameId = await sendMovingFrame(emailPage, chatId, frameId, `جاري النقر بالماوس على زر "Buka Dashboard"...`);
                
                // 1. محاولة العثور على الزر والنقر عليه بالماوس
                let clicked = false;
                const selectors = [
                    'button:has-text("Buka")',
                    'button:has-text("Dashboard")',
                    'button:has-text("Go")',
                    'button:has-text("Access")',
                    'button:has-text("Open")',
                    'a:has-text("Buka")',
                    'a:has-text("Dashboard")',
                    'button[type="submit"]',
                    '.btn-success',
                    '.btn-primary'
                ];
                
                for (const sel of selectors) {
                    const btn = emailPage.locator(sel).first();
                    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
                        // الحصول على موقع الزر
                        const box = await btn.boundingBox();
                        if (box) {
                            // النقر بالماوس في وسط الزر
                            await emailPage.mouse.click(box.x + box.width/2, box.y + box.height/2);
                            console.log(`✅ تم النقر بالماوس على الزر: ${sel}`);
                            frameId = await sendMovingFrame(emailPage, chatId, frameId, `✅ تم النقر بالماوس على الزر (${sel}) 🖱️`);
                            clicked = true;
                            await sleep(2000);
                            break;
                        }
                    }
                }
                
                // 2. إذا لم ينجح، البحث عن أي زر يحتوي على النص والنقر بالماوس
                if (!clicked) {
                    const buttons = await emailPage.$$('button, a');
                    for (const btn of buttons) {
                        const text = await btn.textContent().catch(() => '');
                        if (text && (text.includes('Buka') || text.includes('Dashboard') || text.includes('Access') || text.includes('Go'))) {
                            const box = await btn.boundingBox();
                            if (box) {
                                await emailPage.mouse.click(box.x + box.width/2, box.y + box.height/2);
                                console.log(`✅ تم النقر بالماوس على الزر بالنص: "${text}"`);
                                frameId = await sendMovingFrame(emailPage, chatId, frameId, `✅ تم النقر بالماوس (نص: ${text}) 🖱️`);
                                clicked = true;
                                await sleep(2000);
                                break;
                            }
                        }
                    }
                }
                
                // 3. محاولة النقر بالماوس عبر إحداثيات تقريبية إذا لم نجد الزر
                if (!clicked) {
                    // نبحث عن أي زر مرئي قرب حقل الإدخال
                    const inputBox = await keyInput.boundingBox();
                    if (inputBox) {
                        // ننقر أسفل حقل الإدخال مباشرة (غالباً مكان الزر)
                        await emailPage.mouse.click(inputBox.x + 100, inputBox.y + 50);
                        frameId = await sendMovingFrame(emailPage, chatId, frameId, `⚠️ تم النقر بالماوس في موقع تقديري أسفل الحقل`);
                        clicked = true;
                    }
                }
                
                await sleep(3000);
            }
        } catch(e) {
            console.log("تخطي خطوة المفتاح...");
        }
        // =============================================================

        // 2. وضع الإيميل المؤقت في حال طلبه الموقع
        try {
            const roomInput = emailPage.locator('input[placeholder*="username" i], input[placeholder*="email" i], input[name="room"]').first();
            if (await roomInput.isVisible({ timeout: 4000 })) {
                await roomInput.fill(username);
                frameId = await sendMovingFrame(emailPage, chatId, frameId, `تم كتابة الإيميل المؤقت..`);
                await roomInput.press('Enter');
                await sleep(3000);
            }
        } catch(e) {}

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

// الأزرار
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

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
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
        
        const listenerId = bot.onReplyToMessage(chatId, query.message.message_id, async (replyMsg) => {
            const num = parseInt(replyMsg.text);
            if (isNaN(num) || num < 1) {
                return bot.sendMessage(chatId, "❌ الرجاء إرسال رقم صحيح أكبر من صفر.");
            }
            
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

bot.onText(/\/stop/, (msg) => {
    if (!isProcessing) {
        return bot.sendMessage(msg.chat.id, "ℹ️ لا توجد عملية جارية حالياً.");
    }
    bot.sendMessage(msg.chat.id, "⚠️ لا يمكن إيقاف العملية مباشرة حالياً، لكنها ستتوقف بعد انتهاء الحساب الحالي.");
});

console.log("🤖 البوت يعمل الآن...");
