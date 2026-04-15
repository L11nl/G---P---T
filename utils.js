const crypto = require('crypto');
const { bot } = require('./bot');
const { t } = require('./locales');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function generateSecurePassword() {
    const chars = "00CHAT700z00";
    let password = "";
    for (let i = 0; i < 12; i++) password += chars.charAt(crypto.randomInt(0, chars.length));
    return password;
}

async function updateStatusMessage(chatId, text, messageId = null) {
    try {
        if (!messageId) {
            const sent = await bot.sendMessage(chatId, `⚡ ${text}`);
            return sent.message_id;
        } else {
            await bot.editMessageText(`⚡ ${text}`, { chat_id: chatId, message_id: messageId }).catch(async () => {
                const sent = await bot.sendMessage(chatId, `⚡ ${text}`);
                return sent.message_id;
            });
            return messageId;
        }
    } catch (err) {
        const sent = await bot.sendMessage(chatId, `⚡ ${text}`);
        return sent.message_id;
    }
}

async function sendErrorScreenshot(page, chatId, errorMessage) {
    try {
        if (!page || page.isClosed()) throw new Error("المتصفح انغلق فجأة.");
        const buffer = await page.screenshot({ fullPage: false, timeout: 15000 });
        const shortMsg = errorMessage.length > 150 ? errorMessage.substring(0, 150) + "..." : errorMessage;
        await bot.sendPhoto(chatId, buffer, { caption: `⚠️ ${t(chatId, 'manualModeSwitch')}\nالسبب: ${shortMsg}` }, { filename: 'error.png', contentType: 'image/png' });
    } catch (err) {
        await bot.sendMessage(chatId, `❌ **Error:** ${errorMessage}`);
    }
}

module.exports = { sleep, generateSecurePassword, updateStatusMessage, sendErrorScreenshot };
