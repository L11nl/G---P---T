const { sleep } = require('./utils');

// ========================================================
// 🛑 قائمة التخطي: ضع أي كلمة تريد تخطيها في هذه المصفوفة
// ========================================================
const SKIP_WORDS = [
    'Skip Tour',
    'Skip',
    'Continue',
    'Okay',
    'Next',
    'Done',
    "Okay, let's go" // تمت إضافتها كإجراء أمان احتياطي
];

async function nukePopups(page) {
    if (!page || page.isClosed()) return;
    try {
        await page.keyboard.press('Escape').catch(()=>{});

        // ==========================================================
        // 🎯 الفحص المخصص للنوافذ التي تسبب تعليق السكربت (حسب طلبك)
        // ==========================================================
        
        // 1. فحص نافذة: You're all set -> والضغط على Continue
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

        // 2. فحص نافذة: Tips for getting started -> والضغط على إحداثيات المربع 662
        try {
            const tipsText = page.locator('text="Tips for getting started"').first();
            if (await tipsText.isVisible({ timeout: 500 }).catch(() => false)) {
                // الضغط مباشرة بالماوس على المربع 662 (X: 986.56, Y: 445.44)
                await page.mouse.click(986.56, 445.44); 
                await sleep(1000);
                
                // خطة بديلة سريعة في حال لم يختفِ الإشعار
                const okayBtn = page.locator('button:has-text("Okay, let\'s go")').first();
                if (await okayBtn.isVisible({ timeout: 500 }).catch(() => false)) {
                    await okayBtn.click({ force: true });
                    await sleep(500);
                }
            }
        } catch (e) {}

        // ==========================================================
        // 🧹 المسح العادي الشامل لباقي الإشعارات
        // ==========================================================
        for (let i = 0; i < 2; i++) { // مسح مزدوج قوي
            for (const pText of SKIP_WORDS) {
                try {
                    const btn = page.locator(`button:has-text("${pText}"):not(:has-text("Apple")):not(:has-text("Google")), a:has-text("${pText}"), [role="button"]:has-text("${pText}")`).last();
                    if (await btn.isVisible({ timeout: 400 }).catch(()=>false)) {
                        await btn.click({ force: true });
                        await sleep(300);
                        await page.keyboard.press('Enter');
                        await sleep(500);
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
}

module.exports = { SKIP_WORDS, nukePopups };
