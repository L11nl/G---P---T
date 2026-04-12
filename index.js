/*
 * ==========================================================
 * ChatGPT 2FA Automator & Playwright Script Generator
 * ==========================================================
 * - أداة توليد أكواد برمجية دقيقة (Playwright Code Builder).
 * - ترقيم تلقائي لجميع خطوات السكربت (الخطوة 1، الخطوة 2...).
 * - توليد كود ديناميكي ذكي لجلب كود 2FA (يدعم الأرقام ذات المسافات).
 * - نظام تفاعلي كامل وزر "البحث عن الرابط".
 * - 🛡️ مدمج به درع حماية لتخطي نافذة (Ask anything / Skip Tour) قبل ضغط الماوس لمنع التوقف.
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

const userState = {};
const MAIL_API = 'https://api.mail.tm';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ================= نظام توليد كود Playwright التحليلي المطور =================
class PlaywrightCodeGenerator {
    constructor() {
        this.codeLines = [];
        this.stepCounter = 1; 
        this.lastCommand = "";
        this.pendingStep = null;
    }
    
    addStep(comment) {
        this.pendingStep = `\n    // === الخطوة ${this.stepCounter}: ${comment} ===`;
    }
    
    addCommand(cmd) {
        if (this.lastCommand === cmd && cmd.trim() !== "") {
            this.pendingStep = null; 
            return;
        }
        if (this.pendingStep) {
            this.codeLines.push(this.pendingStep);
            this.stepCounter++;
            this.pendingStep = null;
        }
        this.codeLines.push(`    ${cmd}`);
        console.log(`[Generated Code]: ${cmd}`);
        this.lastCommand = cmd;
    }

    addRawBlock(comment, linesArr) {
        this.codeLines.push(`\n    // === الخطوة ${this.stepCounter}: ${comment} ===`);
        this.stepCounter++;
        for (const line of linesArr) {
            this.codeLines.push(`    ${line}`);
        }
        this.lastCommand = linesArr[linesArr.length - 1];
    }
    
    getFinalScript() {
        return `// ==========================================\n// 🤖 سكربت Playwright التحليلي المستخرج\n// يحتوي على الأكواد والخطوات المرقمة بالتسلسل (بدون تكرار)\n// ==========================================\n\nconst { chromium } = require('playwright');\n\n(async () => {\n    const browser = await chromium.launch({ headless: false });\n    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });\n    const page = await context.newPage();\n${this.codeLines.join('\n')}\n\n    // await browser.close();\n})();`;
    }
}

// ================= دوال مساعدة لإنشاء البريد =================
function generateSecurePassword() {
    const chars = "00CHAT700z00";
    let password = "";
    for(let i=0; i<12; i++) password += chars.charAt(crypto.randomInt(0, chars.length));
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
const GRID_COLS = 45; 
const GRID_ROWS = 25; 
const TOTAL_CELLS = GRID_COLS * GRID_ROWS; 

async function drawGridAndScreenshot(page, chatId, caption) {
    console.log('\n--- 🟡 بدء رسم الشبكة الشفافة المصغرة جداً (1125 مربع) ---');
    const p = path.join(__dirname, `grid_${Date.now()}.png`);

    try {
        await page.screenshot({ path: p, fullPage: false });

        let canvasModule;
        try {
            canvasModule = require('canvas');
        } catch (e) {
            console.log('❌ مكتبة canvas غير متوفرة.');
            await bot.sendMessage(chatId, "⚠️ يرجى تثبيت مكتبة canvas لتشغيل هذه الميزة.", { parse_mode: 'Markdown' });
            return;
        }

        const { createCanvas, loadImage } = canvasModule;
        const img = await loadImage(p);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0);

        const cellW = img.width / GRID_COLS;
        const cellH = img.height / GRID_ROWS;

        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                const i = row * GRID_COLS + col;
                const x = col * cellW;
                const y = row * cellH;

                ctx.fillStyle = 'rgba(0,0,0,0.0)';
                ctx.fillRect(x, y, cellW, cellH);

                ctx.strokeStyle = 'rgba(255,255,0,0.3)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, cellW, cellH);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.font = 'bold 9px Sans'; 
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const tx = x + cellW / 2;
                const ty = y + cellH / 2;

                ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.lineWidth = 2;
                ctx.strokeText(String(i), tx, ty);
                ctx.fillText(String(i), tx, ty);
            }
        }

        fs.writeFileSync(p, canvas.toBuffer('image/png'));
        await bot.sendPhoto(chatId, p, { caption: caption, parse_mode: 'Markdown' });

    } catch (error) {
        console.error('❌ حدث خطأ أثناء الرسم:', error.message);
    } finally {
        if (fs.existsSync(p)) fs.unlinkSync(p);
    }
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
                [{ text: '🌐 البحث عن الرابط', callback_data: 'int_goto_url' }],
                [{ text: '🔍 البحث على النص والضغط عليه', callback_data: 'int_search_text' }],
                [{ text: '🖱️ ضغط ماوس (شبكة شفافة)', callback_data: 'int_mouse_menu' }],
                [{ text: '⌨️ كتابة نص', callback_data: 'int_type_text' }, { text: '↩️ انتر (Enter)', callback_data: 'int_press_enter' }],
                [{ text: '📸 تحديث الشاشة', callback_data: 'int_refresh' }, { text: '🔐 المتابعة الى AF2', callback_data: 'int_continue_af2' }],
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
    await bot.sendMessage(chatId, `🖱️ **قائمة التحكم بالماوس الدقيق (${TOTAL_CELLS} مربع):**\nشاهد المربعات -> أرسل الرقم -> اضغط كليك.`, opts);
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

        codeGen.addStep("تهيئة المتصفح والدخول لصفحة التسجيل");
        codeGen.addCommand(`await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" });`);
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        currentPhotoId = await sendStepPhoto(page, chatId, "🌐 فتح المتصفح", currentPhotoId);

        codeGen.addStep("الضغط على زر التسجيل (Sign up)");
        const signupBtn = page.getByRole("button", { name: "Sign up" });
        await signupBtn.waitFor({ state: 'visible', timeout: 30000 }).catch(() => page.locator('button:has-text("Sign up")').click());
        await signupBtn.click();
        codeGen.addCommand(`await page.locator('button:has-text("Sign up")').click();`);
        
        codeGen.addStep("إدخال البريد الإلكتروني");
        await page.waitForSelector('input[name="email"], input[id="email-input"]', {timeout: 30000});
        await page.locator('input[name="email"], input[id="email-input"]').first().fill(email);
        codeGen.addCommand(`await page.locator('input[name="email"]').fill("${email}");`);
        await sleep(1000);
        
        codeGen.addStep("الاستمرار بعد إدخال الإيميل");
        await page.getByRole("button", { name: "Continue", exact: true }).click({ force: true });
        codeGen.addCommand(`await page.getByRole("button", { name: "Continue" }).click();`);
        await sleep(3000);

        codeGen.addStep("إدخال كلمة المرور");
        await page.waitForSelector('input[type="password"]', {timeout: 30000});
        await page.locator('input[type="password"]').first().fill(chatGptPassword);
        codeGen.addCommand(`await page.locator('input[type="password"]').fill("${chatGptPassword}");`);
        await sleep(1000);

        codeGen.addStep("المتابعة لإكمال التسجيل");
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
            codeGen.addStep("إدخال كود التحقق (OTP) من البريد");
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

        const nameInputNode = page.getByRole("textbox", { name: "Full name" }).first();
        if (await nameInputNode.isVisible({ timeout: 15000 }).catch(() => false)) {
            codeGen.addStep("تعبئة بيانات الاسم وتاريخ الميلاد");
            await nameInputNode.fill("Auto User");
            await sleep(1000);
            const bdayInput = page.locator('input[name="birthday"], [aria-label*="birthday" i]').first();
            if (await bdayInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await bdayInput.focus().catch(()=>{}); await bdayInput.click({ force: true }).catch(()=>{});
                await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
                await page.keyboard.type("01012000", { delay: 150 });
            } else {
                await page.keyboard.press('Tab');
                await page.keyboard.type("25", { delay: 150 });
            }
            const finishBtn = page.getByRole("button", { name: "Continue" }).last();
            if (await finishBtn.isVisible().catch(() => false)) await finishBtn.click({ force: true });
            else await page.keyboard.press('Enter');
            await sleep(8000); 
        }

        await updateStatus("في انتظار الصفحة الرئيسية...");
        await page.waitForURL('**/chat', {timeout: 30000}).catch(()=>{});
        await sleep(3000); 
        
        if (page.url().includes('/chat')) {
             const result = `${email}|${chatGptPassword}`;
             fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
             
             userState[chatId].accountInfo = { email: email, password: chatGptPassword };

             // --- تنظيف التكرار في السكربت المستخرج ---
             codeGen.addRawBlock(
                 "دالة ذكية لتخطي النوافذ الترحيبية (إن وجدت) دون تكرار الأكواد",
                 [
                     `const skipBtns = ["Skip", "Skip Tour", "Continue", "Okay", "Done"];`,
                     `for (let i = 0; i < 2; i++) {`,
                     `    for (const btnText of skipBtns) {`,
                     `        try {`,
                     `            const btn = page.locator(\`text="\${btnText}"\`).first();`,
                     `            if (await btn.isVisible({ timeout: 1000 })) await btn.click({ force: true });`,
                     `        } catch (e) {}`,
                     `    }`,
                     `}`
                 ]
             );
             
             const skipSequence = ["Skip", "Skip Tour", "Continue", "Okay", "Done"];
             for (let i = 0; i < 2; i++) {
                 for (const btnText of skipSequence) {
                     try {
                         const btn = page.locator(`text="${btnText}"`).first();
                         if (await btn.isVisible({ timeout: 1500 })) {
                             await btn.click({ force: true });
                             await sleep(1000);
                         }
                     } catch (e) {}
                 }
             }

             if (isManual) {
                 currentPhotoId = await sendStepPhoto(page, chatId, `✅ **تم إنشاء الحساب بنجاح:**\n\`${result}\`\n\nيتم الآن الانتظار 5 ثواني للتوجه إلى إعدادات الأمان...`, currentPhotoId);

                 codeGen.addStep("الانتظار لمدة 5 ثواني قبل التوجه لإعدادات الأمان");
                 await sleep(5000);
                 codeGen.addCommand(`await new Promise(r => setTimeout(r, 5000));`);

                 codeGen.addStep("الدخول لإعدادات الأمان (Security) والتوقف للتحكم اليدوي");
                 await page.goto("https://chatgpt.com/#settings/Security", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
                 codeGen.addCommand(`await page.goto("https://chatgpt.com/#settings/Security");`);
                 await sleep(4000);

                 // 🛡️ درع الحماية في الوضع اليدوي قبل أخذ الصورة
                 codeGen.addRawBlock(
                     "تأكيد إغلاق أي نافذة ترحيبية متأخرة تحجب إعدادات الأمان",
                     [
                         `try {`,
                         `    const skipTourBtn = page.locator('text="Skip Tour"').first();`,
                         `    if (await skipTourBtn.isVisible({ timeout: 2000 })) await skipTourBtn.click({ force: true });`,
                         `} catch (e) {}`,
                         `await page.keyboard.press('Escape'); // إجراء احتياطي`
                     ]
                 );
                 try {
                     const skipTourBtn = page.locator('text="Skip Tour"').first();
                     if (await skipTourBtn.isVisible({ timeout: 2000 }).catch(()=>false)) {
                         await skipTourBtn.click({ force: true });
                         await sleep(1000);
                     }
                 } catch (e) {}
                 await page.keyboard.press('Escape');
                 await sleep(500);

                 currentPhotoId = await sendStepPhoto(page, chatId, "🛑 **نحن الآن في صفحة الأمان (Security).**\nاستخدم الماوس لتحديد الزر الذي يظهر الكود السري (Trouble scanning).\n\nبمجرد أن يظهر الكود، اضغط **(🔐 المتابعة الى AF2)** من القائمة ليكمل البوت العملية تلقائياً ويستخرج السكربت.", currentPhotoId);
                 
                 await startInteractiveMode(chatId, page, context, tempDir, codeGen, currentPhotoId);
                 return true;

             } else {
                 currentPhotoId = await sendStepPhoto(page, chatId, `✅ **نجاح (تلقائي):**\n\`${result}\`\n\nيتم الآن الانتقال لتفعيل المصادقة الثنائية (2FA) عبر المسار الجديد والمختصر...`, currentPhotoId);
                 
                 // === الخطوة 9: الانتظار لمدة 5 ثواني قبل التوجه لإعدادات الأمان ===
                 codeGen.addStep("الانتظار لمدة 5 ثواني قبل التوجه لإعدادات الأمان");
                 await sleep(5000);
                 codeGen.addCommand(`await new Promise(r => setTimeout(r, 5000));`);

                 // === الخطوة 10: الدخول لإعدادات الأمان (Security) ===
                 codeGen.addStep("الدخول لإعدادات الأمان (Security)");
                 await page.goto("https://chatgpt.com/#settings/Security", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
                 codeGen.addCommand(`await page.goto("https://chatgpt.com/#settings/Security");`);
                 await sleep(4000);

                 // 🛡️ ========================================================
                 // 💡 درع الحماية (Shield): قنص نافذة (Ask anything / Skip Tour) المتأخرة
                 // يتم إغلاقها فور ظهورها في صفحة الأمان لكي لا تحجب الماوس
                 // ========================================================
                 codeGen.addRawBlock(
                     "تأكيد إغلاق نافذة (Ask anything / Skip Tour) المتأخرة التي تحجب إعدادات الأمان",
                     [
                         `try {`,
                         `    const skipTourBtn = page.locator('text="Skip Tour"').first();`,
                         `    if (await skipTourBtn.isVisible({ timeout: 2000 })) await skipTourBtn.click({ force: true });`,
                         `} catch (e) {}`,
                         `await page.keyboard.press('Escape'); // إجراء احتياطي لقتل النوافذ العنيدة`
                     ]
                 );

                 try {
                     const skipTourBtn = page.locator('text="Skip Tour"').first();
                     if (await skipTourBtn.isVisible({ timeout: 2000 }).catch(()=>false)) {
                         await skipTourBtn.click({ force: true });
                         await sleep(1000);
                     }
                 } catch (e) {}
                 await page.keyboard.press('Escape');
                 await sleep(1000); // استراحة لتنظيف الشاشة قبل الماوس

                 // === الخطوة 11: الضغط كليك بالماوس على الإحداثيات: X=986.56, Y=353.28 ===
                 codeGen.addStep("الضغط كليك بالماوس على الإحداثيات: X=986.56, Y=353.28");
                 try {
                     await page.mouse.click(986.56, 353.28);
                 } catch(e) {}
                 codeGen.addCommand(`await page.mouse.click(986.56, 353.28);`);
                 await sleep(3000);

                 // === الخطوة 12: البحث عن النص "Trouble scanning?" والضغط عليه ===
                 codeGen.addStep('البحث عن النص "Trouble scanning?" والضغط عليه');
                 try {
                     const troubleBtn = page.locator('text="Trouble scanning?"').first();
                     if (await troubleBtn.isVisible({ timeout: 2000 }).catch(()=>false)) {
                         await troubleBtn.click();
                     } else {
                         await page.locator('text="Trouble scanning?"').first().click({ force: true }).catch(()=>{});
                     }
                 } catch(e) {}
                 codeGen.addCommand(`await page.locator('text="Trouble scanning?"').first().click();`);
                 await sleep(2000);
                 
                 // === الخطوة 13: استخراج الكود السري والمصادقة ===
                 const pageText = await page.innerText('body');
                 const secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);
                 
                 if (secretMatch) {
                     const secretCode = secretMatch[0];
                     currentPhotoId = await sendStepPhoto(page, chatId, `🔑 تم العثور على الكود السري بنجاح:\n\`${secretCode}\``, currentPhotoId);
                     
                     codeGen.addRawBlock(
                        `استخراج الكود السري وفتح نافذة 2fa.fb.tools لنسخ 6 أرقام ولصقها تلقائياً`,
                        [
                            `const mfaPage = await context.newPage();`,
                            `await mfaPage.goto("https://2fa.fb.tools/${secretCode}", { waitUntil: "domcontentloaded" });`,
                            `await mfaPage.waitForTimeout(3000);`,
                            `const mfaText = await mfaPage.innerText('body');`,
                            `const code6Match = mfaText.match(/\\b\\d{3}\\s*\\d{3}\\b/); // يبحث عن الأرقام وتجاهل المسافة`,
                            `if (code6Match) {`,
                            `    const code6 = code6Match[0].replace(/\\s+/g, ''); // مسح المسافة لدمج الرقم`,
                            `    await mfaPage.close();`,
                            `    await page.bringToFront();`,
                            `    const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();`,
                            `    if (await codeInput.isVisible()) {`,
                            `        await codeInput.fill(code6);`,
                            `    } else {`,
                            `        await page.keyboard.type(code6, { delay: 100 });`,
                            `    }`,
                            `    await page.waitForTimeout(1500);`,
                            `    const enableBtn = page.locator('button:has-text("Verify"), button:has-text("Enable")').first();`,
                            `    if (await enableBtn.isVisible()) {`,
                            `        await enableBtn.click();`,
                            `    } else {`,
                            `        await page.keyboard.press('Enter');`,
                            `    }`,
                            `}`
                        ]
                    );
                     
                     const mfaPage = await context.newPage();
                     await mfaPage.goto(`https://2fa.fb.tools/${secretCode}`).catch(()=>{});
                     await sleep(3000);
                     const mfaText = await mfaPage.innerText('body');
                     
                     const code6Match = mfaText.match(/\b\d{3}\s*\d{3}\b/);
                     
                     if (code6Match) {
                         const code6 = code6Match[0].replace(/\s+/g, ''); // حذف المسافة ودمج الرقم
                         await mfaPage.close();
                         await page.bringToFront();
                         
                         const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();
                         if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code6);
                         else await page.keyboard.type(code6, { delay: 100 });
                         
                         await sleep(1500);
                         
                         const enableBtn = page.locator('button:has-text("Enable"), button:has-text("Verify")').first();
                         if (await enableBtn.isVisible().catch(()=>false)) await enableBtn.click();
                         else await page.keyboard.press('Enter');
                         
                         await sleep(3000);
                         
                         currentPhotoId = await sendStepPhoto(page, chatId, "✅ تمت المصادقة الثنائية (2FA) تلقائياً بنجاح وفق مسار السكربت المختصر والدقيق!", currentPhotoId);
                         codeGen.addStep("تم تفعيل 2FA بنجاح. الدخول في وضع الاستعداد بانتظار أوامرك.");
                         await startInteractiveMode(chatId, page, context, tempDir, codeGen, currentPhotoId);
                         return true;
                     }
                 }
                 
                 codeGen.addStep("تعذر استخراج كود 32 حرف. تحويل المستخدم للوضع اليدوي والشبكة.");
                 await bot.sendMessage(chatId, "⚠️ **لم يتم العثور على الكود 32 حرف كابيتال في الصفحة، سيتم تحويلك للتحكم اليدوي.**");
                 await drawGridAndScreenshot(page, chatId, "🔲 **صورة الشاشة مقسمة لمربعات:**\nاستخدم الأرقام في الصورة لمعرفة المكان الذي يجب الضغط عليه لتكملة السكربت.");
                 await startInteractiveMode(chatId, page, context, tempDir, codeGen, currentPhotoId);

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
    bot.sendMessage(chatId, "👋 نورت ! اختر العملية للبدء:", {
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

    if (query.data.startsWith('int_')) {
        const action = query.data.replace('int_', '');
        if (!state.isInteractive || !state.page) return bot.sendMessage(chatId, "⚠️ الجلسة منتهية.");

        if (action === 'goto_url') {
            bot.sendMessage(chatId, "🌐 أرسل **الرابط (URL)** الذي تريد التوجه إليه (يفضل أن يبدأ بـ http:// أو https://):", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } });
            state.step = 'awaiting_goto_url';
        }

        // === زر المتابعة إلى AF2 (الذي يولد الكود الديناميكي للتبويبات) ===
        else if (action === 'continue_af2') {
            bot.sendMessage(chatId, "⏳ جاري استخراج كود الـ 32 حرف وإكمال إجراءات الـ AF2 في نافذة جديدة...");
            try {
                let pageText = await state.page.innerText('body');
                let secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);
                
                if (!secretMatch) {
                    const troubleBtn = state.page.locator('text="Trouble scanning?"').first();
                    if (await troubleBtn.isVisible().catch(()=>false)) {
                        state.codeGen.addStep(`الضغط على "Trouble scanning?" لإظهار الكود السري`);
                        state.codeGen.addCommand(`await page.locator('text="Trouble scanning?"').first().click();`);
                        await troubleBtn.click();
                        await sleep(1500);
                        pageText = await state.page.innerText('body');
                        secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);
                    }
                }

                if (secretMatch) {
                    const secretCode = secretMatch[0];
                    
                    // === كتابة الأكواد الديناميكية الحقيقية في السكربت المُستخرج ===
                    state.codeGen.addRawBlock(
                        `استخراج الكود السري وفتح نافذة 2fa.fb.tools لنسخ 6 أرقام ولصقها تلقائياً`,
                        [
                            `const mfaPage = await context.newPage();`,
                            `await mfaPage.goto("https://2fa.fb.tools/${secretCode}", { waitUntil: "domcontentloaded" });`,
                            `await mfaPage.waitForTimeout(3000);`,
                            `const mfaText = await mfaPage.innerText('body');`,
                            `const code6Match = mfaText.match(/\\b\\d{3}\\s*\\d{3}\\b/); // يبحث عن الأرقام وتجاهل المسافة`,
                            `if (code6Match) {`,
                            `    const code6 = code6Match[0].replace(/\\s+/g, ''); // مسح المسافة لدمج الرقم`,
                            `    await mfaPage.close();`,
                            `    await page.bringToFront();`,
                            `    const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();`,
                            `    if (await codeInput.isVisible()) {`,
                            `        await codeInput.fill(code6);`,
                            `    } else {`,
                            `        await page.keyboard.type(code6, { delay: 100 });`,
                            `    }`,
                            `    await page.waitForTimeout(1500);`,
                            `    const enableBtn = page.locator('button:has-text("Verify"), button:has-text("Enable")').first();`,
                            `    if (await enableBtn.isVisible()) {`,
                            `        await enableBtn.click();`,
                            `    } else {`,
                            `        await page.keyboard.press('Enter');`,
                            `    }`,
                            `}`
                        ]
                    );

                    // التنفيذ الفعلي للبوت في المتصفح
                    const mfaPage = await state.context.newPage();
                    await mfaPage.goto(`https://2fa.fb.tools/${secretCode}`).catch(()=>{});
                    await sleep(3000);
                    
                    const mfaText = await mfaPage.innerText('body');
                    // التحديث هنا أيضاً للوضع التفاعلي
                    const code6Match = mfaText.match(/\b\d{3}\s*\d{3}\b/);
                    
                    if (code6Match) {
                        const code6 = code6Match[0].replace(/\s+/g, ''); // مسح المسافة
                        await mfaPage.close();
                        await state.page.bringToFront();
                        
                        const codeInput = state.page.locator('input[type="text"], input[placeholder*="code" i]').first();
                        if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code6);
                        else await state.page.keyboard.type(code6, { delay: 100 });
                        
                        await sleep(1500);
                        
                        const enableBtn = state.page.locator('button:has-text("Verify"), button:has-text("Enable")').first();
                        if (await enableBtn.isVisible().catch(()=>false)) await enableBtn.click();
                        else await state.page.keyboard.press('Enter');
                        
                        await sleep(3000);
                        
                        const acc = state.accountInfo || { email: "غير متوفر", password: "غير متوفر" };
                        
                        const successText = `✅ **تمت المصادقة الثنائية (AF2) بنجاح!**\n\n📧 **الايميل:** \`${acc.email}\`\n🔑 **الباسورد:** \`${acc.password}\`\n🛡️ **الرمز السري (32 حرف):** \`${secretCode}\``;
                        state.currentPhotoId = await sendStepPhoto(state.page, chatId, successText, state.currentPhotoId);
                        
                        bot.sendMessage(chatId, "✅ جاري استخراج السكربت النهائي وإغلاق الجلسة...");
                        state.isInteractive = false;
                        
                        if (state.context) await state.context.close().catch(()=>{});
                        if (state.tempDir) try { fs.rmSync(state.tempDir, { recursive: true, force: true }); } catch {}
                        
                        const jsCode = state.codeGen.getFinalScript();
                        const logPath = path.join(__dirname, `AutoGenerated_Script_${Date.now()}.js`);
                        fs.writeFileSync(logPath, jsCode);
                        
                        await bot.sendDocument(chatId, logPath, { caption: "🧑‍💻 **تم توليد السكربت النهائي المُرقم بنجاح!**\nيحتوي السكربت الآن على الآلية التلقائية (فتح تبويب، جلب الكود، ولصقه) وهو نظيف بدون تكرارات.", parse_mode: 'Markdown' });
                        fs.unlinkSync(logPath);
                        
                        if (state.resolveInteractive) state.resolveInteractive();
                        isProcessing = false;
                        sendMainMenu(chatId);
                    } else {
                        bot.sendMessage(chatId, "❌ لم أتمكن من استخراج كود الـ 6 أرقام من موقع 2FA.");
                        await sendInteractiveMenu(chatId);
                    }
                } else {
                    bot.sendMessage(chatId, "❌ لم أتمكن من العثور على كود الـ 32 حرف على الشاشة.\nتأكد من إظهاره باستخدام الماوس أولاً قبل ضغط هذا الزر.");
                    await sendInteractiveMenu(chatId);
                }
            } catch (err) {
                bot.sendMessage(chatId, `❌ حدث خطأ أثناء المتابعة لـ AF2: ${err.message}`);
                await sendInteractiveMenu(chatId);
            }
            return;
        }

        else if (action === 'search_text') {
            bot.sendMessage(chatId, "🔍 أرسل **النص** المكتوب في الصفحة (كابيتال وسمول كما هو) لكي أبحث عنه وأضغط عليه:", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } });
            state.step = 'awaiting_search_text';
        }
        else if (action === 'mouse_menu') {
            await sendMouseMenu(chatId);
        }
        else if (action === 'show_grid') {
            await drawGridAndScreenshot(state.page, chatId, `👁️ **المربعات الشفافة المعروضة (${TOTAL_CELLS} مربع):**\nالآن ارجع للقائمة واضغط إرسال رقم لتحريك الماوس.`);
            await sendMouseMenu(chatId);
        }
        else if (action === 'move_mouse') {
            bot.sendMessage(chatId, `🧭 أرسل **رقم المربع** (من 0 إلى ${TOTAL_CELLS - 1}) لكي يذهب الماوس إليه:`, { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } });
            state.step = 'awaiting_move_mouse';
        }
        else if (action === 'click_mouse') {
            if (state.mouseX !== undefined && state.mouseY !== undefined) {
                await removeRedDot(state.page);
                state.codeGen.addStep(`الضغط كليك بالماوس على الإحداثيات: X=${state.mouseX}, Y=${state.mouseY}`);
                state.codeGen.addCommand(`await page.mouse.click(${state.mouseX}, ${state.mouseY});`);
                await state.page.mouse.click(state.mouseX, state.mouseY);
                
                await sleep(1500);
                state.currentPhotoId = await sendStepPhoto(state.page, chatId, `🔴 تم الضغط (كليك) بنجاح على النقطة! وتم حفظ الخطوة.`, state.currentPhotoId);
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
            state.codeGen.addStep(`الضغط على مفتاح Enter في لوحة المفاتيح`);
            state.codeGen.addCommand(`await page.keyboard.press('Enter');`);
            await state.page.keyboard.press('Enter');
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
            
            await bot.sendDocument(chatId, logPath, { caption: "🧑‍💻 **تم توليد السكربت المُرقم بنجاح!**\nالملف الآن نظيف وخالي من التكرار.", parse_mode: 'Markdown' });
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

    // --- استقبال الرابط (URL) للتوجه إليه ---
    if (state.step === 'awaiting_goto_url' && state.isInteractive) {
        state.step = null;
        let targetUrl = text;
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = 'https://' + targetUrl; 
        }
        
        bot.sendMessage(chatId, `🌐 جاري التوجه إلى الرابط...`);
        try {
            state.codeGen.addStep(`الذهاب إلى الرابط المخصص: ${targetUrl}`);
            state.codeGen.addCommand(`await page.goto("${targetUrl}", { waitUntil: "domcontentloaded" });`);
            await state.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
            await sleep(3000);
            
            state.currentPhotoId = await sendStepPhoto(state.page, chatId, `✅ تم فتح الرابط بنجاح:\n${targetUrl}`, state.currentPhotoId);
        } catch(e) { 
            bot.sendMessage(chatId, `❌ فشل التوجه للرابط: ${e.message}`); 
        }
        await sendInteractiveMenu(chatId);
    }

    // --- استقبال النص للبحث والضغط (أداة المطورين) ---
    else if (state.step === 'awaiting_search_text' && state.isInteractive) {
        state.step = null;
        const safeText = text.replace(/'/g, "\\'");
        bot.sendMessage(chatId, `🔍 جاري البحث عن "${text}" والضغط عليه...`);
        
        try {
            const loc = state.page.locator(`text="${text}"`).first();
            if (await loc.isVisible({ timeout: 5000 }).catch(()=>false)) {
                state.codeGen.addStep(`البحث عن النص "${text}" والضغط عليه`);
                state.codeGen.addCommand(`await page.locator('text="${safeText}"').first().click();`);
                
                await loc.click();
                await sleep(1500);
                state.currentPhotoId = await sendStepPhoto(state.page, chatId, `🎯 تم العثور على "${text}" والضغط عليه بنجاح. وتم حفظ الخطوة.`, state.currentPhotoId);
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
        
        state.codeGen.addStep(`كتابة النص: "${text}" باستخدام لوحة المفاتيح`);
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

console.log("🤖 البوت يعمل الآن (مع درع حماية لتخطي نافذة Skip Tour وحل مشكلة التوقف)...");
