const { bot, userState } = require('./bot');
const { t } = require('./locales');
const { createAccountLogic } = require('./core');
const { drawGridAndScreenshot, drawRedDot, removeRedDot } = require('./grid');
const { sleep, generateSecurePassword } = require('./utils');
const config = require('./config');
const fs = require('fs');

// 🟢 استدعاء نظام الحماية
const auth = require('./auth');

function sendMainMenu(chatId) {
    if (!userState[chatId]) userState[chatId] = { lang: 'ar', cancel: false };
    
    // الأزرار الأساسية
    const keyboard = [
        [{ text: t(chatId, 'autoBtn'), callback_data: 'create_auto' }, { text: t(chatId, 'manualBtn'), callback_data: 'create_manual' }],
        [{ text: t(chatId, 'langBtn'), callback_data: 'toggle_lang' }],
        [{ text: t(chatId, 'cancelBtn'), callback_data: 'cancel' }]
    ];

    // 🟢 إضافة زر لوحة الإدارة (يظهر للمدير فقط)
    if (chatId.toString() === config.ADMIN_ID.toString()) {
        keyboard.push([{ text: '⚙️ لوحة الإدارة (Admin Panel)', callback_data: 'admin_panel' }]);
    }

    bot.sendMessage(chatId, t(chatId, 'welcome'), {
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard }
    });
}

async function sendMouseMenu(chatId) {
    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '👁️ Grid', callback_data: 'int_show_grid' }], [{ text: '🧭 Move', callback_data: 'int_move_mouse' }],
        [{ text: '🔴 Click', callback_data: 'int_click_mouse' }], [{ text: '🔙 Back', callback_data: 'int_back_main' }]
    ]}}; await bot.sendMessage(chatId, `🖱️ Mouse Menu:`, opts);
}

// ==========================================
// أمر البداية /start
// ==========================================
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    // 🟢 فحص الصلاحية قبل كل شيء
    if (!auth.isAuthorized(chatId)) {
        const opts = {
            reply_markup: { inline_keyboard: [ [{ text: '📩 طلب انضمام (Join)', callback_data: 'request_join' }] ] }
        };
        return bot.sendMessage(chatId, "⛔️ **عذراً، هذا البوت خاص.**\nلا تملك صلاحية الاستخدام. اضغط على الزر أدناه لإرسال طلب للمدير.", { parse_mode: 'Markdown', ...opts });
    }

    if (!userState[chatId]) userState[chatId] = { lang: 'ar', cancel: false };
    sendMainMenu(chatId);
});

// ==========================================
// استقبال ضغطات الأزرار
// ==========================================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const userName = query.from.first_name || "User";
    const usernameTag = query.from.username ? `(@${query.from.username})` : "";
    
    bot.answerCallbackQuery(query.id).catch(() => {});

    // 🟢 1. معالجة طلبات الانضمام (للمستخدم العادي)
    if (query.data === 'request_join') {
        if (auth.isAuthorized(userId)) return bot.sendMessage(chatId, "✅ أنت مصرح لك بالفعل! أرسل /start للبدء.");
        bot.sendMessage(chatId, "⏳ تم إرسال طلبك إلى المدير. يرجى الانتظار حتى تتم الموافقة.");
        const adminOpts = {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [
                [{ text: '✅ موافقة', callback_data: `admin_approve_${userId}` }, { text: '❌ رفض', callback_data: `admin_reject_${userId}` }]
            ]}
        };
        bot.sendMessage(config.ADMIN_ID, `🔔 **طلب انضمام جديد:**\n\n👤 الاسم: ${userName} ${usernameTag}\n🆔 الآيدي: \`${userId}\``, adminOpts).catch(()=>{});
        return;
    }

    // 🟢 2. معالجة أوامر الموافقة/الرفض السريعة
    if (query.data.startsWith('admin_approve_') || query.data.startsWith('admin_reject_')) {
        if (chatId.toString() !== config.ADMIN_ID.toString()) return; 
        const targetId = query.data.split('_')[2];
        const isApprove = query.data.startsWith('admin_approve_');
        
        if (isApprove) {
            auth.approveUser(targetId);
            bot.editMessageText(`✅ تمت الموافقة على العضو: \`${targetId}\``, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
            bot.sendMessage(targetId, "🎉 **تمت الموافقة على طلبك!**\nيمكنك الآن استخدام البوت، أرسل /start للبدء.", { parse_mode: 'Markdown' }).catch(()=>{});
        } else {
            bot.editMessageText(`❌ تم رفض العضو: \`${targetId}\``, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
            bot.sendMessage(targetId, "🚫 تم رفض طلب الانضمام الخاص بك من قبل المدير.").catch(()=>{});
        }
        return;
    }

    // 🟢 3. أزرار لوحة الإدارة (للمدير فقط)
    if (query.data === 'admin_panel' && chatId.toString() === config.ADMIN_ID.toString()) {
        const adminKeyboard = {
            inline_keyboard: [
                [{ text: '👥 عرض الأعضاء', callback_data: 'admin_view_users' }],
                [{ text: '➕ إضافة عضو (ID)', callback_data: 'admin_add_user' }, { text: '➖ حذف عضو (ID)', callback_data: 'admin_remove_user' }]
            ]
        };
        bot.sendMessage(chatId, "🛠️ **لوحة التحكم بالاعضاء:**\nاختر الإجراء المطلوب:", { parse_mode: 'Markdown', reply_markup: adminKeyboard });
        return;
    }

    if (query.data === 'admin_view_users' && chatId.toString() === config.ADMIN_ID.toString()) {
        const users = auth.getApprovedUsers();
        if (users.length === 0) return bot.sendMessage(chatId, "📋 لا يوجد مستخدمين معتمدين حالياً.");
        let text = "📋 **قائمة المستخدمين المصرح لهم:**\n\n";
        users.forEach((u, i) => text += `${i + 1}. \`${u}\`\n`);
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        return;
    }

    if (query.data === 'admin_add_user' && chatId.toString() === config.ADMIN_ID.toString()) {
        if (!userState[chatId]) userState[chatId] = {};
        userState[chatId].step = 'awaiting_add_user';
        bot.sendMessage(chatId, "➕ أرسل **الآيدي (ID)** الخاص بالعضو الذي تريد إضافته (أرقام فقط):");
        return;
    }

    if (query.data === 'admin_remove_user' && chatId.toString() === config.ADMIN_ID.toString()) {
        if (!userState[chatId]) userState[chatId] = {};
        userState[chatId].step = 'awaiting_remove_user';
        bot.sendMessage(chatId, "➖ أرسل **الآيدي (ID)** الخاص بالعضو الذي تريد حذفه:");
        return;
    }

    // 🟢 4. فحص الصلاحية لباقي الأزرار
    if (!auth.isAuthorized(chatId)) return;

    if (!userState[chatId]) userState[chatId] = { lang: 'ar', cancel: false };
    const state = userState[chatId];

    try {
        if (query.data === 'toggle_lang') {
            state.lang = state.lang === 'ar' ? 'en' : 'ar';
            bot.sendMessage(chatId, t(chatId, 'langChanged'));
            sendMainMenu(chatId); return;
        }

        if (query.data.startsWith('int_')) {
            const action = query.data.replace('int_', '');
            if (!state.isInteractive || !state.page || state.page.isClosed()) return bot.sendMessage(chatId, "⚠️ Session closed.");

            if (action === 'goto_url') { bot.sendMessage(chatId, "🌐 URL:"); state.step = 'awaiting_goto_url'; }
            else if (action === 'continue_af2') { bot.sendMessage(chatId, "⏳ AF2 Process..."); }
            else if (action === 'search_text') { bot.sendMessage(chatId, "🔍 Text:"); state.step = 'awaiting_search_text'; }
            else if (action === 'mouse_menu') { await sendMouseMenu(chatId); }
            else if (action === 'show_grid') { await drawGridAndScreenshot(state.page, chatId, `👁️ Grid:`); await sendMouseMenu(chatId); }
            else if (action === 'move_mouse') { bot.sendMessage(chatId, `🧭 Grid Number:`); state.step = 'awaiting_move_mouse'; }
            else if (action === 'click_mouse') {
                if (state.mouseX !== undefined && state.mouseY !== undefined) {
                    try { await removeRedDot(state.page); await state.page.mouse.click(state.mouseX, state.mouseY); await sleep(1500); await bot.sendMessage(chatId, `🔴 Clicked!`); } catch(e) {}
                } else { bot.sendMessage(chatId, "⚠️ Move mouse first."); }
            }
            else if (action === 'type_text') { bot.sendMessage(chatId, "⌨️ Text:"); state.step = 'awaiting_type_text'; }
            else if (action === 'press_enter') { try { await state.page.keyboard.press('Enter'); await sleep(1500); bot.sendMessage(chatId, "↩️ Enter pressed."); } catch(e) {} }
            else if (action === 'refresh') { try { const buffer = await state.page.screenshot({ fullPage: false, timeout: 15000 }); await bot.sendPhoto(chatId, buffer); } catch(e) {} }
            else if (action === 'finish') {
                bot.sendMessage(chatId, "✅ Finishing..."); state.isInteractive = false;
                if (state.context) await state.context.close().catch(()=>{}); if (state.tempDir) try { fs.rmSync(state.tempDir, { recursive: true, force: true }); } catch {}
                if (state.resolveInteractive) state.resolveInteractive(); sendMainMenu(chatId);
            }
            return;
        }

        if (query.data === 'cancel') {
            state.cancel = true; if (state.resolveInteractive) state.resolveInteractive();
            bot.sendMessage(chatId, t(chatId, 'cancelBtn'));
        }
        else if (query.data === 'create_auto') { 
            bot.sendMessage(chatId, "🚀 " + t(chatId, 'startProcess'));
            createAccountLogic(chatId, false, null, sendMainMenu); 
        } 
        else if (query.data === 'create_manual') { 
            state.step = 'awaiting_email'; bot.sendMessage(chatId, t(chatId, 'emailPrompt')); 
        }

    } catch(err) { bot.sendMessage(chatId, `❌ Err: ${err.message}`); }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text?.trim(); 
    
    // 🟢 فحص الصلاحية للرسائل النصية
    if (!auth.isAuthorized(chatId)) return;

    const state = userState[chatId];
    if (!state || !text || text.startsWith('/')) return; 

    try {
        // 🟢 معالجة استلام الآيدي من المدير (لإضافة عضو)
        if (state.step === 'awaiting_add_user' && chatId.toString() === config.ADMIN_ID.toString()) {
            state.step = null;
            const targetId = text.replace(/[^0-9]/g, ''); // استخراج الأرقام فقط
            if (targetId) {
                auth.approveUser(targetId);
                bot.sendMessage(chatId, `✅ تم إضافة العضو بنجاح: \`${targetId}\``, { parse_mode: 'Markdown' });
                bot.sendMessage(targetId, "🎉 **تمت الموافقة عليك من قبل المدير!**\nيمكنك الآن استخدام البوت، أرسل /start للبدء.", { parse_mode: 'Markdown' }).catch(()=>{});
            } else {
                bot.sendMessage(chatId, "❌ الآيدي غير صالح، يجب أن يحتوي على أرقام فقط.");
            }
            return;
        }

        // 🟢 معالجة استلام الآيدي من المدير (لحذف عضو)
        if (state.step === 'awaiting_remove_user' && chatId.toString() === config.ADMIN_ID.toString()) {
            state.step = null;
            const targetId = text.replace(/[^0-9]/g, ''); // استخراج الأرقام فقط
            if (targetId) {
                auth.removeUser(targetId);
                bot.sendMessage(chatId, `✅ تم حذف العضو وسحب الصلاحية منه: \`${targetId}\``, { parse_mode: 'Markdown' });
            } else {
                bot.sendMessage(chatId, "❌ الآيدي غير صالح.");
            }
            return;
        }

        // --- باقي معالجات البوت الأساسية ---
        if (state.step === 'awaiting_goto_url' && state.isInteractive) {
            state.step = null; let targetUrl = text; if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl; 
            try { await state.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }); await sleep(3000); bot.sendMessage(chatId, `✅ Open.`); } catch(e) {}
        }
        else if (state.step === 'awaiting_search_text' && state.isInteractive) {
            state.step = null; const safeText = text.replace(/'/g, "\\'");
            try { const loc = state.page.locator(`text="${text}"`).first(); if (await loc.isVisible()) { await loc.click(); await sleep(1500); bot.sendMessage(chatId, `🎯 Clicked.`); } } catch(e) {}
        }
        else if (state.step === 'awaiting_move_mouse' && state.isInteractive) {
            const num = parseInt(text);
            if (!isNaN(num) && num >= 0 && num < config.TOTAL_CELLS) {
                state.step = null; 
                try {
                    const vw = 1366 / config.GRID_COLS; const vh = 768 / config.GRID_ROWS; const col = num % config.GRID_COLS; const row = Math.floor(num / config.GRID_COLS);
                    const x = parseFloat(((col * vw) + (vw / 2)).toFixed(2)); const y = parseFloat(((row * vh) + (vh / 2)).toFixed(2));
                    state.mouseX = x; state.mouseY = y; await state.page.mouse.move(x, y); await drawRedDot(state.page, x, y);
                    const buffer = await state.page.screenshot({ fullPage: false, timeout: 15000 });
                    await bot.sendPhoto(chatId, buffer, { caption: `🔴 Mouse at [${num}].` }, { filename: 'dot.png', contentType: 'image/png' });
                } catch(e) {} await sendMouseMenu(chatId);
            }
        }
        else if (state.step === 'awaiting_type_text' && state.isInteractive) { 
            state.step = null; try { await state.page.keyboard.type(text, { delay: 50 }); await sleep(1000); bot.sendMessage(chatId, `⌨️ Typed.`); } catch(e) {} 
        }
        else if (state.step === 'awaiting_email') {
            if (!text.includes('@')) return bot.sendMessage(chatId, t(chatId, 'invalidEmail')); state.step = null;
            const autoPass = generateSecurePassword(); bot.sendMessage(chatId, `${t(chatId, 'gotEmail')}\`${autoPass}\``, {parse_mode: 'Markdown'});
            createAccountLogic(chatId, true, { email: text, password: autoPass }, sendMainMenu); 
        }
    } catch(err) {}
});

process.on('uncaughtException', (err) => { console.error('Uncaught:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled:', reason); });

console.log("🤖 البوت يعمل (الهيكل المقسم - نظام الحماية بلوحة تحكم مفعل)...");
