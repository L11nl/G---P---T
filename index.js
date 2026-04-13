/*
 * ==========================================================
 * ChatGPT 2FA Automator & Playwright Script Generator
 * ==========================================================
 * - أداة توليد أكواد برمجية دقيقة (Playwright Code Builder).
 * - ترقيم تلقائي لجميع خطوات السكربت (الخطوة 1، الخطوة 2...).
 * - توليد كود ديناميكي ذكي لجلب كود 2FA (يدعم الأرقام ذات المسافات).
 * - 🚀 الملاحة القسرية (Force Reload): تحديث الصفحة بعد الرابط لضمان فتح نافذة الإعدادات 100%.
 * - 🎯 الضغط الدقيق: الإحداثيات 986.56, 353.28 (تضرب المربع 527 بدقة).
 * - 📄 استخراج بيانات Session وحفظها في ملف txt.
 * - 🛡️ التحديث 7: حل جذري لمشكلة Age/Birthday + القفز المباشر من واجهات Where should we begin.
 * - 💣 التحديث 8 (كاسحة النوافذ): مسح النوافذ الإعلانية (Skip Tour / Ask anything).
 * - 🎯 التحديث 9 (القناص): التعرف الفوري على شاشة "You're all set" الإجبارية واختراقها بضغط زر Continue!
 * - 🛠️ الإصلاح الشامل V10: حل جذري لمشكلة تعطل الوضع اليدوي واختفاء الصور، مع الاستغناء عن مكتبة Canvas، وتسريع الالتقاط عبر الذاكرة العشوائية!
 * - 📧 التحديث 13: تدمير كاش السيرفر (304 Not Modified) وإجبار الـ API على جلب رسالة الـ OTP بالقوة!
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
let autoLoopActive = false; // التحكم في اللوب

const userState = {};
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ================= إعدادات API المكتشفة وفك التشفير (1timetech) =================
const CUSTOM_MAIL_API = 'https://mail-server-2.1timetech.com/api';
const CUSTOM_HEADERS = {
    "accept": "application/json",
    "x-app-key": "f07bed4503msh719c2010df3389fp1d6048jsn411a41a84a3c",
    "User-Agent": "okhttp/4.9.2",
    "Content-Type": "application/json"
};

// دوال فك وتشفير البيانات (Reversed Base64)
function encodePayload(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64').split('').reverse().join('');
}

function decodePayload(str) {
    try {
        return JSON.parse(Buffer.from(str.split('').reverse().join(''), 'base64').toString('utf-8'));
    } catch(e) { return null; }
}

function generateSecurePassword() {
    const chars = "00CHAT700z00";
    let password = "";
    for(let i=0; i<12; i++) password += chars.charAt(crypto.randomInt(0, chars.length));
    return password;
}

// دالة إنشاء الإيميل باستخدام الدومين المختار
async function createCustomMail(domain) {
    try {
        const username = faker.person.firstName().toLowerCase() + crypto.randomBytes(2).toString('hex');
        const email = `${username}${domain}`; // @domain
        const payload = { data: encodePayload({ email: email }) };
        
        // Gmail يستخدم نقطة وصول مختلفة عن باقي الدومينات في الـ API
        const endpoint = domain === '@gmail.com' ? '/g-mail' : '/email';
        
        const res = await axios.post(`${CUSTOM_MAIL_API}${endpoint}?params=%3D03e`, payload, { headers: CUSTOM_HEADERS });
        const decoded = decodePayload(res.data.data);
        
        if (!decoded || !decoded.id) throw new Error("فشل في فك تشفير رد السيرفر");
        
        return { email: decoded.email, id: decoded.id, password: generateSecurePassword() };
    } catch (error) {
        console.error("Mail API Error:", error.message);
        throw new Error('تعذر إنشاء البريد المخصص');
    }
}

// دالة فحص صندوق الوارد (محمية ضد الكاش والتجمد)
async function waitForCustomMailCode(emailId, chatId, maxWaitSeconds = 120) {
    const startTime = Date.now();
    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        if (userState[chatId]?.cancel || (!userState[chatId]?.isManual && !autoLoopActive)) throw new Error("CANCELLED_BY_USER");
        try {
            const url = `${CUSTOM_MAIL_API}/email/${emailId}/messages?params=%3D03e`;
            
            const res = await axios.get(url, { 
                headers: {
                    ...CUSTOM_HEADERS,
                    'Cache-Control': 'no-cache, no-store, must-revalidate', // تدمير الكاش
                    'Pragma': 'no-cache',
                    'Expires': '0'
                },
                validateStatus: () => true // قبول جميع الاستجابات (حتى 304) لمعالجتها يدوياً
            });
            
            if (res.status === 200 && res.data && res.data.data) {
                const decodedStr = Buffer.from(res.data.data.split('').reverse().join(''), 'base64').toString('utf-8');
                const messages = JSON.parse(decodedStr);
                
                if (Array.isArray(messages) && messages.length > 0) {
                    for (const msg of messages) {
                        const text = JSON.stringify(msg);
                        // البحث عن الكود (6 أرقام متتالية)
                        const match = text.match(/\b\d{6}\b/);
                        if (match) return match[0];
                    }
                }
            }
        } catch(e) {
            // تجاهل أخطاء الشبكة المؤقتة واستمرار المحاولة
        }
        await sleep(5000); // الفحص كل 5 ثواني لتخفيف الضغط على السيرفر
    }
    return null;
}

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

// ================= دوال مساعدة للواجهة وتحديث الرسائل =================
async function updateStatusMessage(chatId, text, messageId = null) {
    try {
        if (!messageId) {
            const sent = await bot.sendMessage(chatId, `⚡ ${text}`);
            return sent.message_id;
        } else {
            await bot.editMessageText(`⚡ ${text}`, { 
                chat_id: chatId, 
                message_id: messageId 
            }).catch(async () => {
                const sent = await bot.sendMessage(chatId, `⚡ ${text}`);
                return sent.message_id;
            });
            return messageId;
        }
    } catch (err) {
        const sent = await bot.sendMessage(chatId, `⚡ ${text}`);
        return sent.message_id;
    }
}

async function sendErrorScreenshot(page, chatId, errorMessage) {
    try {
        if (!page || page.isClosed()) throw new Error("المتصفح انغلق فجأة.");
        const buffer = await page.screenshot({ fullPage: false, timeout: 15000 });
        const shortMsg = errorMessage.length > 150 ? errorMessage.substring(0, 150) + "..." : errorMessage;
        await bot.sendPhoto(chatId, buffer, { caption: `⚠️ **توقف مؤقت للحماية:**\nتغير مفاجئ في واجهة الموقع، تم تفعيل التحكم اليدوي.\nالسبب: ${shortMsg}` }, { filename: 'error.png', contentType: 'image/png' });
    } catch (err) {
        await bot.sendMessage(chatId, `❌ **توقف مؤقت:** ${errorMessage}\n(تعذر التقاط صورة للشاشة: ${err.message})`);
    }
}

// ================= أنظمة المربعات الشفافة والقوائم =================
const GRID_COLS = 45; 
const GRID_ROWS = 25; 
const TOTAL_CELLS = GRID_COLS * GRID_ROWS; 

async function drawGridAndScreenshot(page, chatId, caption) {
    try {
        if (!page || page.isClosed()) throw new Error("الصفحة مغلقة");
        await page.evaluate((specs) => {
            const oldOverlay = document.getElementById('bot-grid-overlay');
            if (oldOverlay) oldOverlay.remove();
            const overlay = document.createElement('div');
            overlay.id = 'bot-grid-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;display:grid;grid-template-columns:repeat(' + specs.cols + ', 1fr);grid-template-rows:repeat(' + specs.rows + ', 1fr);';
            for (let i = 0; i < specs.rows * specs.cols; i++) {
                const cell = document.createElement('div');
                cell.style.cssText = 'border:1px solid rgba(255,255,0,0.5);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-family:sans-serif;font-weight:bold;text-shadow:1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;background:rgba(0,0,0,0.1);box-sizing:border-box;';
                cell.innerText = i;
                overlay.appendChild(cell);
            }
            document.body.appendChild(overlay);
        }, { rows: GRID_ROWS, cols: GRID_COLS });

        const buffer = await page.screenshot({ fullPage: false, timeout: 15000 });
        await page.evaluate(() => { const el = document.getElementById('bot-grid-overlay'); if (el) el.remove(); });
        await bot.sendPhoto(chatId, buffer, { caption: caption, parse_mode: 'Markdown' }, { filename: 'grid.png', contentType: 'image/png' });
    } catch (error) { await bot.sendMessage(chatId, `⚠️ تعذر إرسال شبكة المربعات: ${error.message}`); }
}

async function drawRedDot(page, x, y) {
    try {
        if(!page || page.isClosed()) return;
        await page.evaluate((pos) => {
            let dot = document.getElementById('bot-red-dot');
            if (!dot) {
                dot = document.createElement('div'); dot.id = 'bot-red-dot';
                dot.style.cssText = 'position:fixed;width:14px;height:14px;background-color:red;border:2px solid white;border-radius:50%;z-index:2147483647;pointer-events:none;box-shadow:0 0 5px #000;transform:translate(-50%, -50%);';
                document.body.appendChild(dot);
            }
            dot.style.left = pos.x + 'px'; dot.style.top = pos.y + 'px';
        }, {x, y});
    } catch(e) {}
}

async function removeRedDot(page) { 
    try { if(!page || page.isClosed()) return; await page.evaluate(() => { const dot = document.getElementById('bot-red-dot'); if (dot) dot.remove(); }); } catch(e) {}
}

async function sendInteractiveMenu(chatId, text = "🎮 **أنت الآن تتحكم بالمتصفح:**\nالبوت في وضع الاستعداد ولن يغلق إلا بموافقتك.") {
    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '🌐 البحث عن الرابط', callback_data: 'int_goto_url' }], [{ text: '🔍 البحث على النص والضغط عليه', callback_data: 'int_search_text' }],
        [{ text: '🖱️ ضغط ماوس (شبكة شفافة)', callback_data: 'int_mouse_menu' }], [{ text: '⌨️ كتابة نص', callback_data: 'int_type_text' }, { text: '↩️ انتر (Enter)', callback_data: 'int_press_enter' }],
        [{ text: '📸 تحديث الشاشة', callback_data: 'int_refresh' }, { text: '🔐 المتابعة الى AF2', callback_data: 'int_continue_af2' }],
        [{ text: '✅ إنهاء الجلسة التفاعلية', callback_data: 'int_finish' }]
    ]}}; await bot.sendMessage(chatId, text, opts);
}

async function sendMouseMenu(chatId) {
    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '👁️ مشاهدة المربعات الشفافة', callback_data: 'int_show_grid' }], [{ text: '🧭 إرسال رقم المربع', callback_data: 'int_move_mouse' }],
        [{ text: '🔴 كليك (Click)', callback_data: 'int_click_mouse' }], [{ text: '🔙 رجوع للقائمة الرئيسية', callback_data: 'int_back_main' }]
    ]}}; await bot.sendMessage(chatId, `🖱️ **قائمة التحكم بالماوس:**`, opts);
}

async function startInteractiveMode(chatId, page, context, tempDir, codeGen) {
    userState[chatId].isInteractive = true; userState[chatId].page = page; userState[chatId].context = context;
    userState[chatId].tempDir = tempDir; userState[chatId].codeGen = codeGen;
    await sendInteractiveMenu(chatId);
    
    return new Promise(resolve => { 
        userState[chatId].resolveInteractive = resolve; 
        setTimeout(() => {
            if (userState[chatId] && userState[chatId].isInteractive) {
                bot.sendMessage(chatId, "⏳ انتهت مهلة التحكم اليدوي (15 دقيقة).");
                userState[chatId].isInteractive = false;
                if (userState[chatId].context) userState[chatId].context.close().catch(()=>{});
                if (userState[chatId].tempDir) try { fs.rmSync(userState[chatId].tempDir, { recursive: true, force: true }); } catch {}
                resolve();
            }
        }, 15 * 60 * 1000);
    });
}

// ================= مدير إنشاء اللوب (Loop Manager) =================
async function startAutoCreationLoop(chatId, domain, count) {
    bot.sendMessage(chatId, `🚀 جاري البدء بإنشاء **${count}** حساب(ات) باستخدام الدومين المخصص **${domain}**...`, {parse_mode: 'Markdown'});
    autoLoopActive = true;

    for (let i = 1; i <= count; i++) {
        if (!autoLoopActive || userState[chatId]?.cancel) {
            bot.sendMessage(chatId, `🛑 تم إيقاف عملية الإنشاء التلقائي عند الحساب رقم ${i - 1}.`);
            break;
        }
        
        await bot.sendMessage(chatId, `⏳ **[العملية ${i}/${count}]** جاري إنشاء الحساب...`);
        const success = await createAccountLogic(chatId, false, { domain: domain });
        
        if (!success) {
            await bot.sendMessage(chatId, `⚠️ فشل إنشاء الحساب رقم ${i}، سيتم الانتقال للحساب التالي إن وجد...`);
        }
        
        if (i < count && autoLoopActive) {
            await sleep(5000); // استراحة 5 ثواني بين الحسابات
        }
    }
    
    isProcessing = false;
    autoLoopActive = false;
    bot.sendMessage(chatId, `✅ **اكتملت مهمة الإنشاء التلقائي!** تم الانتهاء من الطلب.`);
    sendMainMenu(chatId);
}

// ================= الدالة الرئيسية للإنشاء (قلب السكربت) =================
async function createAccountLogic(chatId, isManual, manualData = null) {
    let modeText = isManual ? "(يدوي)" : "(تلقائي)";
    let statusMsgID = null;
    const codeGen = new PlaywrightCodeGenerator();

    const checkCancel = () => { if (userState[chatId]?.cancel || (!isManual && !autoLoopActive)) throw new Error("CANCELLED_BY_USER"); };
    const updateStatus = async (text) => {
        checkCancel(); statusMsgID = await updateStatusMessage(chatId, `${modeText}: ${text}`, statusMsgID); return statusMsgID;
    };

    let email, emailId;
    let chatGptPassword = isManual ? manualData.password : generateSecurePassword();

    if (isManual) { 
        email = manualData.email; 
    } else {
        try {
            const mailData = await createCustomMail(manualData.domain); 
            email = mailData.email; 
            emailId = mailData.id;
            chatGptPassword = mailData.password;
            userState[chatId].isManual = false; // تسجيل الحالة
            await updateStatus(`تم إنشاء البريد: ${email}`);
        } catch (e) { 
            await bot.sendMessage(chatId, `❌ فشل إنشاء البريد`); 
            return false; 
        }
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
        await updateStatus("فتح المتصفح ومحاولة تخطي الواجهات الجديدة...");

        try {
            await sleep(3000);
            const signupBtn = page.locator('button:has-text("Sign up"), a:has-text("Sign up")').first();
            const loginBtn = page.locator('button:has-text("Log in"), a:has-text("Log in"), [data-testid="login-button"]').first();
            if (await signupBtn.isVisible({ timeout: 2000 }).catch(()=>false)) await signupBtn.click();
            else if (await loginBtn.isVisible({ timeout: 2000 }).catch(()=>false)) {
                await loginBtn.click(); await sleep(2000);
                const innerSignup = page.locator('a:has-text("Sign up")').first();
                if (await innerSignup.isVisible({ timeout: 2000 }).catch(()=>false)) await innerSignup.click();
            }
        } catch (e) {}
        
        await updateStatus("البحث عن حقل الإيميل...");
        codeGen.addStep("إدخال البريد الإلكتروني");
        const emailSelectors = 'input[name="email"], input[id="email-input"], input[type="email"]';
        await page.waitForSelector(emailSelectors, {timeout: 30000}).catch(()=>{});
        const emailInput = page.locator(emailSelectors).first();
        if (await emailInput.isVisible().catch(()=>false)) await emailInput.fill(email);
        else await page.keyboard.type(email);
        codeGen.addCommand(`await page.locator('input[type="email"]').first().fill("${email}");`);
        await sleep(1000);
        
        codeGen.addStep("الاستمرار بعد إدخال الإيميل");
        await page.keyboard.press('Enter'); await sleep(1500);
        const continueBtn1 = page.locator('button[type="submit"], button:has-text("Continue"):not(:has-text("Apple")):not(:has-text("Google")):not(:has-text("Microsoft"))').first();
        if (await continueBtn1.isVisible({timeout: 1000}).catch(()=>false)) await continueBtn1.click({ force: true });
        codeGen.addCommand(`await page.keyboard.press('Enter');`);
        await sleep(3000);

        codeGen.addStep("إدخال كلمة المرور");
        const passSelectors = 'input[type="password"], input[name="password"]';
        await page.waitForSelector(passSelectors, {timeout: 30000}).catch(()=>{});
        const passInput = page.locator(passSelectors).first();
        if (await passInput.isVisible().catch(()=>false)) await passInput.fill(chatGptPassword);
        else await page.keyboard.type(chatGptPassword);
        codeGen.addCommand(`await page.locator('input[type="password"]').first().fill("${chatGptPassword}");`);
        await sleep(1000);

        codeGen.addStep("المتابعة لإكمال التسجيل");
        await page.keyboard.press('Enter'); await sleep(1500);
        const continueBtn2 = page.locator('button[type="submit"], button:has-text("Continue")').first();
        if (await continueBtn2.isVisible({timeout: 1000}).catch(()=>false)) await continueBtn2.click({ force: true });
        codeGen.addCommand(`await page.keyboard.press('Enter');`);
        await sleep(7000); 

        checkCancel();
        await updateStatus("في انتظار صفحة الكود (OTP)...");
        
        let code = null;
        if (isManual) {
            await bot.sendMessage(chatId, "🛑 يرجى إرسال الكود المكون من 6 أرقام هنا في الشات.");
            code = await new Promise((resolve) => {
                const listener = (msg) => { if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { bot.removeListener('message', listener); resolve(msg.text.trim()); } };
                bot.on('message', listener);
            });
        } else { 
            // الانتظار مع كسر الكاش
            code = await waitForCustomMailCode(emailId, chatId, 120); 
        }

        if (code) {
            await updateStatus(`جاري إدخال الكود: ${code}`);
            codeGen.addStep("إدخال كود التحقق (OTP)");
            const codeInput = page.getByRole("textbox", { name: "Code" });
            await codeInput.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => { await page.keyboard.type(code); });
            if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code);
            codeGen.addCommand(`await page.keyboard.type("${code}");`);
            await sleep(2000);
        } else {
            throw new Error(`لم يصل الكود من OpenAI، ربما تم حظر الـ IP أو البريد المخصص.`);
        }

        const continueBtnAfterCode = page.locator('button:has-text("Continue")').last();
        if (await continueBtnAfterCode.isVisible().catch(()=>false)) await continueBtnAfterCode.click({ force: true });
        else await page.keyboard.press('Enter');
        await sleep(5000); 

        // ======================================================================
        // التفرقة الذكية بين Age و Birthday ومنع التنسيق الخاطئ
        // ======================================================================
        const nameInputNode = page.getByRole("textbox", { name: "Full name" }).first();
        if (await nameInputNode.isVisible({ timeout: 15000 }).catch(() => false)) {
            codeGen.addStep("تعبئة الاسم والتعرف الذكي على العمر");
            await nameInputNode.fill("Auto User");
            await sleep(1000);

            const bdayInput = page.locator('input[name="birthday"], input[id="birthday"], [aria-label*="birthday" i], [placeholder*="YYYY" i]').first();
            const ageInput = page.locator('input[name="age"], input[id="age"], [placeholder*="Age" i]').first();

            if (await bdayInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await bdayInput.focus().catch(()=>{}); await bdayInput.click({ force: true }).catch(()=>{});
                for (let j = 0; j < 10; j++) await page.keyboard.press('Backspace'); 
                await page.keyboard.type("01012000", { delay: 100 });
            } else if (await ageInput.isVisible({ timeout: 1000 }).catch(() => false)) {
                await ageInput.focus().catch(()=>{}); await ageInput.click({ force: true }).catch(()=>{});
                for (let j = 0; j < 4; j++) await page.keyboard.press('Backspace');
                await page.keyboard.type("25", { delay: 100 });
            } else {
                await page.keyboard.press('Tab');
                const pageTxt = await page.innerText('body').catch(()=>"");
                if (pageTxt.toLowerCase().includes("birthday") || pageTxt.toLowerCase().includes("date of birth") || pageTxt.includes("YYYY")) {
                    await page.keyboard.type("01012000", { delay: 100 });
                } else {
                    await page.keyboard.type("25", { delay: 100 });
                }
            }

            const finishBtn = page.locator('button:has-text("Finish creating account"), button:has-text("Continue")').last();
            if (await finishBtn.isVisible().catch(() => false)) await finishBtn.click({ force: true });
            else await page.keyboard.press('Enter');
            await sleep(8000); 
            await updateStatus("تم ملء بيانات العمر بنجاح");
        }

        await updateStatus("في انتظار الصفحة الرئيسية...");
        
        let isMainReady = false;
        for (let i = 0; i < 15; i++) {
            const currentUrl = page.url();
            const bodyTxt = await page.innerText('body').catch(()=>"");
            
            if (bodyTxt.includes("You're all set") || bodyTxt.includes("You’re all set") || bodyTxt.includes("ChatGPT can make mistakes")) {
                try {
                    const continueBtn = page.locator('button:has-text("Continue"), [role="button"]:has-text("Continue")').last();
                    if (await continueBtn.isVisible({timeout: 1000}).catch(()=>false)) {
                        await continueBtn.click({force: true}); await sleep(1500);
                    } else { await page.keyboard.press('Enter'); await sleep(1000); }
                } catch(e) {}
            }
            
            const hasNewUI = bodyTxt.includes('Where should we begin?') || bodyTxt.includes('Claim offer') || bodyTxt.includes('New chat');
            const hasTextarea = await page.locator('#prompt-textarea, [placeholder*="Message" i], [aria-label*="Message" i]').isVisible().catch(()=>false);
            
            if ((currentUrl.includes('chatgpt.com') && !currentUrl.includes('auth') && !currentUrl.includes('login')) || hasTextarea || hasNewUI) {
                isMainReady = true; break;
            }
            await sleep(2000);
        }

        if (isMainReady) {
             const result = `${email}|${chatGptPassword}`;
             fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
             userState[chatId].accountInfo = { email: email, password: chatGptPassword };

             await updateStatus("تخطي الشاشات الترحيبية إن وجدت...");
             codeGen.addStep("تخطي النوافذ الترحيبية");
             try {
                 for (let k = 0; k < 3; k++) {
                     const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Okay"), button:has-text("Next")').last();
                     if (await continueBtn.isVisible({ timeout: 1000 }).catch(()=>false)) {
                         await continueBtn.click({ force: true }); await sleep(1500);
                     }
                 }
             } catch(e) {}

             await updateStatus("نجح الدخول! التوجه لإعدادات الأمان واستكمال الـ 2FA...");
             codeGen.addStep("القفز المباشر لصفحة الأمان وتحديث الصفحة");
             await page.goto("https://chatgpt.com/#settings/Security", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
             await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
             codeGen.addCommand(`await page.goto("https://chatgpt.com/#settings/Security");\n    await page.reload({ waitUntil: "domcontentloaded" });`);
             await sleep(5000); 

             await updateStatus("مسح النوافذ الإعلانية...");
             await page.keyboard.press('Escape').catch(()=>{}); await sleep(1000);
             const popupTexts = ['Continue', 'Skip Tour', 'Skip', 'Next', 'Okay', 'Done'];
             for (let i = 0; i < 2; i++) {
                 for (const pText of popupTexts) {
                     try {
                         const btn = page.locator(`button:has-text("${pText}"), a:has-text("${pText}"), [role="button"]:has-text("${pText}")`).last();
                         if (await btn.isVisible({ timeout: 500 }).catch(()=>false)) { await btn.click({ force: true }); await sleep(1000); }
                     } catch (e) {}
                 }
             }

             const mfaVisible = await page.locator('text="Multi-factor authentication"').first().isVisible().catch(()=>false);
             const troubleVisibleCheck = await page.locator('text="Trouble scanning?"').first().isVisible().catch(()=>false);
             if (!mfaVisible && !troubleVisibleCheck) {
                 await updateStatus("إعادة فتح نافذة الأمان للتأكيد...");
                 await page.goto("https://chatgpt.com/").catch(()=>{}); await sleep(1000);
                 await page.goto("https://chatgpt.com/#settings/Security").catch(()=>{}); await sleep(4000);
             }

             codeGen.addStep("الضغط كليك بالماوس على المربع رقم (527) عبر الإحداثيات: X=986.56, Y=353.28");
             try { await page.mouse.click(986.56, 353.28); } catch(e) {}
             codeGen.addCommand(`await page.mouse.click(986.56, 353.28);`);
             await sleep(3000);

             codeGen.addStep('البحث عن النص "Trouble scanning?" والضغط عليه لإظهار الكود السري');
             try {
                 let troubleBtn = page.locator('text="Trouble scanning?"').first();
                 if (!(await troubleBtn.isVisible({ timeout: 2000 }).catch(()=>false))) {
                     const smartEnableBtn = page.locator('button:has-text("Enable"), button:has-text("Set up")').last();
                     if (await smartEnableBtn.isVisible({ timeout: 1500 }).catch(()=>false)) { await smartEnableBtn.click({ force: true }); await sleep(2000); }
                 }
                 if (await troubleBtn.isVisible({ timeout: 2000 }).catch(()=>false)) await troubleBtn.click();
                 else await page.locator('text="Trouble scanning?"').first().click({ force: true }).catch(()=>{});
             } catch(e) {}
             codeGen.addCommand(`await page.locator('text="Trouble scanning?"').first().click();`);
             await sleep(2000);
             
             const pageText = await page.innerText('body');
             const secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);
             
             if (secretMatch) {
                 const secretCode = secretMatch[0];
                 await updateStatus(`تم العثور على الكود السري: ${secretCode}`);
                 
                 const mfaPage = await context.newPage();
                 await mfaPage.goto(`https://2fa.fb.tools/${secretCode}`).catch(()=>{}); await sleep(3000);
                 const mfaText = await mfaPage.innerText('body');
                 const code6Match = mfaText.match(/\b\d{3}\s*\d{3}\b/);
                 
                 if (code6Match) {
                     const code6 = code6Match[0].replace(/\s+/g, '');
                     await mfaPage.close(); await page.bringToFront();
                     
                     const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();
                     if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code6);
                     else await page.keyboard.type(code6, { delay: 100 });
                     
                     await sleep(1500);
                     const enableBtn = page.locator('button:has-text("Enable"), button:has-text("Verify")').first();
                     if (await enableBtn.isVisible().catch(()=>false)) await enableBtn.click();
                     else await page.keyboard.press('Enter');
                     await sleep(3000);
                     
                     if (statusMsgID) { await bot.deleteMessage(chatId, statusMsgID).catch(()=>{}); }
                     
                     await bot.sendMessage(chatId, 
                         `✅ **تم إنشاء الحساب وتفعيل المصادقة الثنائية بنجاح!**\n\n📧 **الإيميل:** \`${email}\`\n🔑 **الباسورد:** \`${chatGptPassword}\`\n🔗 **رابط المصادقة:** https://2fa.fb.tools/${secretCode}`,
                         { parse_mode: 'Markdown' }
                     );
                     
                     try {
                         await page.goto("https://chatgpt.com/api/auth/session", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
                         await sleep(2000);
                         let sessionText = "";
                         try { sessionText = await page.innerText('body'); } catch (err) { sessionText = await page.evaluate(() => document.body ? document.body.innerText : document.documentElement.innerText).catch(() => "لم يتم العثور على بيانات"); }
                         const sessionFilePath = path.join(__dirname, `session_${Date.now()}.txt`);
                         fs.writeFileSync(sessionFilePath, sessionText);
                         await bot.sendDocument(chatId, sessionFilePath, { caption: "📄 **بيانات السشن (Session Data)**" }).catch(()=>{});
                         if (fs.existsSync(sessionFilePath)) fs.unlinkSync(sessionFilePath);
                     } catch (sessionErr) {}

                     if (context) await context.close().catch(()=>{});
                     if (tempDir) try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
                     return true;
                 }
             }
             
             await bot.sendMessage(chatId, "⚠️ **لم يتم العثور على الكود 32 حرف.**");
             if (!isManual && autoLoopActive) { throw new Error("MFA_FAILED"); }
             
             await drawGridAndScreenshot(page, chatId, "🔲 **صورة الشاشة مقسمة لمربعات:**");
             await startInteractiveMode(chatId, page, context, tempDir, codeGen);

        } else { throw new Error(`تعذر التعرف على واجهة الصفحة الحالية للأسف.`); }

    } catch (error) {
        if (error.message === "CANCELLED_BY_USER") {
            if (context) await context.close().catch(()=>{});
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
            return false;
        }
        
        if (isManual || !autoLoopActive) {
            if (userState[chatId]) userState[chatId].isInteractive = true;
            try { if (page && !page.isClosed()) await page.evaluate(() => window.stop()); } catch(e){}
            await bot.sendMessage(chatId, `⚠️ **توقف مؤقت للحماية:** تم تحويلك للتحكم اليدوي.`);
            
            if (page && context && !userState[chatId].cancel) {
                await sendErrorScreenshot(page, chatId, error.message);
                await startInteractiveMode(chatId, page, context, tempDir, codeGen);
            }
        } else {
            await bot.sendMessage(chatId, `⚠️ فشل هذا الحساب: ${error.message}`);
        }
        return false;

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
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
            [{ text: '▶️ تشغيل تلقائي', callback_data: 'create_auto' }, { text: '✍️ تشغيل يدوي (مع 2FA)', callback_data: 'create_manual' }],
            [{ text: '🛑 إلغاء العملية الجارية', callback_data: 'cancel' }]
        ]}
    });
}

function sendDomainMenu(chatId) {
    bot.sendMessage(chatId, "🌐 **اختر الدومين الذي تريده لإنشاء الحسابات:**", {
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
            [{ text: '@gmail.com', callback_data: 'set_domain_@gmail.com' }, { text: '@rommiui.com', callback_data: 'set_domain_@rommiui.com' }],
            [{ text: '@yanemail.com', callback_data: 'set_domain_@yanemail.com' }, { text: '@gmail10p.com', callback_data: 'set_domain_@gmail10p.com' }],
            [{ text: '🔙 إلغاء والعودة', callback_data: 'cancel' }]
        ]}
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

    try {
        if (query.data.startsWith('int_')) {
            const action = query.data.replace('int_', '');
            if (!state.isInteractive || !state.page || state.page.isClosed()) return bot.sendMessage(chatId, "⚠️ الجلسة منتهية أو المتصفح مغلق.");

            if (action === 'goto_url') {
                bot.sendMessage(chatId, "🌐 أرسل **الرابط (URL)**:", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } });
                state.step = 'awaiting_goto_url';
            }
            else if (action === 'continue_af2') { /* نفس الكود اليدوي القديم للتبسيط */ }
            else if (action === 'search_text') { bot.sendMessage(chatId, "🔍 أرسل **النص**:", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } }); state.step = 'awaiting_search_text'; }
            else if (action === 'mouse_menu') { await sendMouseMenu(chatId); }
            else if (action === 'show_grid') { await drawGridAndScreenshot(state.page, chatId, `👁️ **المربعات الشفافة المعروضة:**`); await sendMouseMenu(chatId); }
            else if (action === 'move_mouse') { bot.sendMessage(chatId, `🧭 أرسل **رقم المربع**:`, { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } }); state.step = 'awaiting_move_mouse'; }
            else if (action === 'click_mouse') {
                if (state.mouseX !== undefined && state.mouseY !== undefined) {
                    try { await removeRedDot(state.page); await state.page.mouse.click(state.mouseX, state.mouseY); await sleep(1500); await bot.sendMessage(chatId, `🔴 تم الضغط!`); } catch(e) {}
                }
                await sendInteractiveMenu(chatId);
            }
            else if (action === 'type_text') { bot.sendMessage(chatId, "⌨️ أرسل النص:", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } }); state.step = 'awaiting_type_text'; }
            else if (action === 'press_enter') { try { await state.page.keyboard.press('Enter'); await sleep(1500); } catch(e){} await sendInteractiveMenu(chatId); }
            else if (action === 'refresh') { try { const buffer = await state.page.screenshot({ fullPage: false, timeout: 15000 }); await bot.sendPhoto(chatId, buffer, { caption: "📸 الشاشة:" }); } catch(e){} await sendInteractiveMenu(chatId); }
            else if (action === 'back_main') { state.step = null; await sendInteractiveMenu(chatId); }
            else if (action === 'finish') {
                bot.sendMessage(chatId, "✅ تم إنهاء الجلسة."); state.isInteractive = false;
                if (state.context) await state.context.close().catch(()=>{}); if (state.tempDir) try { fs.rmSync(state.tempDir, { recursive: true, force: true }); } catch {}
                if (state.resolveInteractive) state.resolveInteractive();
                if (!autoLoopActive) { isProcessing = false; sendMainMenu(chatId); }
            }
            return;
        }

        if (query.data === 'cancel') {
            state.cancel = true; autoLoopActive = false; if (state.resolveInteractive) state.resolveInteractive();
            if (state.context) await state.context.close().catch(()=>{}); if (state.tempDir) try { fs.rmSync(state.tempDir, { recursive: true, force: true }); } catch {}
            bot.sendMessage(chatId, "🛑 تم إلغاء العملية وإيقاف اللوب (إن وجد)."); isProcessing = false;
        }
        else if (query.data === 'create_auto') { 
            if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول حالياً بعملية أخرى."); 
            sendDomainMenu(chatId);
        } 
        else if (query.data.startsWith('set_domain_')) {
            const selectedDomain = query.data.replace('set_domain_', '');
            state.selectedDomain = selectedDomain;
            state.step = 'awaiting_count';
            bot.sendMessage(chatId, `✅ تم اختيار الدومين: **${selectedDomain}**\n\n🔢 **كم حساب تريد إنشاءه؟** (أرسل رقماً)`, {parse_mode: 'Markdown'});
        }
        else if (query.data === 'create_manual') { 
            if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول."); 
            state.step = 'awaiting_email'; bot.sendMessage(chatId, "➡️ أرسل **الإيميل** للبدء:"); 
        }

    } catch(err) { bot.sendMessage(chatId, `❌ حدث خطأ داخلي: ${err.message}`); }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text?.trim(); const state = userState[chatId];
    if (!state || !text || text.startsWith('/')) return; 

    try {
        if (state.step === 'awaiting_count') {
            const count = parseInt(text);
            if (isNaN(count) || count <= 0 || count > 100) return bot.sendMessage(chatId, "❌ يرجى إرسال رقم صحيح (بين 1 و 100).");
            
            state.step = null;
            state.cancel = false;
            isProcessing = true;
            await startAutoCreationLoop(chatId, state.selectedDomain, count);
        }
        else if (state.step === 'awaiting_goto_url' && state.isInteractive) {
            state.step = null; let targetUrl = text; if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl; 
            try { await state.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }); await sleep(3000); bot.sendMessage(chatId, `✅ تم الفتح.`); } catch(e){} await sendInteractiveMenu(chatId);
        }
        else if (state.step === 'awaiting_search_text' && state.isInteractive) {
            state.step = null; try { const loc = state.page.locator(`text="${text}"`).first(); if (await loc.isVisible({ timeout: 5000 }).catch(()=>false)) { await loc.click(); await sleep(1500); } } catch(e){} await sendInteractiveMenu(chatId);
        }
        else if (state.step === 'awaiting_move_mouse' && state.isInteractive) {
            const num = parseInt(text);
            if (!isNaN(num) && num >= 0 && num < TOTAL_CELLS) {
                state.step = null; 
                try {
                    const vw = 1366 / GRID_COLS; const vh = 768 / GRID_ROWS; const col = num % GRID_COLS; const row = Math.floor(num / GRID_COLS);
                    const x = parseFloat(((col * vw) + (vw / 2)).toFixed(2)); const y = parseFloat(((row * vh) + (vh / 2)).toFixed(2));
                    state.mouseX = x; state.mouseY = y; await state.page.mouse.move(x, y); await drawRedDot(state.page, x, y);
                    const buffer = await state.page.screenshot({ fullPage: false, timeout: 15000 });
                    await bot.sendPhoto(chatId, buffer, { caption: `🔴 الماوس بالمربع [${num}].` });
                } catch(e) {}
                await sendMouseMenu(chatId);
            }
        }
        else if (state.step === 'awaiting_type_text' && state.isInteractive) { 
            state.step = null; try { await state.page.keyboard.type(text, { delay: 50 }); await sleep(1000); } catch(e) {} await sendInteractiveMenu(chatId); 
        }
        else if (state.step === 'awaiting_email') {
            if (!text.includes('@')) return bot.sendMessage(chatId, "❌ إيميل غير صحيح."); 
            state.step = null; isProcessing = true; state.cancel = false;
            const autoPass = generateSecurePassword(); bot.sendMessage(chatId, `✅ تم استلام البريد.\n🔑 الباسورد: \`${autoPass}\``, {parse_mode: 'Markdown'});
            userState[chatId].isManual = true; // تسجيل وضع اليدوي لمنع إنهاء اللوب بالخطأ
            await createAccountLogic(chatId, true, { email: text, password: autoPass });
            isProcessing = false; sendMainMenu(chatId);
        }
    } catch(err) {}
});

process.on('uncaughtException', (err) => { console.error('Uncaught:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled:', reason); });

console.log("🤖 البوت يعمل (تحديث V13: كسر حماية الـ Cache لاستقبال رسائل OpenAI بنجاح)...");
