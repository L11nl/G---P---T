/*
 * ==========================================================
 * ChatGPT 2FA Automator & Playwright Script Generator
 * ==========================================================
 * - [التكتيك العبقري 🧠] مسار chkip.info لتدمير الاستبيانات بعد حفظ الجلسة.
 * - [الضربة المباشرة 🎯] الانتقال للأمان -> ضغط مربع 527 -> تفعيل 2FA تلقائياً.
 * - [إصلاح الماوس 🖱️] تم إصلاح قائمة الماوس والشبكة بالكامل لتعمل كخطة طوارئ.
 * - أتمتة قطعية 100%: أدخل الإيميل وكود البريد، ثم استلم الحساب جاهزاً!
 * - تسليم الحساب بصيغة نظيفة: ايميل / باسورد / رمز / رابط 2FA.
 * - توثيق كامل مستمر بصور مرقمة لكل خطوة.
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

// ================= دوال حساب المربعات والإحداثيات =================
const GRID_COLS = 45; 
const GRID_ROWS = 25; 
const TOTAL_CELLS = GRID_COLS * GRID_ROWS; 

async function clickSquareByNum(page, num) {
    const vw = 1366 / GRID_COLS;
    const vh = 768 / GRID_ROWS;
    const col = num % GRID_COLS;
    const row = Math.floor(num / GRID_COLS);
    const x = parseFloat(((col * vw) + (vw / 2)).toFixed(2));
    const y = parseFloat(((row * vh) + (vh / 2)).toFixed(2));
    await page.mouse.click(x, y);
    return { x, y };
}

// ================= نظام توليد السكربت الذكي =================
class PlaywrightCodeGenerator {
    constructor() {
        this.codeLines = [];
        this.stepCounter = 1; 
        this.lastCommand = "";
        this.pendingStep = null;
    }
    addStep(comment) { this.pendingStep = `\n    // === الخطوة ${this.stepCounter}: ${comment} ===`; }
    addCommand(cmd) {
        if (this.lastCommand === cmd && cmd.trim() !== "") { this.pendingStep = null; return; }
        if (this.pendingStep) {
            this.codeLines.push(this.pendingStep);
            this.stepCounter++;
            this.pendingStep = null;
        }
        this.codeLines.push(`    ${cmd}`);
        this.lastCommand = cmd;
    }
    addRawBlock(comment, linesArr) {
        this.codeLines.push(`\n    // === الخطوة ${this.stepCounter}: ${comment} ===`);
        this.stepCounter++;
        for (const line of linesArr) this.codeLines.push(`    ${line}`);
        this.lastCommand = linesArr[linesArr.length - 1];
    }
    getFinalScript() {
        return `// ==========================================\n// 🤖 سكربت Playwright التحليلي المستخرج (تكتيك chkip.info + المربع 527)\n// ==========================================\n\nconst { chromium } = require('playwright');\n\n(async () => {\n    const browser = await chromium.launch({ headless: false });\n    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });\n    const page = await context.newPage();\n${this.codeLines.join('\n')}\n\n    // await browser.close();\n})();`;
    }
}

// ================= دوال الإنشاء =================
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

// ================= دالة التصوير الذكية (تصوير مستمر مرقم) =================
async function sendStepPhoto(page, chatId, caption) {
    try {
        const state = userState[chatId];
        let numText = ""; let num = null;
        if (state && state.photoCounter) { num = state.photoCounter++; numText = `صورة رقم ${num}`; }
        const p = path.join(__dirname, `step_${Date.now()}_${num}.png`);
        await page.screenshot({ path: p });

        if (num !== null) {
            try {
                const { createCanvas, loadImage } = require('canvas');
                const img = await loadImage(p);
                const canvas = createCanvas(img.width, img.height);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                ctx.fillStyle = 'rgba(220, 20, 60, 0.9)'; ctx.fillRect(10, 10, 230, 50);
                ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(numText, 125, 35);
                fs.writeFileSync(p, canvas.toBuffer('image/png'));
            } catch (e) {}
        }
        const finalCaption = num !== null ? `📸 **${numText}**\n\n${caption}` : caption;
        await bot.sendPhoto(chatId, p, { caption: finalCaption, parse_mode: 'Markdown' });
        if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (err) {}
}

// ================= أنظمة المربعات الشفافة للطوارئ =================
async function drawGridAndScreenshot(page, chatId, caption) {
    const state = userState[chatId];
    let numText = ""; let num = null;
    if (state && state.photoCounter) { num = state.photoCounter++; numText = `صورة رقم ${num}`; }
    const p = path.join(__dirname, `grid_${Date.now()}.png`);
    try {
        await page.screenshot({ path: p, fullPage: false });
        let canvasModule; try { canvasModule = require('canvas'); } catch (e) { 
            await bot.sendMessage(chatId, "⚠️ مكتبة canvas غير متوفرة. يرجى تثبيتها لرسم المربعات."); return; 
        }
        const { createCanvas, loadImage } = canvasModule;
        const img = await loadImage(p); const canvas = createCanvas(img.width, img.height); const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const cellW = img.width / GRID_COLS; const cellH = img.height / GRID_ROWS;
        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                const i = row * GRID_COLS + col; const x = col * cellW; const y = row * cellH;
                ctx.fillStyle = 'rgba(0,0,0,0.0)'; ctx.fillRect(x, y, cellW, cellH);
                ctx.strokeStyle = 'rgba(255,255,0,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, cellW, cellH);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; ctx.font = 'bold 9px Sans'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const tx = x + cellW / 2; const ty = y + cellH / 2;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'; ctx.lineWidth = 2; ctx.strokeText(String(i), tx, ty); ctx.fillText(String(i), tx, ty);
            }
        }
        if (num !== null) {
            ctx.fillStyle = 'rgba(220, 20, 60, 0.9)'; ctx.fillRect(10, 10, 230, 50);
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(numText, 125, 35);
        }
        fs.writeFileSync(p, canvas.toBuffer('image/png'));
        const finalCaption = num !== null ? `📸 **${numText}**\n\n${caption}` : caption;
        await bot.sendPhoto(chatId, p, { caption: finalCaption, parse_mode: 'Markdown' });
    } catch (error) {} finally { if (fs.existsSync(p)) fs.unlinkSync(p); }
}

async function removeRedDot(page) {
    await page.evaluate(() => { const dot = document.getElementById('bot-red-dot'); if (dot) dot.remove(); });
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

// ================= أنظمة القوائم التفاعلية المُصلحة =================
async function sendInteractiveMenu(chatId, text = "🎮 **أنت الآن تتحكم بالمتصفح يدوياً:**") {
    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '🌐 البحث عن الرابط', callback_data: 'int_goto_url' }],
        [{ text: '🔍 البحث على النص والضغط', callback_data: 'int_search_text' }],
        [{ text: '🖱️ ضغط ماوس (شبكة شفافة)', callback_data: 'int_mouse_menu' }],
        [{ text: '⌨️ كتابة نص', callback_data: 'int_type_text' }, { text: '↩️ انتر (Enter)', callback_data: 'int_press_enter' }],
        [{ text: '📸 تحديث الشاشة', callback_data: 'int_refresh' }, { text: '🔐 إكمال 2FA آلياً', callback_data: 'int_continue_af2' }],
        [{ text: '✅ إنهاء واستخراج السكربت', callback_data: 'int_finish' }]
    ]}};
    await bot.sendMessage(chatId, text, opts);
}

async function sendMouseMenu(chatId) {
    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '👁️ مشاهدة المربعات الشفافة', callback_data: 'int_show_grid' }],
        [{ text: '🧭 تحديد رقم المربع', callback_data: 'int_move_mouse' }],
        [{ text: '🔴 كليك (Click)', callback_data: 'int_click_mouse' }],
        [{ text: '🔙 رجوع للقائمة الرئيسية', callback_data: 'int_back_main' }]
    ]}};
    await bot.sendMessage(chatId, `🖱️ **قائمة التحكم بالماوس الدقيق (${TOTAL_CELLS} مربع):**\nاضغط لتحديد الرقم أولاً، ثم اضغط (كليك) لتنفيذ الضربة.`, opts);
}

async function startInteractiveMode(chatId, page, context, tempDir, codeGen) {
    userState[chatId].isInteractive = true; userState[chatId].page = page; userState[chatId].context = context;
    userState[chatId].tempDir = tempDir; userState[chatId].codeGen = codeGen;
    await sendInteractiveMenu(chatId, "🎮 **تم التحويل للوضع اليدوي (الطوارئ):**");
    return new Promise(resolve => { userState[chatId].resolveInteractive = resolve; });
}

// ================= الدالة الرئيسية للعملية =================
async function createAccountLogic(chatId, isManual, manualData = null) {
    let modeText = isManual ? "(إدخال مخصص -> تكتيك chkip.info)" : "(تلقائي وتكتيك chkip.info)";
    let statusMsgID = null;
    
    userState[chatId] = { step: null, cancel: false, isInteractive: false, photoCounter: 1 };
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
    let context, page;

    try {
        context = await chromium.launchPersistentContext(tempDir, {
            headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1366, height: 768 }
        });
        page = await context.newPage();

        codeGen.addStep("تهيئة المتصفح والدخول لصفحة التسجيل");
        codeGen.addCommand(`await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" });`);
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await sendStepPhoto(page, chatId, "🌐 فتح المتصفح والدخول لصفحة التسجيل");

        codeGen.addStep("الضغط على زر التسجيل (Sign up)");
        const signupBtn = page.locator('text=/sign up/i >> visible=true').first();
        if (await signupBtn.isVisible({ timeout: 15000 }).catch(()=>false)) {
            await signupBtn.click({ force: true });
        } else {
            await page.getByRole("button", { name: "Sign up" }).click();
        }
        codeGen.addCommand(`await page.locator('button:has-text("Sign up")').click();`);
        await sleep(2000);
        await sendStepPhoto(page, chatId, "👆 تم الضغط على خيار Sign up");
        
        codeGen.addStep("إدخال البريد الإلكتروني");
        await page.waitForSelector('input[name="email"], input[id="email-input"]', {timeout: 30000});
        await page.locator('input[name="email"], input[id="email-input"]').first().fill(email);
        codeGen.addCommand(`await page.locator('input[name="email"]').fill("${email}");`);
        await sleep(1000);
        await sendStepPhoto(page, chatId, `✉️ تمت كتابة الإيميل:\n${email}`);
        
        codeGen.addStep("الاستمرار بعد إدخال الإيميل");
        await page.getByRole("button", { name: "Continue", exact: true }).click({ force: true });
        codeGen.addCommand(`await page.getByRole("button", { name: "Continue" }).click();`);
        await sleep(3000);

        codeGen.addStep("إدخال كلمة المرور");
        await page.waitForSelector('input[type="password"]', {timeout: 30000});
        await page.locator('input[type="password"]').first().fill(chatGptPassword);
        codeGen.addCommand(`await page.locator('input[type="password"]').fill("${chatGptPassword}");`);
        await sleep(1000);
        await sendStepPhoto(page, chatId, "🔑 تمت كتابة الباسورد");

        codeGen.addStep("المتابعة لإكمال التسجيل");
        await page.getByRole("button", { name: "Continue" }).click({ force: true });
        codeGen.addCommand(`await page.getByRole("button", { name: "Continue" }).click();`);
        await sleep(7000); 

        checkCancel();
        
        let code = null;
        if (isManual) {
            await updateStatus("🛑 يرجى إرسال الكود المكون من 6 أرقام (الذي وصل للبريد) هنا في الشات الآن.");
            await sendStepPhoto(page, chatId, "💬 النظام في وضع الاستعداد... يرجى إرسال الكود هنا في التليجرام.");
            code = await new Promise((resolve) => {
                const listener = (msg) => {
                    if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) {
                        bot.removeListener('message', listener); resolve(msg.text.trim());
                    }
                };
                bot.on('message', listener);
            });
            await updateStatus("✅ تم استلام الكود. التكتيك العسكري സيتولى القيادة الآن، اترك الهاتف تماماً! 🚀");
        } else {
            await updateStatus("في انتظار صفحة الكود...");
            code = await waitForMailTmCode(email, mailToken, chatId, 100);
        }

        if (code) {
            codeGen.addStep("إدخال كود التحقق (OTP) من البريد");
            const codeInput = page.getByRole("textbox", { name: "Code" });
            await codeInput.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => { await page.keyboard.type(code); });
            if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code);
            codeGen.addCommand(`await page.keyboard.type("${code}");`);
            await sleep(2000);
            await sendStepPhoto(page, chatId, `📨 تمت كتابة الكود: ${code}`);
        }

        const continueBtnAfterCode = page.locator('button:has-text("Continue") >> visible=true').last();
        if (await continueBtnAfterCode.isVisible().catch(()=>false)) await continueBtnAfterCode.click({ force: true });
        else await page.keyboard.press('Enter');
        await sleep(5000); 

        // =======================================================================
        // 👤 مرحلة تعبئة البيانات بذكاء (الاسم والعمر)
        // =======================================================================
        codeGen.addStep("تعبئة بيانات الاسم وتاريخ الميلاد إن ظهرت");
        const nameBox = page.locator('input[name*="name" i], [aria-label*="name" i], [placeholder*="name" i], input[autocomplete="name"]').first();
        
        try {
            await nameBox.waitFor({ state: 'visible', timeout: 10000 });
            if (await nameBox.isVisible()) {
                const firstNames = ["James", "John", "Robert", "Michael", "William", "David", "Emma", "Olivia", "Sophia", "Ava"];
                const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis"];
                const randomName = firstNames[Math.floor(Math.random() * firstNames.length)] + " " + lastNames[Math.floor(Math.random() * lastNames.length)];
                
                await nameBox.fill(randomName);
                codeGen.addCommand(`await page.locator('input[name*="name" i]').first().fill("${randomName}");`);
                await sleep(500);
                
                const bdayBox = page.locator('input[name*="birth" i], [aria-label*="birth" i], [placeholder*="birth" i], input[type="date"], input[placeholder*="YYYY" i]').first();
                const ageBox = page.locator('input[name*="age" i], [aria-label*="age" i], [placeholder*="age" i]').first();
                
                if (await bdayBox.isVisible().catch(()=>false)) {
                    await bdayBox.focus(); await bdayBox.click({ force: true }).catch(()=>{});
                    await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
                    await page.keyboard.type("01/01/2000", { delay: 100 });
                    codeGen.addCommand(`await page.keyboard.type("01/01/2000");`);
                } else if (await ageBox.isVisible().catch(()=>false)) {
                    await ageBox.focus(); await ageBox.click({ force: true }).catch(()=>{});
                    await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
                    await page.keyboard.type("25", { delay: 100 });
                    codeGen.addCommand(`await page.keyboard.type("25");`);
                } else {
                    await page.keyboard.press('Tab'); await page.keyboard.type("25", { delay: 100 });
                    codeGen.addCommand(`await page.keyboard.press('Tab'); await page.keyboard.type("25");`);
                }
                
                await sendStepPhoto(page, chatId, `👤 تم تعبئة البيانات (الاسم: ${randomName} | الميلاد تم تحديده)`);
                
                const finishBtn = page.locator('text=/continue/i >> visible=true, text=/agree/i >> visible=true, text=/finish/i >> visible=true').first();
                if (await finishBtn.isVisible().catch(() => false)) {
                    await finishBtn.evaluate(n=>n.click()).catch(()=>finishBtn.click({ force: true }));
                    codeGen.addCommand(`await page.locator('button:has-text("Continue")').click();`);
                } else {
                    await page.keyboard.press('Enter');
                    codeGen.addCommand(`await page.keyboard.press('Enter');`);
                }
            }
        } catch(e) {}

        userState[chatId].accountInfo = { email: email, password: chatGptPassword };
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), `${email}|${chatGptPassword}\n`);

        // =========================================================================================
        // 🔒 خطوة تأمين الجلسة (انتظار 4 ثوانٍ مهمة جداً قبل الهروب)
        // =========================================================================================
        await sendStepPhoto(page, chatId, "⏳ جاري الانتظار 4 ثوانٍ لضمان حفظ تسجيل الدخول (Cookies) في سيرفرات ChatGPT...");
        await sleep(4000);
        codeGen.addStep("الانتظار 4 ثوانٍ لحفظ الجلسة في المتصفح قبل الانتقال");
        codeGen.addCommand(`await page.waitForTimeout(4000);`);

        // =========================================================================================
        // 🚀 الثغرة الذكية (Bypass Exploit): فتح chkip.info لتدمير النوافذ
        // =========================================================================================
        codeGen.addStep("الانتقال إلى chkip.info لتدمير النوافذ الترحيبية وتفريغ الاستبيانات");
        await page.goto("https://chkip.info/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
        codeGen.addCommand(`await page.goto("https://chkip.info/", { waitUntil: "domcontentloaded" });`);
        await sendStepPhoto(page, chatId, "🌐 تم فتح الرابط الخارجي (chkip.info) بنجاح لتدمير النوافذ.");

        codeGen.addStep("الانتظار ثانيتين في الرابط الخارجي");
        await sleep(2000);
        codeGen.addCommand(`await page.waitForTimeout(2000);`);

        // =========================================================================================
        // 🎯 مسار 527 الدقيق (The 527 Path)
        // =========================================================================================

        codeGen.addStep("العودة المباشرة إلى صفحة إعدادات الأمان (Security)");
        await page.goto("https://chatgpt.com/#settings/Security", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
        codeGen.addCommand(`await page.goto("https://chatgpt.com/#settings/Security", { waitUntil: "domcontentloaded" });`);
        await sleep(4000); 
        await sendStepPhoto(page, chatId, "⚙️ تم العودة والدخول لصفحة الأمان جاهزاً للضغط.");

        codeGen.addStep("الضغط كليك بالماوس على المربع 527 لإظهار إعدادات 2FA");
        try {
            const coords527 = await clickSquareByNum(page, 527);
            codeGen.addCommand(`await page.mouse.click(${coords527.x}, ${coords527.y}); // المربع 527`);
            await sleep(2000);
            await sendStepPhoto(page, chatId, "🎯 تم الضغط كليك على المربع 527 (الإحداثيات السحرية).");
        } catch(e) {}

        // تأمين إضافي (Fallback) 
        try {
            const troubleCheck = page.locator('text=/trouble scanning/i >> visible=true').first();
            if (!(await troubleCheck.isVisible().catch(()=>false))) {
                const authToggleBtn = page.locator('button[role="switch"]').last();
                if (await authToggleBtn.isVisible().catch(()=>false)) await authToggleBtn.click({ force: true });
                else await page.locator('text=/authenticator app/i >> visible=true').first().click({ force: true }).catch(()=>{});
                await sleep(2000);
            }
        } catch(e){}

        codeGen.addStep('البحث عن النص Trouble scanning والضغط عليه لإظهار الكود');
        try {
            const troubleCheck = page.locator('text=/trouble scanning/i >> visible=true').first();
            if (await troubleCheck.isVisible({timeout: 3000}).catch(()=>false)) {
                await troubleCheck.evaluate(n=>n.click()).catch(()=>troubleCheck.click());
                codeGen.addCommand(`await page.locator('text=/trouble scanning/i >> visible=true').first().click();`);
                await sleep(2000);
                await sendStepPhoto(page, chatId, '✅ تم الضغط على "Trouble scanning?".');
            }
        } catch(e) {}

        const pageText = await page.innerText('body').catch(()=>'');
        const secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);

        // ================== المرحلة النهائية: استخراج التفعيل والتسليم ==================
        if (secretMatch) {
            const secretCodeFinal = secretMatch[0];
            await sendStepPhoto(page, chatId, `🛡️ نجاح المسار! تم استخراج الكود السري:\n${secretCodeFinal}`);
            
            codeGen.addRawBlock(`جلب كود التحقق من 2fa.fb.tools ولصقه لتأكيد المصادقة`, [
                `const mfaPage = await context.newPage();`,
                `await mfaPage.goto("https://2fa.fb.tools/${secretCodeFinal}", { waitUntil: "domcontentloaded" });`,
                `await mfaPage.waitForTimeout(3000);`,
                `const mfaText = await mfaPage.innerText('body');`,
                `const code6Match = mfaText.match(/\\b\\d{3}\\s*\\d{3}\\b/);`,
                `if (code6Match) {`,
                `    const code6 = code6Match[0].replace(/\\s+/g, '');`,
                `    await mfaPage.close();`,
                `    await page.bringToFront();`,
                `    const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();`,
                `    if (await codeInput.isVisible()) await codeInput.fill(code6);`,
                `    else await page.keyboard.type(code6, { delay: 100 });`,
                `    await page.waitForTimeout(1500);`,
                `    const enableBtn = page.locator('text=/verify/i >> visible=true, text=/enable/i >> visible=true').first();`,
                `    if (await enableBtn.isVisible()) await enableBtn.evaluate(n=>n.click()).catch(()=>enableBtn.click());`,
                `    else await page.keyboard.press('Enter');`,
                `}`
            ]);
            
            const mfaPage = await context.newPage();
            await mfaPage.goto(`https://2fa.fb.tools/${secretCodeFinal}`).catch(()=>{});
            await sleep(3000);
            await sendStepPhoto(mfaPage, chatId, "🌐 تم فتح موقع الـ 2FA لنسخ الكود ذو الـ 6 أرقام");
            
            const mfaText = await mfaPage.innerText('body');
            const code6Match = mfaText.match(/\b\d{3}\s*\d{3}\b/);
            
            if (code6Match) {
                const code6 = code6Match[0].replace(/\s+/g, ''); 
                await mfaPage.close();
                await page.bringToFront();
                
                const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();
                if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code6);
                else await page.keyboard.type(code6, { delay: 100 });
                
                await sleep(1500);
                await sendStepPhoto(page, chatId, `⌨️ تم لصق كود التحقق 6 أرقام: ${code6}`);
                
                const enableBtn = page.locator('text=/verify/i >> visible=true, text=/enable/i >> visible=true').first();
                if (await enableBtn.isVisible().catch(()=>false)) await enableBtn.evaluate(n=>n.click()).catch(()=>enableBtn.click());
                else await page.keyboard.press('Enter');
                
                await sleep(3000);
                await sendStepPhoto(page, chatId, "✅ تمت عملية التحقق والتفعيل النهائي للـ 2FA");
                
                // ==== التسليم النهائي للحساب ====
                const finalMsg = `ايميل: ${email}\nباسورد: ${chatGptPassword}\nرمز المصادقة الثنائة: ${secretCodeFinal}\nالرابط: https://2fa.fb.tools/${secretCodeFinal}`;
                await bot.sendMessage(chatId, finalMsg);
                
                const jsCode = codeGen.getFinalScript();
                const logPath = path.join(__dirname, `AutoGenerated_Script_${Date.now()}.js`);
                fs.writeFileSync(logPath, jsCode);
                await bot.sendDocument(chatId, logPath, { caption: "🧑‍💻 **تم توليد السكربت النهائي بنجاح!**" });
                fs.unlinkSync(logPath);

                bot.sendMessage(chatId, "✅ اكتملت المهمة 100% آلياً وتم إغلاق المتصفح بنجاح تام.");
                
                if (context) await context.close().catch(()=>{});
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
                isProcessing = false;
                sendMainMenu(chatId);
                return true; 
            }
        }
             
        // خطة الطوارئ
        codeGen.addStep("فشل العثور على كود 32 حرف. تحويل للوضع اليدوي (شبكة المربعات).");
        await bot.sendMessage(chatId, "⚠️ **لم يظهر الكود السري! تم تفعيل وضع الطوارئ للتدخل اليدوي.**");
        await drawGridAndScreenshot(page, chatId, "🔲 **أنت الآن في وضع الطوارئ، استخدم الأرقام.**");
        await startInteractiveMode(chatId, page, context, tempDir, codeGen);

    } catch (error) {
        if (error.message === "CANCELLED_BY_USER") return false;
        await bot.sendMessage(chatId, `❌ توقف بسبب خطأ: ${error.message}`);
        if (page && context && !userState[chatId].cancel) {
            await startInteractiveMode(chatId, page, context, tempDir, codeGen);
        }
    } finally {
        if (userState[chatId] && !userState[chatId].isInteractive) {
            if (context) await context.close().catch(()=>{});
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
        }
    }
    return true;
}

// ================= القوائم واستجابات البوت (مصلحة 100%) =================
function sendMainMenu(chatId) {
    bot.sendMessage(chatId, "👋 أهلاً بك! اختر العملية للبدء:", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '▶️ إنشاء آلي (مسار chkip + مربع 527)', callback_data: 'create_auto' }],
                [{ text: '✍️ تشغيل مخصص (إيميل + كود -> أتمتة)', callback_data: 'create_manual' }],
                [{ text: '🛑 إلغاء العملية', callback_data: 'cancel' }]
            ]
        }
    });
}

bot.onText(/\/start/, (msg) => {
    if (!userState[msg.chat.id]) userState[msg.chat.id] = { step: null, cancel: false, isInteractive: false, photoCounter: 1 };
    else userState[msg.chat.id].photoCounter = 1;
    sendMainMenu(msg.chat.id);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    bot.answerCallbackQuery(query.id).catch(() => {});
    
    if (!userState[chatId]) userState[chatId] = { step: null, cancel: false, isInteractive: false, photoCounter: 1 };
    const state = userState[chatId];

    if (query.data.startsWith('int_')) {
        const action = query.data.replace('int_', '');
        if (!state.isInteractive || !state.page) return bot.sendMessage(chatId, "⚠️ الجلسة منتهية.");

        try {
            if (action === 'goto_url') {
                bot.sendMessage(chatId, "🌐 أرسل **الرابط (URL)** الذي تريد التوجه إليه:");
                state.step = 'awaiting_goto_url';
            }
            else if (action === 'search_text') {
                bot.sendMessage(chatId, "🔍 أرسل **النص** للبحث والضغط:");
                state.step = 'awaiting_search_text';
            }
            else if (action === 'mouse_menu') { 
                state.step = null;
                await sendMouseMenu(chatId); 
            }
            else if (action === 'show_grid') {
                await drawGridAndScreenshot(state.page, chatId, `👁️ **شبكة المربعات الطارئة**`);
                await sendMouseMenu(chatId);
            }
            else if (action === 'move_mouse') {
                bot.sendMessage(chatId, `🧭 أرسل **رقم المربع** للتحريك:` );
                state.step = 'awaiting_move_mouse';
            }
            else if (action === 'click_mouse') {
                if (state.mouseX !== undefined && state.mouseY !== undefined) {
                    await removeRedDot(state.page).catch(()=>{});
                    if (state.codeGen) {
                        state.codeGen.addStep(`الضغط كليك يدوياً على الإحداثيات: X=${state.mouseX}, Y=${state.mouseY}`);
                        state.codeGen.addCommand(`await page.mouse.click(${state.mouseX}, ${state.mouseY});`);
                    }
                    await state.page.mouse.click(state.mouseX, state.mouseY);
                    await sleep(1500); 
                    await sendStepPhoto(state.page, chatId, "🎯 تم الضغط (كليك) بنجاح!");
                } else {
                    bot.sendMessage(chatId, "⚠️ حرك الماوس إلى رقم مربع أولاً عبر زر (🧭 إرسال رقم المربع).");
                }
                await sendInteractiveMenu(chatId);
            }
            else if (action === 'type_text') {
                bot.sendMessage(chatId, "⌨️ أرسل النص ليتم كتابته:");
                state.step = 'awaiting_type_text';
            }
            else if (action === 'press_enter') {
                await state.page.keyboard.press('Enter'); 
                await sleep(1500);
                await sendStepPhoto(state.page, chatId, "تم الضغط على Enter."); 
                await sendInteractiveMenu(chatId);
            }
            else if (action === 'refresh') {
                await sendStepPhoto(state.page, chatId, "تحديث الشاشة."); 
                await sendInteractiveMenu(chatId);
            }
            else if (action === 'continue_af2') {
                bot.sendMessage(chatId, "⏳ محاولة الطوارئ لاستخراج الكود وإكمال التفعيل...");
                let pageText = await state.page.innerText('body');
                let secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);
                
                if (!secretMatch) {
                    const troubleBtn = state.page.locator('text=/trouble scanning/i >> visible=true').first();
                    if (await troubleBtn.isVisible().catch(()=>false)) {
                        await troubleBtn.evaluate(n=>n.click()).catch(()=>troubleBtn.click());
                        await sleep(1500);
                        await sendStepPhoto(state.page, chatId, "تم الضغط لإظهار الكود הסري");
                        pageText = await state.page.innerText('body');
                        secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);
                    }
                }

                if (secretMatch) {
                    const secretCode = secretMatch[0];
                    await sendStepPhoto(state.page, chatId, `تم إيجاد الكود:\n${secretCode}`);
                    
                    const mfaPage = await state.context.newPage();
                    await mfaPage.goto(`https://2fa.fb.tools/${secretCode}`).catch(()=>{});
                    await sleep(3000);
                    
                    const mfaText = await mfaPage.innerText('body');
                    const code6Match = mfaText.match(/\b\d{3}\s*\d{3}\b/);
                    
                    if (code6Match) {
                        const code6 = code6Match[0].replace(/\s+/g, ''); 
                        await mfaPage.close();
                        await state.page.bringToFront();
                        
                        const codeInput = state.page.locator('input[type="text"], input[placeholder*="code" i]').first();
                        if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code6);
                        else await state.page.keyboard.type(code6, { delay: 100 });
                        
                        await sleep(1500);
                        
                        const enableBtn = state.page.locator('text=/verify/i >> visible=true, text=/enable/i >> visible=true').first();
                        if (await enableBtn.isVisible().catch(()=>false)) await enableBtn.evaluate(n=>n.click()).catch(()=>enableBtn.click());
                        else await state.page.keyboard.press('Enter');
                        
                        await sleep(3000);
                        
                        const acc = state.accountInfo || { email: "غير متوفر", password: "غير متوفر" };
                        const finalMsg = `ايميل: ${acc.email}\nباسورد: ${acc.password}\nرمز المصادقة الثنائة: ${secretCode}\nالرابط: https://2fa.fb.tools/${secretCode}`;
                        await bot.sendMessage(chatId, finalMsg);
                        
                        bot.sendMessage(chatId, "✅ تم الإنقاذ اليدوي بنجاح!");
                        state.isInteractive = false;
                        if (state.context) await state.context.close().catch(()=>{});
                        sendMainMenu(chatId);
                    } else { bot.sendMessage(chatId, "❌ فشل استخراج كود الـ 6 أرقام."); await sendInteractiveMenu(chatId); }
                } else { bot.sendMessage(chatId, "❌ الكود 32 حرف غير ظاهر."); await sendInteractiveMenu(chatId); }
            }
            else if (action === 'back_main') { 
                state.step = null; 
                await sendInteractiveMenu(chatId); 
            }
            else if (action === 'finish') {
                bot.sendMessage(chatId, "✅ إنهاء الجلسة واستخراج السكربت..."); 
                state.isInteractive = false;
                const jsCode = state.codeGen.getFinalScript();
                const logPath = path.join(__dirname, `AutoGenerated_Script_${Date.now()}.js`);
                fs.writeFileSync(logPath, jsCode);
                await bot.sendDocument(chatId, logPath);
                fs.unlinkSync(logPath);
                
                if (state.context) await state.context.close().catch(()=>{}); 
                sendMainMenu(chatId);
            }
        } catch (err) {
            bot.sendMessage(chatId, `❌ حدث خطأ في الأوامر التفاعلية: ${err.message}`);
            await sendInteractiveMenu(chatId);
        }
        return;
    }

    if (query.data === 'cancel') {
        state.cancel = true; if (state.resolveInteractive) state.resolveInteractive();
        if (state.context) await state.context.close().catch(()=>{});
        bot.sendMessage(chatId, "🛑 تم إلغاء العملية."); isProcessing = false;
    }
    else if (query.data === 'create_auto') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول.");
        isProcessing = true; await createAccountLogic(chatId, false); isProcessing = false;
    } 
    else if (query.data === 'create_manual') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول.");
        state.step = 'awaiting_email';
        bot.sendMessage(chatId, "➡️ أرسل **الإيميل** للبدء في وضع الإدخال المخصص:");
    }
});

// التعامل مع المدخلات النصية
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const state = userState[chatId];
    if (!state || !text || text.startsWith('/')) return; 

    if (state.step === 'awaiting_goto_url' && state.isInteractive) {
        state.step = null; let targetUrl = text;
        if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl; 
        try {
            if(state.codeGen){
                state.codeGen.addStep(`الذهاب إلى الرابط: ${targetUrl}`);
                state.codeGen.addCommand(`await page.goto("${targetUrl}", { waitUntil: "domcontentloaded" });`);
            }
            await state.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
            await sleep(3000); await sendStepPhoto(state.page, chatId, `تم فتح الرابط:\n${targetUrl}`);
        } catch(e) {}
        await sendInteractiveMenu(chatId);
    }
    else if (state.step === 'awaiting_search_text' && state.isInteractive) {
        state.step = null;
        try {
            const loc = state.page.locator(`text=/${text}/i >> visible=true`).first();
            if (await loc.isVisible({ timeout: 5000 }).catch(()=>false)) {
                if(state.codeGen){
                    state.codeGen.addStep(`البحث عن النص "${text}" والضغط عليه`);
                    state.codeGen.addCommand(`await page.locator('text=/${text}/i >> visible=true').first().click();`);
                }
                await loc.evaluate(n=>n.click()).catch(()=>loc.click()); 
                await sleep(1500); await sendStepPhoto(state.page, chatId, `تم الضغط على النص: "${text}"`);
            } else bot.sendMessage(chatId, `❌ لم أتمكن من العثور على أي نص يحتوي على هذا الحرف/الكلمة.`);
        } catch(e) {}
        await sendInteractiveMenu(chatId);
    }
    else if (state.step === 'awaiting_move_mouse' && state.isInteractive) {
        const num = parseInt(text);
        if (!isNaN(num) && num >= 0 && num < TOTAL_CELLS) {
            state.step = null;
            const coords = await clickSquareByNum(state.page, num); // نحفظ الإحداثيات للمعاينة
            state.mouseX = coords.x;
            state.mouseY = coords.y;
            
            await drawRedDot(state.page, state.mouseX, state.mouseY);
            
            let photoNum = ""; if (state && state.photoCounter) photoNum = state.photoCounter++;
            const dotImg = path.join(__dirname, `dot_${Date.now()}.png`);
            await state.page.screenshot({ path: dotImg });
            
            if (photoNum !== "") {
                try {
                    const { createCanvas, loadImage } = require('canvas');
                    const img = await loadImage(dotImg); const canvas = createCanvas(img.width, img.height); const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0); ctx.fillStyle = 'rgba(220, 20, 60, 0.9)'; ctx.fillRect(10, 10, 230, 50);
                    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(`صورة رقم ${photoNum}`, 125, 35);
                    fs.writeFileSync(dotImg, canvas.toBuffer('image/png'));
                } catch (e) {}
            }
            await bot.sendPhoto(chatId, dotImg, { caption: `📸 الماوس متمركز الآن على المربع [${num}] بدقة.\n\nاضغط من القائمة (🔴 كليك - Click) للتأكيد.` });
            fs.unlinkSync(dotImg); 
            await sendMouseMenu(chatId);
        } else {
            bot.sendMessage(chatId, `❌ رقم المربع غير صحيح. أرسل رقماً بين 0 و ${TOTAL_CELLS - 1}.`);
        }
    }
    else if (state.step === 'awaiting_type_text' && state.isInteractive) {
        state.step = null; 
        if(state.codeGen) {
            const safeText = text.replace(/'/g, "\\'");
            state.codeGen.addStep(`كتابة النص: "${text}"`);
            state.codeGen.addCommand(`await page.keyboard.type('${safeText}');`);
        }
        await state.page.keyboard.type(text, { delay: 50 }); await sleep(1000);
        await sendStepPhoto(state.page, chatId, `تمت كتابة النص.`); await sendInteractiveMenu(chatId);
    }
    else if (state.step === 'awaiting_email') {
        if (!text.includes('@')) return bot.sendMessage(chatId, "❌ إيميل غير صحيح.");
        state.step = null; isProcessing = true; const autoPass = generateSecurePassword(); 
        bot.sendMessage(chatId, `✅ تم استلام الإيميل.\n🔑 الباسورد المولد آلياً: \`${autoPass}\`\n\n(بمجرد أن يُطلب منك كود البريد، أرسله هنا واترك مسار chkip يكمل كل شيء للآخر!)`, {parse_mode: 'Markdown'});
        
        manualData = { email: text, password: autoPass };
        await createAccountLogic(chatId, true, manualData);
        isProcessing = false;
    }
});

process.on('uncaughtException', (err) => { console.error('Uncaught:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled:', reason); });

console.log("🤖 تكتيك Bypass العبقري (chkip.info -> مربع 527) + قائمة الماوس المصلحة يعمل الآن بنجاح تام...");
