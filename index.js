/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار المطور (2FA + تحكم تفاعلي)
 * ==========================================================
 * - إزالة زر "الجديد" ومحتوياته بالكامل.
 * - دعم المصادقة الثنائية (2FA) التلقائية بعد النجاح اليدوي.
 * - ربط كود الـ 32 حرف مع موقع https://2fa.fb.tools/ وجلب الـ 6 أرقام.
 * - تصوير كل الخطوات وإرسالها لك بدون توقف.
 * - وضع تحكم تفاعلي ذكي (أرقام شفافة للماوس، ادخال نص، انتر).
 * - تسجيل تقرير دقيق جداً بالملي ثانية وإرساله كملف TXT.
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

// التوكين الخاص بك
const BOT_TOKEN = process.env.BOT_TOKEN || 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة';

if (!BOT_TOKEN || BOT_TOKEN === 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة') {
    console.error("❌ خطأ: BOT_TOKEN مفقود.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const ACCOUNTS_FILE = 'accounts.txt';
let isProcessing = false;
let activeProxy = null;

// حفظ حالة كل مستخدم للتحكم والتتبع
const userState = {};

const MAIL_API = 'https://api.mail.tm';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ================= نظام السجل الدقيق (Logger) =================
class ScriptLogger {
    constructor() {
        this.logs = [];
    }
    log(action) {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
        this.logs.push(`[${timeStr}] - ${action}`);
        console.log(`[${timeStr}] ${action}`);
    }
    getLogs() {
        return this.logs.join('\n');
    }
}

// ================= دوال مساعدة =================
function generateSecurePassword() {
    const length = 16;
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const nums = "0123456789";
    const symbols = "!@#$%^&*";
    const all = lower + upper + nums + symbols;

    let password = "";
    password += lower[crypto.randomInt(0, lower.length)];
    password += upper[crypto.randomInt(0, upper.length)];
    password += nums[crypto.randomInt(0, nums.length)];
    password += symbols[crypto.randomInt(0, symbols.length)];

    for (let i = 0; i < length - 4; i++) password += all[crypto.randomInt(0, all.length)];
    return password.split('').sort(() => 0.5 - Math.random()).join('');
}

async function createMailTmAccount(chatId) {
    try {
        const domainsRes = await axios.get(`${MAIL_API}/domains`);
        const domains = domainsRes.data['hydra:member'] || [];
        if (domains.length === 0) throw new Error('لا توجد نطاقات متاحة');
        const domain = domains[Math.floor(Math.random() * domains.length)].domain;

        const username = faker.person.firstName().toLowerCase() + crypto.randomBytes(2).toString('hex');
        const email = `${username}@${domain}`;
        const password = generateSecurePassword();

        await bot.sendMessage(chatId, `📧 جاري إنشاء بريد: \`${email}\``, { parse_mode: 'Markdown' });

        await axios.post(`${MAIL_API}/accounts`, { address: email, password: password });
        const tokenRes = await axios.post(`${MAIL_API}/token`, { address: email, password: password });
        
        return { email, password, token: tokenRes.data.token };
    } catch (error) {
        throw new Error('تعذر إنشاء بريد مؤقت');
    }
}

async function fetchMailTmMessages(token) {
    try {
        const res = await axios.get(`${MAIL_API}/messages`, { headers: { Authorization: `Bearer ${token}` } });
        return res.data['hydra:member'] || [];
    } catch (error) { return []; }
}

async function waitForMailTmCode(email, token, chatId, maxWaitSeconds = 90) {
    const startTime = Date.now();
    const statusMsg = await bot.sendMessage(chatId, `⏳ في انتظار وصول كود التفعيل إلى البريد...`);

    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        if (userState[chatId] && userState[chatId].cancel) {
            await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
            throw new Error("CANCELLED_BY_USER");
        }

        const messages = await fetchMailTmMessages(token);
        for (const msg of messages) {
            const content = `${msg.subject || ''} ${msg.intro || ''}`;
            const codeMatch = content.match(/\b\d{6}\b/);
            if (codeMatch) {
                await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
                await bot.sendMessage(chatId, `📩 **تم استخراج الكود:** \`${codeMatch[0]}\``, { parse_mode: 'Markdown' });
                return codeMatch[0];
            }
        }
        await sleep(4000);
    }
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>null);
    return null;
}

async function sendStepPhotoAndCleanup(page, chatId, caption, previousPhotoId = null, logger = null) {
    try {
        if (logger) logger.log(`📸 التقاط صورة: ${caption.replace(/\n/g, ' ')}`);
        if (previousPhotoId) await bot.deleteMessage(chatId, previousPhotoId).catch(() => {});
        const screenshotPath = path.join(__dirname, `step_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        const sent = await bot.sendPhoto(chatId, screenshotPath, { caption: caption });
        if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
        return sent.message_id;
    } catch (err) {
        if (logger) logger.log(`⚠️ فشل التقاط الصورة: ${err.message}`);
        return previousPhotoId;
    }
}

async function reportErrorWithScreenshot(page, chatId, errorMessage, tempDir, logger = null) {
    if (errorMessage === "CANCELLED_BY_USER") return; 
    if (logger) logger.log(`❌ خطأ: ${errorMessage}`);
    await bot.sendMessage(chatId, `❌ خطأ: ${errorMessage}`);
    if (page) {
        try {
            const errPath = path.join(tempDir, `error_${Date.now()}.png`);
            await page.screenshot({ path: errPath, fullPage: true });
            await bot.sendPhoto(chatId, errPath, { caption: '📸 لقطة الخطأ' });
            if (fs.existsSync(errPath)) fs.unlinkSync(errPath);
        } catch (e) {}
    }
}

async function simulateHumanActivityFast(page) {
    try {
        await page.mouse.wheel(0, 300);
        await sleep(300);
        await page.mouse.move(500, 400, { steps: 3 });
    } catch (e) {}
}

// ================= نظام التحكم التفاعلي بالمتصفح =================
async function drawGridOnPage(page) {
    await page.evaluate(() => {
        if (document.getElementById('bot-grid-overlay')) return;
        const grid = document.createElement('div');
        grid.id = 'bot-grid-overlay';
        grid.style.position = 'fixed';
        grid.style.top = '0';
        grid.style.left = '0';
        grid.style.width = '100vw';
        grid.style.height = '100vh';
        grid.style.pointerEvents = 'none';
        grid.style.zIndex = '999999';
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(10, 1fr)';
        grid.style.gridTemplateRows = 'repeat(10, 1fr)';
        for (let i = 0; i < 100; i++) {
            const cell = document.createElement('div');
            cell.style.border = '1px solid rgba(255, 0, 0, 0.4)';
            cell.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            cell.style.color = 'red';
            cell.style.fontSize = '24px';
            cell.style.fontWeight = 'bold';
            cell.style.textShadow = '1px 1px 0px white, -1px -1px 0px white';
            cell.innerText = i.toString(); 
            grid.appendChild(cell);
        }
        document.body.appendChild(grid);
    });
}

async function sendInteractiveMenu(chatId, text = "🎮 **أنت الآن تتحكم بالمتصفح:**\nالبوت في وضع الاستعداد ولن يغلق إلا بموافقتك.") {
    const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🖱️ ضغط ماوس (شبكة شفافة)', callback_data: 'int_mouse' }, { text: '⌨️ كتابة نص', callback_data: 'int_type' }],
                [{ text: '↩️ انتر (Enter)', callback_data: 'int_enter' }, { text: '⏭️ تخطي', callback_data: 'int_skip' }],
                [{ text: '📸 تحديث الشاشة', callback_data: 'int_refresh' }],
                [{ text: '✅ إنهاء الجلسة وحفظ السجل', callback_data: 'int_finish' }]
            ]
        }
    };
    await bot.sendMessage(chatId, text, opts);
}

async function startInteractiveMode(chatId, page, context, tempDir, logger, currentPhotoId) {
    userState[chatId].isInteractive = true;
    userState[chatId].page = page;
    userState[chatId].context = context;
    userState[chatId].tempDir = tempDir;
    userState[chatId].logger = logger;
    userState[chatId].currentPhotoId = currentPhotoId;

    await sendInteractiveMenu(chatId);

    // تجميد العملية لحين إعطاء أمر "إنهاء"
    return new Promise(resolve => {
        userState[chatId].resolveInteractive = resolve;
    });
}

// ============================================================
// الدالة الرئيسية (إنشاء وتفعيل 2FA)
// ============================================================
async function createAccountLogic(chatId, currentNum, total, manualData = null) {
    const isManual = !!manualData;
    let modeText = isManual ? "(يدوي)" : "(تلقائي)";
    let statusMsgID = null;
    
    userState[chatId] = { step: null, cancel: false, isInteractive: false };
    const logger = new ScriptLogger();
    logger.log(`=== بدء عملية الإنشاء في وضع: ${modeText} ===`);

    const checkCancel = () => {
        if (userState[chatId] && userState[chatId].cancel) {
            logger.log("تم الإلغاء من قبل المستخدم.");
            throw new Error("CANCELLED_BY_USER");
        }
    };

    const updateStatus = async (text) => {
        checkCancel();
        logger.log(`الحالة: ${text}`);
        if (!statusMsgID) {
            const sent = await bot.sendMessage(chatId, `⚡ [${currentNum}/${total}] ${modeText}: ${text}`);
            statusMsgID = sent.message_id;
        } else {
            await bot.editMessageText(`⚡ [${currentNum}/${total}] ${modeText}: ${text}`, { chat_id: chatId, message_id: statusMsgID }).catch(()=>{});
        }
    };

    await updateStatus("بدء العملية...");
    const maxEmailAttempts = isManual ? 1 : 4; 
    let currentPhotoId = null; 

    for (let emailAttempt = 1; emailAttempt <= maxEmailAttempts; emailAttempt++) {
        checkCancel();
        let email, mailPassword, mailToken;
        
        if (isManual) {
            email = manualData.email;
            mailPassword = manualData.password;
        } else {
            try {
                const mailData = await createMailTmAccount(chatId);
                email = mailData.email;
                mailPassword = mailData.password;
                mailToken = mailData.token;
                logger.log(`بريد مؤقت جديد: ${email}`);
            } catch (e) { return false; }
        }

        const chatGptPassword = isManual ? manualData.password : generateSecurePassword(); 
        const fullName = `${faker.person.firstName()} ${faker.person.lastName()}`;

        await updateStatus(`جاري فتح المتصفح للإيميل:\n📧 \`${email}\``);

        const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_wrk_'));
        let context, page;
        let accountCreatedSuccessfully = false;
        let shouldRetryWithNewEmail = false;

        try {
            checkCancel();
            logger.log("إعداد خصائص المتصفح");
            const browserOptions = {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
                viewport: { width: 1366, height: 768 },
                timeout: 45000
            };
            if (activeProxy) browserOptions.proxy = { server: activeProxy.server };

            context = await chromium.launchPersistentContext(tempDir, browserOptions);
            userState[chatId].context = context; 
            
            page = await context.newPage();
            userState[chatId].page = page;

            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🌐 فتح المتصفح", currentPhotoId, logger);

            checkCancel();
            await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
            await simulateHumanActivityFast(page);

            const signupBtn = page.getByRole("button", { name: "Sign up" });
            await signupBtn.waitFor({ state: 'visible', timeout: 30000 }).catch(async () => {
                await page.locator('button:has-text("Sign up")').click();
            });
            checkCancel();
            await signupBtn.click();
            logger.log("الضغط على Sign up");
            
            await page.waitForSelector('input[name="email"], input[id="email-input"]', {timeout: 30000});
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `📝 إدخال الإيميل: ${email}`, currentPhotoId, logger);
            const emailInput = page.locator('input[name="email"], input[id="email-input"]').first();
            await emailInput.fill(email);
            await sleep(1000);
            
            checkCancel();
            const continueBtn1 = page.getByRole("button", { name: "Continue", exact: true });
            await continueBtn1.click({ force: true });
            await sleep(3000);

            checkCancel();
            await page.waitForSelector('input[type="password"]', {timeout: 30000});
            currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🔐 إدخال كلمة المرور", currentPhotoId, logger);
            const passInput = page.locator('input[type="password"]').first();
            await passInput.fill(chatGptPassword);
            await sleep(1000);

            const continueBtn2 = page.getByRole("button", { name: "Continue" });
            await continueBtn2.click({ force: true });
            
            await updateStatus("جاري التحقق من قبول البيانات...");
            await sleep(7000); 

            checkCancel();
            if (await page.isVisible('text="Failed to create account"').catch(()=>false)) {
                logger.log("رفض السيرفر (Failed to create account)");
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "❌ خطأ: Failed to create account", currentPhotoId, logger);
                if (!isManual) { shouldRetryWithNewEmail = true; throw new Error("SERVER_REJECTED_EMAIL"); } 
                else { throw new Error("مرفوض يدوياً. يرجى تجربة إيميل آخر."); }
            }

            await updateStatus("في انتظار صفحة الكود...");
            
            let code = null;
            if (isManual) {
                await updateStatus("🛑 يرجى إرسال الكود هنا في الشات.");
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "💬 بانتظار الكود منك...", currentPhotoId, logger);
                logger.log("انتظار الكود من المستخدم");
                
                code = await new Promise((resolve, reject) => {
                    const listener = (msg) => {
                        if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) {
                            bot.removeListener('message', listener); 
                            clearInterval(cancelInterval);
                            resolve(msg.text.trim());
                        }
                    };
                    bot.on('message', listener);
                    const cancelInterval = setInterval(() => {
                        if (userState[chatId] && userState[chatId].cancel) {
                            bot.removeListener('message', listener);
                            clearInterval(cancelInterval);
                            reject(new Error("CANCELLED_BY_USER"));
                        }
                    }, 1000);
                    setTimeout(() => { bot.removeListener('message', listener); clearInterval(cancelInterval); resolve(null); }, 120000);
                });
                if (!code) throw new Error("لم يتم استلام الكود.");
                logger.log(`تم استلام الكود: ${code}`);
            } else {
                code = await waitForMailTmCode(email, mailToken, chatId, 100);
                if (!code) throw new Error("فشل جلب الكود التلقائي.");
                logger.log(`تم جلب الكود تلقائياً: ${code}`);
            }

            checkCancel();
            await updateStatus(`إدخال الكود: ${code}`);
            const codeInput = page.getByRole("textbox", { name: "Code" });
            await codeInput.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => {
                await page.keyboard.type(code, { delay: 100 });
            });
            if (await codeInput.isVisible().catch(()=>false)) {
                await codeInput.fill(code);
            }
            await sleep(2000);

            const continueBtnAfterCode = page.getByRole("button", { name: "Continue" }).last();
            if (await continueBtnAfterCode.isVisible().catch(()=>false)) {
                await continueBtnAfterCode.click({ force: true });
            } else {
                await page.locator('button:has-text("Continue")').last().click({ force: true }).catch(()=>{});
            }
            await sleep(5000); 

            checkCancel();
            await updateStatus("جاري كتابة الاسم والعمر/المواليد...");
            
            const nameInputNode = page.getByRole("textbox", { name: "Full name" }).first();
            if (await nameInputNode.isVisible({ timeout: 15000 }).catch(() => false)) {
                currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "👤 صفحة طلب الاسم مفتوحة", currentPhotoId, logger);
                
                await nameInputNode.fill(fullName);
                await sleep(1000);
                
                const ageInput = page.locator('input[name="age"], input[id*="age" i]').first();
                const bdayInput = page.locator('input[name="birthday"], [aria-label*="birthday" i]').first();
                
                if (await ageInput.isVisible({ timeout: 3000 }).catch(() => false)) {
                    await ageInput.focus().catch(()=>{});
                    await ageInput.click({ force: true }).catch(()=>{});
                    await page.keyboard.type("25", { delay: 150 });
                    await sleep(1000);
                    currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `🎂 تم إدخال العمر: 25`, currentPhotoId, logger);
                } else if (await bdayInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await bdayInput.focus().catch(()=>{});
                    await bdayInput.click({ force: true }).catch(()=>{});
                    await page.keyboard.press('Control+A');
                    await page.keyboard.press('Backspace');
                    await page.keyboard.type("01012000", { delay: 150 });
                    await sleep(1000);
                    currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `🎂 تم إدخال تاريخ الميلاد: 01/01/2000`, currentPhotoId, logger);
                } else {
                    await page.keyboard.press('Tab');
                    await page.keyboard.type("01012000", { delay: 150 });
                }

                checkCancel();
                const finishBtn = page.getByRole("button", { name: "Continue" }).last();
                if (await finishBtn.isVisible().catch(() => false)) {
                    await finishBtn.click({ force: true });
                } else {
                    const altFinishBtn = page.locator('button:has-text("Finish creating account"), button:has-text("Agree")').last();
                    if (await altFinishBtn.isVisible().catch(()=>false)) {
                        await altFinishBtn.click({ force: true });
                    } else {
                        await page.keyboard.press('Enter');
                    }
                }
                
                await sleep(8000); 
            }

            checkCancel();
            await updateStatus("في انتظار الصفحة الرئيسية...");
            await page.waitForURL('**/chat', {timeout: 30000}).catch(()=>{});
            
            if (page.url().includes('/chat')) {
                 const result = `${email}|${chatGptPassword}`;
                 fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), result + '\n');
                 logger.log(`تم تسجيل الدخول بنجاح! ${result}`);

                 if (isManual) {
                     // =================================================================
                     // نظام الـ 2FA (المصادقة الثنائية) الذكي والتحكم المباشر 
                     // =================================================================
                     currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `✅ **نجاح (يدوي):**\n\`${result}\`\n\nيتم الآن تفعيل المصادقة الثنائية 2FA بشكل تلقائي...`, currentPhotoId, logger);
                     
                     logger.log("الانتقال إلى صفحة Security");
                     await page.goto("https://chatgpt.com/#settings/Security", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
                     await sleep(4000);
                     currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "⚙️ فتح صفحة إعدادات الأمان", currentPhotoId, logger);

                     logger.log("الضغط على زر Authenticator app");
                     const authToggleBtn = page.locator('button[role="switch"]').last();
                     if (await authToggleBtn.isVisible().catch(()=>false)) {
                         await authToggleBtn.click({ force: true });
                     } else {
                         await page.locator('text="Authenticator app"').click({ force: true }).catch(()=>{});
                         await page.keyboard.press('Tab');
                         await page.keyboard.press('Enter');
                     }
                     await sleep(3000);
                     currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🔘 ظهور نافذة التفعيل والباركود", currentPhotoId, logger);

                     logger.log("استخراج الرمز السري المكون من 32 حرف...");
                     const pageText = await page.innerText('body');
                     const secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);
                     
                     if (secretMatch) {
                         const secretCode = secretMatch[0];
                         logger.log(`تم استخراج الرمز بنجاح: ${secretCode}`);
                         currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `🔑 تم العثور على الكود السري:\n\`${secretCode}\``, currentPhotoId, logger);
                         
                         // فتح موقع 2fa.fb.tools في نافذة جديدة لاستخراج الـ 6 ارقام
                         const mfaPage = await context.newPage();
                         logger.log(`إضافة الرمز بجانب الرابط وفتح: https://2fa.fb.tools/${secretCode}`);
                         
                         await mfaPage.goto(`https://2fa.fb.tools/${secretCode}`, { waitUntil: "domcontentloaded" }).catch(()=>{});
                         await sleep(3000);
                         currentPhotoId = await sendStepPhotoAndCleanup(mfaPage, chatId, "🌐 موقع 2fa.fb.tools المخصص لجلب الرمز", currentPhotoId, logger);
                         
                         const mfaText = await mfaPage.innerText('body');
                         const code6Match = mfaText.match(/\b\d{6}\b/);
                         
                         if (code6Match) {
                             const code6 = code6Match[0];
                             logger.log(`تم استخراج رمز الـ 6 أرقام: ${code6}`);
                             await bot.sendMessage(chatId, `🔢 رمز المصادقة (6 أرقام): \`${code6}\``, { parse_mode: 'Markdown' });
                             
                             await mfaPage.close();
                             await page.bringToFront();
                             
                             logger.log("لصق الكود في ChatGPT");
                             const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();
                             if (await codeInput.isVisible().catch(()=>false)) {
                                 await codeInput.fill(code6);
                             } else {
                                 await page.keyboard.type(code6, { delay: 100 });
                             }
                             await sleep(1500);
                             currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, `⌨️ إدخال الرمز ${code6} في الخانة المطلوبة`, currentPhotoId, logger);
                             
                             // تفعيل وتمكين
                             const enableBtn = page.locator('button:has-text("Enable"), button:has-text("Verify")').first();
                             if (await enableBtn.isVisible().catch(()=>false)) {
                                 await enableBtn.click();
                             } else {
                                 await page.keyboard.press('Enter');
                             }
                             await sleep(3000);
                             logger.log("تم تفعيل المصادقة 2FA بنجاح!");
                             currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "✅ تمت المصادقة الثنائية (2FA) بنجاح تام!", currentPhotoId, logger);
                             
                         } else {
                             logger.log("تعذر استخراج الرمز من موقع 2fa.fb.tools");
                             await bot.sendMessage(chatId, "⚠️ تعذر استخراج الرمز السداسي، سيتم تحويلك للتحكم اليدوي.");
                         }
                     } else {
                         logger.log("لم يتم العثور على الرمز السري.");
                         await bot.sendMessage(chatId, "⚠️ لم يتم العثور على الكود 32 حرف كابيتال في الصفحة، سيتم تحويلك للتحكم اليدوي.");
                     }

                     // الدخول في وضع التحكم التفاعلي النهائي
                     logger.log("تجميد المتصفح والدخول في وضع التحكم التفاعلي");
                     await startInteractiveMode(chatId, page, context, tempDir, logger, currentPhotoId);
                     accountCreatedSuccessfully = true;

                 } else {
                     currentPhotoId = await sendStepPhotoAndCleanup(page, chatId, "🎉 تم الدخول بنجاح!", currentPhotoId, logger);
                     await bot.sendMessage(chatId, `✅ **نجاح ${modeText}:**\n\`${result}\``, { parse_mode: 'Markdown' });
                     accountCreatedSuccessfully = true;
                 }

            } else {
                throw new Error("لم يتم الوصول للرئيسية بعد الضغط النهائي.");
            }

        } catch (error) {
            if (error.message === "CANCELLED_BY_USER") {
                await bot.sendMessage(chatId, "🛑 تم إلغاء العملية بناءً على طلبك وإغلاق المتصفح.");
                return false;
            }
            if (shouldRetryWithNewEmail) {
                console.log("محاولة جديدة...");
            } else {
                logger.log(`❌ خطأ: ${error.message}`);
                await reportErrorWithScreenshot(page, chatId, error.message, tempDir, logger);
                
                // في حال حدوث خطأ، قم بفتح وضع التحكم ليتدخل المستخدم لحله
                if (page && context && !userState[chatId].cancel) {
                    await bot.sendMessage(chatId, "⚠️ توقفت العملية بسبب خطأ. البوت الآن تحت تصرفك لتتجاوز المشكلة يدوياً:");
                    await startInteractiveMode(chatId, page, context, tempDir, logger, currentPhotoId);
                }
            }
        } finally {
            // إغلاق المتصفح فقط إذا لم نكن في وضع التفاعل أو تم الموافقة على الإنهاء
            if (userState[chatId] && !userState[chatId].isInteractive) {
                if (context) await context.close().catch(()=>{});
                userState[chatId].context = null; 
                userState[chatId].page = null;
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
                if (userState[chatId].currentPhotoId) { await bot.deleteMessage(chatId, userState[chatId].currentPhotoId).catch(()=>{}); }
            }
        }

        if (accountCreatedSuccessfully || (userState[chatId] && userState[chatId].cancel)) return true;
        if (!shouldRetryWithNewEmail && (!userState[chatId] || !userState[chatId].isInteractive)) return false; 
    }

    if (!isManual && !(userState[chatId] && userState[chatId].cancel)) await bot.sendMessage(chatId, `❌ فشل بعد ${maxEmailAttempts} محاولات.`);
    return false;
}

// === القوائم وأزرار التنقل الرئيسية ===

function sendMainMenu(chatId, messageId = null) {
    const text = "👋 أهلاً بك! اختر العملية المطلوبة من الأزرار:";
    const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '▶️ تشغيل تلقائي', callback_data: 'create_auto' }, { text: '✍️ تشغيل يدوي', callback_data: 'create_manual' }],
                [{ text: '🔐 تسجيل الدخول', callback_data: 'login' }, { text: '🛑 إلغاء العملية', callback_data: 'cancel' }]
            ]
        }
    };
    if (messageId) {
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }).catch(()=>{});
    } else {
        bot.sendMessage(chatId, text, opts);
    }
}

bot.onText(/\/start/, (msg) => {
    if (!userState[msg.chat.id]) userState[msg.chat.id] = { step: null, cancel: false, isInteractive: false };
    sendMainMenu(msg.chat.id);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    bot.answerCallbackQuery(query.id).catch(() => {});

    if (!userState[chatId]) userState[chatId] = { step: null, cancel: false, isInteractive: false };
    const state = userState[chatId];

    // ============================================
    // أوامر التحكم التفاعلي (الماوس، الكيبورد، الإنهاء)
    // ============================================
    if (query.data.startsWith('int_')) {
        const action = query.data.split('_')[1];
        if (!state.isInteractive || !state.page) return bot.sendMessage(chatId, "⚠️ الجلسة منتهية أو غير فعالة.");

        if (action === 'mouse') {
            state.logger.log("طلب المستخدم ميزة الماوس (رسم الشبكة الشفافة)");
            
            // حقن وتصوير الشبكة
            await drawGridOnPage(state.page);
            const screenshotPath = path.join(__dirname, `grid_${Date.now()}.png`);
            await state.page.screenshot({ path: screenshotPath });
            
            // إزالة الشبكة فوراً بعد التصوير كي لا تمنع النقرات الحقيقية
            await state.page.evaluate(() => {
                const grid = document.getElementById('bot-grid-overlay');
                if (grid) grid.remove();
            });

            await bot.sendPhoto(chatId, screenshotPath, { caption: "🎯 **أرسل رقم المربع** (من 0 إلى 99) لكي يقوم الماوس بالضغط عليه:", parse_mode: 'Markdown' });
            fs.unlinkSync(screenshotPath);
            
            state.step = 'awaiting_grid_num';
        } 
        else if (action === 'type') {
            state.logger.log("طلب المستخدم إدخال نص");
            bot.sendMessage(chatId, "⌨️ أرسل النص الذي ترغب بكتابته:");
            state.step = 'awaiting_int_text';
        } 
        else if (action === 'enter') {
            state.logger.log("الضغط على Enter");
            await state.page.keyboard.press('Enter');
            await sleep(1500);
            state.currentPhotoId = await sendStepPhotoAndCleanup(state.page, chatId, "↩️ تم الضغط على Enter", state.currentPhotoId, state.logger);
            await sendInteractiveMenu(chatId);
        } 
        else if (action === 'refresh') {
            state.logger.log("تحديث الشاشة");
            state.currentPhotoId = await sendStepPhotoAndCleanup(state.page, chatId, "📸 لقطة حديثة للشاشة:", state.currentPhotoId, state.logger);
            await sendInteractiveMenu(chatId);
        } 
        else if (action === 'skip') {
            state.logger.log("تخطي");
            bot.sendMessage(chatId, "⏭️ تم التخطي.");
            await sendInteractiveMenu(chatId);
        } 
        else if (action === 'finish') {
            state.logger.log("تمت الموافقة، إنهاء الجلسة واستخراج السجل");
            bot.sendMessage(chatId, "✅ جاري إنهاء العمل وإغلاق المتصفح واستخراج السكربت...");
            
            state.isInteractive = false;
            
            // إغلاق المتصفح وحذف الملفات
            if (state.context) await state.context.close().catch(()=>{});
            if (state.tempDir) { try { fs.rmSync(state.tempDir, { recursive: true, force: true }); } catch {} }
            
            state.context = null;
            state.page = null;
            isProcessing = false;
            
            // استخراج وتصدير سكربت الـ Logs
            if (state.logger && state.logger.logs.length > 0) {
                const logPath = path.join(__dirname, `script_log_${Date.now()}.txt`);
                fs.writeFileSync(logPath, state.logger.getLogs());
                await bot.sendDocument(chatId, logPath, { caption: "📄 **سكربت مفصل بالأحداث والملي ثانية**", parse_mode: 'Markdown' });
                fs.unlinkSync(logPath);
            }
            
            // تحرير الدالة الأساسية من التعليق
            if (state.resolveInteractive) {
                state.resolveInteractive();
                state.resolveInteractive = null;
            }
            sendMainMenu(chatId);
        }
        return;
    }

    // ================= القائمة الرئيسية =================
    if (query.data === 'cancel') {
        if (!isProcessing && !state.isInteractive) return bot.sendMessage(chatId, "⚠️ لا توجد عملية قيد التشغيل حالياً لإلغائها.");
        state.cancel = true;
        
        if (state.isInteractive && state.resolveInteractive) {
            state.resolveInteractive(); // فك التجميد التفاعلي للإلغاء
        }
        state.isInteractive = false;
        
        if (state.context) { await state.context.close().catch(()=>{}); }
        bot.sendMessage(chatId, "⏳ جاري إيقاف العملية وإغلاق المتصفح بقوة...");
        isProcessing = false;
        return;
    }

    if (query.data === 'login') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول حالياً. انتظر أو اضغط إلغاء.");
        state.step = 'awaiting_login';
        bot.sendMessage(chatId, "➡️ أرسل **الإيميل والباسورد** لتسجيل الدخول (مثال: email@dom.com 123456):", {parse_mode: 'Markdown'});
        return;
    }

    if (query.data === 'create_auto') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول.");
        userState[chatId] = { step: null, cancel: false, isInteractive: false };
        isProcessing = true;
        
        await createAccountLogic(chatId, 1, 1, null);
        
        isProcessing = false;
        if (!userState[chatId].cancel && !userState[chatId].isInteractive) bot.sendMessage(chatId, "🏁 اكتمل التلقائي.");
    } 
    
    else if (query.data === 'create_manual') {
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول.");
        userState[chatId] = { step: 'awaiting_email', cancel: false, isInteractive: false };
        bot.sendMessage(chatId, "➡️ أرسل **الإيميل** فقط لبدء عملية الإنشاء (الفيزا والـ 2FA ستُدار تلقائياً/يدوياً):", {parse_mode: 'Markdown'});
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const state = userState[chatId];

    if (!state || !text || text.startsWith('/')) return; 

    // --- استقبال رقم المربع لضغط الماوس التفاعلي ---
    if (state.step === 'awaiting_grid_num' && state.isInteractive) {
        const num = parseInt(text);
        if (!isNaN(num) && num >= 0 && num <= 99) {
            state.step = null;
            state.logger.log(`إرسال أمر ضغط الماوس على المربع ${num}`);
            
            const viewportSize = state.page.viewportSize() || { width: 1366, height: 768 };
            const vw = viewportSize.width / 10;
            const vh = viewportSize.height / 10;
            const col = num % 10;
            const row = Math.floor(num / 10);
            
            // حساب منتصف المربع ليكون الضغط دقيق جداً
            const x = (col * vw) + (vw / 2);
            const y = (row * vh) + (vh / 2);
            
            await state.page.mouse.click(x, y);
            await sleep(1500);
            state.currentPhotoId = await sendStepPhotoAndCleanup(state.page, chatId, `🖱️ تم النقر بالماوس على المربع: ${num}`, state.currentPhotoId, state.logger);
            await sendInteractiveMenu(chatId);
        } else {
            bot.sendMessage(chatId, "❌ رقم غير صحيح. الرجاء إرسال رقم بين 0 و 99 فقط.");
        }
        return;
    }

    // --- استقبال النص للكتابة التفاعلية ---
    if (state.step === 'awaiting_int_text' && state.isInteractive) {
        state.step = null;
        state.logger.log(`كتابة نص تفاعلي: ${text}`);
        await state.page.keyboard.type(text, { delay: 50 });
        await sleep(1000);
        state.currentPhotoId = await sendStepPhotoAndCleanup(state.page, chatId, `⌨️ تمت كتابة: ${text}`, state.currentPhotoId, state.logger);
        await sendInteractiveMenu(chatId);
        return;
    }

    // --- استقبال الايميل للإنشاء اليدوي ---
    if (state.step === 'awaiting_email') {
        if (!text.includes('@')) return bot.sendMessage(chatId, "❌ إيميل غير صحيح.");
        const autoPass = generateSecurePassword(); 
        
        state.step = null;
        state.cancel = false;
        isProcessing = true;
        
        bot.sendMessage(chatId, `✅ تم استلام البريد.\n🔑 الباسورد: \`${autoPass}\``, {parse_mode: 'Markdown'});
        
        await createAccountLogic(chatId, 1, 1, { email: text, password: autoPass });
        
        isProcessing = false;
        if (!state.cancel && !state.isInteractive) bot.sendMessage(chatId, "🏁 اكتملت العملية.");
    } 
    
    else if (state.step === 'awaiting_login') {
        state.step = null;
        bot.sendMessage(chatId, "🛠️ تم استلام بيانات الدخول بنجاح!");
    }
});

bot.onText(/\/clearproxy/, (msg) => { activeProxy = null; bot.sendMessage(msg.chat.id, "🗑️ تم إيقاف البروكسي."); });
process.on('uncaughtException', (err) => { console.error('Uncaught:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled:', reason); });

console.log("🤖 البوت يعمل الآن (إصدار 2FA + نظام تحكم الماوس التفاعلي الشفاف والتقارير الزمنيّة)...");
