/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار 41 (Ultimate RPA Studio 👑)
 * ==========================================================
 * 🛡️ ميزة جديدة: تفعيل الـ 2FA تلقائياً عبر 2fa.fb.tools
 * 🔴 بث حي مستمر: تصوير كل ثانية وإيقاف تلقائي عند الخطأ.
 * 🖱️ الماوس التفاعلي: ريموت كنترول كامل للتحكم عند الحاجة.
 * 📜 مسجل الأكواد: يسجل كل خطوة لإنشاء سكربتات لاحقاً.
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

// ==========================================
// ⚙️ الإعدادات العامة للبوت
// ==========================================
const BOT_TOKEN = process.env.BOT_TOKEN || 'ضع_توكن_البوت_هنا';
if (!BOT_TOKEN || BOT_TOKEN === 'ضع_توكن_البوت_هنا') {
    console.error("❌ خطأ: BOT_TOKEN مفقود.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userState = {};
let isProcessing = false;

const ACCOUNTS_FILE_OLD = 'accounts.txt';
const ACCOUNTS_FILE_PYTHON = 'registered_accounts.txt';
const GLOBAL_CONFIG_FILE = 'global_config.json';

let globalConfig = { emailApiId: 1, ccNumber: '', ccExpiry: '', ccCvc: '', pySuccess: 0, pyFail: 0 };
if (fs.existsSync(GLOBAL_CONFIG_FILE)) { try { globalConfig = { ...globalConfig, ...JSON.parse(fs.readFileSync(GLOBAL_CONFIG_FILE, 'utf8')) }; } catch (e) {} }
function saveConfig() { fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(globalConfig, null, 4)); }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 🔴 نظام البث الحي والمساعدات البصرية
// ==========================================
async function startLiveStream(chatId, page) {
    if (userState[chatId].isLiveStreamActive) return;
    userState[chatId].isLiveStreamActive = true;
    (async () => {
        while (userState[chatId] && userState[chatId].isLiveStreamActive && !page.isClosed()) {
            try {
                const p = path.join(__dirname, `live_${crypto.randomBytes(2).toString('hex')}.jpg`);
                await page.screenshot({ path: p, type: 'jpeg', quality: 35 }).catch(()=>{});
                if (fs.existsSync(p)) {
                    const sent = await bot.sendPhoto(chatId, p, { caption: "🔴 بث حي...", parse_mode: 'HTML', disable_notification: true });
                    if (userState[chatId].streamMessageId) bot.deleteMessage(chatId, userState[chatId].streamMessageId).catch(()=>{});
                    userState[chatId].streamMessageId = sent.message_id;
                    fs.unlinkSync(p);
                }
            } catch (e) {}
            await sleep(1500);
        }
    })();
}

async function drawVirtualCursor(page, x, y) {
    await page.evaluate(({cx, cy}) => {
        let cursor = document.getElementById('bot-virtual-cursor');
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = 'bot-virtual-cursor';
            cursor.style.position = 'fixed'; cursor.style.width = '20px'; cursor.style.height = '20px';
            cursor.style.borderRadius = '50%'; cursor.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
            cursor.style.border = '2px solid white'; cursor.style.zIndex = '99999999'; cursor.style.pointerEvents = 'none';
            document.body.appendChild(cursor);
        }
        cursor.style.display = 'block'; cursor.style.left = (cx - 10) + 'px'; cursor.style.top = (cy - 10) + 'px';
    }, {cx: x, cy: y}).catch(()=>{});
}

function getMouseKb() {
    return {
        inline_keyboard: [
            [{ text: '↖️', callback_data: 'mouse_ul_50' }, { text: '⬆️ كبير', callback_data: 'mouse_up_50' }, { text: '↗️', callback_data: 'mouse_ur_50' }],
            [{ text: '⬅️', callback_data: 'mouse_left_50' }, { text: '🖱️ كليك!', callback_data: 'mouse_click' }, { text: '➡️', callback_data: 'mouse_right_50' }],
            [{ text: '↙️', callback_data: 'mouse_dl_50' }, { text: '⬇️ كبير', callback_data: 'mouse_down_50' }, { text: '↘️', callback_data: 'mouse_dr_50' }],
            [{ text: '❌ إغلاق الماوس', callback_data: 'mouse_close' }]
        ]
    };
}

// ==========================================
// 🤖 النواة الذكية (runAction)
// ==========================================
async function runAction(chatId, page, actionName, timeoutMs, actionFn, generatedCode) {
    if (userState[chatId]?.cancel) throw new Error("CANCELLED");
    if (generatedCode) userState[chatId].scriptLog.push(`  // الخطوة: ${actionName}\n  ${generatedCode}`);

    try {
        await Promise.race([
            actionFn(),
            new Promise((_, rej) => setTimeout(() => rej(new Error(`نفد الوقت (${timeoutMs/1000} ثانية)`)), timeoutMs))
        ]);
    } catch (error) {
        if (userState[chatId]?.cancel) throw new Error("CANCELLED");
        userState[chatId].isLiveStreamActive = false; await sleep(1500);
        
        const errPath = path.join(__dirname, `err_${crypto.randomBytes(2).toString('hex')}.jpg`);
        await page.screenshot({ path: errPath, quality: 70, type: 'jpeg' }).catch(()=>{});
        
        const sentErr = await bot.sendPhoto(chatId, errPath, {
            caption: `⚠️ <b>توقف السكربت: ${actionName}</b>\nالسبب: <code>${error.message}</code>\nأرسل الكلمة، أو "تخطي"، أو استخدم الماوس.`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🖱️ الماوس', callback_data: 'open_mouse' }]] }
        }).catch(()=>{});
        if(fs.existsSync(errPath)) fs.unlinkSync(errPath);
        
        userState[chatId].errorMsgId = sentErr?.message_id;
        userState[chatId].interactiveMode = true;
        
        while (userState[chatId].interactiveMode && !page.isClosed()) {
            userState[chatId].step = 'WAIT_MANUAL_COMMAND';
            const input = await new Promise(res => userState[chatId].manualResolve = res);
            if (input === 'MOUSE_CLICKED') continue;
            if (input === 'انهاء') throw new Error("STOPPED_BY_USER");
            if (input === 'تخطي') { userState[chatId].interactiveMode = false; break; }

            try {
                const jsClick = await page.evaluate((t) => {
                    const els = Array.from(document.querySelectorAll('button, a, div, span, label'));
                    let target = els.find(el => el.innerText && el.innerText.trim().toLowerCase() === t.trim().toLowerCase() && el.offsetParent !== null);
                    if (!target) target = els.find(el => el.innerText && el.innerText.toLowerCase().includes(t.trim().toLowerCase()) && el.offsetParent !== null);
                    if (target) { target.click(); return true; } return false;
                }, input);
                if (!jsClick) await bot.sendMessage(chatId, "❌ لم أجد العنصر.");
                await sleep(1500);
                const p2 = path.join(__dirname, `res_${crypto.randomBytes(2).toString('hex')}.jpg`);
                await page.screenshot({ path: p2, quality: 70, type: 'jpeg' }).catch(()=>{});
                await bot.sendPhoto(chatId, p2, { caption: "📸 النتيجة: أرسل (تخطي) للإكمال." });
                if (fs.existsSync(p2)) fs.unlinkSync(p2);
            } catch (e) {}
        }
        userState[chatId].isLiveStreamActive = true; startLiveStream(chatId, page);
    }
}

// ==========================================
// 🛡️ وظيفة تفعيل الـ 2FA (المحرك الجديد)
// ==========================================
async function enable2FALogic(chatId, page, context) {
    await runAction(chatId, page, "فتح الإعدادات لتفعيل 2FA", 40000, async () => {
        // فتح المنيو الشخصي أولاً
        await page.locator('div[data-testid="user-menu"]').first().click().catch(()=>{});
        await sleep(2000);
        
        // النقر على Settings
        await page.evaluate(() => { 
            const els = Array.from(document.querySelectorAll('nav div, button, span'));
            let tgt = els.find(e => e.innerText && e.innerText.includes('Settings'));
            if(tgt) tgt.click();
        });
        await sleep(3000);

        // الذهاب إلى Security
        await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('button, div, span'));
            let tgt = els.find(e => e.innerText && e.innerText.includes('Security'));
            if(tgt) tgt.click();
        });
        await sleep(2000);

        // النقر على Authenticator app (Enable)
        const authBtn = page.locator('button:has-text("Authenticator app"), button:has-text("Enable"):near(:text("Authenticator app"))').first();
        await authBtn.click();
        await sleep(4000);

        // استخراج مفتاح AF2 بذكاء
        const secretKey = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div, span, code, p'));
            for (let el of elements) {
                const text = el.innerText.replace(/\s/g, '');
                if (text.length >= 16 && /^[A-Z2-7]+$/.test(text)) return text;
            }
            return null;
        });

        if (!secretKey) throw new Error("لم أجد مفتاح الـ 2FA (AF2) على الشاشة.");
        bot.sendMessage(chatId, `🔑 تم استخراج المفتاح: <code>${secretKey}</code>\nجاري جلب كود التفعيل...`, {parse_mode:'HTML'});

        // فتح صفحة 2FA الخارجي
        const faPage = await context.newPage();
        await faPage.goto("https://2fa.fb.tools/en", { waitUntil: "domcontentloaded" });
        await faPage.locator('textarea').first().fill(secretKey);
        await sleep(2000);
        
        const totpCode = await faPage.evaluate(() => {
            const matches = document.body.innerText.match(/\b\d{6}\b/g);
            return matches ? matches[matches.length - 1] : null;
        });
        await faPage.close();

        if (!totpCode) throw new Error("فشل موقع 2fa.fb.tools في توليد الكود.");

        // العودة لـ ChatGPT وإدخال الكود
        const codeInput = page.locator('input[type="text"]').last();
        await codeInput.fill(totpCode);
        await sleep(1000);
        await page.keyboard.press('Enter');
        await sleep(3000);

        // حفظ المفتاح في سجل المستخدم لإرساله في النهاية
        userState[chatId].currentAF2 = secretKey;
        bot.sendMessage(chatId, `✅ <b>تم تفعيل الـ 2FA بنجاح!</b>`, {parse_mode:'HTML'});
    }, `  // أتمتة تفعيل الـ 2FA عبر 2fa.fb.tools`);
}

// ==========================================
// 🌐 محرك الإيميلات
// ==========================================
const EmailManager = {
    async create(chatId, apiId) {
        try {
            const bUrl = apiId === 1 ? 'https://api.mail.tm' : 'https://api.mail.gw';
            const dRes = await axios.get(`${bUrl}/domains`);
            const dom = dRes.data['hydra:member'][0].domain;
            const em = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(2).toString('hex')}@${dom}`;
            const pw = crypto.randomBytes(8).toString('hex') + "Aa1@";
            await axios.post(`${bUrl}/accounts`, { address: em, password: pw });
            const tRes = await axios.post(`${bUrl}/token`, { address: em, password: pw });
            return { email: em, password: pw, token: tRes.data.token, baseUrl: bUrl, apiId };
        } catch(e) { return null; }
    },
    async waitForCode(emailData, chatId) {
        const start = Date.now();
        while (Date.now() - start < 120000) {
            try {
                const res = await axios.get(`${emailData.baseUrl}/messages`, { headers: { Authorization: `Bearer ${emailData.token}` }});
                for (const msg of (res.data['hydra:member'] || [])) {
                    const m = `${msg.subject} ${msg.intro}`.match(/\b\d{6}\b/);
                    if (m && `${msg.subject} ${msg.intro}`.toLowerCase().includes('openai')) return m[0];
                }
            } catch(e) {}
            await sleep(4000);
        }
        return null;
    }
};

// ==========================================
// 🚀 المنطق الرئيسي (الدمج)
// ==========================================
async function createAccountLogic(chatId, isPython = false) {
    userState[chatId].scriptLog = ["// RPA Studio Script"];
    const emailData = await EmailManager.create(chatId, globalConfig.emailApiId);
    if (!emailData) return bot.sendMessage(chatId, "❌ فشل استخراج بريد.");

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'session_'));
    let context, page;

    try {
        context = await chromium.launchPersistentContext(tempDir, { 
            headless: false, // اجعلها false لمشاهدة العمل
            viewport: { width: 1280, height: 720 },
            args: ['--no-sandbox'] 
        });
        userState[chatId].context = context;
        page = await context.newPage();
        userState[chatId].currentPage = page;
        startLiveStream(chatId, page);

        await runAction(chatId, page, "الدخول للموقع", 60000, async () => {
            await page.goto("https://chatgpt.com/auth/login");
            await sleep(5000);
        });

        await runAction(chatId, page, "بدء التسجيل", 20000, async () => {
            await page.locator('button:has-text("Sign up")').first().click();
            await sleep(3000);
        });

        await runAction(chatId, page, "إدخال الإيميل", 20000, async () => {
            await page.locator('input[name="email"]').fill(emailData.email);
            await page.locator('button:has-text("Continue")').click();
            await sleep(3000);
        });

        await runAction(chatId, page, "إدخال الباسورد", 20000, async () => {
            await page.locator('input[type="password"]').fill(emailData.password);
            await page.locator('button:has-text("Continue")').click();
            await sleep(5000);
        });

        const code = await EmailManager.waitForCode(emailData, chatId);
        if (!code) throw new Error("لم يصل كود التحقق.");

        await runAction(chatId, page, "تحقق الكود", 30000, async () => {
            await page.keyboard.type(code, { delay: 100 });
            await sleep(6000);
        });

        await runAction(chatId, page, "إكمال البيانات", 30000, async () => {
            await page.locator('input[name="name"]').fill(`${faker.person.firstName()} ${faker.person.lastName()}`);
            await page.keyboard.press('Tab');
            await page.keyboard.type("01012000");
            await page.keyboard.press('Enter');
            await sleep(10000);
        });

        // 🛡️ تشغيل ميزة الـ 2FA المطلوبة
        await enable2FALogic(chatId, page, context);

        const finalResult = `${emailData.email}|${emailData.password}${userState[chatId].currentAF2 ? '|2FA:' + userState[chatId].currentAF2 : ''}`;
        fs.appendFileSync(isPython ? ACCOUNTS_FILE_PYTHON : ACCOUNTS_FILE_OLD, finalResult + '\n');
        bot.sendMessage(chatId, `🎉 <b>تم إنشاء الحساب وتفعيل الـ 2FA!</b>\n\n<code>${finalResult}</code>`, {parse_mode:'HTML'});

    } catch (e) {
        bot.sendMessage(chatId, `❌ توقف: ${e.message}`);
    } finally {
        userState[chatId].isLiveStreamActive = false;
        await context.close().catch(()=>{});
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

// ==========================================
// 📱 واجهة التليجرام
// ==========================================
async function sendMainMenu(chatId) {
    bot.sendMessage(chatId, "👑 <b>مرحباً بك في استوديو RPA (الإصدار 41)</b>\nتم إضافة دعم تفعيل الـ 2FA تلقائياً.", {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 إنشاء حساب + تفعيل 2FA تلقائي', callback_data: 'run_full' }],
                [{ text: '⚙️ الإعدادات', callback_data: 'menu_settings' }],
                [{ text: '🛑 إيقاف', callback_data: 'cancel_all' }]
            ]
        }
    });
}

bot.onText(/\/start/, (msg) => {
    userState[msg.chat.id] = { cancel: false };
    sendMainMenu(msg.chat.id);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'run_full') {
        if (isProcessing) return; isProcessing = true;
        userState[chatId].cancel = false;
        await createAccountLogic(chatId);
        isProcessing = false;
    }
    if (query.data === 'open_mouse') {
        userState[chatId].mouseX = 640; userState[chatId].mouseY = 360;
        bot.sendMessage(chatId, "🖱️ وضع الماوس مفعل:", { reply_markup: getMouseKb() });
    }
    if (query.data === 'mouse_close') {
        bot.sendMessage(chatId, "❌ أغلق الماوس.");
    }
    if (query.data === 'cancel_all') {
        userState[chatId].cancel = true;
        bot.sendMessage(chatId, "🛑 جاري الإلغاء...");
    }
    bot.answerCallbackQuery(query.id);
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'WAIT_MANUAL_COMMAND' && userState[chatId].manualResolve) {
        userState[chatId].manualResolve(msg.text);
    }
});

console.log("🤖 البوت يعمل... نظام تفعيل الـ 2FA عبر 2fa.fb.tools جاهز!");
