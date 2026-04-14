/* ================================================
 * === PATCH: Email Change Feature (April 2026) ===
 * ================================================
 *
 * يضيف زرًا جديدًا “✉️ تغيير الايميل” إلى القائمة الرئيسية،
 * ثم يقود المستخدم خلال خطوات:
 *   1) إدخال الايميل وكلمة المرور والكود 2FA
 *   2) فتح Settings › Account
 *   3) النقر على خلايا الماوس 317 ثم 511
 *   4) كتابة الايميل الجديد والنقر على “Send verification email”
 *   5) النقر على الخلية 536
 *   6) إدخال كود التحقق المكوّن من 6 أرقام ثم الضغط على “Verify”
 *
 * يعتمد على Playwright مثل باقي السكربت، ولا يغيّر أي منطق
 * سابق. أضِف المقاطع أدناه في أماكنها المبيّنة بالتعليقات.
 * =================================================
 */

/* ===[A] أضف الزر الجديد في sendMainMenu() === */
 /*
 [{ text: '✉️ تغيير الايميل', callback_data: 'change_email' }],
 */

/* ===[B] الكائنات المساعدة في userState لإدارة الخطوات === */
 /*
   userState[chatId] = {
       ...,
       changeEmail: {
           stage: null,      // awaiting_old_email | awaiting_password | awaiting_mfa | awaiting_new_email | awaiting_verify_code
           creds: {}
       }
   };
 */

/* ===[C] دالة performChangeEmail() === */
async function performChangeEmail(chatId, creds) {
    const { chromium } = require('playwright-extra');
    const stealth = require('puppeteer-extra-plugin-stealth')();
    chromium.use(stealth);

    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    try {
        // STEP 1‑2: Login flow
        await page.goto('https://chatgpt.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.locator('text="Log in"').first().click();
        await page.locator('input[type="email"]').fill(creds.email);
        await page.locator('button:has-text("Continue")').click();
        await page.locator('input[type="password"]').fill(creds.password);
        await page.locator('button:has-text("Continue")').click();
        await page.locator('input[type="tel"], input[autocomplete="one-time-code"]').fill(creds.mfa);
        await page.locator('button:has-text("Continue")').click();

        // STEP 3‑4: open settings/account
        await page.waitForTimeout(3000);
        await page.goto('https://chatgpt.com/#settings/Account', { waitUntil: 'domcontentloaded' });
        // click grid cell 317
        await page.mouse.click(950.40, 281.25);
        // click grid cell 511
        await page.mouse.click(604.80, 461.25);

        // type new email
        await page.keyboard.type(creds.newEmail, { delay: 50 });
        // click "Send verification email"
        await page.locator('text="Send verification email"').click();

        // STEP 5: grid cell 536
        await page.mouse.click(604.80, 483.75);

        // STEP 6: fill verify code
        await page.keyboard.type(creds.verifyCode, { delay: 50 });
        await page.locator('text="Verify"').click();

        await page.waitForTimeout(3000);
        return true;
    } catch (err) {
        await bot.sendMessage(chatId, `❌ فشل التغيير: ${err.message}`);
        return false;
    } finally {
        await context.close();
        await browser.close();
    }
}

/* ===[D] توسيع callback_query لمعالجة change_email === */
 /*
 else if (query.data === 'change_email') {
     if (isProcessing) return bot.sendMessage(chatId, '⚠️ البوت مشغول حالياً.');
     state.changeEmail = { stage: 'awaiting_old_email', creds: {} };
     bot.sendMessage(chatId, '✉️ أرسل الايميل الحالي:');
 }
 */

/* ===[E] توسيع on('message') لمراحل جمع البيانات === */
 /*
 if (state.changeEmail?.stage === 'awaiting_old_email') {
     state.changeEmail.creds.email = text;
     state.changeEmail.stage = 'awaiting_password';
     return bot.sendMessage(chatId, '🔑 أرسل كلمة المرور:');
 }
 if (state.changeEmail?.stage === 'awaiting_password') {
     state.changeEmail.creds.password = text;
     state.changeEmail.stage = 'awaiting_mfa';
     return bot.sendMessage(chatId, '🔒 أرسل كود 2FA (ستة أرقام):');
 }
 if (state.changeEmail?.stage === 'awaiting_mfa') {
     if (!/^\d{6}$/.test(text)) return bot.sendMessage(chatId, '⚠️ الكود يجب أن يتكوّن من 6 أرقام.');
     state.changeEmail.creds.mfa = text;
     state.changeEmail.stage = 'awaiting_new_email';
     return bot.sendMessage(chatId, '📧 أرسل الايميل الجديد:');
 }
 if (state.changeEmail?.stage === 'awaiting_new_email') {
     state.changeEmail.creds.newEmail = text;
     state.changeEmail.stage = 'awaiting_verify_code';
     return bot.sendMessage(chatId, '📨 بعد الضغط على "Send verification email" سيصلك كود، أرسله هنا:');
 }
 if (state.changeEmail?.stage === 'awaiting_verify_code') {
     if (!/^\d{6}$/.test(text)) return bot.sendMessage(chatId, '⚠️ الكود يجب أن يتكوّن من 6 أرقام.');
     state.changeEmail.creds.verifyCode = text;
     bot.sendMessage(chatId, '⏳ جارٍ تغيير الايميل...');
     isProcessing = true;
     performChangeEmail(chatId, state.changeEmail.creds).then(() => {
         isProcessing = false;
         bot.sendMessage(chatId, '✅ تم تغيير الايميل بنجاح!');
         sendMainMenu(chatId);
     });
     state.changeEmail = null;
 }
 */

/* انتهى الـ PATCH */
