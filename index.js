/*
 * ==========================================================
 * ChatGPT 2FA Automator & Playwright Script Generator
 * ==========================================================
 * - تم حل مشكلة تحديث العمر (Age) وكتابة 25 والضغط على Finish.
 * - أداة توليد أكواد برمجية دقيقة (Playwright Code Builder).
 * - نظام تفاعلي قوي: بحث عن نصوص وضغطها برمجياً + كيبورد.
 * - نظام ماوس دقيق (300 مربع شفاف) مع نقطة حمراء 🔴 للتأكيد.
 * - رسم الشبكة تلقائياً إذا تعذر إيجاد كود الـ 32 حرف.
 * ==========================================================
 */

const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const axios = require('axios');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

chromium.use(stealth);

// توكن البوت
const BOT_TOKEN = process.env.BOT_TOKEN || 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة';
if (!BOT_TOKEN || BOT_TOKEN === 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة') {
    console.error("❌ خطأ: BOT_TOKEN مفقود.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;

// حفظ حالة كل مستخدم للتحكم والتتبع
const userState = {};
const MAIL_API = 'https://api.mail.tm';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ================= نظام توليد كود Playwright التحليلي =================
class PlaywrightCodeGenerator {
    constructor() {
        this.codeLines = [];
        this.addComment("تهيئة المتصفح والدخول لصفحة التسجيل");
    }
    
    addCommand(cmd) {
        this.codeLines.push(`    ${cmd}`);
        console.log(`[Generated Code]: ${cmd}`);
    }
    
    addComment(comment) {
        this.codeLines.push(`\n    // === ${comment} ===`);
    }
    
    getFinalScript() {
        return `// ==========================================\n// 🤖 سكربت Playwright التحليلي المستخرج\n// يحتوي على الأكواد والإحداثيات التي قمت بتنفيذها\n// ==========================================\n\nconst { chromium } = require('playwright');\n\n(async () => {\n    const browser = await chromium.launch({ headless: false });\n    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });\n    const page = await context.newPage();\n${this.codeLines.join('\n')}\n\n    // await browser.close();\n})();`;
    }
}

// ================= دوال مساعدة لإنشاء البريد =================
function generateSecurePassword() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for(let i=0; i<16; i++) password += chars.charAt(crypto.randomInt(0, chars.length));
    return password;
}

async function createMailTmAccount(chatId) {
    try {
        const domainsRes = await axios.get(`${MAIL_API}/domains`);
        const domains = domainsRes.data['hydra:member'] || [];
        const domain = domains[Math.floor(Math.random() * domains.length)].domain;
        const username = faker.person.firstName().toLowerCase() + crypto.randomBytes(2).toString('hex');
        const email = `${username}@${domain}`;
        const password = generateSecurePassword();
        await axios.post(`${MAIL_API}/accounts`, { address: email, password: password });
        const tokenRes = await axios.post(`${MAIL_API}/token`, { address: email, password: password });
        return { email, password, token: tokenRes.data.token };
    } catch (error) { throw new Error('تعذر إنشاء بريد مؤقت'); }
}

async function waitForMailTmCode(email, token, chatId, maxWaitSeconds = 90) {
    const startTime = Date.now();
    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        if (userState[chatId]?.cancel) throw new Error("CANCELLED_BY_USER");
        try {
            const res = await axios.get(`${MAIL_API}/messages`, { headers: { Authorization: `Bearer ${token}` } });
            const messages = res.data['hydra:member'] || [];
            for (const msg of messages) {
                const codeMatch = `${msg.subject || ''} ${msg.intro || ''}`.match(/\b\d{6}\b/);
                if (codeMatch) return codeMatch[0];
            }
        } catch(e) {}
        await sleep(4000);
    }
    return null;
}

async function sendStepPhoto(page, chatId, caption, previousPhotoId = null) {
    try {
        if (previousPhotoId) await bot.deleteMessage(chatId, previousPhotoId).catch(() => {});
        const p = path.join(__dirname, `step_${Date.now()}.png`);
        await page.screenshot({ path: p });
        const sent = await bot.sendPhoto(chatId, p, { caption: caption });
        if (fs.existsSync(p)) fs.unlinkSync(p);
        return sent.message_id;
    } catch (err) { return previousPhotoId; }
}

// ================= أنظمة المربعات الشفافة الدقيقة =================
const GRID_COLS = 20;
const GRID_ROWS = 15;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS; // 300 مربع

async function drawGridAndScreenshot(page, chatId, caption) {
    await page.evaluate(({cols, rows}) => {
        if (document.getElementById('bot-grid-overlay')) return;
        const grid = document.createElement('div');
        grid.id = 'bot-grid-overlay';
        grid.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:999999;display:grid;';
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        for (let i = 0; i < cols * rows; i++) {
            const cell = document.createElement('div');
            cell.style.cssText = 'border:1px solid rgba(255,255,0,0.4);background-color:rgba(0,0,0,0.1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:bold;text-shadow:1px 1px 2px #000, -1px -1px 2px #000;';
            cell.innerText = i.toString();
            grid.appendChild(cell);
        }
        document.body.appendChild(grid);
    }, {cols: GRID_COLS, rows: GRID_ROWS});

    const p = path.join(__dirname, `grid_${Date.now()}.png`);
    await page.screenshot({ path: p });

    // إزالة الشبكة فوراً كي لا تتداخل مع النقرات البرمجية اللاحقة
    await page.evaluate(() => {
        const grid = document.getElementById('bot-grid-overlay');
        if (grid) grid.remove();
    });

    await bot.sendPhoto(chatId, p, { caption: caption, parse_mode: 'Markdown' });
    if (fs.existsSync(p)) fs.unlinkSync(p);
}

async function drawRedDot(page, x, y) {
    await page.evaluate((pos) => {
        let dot = document.getElementById('bot-red-dot');
        if (!dot) {
            dot = document.createElement('div');
            dot.id = 'bot-red-dot';
            dot.style.cssText = 'position:fixed;width:14px;height:14px;background-color:red;border:2px solid white;border-radius:50%;z-index:9999999;pointer-events:none;box-shadow:0 0 5px #000;transform:translate(-50%, -50%);';
            document.body.appendChild(dot);
        }
        dot.style.left = pos.x + 'px';
        dot.style.top = pos.y + 'px';
    }, {x, y});
}

async function removeRedDot(page) {
    await page.evaluate(() => {
        const dot = document.getElementById('bot-red-dot');
        if (dot) dot.remove();
    });
}

// ================= أنظمة القوائم التفاعلية =================
async function sendInteractiveMenu(chatId, text = "🎮 **أنت الآن تتحكم بالمتصفح:**\nالبوت في وضع الاستعداد ولن يغلق إلا بموافقتك.") {
    const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔍 البحث على النص والضغط عليه', callback_data: 'int_search_text' }],
                [{ text: '🖱️ ضغط ماوس (شبكة شفافة)', callback_data: 'int_mouse_menu' }],
                [{ text: '⌨️ كتابة نص', callback_data: 'int_type_text' }, { text: '↩️ انتر (Enter)', callback_data: 'int_press_enter' }],
                [{ text: '📸 تحديث الشاشة', callback_data: 'int_refresh' }],
                [{ text: '✅ إنهاء الجلسة واستخراج السكربت', callback_data: 'int_finish' }]
            ]
        }
    };
    await bot.sendMessage(chatId, text, opts);
}

async function sendMouseMenu(chatId) {
    const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '👁️ مشاهدة المربعات الشفافة', callback_data: 'int_show_grid' }],
                [{ text: '🧭 إرسال رقم المربع (لتحريك الماوس)', callback_data: 'int_move_mouse' }],
                [{ text: '🔴 كليك (Click)', callback_data: 'int_click_mouse' }],
                [{ text: '🔙 رجوع للقائمة الرئيسية', callback_data: 'int_back_main' }]
            ]
        }
    };
    await bot.sendMessage(chatId, "🖱️ **قائمة التحكم بالماوس الدقيق:**\nشاهد المربعات -> أرسل الرقم -> اضغط كليك.", opts);
}

async function startInteractiveMode(chatId, page, context, tempDir, codeGen, currentPhotoId) {
    userState[chatId].isInteractive = true;
    userState[chatId].page = page;
    userState[chatId].context = context;
    userState[chatId].tempDir = tempDir;
    userState[chatId].codeGen = codeGen;
    userState[chatId].currentPhotoId = currentPhotoId;

    await sendInteractiveMenu(chatId);
    return new Promise(resolve => { userState[chatId].resolveInteractive = resolve; });
}

// ================= الدالة الرئيسية للإنشاء والـ 2FA =================
async function createAccountLogic(chatId, isManual, manualData = null) {
    let modeText = isManual ? "(يدوي)" : "(تلقائي)";
    let statusMsgID = null;
    
    userState[chatId] = { step: null, cancel: false, isInteractive: false };
    const codeGen = new PlaywrightCodeGenerator();

    const checkCancel = () => { if (userState[chatId]?.cancel) throw new Error("CANCELLED_BY_USER"); };
    const updateStatus = async (text) => {
        checkCancel();
        if (!statusMsgID) {
            const sent = await bot.sendMessage(chatId, `⚡ ${modeText}: ${text}`);
            statusMsgID = sent.message_id;
        } else {
            await bot.editMessageText(`⚡ ${modeText}: ${text}`, { chat_id: chatId, message_id: statusMsgID }).catch(()=>{});
        }
    };

    await updateStatus("بدء العملية...");
    let email, mailToken;
    let chatGptPassword = isManual ? manualData.password : generateSecurePassword();

    if (isManual) {
        email = manualData.email;
    } else {
        try {
            const mailData = await createMailTmAccount(chatId);
            email = mailData.email; mailToken = mailData.token;
        } catch (e) { return false; }
    }

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_wrk_'));
    let context, page, currentPhotoId = null;

    try {
        context = await chromium.launchPersistentContext(tempDir, {
            headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1366, height: 768 }
        });
        page = await context.newPage();

        codeGen.addCommand(`await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" });`);
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        currentPhotoId = await sendStepPhoto(page, chatId, "🌐 فتح المتصفح", currentPhotoId);

        const signupBtn = page.getByRole("button", { name: "Sign up" });
        await signupBtn.waitFor({ state: 'visible', timeout: 30000 }).catch(() => page.locator('button:has-text("Sign up")').click());
        await signupBtn.click();
        codeGen.addCommand(`await page.locator('button:has-text("Sign up")').click();`);
        
        await page.waitForSelector('input[name="email"], input[id="email-input"]', {timeout: 30000});
        await page.locator('input[name="email"], input[id="email-input"]').first().fill(email);
        codeGen.addCommand(`await page.locator('input[name="email"]').fill("${email}");`);
        await sleep(1000);
        
        await page.getByRole("button", { name: "Continue", exact: true }).click({ force: true });
        codeGen.addCommand(`await page.getByRole("button", { name: "Continue" }).click();`);
        await sleep(3000);

        await page.waitForSelector('input[type="password"]', {timeout: 30000});
        await page.locator('input[type="password"]').first().fill(chatGptPassword);
        codeGen.addCommand(`await page.locator('input[type="password"]').fill("${chatGptPassword}");`);
        await sleep(1000);

        await page.getByRole("button", { name: "Continue" }).click({ force: true });
        codeGen.addCommand(`await page.getByRole("button", { name: "Continue" }).click();`);
        await sleep(7000); 

        checkCancel();
        await updateStatus("في انتظار صفحة الكود...");
        
        let code = null;
        if (isManual) {
            await updateStatus("🛑 يرجى إرسال الكود المكون من 6 أرقام هنا في الشات.");
            currentPhotoId = await sendStepPhoto(page, chatId, "💬 بانتظار الكود منك...", currentPhotoId);
            code = await new Promise((resolve) => {
                const listener = (msg) => {
                    if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) {
                        bot.removeListener('message', listener); resolve(msg.text.trim());
                    }
                };
                bot.on('message', listener);
            });
        } else {
            code = await waitForMailTmCode(email, mailToken, chatId, 100);
        }

        if (code) {
            const codeInput = page.getByRole("textbox", { name: "Code" });
            await codeInput.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => { await page.keyboard.type(code); });
            if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code);
            codeGen.addCommand(`await page.keyboard.type("${code}");`);
            await sleep(2000);
        }

        const continueBtnAfterCode = page.locator('button:has-text("Continue")').last();
        if (await continueBtnAfterCode.isVisible().catch(()=>false)) await continueBtnAfterCode.click({ force: true });
        else await page.keyboard.press('Enter');
        await sleep(5000); 

        // ==========================================================
        // 🌟 التعديل الخاص بصفحة العمر والاسم (Age vs Birthday) 🌟
        // ==========================================================
        const nameInputNode = page.getByRole("textbox", { name: "Full name" }).first();
        if (await nameInputNode.isVisible({ timeout: 15000 }).catch(() => false)) {
            await nameInputNode.fill("Auto User");
            codeGen.addCommand(`await page.getByRole("textbox", { name: "Full name" }).first().fill("Auto User");`);
            await sleep(1000);
            
            // قراءة النص الموجود بالصفحة لمعرفة إن كان يطلب Age أو Birthday
            const bodyText = await page.innerText('body').catch(()=>'');
            const isAge = bodyText.toLowerCase().includes('how old are you') || bodyText.toLowerCase().includes('age');
            
            // محاولة العثور على الحقل برمجياً
            const ageInput = page.locator('input[name="age"], input[id*="age" i], [aria-label*="age" i]').first();
            const bdayInput = page.locator('input[name="birthday"], [aria-label*="birthday" i]').first();
            
            // إذا كان يطلب العمر (Age)
            if (await ageInput.isVisible({ timeout: 2000 }).catch(() => false) || isAge) {
                if (await ageInput.isVisible().catch(() => false)) {
                    await ageInput.focus().catch(()=>{}); 
                    await ageInput.click({ force: true }).catch(()=>{});
                } else {
                    await page.keyboard.press('Tab');
                }
                await page.keyboard.press('Control+A'); // تحديد أي شيء مكتوب بالخطأ
                await page.keyboard.press('Backspace'); // مسحه
                await page.keyboard.type("25", { delay: 150 }); // كتابة 25
                codeGen.addCommand(`await page.locator('input[name="age"]').fill("25");`);
            } 
            // إذا كان يطلب تاريخ الميلاد بالطريقة القديمة (Birthday)
            else if (await bdayInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await bdayInput.focus().catch(()=>{}); 
                await bdayInput.click({ force: true }).catch(()=>{});
                await page.keyboard.press('Control+A'); 
                await page.keyboard.press('Backspace');
                await page.keyboard.type("01012000", { delay: 150 });
                codeGen.addCommand(`await page.locator('input[name="birthday"]').fill("01012000");`);
            } 
            // حل بديل (Fallback) يضغط Tap ويكتب 25
            else {
                await page.keyboard.press('Tab');
                await page.keyboard.press('Control+A');
                await page.keyboard.press('Backspace');
                await page.keyboard.type("25", { delay: 150 });
                codeGen.addCommand(`await page.keyboard.press('Tab'); await page.keyboard.type("25");`);
            }
            await sleep(1000);

            // الضغط على زر (Finish creating account)
            const finishBtn = page.locator('button:has-text("Finish creating account"), button:has-text("Agree"), button:has-text("Continue")').last();
            if (await finishBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await finishBtn.click({ force: true });
                codeGen.addCommand(`await page.locator('button:has-text("Finish creating account")').last().click();`);
            } else {
                await page.keyboard.press('Enter');
                codeGen.addCommand(`await page.keyboard.press('Enter');`);
            }
            await sleep(8000); 
        }

        await updateStatus("في انتظار الصفحة الرئيسية...");
        await page.waitForURL('**/chat', {timeout: 30000}).catch(()=>{});
        
        if (page.url().includes('/chat')) {
             const result = `${email}|${chatGptPassword}`;
             fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');

             if (isManual) {
                 // =======================================================
                 // قسم المصادقة الثنائية التلقائي (2FA)
                 // =======================================================
                 currentPhotoId = await sendStepPhoto(page, chatId, `✅ **نجاح (يدوي):**\n\`${result}\`\n\nلن يُغلق البوت.. سيستمر للتوجه وإعداد المصادقة الثنائية تلقائياً...`, currentPhotoId);
                 
                 codeGen.addComment("الدخول لإعدادات الأمان وتفعيل المصادقة 2FA");
                 await page.goto("https://chatgpt.com/#settings/Security", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
                 codeGen.addCommand(`await page.goto("https://chatgpt.com/#settings/Security");`);
                 await sleep(4000);

                 const authToggleBtn = page.locator('button[role="switch"]').last();
                 if (await authToggleBtn.isVisible().catch(()=>false)) {
                     await authToggleBtn.click({ force: true });
                 } else {
                     await page.locator('text="Authenticator app"').click({ force: true }).catch(()=>{});
                 }
                 codeGen.addCommand(`await page.locator('text="Authenticator app"').click();`);
                 await sleep(3000);

                 const pageText = await page.innerText('body');
                 const secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);
                 
                 if (secretMatch) {
                     const secretCode = secretMatch[0];
                     codeGen.addComment(`تم استخراج الرمز السري: ${secretCode}`);
                     currentPhotoId = await sendStepPhoto(page, chatId, `🔑 تم العثور على الكود السري بنجاح:\n\`${secretCode}\``, currentPhotoId);
                     
                     const mfaPage = await context.newPage();
                     await mfaPage.goto(`https://2fa.fb.tools/${secretCode}`).catch(()=>{});
                     await sleep(3000);
                     
                     const mfaText = await mfaPage.innerText('body');
                     const code6Match = mfaText.match(/\b\d{6}\b/);
                     
                     if (code6Match) {
                         const code6 = code6Match[0];
                         await mfaPage.close();
                         await page.bringToFront();
                         
                         const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();
                         if (await codeInput.isVisible().catch(()=>false)) {
                             await codeInput.fill(code6);
                         } else {
                             await page.keyboard.type(code6, { delay: 100 });
                         }
                         codeGen.addCommand(`await page.keyboard.type("${code6}"); // كود التحقق 6 أرقام`);
                         await sleep(1500);
                         
                         const enableBtn = page.locator('button:has-text("Enable"), button:has-text("Verify")').first();
                         if (await enableBtn.isVisible().catch(()=>false)) {
                             await enableBtn.click();
                             codeGen.addCommand(`await page.locator('button:has-text("Enable")').click();`);
                         } else {
                             await page.keyboard.press('Enter');
                             codeGen.addCommand(`await page.keyboard.press('Enter');`);
                         }
                         await sleep(3000);
                         
                         currentPhotoId = await sendStepPhoto(page, chatId, "✅ تمت المصادقة الثنائية (2FA) بنجاح تام!", currentPhotoId);
                         codeGen.addComment("تم تفعيل 2FA. الدخول في وضع الاستعداد بانتظار أوامرك.");
                         await startInteractiveMode(chatId, page, context, tempDir, codeGen, currentPhotoId);
                         return true;
                     }
                 }
                 
                 codeGen.addComment("تعذر استخراج كود 32 حرف. تحويل المستخدم للوضع اليدوي والشبكة.");
                 await bot.sendMessage(chatId, "⚠️ **لم يتم العثور على الكود 32 حرف كابيتال في الصفحة، سيتم تحويلك للتحكم اليدوي.**");
                 await drawGridAndScreenshot(page, chatId, "🔲 **صورة الشاشة مقسمة لمربعات (20x15):**\nاستخدم الأرقام والزوايا في الصورة لمعرفة المكان الذي يجب الضغط عليه لتكملة السكربت.");
                 await startInteractiveMode(chatId, page, context, tempDir, codeGen, currentPhotoId);

             } else {
                 currentPhotoId = await sendStepPhoto(page, chatId, "🎉 تم الدخول بنجاح!", currentPhotoId);
                 await bot.sendMessage(chatId, `✅ **نجاح (تلقائي):**\n\`${result}\``, { parse_mode: 'Markdown' });
             }
        } else {
            throw new Error("لم يتم الوصول للرئيسية.");
        }

    } catch (error) {
        if (error.message === "CANCELLED_BY_USER") return false;
        
        await bot.sendMessage(chatId, `❌ توقف بسبب خطأ: ${error.message}`);
        if (page && context && !userState[chatId].cancel) {
            await startInteractiveMode(chatId, page, context, tempDir, codeGen, currentPhotoId);
        }
    } finally {
        if (userState[chatId] && !userState[chatId].isInteractive) {
            if (context) await context.close().catch(()=>{});
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
        }
    }
    return true;
}

// ================= القوائم واستجابات البوت =================
function sendMainMenu(chatId) {
    bot.sendMessage(chatId, "👋 أهلاً بك! اختر العملية للبدء:", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '▶️ تشغيل تلقائي', callback_data: 'create_auto' }, { text: '✍️ تشغيل يدوي (مع 2FA)', callback_data: 'create_manual' }],
                [{ text: '🛑 إلغاء العملية', callback_data: 'cancel' }]
            ]
        }
    });
}

bot.onText(/\/start/, (msg) => {
    if (!userState[msg.chat.id]) userState[msg.chat.id] = { step: null, cancel: false, isInteractive: false };
    sendMainMenu(msg.chat.id);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    bot.answerCallbackQuery(query.id).catch(() => {});
    if (!userState[chatId]) userState[chatId] = { step: null, cancel: false, isInteractive: false };
    const state = userState[chatId];

    // ================= أوامر التفاعل (البحث، الماوس، الكتابة) =================
    if (query.data.startsWith('int_')) {
        const action = query.data.replace('int_', '');
        if (!state.isInteractive || !state.page) return bot.sendMessage(chatId, "⚠️ الجلسة منتهية.");

        if (action === 'search_text') {
            bot.sendMessage(chatId, "🔍 أرسل **النص** المكتوب في الصفحة (كابيتال وسمول كما هو) لكي أبحث عنه وأضغط عليه:", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } });
            state.step = 'awaiting_search_text';
        }
        else if (action === 'mouse_menu') {
            await sendMouseMenu(chatId);
        }
        else if (action === 'show_grid') {
            await drawGridAndScreenshot(state.page, chatId, "👁️ **المربعات الشفافة المعروضة (300 مربع):**\nالآن ارجع للقائمة واضغط إرسال رقم لتحريك الماوس.");
            await sendMouseMenu(chatId);
        }
        else if (action === 'move_mouse') {
            bot.sendMessage(chatId, "🧭 أرسل **رقم المربع** (من 0 إلى 299) لكي يذهب الماوس إليه:", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } });
            state.step = 'awaiting_move_mouse';
        }
        else if (action === 'click_mouse') {
            if (state.mouseX !== undefined && state.mouseY !== undefined) {
                await removeRedDot(state.page);
                await state.page.mouse.click(state.mouseX, state.mouseY);
                state.codeGen.addCommand(`await page.mouse.click(${state.mouseX}, ${state.mouseY});`);
                
                await sleep(1500);
                state.currentPhotoId = await sendStepPhoto(state.page, chatId, `🔴 تم الضغط (كليك) بنجاح على النقطة! وتم حفظ الكود.`, state.currentPhotoId);
            } else {
                bot.sendMessage(chatId, "⚠️ يرجى تحريك الماوس إلى رقم مربع أولاً.");
            }
            await sendInteractiveMenu(chatId);
        }
        else if (action === 'type_text') {
            bot.sendMessage(chatId, "⌨️ أرسل النص ليتم كتابته في المكان المحدد حالياً:", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } });
            state.step = 'awaiting_type_text';
        }
        else if (action === 'press_enter') {
            await state.page.keyboard.press('Enter');
            state.codeGen.addCommand(`await page.keyboard.press('Enter');`);
            await sleep(1500);
            state.currentPhotoId = await sendStepPhoto(state.page, chatId, "↩️ تم الضغط على مفتاح Enter.", state.currentPhotoId);
            await sendInteractiveMenu(chatId);
        }
        else if (action === 'refresh') {
            state.currentPhotoId = await sendStepPhoto(state.page, chatId, "📸 تحديث لقطة الشاشة:", state.currentPhotoId);
            await sendInteractiveMenu(chatId);
        }
        else if (action === 'back_main') {
            state.step = null;
            await sendInteractiveMenu(chatId);
        }
        else if (action === 'finish') {
            bot.sendMessage(chatId, "✅ جاري استخراج السكربت البرمجي التحليلي وإغلاق المتصفح...");
            state.isInteractive = false;
            
            if (state.context) await state.context.close().catch(()=>{});
            if (state.tempDir) try { fs.rmSync(state.tempDir, { recursive: true, force: true }); } catch {}
            
            const jsCode = state.codeGen.getFinalScript();
            const logPath = path.join(__dirname, `AutoGenerated_Script_${Date.now()}.js`);
            fs.writeFileSync(logPath, jsCode);
            
            await bot.sendDocument(chatId, logPath, { caption: "🧑‍💻 **تم توليد الكود البرمجي التحليلي بنجاح!**\nهذا الملف يحتوي على كود Playwright الدقيق لجميع الخطوات والنقرات والإحداثيات التي قمت بها.", parse_mode: 'Markdown' });
            fs.unlinkSync(logPath);
            
            if (state.resolveInteractive) state.resolveInteractive();
            isProcessing = false;
            sendMainMenu(chatId);
        }
        return;
    }

    if (query.data === 'cancel') {
        state.cancel = true;
        if (state.resolveInteractive) state.resolveInteractive();
        if (state.context) await state.context.close().catch(()=>{});
        bot.sendMessage(chatId, "🛑 تم إلغاء العملية بقوة.");
        isProcessing = false;
    }
    else if (query.data === 'create_auto') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول.");
        isProcessing = true;
        await createAccountLogic(chatId, false);
        isProcessing = false;
    } 
    else if (query.data === 'create_manual') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول.");
        state.step = 'awaiting_email';
        bot.sendMessage(chatId, "➡️ أرسل **الإيميل** للبدء:");
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const state = userState[chatId];
    if (!state || !text || text.startsWith('/')) return; 

    // --- استقبال النص للبحث والضغط (أداة المطورين) ---
    if (state.step === 'awaiting_search_text' && state.isInteractive) {
        state.step = null;
        const safeText = text.replace(/'/g, "\\'");
        bot.sendMessage(chatId, `🔍 جاري البحث عن "${text}" والضغط عليه...`);
        
        try {
            const loc = state.page.locator(`text="${text}"`).first();
            if (await loc.isVisible({ timeout: 5000 }).catch(()=>false)) {
                state.codeGen.addComment(`البحث عن النص "${text}" والضغط عليه`);
                state.codeGen.addCommand(`await page.locator('text="${safeText}"').first().click();`);
                
                await loc.click();
                await sleep(1500);
                state.currentPhotoId = await sendStepPhoto(state.page, chatId, `🎯 تم العثور على "${text}" والضغط عليه بنجاح. وتم حفظ الكود.`, state.currentPhotoId);
            } else {
                bot.sendMessage(chatId, `❌ لم أتمكن من العثور على النص "${text}" في الصفحة.`);
            }
        } catch(e) { bot.sendMessage(chatId, "❌ حدث خطأ أثناء البحث."); }
        await sendInteractiveMenu(chatId);
    }

    // --- استقبال رقم المربع وتحريك الماوس إليه ---
    else if (state.step === 'awaiting_move_mouse' && state.isInteractive) {
        const num = parseInt(text);
        if (!isNaN(num) && num >= 0 && num < TOTAL_CELLS) {
            state.step = null;
            
            const vw = 1366 / GRID_COLS;
            const vh = 768 / GRID_ROWS;
            const col = num % GRID_COLS;
            const row = Math.floor(num / GRID_COLS);
            
            const x = parseFloat(((col * vw) + (vw / 2)).toFixed(2));
            const y = parseFloat(((row * vh) + (vh / 2)).toFixed(2));
            
            state.mouseX = x;
            state.mouseY = y;
            
            await state.page.mouse.move(x, y);
            await drawRedDot(state.page, x, y);
            
            const dotImg = path.join(__dirname, `dot_${Date.now()}.png`);
            await state.page.screenshot({ path: dotImg });
            
            await bot.sendPhoto(chatId, dotImg, {
                caption: `🔴 الماوس متمركز الآن على المربع [${num}] بدقة.\nهل المكان صحيح؟ إذا كان كذلك اضغط من القائمة على (🔴 كليك - Click) للتأكيد.`,
            });
            fs.unlinkSync(dotImg);
            await sendMouseMenu(chatId);
        } else {
            bot.sendMessage(chatId, `❌ رقم المربع غير صحيح. الرجاء إرسال رقم بين 0 و ${TOTAL_CELLS - 1}.`);
        }
    }

    // --- إدخال نص تفاعلي (كيبورد) ---
    else if (state.step === 'awaiting_type_text' && state.isInteractive) {
        state.step = null;
        const safeText = text.replace(/'/g, "\\'");
        
        state.codeGen.addCommand(`await page.keyboard.type('${safeText}');`);
        await state.page.keyboard.type(text, { delay: 50 });
        await sleep(1000);
        
        state.currentPhotoId = await sendStepPhoto(state.page, chatId, `⌨️ تمت كتابة النص بنجاح.`, state.currentPhotoId);
        await sendInteractiveMenu(chatId);
    }

    // --- استقبال الإيميل للإنشاء ---
    else if (state.step === 'awaiting_email') {
        if (!text.includes('@')) return bot.sendMessage(chatId, "❌ إيميل غير صحيح.");
        state.step = null; isProcessing = true;
        const autoPass = generateSecurePassword(); 
        bot.sendMessage(chatId, `✅ تم استلام البريد للبدء.\n🔑 الباسورد: \`${autoPass}\``, {parse_mode: 'Markdown'});
        await createAccountLogic(chatId, true, { email: text, password: autoPass });
        isProcessing = false;
    }
});

process.on('uncaughtException', (err) => { console.error('Uncaught:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled:', reason); });

console.log("🤖 البوت المطور (تحديث الـ Age + Playwright Generator) يعمل الآن بنجاح...");
