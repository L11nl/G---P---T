async function createAccount(chatId, currentAccountNum, totalAccounts) {
    const statusMsg = await bot.sendMessage(chatId, `⚙️ بدء إنشاء الحساب [${currentAccountNum}/${totalAccounts}]...`);
    
    const { email, firstName, lastName } = await generateRandomEmail(chatId);
    const fullName = `${firstName} ${lastName}`;
    const birthday = generateRandomBirthday();
    
    await bot.editMessageText(`📧 الإيميل المستخدم:\n${email}`, { chat_id: chatId, message_id: statusMsg.message_id });

    const tempDir = fs.mkdtempSync(path.join(__dirname, 'chatgpt_profile_'));
    let context;
    let page; // تم التعديل هنا

    try {
        context = await firefox.launchPersistentContext(tempDir, {
            headless: true, 
            viewport: { width: 1366, height: 768 },
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
            ignoreHTTPSErrors: true,
            bypassCSP: true,
            extraHTTPHeaders: {
                "Accept-Language": "en-US,en;q=0.5"
            }
        });

        page = context.pages().length > 0 ? context.pages()[0] : await context.newPage(); // تم التعديل هنا

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            delete navigator.__marionette;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
        });

        bot.sendMessage(chatId, "🌐 التوجه لموقع ChatGPT...");
        await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
        await sleep(2000);

        bot.sendMessage(chatId, "🖱️ جاري الضغط على Sign up...");
        try {
            const signupBtn = page.getByRole("button", { name: "Sign up" });
            await signupBtn.waitFor({ state: "visible", timeout: 10000 });
            await signupBtn.click({ force: true });
        } catch {
            await page.locator('button:has-text("Sign up")').click({ force: true });
        }
        
        await sleep(2000);

        const emailInput = page.getByRole("textbox", { name: "Email address" });
        await emailInput.waitFor({ state: "visible" });
        await emailInput.fill(email);
        await emailInput.blur();
        await sleep(1500);

        let continueBtn = page.getByRole("button", { name: "Continue", exact: true });
        await continueBtn.click({ force: true });
        await sleep(4000);

        bot.sendMessage(chatId, "🔑 جاري كتابة الباسورد...");
        const passInput = page.getByRole("textbox", { name: "Password" });
        await passInput.waitFor({ state: "visible" });
        await passInput.fill(DEFAULT_PASSWORD);
        await sleep(1500);

        continueBtn = page.getByRole("button", { name: "Continue" });
        await continueBtn.click({ force: true });
        
        await sleep(8000);
        const code = await getVerificationCode(email, chatId);
        if (!code) throw new Error("لم يتم استلام كود التفعيل.");

        const codeInput = page.getByRole("textbox", { name: "Code" });
        await codeInput.fill(code);
        await sleep(2000);

        try {
            await page.getByRole("button", { name: "Continue" }).click({ force: true });
        } catch (e) {}

        bot.sendMessage(chatId, "👤 جاري إدخال الاسم وتاريخ الميلاد...");
        const nameInput = page.getByRole("textbox", { name: "Full name" });
        await nameInput.waitFor({ state: "visible" });
        await nameInput.fill(fullName);
        await sleep(1000);

        const bdayString = `${String(birthday.month).padStart(2, '0')}${String(birthday.day).padStart(2, '0')}${birthday.year}`;
        await page.locator('xpath=/html/body/div[1]/div/fieldset/form/div[1]/div/div[2]/div/div/div/div').click();
        await sleep(500);
        await page.keyboard.type(bdayString, { delay: 100 });
        await sleep(1000);

        continueBtn = page.getByRole("button", { name: "Continue" });
        await continueBtn.click({ force: true });
        await sleep(5000);

        const accountData = `${email}|${DEFAULT_PASSWORD}`;
        fs.appendFileSync(ACCOUNTS_FILE, accountData + '\n');
        
        await bot.sendMessage(chatId, `✅ **تم إنشاء الحساب بنجاح!**\n\n\`${accountData}\``, { parse_mode: 'Markdown' });
        
        await context.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
        return true;

    } catch (error) {
        bot.sendMessage(chatId, `❌ **فشل إنشاء الحساب:**\n${error.message}`);
        
        // === كود تصوير الشاشة الجديد لمعرفة سبب الرفض ===
        try {
            if (page) {
                const screenshotPath = path.join(tempDir, 'error_screenshot.png');
                await page.screenshot({ path: screenshotPath });
                await bot.sendPhoto(chatId, screenshotPath, { caption: '📸 لقطة شاشة توضح سبب المشكلة في موقع ChatGPT' });
            }
        } catch (e) {
            console.log("تعذر التقاط صورة الشاشة", e);
        }
        // ===============================================

        if (context) await context.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
        return false;
    }
}
