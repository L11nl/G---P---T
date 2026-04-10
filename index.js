/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار 44 (Ultimate RPA Studio 👑)
 * ==========================================================
 * 🔴 بث حي مستمر وتدخل تلقائي عند الأخطاء.
 * 🎯 تم إصلاح مشكلة Age: لم يعد يملأ الحقل بقيمة ثابتة 25 بل يختار قيمة مناسبة.
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
if (fs.existsSync(GLOBAL_CONFIG_FILE)) { try { globalConfig = { ...globalConfig, ...JSON.parse(fs.readFileSync(GLOBAL_CONFIG_FILE, 'utf8')) }; } catch (e) {} }
function saveConfig() { fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(globalConfig, null, 4)); }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 🔴 نظام البث الحي والمساعدات البصرية
// ==========================================
async function startLiveStream(chatId, page) {
    if (userState[chatId].isLiveStreamActive) return;
    userState[chatId].isLiveStreamActive = true;
    userState[chatId].streamMessageId = null;

    (async () => {
        while (userState[chatId] && userState[chatId].isLiveStreamActive && !page.isClosed()) {
            try {
                const p = path.join(__dirname, `live_${crypto.randomBytes(2).toString('hex')}.jpg`);
                await page.screenshot({ path: p, type: 'jpeg', quality: 35 }).catch(()=>{});
                
                if (fs.existsSync(p)) {
                    const sent = await bot.sendPhoto(chatId, p, { caption: "🔴 <b>بث حي للشاشة (يتحدث تلقائياً)...</b>\nإذا توقف السكربت سيطلب تدخلك.", parse_mode: 'HTML', disable_notification: true });
                    if (userState[chatId].streamMessageId) bot.deleteMessage(chatId, userState[chatId].streamMessageId).catch(()=>{});
                    userState[chatId].streamMessageId = sent.message_id;
                    fs.unlinkSync(p);
                }
            } catch (e) {}
            await sleep(1500); 
        }
        if (userState[chatId]?.streamMessageId) bot.deleteMessage(chatId, userState[chatId].streamMessageId).catch(()=>{});
    })();
}

async function drawVirtualCursor(page, x, y) {
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

// ==========================================
// 🤖 النواة الذكية (مغلف الأوامر)
// ==========================================
async function runAction(chatId, page, actionName, timeoutMs, actionFn, generatedCode) {
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
        await page.screenshot({ path: errPath, quality: 70, type: 'jpeg' }).catch(()=>{});
        
        const captionText = `⚠️ <b>توقف السكربت! (تم منع الفشل الصامت)</b>\n\n` +
                            `الخطوة: <b>${actionName}</b>\nالسبب: <code>${error.message}</code>\n\n` +
                            `🛑 <b>أرسل الكلمة التي تريد الضغط عليها مباشرة، أو استخدم:</b>\n` +
                            `📝 <code>حقل: الاسم = القيمة</code>\n` +
                            `✍️ <code>اكتب: النص</code>\n` +
                            `⌨️ <code>مفتاح: Enter</code>\n` +
                            `⏭️ <code>تخطي</code>\n` +
                            `✅ <code>انهاء</code>`;

        const sentErr = await bot.sendPhoto(chatId, errPath, {
            caption: captionText,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🖱️ الماوس (تحكم حر)', callback_data: 'open_mouse' }]] }
        }).catch(()=>{});
        if(fs.existsSync(errPath)) fs.unlinkSync(errPath);
        
        userState[chatId].errorMsgId = sentErr?.message_id;
        userState[chatId].interactiveMode = true;
        
        while (userState[chatId].interactiveMode && !page.isClosed()) {
            if (userState[chatId]?.cancel) throw new Error("CANCELLED");
            
            userState[chatId].step = 'WAIT_MANUAL_COMMAND';
            const input = await new Promise(res => userState[chatId].manualResolve = res);
            
            if (input === 'MOUSE_CLICKED') {
                await sleep(1500);
                const p2 = path.join(__dirname, `res_${crypto.randomBytes(2).toString('hex')}.jpg`);
                await page.screenshot({ path: p2, quality: 70, type: 'jpeg' }).catch(()=>{});
                const sentRes = await bot.sendPhoto(chatId, p2, { caption: `📸 <b>تم النقر بالماوس!</b>\nإذا نجحت، أرسل <code>تخطي</code> للإكمال.`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🖱️ فتح الماوس مجدداً', callback_data: 'open_mouse' }]] } });
                userState[chatId].errorMsgId = sentRes.message_id;
                if (fs.existsSync(p2)) fs.unlinkSync(p2);
                continue;
            }

            if (input === 'انهاء') { userState[chatId].interactiveMode = false; throw new Error("STOPPED_BY_USER"); }
            if (input === 'تخطي') {
                userState[chatId].scriptLog.push(`  // المستخدم تخطى خطوة: ${actionName}`);
                await bot.sendMessage(chatId, "⏭️ تم التخطي. جاري استئناف العمل الآلي...");
                userState[chatId].interactiveMode = false; break;
            }

            const waitMsg = await bot.sendMessage(chatId, "⏳ جاري تنفيذ أمرك...");
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
                        }, {f: field});

                        if (injectedSelector) {
                            await page.keyboard.type(val, { delay: 60 });
                        } else await bot.sendMessage(chatId, `❌ لم أجد الحقل`);
                    }
                } 
                else if (input.startsWith('اكتب:')) {
                    const text = input.replace('اكتب:', '').trim(); await page.keyboard.type(text, { delay: 50 });
                } 
                else if (input.startsWith('مفتاح:')) {
                    const key = input.replace('مفتاح:', '').trim(); await page.keyboard.press(key);
                } 
                else {
                    const jsClick = await page.evaluate((t) => {
                        const els = Array.from(document.querySelectorAll('button, a, div, span, input, p, label'));
                        let target = els.find(el => el.innerText && el.innerText.trim().toLowerCase() === t.trim().toLowerCase() && el.offsetParent !== null);
                        if (!target) target = els.find(el => el.innerText && el.innerText.toLowerCase().includes(t.trim().toLowerCase()) && el.offsetParent !== null);
                        if (target) { target.click(); return true; } return false;
                    }, input);
                    if (!jsClick) await bot.sendMessage(chatId, `❌ لم أجد الكلمة.`);
                }
                
                await sleep(1500); 
                const p2 = path.join(__dirname, `res_${crypto.randomBytes(2).toString('hex')}.jpg`);
                await page.screenshot({ path: p2, quality: 70, type: 'jpeg' }).catch(()=>{});
                const sentRes = await bot.sendPhoto(chatId, p2, { caption: `📸 <b>النتيجة:</b> أرسل <code>تخطي</code> للإكمال.`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🖱️ الماوس', callback_data: 'open_mouse' }]] } });
                userState[chatId].errorMsgId = sentRes.message_id;
                if (fs.existsSync(p2)) fs.unlinkSync(p2);
                
            } catch (e) {
                await bot.sendMessage(chatId, `❌ خطأ التنفيذ: ${e.message}`);
            } finally { await bot.deleteMessage(chatId, waitMsg.message_id).catch(()=>{}); }
        }
        
        userState[chatId].isLiveStreamActive = true; 
        startLiveStream(chatId, page);
    }
}

// ==========================================
// 🔐 وحدة تفعيل المصادقة الثنائية (af2 Setup السريع جداً)
// ==========================================
async function setup2FA(chatId, page, context) {
    let extractedSecret = null;
    await runAction(chatId, page, "إعداد الـ 2FA وتوليد الرمز", 90000, async () => {
        bot.sendMessage(chatId, "⏳ جاري التوجه للرابط المباشر لإعدادات الأمان (تخطي النوافذ بالكامل)...");

        // 1. الانتقال المباشر للرابط السحري الذي اكتشفته لتخطي النوافذ الترحيبية
        await page.goto("https://chatgpt.com/?action=enable&factor=totp#settings/Security", { waitUntil: "domcontentloaded" }).catch(()=>{});
        await sleep(5000);

        // 2. الضغط على Authenticator app إذا لم تفتح النافذة تلقائياً
        const authBtnClicked = await page.evaluate(() => { 
            const els = Array.from(document.querySelectorAll('button, div, span')); 
            let tgt = els.find(e => e.innerText && e.innerText.includes("Authenticator app")); 
            if(tgt && tgt.offsetParent !== null) { tgt.click(); return true; }
            return false;
        }).catch(()=>false);
        
        if (authBtnClicked) await sleep(2000);

        // 3. استخراج الـ af2 بصرامة شديدة (32 حرف فقط من Base32)
        extractedSecret = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div, span, code, p, b, strong'));
            for (let el of elements) {
                if (el.children.length > 0) continue; 
                const cleanText = el.innerText.trim().replace(/[\s-]/g, '').toUpperCase(); 
                if (cleanText.length === 32 && /^[A-Z2-7]{32}$/.test(cleanText)) {
                    return cleanText;
                }
            }
            // بحث احتياطي داخل حقول الـ input
            const inputs = Array.from(document.querySelectorAll('input'));
            for (let input of inputs) {
                const cleanText = input.value.trim().replace(/[\s-]/g, '').toUpperCase();
                if (cleanText.length === 32 && /^[A-Z2-7]{32}$/.test(cleanText)) {
                    return cleanText;
                }
            }
            return null;
        });

        if (!extractedSecret) throw new Error("لم أتمكن من العثور على الكود السري (af2) المكون من 32 حرفاً.");
        
        bot.sendMessage(chatId, `🔑 <b>تم استخراج كود (af2):</b>\n<code>${extractedSecret}</code>\n\n🌐 جاري توليد الرمز عبر رابط fb.tools المباشر...`, {parse_mode: 'HTML'});

        // 4. السحر الخالص: فتح موقع التوليد ووضع الكود في الرابط مباشرة!
        const newPage = await context.newPage();
        await newPage.goto(`https://2fa.fb.tools/${extractedSecret}`, { waitUntil: "domcontentloaded" });
        await sleep(2500); 

        // سحب الرمز ذي الـ 6 أرقام مباشرة
        const otpCode = await newPage.evaluate(() => {
            const out = document.querySelector('#output');
            if (out && /\b\d{6}\b/.test(out.innerText)) return out.innerText.match(/\b\d{6}\b/)[0];
            const matches = document.body.innerText.match(/\b\d{6}\b/g);
            return matches ? matches[matches.length - 1] : null;
        });

        await newPage.close(); 

        if (!otpCode) throw new Error("فشل توليد كود 6 أرقام من موقع fb.tools.");
        bot.sendMessage(chatId, `🔢 <b>تم جلب الرمز:</b> <code>${otpCode}</code>\n\n⏳ جاري تفعيل الحماية في ChatGPT...`, {parse_mode: 'HTML'});

        // 5. كتابة كود التوثيق في ChatGPT
        const codeInput = page.locator('input[type="text"], input[inputmode="numeric"]').last();
        if (await codeInput.isVisible().catch(()=>false)) {
            await codeInput.focus();
            await codeInput.pressSequentially(otpCode, { delay: 100 });
        } else {
            await page.keyboard.type(otpCode, { delay: 100 });
        }
        await sleep(1500);

        // الضغط على تفعيل Enable
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

// ==========================================
// 🌐 محرك الإيميلات الخماسي
// ==========================================
const EmailManager = {
    async getDomains1sec() {
        try { const res = await axios.get('https://www.1secmail.com/api/v1/?action=getDomainList'); return res.data && res.data.length > 0 ? res.data : ['1secmail.com']; } 
        catch(e) { return ['1secmail.com']; }
    },
    async create(chatId, apiId, prefix = "") {
        let emailData = { apiId }; let apiName = ["", "Mail.tm", "Mail.gw", "1SecMail A", "1SecMail B", "1SecMail C"][apiId] || "Mail.tm";
        await bot.sendMessage(chatId, `📧 ${prefix} استخراج بريد...`);
        try {
            if (apiId <= 2) {
                const bUrl = apiId === 1 ? 'https://api.mail.tm' : 'https://api.mail.gw'; const dRes = await axios.get(`${bUrl}/domains`);
                const dom = dRes.data['hydra:member'][Math.floor(Math.random() * dRes.data['hydra:member'].length)].domain;
                const em = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(2).toString('hex')}@${dom}`; const pw = crypto.randomBytes(8).toString('hex') + "Aa1@";
                await axios.post(`${bUrl}/accounts`, { address: em, password: pw }); const tRes = await axios.post(`${bUrl}/token`, { address: em, password: pw });
                emailData.email = em; emailData.password = pw; emailData.token = tRes.data.token; emailData.baseUrl = bUrl;
                return emailData;
            } else {
                const doms = await this.getDomains1sec(); let d = doms[0];
                if (apiId === 4 && doms.length > 1) d = doms[1]; if (apiId === 5 && doms.length > 2) d = doms[2];
                const lg = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(3).toString('hex')}`;
                emailData.email = `${lg}@${d}`; emailData.password = crypto.randomBytes(8).toString('hex') + "Aa1@"; emailData.login = lg; emailData.domain = d;
                return emailData;
            }
        } catch(e) { return await this.create(chatId, 1, prefix); }
    },
    async waitForCode(emailData, chatId, prefix = "", maxWait = 120) {
        const start = Date.now(); const statusMsg = await bot.sendMessage(chatId, `⏳ ${prefix} بانتظار الكود...`);
        while (Date.now() - start < maxWait * 1000) {
            if (userState[chatId]?.cancel) { await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{}); throw new Error("CANCELLED"); }
            try {
                if (emailData.apiId <= 2) {
                    const res = await axios.get(`${emailData.baseUrl}/messages`, { headers: { Authorization: `Bearer ${emailData.token}` }});
                    for (const msg of (res.data['hydra:member'] || [])) {
                        const m = `${msg.subject} ${msg.intro}`.match(/\b\d{6}\b/);
                        if (m && `${msg.subject} ${msg.intro}`.toLowerCase().includes('openai')) { await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{}); return m[0]; }
                    }
                } else {
                    const res = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${emailData.login}&domain=${emailData.domain}`);
                    if (res.data && res.data.length > 0) {
                        for (const msg of res.data) {
                            const msgD = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${emailData.login}&domain=${emailData.domain}&id=${msg.id}`);
                            const m = `${msgD.data.subject} ${msgD.data.textBody}`.match(/\b\d{6}\b/);
                            if (m && `${msgD.data.subject} ${msgD.data.textBody}`.toLowerCase().includes('openai')) { await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{}); return m[0]; }
                        }
                    }
                }
            } catch(e) {}
            await sleep(4000);
        }
        await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{}); return null;
    }
};

function py_generatePassword() { return crypto.randomBytes(8).toString('hex') + "Aa1!"; }
function py_generateBirthday() { return { year: String(Math.floor(Math.random() * 15) + 1990), month: "01", day: "01" }; }
function py_generateUsAddress(name) { return { name: name, zip: "10001", state: "New York", city: "New York", address1: `${Math.floor(Math.random()*900)+100} Main St` }; }

async function py_fillStripeIframe(page, selectors, value, chatId) {
    const selArr = selectors.split(',').map(s=>s.trim());
    for (const sel of selArr) { 
        if (await page.locator(sel).isVisible().catch(()=>false)) { 
            await page.locator(sel).focus(); await page.keyboard.type(value, { delay: 80 }); 
            if(chatId) userState[chatId].scriptLog.push(`  await page.locator('${sel}').fill('${value}');`);
            return true; 
        } 
    }
    for (const frame of page.frames()) {
        for (const sel of selArr) {
            const el = frame.locator(sel).first();
            if (await el.isVisible().catch(()=>false)) { 
                await el.focus(); await page.keyboard.type(value, { delay: 80 }); 
                if(chatId) userState[chatId].scriptLog.push(`  // Filled iframe locator: ${sel}`);
                return true; 
            }
        }
    }
    return false;
}

// 🟥=======================================================================🟥
//                      القسم الأول: كودك الأساسي 
// 🟥=======================================================================🟥
async function createAccountLogic_Original(chatId, manualData = null) {
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
            await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" });
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
            await page.waitForSelector('input[type="email"]');
            await page.locator('input[type="email"]').first().fill(emailData.email);
            await page.locator('button:has-text("Continue"), button[type="submit"]').first().click();
            await sleep(3000);
        }, `  // Filled Email`);

        await runAction(chatId, page, "كتابة الباسورد", 20000, async () => {
            await page.waitForSelector('input[type="password"]');
            await page.locator('input[type="password"]').first().fill(chatGptPassword);
            await page.locator('button:has-text("Continue"), button[type="submit"]').first().click();
            await sleep(6000);
        }, `  // Filled Password`);

        let code = null;
        if (isManual) {
            bot.sendMessage(chatId, "🛑 الأساسي: أرسل الكود هنا في الشات...");
            code = await new Promise((res, rej) => {
                const listener = (msg) => { if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { bot.removeListener('message', listener); res(msg.text.trim()); } };
                bot.on('message', listener); const c = setInterval(()=>{ if(userState[chatId]?.cancel){ clearInterval(c); bot.removeListener('message', listener); rej(new Error("CANCELLED")); } }, 1000);
            });
        } else { code = await EmailManager.waitForCode(emailData, chatId, "[الأساسي]"); }
        if (!code) throw new Error("لم يتم استلام الكود.");

        await runAction(chatId, page, `إدخال الكود (${code})`, 25000, async () => {
            const codeInput = page.locator('input[name="code"], input[inputmode="numeric"]').first();
            if (await codeInput.isVisible().catch(()=>false)) { await codeInput.focus(); await codeInput.pressSequentially(code, { delay: 150 }); } 
            else { await page.keyboard.type(code, { delay: 150 }); }
            await sleep(2000);
            
            const continueBtnLocator = page.locator('button:has-text("Continue"), button[type="submit"]').first();
            if (await continueBtnLocator.isVisible().catch(()=>false) && await continueBtnLocator.isEnabled().catch(()=>false)) { await continueBtnLocator.click().catch(()=>{}); } 
            else { await page.keyboard.press('Enter').catch(()=>{}); }
            await sleep(5000);
        }, `  // Typed Code`);

        // 👨‍🦰 الحل النهائي الجذري للعمر استناداً للصورة
        await runAction(chatId, page, "تعبئة الاسم والعمر الذكي", 25000, async () => {
            // انتظار الحقول قليلاً
            await page.waitForSelector('input', { timeout: 10000 }).catch(()=>{});
            
            const nameInput = page.locator('input[placeholder="Full name"], input[name="name"], input[autocomplete="name"]').first();
            if (await nameInput.isVisible().catch(()=>false)) {
                await nameInput.fill(''); 
                await nameInput.pressSequentially(fullName, { delay: 60 }); 
                await sleep(1000);
            }
            
            // ======= ذكي: تعبئة حقل العمر بناءً على placeholder أو attributes أو توليد عشوائي =======
            const ageInput = page.locator('input[placeholder*="Age"], input[placeholder*="age"], input[name*="age"], input[id*="age"], input[aria-label*="age"]').first();
            let chosenAge = null;

            if (await ageInput.count().catch(()=>0) > 0 && await ageInput.isVisible().catch(()=>false)) {
                // 1) حاول قراءة placeholder / aria-label / value / attributes من DOM
                const info = await ageInput.evaluate((el) => {
                    return {
                        placeholder: el.getAttribute('placeholder') || '',
                        aria: el.getAttribute('aria-label') || '',
                        name: el.getAttribute('name') || '',
                        id: el.getAttribute('id') || '',
                        min: el.getAttribute('min') || null,
                        max: el.getAttribute('max') || null,
                        value: el.value || ''
                    };
                }).catch(()=>({}));

                // 2) استخراج أرقام من placeholder/aria/name/id/value إن وُجدت
                const textToScan = `${info.placeholder} ${info.aria} ${info.name} ${info.id} ${info.value}`.replace(/[^0-9\- ]+/g, ' ');
                const nums = Array.from(textToScan.matchAll(/\d{1,3}/g)).map(m => parseInt(m[0], 10));
                if (nums.length > 0) {
                    // إذا وجد رقم واحد استخدمه، وإذا وجد نطاق (min/max) استخدم المتوسط أو الحد المناسب
                    if (info.min && info.max && !isNaN(parseInt(info.min)) && !isNaN(parseInt(info.max))) {
                        const mn = parseInt(info.min), mx = parseInt(info.max);
                        chosenAge = Math.max(18, Math.min(99, Math.floor((mn + mx) / 2)));
                    } else if (nums.length === 1) {
                        chosenAge = Math.max(18, Math.min(99, nums[0]));
                    } else if (nums.length >= 2) {
                        // افترض أول رقم هو الحد الأدنى أو استخدم المتوسط
                        chosenAge = Math.max(18, Math.min(99, Math.floor((nums[0] + nums[1]) / 2)));
                    }
                }

                // 3) إذا لم نجد أرقام، حاول استخدام min/max attributes مباشرة
                if (!chosenAge && info.min && info.max) {
                    const mn = parseInt(info.min), mx = parseInt(info.max);
                    if (!isNaN(mn) && !isNaN(mx) && mx >= mn) {
                        chosenAge = Math.max(18, Math.min(99, Math.floor((mn + mx) / 2)));
                    }
                }

                // 4) إن لم يُستخرج شيء، اختر عمرًا عشوائيًا معقولًا (تعديل النطاق سهل)
                if (!chosenAge) {
                    const MIN_AGE = 18;
                    const MAX_AGE = 60;
                    chosenAge = Math.floor(Math.random() * (MAX_AGE - MIN_AGE + 1)) + MIN_AGE;
                }

                // 5) املأ الحقل بطريقة آمنة
                try {
                    await ageInput.click().catch(()=>{});
                    await ageInput.fill(''); // تفريغ
                    // استخدم pressSequentially إن كانت متاحة في مشروعك
                    if (typeof ageInput.pressSequentially === 'function') {
                        await ageInput.pressSequentially(String(chosenAge), { delay: 60 });
                    } else {
                        await ageInput.type(String(chosenAge), { delay: 60 }).catch(async ()=> {
                            // fallback إلى page.keyboard
                            await page.keyboard.type(String(chosenAge), { delay: 60 }).catch(()=>{});
                        });
                    }
                } catch (e) {
                    // fallback: إرسال عبر لوحة المفاتيح
                    await page.keyboard.press('Tab').catch(()=>{});
                    await page.keyboard.type(String(chosenAge), { delay: 60 }).catch(()=>{});
                }
            } else {
                // لم نعثر على عنصر واضح للعمر: اكتب قيمة عشوائية معقولة
                const MIN_AGE = 18;
                const MAX_AGE = 60;
                chosenAge = Math.floor(Math.random() * (MAX_AGE - MIN_AGE + 1)) + MIN_AGE;
                await page.keyboard.press('Tab').catch(()=>{});
                await page.keyboard.type(String(chosenAge), { delay: 60 }).catch(()=>{});
            }

            // سجل القيمة في لوج السكربت إن أردت
            if (userState[chatId]) userState[chatId].scriptLog.push(`  // Age filled: ${chosenAge}`);

            const finishBtn = page.locator('button:has-text("Finish creating account")').first();
            if (await finishBtn.isVisible().catch(()=>false)) { 
                await finishBtn.click(); 
            } else { 
                const backupBtn = page.locator('button:has-text("Finish"), button:has-text("Agree"), button:has-text("Continue")').first();
                if (await backupBtn.isVisible().catch(()=>false)) await backupBtn.click().catch(()=>{});
                else await page.keyboard.press('Enter').catch(()=>{});
            }
            await sleep(3000);
        }, `  // Filled name & age`);

        accountSuccess = true;
        // تسجيل الحساب
        try { fs.appendFileSync(ACCOUNTS_FILE_PYTHON, `${emailData.email}:${chatGptPassword}\n`); } catch (e) {}
    } catch (e) {
        userState[chatId].scriptLog.push(`// ERROR: ${e.message}`);
        accountSuccess = false;
    } finally {
        try { if (page && !page.isClosed()) await page.close(); } catch (e) {}
        try { if (context) await context.close(); } catch (e) {}
        try { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }

    return accountSuccess;
}

// ==========================================
// بقية الكود (أوامر تيليجرام بسيطة) — يمكنك توسيعها حسب الحاجة
// ==========================================
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    userState[chatId] = userState[chatId] || {};
    bot.sendMessage(chatId, 'أهلاً! أرسل /create لبدء إنشاء حساب تجريبي.');
});

bot.onText(/\/create/, async (msg) => {
    const chatId = msg.chat.id;
    userState[chatId] = userState[chatId] || {};
    if (isProcessing) return bot.sendMessage(chatId, '🔁 هناك عملية جارية بالفعل. انتظر قليلاً.');
    isProcessing = true;
    try {
        const ok = await createAccountLogic_Original(chatId);
        if (ok) bot.sendMessage(chatId, '✅ العملية اكتملت بنجاح.');
        else bot.sendMessage(chatId, '❌ فشلت العملية. راجع السجلات.');
    } catch (e) {
        bot.sendMessage(chatId, `❌ خطأ: ${e.message}`);
    } finally {
        isProcessing = false;
    }
});
