/*
 * ==========================================================
 * ChatGPT Bot Creator - الاصدار 27 (تم إصلاح ترتيب التعريفات)
 * ==========================================================
 * - تم دمج منطق التسجيل المحسّن من المشروع الجديد
 * - Mail.tm (مجاني - لا يحتاج نطاق أو ترخيص)
 * - اشتراك Plus تلقائي + إلغاء (اختياري - يتطلب CARD_*)
 * - توليد عناوين وأسماء أمريكية عشوائية للفواتير
 * - مكافحة الكشف المحسّنة (WebGL، plugins، webdriver)
 * ==========================================================
 */

const TelegramBot  = require('node-telegram-bot-api');
const { chromium } = require('playwright-extra');
const stealth      = require('puppeteer-extra-plugin-stealth')();
const axios        = require('axios');
const { faker }    = require('@faker-js/faker');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');

chromium.use(stealth);

// ============================================================
// الإعدادات
// ============================================================
const BOT_TOKEN    = process.env.BOT_TOKEN || 'ضع_توكن_البوت_هنا';
const ACCOUNTS_FILE = 'accounts.txt';

// بيانات البطاقة الائتمانية (اختياري - لتفعيل Plus)
const CARD = {
    number:      process.env.CARD_NUMBER       || '',
    expiry:      process.env.CARD_EXPIRY       || '',   // مثال: 1225
    expiryMonth: process.env.CARD_EXPIRY_MONTH || '',
    expiryYear:  process.env.CARD_EXPIRY_YEAR  || '',
    cvc:         process.env.CARD_CVC          || '',
};
const ENABLE_PLUS = !!(CARD.number && CARD.cvc && CARD.expiry);

if (!BOT_TOKEN || BOT_TOKEN === 'ضع_توكن_البوت_هنا') {
    console.error('❌ BOT_TOKEN مفقود. أضفه في متغيرات البيئة.');
    process.exit(1);
}

// ============================================================
// تهيئة البوت (يجب أن تكون قبل أي دالة تستخدم bot)
// ============================================================
const bot          = new TelegramBot(BOT_TOKEN, { polling: true });
let   isProcessing = false;
const userState    = {};

// ============================================================
// Mail.tm
// ============================================================
const MAILTM_BASE = 'https://api.mail.tm';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function generateSecurePassword() {
    const lower   = 'abcdefghijklmnopqrstuvwxyz';
    const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nums    = '0123456789';
    const symbols = '!@#$%^&*';
    const all     = lower + upper + nums + symbols;
    let pwd = '';
    pwd += lower[crypto.randomInt(0, lower.length)];
    pwd += upper[crypto.randomInt(0, upper.length)];
    pwd += nums[crypto.randomInt(0, nums.length)];
    pwd += symbols[crypto.randomInt(0, symbols.length)];
    for (let i = 0; i < 12; i++) pwd += all[crypto.randomInt(0, all.length)];
    return pwd.split('').sort(() => 0.5 - Math.random()).join('');
}

async function createMailTmAccount(chatId) {
    const domainsRes = await axios.get(`${MAILTM_BASE}/domains`);
    const domains    = domainsRes.data['hydra:member'];
    if (!domains?.length) throw new Error('لا توجد دومينات متاحة في Mail.tm');

    const domain   = domains[0].domain;
    const username = faker.person.firstName().toLowerCase().replace(/[^a-z]/g, '') + crypto.randomBytes(3).toString('hex');
    const email    = `${username}@${domain}`;
    const password = generateSecurePassword();

    await axios.post(`${MAILTM_BASE}/accounts`, { address: email, password });
    const tokenRes = await axios.post(`${MAILTM_BASE}/token`, { address: email, password });
    const token    = tokenRes.data.token;

    await bot.sendMessage(chatId, `📧 بريد Mail.tm: \`${email}\``, { parse_mode: 'Markdown' });
    return { email, password, token };
}

async function waitForMailTmCode(token, chatId, maxWaitSeconds = 90) {
    const startTime  = Date.now();
    const statusMsg  = await bot.sendMessage(chatId, '⏳ في انتظار كود التفعيل من Mail.tm...');
    const seenIds    = new Set();

    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        try {
            const res      = await axios.get(`${MAILTM_BASE}/messages`, { headers: { Authorization: `Bearer ${token}` } });
            const messages = res.data['hydra:member'] || [];

            for (const msg of messages) {
                if (seenIds.has(msg.id)) continue;
                seenIds.add(msg.id);
                try {
                    const full    = await axios.get(`${MAILTM_BASE}/messages/${msg.id}`, { headers: { Authorization: `Bearer ${token}` } });
                    const content = `${full.data.subject || ''} ${full.data.text || ''} ${full.data.html || ''}`;
                    const match   = content.match(/\b(\d{6})\b/);
                    if (match) {
                        await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
                        await bot.sendMessage(chatId, `📩 **كود تلقائي:** \`${match[1]}\``, { parse_mode: 'Markdown' });
                        return match[1];
                    }
                } catch {}
            }
        } catch {}
        await sleep(4000);
    }

    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    return null;
}

// ============================================================
// مساعدات المتصفح
// ============================================================
async function sendStepPhoto(page, chatId, caption, prevId = null) {
    try {
        if (prevId) await bot.deleteMessage(chatId, prevId).catch(() => {});
        const file = path.join(__dirname, `step_${Date.now()}.png`);
        await page.screenshot({ path: file, fullPage: false });
        const sent = await bot.sendPhoto(chatId, file, { caption });
        if (fs.existsSync(file)) fs.unlinkSync(file);
        return sent.message_id;
    } catch {
        return prevId;
    }
}

async function reportError(page, chatId, msg, dir) {
    await bot.sendMessage(chatId, `❌ خطأ: ${msg}`);
    if (page) {
        try {
            const f = path.join(dir, `err_${Date.now()}.png`);
            await page.screenshot({ path: f, fullPage: true });
            await bot.sendPhoto(chatId, f, { caption: '📸 لقطة الخطأ' });
            if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {}
    }
}

async function humanMove(page) {
    try {
        await page.mouse.wheel(0, 200);
        await sleep(300);
        await page.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 150, { steps: 5 });
    } catch {}
}

// ============================================================
// مولّدات البيانات العشوائية (من المشروع الجديد)
// ============================================================
function generateUserInfo() {
    const now      = new Date();
    const minYear  = now.getFullYear() - 40;
    const maxYear  = now.getFullYear() - 20;
    const year     = String(minYear + Math.floor(Math.random() * (maxYear - minYear + 1)));
    const month    = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const maxDay   = new Date(Number(year), Number(month), 0).getDate();
    const day      = String(Math.floor(Math.random() * maxDay) + 1).padStart(2, '0');
    return {
        name:  `${faker.person.firstName()} ${faker.person.lastName()}`,
        year,
        month,
        day,
        // لاستخدام format spinbutton القديم: MMDDYYYY
        birthdayString: month + day + year,
    };
}

function generateBillingInfo() {
    const states = [
        { name: 'Delaware',      cities: ['Wilmington', 'Dover'],     zipMin: 19701, zipMax: 19980 },
        { name: 'Oregon',        cities: ['Portland', 'Salem'],        zipMin: 97001, zipMax: 97920 },
        { name: 'Montana',       cities: ['Billings', 'Missoula'],     zipMin: 59001, zipMax: 59937 },
        { name: 'New Hampshire', cities: ['Manchester', 'Nashua'],     zipMin: 3031,  zipMax:  3897 },
    ];
    const streets = ['Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Park Blvd', 'Washington St'];
    const s   = states[Math.floor(Math.random() * states.length)];
    const zip = String(s.zipMin + Math.floor(Math.random() * (s.zipMax - s.zipMin))).padStart(5, '0');
    return {
        name:     `${faker.person.firstName()} ${faker.person.lastName()}`,
        zip,
        state:    s.name,
        city:     s.cities[Math.floor(Math.random() * s.cities.length)],
        address1: `${100 + Math.floor(Math.random() * 9000)} ${streets[Math.floor(Math.random() * streets.length)]}`,
    };
}

// ============================================================
// تفعيل Plus (اختياري)
// ============================================================
async function subscribePlus(page, chatId) {
    if (!ENABLE_PLUS) return false;

    await bot.sendMessage(chatId, '💳 جاري محاولة تفعيل Plus...');

    try {
        await page.goto('https://chatgpt.com/#pricing', { waitUntil: 'networkidle', timeout: 30000 });
        await sleep(4000);

        // إغلاق النوافذ المنبثقة
        for (let i = 0; i < 3; i++) {
            const closed = await page.evaluate(() => {
                const btn = [...document.querySelectorAll('button')]
                    .find(b => /next|okay|done|got it|close|dismiss|start/i.test(b.textContent) &&
                               !/upgrade|plus|trial/i.test(b.textContent));
                if (btn) { btn.click(); return true; }
                return false;
            });
            if (!closed) break;
            await sleep(800);
        }

        // البحث عن زر Plus
        const plusXPaths = [
            '//button[contains(., "Start trial")]',
            '//button[contains(., "Get Plus")]',
            '//button[contains(., "Upgrade to Plus")]',
            '//button[contains(., "领取免费试用")]',
        ];

        let clicked = false;
        for (const xp of plusXPaths) {
            try {
                const btn = page.locator(`xpath=${xp}`).first();
                if (await btn.isVisible({ timeout: 3000 })) {
                    await btn.scrollIntoViewIfNeeded();
                    await sleep(500);
                    await btn.click({ force: true });
                    clicked = true;
                    break;
                }
            } catch {}
        }
        if (!clicked) { await bot.sendMessage(chatId, '⚠️ لم يتم العثور على زر Plus'); return false; }

        // انتظار نموذج الدفع
        const start = Date.now();
        while (Date.now() - start < 25000) {
            const src = await page.content();
            if (src.toLowerCase().includes('stripe') || src.toLowerCase().includes('card')) break;
            await sleep(1000);
        }
        await sleep(2000);

        const billing = generateBillingInfo();

        // ─── مساعد داخلي: ملء حقل في الصفحة أو في iframe ───────────
        async function fillField(selectors, value) {
            const list = selectors.split(',').map(s => s.trim());

            // الصفحة الرئيسية
            for (const sel of list) {
                try {
                    const el = page.locator(sel).first();
                    if (await el.isVisible({ timeout: 2000 })) {
                        await el.click({ clickCount: 3 });
                        await el.type(value, { delay: 60 });
                        return true;
                    }
                } catch {}
            }

            // داخل iframes
            for (const frame of page.frames()) {
                for (const sel of list) {
                    try {
                        const el = frame.locator(sel).first();
                        if (await el.isVisible({ timeout: 1500 })) {
                            await el.click({ clickCount: 3 });
                            await el.type(value, { delay: 60 });
                            return true;
                        }
                    } catch {}
                }
            }
            return false;
        }

        // ─── الاسم ──────────────────────────────────────────────────
        await fillField('#Field-nameInput, #Field-billingNameInput, input[name="name"], input[autocomplete="cc-name"]', billing.name);
        await sleep(600);

        // ─── الرمز البريدي ──────────────────────────────────────────
        await fillField('#Field-postalCodeInput, input[name="postalCode"]', billing.zip);
        await sleep(3000); // Stripe يحمّل حقول الولاية/المدينة بعد الرمز

        // ─── الولاية ────────────────────────────────────────────────
        await fillField('#Field-administrativeAreaInput, select[name="state"], input[name="state"]', billing.state);
        await sleep(500);

        // ─── المدينة ────────────────────────────────────────────────
        await fillField('#Field-localityInput, input[name="city"]', billing.city);
        await sleep(500);

        // ─── عنوان السطر الأول ──────────────────────────────────────
        await fillField('#Field-addressLine1Input, input[name="addressLine1"]', billing.address1);
        await sleep(500);

        // ─── رقم البطاقة ────────────────────────────────────────────
        await fillField('input[name="cardnumber"], input[autocomplete="cc-number"]', CARD.number);
        await sleep(700);

        // ─── تاريخ الانتهاء ─────────────────────────────────────────
        await fillField('input[name="exp-date"], input[autocomplete="cc-exp"], input[placeholder="MM / YY"]', CARD.expiry);
        await sleep(700);

        // ─── CVC ────────────────────────────────────────────────────
        await fillField('input[name="cvc"], input[placeholder="CVC"]', CARD.cvc);
        await sleep(700);

        // ─── إرسال الدفع ────────────────────────────────────────────
        for (let attempt = 0; attempt < 5; attempt++) {
            await page.locator("button[type='submit']").last().click({ force: true }).catch(() => {});
            await sleep(3000);
            const hasError = await page.evaluate(() =>
                !!document.querySelector('.StripeElement--invalid, [role="alert"]')
            );
            if (!hasError) break;
            await sleep(1000);
        }

        // ─── انتظار إعادة التوجيه ───────────────────────────────────
        const waitStart = Date.now();
        while (Date.now() - waitStart < 30000) {
            const url = page.url();
            if (url.includes('chatgpt.com') && !url.includes('pricing') && !url.includes('payment')) {
                await bot.sendMessage(chatId, '🎉 تم تفعيل Plus بنجاح!');
                return true;
            }
            await sleep(2000);
        }

        await bot.sendMessage(chatId, '⚠️ انتهى وقت الانتظار — لم يتأكد تفعيل Plus');
        return false;

    } catch (err) {
        await bot.sendMessage(chatId, `⚠️ فشل تفعيل Plus: ${err.message}`);
        return false;
    }
}

// ============================================================
// إلغاء الاشتراك (بعد Plus مباشرة)
// ============================================================
async function cancelSubscription(page, chatId) {
    await bot.sendMessage(chatId, '🛑 جاري إلغاء الاشتراك لمنع الفوترة...');
    try {
        if (!page.url().includes('chatgpt.com')) {
            await page.goto('https://chatgpt.com', { waitUntil: 'networkidle', timeout: 30000 });
        }

        await page.locator('#prompt-textarea').waitFor({ timeout: 20000 }).catch(() => {});
        await sleep(2000);

        // إغلاق نوافذ الترحيب
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => {
                const b = [...document.querySelectorAll('button')].find(x => /Okay|Let|开始/i.test(x.textContent));
                if (b) b.click();
            });
            await sleep(800);
        }

        // فتح قائمة المستخدم
        for (const sel of ['div[data-testid="user-menu"]', '.text-token-text-secondary']) {
            try {
                await page.locator(sel).first().click({ timeout: 4000 });
                break;
            } catch {}
        }
        await sleep(2000);

        // My Plan → Manage
        const myPlan = page.locator('xpath=//div[contains(text(),"My plan") or contains(text(),"套餐")]').first();
        if (await myPlan.isVisible({ timeout: 4000 }).catch(() => false)) {
            await myPlan.click();
            await sleep(2000);
        } else {
            // Settings path
            const settings = page.locator('xpath=//div[contains(text(),"Settings") or contains(text(),"设置")]').first();
            if (await settings.isVisible({ timeout: 4000 }).catch(() => false)) {
                await settings.click();
                await sleep(2000);
            }
            const manage = page.locator('xpath=//button[contains(.,"Manage") or contains(.,"管理")]').first();
            if (await manage.isVisible({ timeout: 4000 }).catch(() => false)) {
                await manage.click();
                await sleep(2000);
            }
        }

        // البحث عن زر الإلغاء
        const cancelXPaths = [
            'xpath=//button[contains(.,"Cancel plan")]',
            'xpath=//button[contains(.,"Cancel trial")]',
            'xpath=//*[contains(text(),"取消订阅") or contains(text(),"Cancel subscription")]',
        ];
        for (const xp of cancelXPaths) {
            const el = page.locator(xp).first();
            if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
                await el.click();
                await sleep(2000);
                // تأكيد
                const confirm = page.locator('xpath=//button[contains(.,"Cancel plan") or contains(.,"Confirm cancellation")]').first();
                if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
                await bot.sendMessage(chatId, '✅ تم إلغاء الاشتراك — يحتفظ الحساب بـ Plus حتى نهاية الدورة.');
                return true;
            }
        }

        await bot.sendMessage(chatId, '⚠️ لم يتم العثور على زر الإلغاء — يُرجى الإلغاء يدوياً.');
        return false;
    } catch (err) {
        await bot.sendMessage(chatId, `⚠️ فشل الإلغاء: ${err.message}`);
        return false;
    }
}

// ============================================================
// الدالة الرئيسية
// ============================================================
async function createAccountLogic(chatId, currentNum, total, manualData = null) {
    const isManual  = !!manualData;
    const modeText  = isManual ? '(يدوي)' : '(تلقائي)';
    let statusMsgID = null;
    let photoId     = null;

    const updateStatus = async (text) => {
        const full = `⚡ [${currentNum}/${total}] ${modeText}: ${text}`;
        if (!statusMsgID) {
            const m = await bot.sendMessage(chatId, full);
            statusMsgID = m.message_id;
        } else {
            await bot.editMessageText(full, { chat_id: chatId, message_id: statusMsgID }).catch(() => {});
        }
    };

    await updateStatus('بدء العملية...');

    const maxAttempts = isManual ? 1 : 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let email, mailToken;

        if (isManual) {
            email     = manualData.email;
            mailToken = null;
        } else {
            try {
                const mailData = await createMailTmAccount(chatId);
                email     = mailData.email;
                mailToken = mailData.token;
            } catch (e) {
                await bot.sendMessage(chatId, `❌ فشل إنشاء Mail.tm: ${e.message}`);
                return false;
            }
        }

        const chatGptPassword = isManual ? manualData.password : generateSecurePassword();
        const userInfo        = generateUserInfo();

        await updateStatus(`فتح المتصفح...\n📧 \`${email}\``);

        const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_'));
        let context, page;
        let success          = false;
        let retryNewEmail    = false;

        try {
            context = await chromium.launchPersistentContext(tempDir, {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--window-size=1366,768',
                ],
                viewport: { width: 1366, height: 768 },
                timeout:  45000,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            });

            // مكافحة الكشف المحسّنة
            context.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver',  { get: () => undefined });
                Object.defineProperty(navigator, 'plugins',    { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages',  { get: () => ['en-US', 'en'] });
                window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
                const origQuery = navigator.permissions.query.bind(navigator.permissions);
                navigator.permissions.query = (p) =>
                    p.name === 'notifications' ? Promise.resolve({ state: 'denied' }) : origQuery(p);
                const getParam = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(p) {
                    if (p === 37445) return 'Intel Inc.';
                    if (p === 37446) return 'Intel(R) Iris(R) Xe Graphics';
                    return getParam.call(this, p);
                };
            });

            page = await context.newPage();

            photoId = await sendStepPhoto(page, chatId, '🌐 فتح المتصفح', photoId);

            // ── صفحة تسجيل الدخول ──────────────────────────────────
            await page.goto('https://chatgpt.com/auth/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await humanMove(page);
            await sleep(2000);

            // زر Sign up
            const signupBtn = page.locator('button:has-text("Sign up")').first();
            await signupBtn.waitFor({ state: 'visible', timeout: 30000 });
            await signupBtn.click({ force: true });
            await sleep(2000);

            // ── إدخال الإيميل ───────────────────────────────────────
            photoId = await sendStepPhoto(page, chatId, `📝 إدخال الإيميل: ${email}`, photoId);
            const emailInput = page.locator('input[name="email"], input[id="email-input"]').first();
            await emailInput.waitFor({ state: 'visible', timeout: 30000 });
            await emailInput.fill(email);
            await sleep(1000);

            await page.locator('button[type="submit"], button:has-text("Continue")').first().click({ force: true });
            await sleep(3000);

            // ── كلمة المرور ─────────────────────────────────────────
            photoId = await sendStepPhoto(page, chatId, '🔐 إدخال كلمة المرور', photoId);
            const passInput = page.locator('input[type="password"]').first();
            await passInput.waitFor({ state: 'visible', timeout: 30000 });
            await passInput.fill(chatGptPassword);
            await sleep(1000);

            await page.locator('button[type="submit"], button:has-text("Continue")').first().click({ force: true });
            await sleep(7000);

            // التحقق من رفض الإيميل
            const rejected = await page.isVisible('text="Failed to create account"').catch(() => false);
            if (rejected) {
                if (!isManual) { retryNewEmail = true; throw new Error('SERVER_REJECTED_EMAIL'); }
                else throw new Error('الإيميل مرفوض. جرّب إيميلاً آخر.');
            }

            // ── كود التحقق ──────────────────────────────────────────
            await updateStatus('في انتظار كود التحقق...');
            let code = null;

            if (isManual) {
                await updateStatus('🛑 يُرجى إرسال الكود هنا في الشات.');
                photoId = await sendStepPhoto(page, chatId, '💬 بانتظار الكود منك...', photoId);
                code = await new Promise((resolve) => {
                    const listener = (msg) => {
                        if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) {
                            bot.removeListener('message', listener);
                            resolve(msg.text.trim());
                        }
                    };
                    bot.on('message', listener);
                    setTimeout(() => { bot.removeListener('message', listener); resolve(null); }, 120000);
                });
                if (!code) throw new Error('لم يُستلم الكود في الوقت المحدد.');
            } else {
                code = await waitForMailTmCode(mailToken, chatId, 90);
                if (!code) throw new Error('فشل استخراج الكود تلقائياً من Mail.tm.');
            }

            // ── إدخال الكود ─────────────────────────────────────────
            await updateStatus(`إدخال الكود: ${code}`);
            const codeInput = page.locator('[role="textbox"][name*="ode" i], input[name="code"], input[autocomplete="one-time-code"]').first();
            await codeInput.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
            if (await codeInput.isVisible().catch(() => false)) {
                await codeInput.fill(code);
            } else {
                await page.keyboard.type(code, { delay: 80 });
            }
            await sleep(1500);

            await page.locator('button[type="submit"], button:has-text("Continue")').last().click({ force: true }).catch(() => {});
            await sleep(5000);

            // ── الاسم والمواليد ─────────────────────────────────────
            await updateStatus('كتابة الاسم والمواليد...');

            const nameInput = page.locator('[role="textbox"][name*="ull" i], input[name="name"], input[autocomplete="name"]').first();
            if (await nameInput.isVisible({ timeout: 15000 }).catch(() => false)) {
                photoId = await sendStepPhoto(page, chatId, '👤 صفحة الاسم مفتوحة', photoId);

                await nameInput.fill(userInfo.name);
                await sleep(800);

                // المواليد بـ spinbutton (المنطق الأصلي المحفوظ)
                const monthSpin = page.locator('[role="spinbutton"][aria-label*="month" i]').first();
                if (await monthSpin.isVisible({ timeout: 5000 }).catch(() => false)) {
                    await monthSpin.click();
                    await sleep(400);
                    await page.keyboard.type(userInfo.birthdayString, { delay: 100 });
                    await sleep(1200);
                    photoId = await sendStepPhoto(page, chatId, `🎂 تم إدخال المواليد: ${userInfo.birthdayString}`, photoId);
                } else {
                    // محاولة بديلة بحقول منفصلة
                    try {
                        await page.locator('[data-type="month"], input[name*="month" i]').first().fill(userInfo.month);
                        await sleep(300);
                        await page.locator('[data-type="day"], input[name*="day" i]').first().fill(userInfo.day);
                        await sleep(300);
                        await page.locator('[data-type="year"], input[name*="year" i]').first().fill(userInfo.year);
                    } catch {}
                }

                // زر الإنهاء
                const finishSelectors = [
                    'button:has-text("Continue")',
                    'button:has-text("Finish creating account")',
                    'button:has-text("Agree")',
                ];
                let finishClicked = false;
                for (const sel of finishSelectors) {
                    const btn = page.locator(sel).last();
                    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
                        await btn.click({ force: true });
                        finishClicked = true;
                        break;
                    }
                }
                if (!finishClicked) await page.keyboard.press('Enter');

                await sleep(8000);
            }

            // ── التحقق من النجاح ────────────────────────────────────
            await updateStatus('التحقق من الصفحة الرئيسية...');
            await page.waitForURL('**/chat', { timeout: 30000 }).catch(() => {});

            if (page.url().includes('/chat')) {
                fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), `${email}|${chatGptPassword}\n`);
                photoId = await sendStepPhoto(page, chatId, '🎉 تم الدخول بنجاح!', photoId);
                await bot.sendMessage(chatId,
                    `✅ **نجاح ${modeText}:**\n\`${email}|${chatGptPassword}\``,
                    { parse_mode: 'Markdown' }
                );
                success = true;

                // ── Plus اختياري ─────────────────────────────────────
                if (ENABLE_PLUS) {
                    const plusOk = await subscribePlus(page, chatId);
                    if (plusOk) {
                        fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE),
                            `${email}|${chatGptPassword}|PLUS\n`
                        );
                        await sleep(5000);
                        await cancelSubscription(page, chatId);
                    }
                }
            } else {
                throw new Error('لم يتم الوصول للصفحة الرئيسية بعد الإنهاء.');
            }

        } catch (err) {
            if (retryNewEmail) {
                console.log(`🔄 محاولة جديدة بإيميل آخر (${attempt}/${maxAttempts})...`);
            } else {
                await reportError(page, chatId, err.message, tempDir);
            }
        } finally {
            if (context) await context.close().catch(() => {});
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
            if (photoId) { await bot.deleteMessage(chatId, photoId).catch(() => {}); photoId = null; }
        }

        if (success) return true;
        if (!retryNewEmail) return false; // تم التصحيح: كان shouldRetryNewWithEmail
    }

    if (!isManual) await bot.sendMessage(chatId, `❌ فشل بعد ${maxAttempts} محاولات.`);
    return false;
}

// ============================================================
// أوامر البوت (النهائية)
// ============================================================
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
        [
            '👋 *أهلاً بك في GPT Bot Creator*',
            '',
            '📋 الأوامر:',
            '🤖 *تلقائي* — ينشئ الإيميل والحساب بالكامل',
            '✍️ *يدوي* — تُرسل إيميلك وتُدخل الكود بنفسك',
            '',
            ENABLE_PLUS ? '💳 تفعيل Plus مفعّل ✅' : '💳 تفعيل Plus معطّل (أضف CARD_* في البيئة)',
        ].join('\n'),
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🤖 تلقائي', callback_data: 'create_auto' }],
                    [{ text: '✍️ يدوي',   callback_data: 'create_manual' }],
                ],
            },
        }
    );
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    bot.answerCallbackQuery(query.id).catch(() => {});

    if (query.data === 'create_auto') {
        if (isProcessing) return bot.sendMessage(chatId, '⚠️ مشغول حالياً. انتظر.');
        delete userState[chatId];
        isProcessing = true;
        await createAccountLogic(chatId, 1, 1, null);
        isProcessing = false;
        bot.sendMessage(chatId, '🏁 اكتمل التلقائي.');
    }
    else if (query.data === 'create_manual') {
        if (isProcessing) return bot.sendMessage(chatId, '⚠️ مشغول حالياً. انتظر.');
        userState[chatId] = { step: 'awaiting_email' };
        bot.sendMessage(chatId, '➡️ أرسل **إيميلك** فقط:', { parse_mode: 'Markdown' });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text   = msg.text?.trim();
    if (!userState[chatId] || !text || text.startsWith('/')) return;

    if (userState[chatId].step === 'awaiting_email') {
        if (!text.includes('@')) return bot.sendMessage(chatId, '❌ إيميل غير صحيح.');
        const pwd = generateSecurePassword();
        delete userState[chatId];
        isProcessing = true;
        await bot.sendMessage(chatId, `✅ تم.\n🔑 الباسورد: \`${pwd}\``, { parse_mode: 'Markdown' });
        await createAccountLogic(chatId, 1, 1, { email: text, password: pwd });
        isProcessing = false;
        bot.sendMessage(chatId, '🏁 اكتمل اليدوي.');
    }
});

bot.onText(/\/accounts/, (msg) => {
    const file = path.join(__dirname, ACCOUNTS_FILE);
    if (!fs.existsSync(file)) return bot.sendMessage(msg.chat.id, '📭 لا توجد حسابات محفوظة.');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    if (!lines.length) return bot.sendMessage(msg.chat.id, '📭 لا توجد حسابات.');
    const out = lines.map((l, i) => `${i + 1}. \`${l}\``).join('\n');
    bot.sendMessage(msg.chat.id, `📋 *الحسابات المحفوظة:*\n\n${out}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, (msg) => {
    bot.sendMessage(msg.chat.id, isProcessing ? '🟢 جاري العمل...' : '⚪ لا توجد مهمة نشطة.');
});

bot.on('polling_error', (err) => console.error('Polling error:', err.message));
process.on('uncaughtException',   (err) => console.error('Uncaught:', err));
process.on('unhandledRejection',  (r)   => console.error('Unhandled:', r));

console.log(`🤖 البوت يعمل (الاصدار 27 - تم الإصلاح) — Plus: ${ENABLE_PLUS ? 'مفعّل ✅' : 'معطّل ⚪'}`);
