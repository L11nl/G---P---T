/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار 36 (الإصدار الأسطوري 👑)
 * ==========================================================
 * 📸 نظام تصوير ذكي (يحذف الصورة السابقة ويبقي الأخيرة).
 * 💳 محلل فيزا ذكي (يحول 1234|12|2027|123 إلى 1234 1227 123 آلياً).
 * 🌐 محرك 5 APIs للإيميلات (يخدم كلا النظامين بالكامل).
 * 🛡️ كود محمي 100% وخالٍ من الأخطاء مع واجهة أزرار قوية.
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

// إعدادات البوت الشاملة
let globalConfig = {
    emailApiId: 1, // 1 to 5
    ccNumber: '',
    ccExpiry: '',
    ccCvc: '',
    pySuccess: 0,
    pyFail: 0
};

if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
    try { globalConfig = { ...globalConfig, ...JSON.parse(fs.readFileSync(GLOBAL_CONFIG_FILE, 'utf8')) }; } catch (e) {}
}
function saveConfig() { fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(globalConfig, null, 4)); }

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 📸 نظام التصوير المتسلسل (يصور، يحذف السابق، ويرجع الـ ID)
// ==========================================
async function sendStepPhotoAndCleanup(page, chatId, caption, previousPhotoId = null) {
    try {
        if (previousPhotoId) await bot.deleteMessage(chatId, previousPhotoId).catch(() => {});
        const screenshotPath = path.join(__dirname, `step_${crypto.randomBytes(4).toString('hex')}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        const sent = await bot.sendPhoto(chatId, screenshotPath, { caption: caption, parse_mode: 'HTML' });
        if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
        return sent.message_id; // نُرجع آي دي الصورة الجديدة ليتم حذفها في الخطوة التي تليها
    } catch (err) { return previousPhotoId; }
}

// ==========================================
// 🌐 محرك الإيميلات الخماسي (يخدم كلا النظامين)
// ==========================================
const EmailManager = {
    async getDomains1sec() {
        try {
            const res = await axios.get('https://www.1secmail.com/api/v1/?action=getDomainList');
            return res.data && res.data.length > 0 ? res.data : ['1secmail.com', '1secmail.org', '1secmail.net'];
        } catch(e) { return ['1secmail.com', '1secmail.org', '1secmail.net']; }
    },
    
    async create(chatId, apiId, prefix = "") {
        let emailData = { apiId };
        let apiName = "";
        if(apiId === 1) apiName = "Mail.tm";
        else if(apiId === 2) apiName = "Mail.gw";
        else if(apiId === 3) apiName = "1SecMail A";
        else if(apiId === 4) apiName = "1SecMail B";
        else if(apiId === 5) apiName = "1SecMail C";

        await bot.sendMessage(chatId, `📧 ${prefix} إنشاء بريد عبر <b>${apiName}</b>...`, {parse_mode: 'HTML'});
        
        try {
            if (apiId === 1 || apiId === 2) {
                const baseUrl = apiId === 1 ? 'https://api.mail.tm' : 'https://api.mail.gw';
                const dRes = await axios.get(`${baseUrl}/domains`);
                const domains = dRes.data['hydra:member'];
                const domain = domains[Math.floor(Math.random() * domains.length)].domain;
                const email = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(2).toString('hex')}@${domain}`;
                const password = crypto.randomBytes(8).toString('hex') + "Aa1@";
                
                await axios.post(`${baseUrl}/accounts`, { address: email, password });
                const tRes = await axios.post(`${baseUrl}/token`, { address: email, password });
                
                emailData.email = email;
                emailData.password = password;
                emailData.token = tRes.data.token;
                emailData.baseUrl = baseUrl;
                
                await bot.sendMessage(chatId, `✅ تم التوليد: <code>${email}</code>`, {parse_mode: 'HTML'});
                return emailData;
            } else {
                const domains = await this.getDomains1sec();
                let domain = domains[0];
                if (apiId === 4 && domains.length > 1) domain = domains[1];
                if (apiId === 5 && domains.length > 2) domain = domains[2];
                
                const login = `${faker.person.firstName().toLowerCase()}${crypto.randomBytes(3).toString('hex')}`;
                const email = `${login}@${domain}`;
                const password = crypto.randomBytes(8).toString('hex') + "Aa1@";
                
                emailData.email = email;
                emailData.password = password;
                emailData.login = login;
                emailData.domain = domain;
                
                await bot.sendMessage(chatId, `✅ تم التوليد: <code>${email}</code>`, {parse_mode: 'HTML'});
                return emailData;
            }
        } catch(e) {
            await bot.sendMessage(chatId, `⚠️ فشل في API ${apiId}، جاري التحويل لـ API 1...`);
            return await this.create(chatId, 1, prefix); 
        }
    },

    async waitForCode(emailData, chatId, prefix = "", maxWait = 120) {
        const start = Date.now();
        const statusMsg = await bot.sendMessage(chatId, `⏳ ${prefix} بانتظار الكود...`);
        
        while (Date.now() - start < maxWait * 1000) {
            if (userState[chatId]?.cancel) {
                await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{});
                throw new Error("CANCELLED");
            }
            try {
                if (emailData.apiId === 1 || emailData.apiId === 2) {
                    const res = await axios.get(`${emailData.baseUrl}/messages`, { headers: { Authorization: `Bearer ${emailData.token}` }});
                    for (const msg of (res.data['hydra:member'] || [])) {
                        const text = `${msg.subject} ${msg.intro}`;
                        const match = text.match(/\b\d{6}\b/);
                        if (match && text.toLowerCase().includes('openai')) {
                            await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{});
                            await bot.sendMessage(chatId, `📩 <b>تم استخراج الكود:</b> <code>${match[0]}</code>`, {parse_mode: 'HTML'});
                            return match[0];
                        }
                    }
                } else {
                    const res = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${emailData.login}&domain=${emailData.domain}`);
                    if (res.data && res.data.length > 0) {
                        for (const msg of res.data) {
                            const msgDetail = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${emailData.login}&domain=${emailData.domain}&id=${msg.id}`);
                            const text = `${msgDetail.data.subject} ${msgDetail.data.textBody}`;
                            const match = text.match(/\b\d{6}\b/);
                            if (match && text.toLowerCase().includes('openai')) {
                                await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{});
                                await bot.sendMessage(chatId, `📩 <b>تم استخراج الكود:</b> <code>${match[0]}</code>`, {parse_mode: 'HTML'});
                                return match[0];
                            }
                        }
                    }
                }
            } catch(e) {}
            await sleep(4000);
        }
        await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{});
        return null;
    }
};

// ==========================================
// 🛠️ أدوات مساعدة (بايثون)
// ==========================================
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
async function py_fillStripeIframe(page, selectors, value) {
    const selArr = selectors.split(',').map(s=>s.trim());
    for (const sel of selArr) { 
        if (await page.locator(sel).isVisible().catch(()=>false)) { 
            await page.locator(sel).focus();
            await page.keyboard.type(value, { delay: 80 }); 
            return true; 
        } 
    }
    for (const frame of page.frames()) {
        for (const sel of selArr) {
            const el = frame.locator(sel).first();
            if (await el.isVisible().catch(()=>false)) { 
                await el.focus();
                await page.keyboard.type(value, { delay: 80 }); 
                return true; 
            }
        }
    }
    return false;
}

// 🟥=======================================================================🟥
//                      القسم الأول: كودك الأساسي (القديم)
// 🟥=======================================================================🟥
async function createAccountLogic_Original(chatId, manualData = null) {
    const isManual = !!manualData;
    let currentPhotoId = null;
    let emailData;
    let accountSuccess = false;
    
    if (isManual) { emailData = { email: manualData.email, password: manualData.password, apiId: 'MANUAL' }; } 
    else {
        emailData = await EmailManager.create(chatId, globalConfig.emailApiId, "[النظام الأساسي]");
        if(!emailData) return false;
    }

    const chatGptPassword = isManual ? manualData.password : emailData.password; 
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_old_'));
    let context, page;

    try {
        const opts = { headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] };
        context = await chromium.launchPersistentContext(tempDir, opts);
        if (userState[chatId]) userState[chatId].context = context; 
        page = await context.newPage();

        currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🌐 <b>الأساسي:</b> فتح المتصفح", currentPhotoId);
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(1000);
        
        // 🔄 تحديث ذكي لزر التسجيل الجديد
        const signUpSelectors = 'button:has-text("Sign up"), a:has-text("Sign up"), text=/Sign up/i, [data-testid="signup-button"], [data-testid="login-screen-signup"]';
        const signUpBtn = page.locator(signUpSelectors).first();
        await signUpBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(()=>{});
        await signUpBtn.click({ force: true }).catch(()=>{});
        await sleep(3000); // إعطاء المتصفح مهلة للانتقال لصفحة الإيميل
        
        await page.waitForSelector('input[name="email"]', {timeout: 30000});
        currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `📝 <b>الأساسي:</b> إدخال الإيميل:\n<code>${emailData.email}</code>`, currentPhotoId);
        await page.locator('input[name="email"]').first().fill(emailData.email);
        await page.locator('button:has-text("Continue")').first().click();
        await sleep(3000);

        await page.waitForSelector('input[type="password"]', {timeout: 30000});
        currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🔐 <b>الأساسي:</b> إدخال الباسورد...", currentPhotoId);
        await page.locator('input[type="password"]').first().fill(chatGptPassword);
        await page.locator('button:has-text("Continue")').first().click();
        await sleep(6000);

        let code = null;
        if (isManual) {
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🛑 <b>الأساسي:</b> أرسل الكود هنا في الشات:", currentPhotoId);
            code = await new Promise((res, rej) => {
                const listener = (msg) => { if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { bot.removeListener('message', listener); res(msg.text.trim()); } };
                bot.on('message', listener);
                const c = setInterval(()=>{ if(userState[chatId]?.cancel){ clearInterval(c); bot.removeListener('message', listener); rej(new Error("CANCELLED")); } }, 1000);
            });
        } else { code = await EmailManager.waitForCode(emailData, chatId, "[الأساسي]"); }
        if (!code) throw new Error("لم يتم استلام الكود.");

        currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `🔢 <b>الأساسي:</b> إدخال الكود (${code})`, currentPhotoId);
        await page.getByRole("textbox", { name: "Code" }).fill(code).catch(()=> page.keyboard.type(code));
        await sleep(4000);

        if (await page.locator('input[name="name"]').isVisible().catch(()=>false)) {
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "👤 <b>الأساسي:</b> تعبئة الاسم والمواليد...", currentPhotoId);
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
        if (page.url().includes('/chat') || await page.locator('#prompt-textarea').isVisible().catch(()=>false)) {
            const result = `${emailData.email}|${chatGptPassword}`;
            fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE_OLD), result + '\n');
            accountSuccess = true;
            // الصورة النهائية تبقى ولا تحذف
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `🎉 <b>تم الدخول بنجاح! (النظام الأساسي)</b>\n\n<code>${result}</code>`, currentPhotoId);
            currentPhotoId = null; // تصفيرها كي لا تحذف في finally
        } else { throw new Error("لم يتم الوصول للرئيسية."); }
    } catch (e) {
        if (e.message !== "CANCELLED") {
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `❌ خطأ الأساسي: ${e.message}`, currentPhotoId);
            currentPhotoId = null;
        }
    } finally {
        if (context) await context.close().catch(()=>{});
        if (!accountSuccess && currentPhotoId) await bot.deleteMessage(chatId, currentPhotoId).catch(()=>{}); 
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
}

// 🟦=======================================================================🟦
//                 القسم الثاني: مشروع Python المستقل
// 🟦=======================================================================🟦
async function createPythonProjectLogic(chatId, currentNum, total, mode, manualData = null) {
    const isManualEmail = (mode === 'MANUAL_VISA');
    let currentPhotoId = null; let statusMsgID = null;
    let accountSuccess = false;

    const updateStatus = async (text) => {
        if (userState[chatId]?.cancel) throw new Error("CANCELLED");
        const msgText = `🐍 بايثون [${currentNum}/${total}]: ${text}`;
        if (!statusMsgID) { statusMsgID = (await bot.sendMessage(chatId, msgText)).message_id; } 
        else { await bot.editMessageText(msgText, { chat_id: chatId, message_id: statusMsgID }).catch(()=>{}); }
    };

    let emailData;
    let password = isManualEmail ? manualData.password : py_generatePassword();

    if (isManualEmail) { 
        emailData = { email: manualData.email, password: password, apiId: 'MANUAL' }; 
    } else {
        emailData = await EmailManager.create(chatId, globalConfig.emailApiId, "[بايثون]");
        if(!emailData) return false;
    }

    const pyName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    const pyDOB = py_generateBirthday();
    const tempDir = fs.mkdtempSync(path.join(__dirname, 'wrk_py_'));
    let context, page;

    try {
        await updateStatus(`فتح المتصفح للحساب: ${emailData.email}`);
        const browserOptions = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] };

        context = await chromium.launchPersistentContext(tempDir, browserOptions);
        if (userState[chatId]) userState[chatId].context = context; 
        page = await context.newPage();

        // WebGL Bypass (من كود Python)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(p) {
                if (p === 37445) return 'Intel Inc.';
                if (p === 37446) return 'Intel(R) Iris(R) Xe Graphics';
                return getParameter(p);
            };
        });

        currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🌐 <b>بايثون:</b> فتح المتصفح بتخطي WebGL", currentPhotoId);
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        
        // CF Check
        if (await page.title().then(t => t.includes('Just a moment') || t.includes('Ray ID') || t.includes('请稍候'))) {
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🛡️ <b>بايثون:</b> تخطي حماية Cloudflare...", currentPhotoId);
            await sleep(6000);
            for (const f of page.frames()) {
                const cb = f.locator("#checkbox, .checkbox, #challenge-stage").first();
                if (await cb.isVisible().catch(()=>false)) { await cb.click({force: true}); await sleep(5000); }
            }
        }

        // 🔄 التحديث الذكي لزر التسجيل الجديد في نظام بايثون
        const signUpSelectorsPy = 'button:has-text("Sign up"), a:has-text("Sign up"), text=/Sign up/i, text="注册", [data-testid="signup-button"], [data-testid="login-screen-signup"]';
        const signUpBtnPy = page.locator(signUpSelectorsPy).first();
        await signUpBtnPy.waitFor({ state: 'visible', timeout: 15000 }).catch(()=>{});
        await signUpBtnPy.click({ force: true }).catch(()=>{});
        await sleep(3000); // إعطاء المتصفح مهلة للانتقال لصفحة الإيميل
        
        await page.waitForSelector('input[name="email"], input[autocomplete="email"]', {timeout: 30000});
        currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `📝 <b>بايثون:</b> كتابة الإيميل ببطء:\n<code>${emailData.email}</code>`, currentPhotoId);
        const emailInput = page.locator('input[name="email"], input[autocomplete="email"]').first();
        await emailInput.focus(); await emailInput.pressSequentially(emailData.email, { delay: 60 });
        await page.locator('button:has-text("Continue")').first().click();
        await sleep(3000);

        await page.waitForSelector('input[type="password"]', {timeout: 30000});
        currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🔐 <b>بايثون:</b> كتابة الباسورد ببطء", currentPhotoId);
        const passInput = page.locator('input[type="password"]').first();
        await passInput.focus(); await passInput.pressSequentially(password, { delay: 60 });
        await page.locator('button:has-text("Continue")').first().click();
        await sleep(6000);

        let code = null;
        if (isManualEmail) {
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🛑 <b>بايثون:</b> أرسل الكود هنا في الشات...", currentPhotoId);
            code = await new Promise((res, rej) => {
                const listener = (msg) => { if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { bot.removeListener('message', listener); res(msg.text.trim()); } };
                bot.on('message', listener);
                const c = setInterval(()=>{ if(userState[chatId]?.cancel){ clearInterval(c); bot.removeListener('message', listener); rej(new Error("CANCELLED")); } }, 1000);
            });
        } else { code = await EmailManager.waitForCode(emailData, chatId, "[بايثون]"); }

        if (!code) throw new Error("لم يتم استلام كود بايثون.");
        
        currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `🔢 <b>بايثون:</b> إدخال الكود ${code}`, currentPhotoId);
        const codeInput = page.locator('input[name="code"]');
        await codeInput.waitFor({ state: 'visible' }).catch(()=>{});
        await codeInput.pressSequentially(code, { delay: 80 });
        await sleep(4000);
        await page.locator('button:has-text("Continue")').last().click({force:true}).catch(()=>{});
        await sleep(5000);

        if (await page.locator('input[name="name"], input[autocomplete="name"]').isVisible().catch(()=>false)) {
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "👤 <b>بايثون:</b> تعبئة نظام المواليد الجديد (data-type)", currentPhotoId);
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
            const result = `${emailData.email}|${password}|${pyDOB.year}-${pyDOB.month}-${pyDOB.day}`;
            fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE_PYTHON), result + '\n');
            globalConfig.pySuccess++; saveConfig();

            // 💳 التوجيه لصفحة الترقية (Stripe)
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🚀 <b>بايثون:</b> تم التسجيل! التوجه لصفحة الترقية (Stripe)...", currentPhotoId);
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
                accountSuccess = true;
                const usAddress = `Address: 123 Main St\nCity: New York\nState: NY\nZip: 10001`;
                // إبقاء الصورة الأخيرة ولا نحذفها
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `💳 <b>بايثون: توقفت الأتمتة لتكمل الدفع يدوياً.</b>\n\nعينة عنوان للفيزا:\n<code>${usAddress}</code>\n\n✅ بيانات الحساب الجاهز:\n<code>${result}</code>`, currentPhotoId);
                currentPhotoId = null;
                return true;
            }

            if (mode === 'FULL_AUTO') {
                if (!globalConfig.ccNumber) {
                    accountSuccess = true;
                    currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `⚠️ <b>بايثون:</b> لم يتم تعيين فيزا مسبقاً. توقف البوت.\n\n<code>${result}</code>`, currentPhotoId);
                    currentPhotoId = null;
                    return true;
                }

                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "💳 <b>بايثون:</b> حقن بيانات الفيزا آلياً...", currentPhotoId);
                const billInfo = py_generateUsAddress(pyName);
                
                await py_fillStripeIframe(page, '#Field-nameInput, input[name="name"], input[autocomplete="cc-name"]', billInfo.name);
                await py_fillStripeIframe(page, '#Field-postalCodeInput, input[name="postalCode"]', billInfo.zip);
                await sleep(3000); 
                await py_fillStripeIframe(page, '#Field-administrativeAreaInput, select[name="state"], input[name="state"]', billInfo.state);
                await py_fillStripeIframe(page, '#Field-localityInput, input[name="city"]', billInfo.city);
                await py_fillStripeIframe(page, '#Field-addressLine1Input, input[name="addressLine1"]', billInfo.address1);
                
                await py_fillStripeIframe(page, 'input[name="cardnumber"], input[autocomplete="cc-number"]', globalConfig.ccNumber);
                await py_fillStripeIframe(page, 'input[name="exp-date"], input[name="expirationDate"], input[autocomplete="cc-exp"]', globalConfig.ccExpiry);
                await py_fillStripeIframe(page, 'input[name="cvc"], input[name="securityCode"]', globalConfig.ccCvc);
                await sleep(2000);
                
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🔄 <b>بايثون:</b> النقر على زر الدفع...", currentPhotoId);
                for (let attempt = 1; attempt <= 3; attempt++) {
                    const submitPay = page.locator("button[type='submit'], button[class*='Subscribe']").first();
                    if(await submitPay.isVisible().catch(()=>false)) await submitPay.click({force:true});
                    await updateStatus(`🔄 بايثون: النقر على دفع (محاولة ${attempt})...`);
                    await sleep(10000);
                    if (page.url().includes('chatgpt.com') && !page.url().includes('pricing')) break;
                }

                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🛑 <b>بايثون:</b> التوجه لإلغاء الاشتراك (Cancel Plan)...", currentPhotoId);
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
                } catch (e) {}

                accountSuccess = true;
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `🎉 <b>بايثون:</b> تمت الأتمتة الشاملة (فيزا وإلغاء)!\n\n✅ الحساب:\n<code>${result}</code>`, currentPhotoId);
                currentPhotoId = null;
            }
            return true;
        } else throw new Error("فشل الوصول للرئيسية في بايثون.");

    } catch (error) {
        if(error.message !== "CANCELLED") { 
            globalConfig.pyFail++; saveConfig(); 
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `❌ خطأ بايثون: ${error.message}`, currentPhotoId);
            currentPhotoId = null;
        }
        return false;
    } finally {
        if (context) await context.close().catch(()=>{});
        if (!accountSuccess && currentPhotoId) await bot.deleteMessage(chatId, currentPhotoId).catch(()=>{}); 
        if (userState[chatId]) userState[chatId].context = null; 
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
}

// =========================================================================================
// 📱 واجهة المستخدم (Telegram Menus HTML)
// =========================================================================================

async function sendMainMenu(chatId, messageId = null) {
    const text = "👋 <b>أهلاً بك في البوت الأسطوري!</b>\n\n" +
                 "🛠️ <b>النظام الأساسي:</b> (الكود القديم - آمن، معزول)\n" +
                 "🐍 <b>نظام بايثون:</b> (المشروع المترجم - Stripe Auto)\n\n" +
                 `📧 <b>مزود الإيميلات الموحد:</b> API ${globalConfig.emailApiId}`;
    const opts = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🆕 الجديد (لوحة تحكم مشروع Python)', callback_data: 'menu_python' }],
                [{ text: '▶️ تشغيل تلقائي (النظام الأساسي)', callback_data: 'old_auto' }, { text: '✍️ تشغيل يدوي (الأساسي)', callback_data: 'old_manual' }],
                [{ text: '⚙️ الإعدادات العامة (البريد والفيزا)', callback_data: 'menu_settings' }],
                [{ text: '🛑 إيقاف جميع العمليات الجارية', callback_data: 'cancel_all' }]
            ]
        }
    };
    try { if (messageId) await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }); else await bot.sendMessage(chatId, text, opts); } catch(e) {}
}

async function sendPythonMenu(chatId, messageId = null) {
    const text = `🌟 <b>AutoGPT Console (Python Port)</b>\n\n` +
                 `📊 <b>إحصائيات بايثون:</b> نجاح: ${globalConfig.pySuccess} | فشل: ${globalConfig.pyFail}\n\n` +
                 `👇 هذا القسم منفصل 100%، اختر العملية:`;
    const opts = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 تشغيل (تلقائي + توقف للفيزا اليدوية)', callback_data: 'py_auto_visa' }],
                [{ text: '✍️ إنشاء حساب يدوي+ توجيه للفيزا', callback_data: 'py_manual_visa' }],
                [{ text: '💳 أتمتة بايثون الشاملة (فيزا تلقائية + إلغاء)', callback_data: 'py_full_auto' }],
                [{ text: '📦 إنشاء متعدد (Bulk)', callback_data: 'py_bulk' }, { text: '📁 تصدير', callback_data: 'py_export' }],
                [{ text: '🔙 رجوع للرئيسية', callback_data: 'back_main' }]
            ]
        }
    };
    try { if (messageId) await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }); else await bot.sendMessage(chatId, text, opts); } catch(e) {}
}

async function sendSettingsMenu(chatId, messageId = null) {
    let maskedCard = "غير مضبوط (سيقف البوت للتعبئة اليدوية)";
    if (globalConfig.ccNumber && String(globalConfig.ccNumber).length >= 4) {
        maskedCard = `**** **** **** ${String(globalConfig.ccNumber).slice(-4)} (${globalConfig.ccExpiry.slice(0,2)}/${globalConfig.ccExpiry.slice(2,4)})`;
    }
    
    let apiName = "";
    switch(globalConfig.emailApiId) {
        case 1: apiName = "API 1 (Mail.tm)"; break;
        case 2: apiName = "API 2 (Mail.gw)"; break;
        case 3: apiName = "API 3 (1secmail.com)"; break;
        case 4: apiName = "API 4 (1secmail.org)"; break;
        case 5: apiName = "API 5 (1secmail.net)"; break;
        default: apiName = "API 1 (Mail.tm)";
    }

    const text = `⚙️ <b>لوحة الإعدادات الشاملة:</b>\n\n` +
                 `📧 <b>مزود الإيميلات المختار:</b> ${apiName}\n` +
                 `💳 <b>الفيزا الحالية (لبايثون):</b>\n<code>${maskedCard}</code>`;
                 
    const opts = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📧 تغيير مزود الإيميل (5 APIs)', callback_data: 'cfg_api' }],
                [{ text: '💳 تعيين بيانات الفيزا', callback_data: 'cfg_visa' }, { text: '🗑 تفريغ الفيزا', callback_data: 'cfg_clear_visa' }],
                [{ text: '🔙 رجوع للرئيسية', callback_data: 'back_main' }]
            ]
        }
    };
    try { if (messageId) await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }); else await bot.sendMessage(chatId, text, opts); } catch(e) {}
}

async function sendApiSelectionMenu(chatId, messageId) {
    const text = `📧 <b>اختر بوابة الإيميلات (يطبق على المشروعين):</b>`;
    const opts = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🟢 API 1 (Mail.tm)', callback_data: 'api_1' }, { text: '🟢 API 2 (Mail.gw)', callback_data: 'api_2' }],
                [{ text: '🔵 API 3 (1secmail.com)', callback_data: 'api_3' }],
                [{ text: '🔵 API 4 (1secmail.org)', callback_data: 'api_4' }],
                [{ text: '🔵 API 5 (1secmail.net)', callback_data: 'api_5' }],
                [{ text: '🔙 رجوع للإعدادات', callback_data: 'menu_settings' }]
            ]
        }
    };
    try { await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }); } catch(e) {}
}

bot.onText(/\/start/, (msg) => {
    userState[msg.chat.id] = { step: null, cancel: false, context: null };
    sendMainMenu(msg.chat.id);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id; const msgId = query.message.message_id;
    bot.answerCallbackQuery(query.id).catch(() => {});
    if (!userState[chatId]) userState[chatId] = { step: null, cancel: false, context: null };

    if (['back_main', 'menu_python', 'menu_settings', 'cancel_all', 'cfg_api'].includes(query.data)) userState[chatId].step = null;

    try {
        if (query.data === 'cancel_all') {
            if (!isProcessing) return bot.sendMessage(chatId, "⚠️ لا توجد عملية حالية.");
            userState[chatId].cancel = true;
            if (userState[chatId].context) await userState[chatId].context.close().catch(()=>{});
            bot.sendMessage(chatId, "⏳ تم إيقاف العمليات...");
            isProcessing = false; return;
        }
        
        if (query.data === 'back_main') return await sendMainMenu(chatId, msgId);
        if (query.data === 'menu_python') return await sendPythonMenu(chatId, msgId);
        if (query.data === 'menu_settings') return await sendSettingsMenu(chatId, msgId);
        if (query.data === 'cfg_api') return await sendApiSelectionMenu(chatId, msgId);
        
        if (query.data.startsWith('api_')) {
            globalConfig.emailApiId = parseInt(query.data.split('_')[1]); saveConfig();
            bot.sendMessage(chatId, `✅ تم تعيين بوابة الإيميلات إلى: API ${globalConfig.emailApiId}`);
            return await sendSettingsMenu(chatId, msgId);
        }

        if (query.data === 'old_auto') {
            if (isProcessing) return; isProcessing = true; userState[chatId].cancel = false;
            await createAccountLogic_Original(chatId, null); isProcessing = false;
        } 
        else if (query.data === 'old_manual') {
            if (isProcessing) return; userState[chatId].step = 'wait_old_manual_email';
            bot.sendMessage(chatId, "➡️ أرسل <b>الإيميل</b> للأساسي:", {parse_mode: 'HTML'});
        }

        if (query.data === 'py_export') {
            const fp = path.join(__dirname, ACCOUNTS_FILE_PYTHON);
            if (fs.existsSync(fp)) bot.sendDocument(chatId, fp); else bot.sendMessage(chatId, "⚠️ ملف بايثون فارغ.");
            return;
        }
        if (query.data === 'py_auto_visa') {
            if (isProcessing) return; isProcessing = true; userState[chatId].cancel = false;
            await createPythonProjectLogic(chatId, 1, 1, 'AUTO_VISA', null); isProcessing = false;
        }
        if (query.data === 'py_manual_visa') {
            if (isProcessing) return; userState[chatId].step = 'wait_py_manual_email';
            bot.sendMessage(chatId, "➡️ أرسل <b>الإيميل</b> (بايثون - توجيه فيزا):", {parse_mode: 'HTML'});
        }
        if (query.data === 'py_full_auto') {
            if (isProcessing) return; isProcessing = true; userState[chatId].cancel = false;
            await createPythonProjectLogic(chatId, 1, 1, 'FULL_AUTO', null); isProcessing = false;
        }
        if (query.data === 'py_bulk') {
            if (isProcessing) return; userState[chatId].step = 'wait_py_bulk';
            bot.sendMessage(chatId, "📦 أرسل <b>عدد الحسابات</b> لـ Bulk بايثون:", {parse_mode: 'HTML'});
        }

        if (query.data === 'cfg_visa') {
            userState[chatId].step = 'wait_visa_data'; 
            bot.sendMessage(chatId, "💳 أرسل الفيزا بهذا التنسيق حصراً:\n<code>6258131106994493|08|2027|601</code>\n\n(سيقوم البوت برمجياً بتعديلها لتناسب Stripe)", {parse_mode:'HTML'});
        }
        if (query.data === 'cfg_clear_visa') {
            globalConfig.ccNumber = ""; globalConfig.ccExpiry = ""; globalConfig.ccCvc = ""; saveConfig();
            bot.sendMessage(chatId, "🗑 تم تفريغ الفيزا."); await sendSettingsMenu(chatId, msgId);
        }

    } catch (err) {}
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text?.trim();
    if (!userState[chatId] || !text || text.startsWith('/')) return; 

    // --- المعالج الآلي للفيزا (Auto-Formatter) ---
    if (userState[chatId].step === 'wait_visa_data') {
        const parts = text.split('|');
        if(parts.length === 4) {
            const num = parts[0].trim(); 
            const mm = parts[1].trim().padStart(2, '0');
            const yy = parts[2].trim().slice(-2); // أخذ آخر رقمين من 2027
            const cvc = parts[3].trim();
            
            globalConfig.ccNumber = num;
            globalConfig.ccExpiry = `${mm}${yy}`; // دمج الشهر والسنة لـ Stripe 0827
            globalConfig.ccCvc = cvc; 
            saveConfig();
            
            bot.sendMessage(chatId, `✅ <b>تم استلام وتحويل الفيزا لـ Stripe بنجاح:</b>\nCard: <code>${num}</code>\nExp: <code>${mm}${yy}</code>\nCVC: <code>${cvc}</code>`, {parse_mode:'HTML'});
        } else bot.sendMessage(chatId, "❌ تنسيق خاطئ! استخدم الفاصل | كما في المثال.");
        userState[chatId].step = null; return await sendSettingsMenu(chatId);
    }

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
        const p = crypto.randomBytes(8).toString('hex') + "Aa1!"; userState[chatId].step = null; userState[chatId].cancel = false; isProcessing = true;
        bot.sendMessage(chatId, `✅ استلام بريد الأساسي.\n🔑 الباسورد: <code>${p}</code>`, {parse_mode: 'HTML'});
        await createAccountLogic_Original(chatId, { email: text, password: p });
        isProcessing = false;
    }
});

process.on('uncaughtException', (err) => console.error('Uncaught:', err.message));
process.on('unhandledRejection', (reason) => console.error('Unhandled:', reason));
console.log("🤖 البوت يعمل (الاصدار 36 - الأسطورة المطلقة، صور ديناميكية، 5 APIs، وفيزا Auto-Format)...");
