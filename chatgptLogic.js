// chatgptLogic.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth); 

const PlaywrightCodeGenerator = require('./CodeGenerator');
const { generateSecurePassword, createMailTmAccount, waitForMailTmCode, sleep } = require('./mailApi');
const { sendErrorScreenshot, drawGridAndScreenshot } = require('./browserUtils');

const ACCOUNTS_FILE = 'accounts.txt';

// ========================================================
// 🛑 قائمة التخطي (حسب منطقك البرمجي)
// ========================================================
const SKIP_WORDS = [
    'Skip Tour',
    'Skip',
    'Continue',
    'Okay',
    'Next',
    'Done',
    "Okay, let's go"
];

// دالة تدمير النوافذ الترحيبية الذكية
async function nukePopups(page) {
    if (!page || page.isClosed()) return;
    try {
        await page.keyboard.press('Escape').catch(()=>{});

        // 1. فحص نافذة: You're all set
        try {
            const allSetText = page.locator('text="You\'re all set"').first();
            if (await allSetText.isVisible({ timeout: 500 }).catch(() => false)) {
                const continueBtn = page.locator('button:has-text("Continue")').first();
                if (await continueBtn.isVisible({ timeout: 500 }).catch(() => false)) {
                    await continueBtn.click({ force: true });
                    await sleep(1000);
                }
            }
        } catch (e) {}

        // 2. فحص نافذة: Tips for getting started
        try {
            const tipsText = page.locator('text="Tips for getting started"').first();
            if (await tipsText.isVisible({ timeout: 500 }).catch(() => false)) {
                await page.mouse.click(986.56, 445.44).catch(()=>{}); 
                await sleep(1000);
                
                const okayBtn = page.locator('button:has-text("Okay, let\'s go")').first();
                if (await okayBtn.isVisible({ timeout: 500 }).catch(() => false)) {
                    await okayBtn.click({ force: true });
                    await sleep(500);
                }
            }
        } catch (e) {}

        // 3. المسح العادي الشامل لباقي الإشعارات
        for (let i = 0; i < 2; i++) {
            for (const pText of SKIP_WORDS) {
                try {
                    const btn = page.locator(`button:has-text("${pText}"):not(:has-text("Apple")):not(:has-text("Google")), a:has-text("${pText}"), [role="button"]:has-text("${pText}")`).last();
                    if (await btn.isVisible({ timeout: 400 }).catch(()=>false)) {
                        await btn.click({ force: true });
                        await sleep(300);
                        await page.keyboard.press('Enter').catch(()=>{});
                        await sleep(500);
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
}

// ================= دوال التحكم بالحالة والقوائم =================
async function updateStatusMessage(bot, chatId, text, messageId = null) {
    try {
        if (!messageId) {
            const sent = await bot.sendMessage(chatId, `⚡ ${text}`); return sent.message_id;
        } else {
            await bot.editMessageText(`⚡ ${text}`, { chat_id: chatId, message_id: messageId }).catch(async () => {
                const sent = await bot.sendMessage(chatId, `⚡ ${text}`); return sent.message_id;
            });
            return messageId;
        }
    } catch (err) { const sent = await bot.sendMessage(chatId, `⚡ ${text}`); return sent.message_id; }
}

async function sendInteractiveMenu(bot, chatId, text = "🎮 **أنت الآن تتحكم بالمتصفح:**") {
    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '🌐 البحث عن الرابط', callback_data: 'int_goto_url' }], [{ text: '🔍 البحث على النص والضغط عليه', callback_data: 'int_search_text' }],
        [{ text: '🖱️ ضغط ماوس (شبكة شفافة)', callback_data: 'int_mouse_menu' }], [{ text: '⌨️ كتابة نص', callback_data: 'int_type_text' }, { text: '↩️ انتر (Enter)', callback_data: 'int_press_enter' }],
        [{ text: '📸 تحديث الشاشة', callback_data: 'int_refresh' }, { text: '🔐 المتابعة الى AF2', callback_data: 'int_continue_af2' }],
        [{ text: '✅ إنهاء الجلسة واستخراج السكربت', callback_data: 'int_finish' }]
    ]}}; await bot.sendMessage(chatId, text, opts);
}

async function sendMouseMenu(bot, chatId) {
    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '👁️ مشاهدة المربعات الشفافة', callback_data: 'int_show_grid' }], [{ text: '🧭 إرسال رقم المربع', callback_data: 'int_move_mouse' }],
        [{ text: '🔴 كليك (Click)', callback_data: 'int_click_mouse' }], [{ text: '🔙 رجوع', callback_data: 'int_back_main' }]
    ]}}; await bot.sendMessage(chatId, `🖱️ **التحكم بالماوس:**`, opts);
}

async function startInteractiveMode(bot, userState, chatId, page, context, tempDir, codeGen, onFinish) {
    userState[chatId].isInteractive = true; userState[chatId].page = page; userState[chatId].context = context; userState[chatId].tempDir = tempDir; userState[chatId].codeGen = codeGen;
    await sendInteractiveMenu(bot, chatId);
    return new Promise(resolve => { 
        userState[chatId].resolveInteractive = resolve; 
        setTimeout(() => {
            if (userState[chatId] && userState[chatId].isInteractive) {
                bot.sendMessage(chatId, "⏳ انتهت مهلة التحكم اليدوي."); userState[chatId].isInteractive = false;
                if (userState[chatId].context) userState[chatId].context.close().catch(()=>{});
                if (userState[chatId].tempDir) try { fs.rmSync(userState[chatId].tempDir, { recursive: true, force: true }); } catch {}
                onFinish(); resolve();
            }
        }, 15 * 60 * 1000);
    });
}

// ================= الدالة الرئيسية لإنشاء الحساب =================
async function createAccountLogic(bot, userState, chatId, isManual, manualData, onFinish, sendMainMenu, ADMIN_ID, enableLiveMonitor) {
    let modeText = isManual ? "(يدوي)" : "(تلقائي)";
    let statusMsgID = null;
    userState[chatId] = { step: null, cancel: false, isInteractive: false };
    const codeGen = new PlaywrightCodeGenerator();
    const checkCancel = () => { if (userState[chatId]?.cancel) throw new Error("CANCELLED_BY_USER"); };
    const updateStatus = async (text) => { checkCancel(); statusMsgID = await updateStatusMessage(bot, chatId, `${modeText}: ${text}`, statusMsgID); return statusMsgID; };

    await updateStatus("بدء العملية...");
    let email, mailToken; let chatGptPassword = isManual ? manualData.password : generateSecurePassword();

    if (isManual) { email = manualData.email; } else {
        try { const mailData = await createMailTmAccount(); email = mailData.email; mailToken = mailData.token; } 
        catch (e) { await bot.sendMessage(chatId, `❌ فشل إنشاء البريد`); return false; }
    }

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'cg_wrk_'));
    let context, page;
    let isMonitorRunning = true; 

    try {
        context = await chromium.launchPersistentContext(tempDir, { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'], viewport: { width: 1366, height: 768 } });
        page = await context.newPage();

        const monitorTask = async () => {
            while(isMonitorRunning && page && !page.isClosed()) {
                await sleep(5000); 
                if (!isMonitorRunning || !page || page.isClosed()) break;
                try {
                    const buffer = await page.screenshot({ timeout: 5000 });
                    await bot.sendPhoto(ADMIN_ID, buffer, { disable_notification: true }).catch(()=>{});
                } catch(e){}
            }
        };
        if (enableLiveMonitor) monitorTask();

        codeGen.addStep("الدخول لصفحة التسجيل");
        codeGen.addCommand(`await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" });`);
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await updateStatus("فتح المتصفح وتدمير أزرار Apple و Google...");

        const nukeThirdPartyBtns = async () => {
            try {
                await page.evaluate(() => {
                    const buttons = document.querySelectorAll('button, a, [role="button"]');
                    buttons.forEach(btn => {
                        const text = (btn.innerText || btn.textContent || '').toLowerCase();
                        if (text.includes('apple') || text.includes('google') || text.includes('microsoft')) {
                            btn.remove(); 
                        }
                    });
                });
            } catch(e) {}
        };

        await sleep(3000);
        await nukeThirdPartyBtns(); 

        try {
            const authBtn = page.locator('button:has-text("Log in"), a:has-text("Log in"), button:has-text("Sign up")').first();
            if (await authBtn.isVisible({ timeout: 2000 }).catch(()=>false)) { await authBtn.click(); await sleep(2000); }
        } catch (e) {}

        await nukeThirdPartyBtns(); 

        if (page.url().includes('apple.com') || page.url().includes('appleid')) {
            await page.goBack().catch(()=>{}); await sleep(3000); await nukeThirdPartyBtns();
        }

        await updateStatus("إدخال الإيميل بتركيز...");
        codeGen.addStep("إدخال الإيميل والمتابعة بدقة");
        
        const emailInput = page.locator('input[type="email"], input[name="email"], input[name="username"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 20000 }).catch(()=>{});
        
        if (await emailInput.isVisible().catch(()=>false)) {
            await emailInput.click({ force: true }); await sleep(500); await emailInput.fill(email);
        } else { await page.keyboard.type(email); }
        codeGen.addCommand(`await page.locator('input[type="email"]').first().fill("${email}");`);
        await sleep(1500);

        await nukeThirdPartyBtns(); 

        const emailSubmitBtn = page.locator('button[type="submit"], button:has-text("Continue")').first();
        if (await emailSubmitBtn.isVisible({timeout: 2000}).catch(()=>false)) {
            await emailSubmitBtn.click({ force: true });
        } else {
            if (await emailInput.isVisible().catch(()=>false)) await emailInput.focus();
            await page.keyboard.press('Enter');
        }
        
        codeGen.addCommand(`await page.locator('button[type="submit"]').first().click();`);
        await sleep(4000);

        codeGen.addStep("إدخال كلمة المرور والمتابعة");
        const passSelectors = 'input[type="password"], input[name="password"]'; await page.waitForSelector(passSelectors, {timeout: 30000}).catch(()=>{});
        const passInput = page.locator(passSelectors).first();
        
        if (await passInput.isVisible().catch(()=>false)) {
            await passInput.click({force: true}); await sleep(500); await passInput.fill(chatGptPassword); 
        } else { await page.keyboard.type(chatGptPassword); }
        codeGen.addCommand(`await page.locator('input[type="password"]').first().fill("${chatGptPassword}");`);
        await sleep(1000); 
        
        await page.keyboard.press('Enter'); 
        codeGen.addCommand(`await page.keyboard.press('Enter');`); 
        await sleep(7000); 

        checkCancel(); await updateStatus("في انتظار صفحة الكود...");
        
        let code = null;
        if (isManual) {
            await bot.sendMessage(chatId, "🛑 أرسل الكود (6 أرقام).");
            code = await new Promise((resolve) => { const listener = (msg) => { if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { bot.removeListener('message', listener); resolve(msg.text.trim()); } }; bot.on('message', listener); });
        } else { code = await waitForMailTmCode(email, mailToken, userState, chatId, 100); }

        if (code) {
            codeGen.addStep("إدخال كود التحقق");
            const codeInput = page.locator('input[inputmode="numeric"], input[name="code"], input[type="text"]').first();
            await codeInput.waitFor({ state: 'visible', timeout: 10000 }).catch(()=>{});
            
            if (await codeInput.isVisible().catch(()=>false)) {
                await codeInput.click({ force: true }); await sleep(500); await codeInput.fill(code);
            } else { await page.keyboard.type(code); }
            codeGen.addCommand(`await page.keyboard.type("${code}");`); await sleep(2000);
        }

        const continueBtnAfterCode = page.locator('button:has-text("Continue"), button[type="submit"]').last();
        if (await continueBtnAfterCode.isVisible({timeout: 2000}).catch(()=>false)) await continueBtnAfterCode.click({ force: true }); else await page.keyboard.press('Enter');
        await sleep(5000); 

        const nameInputNode = page.locator('input[name="fullname"], input[id="fullname"], [placeholder*="name" i], [aria-label*="name" i]').first();
        if (await nameInputNode.isVisible({ timeout: 10000 }).catch(() => false)) {
            codeGen.addStep("تعبئة الاسم وتاريخ الميلاد"); 
            await nameInputNode.click({ force: true }).catch(()=>{}); await sleep(500); await nameInputNode.fill("Auto User"); await sleep(1000);
            
            const bdayInput = page.locator('input[name="birthday"], input[id="birthday"], [aria-label*="birthday" i], [placeholder*="YYYY" i]').first();
            const ageInput = page.locator('input[name="age"], input[id="age"], [placeholder*="Age" i]').first();

            if (await bdayInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await bdayInput.focus().catch(()=>{}); await bdayInput.click({ force: true }).catch(()=>{});
                for (let j = 0; j < 10; j++) await page.keyboard.press('Backspace'); await page.keyboard.type("01012000", { delay: 100 });
            } else if (await ageInput.isVisible({ timeout: 1000 }).catch(() => false)) {
                await ageInput.focus().catch(()=>{}); await ageInput.click({ force: true }).catch(()=>{});
                for (let j = 0; j < 4; j++) await page.keyboard.press('Backspace'); await page.keyboard.type("25", { delay: 100 });
            } else {
                await page.keyboard.press('Tab'); const pageTxt = await page.innerText('body').catch(()=>"");
                if (pageTxt.toLowerCase().includes("birthday") || pageTxt.includes("YYYY")) await page.keyboard.type("01012000", { delay: 100 }); else await page.keyboard.type("25", { delay: 100 });
            }
            const finishBtn = page.locator('button:has-text("Finish creating account"), button:has-text("Continue"), button:has-text("Agree")').last();
            if (await finishBtn.isVisible().catch(() => false)) await finishBtn.click({ force: true }); else await page.keyboard.press('Enter');
            await sleep(8000); await updateStatus("تم ملء بيانات العمر.");
        } else {
            const bodyTxt = await page.innerText('body').catch(()=>"");
            if(bodyTxt.toLowerCase().includes('verify your phone number') || bodyTxt.toLowerCase().includes('phone number')) {
                throw new Error("يطلب الموقع التحقق برقم هاتف. لا يمكن إكمال التسجيل.");
            }
        }

        await updateStatus("في انتظار الصفحة الرئيسية...");
        let isMainReady = false;
        for (let i = 0; i < 15; i++) {
            const currentUrl = page.url(); const bodyTxt = await page.innerText('body').catch(()=>"");
            
            // تطبيق فحص النوافذ الذكي أثناء الانتظار
            await nukePopups(page);

            if ((currentUrl.includes('chatgpt.com') && !currentUrl.includes('auth') && !currentUrl.includes('login')) || bodyTxt.includes('Where should we begin?') || bodyTxt.includes('How can I help you') || await page.locator('#prompt-textarea').isVisible().catch(()=>false)) { isMainReady = true; break; }
            await sleep(2000);
        }

        if (isMainReady) {
             fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), `${email}|${chatGptPassword}\n`);
             userState[chatId].accountInfo = { email: email, password: chatGptPassword };

             await updateStatus("تخطي الشاشات الترحيبية إن وجدت...");
             // استخدام دالة النوافذ الذكية الخاصة بك هنا!
             await nukePopups(page);

             await updateStatus("التحويل لإعدادات الأمان...");
             await page.goto("https://chatgpt.com/#settings/Security", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
             await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{}); await sleep(5000); 

             await updateStatus("مسح أي نوافذ تحجب الماوس...");
             // استخدام دالة النوافذ الذكية الخاصة بك قبل الضغط على 2FA
             await nukePopups(page);

             const mfaVisible = await page.locator('text="Multi-factor authentication"').first().isVisible().catch(()=>false);
             if (!mfaVisible) { await page.goto("https://chatgpt.com/").catch(()=>{}); await sleep(1000); await page.goto("https://chatgpt.com/#settings/Security").catch(()=>{}); await sleep(4000); }

             try { await page.mouse.click(986.56, 353.28); } catch(e) {} await sleep(3000);

             try {
                 let troubleBtn = page.locator('text="Trouble scanning?"').first();
                 if (!(await troubleBtn.isVisible({ timeout: 2000 }).catch(()=>false))) { const smartEnableBtn = page.locator('button:has-text("Enable"), button:has-text("Set up")').last(); if (await smartEnableBtn.isVisible({ timeout: 1500 }).catch(()=>false)) { await smartEnableBtn.click({ force: true }); await sleep(2000); } }
                 if (await troubleBtn.isVisible({ timeout: 2000 }).catch(()=>false)) await troubleBtn.click(); else await page.locator('text="Trouble scanning?"').first().click({ force: true }).catch(()=>{});
             } catch(e) {} await sleep(2000);
             
             const pageText = await page.innerText('body'); const secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);
             
             if (secretMatch) {
                 const secretCode = secretMatch[0]; await updateStatus(`تم العثور على الكود: ${secretCode}`);
                 const mfaPage = await context.newPage(); await mfaPage.goto(`https://2fa.fb.tools/${secretCode}`).catch(()=>{}); await sleep(3000);
                 const mfaText = await mfaPage.innerText('body'); const code6Match = mfaText.match(/\b\d{3}\s*\d{3}\b/);
                 
                 if (code6Match) {
                     const code6 = code6Match[0].replace(/\s+/g, ''); await mfaPage.close(); await page.bringToFront();
                     const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();
                     if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code6); else await page.keyboard.type(code6, { delay: 100 });
                     
                     await sleep(1500); const enableBtn = page.locator('button:has-text("Enable"), button:has-text("Verify")').first();
                     if (await enableBtn.isVisible().catch(()=>false)) await enableBtn.click(); else await page.keyboard.press('Enter');
                     await sleep(3000); if (statusMsgID) { await bot.deleteMessage(chatId, statusMsgID).catch(()=>{}); }
                     
                     await bot.sendMessage(chatId, `✅ **تم إنشاء الحساب بنجاح!**\n📧 **الإيميل:** \`${email}\`\n🔑 **الباسورد:** \`${chatGptPassword}\`\n🔗 **المصادقة:** https://2fa.fb.tools/${secretCode}`, { parse_mode: 'Markdown' });
                     
                     try {
                         await page.goto("https://chatgpt.com/api/auth/session", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{}); await sleep(2000);
                         let sessionText = ""; try { sessionText = await page.innerText('body'); } catch (err) { sessionText = "لا توجد بيانات"; }
                         const sessionFilePath = path.join(__dirname, `session_${Date.now()}.txt`); fs.writeFileSync(sessionFilePath, sessionText);
                         await bot.sendDocument(chatId, sessionFilePath, { caption: "📄 **بيانات السشن**" }).catch(()=>{}); if (fs.existsSync(sessionFilePath)) fs.unlinkSync(sessionFilePath);
                     } catch (sessionErr) {}

                     isMonitorRunning = false;
                     if (context) await context.close().catch(()=>{}); if (tempDir) try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
                     const jsCode = codeGen.getFinalScript(); const logPath = path.join(__dirname, `AutoGenerated_Script_${Date.now()}.js`); fs.writeFileSync(logPath, jsCode);
                     await bot.sendDocument(chatId, logPath, { caption: "🧑‍💻 **تم التوليد!**", parse_mode: 'Markdown' }); fs.unlinkSync(logPath);
                     onFinish(); sendMainMenu(chatId); return true;
                 }
             }
             
             throw new Error("لم يتم العثور على كود الأمان ذو الـ 32 حرفاً.");

        } else { throw new Error(`تعذر التعرف على واجهة الصفحة.`); }

    } catch (error) {
        isMonitorRunning = false; 
        if (error.message === "CANCELLED_BY_USER") { if (context) await context.close().catch(()=>{}); try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} return false; }
        
        try { if (page && !page.isClosed()) await page.evaluate(() => window.stop()); } catch(e){}
        
        if (chatId === ADMIN_ID) {
            userState[chatId].isInteractive = true;
            await bot.sendMessage(chatId, `⚠️ **توقف للحماية:** تم تحويلك للتحكم اليدوي.\n(السبب: ${error.message})`);
            if (page && context && !userState[chatId].cancel) {
                await sendErrorScreenshot(page, bot, chatId, error.message); 
                await startInteractiveMode(bot, userState, chatId, page, context, tempDir, codeGen, onFinish);
            } else { await bot.sendMessage(chatId, `⚠️ **فشل كلي.**`); onFinish(); }
        } else {
            await bot.sendMessage(chatId, `⚠️ **عذراً، حدث خطأ أثناء إنشاء الحساب.** تم إرسال الخطأ للإدارة للمراجعة.`);
            await bot.sendMessage(ADMIN_ID, `⚠️ **فشل للمستخدم [\`${chatId}\`]:**\n${error.message}`, {parse_mode: 'Markdown'});
            if (page && context) {
                const buffer = await page.screenshot({ timeout: 15000 }).catch(() => null);
                if (buffer) await bot.sendPhoto(ADMIN_ID, buffer, { caption: `📸 شاشة الخطأ` }).catch(()=>{});
            }
            if (context) await context.close().catch(()=>{}); try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
            onFinish();
        }
    } finally {
        isMonitorRunning = false;
        if (userState[chatId] && !userState[chatId].isInteractive) { if (context) await context.close().catch(()=>{}); try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} onFinish(); }
    }
    return true;
}

module.exports = {
    createAccountLogic,
    sendInteractiveMenu,
    sendMouseMenu
};
