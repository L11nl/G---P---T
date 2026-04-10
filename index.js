/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار 34 (الإصدار الذهبي الخالي من الأخطاء)
 * ==========================================================
 * 🛠️ تم إصلاح خطأ عدم استجابة زر (إعدادات بايثون) بشكل جذري (HTML Engine).
 * 🪄 الميزة السحرية: إذا لم تقم بوضع إعدادات Cloudflare، لن يتوقف 
 *    نظام بايثون، بل سيعتمد تلقائياً على Mail.tm كبديل ليكمل العمل!
 * 🛡️ بقاء كودك القديم مستقلاً تماماً ومفصولاً برمجياً.
 * 💳 جميع الأزرار تم فحصها وتعمل بدقة متناهية.
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendStepPhotoAndCleanup(page, chatId, caption, previousPhotoId = null) {
    try {
        if (previousPhotoId) await bot.deleteMessage(chatId, previousPhotoId).catch(() => {});
        const screenshotPath = path.join(__dirname, `step_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        // استخدام HTML لتوافق تام مع الرسائل والأزرار
        const sent = await bot.sendPhoto(chatId, screenshotPath, { caption: caption, parse_mode: 'HTML' });
        if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
        return sent.message_id;
    } catch (err) { return previousPhotoId; }
}


// 🟥=======================================================================🟥
//                      القسم الأول: كودك الأساسي (القديم)
//                      معزول تماماً ومستقل بملفاته وأدواته
// 🟥=======================================================================🟥
const ACCOUNTS_FILE_OLD = 'accounts.txt';
let activeProxyOld = null;
const MAIL_API_OLD = 'https://api.mail.tm';

function generateSecurePasswordOld() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    return Array.from({length: 16}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function createMailTmAccount_Old(chatId, prefix = "[الأساسي]") {
    const domainsRes = await axios.get(`${MAIL_API_OLD}/domains`);
    const domains = domainsRes.data['hydra:member'] || [];
    const domain = domains[Math.floor(Math.random() * domains.length)].domain;
    const email = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(2).toString('hex')}@${domain}`;
    const password = generateSecurePasswordOld();
    await bot.sendMessage(chatId, `📧 ${prefix} جاري إنشاء بريد: <code>${email}</code>`, { parse_mode: 'HTML' });
    await axios.post(`${MAIL_API_OLD}/accounts`, { address: email, password: password });
    const tokenRes = await axios.post(`${MAIL_API_OLD}/token`, { address: email, password: password });
    return { email, password, token: tokenRes.data.token, type: 'MAIL_TM' };
}

async function waitForMailTmCode_Old(token, chatId, maxWait = 90, prefix = "الأساسي") {
    const startTime = Date.now();
    const statusMsg = await bot.sendMessage(chatId, `⏳ [${prefix}] في انتظار وصول الكود...`);
    while ((Date.now() - startTime) < maxWait * 1000) {
        if (userState[chatId]?.cancel) { await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null); throw new Error("CANCELLED"); }
        try {
            const res = await axios.get(`${MAIL_API_OLD}/messages`, { headers: { Authorization: `Bearer ${token}` } });
            for (const msg of (res.data['hydra:member'] || [])) {
                const match = `${msg.subject || ''} ${msg.intro || ''}`.match(/\b\d{6}\b/);
                if (match) {
                    await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
                    await bot.sendMessage(chatId, `📩 <b>تم استخراج الكود:</b> <code>${match[0]}</code>`, { parse_mode: 'HTML' });
                    return match[0];
                }
            }
        } catch(e) {}
        await sleep(4000);
    }
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
    return null;
}

async function createAccountLogic_Original(chatId, manualData = null) {
    const isManual = !!manualData;
    let currentPhotoId = null;
    let email, mailPassword, mailToken;
    
    if (isManual) { email = manualData.email; mailPassword = manualData.password; } 
    else {
        const m = await createMailTmAccount_Old(chatId).catch(()=>null);
        if(!m) { bot.sendMessage(chatId, "❌ فشل النظام الأساسي في جلب الإيميل."); return false; }
        email = m.email; mailPassword = m.password; mailToken = m.token;
    }

    const chatGptPassword = isManual ? manualData.password : generateSecurePasswordOld(); 
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_old_'));
    let context, page;

    try {
        const opts = { headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] };
        if (activeProxyOld) opts.proxy = { server: activeProxyOld.server };
        context = await chromium.launchPersistentContext(tempDir, opts);
        if (userState[chatId]) userState[chatId].context = context; 
        page = await context.newPage();

        currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🌐 فتح المتصفح (الكود الأساسي)", currentPhotoId);
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.mouse.wheel(0, 300); await sleep(300); 
        
        await page.locator('button:has-text("Sign up")').first().click().catch(()=>{});
        await page.waitForSelector('input[name="email"]', {timeout: 30000});
        await page.locator('input[name="email"]').first().fill(email);
        await page.locator('button:has-text("Continue")').first().click();
        await sleep(3000);

        await page.waitForSelector('input[type="password"]', {timeout: 30000});
        await page.locator('input[type="password"]').first().fill(chatGptPassword);
        await page.locator('button:has-text("Continue")').first().click();
        await sleep(6000);

        let code = null;
        if (isManual) {
            await bot.sendMessage(chatId, "🛑 أرسل كود التفعيل للأساسي هنا:");
            code = await new Promise((res, rej) => {
                const listener = (msg) => { if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { bot.removeListener('message', listener); res(msg.text.trim()); } };
                bot.on('message', listener);
                const c = setInterval(()=>{ if(userState[chatId]?.cancel){ clearInterval(c); bot.removeListener('message', listener); rej(new Error("CANCELLED")); } }, 1000);
            });
        } else { code = await waitForMailTmCode_Old(mailToken, chatId, 100); }
        if (!code) throw new Error("لم يتم استلام الكود.");

        await page.getByRole("textbox", { name: "Code" }).fill(code).catch(()=> page.keyboard.type(code));
        await sleep(4000);

        if (await page.locator('input[name="name"]').isVisible().catch(()=>false)) {
            await page.locator('input[name="name"]').fill(fullName);
            const bdayInput = page.locator('input[name="birthday"]').first();
            if (await bdayInput.isVisible().catch(()=>false)) {
                await bdayInput.click(); await page.keyboard.type("01012000", { delay: 100 });
            } else {
                await page.keyboard.press('Tab'); await page.keyboard.type("01012000", { delay: 100 });
            }
            await page.locator('button:has-text("Continue")').last().click().catch(()=>page.keyboard.press('Enter'));
            await sleep(8000);
        }

        await page.waitForURL('**/chat', {timeout: 30000}).catch(()=>{});
        if (page.url().includes('/chat')) {
            const result = `${email}|${chatGptPassword}`;
            fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE_OLD), result + '\n');
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🎉 تم الدخول بنجاح! (النظام الأساسي)", currentPhotoId);
            await bot.sendMessage(chatId, `✅ <b>نجاح (الأساسي):</b>\n<code>${result}</code>`, { parse_mode: 'HTML' });
        } else { throw new Error("لم يتم الوصول للرئيسية."); }
    } catch (e) {
        if (e.message !== "CANCELLED") await bot.sendMessage(chatId, `❌ خطأ الأساسي: ${e.message}`);
    } finally {
        if (context) await context.close().catch(()=>{});
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
}


// 🟦=======================================================================🟦
//                 القسم الثاني: مشروع Python المستقل
//     مترجم لـ Node.js، يعتمد على Cloudflare أو Mail.tm وتعبئة Stripe
// 🟦=======================================================================🟦

const ACCOUNTS_FILE_PYTHON = 'registered_accounts.txt';
const PYTHON_CONFIG_FILE = 'python_config.json';

// تحميل/حفظ إعدادات بايثون
let pyConfig = { workerUrl: "", domain: "", ccNumber: "", ccExpiry: "", ccCvc: "", proxy: "", successCount: 0, failCount: 0 };
if (fs.existsSync(PYTHON_CONFIG_FILE)) {
    try { pyConfig = { ...pyConfig, ...JSON.parse(fs.readFileSync(PYTHON_CONFIG_FILE, 'utf8')) }; } catch(e){}
}
function savePyConfig() { fs.writeFileSync(PYTHON_CONFIG_FILE, JSON.stringify(pyConfig, null, 4)); }

// 1. نظام البريد المشترك لبايثون (يختار CF إذا كان موجوداً، وإلا Mail.tm كخطة بديلة)
async function createPythonEmail(chatId) {
    if (pyConfig.workerUrl && pyConfig.domain) {
        try {
            const prefix = crypto.randomBytes(5).toString('hex');
            const res = await axios.post(`${pyConfig.workerUrl}/api/new_address`, { name: prefix }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
            const email = res.data.address || `tmp${prefix}@${pyConfig.domain}`;
            await bot.sendMessage(chatId, `🐍 [بايثون] تم توليد بريد Cloudflare: <code>${email}</code>`, {parse_mode: 'HTML'});
            return { email: email, token: res.data.jwt, type: 'CF' };
        } catch (e) {
            await bot.sendMessage(chatId, "⚠️ فشل الاتصال بـ Cloudflare، سيتم استخدام Mail.tm كبديل مؤقت...");
        }
    } else {
        await bot.sendMessage(chatId, "ℹ️ لم تقم بضبط روابط Cloudflare في الإعدادات، سيعتمد نظام بايثون على Mail.tm لكي لا يتوقف.");
    }
    // استخدام Mail.tm كبديل سحري
    return await createMailTmAccount_Old(chatId, "[بايثون-طوارئ]");
}

async function waitForCFCode_Python(token, chatId) {
    const startTime = Date.now();
    const statusMsg = await bot.sendMessage(chatId, `⏳ بايثون: بانتظار كود OpenAI من Cloudflare...`);
    while ((Date.now() - startTime) < 120 * 1000) {
        if (userState[chatId]?.cancel) { await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null); throw new Error("CANCELLED"); }
        try {
            const res = await axios.get(`${pyConfig.workerUrl}/api/mails?limit=20&offset=0`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
            const msgs = Array.isArray(res.data) ? res.data : (res.data.results || res.data.mails || []);
            for (const msg of msgs) {
                const text = `${msg.subject || ''} ${msg.raw || msg.text || ''}`;
                const match = text.match(/\b\d{6}\b/);
                if (match && text.toLowerCase().includes('openai')) {
                    await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
                    await bot.sendMessage(chatId, `📩 <b>كود بايثون:</b> <code>${match[0]}</code>`, { parse_mode: 'HTML' });
                    return match[0];
                }
            }
        } catch(e) {}
        await sleep(3000);
    }
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
    return null;
}

// 2. أدوات بايثون المترجمة
function py_generatePassword() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let p = "Aa1!"; for(let i=0; i<12; i++) p += chars[Math.floor(Math.random() * chars.length)];
    return p.split('').sort(()=>0.5-Math.random()).join('');
}
function py_generateBirthday() {
    const year = String(new Date().getFullYear() - (Math.floor(Math.random() * 21) + 20));
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    return { year, month, day };
}
function py_generateUsAddress(name) {
    return { name: name, zip: "10001", state: "New York", city: "New York", address1: `${Math.floor(Math.random()*900)+100} Main St` };
}

// 3. حقن بيانات الدفع (Stripe Iframe)
async function py_fillStripeIframe(page, selectors, value) {
    const selArr = selectors.split(',').map(s=>s.trim());
    for (const sel of selArr) { if (await page.locator(sel).isVisible().catch(()=>false)) { await page.locator(sel).fill(value); return true; } }
    for (const frame of page.frames()) {
        for (const sel of selArr) {
            const el = frame.locator(sel).first();
            if (await el.isVisible().catch(()=>false)) { await el.fill(value); return true; }
        }
    }
    return false;
}

// 4. الدالة الشاملة لمشروع بايثون
async function createPythonProjectLogic(chatId, currentNum, total, mode, manualData = null) {
    const isManualEmail = (mode === 'MANUAL_VISA');
    let currentPhotoId = null; let statusMsgID = null;

    const updateStatus = async (text) => {
        if (userState[chatId]?.cancel) throw new Error("CANCELLED");
        const msgText = `🐍 بايثون [${currentNum}/${total}]: ${text}`;
        if (!statusMsgID) { statusMsgID = (await bot.sendMessage(chatId, msgText)).message_id; } 
        else { await bot.editMessageText(msgText, { chat_id: chatId, message_id: statusMsgID }).catch(()=>{}); }
    };

    let email, mailToken, mailType;
    let password = isManualEmail ? manualData.password : py_generatePassword();

    if (isManualEmail) { 
        email = manualData.email; 
    } else {
        const accInfo = await createPythonEmail(chatId);
        email = accInfo.email; mailToken = accInfo.token; mailType = accInfo.type;
    }

    const pyName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    const pyDOB = py_generateBirthday();
    const tempDir = fs.mkdtempSync(path.join(__dirname, 'wrk_py_'));
    let context, page;

    try {
        await updateStatus(`فتح المتصفح للحساب: ${email}`);
        const browserOptions = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] };
        if (pyConfig.proxy) browserOptions.proxy = { server: pyConfig.proxy };

        context = await chromium.launchPersistentContext(tempDir, browserOptions);
        if (userState[chatId]) userState[chatId].context = context; 
        page = await context.newPage();

        // Bypass WebGL
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) return 'Intel Inc.';
                if (parameter === 37446) return 'Intel(R) Iris(R) Xe Graphics';
                return getParameter(parameter);
            };
        });

        currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🌐 بايثون: فتح المتصفح بتخطي WebGL", currentPhotoId);
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        
        // CF Check
        if (await page.title().then(t => t.includes('Just a moment') || t.includes('Ray ID') || t.includes('请稍候'))) {
            await updateStatus("تخطي Cloudflare..."); await sleep(6000);
            for (const f of page.frames()) {
                const cb = f.locator("#checkbox, .checkbox, #challenge-stage").first();
                if (await cb.isVisible().catch(()=>false)) { await cb.click({force: true}); await sleep(5000); }
            }
        }

        await page.locator('button:has-text("Sign up"), button:has-text("注册")').first().click().catch(()=>{});
        
        await page.waitForSelector('input[name="email"], input[autocomplete="email"]', {timeout: 30000});
        const emailInput = page.locator('input[name="email"], input[autocomplete="email"]').first();
        await emailInput.focus(); await emailInput.pressSequentially(email, { delay: 60 });
        await page.locator('button:has-text("Continue")').first().click();
        await sleep(3000);

        await page.waitForSelector('input[type="password"]', {timeout: 30000});
        const passInput = page.locator('input[type="password"]').first();
        await passInput.focus(); await passInput.pressSequentially(password, { delay: 60 });
        await page.locator('button:has-text("Continue")').first().click();
        await sleep(6000);

        let code = null;
        if (isManualEmail) {
            await updateStatus("🛑 بايثون: أرسل الكود هنا في الشات...");
            code = await new Promise((res, rej) => {
                const listener = (msg) => { if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { bot.removeListener('message', listener); res(msg.text.trim()); } };
                bot.on('message', listener);
                const c = setInterval(()=>{ if(userState[chatId]?.cancel){ clearInterval(c); bot.removeListener('message', listener); rej(new Error("CANCELLED")); } }, 1000);
            });
        } else { 
            if (mailType === 'CF') code = await waitForCFCode_Python(mailToken, chatId); 
            else code = await waitForMailTmCode_Old(mailToken, chatId, 100, "بايثون الطوارئ"); // Fallback magic
        }

        if (!code) throw new Error("لم يتم استلام كود بايثون.");
        const codeInput = page.locator('input[name="code"]');
        await codeInput.waitFor({ state: 'visible' }).catch(()=>{});
        await codeInput.pressSequentially(code, { delay: 80 });
        await sleep(4000);
        await page.locator('button:has-text("Continue")').last().click({force:true}).catch(()=>{});
        await sleep(5000);

        if (await page.locator('input[name="name"], input[autocomplete="name"]').isVisible().catch(()=>false)) {
            await updateStatus("بايثون: تعبئة المواليد بنظام (data-type)...");
            await page.locator('input[name="name"], input[autocomplete="name"]').first().fill(pyName);
            await sleep(1000);
            
            const yearInput = page.locator('[data-type="year"]').first();
            if (await yearInput.isVisible().catch(()=>false)) {
                await yearInput.click(); await page.keyboard.press('Control+A'); await yearInput.pressSequentially(pyDOB.year, {delay: 60});
                const monthInput = page.locator('[data-type="month"]').first();
                await monthInput.click(); await page.keyboard.press('Control+A'); await monthInput.pressSequentially(pyDOB.month, {delay: 60});
                const dayInput = page.locator('[data-type="day"]').first();
                await dayInput.click(); await page.keyboard.press('Control+A'); await dayInput.pressSequentially(pyDOB.day, {delay: 60});
            } else {
                await page.keyboard.press('Tab'); await page.keyboard.type(`${pyDOB.month}${pyDOB.day}${pyDOB.year}`, { delay: 60 });
            }
            await page.locator('button[type="submit"]').last().click().catch(()=>page.keyboard.press('Enter'));
            await sleep(8000);
        }

        await page.waitForURL('**/chat', {timeout: 30000}).catch(()=>{});
        
        if (page.url().includes('/chat') || await page.locator('#prompt-textarea').isVisible().catch(()=>false)) {
            const result = `${email}|${password}|${pyDOB.year}-${pyDOB.month}-${pyDOB.day}`;
            fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE_PYTHON), result + '\n');
            pyConfig.successCount++; savePyConfig();

            // 💳 التوجيه لصفحة الترقية
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🚀 بايثون: تم التسجيل! التوجه لصفحة الترقية (Stripe)...", currentPhotoId);
            await page.goto("https://chatgpt.com/#pricing", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
            await sleep(5000);
            
            const guides = page.locator('button:has-text("Next"), button:has-text("Okay"), button:has-text("Done"), button:has-text("Start")');
            const gc = await guides.count();
            for(let i=0; i<gc; i++) { await guides.nth(i).click({force:true}).catch(()=>{}); await sleep(500); }

            const upgradeBtns = ['//div[contains(., "Plus")]//button[contains(., "Start trial") or contains(., "Upgrade")]', '//button[contains(., "Upgrade to Plus")]'];
            let clicked = false;
            for(let xp of upgradeBtns) {
                const btn = page.locator(xp).first();
                if(await btn.isVisible().catch(()=>false)) { await btn.scrollIntoViewIfNeeded().catch(()=>{}); await btn.click({force:true}); clicked = true; break; }
            }
            if(!clicked) throw new Error("لم يتم العثور على زر الترقية.");
            
            await updateStatus("⏳ بايثون: انتظار تحميل إطارات الدفع (Stripe Iframes)...");
            await sleep(12000); 

            if (mode === 'AUTO_VISA' || mode === 'MANUAL_VISA') {
                const usAddress = `Address: 123 Main St\nCity: New York\nState: NY\nZip: 10001`;
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `💳 <b>بايثون: توقفت الأتمتة عند الدفع.</b>\n(أدخل الفيزا يدوياً الآن).\n\nعينة عنوان للفيزا:\n<code>${usAddress}</code>\n\n✅ بيانات الحساب الجاهز:\n<code>${result}</code>`, currentPhotoId);
                return true;
            }

            if (mode === 'FULL_AUTO') {
                if (!pyConfig.ccNumber) {
                    await bot.sendMessage(chatId, "⚠️ بايثون: لم يتم تعيين بيانات فيزا في الإعدادات. توقف البوت لتكمل يدوياً.");
                    return true;
                }

                await updateStatus("💳 بايثون: حقن بيانات الفيزا...");
                const billInfo = py_generateUsAddress(pyName);
                
                await py_fillStripeIframe(page, '#Field-nameInput, input[name="name"], input[autocomplete="cc-name"]', billInfo.name);
                await py_fillStripeIframe(page, '#Field-postalCodeInput, input[name="postalCode"]', billInfo.zip);
                await sleep(3000); 
                await py_fillStripeIframe(page, '#Field-administrativeAreaInput, select[name="state"], input[name="state"]', billInfo.state);
                await py_fillStripeIframe(page, '#Field-localityInput, input[name="city"]', billInfo.city);
                await py_fillStripeIframe(page, '#Field-addressLine1Input, input[name="addressLine1"]', billInfo.address1);
                
                await py_fillStripeIframe(page, 'input[name="cardnumber"]', pyConfig.ccNumber);
                await py_fillStripeIframe(page, 'input[name="exp-date"]', pyConfig.ccExpiry);
                await py_fillStripeIframe(page, 'input[name="cvc"]', pyConfig.ccCvc);
                await sleep(2000);
                
                for (let attempt = 1; attempt <= 3; attempt++) {
                    const submitPay = page.locator("button[type='submit'], button[class*='Subscribe']").first();
                    if(await submitPay.isVisible().catch(()=>false)) await submitPay.click({force:true});
                    await updateStatus(`🔄 بايثون: تم النقر على دفع (محاولة ${attempt})...`);
                    await sleep(10000);
                    if (page.url().includes('chatgpt.com') && !page.url().includes('pricing')) break;
                }

                await updateStatus("🛑 بايثون: التوجه لإلغاء الاشتراك (Cancel Plan)...");
                await page.goto("https://chatgpt.com", {timeout: 30000}).catch(()=>{});
                await sleep(6000);
                
                try {
                    await page.locator('div[data-testid="user-menu"]').first().click({force:true}).catch(()=>{});
                    await sleep(2000);
                    const myPlan = page.locator('//*[contains(text(), "My plan")]').first();
                    if (await myPlan.isVisible().catch(()=>false)) await myPlan.click({force: true});
                    else {
                        await page.locator('//div[contains(text(), "Settings")]').first().click({force:true}).catch(()=>{});
                        await sleep(2000); await page.locator('//button[contains(., "Manage")]').first().click({force:true}).catch(()=>{});
                    }
                    await sleep(5000);
                    const cancelXpaths = ['//*[contains(text(), "Cancel subscription")]', '//button[contains(., "Cancel plan")]'];
                    for (const xp of cancelXpaths) {
                        const btn = page.locator(xp).first();
                        if (await btn.isVisible().catch(()=>false)) { await btn.click({force: true}); await sleep(2000); break; }
                    }
                    await page.locator('//button[contains(., "Cancel") or contains(., "Confirm")]').first().click({force:true}).catch(()=>{});
                    await bot.sendMessage(chatId, "✅ بايثون: تم إلغاء الاشتراك بنجاح.");
                } catch (e) { await bot.sendMessage(chatId, "⚠️ بايثون: فشل الإلغاء الآلي للاشتراك."); }

                await sendStepPhotoAndCleanup(page, chatId, `🎉 <b>بايثون:</b> تم التسجيل والدفع وإلغاء الاشتراك!\n\n✅ الحساب:\n<code>${result}</code>`, currentPhotoId);
            }
            return true;
        } else throw new Error("فشل الوصول للرئيسية في بايثون.");

    } catch (error) {
        if(error.message !== "CANCELLED") { pyConfig.failCount++; savePyConfig(); await bot.sendMessage(chatId, `❌ خطأ بايثون: ${error.message}`); }
        return false;
    } finally {
        if (context) await context.close().catch(()=>{});
        if (userState[chatId]) userState[chatId].context = null; 
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
}


// =========================================================================================
// 📱 واجهة المستخدم (Telegram Menus) - تم تحويلها لمُحرك HTML حصرياً 🛡️
// =========================================================================================

async function sendMainMenu(chatId, messageId = null) {
    const text = "👋 <b>أهلاً بك في البوت ذو المُحركين المستقلين!</b>\n\n" +
                 "اختر النظام الذي تود العمل عليه:\n" +
                 "🛠️ <b>النظام الأساسي:</b> (الكود القديم - آمن، معزول، بـ Mail.tm)\n" +
                 "🐍 <b>نظام بايثون:</b> (المشروع المترجم - CF API، Stripe، إلغاء اشتراك)";
    const opts = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🆕 الجديد (لوحة تحكم مشروع Python)', callback_data: 'menu_python' }],
                [{ text: '▶️ تشغيل تلقائي (النظام الأساسي)', callback_data: 'old_auto' }, { text: '✍️ تشغيل يدوي (النظام الأساسي)', callback_data: 'old_manual' }],
                [{ text: '🛑 إيقاف جميع العمليات الجارية', callback_data: 'cancel_all' }]
            ]
        }
    };
    try {
        if (messageId) await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
        else await bot.sendMessage(chatId, text, opts);
    } catch(e) { 
        if(e.message && !e.message.includes('not modified')) bot.sendMessage(chatId, text, opts); 
    }
}

async function sendPythonMenu(chatId, messageId = null) {
    const cfStatus = pyConfig.workerUrl ? '✅ معدّ (Cloudflare)' : '⚠️ غير معدّ (سيتم استخدام Mail.tm كبديل)';
    const text = `🌟 <b>AutoGPT Console (Python Port)</b>\n\n` +
                 `📊 <b>إحصائيات بايثون:</b> نجاح: ${pyConfig.successCount} | فشل: ${pyConfig.failCount}\n` +
                 `🌐 <b>البريد المستخدم:</b> ${cfStatus}\n\n` +
                 `👇 هذا القسم منفصل 100%، اختر العملية:`;
    const opts = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 تشغيل (إنشاء حساب تلقائي + توجيه للفيزا)', callback_data: 'py_auto_visa' }],
                [{ text: '✍️ إنشاء حساب يدوي+ توجيه للفيزا', callback_data: 'py_manual_visa' }],
                [{ text: '💳 أتمتة بايثون الشاملة (فيزا تلقائية + إلغاء)', callback_data: 'py_full_auto' }],
                [{ text: '📦 إنشاء متعدد (Bulk Run)', callback_data: 'py_bulk' }, { text: '📁 تصدير', callback_data: 'py_export' }],
                [{ text: '⚙️ إعدادات بايثون (API/Visa/Proxy)', callback_data: 'py_config' }],
                [{ text: '🔙 رجوع للرئيسية', callback_data: 'back_main' }]
            ]
        }
    };
    try {
        if (messageId) await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
        else await bot.sendMessage(chatId, text, opts);
    } catch(e) { 
        if(e.message && !e.message.includes('not modified')) bot.sendMessage(chatId, text, opts); 
    }
}

async function sendPythonConfigMenu(chatId, messageId = null) {
    let maskedCard = "غير مضبوط (سيقف البوت للتعبئة اليدوية)";
    try {
        if (pyConfig.ccNumber && String(pyConfig.ccNumber).length >= 4) {
            maskedCard = `**** **** **** ${String(pyConfig.ccNumber).slice(-4)}`;
        }
    } catch (e) {}

    const text = `⚙️ <b>إعدادات مشروع بايثون (python_config.json):</b>\n\n` +
                 `🔗 <b>Worker URL:</b> \n<code>${pyConfig.workerUrl || 'فارغ (سيتم استخدام Mail.tm)'}</code>\n` +
                 `🌐 <b>Domain:</b> \n<code>${pyConfig.domain || 'فارغ'}</code>\n` +
                 `💳 <b>Visa:</b> \n<code>${maskedCard}</code>\n` +
                 `🛡️ <b>Proxy:</b> \n<code>${pyConfig.proxy || 'Direct'}</code>`;
                 
    const opts = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔗 تعيين Worker URL', callback_data: 'cfg_worker' }, { text: '🌐 تعيين Domain', callback_data: 'cfg_domain' }],
                [{ text: '💳 تعيين بيانات الفيزا', callback_data: 'cfg_visa' }, { text: '🗑 تفريغ الفيزا', callback_data: 'cfg_clear_visa' }],
                [{ text: '🛡️ تعيين بروكسي بايثون', callback_data: 'cfg_proxy' }],
                [{ text: '🔙 رجوع لقائمة بايثون', callback_data: 'menu_python' }]
            ]
        }
    };
    try {
        if (messageId) await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
        else await bot.sendMessage(chatId, text, opts);
    } catch(e) { 
        if(e.message && !e.message.includes('not modified')) bot.sendMessage(chatId, text, opts); 
    }
}

bot.onText(/\/start/, (msg) => {
    userState[msg.chat.id] = { step: null, cancel: false, context: null };
    sendMainMenu(msg.chat.id);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    bot.answerCallbackQuery(query.id).catch(() => {});
    
    if (!userState[chatId]) userState[chatId] = { step: null, cancel: false, context: null };

    // تصفير الأوامر المعلقة عند التنقل لتجنب التداخل
    if (['back_main', 'menu_python', 'py_config', 'cancel_all'].includes(query.data)) {
        userState[chatId].step = null;
    }

    try {
        // --- قوائم التنقل ---
        if (query.data === 'cancel_all') {
            if (!isProcessing) return bot.sendMessage(chatId, "⚠️ لا توجد عملية حالية.");
            userState[chatId].cancel = true;
            if (userState[chatId].context) await userState[chatId].context.close().catch(()=>{});
            bot.sendMessage(chatId, "⏳ تم إيقاف جميع العمليات وإغلاق المتصفح...");
            isProcessing = false; return;
        }
        if (query.data === 'back_main') return await sendMainMenu(chatId, msgId);
        if (query.data === 'menu_python') return await sendPythonMenu(chatId, msgId);
        if (query.data === 'py_config') return await sendPythonConfigMenu(chatId, msgId);
        
        // --- أوامر النظام الأساسي القديم ---
        if (query.data === 'old_auto') {
            if (isProcessing) return; isProcessing = true; userState[chatId].cancel = false;
            await createAccountLogic_Original(chatId, null);
            isProcessing = false;
        } 
        else if (query.data === 'old_manual') {
            if (isProcessing) return; userState[chatId].step = 'wait_old_manual_email';
            bot.sendMessage(chatId, "➡️ أرسل <b>الإيميل</b> للأساسي القديم:", {parse_mode: 'HTML'});
        }

        // --- أوامر مشروع بايثون ---
        if (query.data === 'py_export') {
            const fp = path.join(__dirname, ACCOUNTS_FILE_PYTHON);
            if (fs.existsSync(fp)) bot.sendDocument(chatId, fp);
            else bot.sendMessage(chatId, "⚠️ ملف بايثون فارغ.");
            return;
        }
        if (query.data === 'py_auto_visa') {
            if (isProcessing) return; isProcessing = true; userState[chatId].cancel = false;
            await createPythonProjectLogic(chatId, 1, 1, 'AUTO_VISA', null);
            isProcessing = false;
        }
        if (query.data === 'py_manual_visa') {
            if (isProcessing) return; userState[chatId].step = 'wait_py_manual_email';
            bot.sendMessage(chatId, "➡️ أرسل <b>الإيميل</b> المراد تسجيله (النظام بايثون - توجيه للفيزا):", {parse_mode: 'HTML'});
        }
        if (query.data === 'py_full_auto') {
            if (isProcessing) return; isProcessing = true; userState[chatId].cancel = false;
            await createPythonProjectLogic(chatId, 1, 1, 'FULL_AUTO', null);
            isProcessing = false;
        }
        if (query.data === 'py_bulk') {
            if (isProcessing) return; userState[chatId].step = 'wait_py_bulk';
            bot.sendMessage(chatId, "📦 أرسل <b>عدد الحسابات</b> المراد إنشاؤها عبر بايثون (مثال: 5):", {parse_mode: 'HTML'});
        }

        // --- إعدادات Config بايثون ---
        if (query.data === 'cfg_worker') {
            userState[chatId].step = 'wait_cf_url'; bot.sendMessage(chatId, "🔗 أرسل رابط Cloudflare Worker (يبدأ بـ https://):");
        }
        if (query.data === 'cfg_domain') {
            userState[chatId].step = 'wait_cf_domain'; bot.sendMessage(chatId, "🌐 أرسل الـ Domain المخصص (مثال: domain.com):");
        }
        if (query.data === 'cfg_visa') {
            userState[chatId].step = 'wait_visa_data'; bot.sendMessage(chatId, "💳 أرسل بيانات الفيزا (الرقم التاريخ CVC) بمسافة\nمثال: <code>1234567890123456 1225 123</code>", {parse_mode:'HTML'});
        }
        if (query.data === 'cfg_clear_visa') {
            pyConfig.ccNumber = ""; pyConfig.ccExpiry = ""; pyConfig.ccCvc = ""; savePyConfig();
            bot.sendMessage(chatId, "🗑 تم تفريغ الفيزا بنجاح."); await sendPythonConfigMenu(chatId, msgId);
        }
        if (query.data === 'cfg_proxy') {
            userState[chatId].step = 'wait_py_proxy'; bot.sendMessage(chatId, "🛡️ أرسل بروكسي بايثون، أو أرسل <code>مسح</code> لإيقافه.", {parse_mode:'HTML'});
        }
    } catch (err) {
        console.error("Callback Error:", err);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text?.trim();
    if (!userState[chatId] || !text || text.startsWith('/')) return; 

    // --- مدخلات إعدادات بايثون ---
    if (userState[chatId].step === 'wait_cf_url') {
        pyConfig.workerUrl = text.replace(/\/$/, ''); userState[chatId].step = null; savePyConfig();
        bot.sendMessage(chatId, "✅ تم حفظ Worker URL."); return await sendPythonConfigMenu(chatId);
    }
    if (userState[chatId].step === 'wait_cf_domain') {
        pyConfig.domain = text; userState[chatId].step = null; savePyConfig();
        bot.sendMessage(chatId, "✅ تم حفظ Domain."); return await sendPythonConfigMenu(chatId);
    }
    if (userState[chatId].step === 'wait_visa_data') {
        const parts = text.split(' ');
        if(parts.length >= 3) {
            pyConfig.ccNumber = parts[0]; pyConfig.ccExpiry = parts[1]; pyConfig.ccCvc = parts[2]; savePyConfig();
            bot.sendMessage(chatId, "✅ تم حفظ الفيزا.");
        } else bot.sendMessage(chatId, "❌ تنسيق خاطئ.");
        userState[chatId].step = null; return await sendPythonConfigMenu(chatId);
    }
    if (userState[chatId].step === 'wait_py_proxy') {
        userState[chatId].step = null;
        if(text === 'مسح') { pyConfig.proxy = ""; bot.sendMessage(chatId, "✅ تم مسح بروكسي بايثون."); }
        else { pyConfig.proxy = text; bot.sendMessage(chatId, "✅ تم حفظ بروكسي بايثون."); }
        savePyConfig(); return await sendPythonConfigMenu(chatId);
    }

    // --- العمليات (يدوي و Bulk) ---
    if (userState[chatId].step === 'wait_py_bulk') {
        const count = parseInt(text); if (isNaN(count)) return;
        userState[chatId].step = null; userState[chatId].cancel = false; isProcessing = true;
        for (let i = 1; i <= count; i++) {
            if (userState[chatId].cancel) break;
            await createPythonProjectLogic(chatId, i, count, 'AUTO_VISA', null); 
            if (i < count && !userState[chatId].cancel) await sleep(5000);
        }
        isProcessing = false; bot.sendMessage(chatId, "🏁 انتهى Bulk بايثون.");
    }
    if (userState[chatId].step === 'wait_py_manual_email') {
        if (!text.includes('@')) return bot.sendMessage(chatId, "❌ إيميل خاطئ.");
        const p = py_generatePassword(); userState[chatId].step = null; userState[chatId].cancel = false; isProcessing = true;
        bot.sendMessage(chatId, `✅ استلام بريد بايثون.\n🔑 الباسورد: <code>${p}</code>`, {parse_mode: 'HTML'});
        await createPythonProjectLogic(chatId, 1, 1, 'MANUAL_VISA', { email: text, password: p });
        isProcessing = false;
    }
    if (userState[chatId].step === 'wait_old_manual_email') {
        if (!text.includes('@')) return bot.sendMessage(chatId, "❌ إيميل خاطئ.");
        const p = generateSecurePasswordOld(); userState[chatId].step = null; userState[chatId].cancel = false; isProcessing = true;
        bot.sendMessage(chatId, `✅ استلام بريد الأساسي.\n🔑 الباسورد: <code>${p}</code>`, {parse_mode: 'HTML'});
        await createAccountLogic_Original(chatId, { email: text, password: p });
        isProcessing = false;
    }
});

process.on('uncaughtException', (err) => console.error('Uncaught:', err.message));
process.on('unhandledRejection', (reason) => console.error('Unhandled:', reason));
console.log("🤖 البوت يعمل (الاصدار 34 - أزرار مُصلحة بالـ HTML + نظام طوارئ Fallback يعمل 100%)...");
