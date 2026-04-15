// chatgptLogic.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth); // تفعيل التخفي هنا قبل تشغيل المتصفح

const PlaywrightCodeGenerator = require('./CodeGenerator');
const { generateSecurePassword, createMailTmAccount, waitForMailTmCode, sleep } = require('./mailApi');
const { sendErrorScreenshot, drawGridAndScreenshot } = require('./browserUtils');

const ACCOUNTS_FILE = 'accounts.txt';

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
async function createAccountLogic(bot, userState, chatId, isManual, manualData, onFinish, sendMainMenu) {
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

    try {
        context = await chromium.launchPersistentContext(tempDir, { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'], viewport: { width: 1366, height: 768 } });
        page = await context.newPage();

        codeGen.addStep("الدخول لصفحة التسجيل");
        codeGen.addCommand(`await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" });`);
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await updateStatus("فتح المتصفح ومحاولة تخطي الواجهات...");

        try {
            await sleep(3000); const signupBtn = page.locator('button:has-text("Sign up"), a:has-text("Sign up")').first();
            const loginBtn = page.locator('button:has-text("Log in"), a:has-text("Log in"), [data-testid="login-button"]').first();
            if (await signupBtn.isVisible({ timeout: 2000 }).catch(()=>false)) await signupBtn.click();
            else if (await loginBtn.isVisible({ timeout: 2000 }).catch(()=>false)) { await loginBtn.click(); await sleep(2000); const innerSignup = page.locator('a:has-text("Sign up")').first(); if (await innerSignup.isVisible({ timeout: 2000 }).catch(()=>false)) await innerSignup.click(); }
        } catch (e) {}
        
        await updateStatus("البحث عن حقل الإيميل...");
        codeGen.addStep("إدخال الإيميل والمتابعة");
        const emailSelectors = 'input[name="email"], input[id="email-input"], input[type="email"]';
        await page.waitForSelector(emailSelectors, {timeout: 20000}).catch(()=>{});
        
        const emailInput = page.locator(emailSelectors).first();
        if (await emailInput.isVisible().catch(()=>false)) {
            await emailInput.click(); // النقر الإجباري لتجنب زر آبل
            await sleep(500);
            await emailInput.fill(email); 
        } else {
            await page.keyboard.type(email);
        }
        
        codeGen.addCommand(`await page.locator('input[type="email"]').first().fill("${email}");`);
        await sleep(1500); 
        
        // الضغط على زر المتابعة الأساسي فقط
        const continueBtn1 = page.locator('button[type="submit"], button[name="action"][value="default"], button:has-text("Continue"):not(:has-text("Apple")):not(:has-text("Google"))').first();
        
        if (await continueBtn1.isVisible({timeout: 2000}).catch(()=>false)) {
            await continueBtn1.click({ force: true });
        } else {
            await page.keyboard.press('Enter'); 
        }
        
        codeGen.addCommand(`// تم الضغط على زر المتابعة`); 
        await sleep(4000);

        codeGen.addStep("إدخال كلمة المرور والمتابعة");
        const passSelectors = 'input[type="password"], input[name="password"]'; await page.waitForSelector(passSelectors, {timeout: 30000}).catch(()=>{});
        const passInput = page.locator(passSelectors).first();
        if (await passInput.isVisible().catch(()=>false)) await passInput.fill(chatGptPassword); else await page.keyboard.type(chatGptPassword);
        codeGen.addCommand(`await page.locator('input[type="password"]').first().fill("${chatGptPassword}");`);
        await sleep(1000); await page.keyboard.press('Enter'); await sleep(1500);
        const continueBtn2 = page.locator('button[type="submit"], button:has-text("Continue")').first();
        if (await continueBtn2.isVisible({timeout: 1000}).catch(()=>false)) await continueBtn2.click({ force: true });
        codeGen.addCommand(`await page.keyboard.press('Enter');`); await sleep(7000); 

        checkCancel(); await updateStatus("في انتظار صفحة الكود...");
        
        let code = null;
        if (isManual) {
            await bot.sendMessage(chatId, "🛑 أرسل الكود (6 أرقام).");
            code = await new Promise((resolve) => { const listener = (msg) => { if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { bot.removeListener('message', listener); resolve(msg.text.trim()); } }; bot.on('message', listener); });
        } else { code = await waitForMailTmCode(email, mailToken, userState, chatId, 100); }

        if (code) {
            codeGen.addStep("إدخال كود التحقق");
            const codeInput = page.getByRole("textbox", { name: "Code" });
            await codeInput.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => { await page.keyboard.type(code); });
            if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code);
            codeGen.addCommand(`await page.keyboard.type("${code}");`); await sleep(2000);
        }

        const continueBtnAfterCode = page.locator('button:has-text("Continue")').last();
        if (await continueBtnAfterCode.isVisible().catch(()=>false)) await continueBtnAfterCode.click({ force: true }); else await page.keyboard.press('Enter');
        await sleep(5000); 

        const nameInputNode = page.getByRole("textbox", { name: "Full name" }).first();
        if (await nameInputNode.isVisible({ timeout: 15000 }).catch(() => false)) {
            codeGen.addStep("تعبئة الاسم وتاريخ الميلاد"); await nameInputNode.fill("Auto User"); await sleep(1000);
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
            const finishBtn = page.locator('button:has-text("Finish creating account"), button:has-text("Continue")').last();
            if (await finishBtn.isVisible().catch(() => false)) await finishBtn.click({ force: true }); else await page.keyboard.press('Enter');
            await sleep(8000); await updateStatus("تم ملء بيانات العمر.");
        }

        await updateStatus("في انتظار الصفحة الرئيسية...");
        let isMainReady = false;
        for (let i = 0; i < 15; i++) {
            const currentUrl = page.url(); const bodyTxt = await page.innerText('body').catch(()=>"");
            if (bodyTxt.includes("You're all set") || bodyTxt.includes("ChatGPT can make mistakes")) {
                try {
                    const continueBtn = page.locator('button:has-text("Continue"), [role="button"]:has-text("Continue")').last();
                    if (await continueBtn.isVisible({timeout: 1000}).catch(()=>false)) { await continueBtn.click({force: true}); await sleep(1500); } else { await page.keyboard.press('Enter'); await sleep(1000); }
                } catch(e) {}
            }
            if ((currentUrl.includes('chatgpt.com') && !currentUrl.includes('auth') && !currentUrl.includes('login')) || bodyTxt.includes('Where should we begin?') || await page.locator('#prompt-textarea').isVisible().catch(()=>false)) { isMainReady = true; break; }
            await sleep(2000);
        }

        if (isMainReady) {
             fs.appendFileSync(path.join(__dirname, ACCOUNTS_FILE), `${email}|${chatGptPassword}\n`);
             userState[chatId].accountInfo = { email: email, password: chatGptPassword };

             await updateStatus("تخطي الشاشات الترحيبية إن وجدت...");
             try { for (let k = 0; k < 3; k++) { const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Okay")').last(); if (await continueBtn.isVisible({ timeout: 1000 }).catch(()=>false)) { await continueBtn.click({ force: true }); await sleep(1500); } } } catch(e) {}

             await updateStatus("التحويل لإعدادات الأمان...");
             await page.goto("https://chatgpt.com/#settings/Security", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
             await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{}); await sleep(5000); 

             await updateStatus("مسح أي نوافذ تحجب الماوس...");
             await page.keyboard.press('Escape').catch(()=>{}); await sleep(1000);
             const popupTexts = ['Continue', 'Skip Tour', 'Skip', 'Next', 'Okay', 'Done'];
             for (let i = 0; i < 2; i++) { for (const pText of popupTexts) { try { const btn = page.locator(`button:has-text("${pText}")`).last(); if (await btn.isVisible({ timeout: 500 }).catch(()=>false)) { await btn.click({ force: true }); await sleep(1000); } } catch (e) {} } }

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

                     if (context) await context.close().catch(()=>{}); if (tempDir) try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
                     const jsCode = codeGen.getFinalScript(); const logPath = path.join(__dirname, `AutoGenerated_Script_${Date.now()}.js`); fs.writeFileSync(logPath, jsCode);
                     await bot.sendDocument(chatId, logPath, { caption: "🧑‍💻 **تم التوليد!**", parse_mode: 'Markdown' }); fs.unlinkSync(logPath);
                     onFinish(); sendMainMenu(chatId); return true;
                 }
             }
             
             await bot.sendMessage(chatId, "⚠️ **لم يتم العثور على الكود، سيتم تحويلك للتحكم اليدوي.**");
             await drawGridAndScreenshot(page, bot, chatId, "🔲 **صورة الشاشة:**"); await startInteractiveMode(bot, userState, chatId, page, context, tempDir, codeGen, onFinish);

        } else { throw new Error(`تعذر التعرف على واجهة الصفحة.`); }

    } catch (error) {
        if (error.message === "CANCELLED_BY_USER") { if (context) await context.close().catch(()=>{}); try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} return false; }
        if (userState[chatId]) userState[chatId].isInteractive = true;
        try { if (page && !page.isClosed()) await page.evaluate(() => window.stop()); } catch(e){}
        await bot.sendMessage(chatId, `⚠️ **توقف للحماية:** تم تحويلك للتحكم اليدوي.`);
        if (page && context && !userState[chatId].cancel) {
            await sendErrorScreenshot(page, bot, chatId, error.message); await startInteractiveMode(bot, userState, chatId, page, context, tempDir, codeGen, onFinish);
        } else { await bot.sendMessage(chatId, `⚠️ **فشل كلي.**`); onFinish(); }
    } finally {
        if (userState[chatId] && !userState[chatId].isInteractive) { if (context) await context.close().catch(()=>{}); try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} onFinish(); }
    }
    return true;
}

module.exports = {
    createAccountLogic,
    sendInteractiveMenu,
    sendMouseMenu
};
