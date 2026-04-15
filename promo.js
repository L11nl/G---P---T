const { bot } = require('./bot');
const { t } = require('./locales');
const { sleep } = require('./utils');

async function extractPaymentLink(page, context, chatId, codeGen, updateStatus) {
    await updateStatus(t(chatId, 'goToPromo'));
    try {
        const promoUrl = "https://chatgpt.com/?promo_campaign=team-1-month-free&utm_campaign=WEB-team-1-month-free&utm_internal_medium=referral&utm_internal_source=openai_business&referrer=https%3A%2F%2Fchatgpt.com%2Fpricing#team-pricing";
        
        codeGen.addStep("التوجه لصفحة العرض المجاني (Team)");
        codeGen.addCommand(`await page.goto("${promoUrl}", { waitUntil: "domcontentloaded" });\n    await page.waitForTimeout(4000);`);
        
        await page.goto(promoUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
        await sleep(4000); 
        
        await updateStatus(t(chatId, 'clickPromo'));
        codeGen.addStep("الضغط على زر العرض، الانتظار وسحب رابط الدفع cs_live");
        codeGen.addRawBlock("البحث عن زر Claim والضغط عليه ثم الانتظار للتوجيه", [
            `const claimBtn = page.locator('button:has-text("Claim"), a:has-text("Claim"), [role="button"]:has-text("Claim")').last();`,
            `if (await claimBtn.isVisible({timeout: 5000})) { await claimBtn.click({force: true}); await page.waitForTimeout(500); await page.keyboard.press('Enter'); }`,
            `await page.waitForTimeout(5000);`
        ]);
        
        const claimBtn = page.locator('button:has-text("Claim"), a:has-text("Claim"), [role="button"]:has-text("Claim")').last();
        if (await claimBtn.isVisible({timeout: 5000}).catch(()=>false)) { 
            await claimBtn.click({force: true}); 
            await sleep(500); 
            await page.keyboard.press('Enter'); 
        }
        
        await sleep(6000); 
        
        try {
            await page.waitForURL(/checkout|cs_live/i, { timeout: 15000 });
        } catch(e) {}
        
        let paymentUrl = page.url(); 
        const allPages = context.pages();
        
        for (const p of allPages) {
            const u = p.url();
            if (u.includes('checkout') || u.includes('cs_live')) {
                paymentUrl = u;
                break; 
            }
        }
        
        // =========================================================
        // إرسال الرابط المباشر (استخدمنا HTML بدلاً من Markdown لتفادي خطأ الـ _ )
        // =========================================================
        const messageText = `💳 <b>رابط الدفع | Payment Link:</b>\n\n${paymentUrl}`;
        await bot.sendMessage(chatId, messageText, { 
            parse_mode: 'HTML', 
            disable_web_page_preview: true 
        });

    } catch (err) {
        console.error("Error extracting payment link:", err);
    }
}

module.exports = { extractPaymentLink };
