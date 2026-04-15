// browserUtils.js

const GRID_COLS = 45; 
const GRID_ROWS = 25; 
const TOTAL_CELLS = GRID_COLS * GRID_ROWS; 

async function sendErrorScreenshot(page, bot, chatId, errorMessage) {
    try {
        if (!page || page.isClosed()) throw new Error("المتصفح انغلق فجأة.");
        const buffer = await page.screenshot({ fullPage: false, timeout: 15000 });
        const shortMsg = errorMessage.length > 150 ? errorMessage.substring(0, 150) + "..." : errorMessage;
        await bot.sendPhoto(chatId, buffer, { caption: `⚠️ **توقف مؤقت للحماية:**\nالسبب: ${shortMsg}` }, { filename: 'error.png', contentType: 'image/png' });
    } catch (err) {
        await bot.sendMessage(chatId, `❌ **توقف مؤقت:** ${errorMessage}`);
    }
}

async function drawGridAndScreenshot(page, bot, chatId, caption) {
    try {
        if (!page || page.isClosed()) throw new Error("الصفحة مغلقة");
        await page.evaluate((specs) => {
            const oldOverlay = document.getElementById('bot-grid-overlay'); if (oldOverlay) oldOverlay.remove();
            const overlay = document.createElement('div'); overlay.id = 'bot-grid-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;display:grid;grid-template-columns:repeat(' + specs.cols + ', 1fr);grid-template-rows:repeat(' + specs.rows + ', 1fr);';
            for (let i = 0; i < specs.rows * specs.cols; i++) {
                const cell = document.createElement('div');
                cell.style.cssText = 'border:1px solid rgba(255,255,0,0.5);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold;text-shadow:1px 1px 0 #000;background:rgba(0,0,0,0.1);box-sizing:border-box;';
                cell.innerText = i; overlay.appendChild(cell);
            }
            document.body.appendChild(overlay);
        }, { rows: GRID_ROWS, cols: GRID_COLS });
        
        const buffer = await page.screenshot({ fullPage: false, timeout: 15000 });
        await page.evaluate(() => { const el = document.getElementById('bot-grid-overlay'); if (el) el.remove(); });
        await bot.sendPhoto(chatId, buffer, { caption: caption, parse_mode: 'Markdown' }, { filename: 'grid.png', contentType: 'image/png' });
    } catch (error) { 
        await bot.sendMessage(chatId, `⚠️ تعذر إرسال شبكة المربعات.`); 
    }
}

async function drawRedDot(page, x, y) {
    try {
        if(!page || page.isClosed()) return;
        await page.evaluate((pos) => {
            let dot = document.getElementById('bot-red-dot');
            if (!dot) { 
                dot = document.createElement('div'); dot.id = 'bot-red-dot'; 
                dot.style.cssText = 'position:fixed;width:14px;height:14px;background-color:red;border:2px solid white;border-radius:50%;z-index:2147483647;pointer-events:none;transform:translate(-50%, -50%);'; 
                document.body.appendChild(dot); 
            }
            dot.style.left = pos.x + 'px'; dot.style.top = pos.y + 'px';
        }, {x, y});
    } catch(e) {}
}

async function removeRedDot(page) { 
    try { 
        if(!page || page.isClosed()) return; 
        await page.evaluate(() => { const dot = document.getElementById('bot-red-dot'); if (dot) dot.remove(); }); 
    } catch(e) {} 
}

module.exports = {
    GRID_COLS,
    GRID_ROWS,
    TOTAL_CELLS,
    sendErrorScreenshot,
    drawGridAndScreenshot,
    drawRedDot,
    removeRedDot
};
