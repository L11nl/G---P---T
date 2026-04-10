/**
 * ChatGPT Bot Creator - الإصدار المصحح
 * ملاحظات: انسخ هذا الملف كـ index.js أو main.js
 */

const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright-extra');
let stealth;
try {
    // حاول تحميل نسخة متوافقة مع Playwright إن كانت متاحة
    stealth = require('playwright-extra-plugin-stealth')();
    chromium.use(stealth);
} catch (e) {
    // إن لم تتوفر الحزمة، استمر بدونها مع تحذير
    console.warn('⚠️ تحذير: playwright-extra-plugin-stealth غير متوفر. سيتم المتابعة بدون stealth.');
}

const axios = require('axios');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN || 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة';
if (!BOT_TOKEN || BOT_TOKEN === 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة') {
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
if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
    try { globalConfig = { ...globalConfig, ...JSON.parse(fs.readFileSync(GLOBAL_CONFIG_FILE, 'utf8')) }; } catch (e) { console.warn('Failed to parse global_config.json'); }
}
function saveConfig() { fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(globalConfig, null, 4)); }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// -----------------------------
// Helpers: ensure state, typing, manual code wait, safe file ops
// -----------------------------
function ensureUserState(chatId) {
    if (!userState[chatId]) {
        userState[chatId] = {
            step: null,
            cancel: false,
            context: null,
            isLiveStreamActive: false,
            scriptLog: [],
            streamMessageId: null,
            errorMsgId: null,
            interactiveMode: false,
            manualResolve: null,
            currentPage: null
        };
    }
}

async function typeSequentially(target, text, delay = 80) {
    // target can be a locator or page
    try {
        if (target && typeof target.type === 'function') {
            await target.type(text, { delay });
            return;
        }
        // fallback: assume page.keyboard
        if (target && target.keyboard) {
            for (const ch of text) {
                await target.keyboard.type(ch);
                await sleep(delay);
            }
            return;
        }
        // last fallback: global keyboard via page if provided as object with page property
        throw new Error('No valid typing target provided');
    } catch (e) {
        throw e;
    }
}

function waitForManualCode(chatId, timeout = 5 * 60 * 1000) {
    ensureUserState(chatId);
    return new Promise((resolve, reject) => {
        const onMsg = (msg) => {
            try {
                if (msg.chat && msg.chat.id === chatId && typeof msg.text === 'string' && /^\d{6}$/.test(msg.text.trim())) {
                    cleanup();
                    resolve(msg.text.trim());
                }
            } catch (e) {}
        };
        const cancelChecker = setInterval(() => {
            if (userState[chatId]?.cancel) { cleanup(); reject(new Error('CANCELLED')); }
        }, 1000);

        const timer = setTimeout(() => { cleanup(); reject(new Error('TIMEOUT')); }, timeout);

        function cleanup() {
            bot.removeListener('message', onMsg);
            clearInterval(cancelChecker);
            clearTimeout(timer);
        }

        bot.on('message', onMsg);
    });
}

async function safeSendPhoto(chatId, filePath, options = {}) {
    try {
        const sent = await bot.sendPhoto(chatId, filePath, options);
        return sent;
    } catch (e) {
        console.error('sendPhoto failed', e.message || e);
        throw e;
    } finally {
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
    }
}

// -----------------------------
// Live stream and virtual cursor
// -----------------------------
async function startLiveStream(chatId, page) {
    ensureUserState(chatId);
    if (userState[chatId].isLiveStreamActive) return;
    userState[chatId].isLiveStreamActive = true;
    userState[chatId].streamMessageId = null;

    (async () => {
        while (userState[chatId] && userState[chatId].isLiveStreamActive && page && !page.isClosed?.()) {
            try {
                const p = path.join(__dirname, `live_${crypto.randomBytes(2).toString('hex')}.jpg`);
                await page.screenshot({ path: p, type: 'jpeg', quality: 35 }).catch(()=>{});
                if (fs.existsSync(p)) {
                    try {
                        const sent = await bot.sendPhoto(chatId, p, { caption: "🔴 <b>بث حي للشاشة (يتحدث تلقائياً)...</b>\nإذا توقف السكربت سيطلب تدخلك.", parse_mode: 'HTML', disable_notification: true });
                        if (userState[chatId].streamMessageId) bot.deleteMessage(chatId, userState[chatId].streamMessageId).catch(()=>{});
                        userState[chatId].streamMessageId = sent.message_id;
                    } catch (e) {
                        console.warn('Failed to send live screenshot', e.message || e);
                    } finally {
                        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
                    }
                }
            } catch (e) {
                console.warn('Live stream loop error', e.message || e);
            }
            await sleep(1500);
        }
        if (userState[chatId]?.streamMessageId) bot.deleteMessage(chatId, userState[chatId].streamMessageId).catch(()=>{});
    })();
}

async function drawVirtualCursor(page, x, y) {
    try {
        await page.evaluate(({cx, cy}) => {
            let cursor = document.getElementById('bot-virtual-cursor');
            if (!cursor) {
                cursor = document.createElement('div');
                cursor.id = 'bot-virtual-cursor';
                cursor.style.position = 'fixed';
                cursor.style.width = '20px'; cursor.style.height = '20px';
                cursor.style.borderRadius = '50%'; cursor.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
                cursor.style.border = '2px solid white'; cursor.style.boxShadow = '0 0 10px black';
                cursor.style.zIndex = '99999999';
                cursor.style.pointerEvents = 'none';
                document.body.appendChild(cursor);
            }
            cursor.style.display = 'block';
            cursor.style.left = (cx - 10) + 'px';
            cursor.style.top = (cy - 10) + 'px';
        }, {cx: x, cy: y}).catch(()=>{});
    } catch (e) {}
}

function getMouseKb() {
    return {
        inline_keyboard: [
            [{ text: '↖️', callback_data: 'mouse_ul_50' }, { text: '⬆️ كبير (50)', callback_data: 'mouse_up_50' }, { text: '↗️', callback_data: 'mouse_ur_50' }],
            [{ text: '⬅️ كبير', callback_data: 'mouse_left_50' }, { text: '🖱️ كليك!', callback_data: 'mouse_click' }, { text: 'كبير ➡️', callback_data: 'mouse_right_50' }],
            [{ text: '↙️', callback_data: 'mouse_dl_50' }, { text: '⬇️ كبير (50)', callback_data: 'mouse_down_50' }, { text: '↘️', callback_data: 'mouse_dr_50' }],
            [{ text: '⬆️ دقيق (10)', callback_data: 'mouse_up_10' }, { text: '⬇️ دقيق (10)', callback_data: 'mouse_down_10' }],
            [{ text: '⬅️ دقيق', callback_data: 'mouse_left_10' }, { text: 'دقيق ➡️', callback_data: 'mouse_right_10' }],
            [{ text: '❌ إغلاق الماوس', callback_data: 'mouse_close' }]
        ]
    };
}

// -----------------------------
// Core runAction with safer interactive fallback
// -----------------------------
async function runAction(chatId, page, actionName, timeoutMs, actionFn, generatedCode) {
    ensureUserState(chatId);
    if (userState[chatId]?.cancel) throw new Error("CANCELLED");
    if (generatedCode) userState[chatId].scriptLog.push(`  // الخطوة: ${actionName}\n  ${generatedCode}`);

    try {
        await Promise.race([
            actionFn(),
            new Promise((_, rej) => setTimeout(() => rej(new Error(`نفد الوقت (${timeoutMs/1000} ثواني)`)), timeoutMs))
        ]);
    } catch (error) {
        if (userState[chatId]?.cancel) throw new Error("CANCELLED");

        userState[chatId].isLiveStreamActive = false;
        await sleep(1500);

        const errPath = path.join(__dirname, `err_${crypto.randomBytes(2).toString('hex')}.jpg`);
        try { await page.screenshot({ path: errPath, quality: 70, type: 'jpeg' }).catch(()=>{}); } catch (e) {}

        const captionText = `⚠️ <b>توقف السكربت! (تم منع الفشل الصامت)</b>\n\n` +
                            `الخطوة: <b>${actionName}</b>\nالسبب: <code>${error.message}</code>\n\n` +
                            `🛑 <b>أرسل الكلمة التي تريد الضغط عليها مباشرة، أو استخدم:</b>\n` +
                            `📝 <code>حقل: الاسم = القيمة</code>\n` +
                            `✍️ <code>اكتب: النص</code>\n` +
                            `⌨️ <code>مفتاح: Enter</code>\n` +
                            `⏭️ <code>تخطي</code>\n` +
                            `✅ <code>انهاء</code>`;

        let sentErr = null;
        try {
            sentErr = await bot.sendPhoto(chatId, errPath, {
                caption: captionText,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '🖱️ الماوس (تحكم حر)', callback_data: 'open_mouse' }]] }
            }).catch(()=>{});
        } catch (e) {
            console.warn('Failed to send error photo', e.message || e);
        } finally {
            try { if (fs.existsSync(errPath)) fs.unlinkSync(errPath); } catch (e) {}
        }

        if (sentErr) userState[chatId].errorMsgId = sentErr.message_id;
        userState[chatId].interactiveMode = true;

        // interactive loop
        while (userState[chatId].interactiveMode && page && !page.isClosed?.()) {
            if (userState[chatId]?.cancel) throw new Error("CANCELLED");

            userState[chatId].step = 'WAIT_MANUAL_COMMAND';
            const input = await new Promise(res => {
                userState[chatId].manualResolve = res;
            });

            if (!input) {
                // if resolved with falsy, break
                userState[chatId].interactiveMode = false;
                break;
            }

            if (input === 'MOUSE_CLICKED') {
                await sleep(1500);
                const p2 = path.join(__dirname, `res_${crypto.randomBytes(2).toString('hex')}.jpg`);
                try { await page.screenshot({ path: p2, quality: 70, type: 'jpeg' }).catch(()=>{}); } catch (e) {}
                try {
                    const sentRes = await bot.sendPhoto(chatId, p2, { caption: `📸 <b>تم النقر بالماوس!</b>\nإذا نجحت، أرسل <code>تخطي</code> للإكمال.`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🖱️ فتح الماوس مجدداً', callback_data: 'open_mouse' }]] } });
                    userState[chatId].errorMsgId = sentRes.message_id;
                } catch (e) {}
                try { if (fs.existsSync(p2)) fs.unlinkSync(p2); } catch (e) {}
                continue;
            }

            if (input === 'انهاء') { userState[chatId].interactiveMode = false; throw new Error("STOPPED_BY_USER"); }
            if (input === 'تخطي') {
                userState[chatId].scriptLog.push(`  // المستخدم تخطى خطوة: ${actionName}`);
                await bot.sendMessage(chatId, "⏭️ تم التخطي. جاري استئناف العمل الآلي...");
                userState[chatId].interactiveMode = false; break;
            }

            const waitMsg = await bot.sendMessage(chatId, "⏳ جاري تنفيذ أمرك...").catch(()=>null);
            try {
                if (input.startsWith('حقل:')) {
                    const parts = input.replace('حقل:', '').split('=');
                    if (parts.length >= 2) {
                        const field = parts[0].trim().toLowerCase(); const val = parts.slice(1).join('=').trim();
                        const injectedSelector = await page.evaluate(({f}) => {
                            const els = Array.from(document.querySelectorAll('input, textarea'));
                            let target = els.find(e => (e.name && e.name.toLowerCase().includes(f)) || (e.placeholder && e.placeholder.toLowerCase().includes(f)));
                            if(target && target.offsetParent !== null) {
                                target.focus(); target.value = '';
                                return target.name ? `input[name="${target.name}"]` : `input[placeholder="${target.placeholder}"]`;
                            }
                            return null;
                        }, {f: field}).catch(()=>null);

                        if (injectedSelector) {
                            // focus via locator then type
                            const locator = page.locator(injectedSelector).first();
                            if (await locator.isVisible().catch(()=>false)) {
                                await locator.focus().catch(()=>{});
                                await typeSequentially(locator, val, 60);
                            } else {
                                await typeSequentially(page, val, 60);
                            }
                        } else await bot.sendMessage(chatId, `❌ لم أجد الحقل`).catch(()=>{});
                    }
                }
                else if (input.startsWith('اكتب:')) {
                    const text = input.replace('اكتب:', '').trim();
                    await typeSequentially(page, text, 50);
                }
                else if (input.startsWith('مفتاح:')) {
                    const key = input.replace('مفتاح:', '').trim();
                    await page.keyboard.press(key).catch(()=>{});
                }
                else {
                    const jsClick = await page.evaluate((t) => {
                        const els = Array.from(document.querySelectorAll('button, a, div, span, input, p, label'));
                        let target = els.find(el => el.innerText && el.innerText.trim().toLowerCase() === t.trim().toLowerCase() && el.offsetParent !== null);
                        if (!target) target = els.find(el => el.innerText && el.innerText.toLowerCase().includes(t.trim().toLowerCase()) && el.offsetParent !== null);
                        if (target) { target.click(); return true; } return false;
                    }, input).catch(()=>false);
                    if (!jsClick) await bot.sendMessage(chatId, `❌ لم أجد الكلمة.`).catch(()=>{});
                }

                await sleep(1500);
                const p2 = path.join(__dirname, `res_${crypto.randomBytes(2).toString('hex')}.jpg`);
                try { await page.screenshot({ path: p2, quality: 70, type: 'jpeg' }).catch(()=>{}); } catch (e) {}
                try {
                    const sentRes = await bot.sendPhoto(chatId, p2, { caption: `📸 <b>النتيجة:</b> أرسل <code>تخطي</code> للإكمال.`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🖱️ الماوس', callback_data: 'open_mouse' }]] } });
                    userState[chatId].errorMsgId = sentRes.message_id;
                } catch (e) {}
                try { if (fs.existsSync(p2)) fs.unlinkSync(p2); } catch (e) {}
            } catch (e) {
                await bot.sendMessage(chatId, `❌ خطأ التنفيذ: ${e.message}`).catch(()=>{});
            } finally {
                if (waitMsg && waitMsg.message_id) bot.deleteMessage(chatId, waitMsg.message_id).catch(()=>{});
            }
        }

        userState[chatId].isLiveStreamActive = true;
        startLiveStream(chatId, page);
    }
}

// -----------------------------
// 2FA setup (safer, uses typeSequentially and waitForManualCode fallback)
// -----------------------------
async function setup2FA(chatId, page, context) {
    ensureUserState(chatId);
    let extractedSecret = null;
    await runAction(chatId, page, "إعداد الـ 2FA وتوليد الرمز", 90000, async () => {
        await bot.sendMessage(chatId, "⏳ جاري التوجه للرابط المباشر لإعدادات الأمان (تخطي النوافذ بالكامل)...").catch(()=>{});

        await page.goto("https://chatgpt.com/?action=enable&factor=totp#settings/Security", { waitUntil: "domcontentloaded" }).catch(()=>{});
        await sleep(5000);

        const authBtnClicked = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('button, div, span'));
            let tgt = els.find(e => e.innerText && e.innerText.includes("Authenticator app"));
            if(tgt && tgt.offsetParent !== null) { tgt.click(); return true; }
            return false;
        }).catch(()=>false);

        if (authBtnClicked) await sleep(2000);

        extractedSecret = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div, span, code, p, b, strong'));
            for (let el of elements) {
                if (el.children.length > 0) continue;
                const cleanText = el.innerText.trim().replace(/[\s-]/g, '').toUpperCase();
                if (cleanText.length === 32 && /^[A-Z2-7]{32}$/.test(cleanText)) {
                    return cleanText;
                }
            }
            const inputs = Array.from(document.querySelectorAll('input'));
            for (let input of inputs) {
                const cleanText = (input.value || '').trim().replace(/[\s-]/g, '').toUpperCase();
                if (cleanText.length === 32 && /^[A-Z2-7]{32}$/.test(cleanText)) {
                    return cleanText;
                }
            }
            return null;
        }).catch(()=>null);

        if (!extractedSecret) throw new Error("لم أتمكن من العثور على الكود السري (af2) المكون من 32 حرفاً.");

        await bot.sendMessage(chatId, `🔑 <b>تم استخراج كود (af2):</b>\n<code>${extractedSecret}</code>\n\n🌐 جاري توليد الرمز عبر رابط fb.tools المباشر...`, {parse_mode: 'HTML'}).catch(()=>{});

        const newPage = await context.newPage();
        await newPage.goto(`https://2fa.fb.tools/${extractedSecret}`, { waitUntil: "domcontentloaded" }).catch(()=>{});
        await sleep(2500);

        const otpCode = await newPage.evaluate(() => {
            const out = document.querySelector('#output');
            if (out && /\b\d{6}\b/.test(out.innerText)) return out.innerText.match(/\b\d{6}\b/)[0];
            const matches = document.body.innerText.match(/\b\d{6}\b/g);
            return matches ? matches[matches.length - 1] : null;
        }).catch(()=>null);

        await newPage.close().catch(()=>{});

        if (!otpCode) throw new Error("فشل توليد كود 6 أرقام من موقع fb.tools.");
        await bot.sendMessage(chatId, `🔢 <b>تم جلب الرمز:</b> <code>${otpCode}</code>\n\n⏳ جاري تفعيل الحماية في ChatGPT...`, {parse_mode: 'HTML'}).catch(()=>{});

        // كتابة الكود في الحقل المناسب
        try {
            const codeInput = page.locator('input[type="text"], input[inputmode="numeric"]').last();
            if (await codeInput.isVisible().catch(()=>false)) {
                await codeInput.focus().catch(()=>{});
                await typeSequentially(codeInput, otpCode, 100);
            } else {
                await typeSequentially(page, otpCode, 100);
            }
        } catch (e) {
            await typeSequentially(page, otpCode, 100).catch(()=>{});
        }
        await sleep(1500);

        // الضغط على Enable/Verify
        await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('button'));
            const tgt = els.find(e => e.innerText && (e.innerText.includes('Enable') || e.innerText.includes('Verify')));
            if(tgt && !tgt.disabled) tgt.click();
        }).catch(()=>{});
        await sleep(4000);

        // إغلاق النافذة (Done أو I have saved)
        await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('button'));
            const tgt = els.find(e => e.innerText && (e.innerText.includes('Done') || e.innerText.includes('I have saved') || e.innerText.includes('Close') || e.innerText.includes('Okay') || e.innerText.includes('I have saved my')));
            if(tgt) tgt.click();
        }).catch(()=>{});
        await sleep(2000);

    }, `  // 2FA Auto-Setup Completed via Direct URL`);

    return extractedSecret;
}

// -----------------------------
// Email manager (kept mostly as-is but with safer error handling)
// -----------------------------
const EmailManager = {
    async getDomains1sec() {
        try { const res = await axios.get('https://www.1secmail.com/api/v1/?action=getDomainList'); return res.data && res.data.length > 0 ? res.data : ['1secmail.com']; }
        catch(e) { return ['1secmail.com']; }
    },
    async create(chatId, apiId, prefix = "") {
        let emailData = { apiId }; let apiName = ["", "Mail.tm", "Mail.gw", "1SecMail A", "1SecMail B", "1SecMail C"][apiId] || "Mail.tm";
        await bot.sendMessage(chatId, `📧 ${prefix} استخراج بريد...`).catch(()=>{});
        try {
            if (apiId <= 2) {
                const bUrl = apiId === 1 ? 'https://api.mail.tm' : 'https://api.mail.gw';
                const dRes = await axios.get(`${bUrl}/domains`);
                const members = dRes.data['hydra:member'] || [];
                const dom = members.length ? members[Math.floor(Math.random() * members.length)].domain : 'mail.tm';
                const em = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(2).toString('hex')}@${dom}`;
                const pw = crypto.randomBytes(8).toString('hex') + "Aa1@";
                await axios.post(`${bUrl}/accounts`, { address: em, password: pw }).catch(()=>{});
                const tRes = await axios.post(`${bUrl}/token`, { address: em, password: pw }).catch(()=>({ data: {} }));
                emailData.email = em; emailData.password = pw; emailData.token = tRes.data?.token; emailData.baseUrl = bUrl;
                return emailData;
            } else {
                const doms = await this.getDomains1sec(); let d = doms[0];
                if (apiId === 4 && doms.length > 1) d = doms[1]; if (apiId === 5 && doms.length > 2) d = doms[2];
                const lg = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(3).toString('hex')}`;
                emailData.email = `${lg}@${d}`; emailData.password = crypto.randomBytes(8).toString('hex') + "Aa1@"; emailData.login = lg; emailData.domain = d;
                return emailData;
            }
        } catch(e) {
            console.warn('EmailManager.create failed, retrying with default provider', e.message || e);
            return await this.create(chatId, 1, prefix);
        }
    },
    async waitForCode(emailData, chatId, prefix = "", maxWait = 120) {
        const start = Date.now(); const statusMsg = await bot.sendMessage(chatId, `⏳ ${prefix} بانتظار الكود...`).catch(()=>null);
        while (Date.now() - start < maxWait * 1000) {
            if (userState[chatId]?.cancel) { if (statusMsg?.message_id) await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{}); throw new Error("CANCELLED"); }
            try {
                if (emailData.apiId <= 2 && emailData.baseUrl && emailData.token) {
                    const res = await axios.get(`${emailData.baseUrl}/messages`, { headers: { Authorization: `Bearer ${emailData.token}` }}).catch(()=>({ data: { 'hydra:member': [] } }));
                    for (const msg of (res.data['hydra:member'] || [])) {
                        const m = `${msg.subject} ${msg.intro}`.match(/\b\d{6}\b/);
                        if (m && `${msg.subject} ${msg.intro}`.toLowerCase().includes('openai')) { if (statusMsg?.message_id) await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{}); return m[0]; }
                    }
                } else if (emailData.login && emailData.domain) {
                    const res = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${emailData.login}&domain=${emailData.domain}`).catch(()=>({ data: [] }));
                    if (res.data && res.data.length > 0) {
                        for (const msg of res.data) {
                            const msgD = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${emailData.login}&domain=${emailData.domain}&id=${msg.id}`).catch(()=>({ data: {} }));
                            const m = `${msgD.data.subject || ''} ${msgD.data.textBody || ''}`.match(/\b\d{6}\b/);
                            if (m && `${msgD.data.subject || ''} ${msgD.data.textBody || ''}`.toLowerCase().includes('openai')) { if (statusMsg?.message_id) await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{}); return m[0]; }
                        }
                    }
                }
            } catch(e) {}
            await sleep(4000);
        }
        if (statusMsg?.message_id) await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{});
        return null;
    }
};

// Utility generators
function py_generatePassword() { return crypto.randomBytes(8).toString('hex') + "Aa1!"; }
function py_generateBirthday() { return { year: String(Math.floor(Math.random() * 15) + 1990), month: "01", day: "01" }; }
function py_generateUsAddress(name) { return { name: name, zip: "10001", state: "New York", city: "New York", address1: `${Math.floor(Math.random()*900)+100} Main St` }; }

async function py_fillStripeIframe(page, selectors, value, chatId) {
    const selArr = selectors.split(',').map(s=>s.trim());
    for (const sel of selArr) {
        try {
            if (await page.locator(sel).isVisible().catch(()=>false)) {
                await page.locator(sel).focus(); await typeSequentially(page.locator(sel), value, 80);
                if(chatId) userState[chatId].scriptLog.push(`  await page.locator('${sel}').fill('${value}');`);
                return true;
            }
        } catch (e) {}
    }
    for (const frame of page.frames()) {
        for (const sel of selArr) {
            try {
                const el = frame.locator(sel).first();
                if (await el.isVisible().catch(()=>false)) {
                    await el.focus(); await typeSequentially(frame, value, 80);
                    if(chatId) userState[chatId].scriptLog.push(`  // Filled iframe locator: ${sel}`);
                    return true;
                }
            } catch (e) {}
        }
    }
    return false;
}

// -----------------------------
// Main account creation logic (مُحدّث)
// -----------------------------
async function createAccountLogic_Original(chatId, manualData = null) {
    ensureUserState(chatId);
    userState[chatId].scriptLog = ["// 🎬 Auto-Generated Script"];

    const isManual = !!manualData; let emailData; let accountSuccess = false;
    if (isManual) { emailData = { email: manualData.email, password: manualData.password, apiId: 'MANUAL' }; }
    else { emailData = await EmailManager.create(chatId, globalConfig.emailApiId, "[النظام الأساسي]"); if(!emailData) return false; }

    const chatGptPassword = isManual ? manualData.password : emailData.password;
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_old_'));
    let context, page;

    try {
        context = await chromium.launchPersistentContext(tempDir, {
            headless: true,
            viewport: { width: 1280, height: 720 },
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
        });
        if (userState[chatId]) userState[chatId].context = context;
        page = await context.newPage();
        userState[chatId].currentPage = page;

        startLiveStream(chatId, page);

        await runAction(chatId, page, "فتح المتصفح", 60000, async () => {
            await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" }).catch(()=>{});
            await sleep(4000);
        }, `  await page.goto("https://chatgpt.com/auth/login");`);

        await runAction(chatId, page, "الضغط على زر التسجيل", 15000, async () => {
            let clickedSignUp = false;
            for (const sel of ['[data-testid="login-screen-signup"]', 'button:has-text("Sign up for free")', 'button:has-text("Sign up")']) {
                const btnLocator = page.locator(sel).first();
                if (await btnLocator.isVisible().catch(()=>false)) { await btnLocator.click().catch(()=>{}); clickedSignUp = true; break; }
            }
            if (!clickedSignUp) throw new Error("لم أجد زر Sign up");
            await sleep(4000);
        }, `  // Clicked Sign up button`);

        await runAction(chatId, page, "كتابة الإيميل", 20000, async () => {
            await page.waitForSelector('input[type="email"]', { timeout: 10000 }).catch(()=>{});
            const emailLocator = page.locator('input[type="email"]').first();
            if (await emailLocator.isVisible().catch(()=>false)) {
                await emailLocator.fill(emailData.email).catch(()=>{});
            } else {
                await typeSequentially(page, emailData.email, 60);
            }
            const submitBtn = page.locator('button:has-text("Continue"), button[type="submit"]').first();
            if (await submitBtn.isVisible().catch(()=>false)) await submitBtn.click().catch(()=>{});
            await sleep(3000);
        }, `  // Filled Email`);

        await runAction(chatId, page, "كتابة الباسورد", 20000, async () => {
            await page.waitForSelector('input[type="password"]', { timeout: 10000 }).catch(()=>{});
            const passLocator = page.locator('input[type="password"]').first();
            if (await passLocator.isVisible().catch(()=>false)) {
                await passLocator.fill(chatGptPassword).catch(()=>{});
            } else {
                await typeSequentially(page, chatGptPassword, 60);
            }
            const submitBtn = page.locator('button:has-text("Continue"), button[type="submit"]').first();
            if (await submitBtn.isVisible().catch(()=>false)) await submitBtn.click().catch(()=>{});
            await sleep(6000);
        }, `  // Filled Password`);

        let code = null;
        if (isManual) {
            await bot.sendMessage(chatId, "🛑 الأساسي: أرسل الكود هنا في الشات...").catch(()=>{});
            code = await waitForManualCode(chatId).catch((e)=>{ throw e; });
        } else {
            code = await EmailManager.waitForCode(emailData, chatId, "[الأساسي]");
        }
        if (!code) throw new Error("لم يتم استلام الكود.");

        await runAction(chatId, page, `إدخال الكود (${code})`, 25000, async () => {
            const codeInput = page.locator('input[name="code"], input[inputmode="numeric"]').first();
            if (await codeInput.isVisible().catch(()=>false)) {
                await codeInput.focus().catch(()=>{});
                await typeSequentially(codeInput, code, 150);
            } else {
                await typeSequentially(page, code, 150);
            }
            await sleep(2000);

            const continueBtnLocator = page.locator('button:has-text("Continue"), button[type="submit"]').first();
            if (await continueBtnLocator.isVisible().catch(()=>false) && await continueBtnLocator.isEnabled().catch(()=>false)) { await continueBtnLocator.click().catch(()=>{}); }
            else { await page.keyboard.press('Enter').catch(()=>{}); }
            await sleep(5000);
        }, `  // Typed Code`);

        // تعبئة الاسم والعمر الذكي (محمي)
        await runAction(chatId, page, "تعبئة الاسم والعمر الذكي", 25000, async () => {
            await page.waitForSelector('input', { timeout: 10000 }).catch(()=>{});

            const nameInput = page.locator('input[placeholder="Full name"], input[name="name"], input[autocomplete="name"]').first();
            if (await nameInput.isVisible().catch(()=>false)) {
                await nameInput.fill('').catch(()=>{});
                await typeSequentially(nameInput, fullName, 60);
                await sleep(1000);
            }

            const ageInput = page.locator('input[placeholder="Age"], input[name="age"]').first();
            if (await ageInput.isVisible().catch(()=>false)) {
                try {
                    await ageInput.click().catch(()=>{});
                    await page.keyboard.press('Control+A').catch(()=>{});
                    await ageInput.fill('25').catch(()=>{});
                } catch (e) {
                    await ageInput.fill('25').catch(()=>{});
                }
            } else {
                await page.keyboard.press('Tab').catch(()=>{});
                await typeSequentially(page, '25', 60);
            }
            await sleep(1500);

            const finishBtn = page.locator('button:has-text("Finish creating account"), button:has-text("Finish"), button:has-text("Agree")').first();
            if (await finishBtn.isVisible().catch(()=>false)) {
                await finishBtn.click().catch(()=>{});
            } else {
                // محاولة بديلة: الضغط على Enter
                await page.keyboard.press('Enter').catch(()=>{});
            }
            await sleep(4000);
        }, `  // Filled name & age`);

        accountSuccess = true;
        await bot.sendMessage(chatId, `✅ تم إنشاء الحساب بنجاح: ${emailData.email}`).catch(()=>{});
    } catch (e) {
        console.error('createAccountLogic_Original error', e.message || e);
        await bot.sendMessage(chatId, `❌ فشل أثناء إنشاء الحساب: ${e.message}`).catch(()=>{});
        accountSuccess = false;
    } finally {
        try {
            if (page && !page.isClosed?.()) await page.close().catch(()=>{});
            if (context) await context.close().catch(()=>{});
        } catch (e) {}
        try { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }

    return accountSuccess;
}

// -----------------------------
// Telegram handlers (بسيطة)
// -----------------------------
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    ensureUserState(chatId);
    bot.sendMessage(chatId, 'أهلاً! أرسل /create لبدء إنشاء حساب تجريبي.').catch(()=>{});
});

bot.onText(/\/create/, async (msg) => {
    const chatId = msg.chat.id;
    ensureUserState(chatId);
    if (isProcessing) return bot.sendMessage(chatId, '🔁 هناك عملية جارية بالفعل. انتظر قليلاً.').catch(()=>{});
    isProcessing = true;
    try {
        await createAccountLogic_Original(chatId);
    } catch (e) {
        console.error('create command error', e.message || e);
        await bot.sendMessage(chatId, `❌ خطأ: ${e.message}`).catch(()=>{});
    } finally {
        isProcessing = false;
    }
});

// Interactive manualResolve receiver
bot.on('message', (msg) => {
    const chatId = msg.chat?.id;
    if (!chatId) return;
    ensureUserState(chatId);
    // If in interactive mode and manualResolve exists, resolve it
    if (userState[chatId]?.interactiveMode && typeof userState[chatId].manualResolve === 'function') {
        const text = (msg.text || '').trim();
        // Normalize some Arabic commands
        if (text === 'تخطي' || text === 'انهاء' || text.startsWith('حقل:') || text.startsWith('اكتب:') || text.startsWith('مفتاح:')) {
            const resolver = userState[chatId].manualResolve;
            userState[chatId].manualResolve = null;
            resolver(text);
            return;
        }
        // If user clicked mouse via callback, the callback handler will resolve with 'MOUSE_CLICKED'
    }
    // If waiting for manual 6-digit code via waitForManualCode, the listener is attached there (bot.on('message', ...) inside waitForManualCode)
});

// Callback queries for mouse and interactive controls
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message?.chat?.id;
    const data = callbackQuery.data;
    if (!chatId) return;
    ensureUserState(chatId);

    // Example: open_mouse triggers interactive mode; real mouse control implementation omitted for brevity
    if (data === 'open_mouse') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'فتح تحكم الماوس (وهمي) ...' }).catch(()=>{});
        // In a real implementation, you'd send keyboard and handle coordinates; here we just notify and set interactive flag
        userState[chatId].interactiveMode = true;
        // If manualResolve exists, resolve with a placeholder
        if (typeof userState[chatId].manualResolve === 'function') {
            const resolver = userState[chatId].manualResolve;
            userState[chatId].manualResolve = null;
            resolver('MOUSE_CLICKED');
        }
        return;
    }

    // Mouse movement and clicks could be handled here; for now acknowledge
    await bot.answerCallbackQuery(callbackQuery.id).catch(()=>{});
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    bot.stopPolling?.();
    process.exit(0);
});
