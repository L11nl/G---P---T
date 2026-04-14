/*
==========================================================
ChatGPT 2FA Automator & Playwright Script Generator
==========================================================
أداة توليد أكواد برمجية دقيقة (Playwright Code Builder).
ترقيم تلقائي لجميع خطوات السكربت (الخطوة 1، الخطوة 2...).
توليد كود ديناميكي ذكي لجلب كود 2FA (يدعم الأرقام ذات المسافات).
🚀 الملاحة القسرية (Force Reload): تحديث الصفحة بعد الرابط لضمان فتح نافذة الإعدادات 100%.
🎯 الضغط الدقيق: الإحداثيات 986.56, 353.28 (تضرب المربع 527 بدقة).
📄 استخراج بيانات Session وحفظها في ملف txt.
🛡️ التحديث 7: حل جذري لمشكلة Age/Birthday + القفز المباشر من واجهات Where should we begin.
💣 التحديث 8 (كاسحة النوافذ): مسح النوافذ الإعلانية (Skip Tour / Ask anything).
🎯 التحديث 9 (القناص): التعرف الفوري على شاشة "You're all set" الإجبارية واختراقها بضغط زر Continue!
🛠️ الإصلاح الشامل V10: حل جذري لمشكلة تعطل الوضع اليدوي واختفاء الصور، مع الاستغناء عن مكتبة Canvas، وتسريع الالتقاط عبر الذاكرة العشوائية!
🔥 التحديث 11 (تغيير الايميل الذكي): مسار آلي سلس لتغيير الإيميل يكمل العمل دون توقف + كاميرا مراقبة حية تصور كل شيء + نظام مقاطعة (Interrupt) لزر "التدخل اليدوي" الفوري!
==========================================================
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

addStep(comment) { this.pendingStep = `\n // === الخطوة ${this.stepCounter}: ${comment} ===`; } 
addCommand(cmd) { 
if (this.lastCommand === cmd && cmd.trim() !== "") { this.pendingStep = null; return; } 
if (this.pendingStep) { this.codeLines.push(this.pendingStep); this.stepCounter++; this.pendingStep = null; } 
this.codeLines.push(` ${cmd}`); console.log(`[Generated Code]: ${cmd}`); this.lastCommand = cmd; 
} 
addRawBlock(comment, linesArr) { 
this.codeLines.push(`\n // === الخطوة ${this.stepCounter}: ${comment} ===`); this.stepCounter++; 
for (const line of linesArr) { this.codeLines.push(` ${line}`); } 
this.lastCommand = linesArr[linesArr.length - 1]; 
} 
getFinalScript() { 
return `// ==========================================\n// 🤖 سكربت Playwright التحليلي المستخرج\n// يحتوي على الأكواد والخطوات المرقمة بالتسلسل (بدون تكرار)\n// ==========================================\n\nconst { chromium } = require('playwright');\n\n(async () => {\n const browser = await chromium.launch({ headless: false });\n const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });\n const page = await context.newPage();\n${this.codeLines.join('\n')}\n\n // await browser.close();\n})();`; 
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

// ================= نظام الانتظار الذكي (يدعم إيقاف البوت لتفعيل التدخل اليدوي) =================
const interruptibleSleep = async (chatId, ms) => {
    const iterations = Math.max(1, Math.floor(ms / 200));
    for (let i = 0; i < iterations; i++) {
        if (userState[chatId]?.manualOverride) throw new Error("MANUAL_MODE_REQUESTED");
        if (userState[chatId]?.cancel) throw new Error("CANCELLED_BY_USER");
        await new Promise(r => setTimeout(r, 200));
    }
};

function waitForUserInput(chatId, promptText) {
    return new Promise(async (resolve, reject) => {
        let sentMsg;
        try {
            sentMsg = await bot.sendMessage(chatId, promptText, {
                reply_markup: { inline_keyboard: [[{ text: '⚙️ التدخل اليدوي', callback_data: 'trigger_manual' }]] }
            });
        } catch(e){}
        
        const listener = (msg) => {
            if (msg.chat.id === chatId && msg.text) {
                if (msg.text.startsWith('/')) {
                    if (msg.text === '/start') { cleanup(); reject(new Error("CANCELLED_BY_USER")); }
                    return; // تجاهل الأوامر الأخرى
                }
                cleanup();
                resolve(msg.text.trim());
            }
        };
        bot.on('message', listener);
        
        const interval = setInterval(() => {
            if (userState[chatId]?.manualOverride) {
                cleanup();
                reject(new Error("MANUAL_MODE_REQUESTED"));
            }
            if (userState[chatId]?.cancel) {
                cleanup();
                reject(new Error("CANCELLED_BY_USER"));
            }
        }, 300); // يفحص كل 300 جزء من الثانية لسرعة الاستجابة للتدخل اليدوي
        
        function cleanup() {
            bot.removeListener('message', listener);
            clearInterval(interval);
            if (sentMsg) bot.deleteMessage(chatId, sentMsg.message_id).catch(()=>{});
        }
    });
}

// ================= دالة تغيير الإيميل التلقائية الكاملة مع التصوير الحي =================
async function changeEmailLogic(chatId) {
    userState[chatId] = { step: null, cancel: false, isInteractive: false, manualOverride: false };
    const codeGen = new PlaywrightCodeGenerator(); 
    const tempDir = fs.mkdtempSync(path.join(__dirname, 'ce_wrk_'));
    let context, page;

    // دالة تحقق من طلب التدخل اليدوي
    const checkState = () => {
        if (userState[chatId]?.cancel) throw new Error("CANCELLED_BY_USER");
        if (userState[chatId]?.manualOverride) throw new Error("MANUAL_MODE_REQUESTED");
    };

    // دالة التصوير وإرسال اللقطة لك (مرفق بها زر التدخل اليدوي)
    const snapAndSend = async (captionText) => {
        checkState();
        try {
            if (page && !page.isClosed()) {
                const buffer = await page.screenshot({ fullPage: false, timeout: 15000 });
                const opts = {
                    caption: `📸 ${captionText}`,
                    reply_markup: {
                        inline_keyboard: [[{ text: '⚙️ التدخل اليدوي', callback_data: 'trigger_manual' }]]
                    }
                };
                await bot.sendPhoto(chatId, buffer, opts, { filename: 'step.png', contentType: 'image/png' });
            }
        } catch(e) {}
        checkState();
    };

    try {
        await bot.sendMessage(chatId, "🔄 السكربت انطلق! سيتم العمل تلقائياً وسأرسل لك توثيقاً بالصور..\nبإمكانك الضغط على زر التدخل اليدوي في أي وقت لإيقاف البوت فوراً.");
        
        context = await chromium.launchPersistentContext(tempDir, {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            viewport: { width: 1440, height: 900 }
        });
        page = await context.newPage();

        checkState();
        await page.goto("https://chatgpt.com/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await interruptibleSleep(chatId, 3000);
        await snapAndSend("تم فتح صفحة تسجيل الدخول.");

        try {
            const loginBtn = page.locator('button:has-text("Log in"), a:has-text("Log in"), [data-testid="login-button"]').first();
            if (await loginBtn.isVisible({ timeout: 2000 })) await loginBtn.click();
            else await page.mouse.click(129.99, 858.00); 
        } catch(e) {
            await page.mouse.click(129.99, 858.00);
        }
        await interruptibleSleep(chatId, 2000);
        await snapAndSend("تم الضغط على Log in.");

        const email = await waitForUserInput(chatId, "📧 البوت: قم بأرسال الايميل");
        checkState();
        await page.keyboard.type(email, { delay: 50 });
        await interruptibleSleep(chatId, 1000);
        
        try { await page.locator('button:has-text("Continue")').first().click({timeout: 2000}); }
        catch(e) { await page.mouse.click(720.00, 671.50); }
        await interruptibleSleep(chatId, 3000);
        await snapAndSend("تم إدخال الإيميل والضغط على Continue.");

        const password = await waitForUserInput(chatId, "🔑 البوت: ارسل الباسورد");
        checkState();
        await page.keyboard.type(password, { delay: 50 });
        await interruptibleSleep(chatId, 1000);
        
        try { await page.locator('button:has-text("Continue")').first().click({timeout: 2000}); }
        catch(e) { await page.mouse.click(720.00, 405.00); }
        await interruptibleSleep(chatId, 4000);
        await snapAndSend("تم إدخال الباسورد والضغط على Continue.");

        const code = await waitForUserInput(chatId, "🔐 البوت: قم بأرسال الكود");
        checkState();
        await page.keyboard.type(code, { delay: 50 });
        await interruptibleSleep(chatId, 1000);

        try { await page.locator('button:has-text("Continue")').first().click({timeout: 2000}); }
        catch(e) { await page.mouse.click(720.00, 369.00); }
        
        await interruptibleSleep(chatId, 3000);
        await snapAndSend("تم إدخال الكود بنجاح. تحويل للصفحة...");

        checkState();
        await page.goto("https://chatgpt.com/#settings/Account", { waitUntil: "domcontentloaded", timeout: 60000 });
        await interruptibleSleep(chatId, 5000);
        await snapAndSend("تم فتح صفحة إعدادات الحساب.");

        checkState();
        // الضغط على شبكة الماوس 317
        await page.mouse.click(950.40, 281.25);
        await interruptibleSleep(chatId, 2000);

        // الضغط على شبكة الماوس 511
        await page.mouse.click(604.80, 461.25);
        await interruptibleSleep(chatId, 2000);
        await snapAndSend("تم تجهيز حقل الإيميل الجديد للتعديل.");

        const newEmail = await waitForUserInput(chatId, "📩 البوت: قم بأرسال الايميل الجديد");
        checkState();
        await page.keyboard.type(newEmail, { delay: 50 });
        await interruptibleSleep(chatId, 1000);

        // Send verification email
        try { await page.locator('button:has-text("Send verification email")').first().click({timeout: 2000}); }
        catch(e) { await page.mouse.click(836.39, 544.77); }
        await interruptibleSleep(chatId, 3000);
        await snapAndSend("تم إرسال كود التفعيل للإيميل الجديد.");

        checkState();
        // الضغط على شبكة الماوس 536
        await page.mouse.click(604.80, 483.75);
        await interruptibleSleep(chatId, 2000);

        const verifyCode = await waitForUserInput(chatId, "💬 البوت: قم بأرسال الكود");
        checkState();
        await page.keyboard.type(verifyCode, { delay: 50 });
        await interruptibleSleep(chatId, 1000);

        // Verify
        try { await page.locator('button:has-text("Verify")').first().click({timeout: 2000}); }
        catch(e) { await page.mouse.click(889.36, 601.44); }
        await interruptibleSleep(chatId, 3000);
        await snapAndSend("✅ تم تأكيد الكود بنجاح والتحقق من الإيميل!");

        await bot.sendMessage(chatId, "✅ **اكتمل تغيير الإيميل بنجاح بشكل آلي!**", { parse_mode: 'Markdown' });

    } catch (error) {
        if (error.message === "CANCELLED_BY_USER") {
            bot.sendMessage(chatId, "🛑 تم إلغاء العملية.");
        } else {
            // ================== نظام التحويل للوضع اليدوي التفاعلي ==================
            userState[chatId].isInteractive = true;
            try { if (page && !page.isClosed()) await page.evaluate(() => window.stop()); } catch(e){}
            
            let reason = error.message === "MANUAL_MODE_REQUESTED" 
                ? "قمت أنت بطلب التدخل اليدوي ⚙️." 
                : `حدث خطأ أو تغيير بالموقع: ${error.message} ⚠️`;

            await bot.sendMessage(chatId, `⚠️ **تم إيقاف الروبوت وتفعيل التحكم اليدوي!**\nالسبب: ${reason}\n\nيمكنك إكمال المهام يدوياً من النقطة التي توقفنا عندها.`);
            
            if (page && context && !userState[chatId].cancel) {
                if (error.message !== "MANUAL_MODE_REQUESTED") {
                    await sendErrorScreenshot(page, chatId, error.message);
                }
                await drawGridAndScreenshot(page, chatId, "🔲 **صورة الشاشة مقسمة لمربعات (وضع التدخل اليدوي):**");
                await startInteractiveMode(chatId, page, context, tempDir, codeGen);
                return; // يمنع إغلاق المتصفح حتى تنهي عملك اليدوي
            } else {
                bot.sendMessage(chatId, `⚠️ فشل التحويل للوضع اليدوي، المتصفح مغلق.`);
                isProcessing = false;
            }
        }
    } finally {
        if (userState[chatId] && !userState[chatId].isInteractive) {
            if (context) await context.close().catch(()=>{});
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
            isProcessing = false;
            sendMainMenu(chatId);
        }
    }
}

// ================= دالة تحديث حالة الرسالة النصية =================
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

// ================= إرسال صورة للخطأ =================
async function sendErrorScreenshot(page, chatId, errorMessage) {
try {
if (!page || page.isClosed()) throw new Error("المتصفح انغلق فجأة.");
const buffer = await page.screenshot({ fullPage: false, timeout: 15000 });
const shortMsg = errorMessage.length > 150 ? errorMessage.substring(0, 150) + "..." : errorMessage;
await bot.sendPhoto(chatId, buffer, { caption: `⚠️ **توقف مؤقت للحماية:**\nالسبب: ${shortMsg}` }, { filename: 'error.png', contentType: 'image/png' });
} catch (err) {
await bot.sendMessage(chatId, `❌ **توقف مؤقت:** ${errorMessage}\n(تعذر التقاط صورة للشاشة: ${err.message})`);
}
}

// ================= أنظمة المربعات الشفافة الدقيقة =================
const GRID_COLS = 45;
const GRID_ROWS = 25;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS;

async function drawGridAndScreenshot(page, chatId, caption) {
try {
if (!page || page.isClosed()) throw new Error("الصفحة مغلقة");
await page.evaluate((specs) => { 
const oldOverlay = document.getElementById('bot-grid-overlay'); if (oldOverlay) oldOverlay.remove(); 
const overlay = document.createElement('div'); overlay.id = 'bot-grid-overlay'; 
overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;display:grid;grid-template-columns:repeat(' + specs.cols + ', 1fr);grid-template-rows:repeat(' + specs.rows + ', 1fr);'; 
for (let i = 0; i < specs.rows * specs.cols; i++) { 
const cell = document.createElement('div'); 
cell.style.cssText = 'border:1px solid rgba(255,255,0,0.5);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-family:sans-serif;font-weight:bold;text-shadow:1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;background:rgba(0,0,0,0.1);box-sizing:border-box;'; 
cell.innerText = i; overlay.appendChild(cell); 
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
try {
if(!page || page.isClosed()) return;
await page.evaluate(() => { const dot = document.getElementById('bot-red-dot'); if (dot) dot.remove(); });
} catch(e) {}
}

// ================= أنظمة القوائم التفاعلية =================
async function sendInteractiveMenu(chatId, text = "🎮 أنت الآن تتحكم بالمتصفح:\nالبوت في وضع الاستعداد ولن يغلق إلا بموافقتك.") {
const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
[{ text: '🌐 البحث عن الرابط', callback_data: 'int_goto_url' }], [{ text: '🔍 البحث على النص والضغط عليه', callback_data: 'int_search_text' }],
[{ text: '🖱️ ضغط ماوس (شبكة شفافة)', callback_data: 'int_mouse_menu' }], [{ text: '⌨️ كتابة نص', callback_data: 'int_type_text' }, { text: '↩️ انتر (Enter)', callback_data: 'int_press_enter' }],
[{ text: '📸 تحديث الشاشة', callback_data: 'int_refresh' }, { text: '🔐 المتابعة الى AF2', callback_data: 'int_continue_af2' }],
[{ text: '✅ إنهاء الجلسة واستخراج السكربت', callback_data: 'int_finish' }]
]}}; await bot.sendMessage(chatId, text, opts);
}

async function sendMouseMenu(chatId) {
const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
[{ text: '👁️ مشاهدة المربعات الشفافة', callback_data: 'int_show_grid' }], [{ text: '🧭 إرسال رقم المربع (لتحريك الماوس)', callback_data: 'int_move_mouse' }],
[{ text: '🔴 كليك (Click)', callback_data: 'int_click_mouse' }], [{ text: '🔙 رجوع للقائمة الرئيسية', callback_data: 'int_back_main' }]
]}}; await bot.sendMessage(chatId, `🖱️ **قائمة التحكم بالماوس الدقيق:**`, opts);
}

async function startInteractiveMode(chatId, page, context, tempDir, codeGen) {
userState[chatId].isInteractive = true; userState[chatId].page = page; userState[chatId].context = context;
userState[chatId].tempDir = tempDir; userState[chatId].codeGen = codeGen;
await sendInteractiveMenu(chatId);

return new Promise(resolve => { userState[chatId].resolveInteractive = resolve; 
setTimeout(() => { 
if (userState[chatId] && userState[chatId].isInteractive) { 
bot.sendMessage(chatId, "⏳ انتهت مهلة التحكم اليدوي (15 دقيقة). تم إنهاء الجلسة التفاعلية تلقائياً للحفاظ على الموارد."); 
userState[chatId].isInteractive = false; 
if (userState[chatId].context) userState[chatId].context.close().catch(()=>{}); 
if (userState[chatId].tempDir) try { fs.rmSync(userState[chatId].tempDir, { recursive: true, force: true }); } catch {} 
isProcessing = false; resolve(); 
} 
}, 15 * 60 * 1000); 
}); 
}

// ================= الدالة الرئيسية (إنشاء حساب) =================
async function createAccountLogic(chatId, isManual, manualData = null) {
let modeText = isManual ? "(يدوي)" : "(تلقائي)";
let statusMsgID = null;
userState[chatId] = { step: null, cancel: false, isInteractive: false };
const codeGen = new PlaywrightCodeGenerator();

const checkCancel = () => { if (userState[chatId]?.cancel) throw new Error("CANCELLED_BY_USER"); }; 
const updateStatus = async (text) => { checkCancel(); statusMsgID = await updateStatusMessage(chatId, `${modeText}: ${text}`, statusMsgID); return statusMsgID; }; 
await updateStatus("بدء العملية..."); 

let email, mailToken; let chatGptPassword = isManual ? manualData.password : generateSecurePassword(); 
if (isManual) { 
email = manualData.email; 
} else { 
try { 
const mailData = await createMailTmAccount(chatId); 
email = mailData.email; mailToken = mailData.token; 
} catch (e) { 
await bot.sendMessage(chatId, `❌ فشل إنشاء البريد`); return false; 
} 
} 

const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_wrk_')); 
let context, page; 
try { 
context = await chromium.launchPersistentContext(tempDir, { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'], viewport: { width: 1366, height: 768 } }); 
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
await page.keyboard.press('Enter'); 
await sleep(1500); 
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
await page.keyboard.press('Enter'); 
await sleep(1500); 
const continueBtn2 = page.locator('button[type="submit"], button:has-text("Continue")').first(); 
if (await continueBtn2.isVisible({timeout: 1000}).catch(()=>false)) await continueBtn2.click({ force: true }); 
codeGen.addCommand(`await page.keyboard.press('Enter');`); 
await sleep(7000); 
checkCancel(); 
await updateStatus("في انتظار صفحة الكود..."); 
let code = null; 
if (isManual) { 
await bot.sendMessage(chatId, "🛑 يرجى إرسال الكود المكون من 6 أرقام هنا في الشات (إذا طُلب منك)."); 
code = await new Promise((resolve) => { 
const listener = (msg) => { 
if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { 
bot.removeListener('message', listener); 
resolve(msg.text.trim()); 
} 
}; 
bot.on('message', listener); 
}); 
} else { 
code = await waitForMailTmCode(email, mailToken, chatId, 100); 
} 
if (code) { 
codeGen.addStep("إدخال كود التحقق (OTP)"); 
const codeInput = page.getByRole("textbox", { name: "Code" }); 
await codeInput.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => { 
await page.keyboard.type(code); 
}); 
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
codeGen.addStep("تعبئة الاسم والتعرف الذكي على العمر أو تاريخ الميلاد"); 
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
await continueBtn.click({force: true}); 
await sleep(1500); 
} else { 
await page.keyboard.press('Enter'); 
await sleep(1000); 
} 
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
codeGen.addStep("التحقق من وجود شاشات إخلاء المسؤولية الترحيبية وتخطيها"); 
codeGen.addRawBlock("مسح شاشة (You're all set) والضغط على Continue", [ 
`try {`, ` for (let k = 0; k < 2; k++) {`, ` const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Okay"), button:has-text("Next")').last();`, ` if (await continueBtn.isVisible({timeout: 1000})) {`, ` await continueBtn.click({ force: true });`, ` await page.waitForTimeout(1500);`, ` }`, ` }`, `} catch(e) {}` 
]); 
try { 
for (let k = 0; k < 3; k++) { 
const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Okay"), button:has-text("Next")').last(); 
if (await continueBtn.isVisible({ timeout: 1000 }).catch(()=>false)) { 
await continueBtn.click({ force: true }); await sleep(1500); 
} 
} 
} catch(e) {} 

await updateStatus("نجح الدخول! التوجه الفوري لإعدادات الأمان واستكمال الـ 2FA..."); 
codeGen.addStep("القفز المباشر لصفحة الأمان وتحديث الصفحة"); 
await page.goto("https://chatgpt.com/#settings/Security", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{}); 
await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{}); 
codeGen.addCommand(`await page.goto("https://chatgpt.com/#settings/Security");\n await page.reload({ waitUntil: "domcontentloaded" });`); 
await sleep(5000); 

await updateStatus("مسح أي نوافذ تحجب الماوس عن صفحة الأمان..."); 
codeGen.addStep("إغلاق النوافذ الترحيبية (Skip Tour / Continue) التي تحجب الماوس"); 
codeGen.addRawBlock("مسح النوافذ الترحيبية التي تحجب الشاشة", [ 
`await page.keyboard.press('Escape');`, `await page.waitForTimeout(1000);`, `const popupTexts = ['Continue', 'Skip Tour', 'Skip', 'Next', 'Okay', 'Done'];`, `for (let i = 0; i < 2; i++) {`, ` for (const pText of popupTexts) {`, ` try {`, ` const btn = page.locator(\`button:has-text("\${pText}"), a:has-text("\${pText}"), [role="button"]:has-text("\${pText}")\`).last();`, ` if (await btn.isVisible({ timeout: 500 })) { await btn.click({ force: true }); await page.waitForTimeout(1000); }`, ` } catch (e) {}`, ` }`, `}` 
]); 
await page.keyboard.press('Escape').catch(()=>{}); await sleep(1000); 
const popupTexts = ['Continue', 'Skip Tour', 'Skip', 'Next', 'Okay', 'Done']; 
for (let i = 0; i < 2; i++) { 
for (const pText of popupTexts) { 
try { 
const btn = page.locator(`button:has-text("${pText}"), a:has-text("${pText}"), [role="button"]:has-text("${pText}")`).last(); 
if (await btn.isVisible({ timeout: 500 }).catch(()=>false)) { 
await btn.click({ force: true }); await sleep(1000); 
} 
} catch (e) {} 
} 
} 

codeGen.addRawBlock("إعادة فتح نافذة الأمان في حال انغلقت بالخطأ أثناء المسح", [ 
`try {`, ` const mfaVis = await page.locator('text="Multi-factor authentication"').first().isVisible();`, ` if (!mfaVis) {`, ` await page.goto("https://chatgpt.com/");`, ` await page.waitForTimeout(1000);`, ` await page.goto("https://chatgpt.com/#settings/Security");`, ` await page.waitForTimeout(3000);`, ` }`, `} catch(e) {}` 
]); 
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
if (await smartEnableBtn.isVisible({ timeout: 1500 }).catch(()=>false)) { 
await smartEnableBtn.click({ force: true }); await sleep(2000); 
} 
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
codeGen.addRawBlock(`استخراج الكود السري وفتح نافذة 2fa.fb.tools لنسخ 6 أرقام ولصقها تلقائياً`, [ 
`const mfaPage = await context.newPage();`, `await mfaPage.goto("https://2fa.fb.tools/${secretCode}", { waitUntil: "domcontentloaded" });`, `await mfaPage.waitForTimeout(3000);`, `const mfaText = await mfaPage.innerText('body');`, `const code6Match = mfaText.match(/\\b\\d{3}\\s*\\d{3}\\b/);`, `if (code6Match) {`, ` const code6 = code6Match[0].replace(/\\s+/g, ''); await mfaPage.close(); await page.bringToFront();`, ` const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();`, ` if (await codeInput.isVisible()) { await codeInput.fill(code6); } else { await page.keyboard.type(code6, { delay: 100 }); }`, ` await page.waitForTimeout(1500); const enableBtn = page.locator('button:has-text("Verify"), button:has-text("Enable")').first();`, ` if (await enableBtn.isVisible()) { await enableBtn.click(); } else { await page.keyboard.press('Enter'); } }` 
]); 
const mfaPage = await context.newPage(); 
await mfaPage.goto(`https://2fa.fb.tools/${secretCode}`).catch(()=>{}); 
await sleep(3000); 
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
await bot.sendMessage(chatId, `✅ **تم إنشاء الحساب وتفعيل المصادقة الثنائية بنجاح!**\n\n📧 **الإيميل:** \`${email}\`\n🔑 **الباسورد:** \`${chatGptPassword}\`\n🔗 **رابط المصادقة:** https://2fa.fb.tools/${secretCode}`, { parse_mode: 'Markdown' } ); 

try { 
codeGen.addStep("الدخول إلى رابط السشن واستخراج البيانات"); 
await page.goto("https://chatgpt.com/api/auth/session", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{}); 
codeGen.addCommand(`await page.goto("https://chatgpt.com/api/auth/session");`); 
await sleep(2000); 
let sessionText = ""; 
try { sessionText = await page.innerText('body'); } catch (err) { sessionText = await page.evaluate(() => document.body ? document.body.innerText : document.documentElement.innerText).catch(() => "لم يتم العثور على بيانات"); } 
const sessionFilePath = path.join(__dirname, `session_${Date.now()}.txt`); 
fs.writeFileSync(sessionFilePath, sessionText); 
await bot.sendDocument(chatId, sessionFilePath, { caption: "📄 **بيانات السشن (Session Data)**" }).catch(()=>{}); 
if (fs.existsSync(sessionFilePath)) fs.unlinkSync(sessionFilePath); 
} catch (sessionErr) {} 

codeGen.addStep("إنهاء العملية وإغلاق المتصفح"); 
if (context) await context.close().catch(()=>{}); 
if (tempDir) try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
const jsCode = codeGen.getFinalScript(); 
const logPath = path.join(__dirname, `AutoGenerated_Script_${Date.now()}.js`); 
fs.writeFileSync(logPath, jsCode); 
await bot.sendDocument(chatId, logPath, { caption: "🧑‍💻 **تم توليد السكربت النهائي بنجاح!**", parse_mode: 'Markdown' }); 
fs.unlinkSync(logPath); 
isProcessing = false; 
sendMainMenu(chatId); 
return true; 
} 
} 
await bot.sendMessage(chatId, "⚠️ **لم يتم العثور على الكود 32 حرف، سيتم تحويلك للتحكم اليدوي.**"); 
await drawGridAndScreenshot(page, chatId, "🔲 **صورة الشاشة مقسمة لمربعات:**"); 
await startInteractiveMode(chatId, page, context, tempDir, codeGen); 
} else { throw new Error(`تعذر التعرف على واجهة الصفحة الحالية للأسف.`); } 
} catch (error) { 
if (error.message === "CANCELLED_BY_USER") { 
if (context) await context.close().catch(()=>{}); 
try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
return false; 
} 
if (userState[chatId]) userState[chatId].isInteractive = true; 
try { if (page && !page.isClosed()) await page.evaluate(() => window.stop()); } catch(e){} 
await bot.sendMessage(chatId, `⚠️ **توقف مؤقت للحماية:**\nتغير شكل الموقع، تم تحويلك للتحكم اليدوي كي لا تضيع محاولتك.`); 
if (page && context && !userState[chatId].cancel) { 
await sendErrorScreenshot(page, chatId, error.message); 
await startInteractiveMode(chatId, page, context, tempDir, codeGen); 
} else { 
await bot.sendMessage(chatId, `⚠️ **فشل كلي:** لم يتمكن المتصفح من البقاء مفتوحاً.`); 
isProcessing = false; 
} 
} finally { 
if (userState[chatId] && !userState[chatId].isInteractive) { 
if (context) await context.close().catch(()=>{}); 
try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
isProcessing = false; 
} 
} 
return true; 
}

// ================= القوائم واستجابات البوت =================
function sendMainMenu(chatId) {
bot.sendMessage(chatId, "👋 نورت ! اختر العملية للبدء:", {
parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
[{ text: '▶️ تشغيل تلقائي', callback_data: 'create_auto' }, { text: '✍️ تشغيل يدوي (مع 2FA)', callback_data: 'create_manual' }],
[{ text: '🔄 تغيير الايميل', callback_data: 'change_email' }],
[{ text: '🛑 إلغاء العملية', callback_data: 'cancel' }]
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
// زر المقاطعة للتدخل اليدوي الفوري
if (query.data === 'trigger_manual') {
    bot.sendMessage(chatId, "⚙️ تم استلام أمر التدخل اليدوي، جاري إيقاف السكربت التلقائي والتبديل فوراً...");
    state.manualOverride = true;
    if (state.rejectInput) state.rejectInput(new Error("MANUAL_MODE_REQUESTED"));
    return;
}

if (query.data.startsWith('int_')) { 
const action = query.data.replace('int_', ''); 
if (!state.isInteractive || !state.page || state.page.isClosed()) return bot.sendMessage(chatId, "⚠️ الجلسة منتهية أو المتصفح مغلق."); 
if (action === 'goto_url') { 
bot.sendMessage(chatId, "🌐 أرسل **الرابط (URL)**:", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } }); state.step = 'awaiting_goto_url'; 
} else if (action === 'continue_af2') { 
bot.sendMessage(chatId, "⏳ جاري استخراج كود الـ 32 حرف وإكمال إجراءات الـ AF2..."); 
try { 
let pageText = await state.page.innerText('body'); 
let secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/); 
if (!secretMatch) { 
const troubleBtn = state.page.locator('text="Trouble scanning?"').first(); 
if (await troubleBtn.isVisible().catch(()=>false)) { 
await troubleBtn.click(); await sleep(1500); 
pageText = await state.page.innerText('body'); secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/); 
} 
} 
if (secretMatch) { 
const secretCode = secretMatch[0]; 
const mfaPage = await state.context.newPage(); 
await mfaPage.goto(`https://2fa.fb.tools/${secretCode}`).catch(()=>{}); await sleep(3000); 
const mfaText = await mfaPage.innerText('body'); const code6Match = mfaText.match(/\b\d{3}\s*\d{3}\b/); 
if (code6Match) { 
const code6 = code6Match[0].replace(/\s+/g, ''); 
await mfaPage.close(); await state.page.bringToFront(); 
const codeInput = state.page.locator('input[type="text"], input[placeholder*="code" i]').first(); 
if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code6); else await state.page.keyboard.type(code6, { delay: 100 }); 
await sleep(1500); 
const enableBtn = state.page.locator('button:has-text("Verify"), button:has-text("Enable")').first(); 
if (await enableBtn.isVisible().catch(()=>false)) await enableBtn.click(); else await state.page.keyboard.press('Enter'); 
await sleep(3000); 
const acc = state.accountInfo || { email: "غير متوفر", password: "غير متوفر" }; 
await bot.sendMessage(chatId, `✅ **تمت المصادقة الثنائية بنجاح!**\n\n📧 **الإيميل:** \`${acc.email}\`\n🔑 **الباسورد:** \`${acc.password}\`\n🔗 **رابط المصادقة:** https://2fa.fb.tools/${secretCode}`, { parse_mode: 'Markdown' }); 
try { 
await state.page.goto("https://chatgpt.com/api/auth/session", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{}); await sleep(2000); 
let sessionText = ""; try { sessionText = await state.page.innerText('body'); } catch (err) { sessionText = await state.page.evaluate(() => document.body ? document.body.innerText : document.documentElement.innerText).catch(() => "لم يتم العثور على بيانات"); } 
const sessionFilePath = path.join(__dirname, `session_${Date.now()}.txt`); fs.writeFileSync(sessionFilePath, sessionText); 
await bot.sendDocument(chatId, sessionFilePath, { caption: "📄 **بيانات السشن**" }).catch(()=>{}); 
if (fs.existsSync(sessionFilePath)) fs.unlinkSync(sessionFilePath); 
} catch (sessionErr) {} 
state.isInteractive = false; 
if (state.context) await state.context.close().catch(()=>{}); 
if (state.tempDir) try { fs.rmSync(state.tempDir, { recursive: true, force: true }); } catch {} 
const jsCode = state.codeGen.getFinalScript(); const logPath = path.join(__dirname, `AutoGenerated_Script_${Date.now()}.js`); fs.writeFileSync(logPath, jsCode); 
await bot.sendDocument(chatId, logPath, { caption: "🧑‍💻 **تم توليد السكربت النهائي!**", parse_mode: 'Markdown' }); fs.unlinkSync(logPath); 
if (state.resolveInteractive) state.resolveInteractive(); isProcessing = false; sendMainMenu(chatId); 
} else { bot.sendMessage(chatId, "❌ لم أتمكن من استخراج كود الـ 6 أرقام."); await sendInteractiveMenu(chatId); } 
} else { bot.sendMessage(chatId, "❌ لم أتمكن من العثور على الكود 32 حرف."); await sendInteractiveMenu(chatId); } 
} catch (err) { bot.sendMessage(chatId, `❌ حدث خطأ: ${err.message}`); await sendInteractiveMenu(chatId); } 
return; 
} else if (action === 'search_text') { bot.sendMessage(chatId, "🔍 أرسل **النص**:", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } }); state.step = 'awaiting_search_text'; } 
else if (action === 'mouse_menu') { await sendMouseMenu(chatId); } 
else if (action === 'show_grid') { await drawGridAndScreenshot(state.page, chatId, `👁️ **المربعات الشفافة المعروضة:**`); await sendMouseMenu(chatId); } 
else if (action === 'move_mouse') { bot.sendMessage(chatId, `🧭 أرسل **رقم المربع**:`, { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } }); state.step = 'awaiting_move_mouse'; } 
else if (action === 'click_mouse') { 
if (state.mouseX !== undefined && state.mouseY !== undefined) { 
try { await removeRedDot(state.page); await state.page.mouse.click(state.mouseX, state.mouseY); await sleep(1500); await bot.sendMessage(chatId, `🔴 تم الضغط!`); } catch(e) { bot.sendMessage(chatId, `❌ فشل الضغط: ${e.message}`); } 
} else { bot.sendMessage(chatId, "⚠️ يرجى تحريك الماوس أولاً."); } 
await sendInteractiveMenu(chatId); 
} 
else if (action === 'type_text') { bot.sendMessage(chatId, "⌨️ أرسل النص:", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } }); state.step = 'awaiting_type_text'; } 
else if (action === 'press_enter') { 
try { await state.page.keyboard.press('Enter'); await sleep(1500); await bot.sendMessage(chatId, "↩️ تم الضغط."); } catch(e) { bot.sendMessage(chatId, `❌ خطأ بالضغط: ${e.message}`); } 
await sendInteractiveMenu(chatId); 
} 
else if (action === 'refresh') { 
try { const buffer = await state.page.screenshot({ fullPage: false, timeout: 15000 }); await bot.sendPhoto(chatId, buffer, { caption: "📸 تحديث الشاشة:" }, { filename: 'refresh.png', contentType: 'image/png' }); } catch(e) { bot.sendMessage(chatId, `❌ تعذر تحديث الصورة: ${e.message}`); } 
await sendInteractiveMenu(chatId); 
} 
else if (action === 'back_main') { state.step = null; await sendInteractiveMenu(chatId); } 
else if (action === 'finish') { 
bot.sendMessage(chatId, "✅ جاري استخراج السكربت..."); state.isInteractive = false; 
if (state.context) await state.context.close().catch(()=>{}); if (state.tempDir) try { fs.rmSync(state.tempDir, { recursive: true, force: true }); } catch {} 
const jsCode = state.codeGen.getFinalScript(); const logPath = path.join(__dirname, `AutoGenerated_Script_${Date.now()}.js`); fs.writeFileSync(logPath, jsCode); 
await bot.sendDocument(chatId, logPath, { caption: "🧑‍💻 **تم توليد السكربت!**", parse_mode: 'Markdown' }); fs.unlinkSync(logPath); 
if (state.resolveInteractive) state.resolveInteractive(); isProcessing = false; sendMainMenu(chatId); 
} 
return; 
} 

if (query.data === 'cancel') { 
state.cancel = true; 
if (state.resolveInteractive) state.resolveInteractive(); 
if (state.context) await state.context.close().catch(()=>{}); 
if (state.tempDir) try { fs.rmSync(state.tempDir, { recursive: true, force: true }); } catch {} 
bot.sendMessage(chatId, "🛑 تم إلغاء العملية."); 
isProcessing = false; 
} else if (query.data === 'create_auto') { 
if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول."); 
isProcessing = true; await createAccountLogic(chatId, false); 
} else if (query.data === 'create_manual') { 
if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول."); 
state.step = 'awaiting_email'; bot.sendMessage(chatId, "➡️ أرسل **الإيميل** للبدء:"); 
} else if (query.data === 'change_email') {
if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول.");
isProcessing = true;
userState[chatId] = { step: null, cancel: false, isInteractive: false, manualOverride: false };
changeEmailLogic(chatId);
}
} catch(err) { bot.sendMessage(chatId, `❌ حدث خطأ داخلي: ${err.message}`); } 
});

bot.on('message', async (msg) => {
const chatId = msg.chat.id; const text = msg.text?.trim(); const state = userState[chatId];
if (!state || !text || text.startsWith('/')) return;

try { 
if (state.step === 'awaiting_goto_url' && state.isInteractive) { 
state.step = null; let targetUrl = text; if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl; 
try { await state.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }); await sleep(3000); bot.sendMessage(chatId, `✅ تم الفتح.`); } catch(e) { bot.sendMessage(chatId, `❌ فشل: ${e.message}`); } 
await sendInteractiveMenu(chatId); 
} else if (state.step === 'awaiting_search_text' && state.isInteractive) { 
state.step = null; const safeText = text.replace(/'/g, "\\'"); 
try { 
const loc = state.page.locator(`text="${text}"`).first(); 
if (await loc.isVisible({ timeout: 5000 }).catch(()=>false)) { await loc.click(); await sleep(1500); bot.sendMessage(chatId, `🎯 تم الضغط.`); } else bot.sendMessage(chatId, `❌ لم أتمكن من العثور.`); 
} catch(e) { bot.sendMessage(chatId, `❌ خطأ: ${e.message}`); } 
await sendInteractiveMenu(chatId); 
} else if (state.step === 'awaiting_move_mouse' && state.isInteractive) { 
const num = parseInt(text); 
if (!isNaN(num) && num >= 0 && num < TOTAL_CELLS) { 
state.step = null; 
try { 
const vw = 1366 / GRID_COLS; const vh = 768 / GRID_ROWS; const col = num % GRID_COLS; const row = Math.floor(num / GRID_COLS); 
const x = parseFloat(((col * vw) + (vw / 2)).toFixed(2)); const y = parseFloat(((row * vh) + (vh / 2)).toFixed(2)); 
state.mouseX = x; state.mouseY = y; await state.page.mouse.move(x, y); await drawRedDot(state.page, x, y); 
const buffer = await state.page.screenshot({ fullPage: false, timeout: 15000 }); 
await bot.sendPhoto(chatId, buffer, { caption: `🔴 الماوس بالمربع [${num}].` }, { filename: 'dot.png', contentType: 'image/png' }); 
} catch(e) { bot.sendMessage(chatId, `❌ تعذر تصوير المؤشر: ${e.message}`); } 
await sendMouseMenu(chatId); 
} else bot.sendMessage(chatId, `❌ رقم خطأ.`); 
} else if (state.step === 'awaiting_type_text' && state.isInteractive) { 
state.step = null; try { await state.page.keyboard.type(text, { delay: 50 }); await sleep(1000); bot.sendMessage(chatId, `⌨️ تمت الكتابة.`); } catch(e) { bot.sendMessage(chatId, `❌ خطأ في الكتابة: ${e.message}`); } 
await sendInteractiveMenu(chatId); 
} else if (state.step === 'awaiting_email') { 
if (!text.includes('@')) return bot.sendMessage(chatId, "❌ إيميل غير صحيح."); 
state.step = null; isProcessing = true; const autoPass = generateSecurePassword(); 
bot.sendMessage(chatId, `✅ تم استلام البريد.\n🔑 الباسورد: \`${autoPass}\``, {parse_mode: 'Markdown'}); 
await createAccountLogic(chatId, true, { email: text, password: autoPass }); 
} 
} catch(err) { console.error(err); } 
});

process.on('uncaughtException', (err) => { console.error('Uncaught:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled:', reason); });

console.log("🤖 البوت يعمل (تحديث تغيير الإيميل + تصوير حي + مقاطعة التدخل اليدوي الذكية!)...");
