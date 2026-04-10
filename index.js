/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار 40 (Ultimate Studio Mode 👑)
 * ==========================================================
 * 🔴 بث حي مستمر: يرسل صورة كل ثانية ونصف ويحذف السابقة ليجعلك تواكب الحدث.
 * ✋ التدخل البشري التفاعلي: لا يوجد فشل صامت. يوقف التصوير ويسألك ماذا يضغط.
 * 📜 مسجل السكربت (Macro): يسجل كل حركاتك ويصدرها كملف TXT برمجي.
 * 🌐 محرك 5 APIs للإيميلات، ومحلل فيزا ذكي.
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
// 🔴 نظام البث الحي (Live Stream Engine)
// ==========================================
async function startLiveStream(chatId, page) {
    if (userState[chatId].isLiveStreamActive) return;
    userState[chatId].isLiveStreamActive = true;
    userState[chatId].streamMessageId = null;

    (async () => {
        while (userState[chatId] && userState[chatId].isLiveStreamActive && !page.isClosed()) {
            try {
                const p = path.join(__dirname, `live_${crypto.randomBytes(2).toString('hex')}.jpg`);
                // جودة 40 لضمان السرعة وعدم استهلاك باقة الإنترنت
                await page.screenshot({ path: p, type: 'jpeg', quality: 40 }).catch(()=>{});
                
                if (fs.existsSync(p)) {
                    const sent = await bot.sendPhoto(chatId, p, { caption: "🔴 <b>بث حي للشاشة (يتحدث تلقائياً)...</b>\nراقب العملية هنا.", parse_mode: 'HTML', disable_notification: true });
                    if (userState[chatId].streamMessageId) {
                        bot.deleteMessage(chatId, userState[chatId].streamMessageId).catch(()=>{});
                    }
                    userState[chatId].streamMessageId = sent.message_id;
                    fs.unlinkSync(p);
                }
            } catch (e) {}
            await sleep(1500); // إطار كل ثانية ونصف
        }
        if (userState[chatId]?.streamMessageId) bot.deleteMessage(chatId, userState[chatId].streamMessageId).catch(()=>{});
    })();
}

// ==========================================
// 🤖 النواة الذكية (مغلف الأوامر، الماكرو، والتحكم اليدوي)
// ==========================================
async function runAction(chatId, page, actionName, timeoutMs, actionFn, generatedCode) {
    if (userState[chatId]?.cancel) throw new Error("CANCELLED");
    
    if (generatedCode) userState[chatId].scriptLog.push(`  ${generatedCode}`);

    try {
        await Promise.race([
            actionFn(),
            new Promise((_, rej) => setTimeout(() => rej(new Error(`نفد الوقت (${timeoutMs/1000} ثواني)`)), timeoutMs))
        ]);
    } catch (error) {
        if (userState[chatId]?.cancel) throw new Error("CANCELLED");
        
        userState[chatId].isLiveStreamActive = false; // إيقاف البث الحي مؤقتاً
        
        const errPath = path.join(__dirname, `err_${crypto.randomBytes(2).toString('hex')}.jpg`);
        await page.screenshot({ path: errPath, quality: 70, type: 'jpeg' }).catch(()=>{});
        
        await bot.sendPhoto(chatId, errPath, {
            caption: `⚠️ <b>توقف السكربت! (تم منع الفشل الصامت)</b>\n\n` +
                     `الخطوة: <b>${actionName}</b>\nالسبب: <code>${error.message}</code>\n\n` +
                     `🛑 <b>أرسل الكلمة التي تريد الضغط عليها مباشرة هنا في الشات.</b>\n` +
                     `أو استخدم الأوامر التالية:\n` +
                     `✍️ <code>اكتب: النص</code> (للكتابة في الحقل)\n` +
                     `⌨️ <code>مفتاح: Enter</code> (لضغط زر كيبورد)\n` +
                     `⏭️ <code>تخطي</code> (لتجاوز المشكلة وإكمال العمل الآلي)\n` +
                     `📸 <code>صورة</code> (لطلب صورة حديثة للشاشة)\n` +
                     `✅ <code>انهاء</code> (لإيقاف العمل واستخراج السكربت txt)`,
            parse_mode: 'HTML'
        }).catch(()=>{});
        if(fs.existsSync(errPath)) fs.unlinkSync(errPath);

        userState[chatId].interactiveMode = true;
        
        while (userState[chatId].interactiveMode && !page.isClosed()) {
            if (userState[chatId]?.cancel) throw new Error("CANCELLED");
            
            userState[chatId].step = 'WAIT_MANUAL_COMMAND';
            const input = await new Promise(res => userState[chatId].manualResolve = res);
            
            if (input === 'انهاء') {
                userState[chatId].interactiveMode = false;
                throw new Error("STOPPED_BY_USER");
            }
            if (input === 'تخطي') {
                userState[chatId].scriptLog.push(`  // المستخدم تخطى خطوة: ${actionName}`);
                await bot.sendMessage(chatId, "⏭️ تم التخطي. جاري استئناف العمل الآلي وبدء الكاميرا...");
                userState[chatId].interactiveMode = false;
                break;
            }
            if (input === 'صورة') {
                const p = path.join(__dirname, `pic_${crypto.randomBytes(2).toString('hex')}.jpg`);
                await page.screenshot({ path: p, quality: 70, type: 'jpeg' }).catch(()=>{});
                await bot.sendPhoto(chatId, p, { caption: "📸 صورة الشاشة الحالية:" });
                if (fs.existsSync(p)) fs.unlinkSync(p);
                continue;
            }

            const waitMsg = await bot.sendMessage(chatId, "⏳ جاري تنفيذ أمرك...");
            try {
                if (input.startsWith('اكتب:')) {
                    const text = input.replace('اكتب:', '').trim();
                    await page.keyboard.type(text, { delay: 50 });
                    userState[chatId].scriptLog.push(`  await page.keyboard.type("${text.replace(/"/g, '\\"')}", { delay: 50 }); // أمر يدوي`);
                } else if (input.startsWith('مفتاح:')) {
                    const key = input.replace('مفتاح:', '').trim();
                    await page.keyboard.press(key);
                    userState[chatId].scriptLog.push(`  await page.keyboard.press("${key}"); // أمر يدوي`);
                } else {
                    const jsClick = await page.evaluate((t) => {
                        const els = Array.from(document.querySelectorAll('button, a, div, span, input, p'));
                        let target = els.find(el => el.innerText && el.innerText.trim().toLowerCase() === t.trim().toLowerCase() && el.offsetParent !== null);
                        if (!target) target = els.find(el => el.innerText && el.innerText.toLowerCase().includes(t.trim().toLowerCase()) && el.offsetParent !== null);
                        if (!target) target = els.find(el => (el.value?.toLowerCase().includes(t.toLowerCase()) || el.placeholder?.toLowerCase().includes(t.toLowerCase())) && el.offsetParent !== null);
                        if (target) { target.click(); return true; } return false;
                    }, input);
                    if (jsClick) {
                        userState[chatId].scriptLog.push(`  // تدخل يدوي: تم النقر الذكي على عنصر يحتوي "${input}"`);
                        userState[chatId].scriptLog.push(`  await page.evaluate((t) => { const els = Array.from(document.querySelectorAll('button, a, div, span, input, p')); let target = els.find(el => el.innerText && el.innerText.trim().toLowerCase() === t.trim().toLowerCase() && el.offsetParent !== null); if (!target) target = els.find(el => el.innerText && el.innerText.toLowerCase().includes(t.trim().toLowerCase()) && el.offsetParent !== null); if (!target) target = els.find(el => (el.value?.toLowerCase().includes(t.toLowerCase()) || el.placeholder?.toLowerCase().includes(t.toLowerCase())) && el.offsetParent !== null); if (target) target.click(); }, "${input.replace(/"/g, '\\"')}");`);
                    } else {
                        await bot.sendMessage(chatId, `❌ لم أجد كلمة "${input}" ظاهرة على الشاشة.`);
                    }
                }
                
                await sleep(1500); 
                const p2 = path.join(__dirname, `res_${crypto.randomBytes(2).toString('hex')}.jpg`);
                await page.screenshot({ path: p2, quality: 70, type: 'jpeg' }).catch(()=>{});
                await bot.sendPhoto(chatId, p2, { caption: `📸 النتيجة:\nإذا تم حل المشكلة أرسل <code>تخطي</code> لإكمال السكربت، أو أدخل أمر جديد.`, parse_mode: 'HTML' });
                if (fs.existsSync(p2)) fs.unlinkSync(p2);
                
            } catch (e) {
                await bot.sendMessage(chatId, `❌ خطأ التنفيذ: ${e.message}`);
            } finally {
                await bot.deleteMessage(chatId, waitMsg.message_id).catch(()=>{});
            }
        }
        
        userState[chatId].isLiveStreamActive = true; // استئناف البث عند تخطي المشكلة
        startLiveStream(chatId, page);
    }
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
function py_generateBirthday() { return { year: String(2000), month: "01", day: "01" }; }
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
    userState[chatId].scriptLog = [
        "// Auto-Generated Playwright Script - ChatGPT Bot Creator V40",
        "const { chromium } = require('playwright');",
        "(async () => {",
        "  const browser = await chromium.launch({ headless: false });",
        "  const context = await browser.newContext();",
        "  const page = await context.newPage();"
    ];

    const isManual = !!manualData; let emailData; let accountSuccess = false;
    if (isManual) { emailData = { email: manualData.email, password: manualData.password, apiId: 'MANUAL' }; } 
    else { emailData = await EmailManager.create(chatId, globalConfig.emailApiId, "[النظام الأساسي]"); if(!emailData) return false; }

    const chatGptPassword = isManual ? manualData.password : emailData.password; 
    const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_old_'));
    let context, page;

    try {
        context = await chromium.launchPersistentContext(tempDir, { headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
        if (userState[chatId]) userState[chatId].context = context; 
        page = await context.newPage();

        startLiveStream(chatId, page);

        await runAction(chatId, page, "فتح المتصفح", 60000, async () => {
            await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" });
            await sleep(4000);
        }, `  await page.goto("https://chatgpt.com/auth/login");`);

        await runAction(chatId, page, "الضغط على زر التسجيل", 15000, async () => {
            let clickedSignUp = false;
            const signUpSelectors = ['[data-testid="login-screen-signup"]', 'button:has-text("Sign up for free")', 'button:has-text("Sign up")', 'a:has-text("Sign up for free")'];
            for (const sel of signUpSelectors) {
                const btnLocator = page.locator(sel).first();
                if (await btnLocator.isVisible().catch(()=>false)) { await btnLocator.click().catch(()=>{}); clickedSignUp = true; break; }
            }
            if (!clickedSignUp) {
                const jsClick = await page.evaluate(() => { const btns = Array.from(document.querySelectorAll('button, a')); const target = btns.find(b => b.innerText && b.innerText.toLowerCase().includes('sign up') && b.offsetParent !== null); if (target) { target.click(); return true; } return false; }).catch(()=>{});
                if(!jsClick) throw new Error("لم أجد زر Sign up");
            }
            await sleep(4000);
        }, `  // Clicked Sign up`);

        await runAction(chatId, page, "كتابة الإيميل", 20000, async () => {
            const emailSelectors = 'input[name="email"], input[type="email"], input[autocomplete="email"]';
            await page.waitForSelector(emailSelectors);
            await page.locator(emailSelectors).first().fill(emailData.email);
            await page.locator('button:has-text("Continue"), button[type="submit"]').first().click();
            await sleep(3000);
        }, `  await page.locator('input[type="email"]').fill('${emailData.email}');\n  await page.locator('button:has-text("Continue")').click();`);

        await runAction(chatId, page, "كتابة الباسورد", 20000, async () => {
            await page.waitForSelector('input[type="password"]');
            await page.locator('input[type="password"]').first().fill(chatGptPassword);
            await page.locator('button:has-text("Continue"), button[type="submit"]').first().click();
            await sleep(6000);
        }, `  await page.locator('input[type="password"]').fill('${chatGptPassword}');\n  await page.locator('button:has-text("Continue")').click();`);

        let code = null;
        if (isManual) {
            bot.sendMessage(chatId, "🛑 الأساسي: أرسل الكود هنا في الشات...");
            code = await new Promise((res, rej) => {
                const listener = (msg) => { if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { bot.removeListener('message', listener); res(msg.text.trim()); } };
                bot.on('message', listener);
                const c = setInterval(()=>{ if(userState[chatId]?.cancel){ clearInterval(c); bot.removeListener('message', listener); rej(new Error("CANCELLED")); } }, 1000);
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
            else {
                const jsClick = await page.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.toLowerCase().includes('continue')); if (btn && !btn.disabled) { btn.click(); return true; } return false; }).catch(()=>false);
                if(!jsClick) await page.keyboard.press('Enter').catch(()=>{});
            }
            await sleep(5000);
        }, `  await page.keyboard.type('${code}');\n  await page.locator('button:has-text("Continue")').click();`);

        await runAction(chatId, page, "تعبئة الاسم والعمر", 25000, async () => {
            if (await page.locator('input[name="name"], input[autocomplete="name"]').isVisible().catch(()=>false)) {
                const nameInput = page.locator('input[name="name"], input[autocomplete="name"]').first();
                await nameInput.fill(''); await nameInput.pressSequentially(fullName, { delay: 60 }); await sleep(1000);

                const isAgeFormat = await page.locator('text=/How old are you/i').isVisible().catch(()=>false);
                const ageInput = page.locator('input[name="age"], input[id="age"], input[placeholder*="Age"]').first();
                const randomAge = String(Math.floor(Math.random() * 15) + 20); 

                if (await ageInput.isVisible().catch(()=>false)) { await ageInput.click(); await page.keyboard.press('Control+A'); await ageInput.pressSequentially(randomAge, { delay: 60 }); } 
                else if (isAgeFormat) { await nameInput.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await page.keyboard.type(randomAge, { delay: 60 }); } 
                else { const bdayInput = page.locator('input[name="birthday"]').first(); if (await bdayInput.isVisible().catch(()=>false)) { await bdayInput.click(); await page.keyboard.press('Control+A'); await page.keyboard.type("01012000", { delay: 100 }); } else { await nameInput.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await page.keyboard.type("01012000", { delay: 100 }); } }
                
                const finishBtn = page.locator('button:has-text("Finish"), button:has-text("Continue"), button[type="submit"]').last();
                if (await finishBtn.isVisible().catch(()=>false)) { await finishBtn.click(); } else { await page.keyboard.press('Enter'); }
                await sleep(8000);
            }
        }, `  // Filled Name and Age`);

        await runAction(chatId, page, "انتظار الصفحة الرئيسية", 30000, async () => { await page.waitForURL('**/chat'); }, `  // Reached Chat page`);

        if (page.url().includes('/chat') || await page.locator('#prompt-textarea').isVisible().catch(()=>false)) {
            const result = `${emailData.email}|${chatGptPassword}`;
            fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE_OLD), result + '\n');
            accountSuccess = true;
            bot.sendMessage(chatId, `🎉 <b>تم الدخول بنجاح! (النظام الأساسي)</b>\n\n<code>${result}</code>`, {parse_mode: 'HTML'});
        } else { throw new Error("لم يتم الوصول للرئيسية."); }
    } catch (e) {
        if (e.message !== "CANCELLED" && e.message !== "STOPPED_BY_USER") bot.sendMessage(chatId, `❌ خطأ الأساسي تم إنهاؤه.`);
    } finally {
        userState[chatId].isLiveStreamActive = false; 
        if (context) await context.close().catch(()=>{});
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
        
        if (userState[chatId].scriptLog && userState[chatId].scriptLog.length > 6) {
            userState[chatId].scriptLog.push("  // await browser.close();\n})();");
            const scriptPath = path.join(__dirname, `MacroScript_${Date.now()}.txt`);
            fs.writeFileSync(scriptPath, userState[chatId].scriptLog.join('\n'));
            await bot.sendDocument(chatId, scriptPath, { caption: "📜 <b>ملف الأتمتة التلقائي (RPA Tool):</b>\nيحتوي على الأكواد للحركات الآلية واليدوية التي قمت بها.", parse_mode: 'HTML' }).catch(()=>{});
            fs.unlinkSync(scriptPath);
        }
    }
}

// 🟦=======================================================================🟦
//                 القسم الثاني: مشروع Python المستقل
// 🟦=======================================================================🟦
async function createPythonProjectLogic(chatId, currentNum, total, mode, manualData = null) {
    userState[chatId].scriptLog = [
        "// Auto-Generated Playwright Script - ChatGPT Bot Creator V40",
        "const { chromium } = require('playwright');",
        "(async () => {",
        "  const browser = await chromium.launch({ headless: false });",
        "  const context = await browser.newContext();",
        "  const page = await context.newPage();"
    ];

    const isManualEmail = (mode === 'MANUAL_VISA');
    let emailData; let password = isManualEmail ? manualData.password : py_generatePassword();

    if (isManualEmail) { emailData = { email: manualData.email, password: password, apiId: 'MANUAL' }; } 
    else { emailData = await EmailManager.create(chatId, globalConfig.emailApiId, "[بايثون]"); if(!emailData) return false; }

    const pyName = `${faker.person.firstName()} ${faker.person.lastName()}`;
    const pyDOB = py_generateBirthday();
    const tempDir = fs.mkdtempSync(path.join(__dirname, 'wrk_py_'));
    let context, page; let accountSuccess = false;

    try {
        const browserOptions = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] };
        context = await chromium.launchPersistentContext(tempDir, browserOptions);
        userState[chatId].context = context; 
        page = await context.newPage();

        startLiveStream(chatId, page);

        await runAction(chatId, page, "تخطي WebGL وفتح الموقع", 60000, async () => {
            await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', {get: () => undefined}); });
            await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" });
            
            if (await page.title().then(t => t.includes('Just a moment') || t.includes('Ray ID') || t.includes('请稍候'))) {
                await sleep(6000);
                for (const f of page.frames()) { const cb = f.locator("#checkbox, .checkbox, #challenge-stage").first(); if (await cb.isVisible().catch(()=>false)) { await cb.click({force: true}); await sleep(5000); } }
            }
            await sleep(4000);
        }, `  await page.goto("https://chatgpt.com/auth/login");`);

        await runAction(chatId, page, "الضغط على زر التسجيل", 15000, async () => {
            let clickedSignUpPy = false;
            const signUpSelectorsPy = ['[data-testid="login-screen-signup"]', 'button:has-text("Sign up for free")', 'button:has-text("Sign up")', 'button:has-text("注册")'];
            for (const sel of signUpSelectorsPy) {
                const btnLocator = page.locator(sel).first();
                if (await btnLocator.isVisible().catch(()=>false)) { await btnLocator.click().catch(()=>{}); clickedSignUpPy = true; break; }
            }
            if (!clickedSignUpPy) {
                const jsClick = await page.evaluate(() => { const btns = Array.from(document.querySelectorAll('button, a')); const target = btns.find(b => b.innerText && /sign up|注册/i.test(b.innerText) && b.offsetParent !== null); if (target) { target.click(); return true; } return false; }).catch(()=>{});
                if(!jsClick) throw new Error("لم أجد زر Sign up");
            }
            await sleep(4000);
        }, `  // Clicked Sign up`);

        await runAction(chatId, page, "كتابة الإيميل", 20000, async () => {
            const emailSelectorsPy = 'input[name="email"], input[type="email"], input[autocomplete="email"]';
            await page.waitForSelector(emailSelectorsPy);
            const emailInput = page.locator(emailSelectorsPy).first();
            await emailInput.focus(); await emailInput.pressSequentially(emailData.email, { delay: 60 });
            await page.locator('button:has-text("Continue"), button[type="submit"]').first().click();
            await sleep(3000);
        }, `  await page.locator('input[type="email"]').fill('${emailData.email}');\n  await page.locator('button:has-text("Continue")').click();`);

        await runAction(chatId, page, "كتابة الباسورد", 20000, async () => {
            await page.waitForSelector('input[type="password"]');
            const passInput = page.locator('input[type="password"]').first();
            await passInput.focus(); await passInput.pressSequentially(password, { delay: 60 });
            await page.locator('button:has-text("Continue"), button[type="submit"]').first().click();
            await sleep(6000);
        }, `  await page.locator('input[type="password"]').fill('${password}');\n  await page.locator('button:has-text("Continue")').click();`);

        let code = null;
        if (isManualEmail) {
            bot.sendMessage(chatId, "🛑 بايثون: أرسل الكود هنا في الشات...");
            code = await new Promise((res, rej) => {
                const listener = (msg) => { if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { bot.removeListener('message', listener); res(msg.text.trim()); } };
                bot.on('message', listener);
                const c = setInterval(()=>{ if(userState[chatId]?.cancel){ clearInterval(c); bot.removeListener('message', listener); rej(new Error("CANCELLED")); } }, 1000);
            });
        } else { code = await EmailManager.waitForCode(emailData, chatId, "[بايثون]"); }
        if (!code) throw new Error("لم يتم استلام كود بايثون.");

        await runAction(chatId, page, `إدخال الكود (${code})`, 25000, async () => {
            const codeInputPy = page.locator('input[name="code"], input[inputmode="numeric"]').first();
            if (await codeInputPy.isVisible().catch(()=>false)) { await codeInputPy.focus(); await codeInputPy.pressSequentially(code, { delay: 150 }); } 
            else { await page.keyboard.type(code, { delay: 150 }); }
            await sleep(2000);
            
            const continueBtnLocatorPy = page.locator('button:has-text("Continue"), button[type="submit"]').first();
            if (await continueBtnLocatorPy.isVisible().catch(()=>false) && await continueBtnLocatorPy.isEnabled().catch(()=>false)) { await continueBtnLocatorPy.click().catch(()=>{}); } 
            else {
                const jsClick = await page.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.toLowerCase().includes('continue')); if (btn && !btn.disabled) { btn.click(); return true; } return false; }).catch(()=>false);
                if(!jsClick) await page.keyboard.press('Enter').catch(()=>{});
            }
            await sleep(5000);
        }, `  await page.keyboard.type('${code}');\n  await page.locator('button:has-text("Continue")').click();`);

        await runAction(chatId, page, "الاسم والعمر", 25000, async () => {
            if (await page.locator('input[name="name"], input[autocomplete="name"]').isVisible().catch(()=>false)) {
                const nameInput = page.locator('input[name="name"], input[autocomplete="name"]').first();
                await nameInput.fill(''); await nameInput.pressSequentially(pyName, { delay: 60 }); await sleep(1000);
                
                const isAgeFormat = await page.locator('text=/How old are you/i').isVisible().catch(()=>false);
                const ageInput = page.locator('input[name="age"], input[id="age"], input[placeholder*="Age"], [data-testid="age-input"]').first();
                const calculatedAge = String(new Date().getFullYear() - parseInt(pyDOB.year)); 

                if (await ageInput.isVisible().catch(()=>false)) { await ageInput.click(); await page.keyboard.press('Control+A'); await ageInput.pressSequentially(calculatedAge, { delay: 60 }); } 
                else if (isAgeFormat) { await nameInput.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await page.keyboard.type(calculatedAge, { delay: 60 }); } 
                else { const yearInput = page.locator('[data-type="year"]').first(); if (await yearInput.isVisible().catch(()=>false)) { await yearInput.click(); await page.keyboard.press('Control+A'); await yearInput.pressSequentially(pyDOB.year, {delay: 60}); const monthInput = page.locator('[data-type="month"]').first(); await monthInput.click(); await page.keyboard.press('Control+A'); await monthInput.pressSequentially(pyDOB.month, {delay: 60}); const dayInput = page.locator('[data-type="day"]').first(); await dayInput.click(); await page.keyboard.press('Control+A'); await dayInput.pressSequentially(pyDOB.day, {delay: 60}); } else { await nameInput.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await page.keyboard.type(`${pyDOB.month}${pyDOB.day}${pyDOB.year}`, { delay: 60 }); } }

                const finishBtn = page.locator('button:has-text("Finish"), button:has-text("Continue"), button[type="submit"]').last();
                if (await finishBtn.isVisible().catch(()=>false)) { await finishBtn.click(); } else { await page.keyboard.press('Enter'); }
                await sleep(8000);
            }
        }, `  // Filled Name and Age`);

        await runAction(chatId, page, "انتظار الصفحة الرئيسية", 30000, async () => { await page.waitForURL('**/chat'); }, `  // Reached Chat page`);

        const result = `${emailData.email}|${password}|${pyDOB.year}-${pyDOB.month}-${pyDOB.day}`;
        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE_PYTHON), result + '\n');
        globalConfig.pySuccess++; saveConfig();

        if (mode === 'AUTO_VISA' || mode === 'MANUAL_VISA' || mode === 'FULL_AUTO') {
            await runAction(chatId, page, "توجيه Stripe", 30000, async () => {
                await page.goto("https://chatgpt.com/#pricing", { waitUntil: "domcontentloaded" });
                await sleep(5000);
                const guides = page.locator('button:has-text("Next"), button:has-text("Okay"), button:has-text("Done")');
                const gc = await guides.count(); for(let i=0; i<gc; i++) { await guides.nth(i).click({force:true}).catch(()=>{}); await sleep(500); }

                let clicked = false;
                for(let xp of ['//div[contains(., "Plus")]//button[contains(., "Start trial") or contains(., "Upgrade")]', '//button[contains(., "Upgrade to Plus")]']) { const btn = page.locator(xp).first(); if(await btn.isVisible().catch(()=>false)) { await btn.scrollIntoViewIfNeeded().catch(()=>{}); await btn.click({force:true}); clicked = true; break; } }
                if(!clicked) throw new Error("لم يتم العثور على زر الترقية.");
                await sleep(12000); 
            }, `  // Reached Stripe Checkoout`);
            
            if (mode === 'AUTO_VISA' || mode === 'MANUAL_VISA') {
                accountSuccess = true;
                bot.sendMessage(chatId, `💳 <b>بايثون: توقفت الأتمتة لتكمل الدفع يدوياً.</b>\n\n✅ الحساب:\n<code>${result}</code>`, {parse_mode:'HTML'}); return true;
            }

            if (mode === 'FULL_AUTO') {
                if (!globalConfig.ccNumber) { accountSuccess = true; bot.sendMessage(chatId, `⚠️ <b>بايثون:</b> لم يتم تعيين فيزا.\n\n<code>${result}</code>`, {parse_mode:'HTML'}); return true; }

                await runAction(chatId, page, "حقن الفيزا والدفع وإلغاء الاشتراك", 90000, async () => {
                    const billInfo = py_generateUsAddress(pyName);
                    await py_fillStripeIframe(page, '#Field-nameInput, input[name="name"], input[autocomplete="cc-name"]', billInfo.name, chatId);
                    await py_fillStripeIframe(page, '#Field-postalCodeInput, input[name="postalCode"]', billInfo.zip, chatId);
                    await sleep(3000); 
                    await py_fillStripeIframe(page, 'input[name="cardnumber"], input[autocomplete="cc-number"]', globalConfig.ccNumber, chatId);
                    await py_fillStripeIframe(page, 'input[name="exp-date"], input[name="expirationDate"], input[autocomplete="cc-exp"]', globalConfig.ccExpiry, chatId);
                    await py_fillStripeIframe(page, 'input[name="cvc"], input[name="securityCode"]', globalConfig.ccCvc, chatId);
                    await sleep(2000);
                    
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        const submitPay = page.locator("button[type='submit'], button[class*='Subscribe']").first();
                        if(await submitPay.isVisible().catch(()=>false)) await submitPay.click({force:true});
                        await sleep(10000);
                        if (page.url().includes('chatgpt.com') && !page.url().includes('pricing')) break;
                    }

                    await page.goto("https://chatgpt.com", {timeout: 30000}).catch(()=>{}); await sleep(6000);
                    
                    try {
                        await page.locator('div[data-testid="user-menu"]').first().click({force:true}).catch(()=>{}); await sleep(2000);
                        const myPlan = page.locator('//*[contains(text(), "My plan")]').first();
                        if (await myPlan.isVisible().catch(()=>false)) await myPlan.click({force: true});
                        else { await page.locator('//div[contains(text(), "Settings")]').first().click({force:true}).catch(()=>{}); await sleep(2000); await page.locator('//button[contains(., "Manage")]').first().click({force:true}).catch(()=>{}); }
                        await sleep(5000);
                        for (const xp of ['//*[contains(text(), "Cancel subscription")]', '//button[contains(., "Cancel plan")]']) { const btn = page.locator(xp).first(); if (await btn.isVisible().catch(()=>false)) { await btn.click({force: true}); await sleep(2000); break; } }
                        await page.locator('//button[contains(., "Cancel") or contains(., "Confirm")]').first().click({force:true}).catch(()=>{});
                    } catch (e) {}
                }, `  // Handled Stripe and Cancellation`);

                accountSuccess = true; bot.sendMessage(chatId, `🎉 <b>تمت الأتمتة الشاملة بنجاح!</b>\n\n✅ الحساب:\n<code>${result}</code>`, {parse_mode:'HTML'});
            }
            return true;
        } else { accountSuccess = true; bot.sendMessage(chatId, `🎉 <b>بايثون: تم إنشاء الحساب بنجاح!</b>\n\n✅ الحساب:\n<code>${result}</code>`, {parse_mode:'HTML'}); }

    } catch (error) {
        if(error.message !== "CANCELLED" && error.message !== "STOPPED_BY_USER") { globalConfig.pyFail++; saveConfig(); bot.sendMessage(chatId, `❌ خطأ بايثون تم إنهاؤه.`); }
        return false;
    } finally {
        userState[chatId].isLiveStreamActive = false; // stop stream
        if (context) await context.close().catch(()=>{});
        if (userState[chatId]) userState[chatId].context = null; 
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
        
        if (userState[chatId].scriptLog && userState[chatId].scriptLog.length > 6) {
            userState[chatId].scriptLog.push("  // await browser.close();\n})();");
            const scriptPath = path.join(__dirname, `MacroScript_${Date.now()}.txt`);
            fs.writeFileSync(scriptPath, userState[chatId].scriptLog.join('\n'));
            await bot.sendDocument(chatId, scriptPath, { caption: "📜 <b>ملف الأتمتة التلقائي:</b>\nيحتوي على الأكواد للحركات الآلية واليدوية التي قمت بها.", parse_mode: 'HTML' }).catch(()=>{});
            fs.unlinkSync(scriptPath);
        }
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
            userState[chatId].cancel = true;
            userState[chatId].isLiveStreamActive = false;
            if (userState[chatId].manualResolve) {
                userState[chatId].manualResolve('انهاء');
            }
            if (userState[chatId].context) await userState[chatId].context.close().catch(()=>{});
            bot.sendMessage(chatId, "⏳ تم إيقاف جميع العمليات...");
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
            bot.sendMessage(chatId, "💳 أرسل الفيزا بهذا التنسيق حصراً:\n<code>6258131106994493|08|2027|601</code>", {parse_mode:'HTML'});
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

    // اعتراض أمر التحكم اليدوي (Studio Mode)
    if (userState[chatId].step === 'WAIT_MANUAL_COMMAND') {
        if (userState[chatId].manualResolve) {
            userState[chatId].manualResolve(text);
        }
        return;
    }

    if (userState[chatId].step === 'wait_visa_data') {
        const parts = text.split('|');
        if(parts.length === 4) {
            const num = parts[0].trim(); const mm = parts[1].trim().padStart(2, '0'); const yy = parts[2].trim().slice(-2); const cvc = parts[3].trim();
            globalConfig.ccNumber = num; globalConfig.ccExpiry = `${mm}${yy}`; globalConfig.ccCvc = cvc; saveConfig();
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
console.log("🤖 البوت يعمل (الاصدار 40 الأسطوري - بث حي، تحكم تفاعلي ذكي، ومسجل أدوات)...");
