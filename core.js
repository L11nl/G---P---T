const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { bot, userState } = require('./bot');
const { t } = require('./locales');
const { sleep, generateSecurePassword, updateStatusMessage, sendErrorScreenshot } = require('./utils');
const { createMailTmAccount, waitForMailTmCode } = require('./mail');
const { SKIP_WORDS, nukePopups } = require('./popups');
const PlaywrightCodeGenerator = require('./generator');
const { drawGridAndScreenshot } = require('./grid');
const { extractPaymentLink } = require('./promo'); 

async function sendInteractiveMenu(chatId) {
    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '🌐 البحث عن الرابط', callback_data: 'int_goto_url' }], [{ text: '🔍 البحث على النص والضغط عليه', callback_data: 'int_search_text' }],
        [{ text: '🖱️ ضغط ماوس (شبكة شفافة)', callback_data: 'int_mouse_menu' }], [{ text: '⌨️ كتابة نص', callback_data: 'int_type_text' }, { text: '↩️ انتر (Enter)', callback_data: 'int_press_enter' }],
        [{ text: '📸 تحديث الشاشة', callback_data: 'int_refresh' }, { text: '🔐 المتابعة الى AF2', callback_data: 'int_continue_af2' }],
        [{ text: '✅ إنهاء الجلسة واستخراج السكربت', callback_data: 'int_finish' }]
    ]}}; await bot.sendMessage(chatId, t(chatId, 'interactiveMenu'), opts);
}

async function startInteractiveMode(chatId, page, context, tempDir, codeGen) {
    userState[chatId].isInteractive = true; userState[chatId].page = page; userState[chatId].context = context;
    userState[chatId].tempDir = tempDir; userState[chatId].codeGen = codeGen;
    await sendInteractiveMenu(chatId);
    
    return new Promise(resolve => { 
        userState[chatId].resolveInteractive = resolve; 
        setTimeout(() => {
            if (userState[chatId] && userState[chatId].isInteractive) {
                bot.sendMessage(chatId, "⏳ انتهت مهلة التحكم اليدوي (15 دقيقة). تم إنهاء الجلسة تلقائياً للحفاظ على الموارد.");
                userState[chatId].isInteractive = false;
                if (userState[chatId].context) userState[chatId].context.close().catch(()=>{});
                if (userState[chatId].tempDir) try { fs.rmSync(userState[chatId].tempDir, { recursive: true, force: true }); } catch {}
                resolve();
            }
        }, 15 * 60 * 1000);
    });
}

async function createAccountLogic(chatId, isManual, manualData = null, sendMainMenuCallback) {
    // 🟢 توليد رقم فريد لكل عملية (لتشغيل عدة إيميلات معاً بوضوح)
    const taskId = Math.floor(1000 + Math.random() * 9000); 
    let modeText = isManual ? `(Manual - #${taskId})` : `(Auto - #${taskId})`;
    
    let statusMsgID = null;
    
    // 🟢 حل مشكلة التوقف: تصفير حالة الإلغاء السابقة عند بدء أي عملية جديدة
    if (!userState[chatId]) {
        userState[chatId] = { lang: 'ar', cancel: false };
    } else {
        userState[chatId].cancel = false; 
    }

    const codeGen = new PlaywrightCodeGenerator();
    const checkCancel = () => { if (userState[chatId]?.cancel) throw new Error("CANCELLED_BY_USER"); };
    
    const updateStatus = async (text) => { 
        checkCancel(); 
        statusMsgID = await updateStatusMessage(chatId, `[#${taskId}] ${modeText}: ${text}`, statusMsgID); 
        return statusMsgID; 
    };

    await updateStatus(t(chatId, 'startProcess'));
    let email, mailToken;
    let chatGptPassword = isManual ? manualData.password : generateSecurePassword();

    if (isManual) { email = manualData.email; } else {
        try { const mailData = await createMailTmAccount(chatId); email = mailData.email; mailToken = mailData.token;
        } catch (e) { await bot.sendMessage(chatId, `❌ [#${taskId}] فشل إنشاء البريد المؤقت`); return false; }
    }

    // 🟢 مجلد مؤقت مستقل لكل عملية لمنع التداخل
    const tempDir = fs.mkdtempSync(path.join(__dirname, `cg_wrk_${taskId}_`));
    let context, page;

    try {
        // 🟢 إعدادات متقدمة للـ Multi-threading لتقليل استهلاك الرام وجعله متخفي تماماً
        context = await chromium.launchPersistentContext(tempDir, {
            headless: true, 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage', // 👈 ضروري جداً لتشغيل متصفحات متعددة دون تعليق السيرفر
                '--disable-gpu',           // 👈 توفير موارد المعالج
                '--no-first-run',
                '--no-zygote'
            ],
            viewport: { width: 1366, height: 768 }
        });
        page = await context.newPage();

        codeGen.addStep("تهيئة المتصفح والدخول لصفحة التسجيل");
        codeGen.addCommand(`await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" });`);
        await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        await updateStatus(t(chatId, 'browserOpen'));

        try {
            await sleep(3000);
            const signupBtn = page.locator('button:has-text("Sign up"), a:has-text("Sign up")').first();
            const loginBtn = page.locator('button:has-text("Log in"), a:has-text("Log in"), [data-testid="login-button"]').first();
            if (await signupBtn.isVisible({ timeout: 2000 }).catch(()=>false)) await signupBtn.click();
            else if (await loginBtn.isVisible({ timeout: 2000 }).catch(()=>false)) {
                await loginBtn.click(); await sleep(2000);
                const innerSignup = page.locator('a:has-text("Sign up")').first();
                if (await innerSignup.isVisible({ timeout: 2000 }).catch(()=>false)) await innerSignup.click();
            }
        } catch (e) {}
        
        await updateStatus(t(chatId, 'findEmail'));
        codeGen.addStep("إدخال البريد الإلكتروني");
        const emailSelectors = 'input[name="email"], input[id="email-input"], input[type="email"]';
        await page.waitForSelector(emailSelectors, {timeout: 30000}).catch(()=>{});
        const emailInput = page.locator(emailSelectors).first();
        if (await emailInput.isVisible().catch(()=>false)) { await emailInput.fill(email); await sleep(500); await emailInput.press('Enter');
        } else { await page.keyboard.type(email); await page.keyboard.press('Enter'); }
        codeGen.addCommand(`await page.locator('input[type="email"]').first().fill("${email}");\n    await page.locator('input[type="email"]').first().press('Enter');`);
        
        await sleep(1500);
        const continueBtn1 = page.locator('button[type="submit"], button:has-text("Continue"):not(:has-text("Apple")):not(:has-text("Google")):not(:has-text("Microsoft"))').first();
        if (await continueBtn1.isVisible({timeout: 1000}).catch(()=>false)) await continueBtn1.click({ force: true });
        await sleep(3000);

        codeGen.addStep("إدخال كلمة المرور");
        const passSelectors = 'input[type="password"], input[name="password"]';
        await page.waitForSelector(passSelectors, {timeout: 30000}).catch(()=>{});
        const passInput = page.locator(passSelectors).first();
        if (await passInput.isVisible().catch(()=>false)) { await passInput.fill(chatGptPassword); await sleep(500); await passInput.press('Enter');
        } else { await page.keyboard.type(chatGptPassword); await page.keyboard.press('Enter'); }
        codeGen.addCommand(`await page.locator('input[type="password"]').first().fill("${chatGptPassword}");\n    await page.locator('input[type="password"]').first().press('Enter');`);
        
        await sleep(1500);
        const continueBtn2 = page.locator('button[type="submit"], button:has-text("Continue"):not(:has-text("Apple")):not(:has-text("Google")):not(:has-text("Microsoft"))').first();
        if (await continueBtn2.isVisible({timeout: 1000}).catch(()=>false)) await continueBtn2.click({ force: true });
        await sleep(7000); 

        checkCancel();
        await updateStatus(t(chatId, 'waitCode'));
        
        let code = null;
        if (isManual) {
            await bot.sendMessage(chatId, `[#${taskId}] 🛑 يرجى إرسال الكود المكون من 6 أرقام هنا في الشات:`);
            code = await new Promise((resolve) => {
                const listener = (msg) => { if (msg.chat.id === chatId && /^\d{6}$/.test(msg.text?.trim())) { bot.removeListener('message', listener); resolve(msg.text.trim()); } };
                bot.on('message', listener);
            });
        } else { code = await waitForMailTmCode(email, mailToken, chatId, 100); }

        if (code) {
            codeGen.addStep("إدخال كود التحقق (OTP)");
            await page.keyboard.type(code, { delay: 100 });
            codeGen.addCommand(`await page.keyboard.type("${code}");`);
            await sleep(2000);
        }

        const continueBtnAfterCode = page.locator('button:has-text("Continue"):not(:has-text("Apple")):not(:has-text("Google"))').first();
        if (await continueBtnAfterCode.isVisible().catch(()=>false)) await continueBtnAfterCode.click({ force: true });
        else await page.keyboard.press('Enter');
        await sleep(5000); 

        const nameInputNode = page.getByRole("textbox", { name: "Full name" }).first();
        if (await nameInputNode.isVisible({ timeout: 15000 }).catch(() => false)) {
            codeGen.addStep("تعبئة الاسم والتعرف الذكي على العمر أو تاريخ الميلاد");
            await nameInputNode.fill("Auto User"); await sleep(1000);
            const bdayInput = page.locator('input[name="birthday"], input[id="birthday"], [aria-label*="birthday" i], [placeholder*="YYYY" i]').first();
            const ageInput = page.locator('input[name="age"], input[id="age"], [placeholder*="Age" i]').first();

            if (await bdayInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await bdayInput.focus().catch(()=>{}); await bdayInput.click({ force: true }).catch(()=>{});
                for (let j = 0; j < 10; j++) await page.keyboard.press('Backspace'); 
                await page.keyboard.type("01012000", { delay: 100 });
            } else if (await ageInput.isVisible({ timeout: 1000 }).catch(() => false)) {
                await ageInput.focus().catch(()=>{}); await ageInput.click({ force: true }).catch(()=>{});
                for (let j = 0; j < 4; j++) await page.keyboard.press('Backspace');
                await page.keyboard.type("25", { delay: 100 });
            } else {
                await page.keyboard.press('Tab');
                const pageTxt = await page.innerText('body').catch(()=>"");
                if (pageTxt.toLowerCase().includes("birthday") || pageTxt.includes("YYYY")) { await page.keyboard.type("01012000", { delay: 100 }); } 
                else { await page.keyboard.type("25", { delay: 100 }); }
            }

            const finishBtn = page.locator('button:has-text("Finish creating account"), button:has-text("Continue"):not(:has-text("Apple"))').first();
            if (await finishBtn.isVisible().catch(() => false)) await finishBtn.click({ force: true });
            else await page.keyboard.press('Enter');
            await sleep(8000); 
            await updateStatus(t(chatId, 'ageSuccess'));
        }

        await updateStatus(t(chatId, 'waitMain'));
        
        let isMainReady = false;
        for (let i = 0; i < 15; i++) {
            await nukePopups(page);
            const currentUrl = page.url(); 
            const bodyTxt = await page.innerText('body').catch(()=>"");
            
            const hasNewUI = bodyTxt.includes('Where should we begin?') || bodyTxt.includes('Claim offer') || bodyTxt.includes('New chat') || bodyTxt.includes('Ready when you are');
            const hasTextarea = await page.locator('#prompt-textarea, [placeholder*="Message" i], [aria-label*="Message" i], [placeholder*="Ask anything" i]').isVisible().catch(()=>false);
            
            if ((currentUrl === 'https://chatgpt.com/' || currentUrl.startsWith('https://chatgpt.com/?')) || hasTextarea || hasNewUI) { 
                isMainReady = true; 
                break; 
            }
            await sleep(2000);
        }

        if (isMainReady) {
             const result = `${email}|${chatGptPassword}`;
             fs.appendFileSync(path.join(__dirname, config.ACCOUNTS_FILE), result + '\n');

             await updateStatus(t(chatId, 'nukingPopups'));
             await nukePopups(page);
             
             await updateStatus(t(chatId, 'successLogin'));
             
             codeGen.addStep("القفز المباشر لصفحة الأمان وتحديث الصفحة");
             await page.goto("https://chatgpt.com/#settings/Security", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
             await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
             codeGen.addCommand(`await page.goto("https://chatgpt.com/#settings/Security");\n    await page.reload({ waitUntil: "domcontentloaded" });`);
             
             await sleep(5000); 

             await updateStatus(t(chatId, 'nukingPopups'));
             await nukePopups(page); 

             const mfaVisible = await page.locator('text="Multi-factor authentication"').first().isVisible().catch(()=>false);
             const troubleVisibleCheck = await page.locator('text="Trouble scanning?"').first().isVisible().catch(()=>false);
             if (!mfaVisible && !troubleVisibleCheck) {
                 await updateStatus("إعادة فتح نافذة الأمان للتأكيد...");
                 await page.goto("https://chatgpt.com/").catch(()=>{});
                 await sleep(1000);
                 await page.goto("https://chatgpt.com/#settings/Security").catch(()=>{});
                 await sleep(4000);
             }

             codeGen.addStep("الضغط كليك بالماوس على المربع رقم (527)");
             try { await page.mouse.click(986.56, 353.28); } catch(e) {}
             codeGen.addCommand(`await page.mouse.click(986.56, 353.28);`);
             await sleep(3000);

             codeGen.addStep('البحث عن النص "Trouble scanning?" والضغط عليه لإظهار الكود السري');
             try {
                 let troubleBtn = page.locator('text="Trouble scanning?"').first();
                 if (!(await troubleBtn.isVisible({ timeout: 2000 }).catch(()=>false))) {
                     const smartEnableBtn = page.locator('button:has-text("Enable"), button:has-text("Set up")').last();
                     if (await smartEnableBtn.isVisible({ timeout: 1500 }).catch(()=>false)) { await smartEnableBtn.click({ force: true }); await sleep(2000); }
                 }
                 if (await troubleBtn.isVisible({ timeout: 2000 }).catch(()=>false)) await troubleBtn.click();
                 else await page.locator('text="Trouble scanning?"').first().click({ force: true }).catch(()=>{});
             } catch(e) {}
             codeGen.addCommand(`await page.locator('text="Trouble scanning?"').first().click();`);
             await sleep(2000);
             
             let secretCode = null;
             await updateStatus(t(chatId, 'findSecret'));
             
             codeGen.addStep("الانتظار الذكي واستخراج الكود 32");
             
             for (let attempt = 0; attempt < 15; attempt++) {
                 try {
                     let pageText = await page.innerText('body').catch(()=>"");
                     let secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);
                     
                     if (!secretMatch) {
                         pageText = await page.evaluate(() => document.documentElement.innerText).catch(()=>"");
                         secretMatch = pageText.match(/\b[A-Z2-7]{32}\b/);
                     }
                     
                     if (secretMatch) {
                         secretCode = secretMatch[0];
                         break; 
                     }
                 } catch(e) {}
                 await sleep(1000); 
             }
             
             if (secretCode) {
                 await updateStatus(`${t(chatId, 'foundSecret')} ${secretCode}`);
                 
                 codeGen.addRawBlock(`استخراج الكود السري وفتح نافذة 2fa.fb.tools لنسخ 6 أرقام ولصقها تلقائياً`, [
                    `const mfaPage = await context.newPage();`,
                    `await mfaPage.goto("https://2fa.fb.tools/${secretCode}", { waitUntil: "domcontentloaded" });`,
                    `await mfaPage.waitForTimeout(3000);`,
                    `const mfaText = await mfaPage.innerText('body');`,
                    `const code6Match = mfaText.match(/\\b\\d{3}\\s*\\d{3}\\b/);`,
                    `if (code6Match) {`,
                    `    const code6 = code6Match[0].replace(/\\s+/g, ''); await mfaPage.close(); await page.bringToFront();`,
                    `    const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();`,
                    `    if (await codeInput.isVisible()) { await codeInput.fill(code6); } else { await page.keyboard.type(code6, { delay: 100 }); }`,
                    `    await page.waitForTimeout(1500); const verifyBtn = page.locator('button:has-text("Verify"), button:has-text("Enable")').first();`,
                    `    if (await verifyBtn.isVisible()) { await verifyBtn.click(); } else { await page.keyboard.press('Enter'); } }`
                 ]);
                 
                 const mfaPage = await context.newPage();
                 await mfaPage.goto(`https://2fa.fb.tools/${secretCode}`).catch(()=>{});
                 await sleep(3000);
                 const mfaText = await mfaPage.innerText('body');
                 const code6Match = mfaText.match(/\b\d{3}\s*\d{3}\b/);
                 
                 if (code6Match) {
                     const code6 = code6Match[0].replace(/\s+/g, '');
                     await mfaPage.close(); await page.bringToFront();
                     
                     const codeInput = page.locator('input[type="text"], input[placeholder*="code" i]').first();
                     if (await codeInput.isVisible().catch(()=>false)) await codeInput.fill(code6);
                     else await page.keyboard.type(code6, { delay: 100 });
                     
                     await sleep(1500);
                     const verifyBtn = page.locator('button:has-text("Enable"), button:has-text("Verify")').first();
                     if (await verifyBtn.isVisible().catch(()=>false)) await verifyBtn.click();
                     else await page.keyboard.press('Enter');
                     await sleep(3000);
                     
                     if (statusMsgID) { await bot.deleteMessage(chatId, statusMsgID).catch(()=>{}); }
                     
                     await bot.sendMessage(chatId, `${t(chatId, 'done2FA')}\n\n🆔 **رقم العملية:** \`#${taskId}\`\n📧 **Email:** \`${email}\`\n🔑 **Password:** \`${chatGptPassword}\`\n🔗 **2FA Link:** https://2fa.fb.tools/${secretCode}`, { parse_mode: 'Markdown' });
                     
                     try {
                         codeGen.addStep("الدخول إلى رابط السشن واستخراج البيانات");
                         await page.goto("https://chatgpt.com/api/auth/session", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
                         codeGen.addCommand(`await page.goto("https://chatgpt.com/api/auth/session");`);
                         await sleep(2000); let sessionText = "";
                         try { sessionText = await page.innerText('body'); } catch (err) { sessionText = await page.evaluate(() => document.body ? document.body.innerText : document.documentElement.innerText).catch(() => "Not found"); }
                         
                         const sessionFilePath = path.join(__dirname, `session_${Date.now()}_task${taskId}.txt`);
                         fs.writeFileSync(sessionFilePath, sessionText);
                         await bot.sendDocument(chatId, sessionFilePath, { caption: `[#${taskId}] ` + t(chatId, 'sessionDoc') }).catch(()=>{});
                         if (fs.existsSync(sessionFilePath)) fs.unlinkSync(sessionFilePath);
                     } catch (sessionErr) {}

                     await extractPaymentLink(page, context, chatId, codeGen, updateStatus);

                     codeGen.addStep("إنهاء العملية وإغلاق المتصفح");
                     if (context) await context.close().catch(()=>{});
                     if (tempDir) try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
                     
                     if(sendMainMenuCallback) sendMainMenuCallback(chatId);
                     return true;
                 }
             }
             
             throw new Error(`لم يتم العثور على الكود 32 - سيتم التحويل لليدوي.`);

        } else { throw new Error(`تعذر التعرف على واجهة الصفحة الحالية للأسف.`); }

    } catch (error) {
        if (error.message === "CANCELLED_BY_USER") {
            if (context) await context.close().catch(()=>{});
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
            return false;
        }

        if (!userState[chatId]) userState[chatId] = {};
        
        // 🟢 الحماية من التداخل: إذا كانت هناك جلسة يدوية أخرى شغالة، سيقوم البوت بإغلاق هذه العملية بصمت لمنع لخبطة الأزرار
        if (userState[chatId].isInteractive) {
            await bot.sendMessage(chatId, `⚠️ **العملية [#${taskId}]:**\nحدث خطأ وتطلب تدخل يدوي، ولكن لديك **جلسة يدوية أخرى نشطة حالياً**. تم إغلاق هذه العملية بأمان لمنع التداخل في أزرار التحكم.`);
            if (context) await context.close().catch(()=>{});
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
            return false;
        }

        userState[chatId].isInteractive = true;
        try { if (page && !page.isClosed()) await page.evaluate(() => window.stop()); } catch(e){}
        await bot.sendMessage(chatId, `⚠️ **العملية [#${taskId}]:**\n` + t(chatId, 'manualModeSwitch'));
        
        if (page && context && !userState[chatId].cancel) {
            await sendErrorScreenshot(page, chatId, error.message);
            await startInteractiveMode(chatId, page, context, tempDir, codeGen);
        } else { await bot.sendMessage(chatId, `[#${taskId}] ` + t(chatId, 'failClose')); }
    } finally {
        if (userState[chatId] && !userState[chatId].isInteractive) {
            if (context) await context.close().catch(()=>{});
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
        }
    }
    return true;
}

module.exports = { createAccountLogic, sendInteractiveMenu };
