// index.js

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ================= استدعاء الملفات المنفصلة =================
const { generateSecurePassword, sleep } = require('./mailApi');
const { GRID_COLS, GRID_ROWS, TOTAL_CELLS, drawGridAndScreenshot, drawRedDot, removeRedDot } = require('./browserUtils');
const { createAccountLogic, sendInteractiveMenu, sendMouseMenu } = require('./chatgptLogic');

// ================= إعدادات الإدارة والحماية =================
const ADMIN_ID = 643309456; // آيدي الإدارة الخاص بك
const USERS_FILE = path.join(__dirname, 'approved_users.json');
let approvedUsers = {};
let enableLiveMonitor = false; // حالة المراقبة (تصوير كل 5 ثواني)

// تحميل قائمة المستخدمين المسموح لهم
if (fs.existsSync(USERS_FILE)) {
    approvedUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(approvedUsers)); }

// توكن البوت
const BOT_TOKEN = process.env.BOT_TOKEN || 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة';
if (!BOT_TOKEN || BOT_TOKEN === 'ضع_توكن_البوت_هنا_إذا_لم_يكن_في_البيئة') {
    console.error("❌ خطأ: BOT_TOKEN مفقود.");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
let isProcessing = false;
const userState = {};

// دالة العودة للقائمة الرئيسية (تتغير حسب المستخدم)
function sendMainMenu(chatId) {
    const isAdmin = (chatId === ADMIN_ID);
    const keyboard = [[{ text: '▶️ تشغيل تلقائي', callback_data: 'create_auto' }]];

    if (isAdmin) {
        // أزرار تظهر للآدمن فقط!
        keyboard.push([{ text: '✍️ تشغيل يدوي (للآدمن فقط)', callback_data: 'create_manual' }]);
        keyboard.push([{ text: `📸 بث حي (5 ثواني): ${enableLiveMonitor ? '✅ مفعل' : '❌ معطل'}`, callback_data: 'toggle_monitor' }]);
    }
    keyboard.push([{ text: '🛑 إلغاء العملية', callback_data: 'cancel' }]);

    bot.sendMessage(chatId, "👋 أهلاً بك! اختر العملية:", {
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard }
    });
}

const finishProcessing = () => { isProcessing = false; };

// ================= أوامر البوت =================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text?.trim();
    if (!text) return;

    // --- نظام الموافقة والحماية للمستخدمين الجدد ---
    if (chatId !== ADMIN_ID && approvedUsers[chatId] !== 'approved') {
        if (approvedUsers[chatId] !== 'pending') {
            approvedUsers[chatId] = 'pending'; saveUsers();
            // إرسال طلب للآدمن
            bot.sendMessage(ADMIN_ID, `🔔 **طلب استخدام جديد!**\n👤 الاسم: ${msg.from.first_name}\n🆔 الآيدي: \`${chatId}\`\nهل توافق على منحه الصلاحية؟`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [
                    [{text: '✅ موافقة', callback_data: `approve_${chatId}`}, {text: '❌ رفض', callback_data: `reject_${chatId}`}]
                ]}
            });
        }
        return bot.sendMessage(chatId, "⏳ حسابك قيد المراجعة، يرجى انتظار موافقة الإدارة لتتمكن من استخدام البوت.");
    }
    // ----------------------------------------------

    if (!userState[chatId]) userState[chatId] = { step: null, cancel: false, isInteractive: false }; 
    const state = userState[chatId];

    if (text === '/start') { return sendMainMenu(chatId); }

    try {
        if (state.step === 'awaiting_goto_url' && state.isInteractive) { state.step = null; let targetUrl = text; if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl; try { await state.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }); await sleep(3000); bot.sendMessage(chatId, `✅ تم.`); } catch(e){} await sendInteractiveMenu(bot, chatId); }
        else if (state.step === 'awaiting_search_text' && state.isInteractive) { state.step = null; try { const loc = state.page.locator(`text="${text}"`).first(); if (await loc.isVisible({ timeout: 5000 }).catch(()=>false)) { await loc.click(); await sleep(1500); bot.sendMessage(chatId, `🎯 تم.`); } else bot.sendMessage(chatId, `❌ فشل.`); } catch(e) {} await sendInteractiveMenu(bot, chatId); }
        else if (state.step === 'awaiting_move_mouse' && state.isInteractive) {
            const num = parseInt(text);
            if (!isNaN(num) && num >= 0 && num < TOTAL_CELLS) {
                state.step = null; try {
                    const vw = 1366 / GRID_COLS; const vh = 768 / GRID_ROWS; const col = num % GRID_COLS; const row = Math.floor(num / GRID_COLS);
                    const x = parseFloat(((col * vw) + (vw / 2)).toFixed(2)); const y = parseFloat(((row * vh) + (vh / 2)).toFixed(2));
                    state.mouseX = x; state.mouseY = y; await state.page.mouse.move(x, y); await drawRedDot(state.page, x, y);
                    const buffer = await state.page.screenshot({ fullPage: false, timeout: 15000 });
                    await bot.sendPhoto(chatId, buffer, { caption: `🔴 الماوس بالمربع [${num}].` }, { filename: 'dot.png', contentType: 'image/png' });
                } catch(e) {} await sendMouseMenu(bot, chatId);
            }
        }
        else if (state.step === 'awaiting_type_text' && state.isInteractive) { state.step = null; try { await state.page.keyboard.type(text, { delay: 50 }); await sleep(1000); bot.sendMessage(chatId, `⌨️ تمت الكتابة.`); } catch(e){} await sendInteractiveMenu(bot, chatId); }
        else if (state.step === 'awaiting_email' && chatId === ADMIN_ID) { 
            if (!text.includes('@')) return bot.sendMessage(chatId, "❌ إيميل غير صحيح."); 
            state.step = null; isProcessing = true; const autoPass = generateSecurePassword(); 
            bot.sendMessage(chatId, `✅ الباسورد: \`${autoPass}\``, {parse_mode: 'Markdown'}); 
            await createAccountLogic(bot, userState, chatId, true, { email: text, password: autoPass }, finishProcessing, sendMainMenu, ADMIN_ID, enableLiveMonitor); 
        }
    } catch(err) {}
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id; const data = query.data;
    bot.answerCallbackQuery(query.id).catch(() => {});

    // --- أوامر إدارة طلبات المستخدمين ---
    if (chatId === ADMIN_ID && data.startsWith('approve_')) {
        const targetId = data.split('_')[1]; approvedUsers[targetId] = 'approved'; saveUsers();
        bot.sendMessage(targetId, "✅ **تمت الموافقة على حسابك!** يمكنك الآن استخدام البوت.\nأرسل /start للبدء.", {parse_mode: 'Markdown'});
        return bot.editMessageText(`✅ تمت الموافقة على العضو \`${targetId}\``, {chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown'});
    }
    if (chatId === ADMIN_ID && data.startsWith('reject_')) {
        const targetId = data.split('_')[1]; approvedUsers[targetId] = 'rejected'; saveUsers();
        bot.sendMessage(targetId, "❌ تم رفض طلبك من قبل الإدارة.");
        return bot.editMessageText(`❌ تم رفض العضو \`${targetId}\``, {chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown'});
    }

    if (chatId !== ADMIN_ID && approvedUsers[chatId] !== 'approved') {
        return bot.sendMessage(chatId, "⏳ لا يمكنك استخدام البوت، حسابك قيد المراجعة.");
    }
    // ------------------------------------

    if (!userState[chatId]) userState[chatId] = { step: null, cancel: false, isInteractive: false }; 
    const state = userState[chatId];

    try {
        if (data === 'toggle_monitor' && chatId === ADMIN_ID) {
            enableLiveMonitor = !enableLiveMonitor;
            bot.sendMessage(chatId, `تم ${enableLiveMonitor ? 'تفعيل ✅' : 'إلغاء ❌'} المراقبة الحية. البوت سيرسل صوراً بصمت كل 5 ثواني أثناء العمليات.`);
            return sendMainMenu(chatId);
        }

        if (data.startsWith('int_')) {
            const action = data.replace('int_', '');
            if (!state.isInteractive || !state.page || state.page.isClosed()) return bot.sendMessage(chatId, "⚠️ الجلسة منتهية.");

            if (action === 'goto_url') { bot.sendMessage(chatId, "🌐 أرسل **الرابط**:", { reply_markup: { inline_keyboard: [[{text: "🔙 رجوع", callback_data: "int_back_main"}]] } }); state.step = 'awaiting_goto_url'; }
            else if (action === 'continue_af2') { bot.sendMessage(chatId, "⏳ يرجى استكمال الكود يدوياً."); }
            else if (action === 'search_text') { bot.sendMessage(chatId, "🔍 أرسل **النص**:", { reply_markup: { inline_keyboard: [[{text: "🔙", callback_data: "int_back_main"}]] } }); state.step = 'awaiting_search_text'; }
            else if (action === 'mouse_menu') { await sendMouseMenu(bot, chatId); }
            else if (action === 'show_grid') { await drawGridAndScreenshot(state.page, bot, chatId, `👁️ **الشبكة:**`); await sendMouseMenu(bot, chatId); }
            else if (action === 'move_mouse') { bot.sendMessage(chatId, `🧭 أرسل **رقم المربع**:`, { reply_markup: { inline_keyboard: [[{text: "🔙", callback_data: "int_back_main"}]] } }); state.step = 'awaiting_move_mouse'; }
            else if (action === 'click_mouse') {
                if (state.mouseX !== undefined && state.mouseY !== undefined) { try { await removeRedDot(state.page); await state.page.mouse.click(state.mouseX, state.mouseY); await sleep(1500); await bot.sendMessage(chatId, `🔴 تم الضغط!`); } catch(e) {} } else { bot.sendMessage(chatId, "⚠️ حرك الماوس أولاً."); } await sendInteractiveMenu(bot, chatId);
            }
            else if (action === 'type_text') { bot.sendMessage(chatId, "⌨️ أرسل النص:", { reply_markup: { inline_keyboard: [[{text: "🔙", callback_data: "int_back_main"}]] } }); state.step = 'awaiting_type_text'; }
            else if (action === 'press_enter') { try { await state.page.keyboard.press('Enter'); await sleep(1500); await bot.sendMessage(chatId, "↩️ تم."); } catch(e){} await sendInteractiveMenu(bot, chatId); }
            else if (action === 'refresh') { try { const buffer = await state.page.screenshot({ fullPage: false, timeout: 15000 }); await bot.sendPhoto(chatId, buffer, { caption: "📸 تحديث:" }, { filename: 'ref.png', contentType: 'image/png' }); } catch(e) {} await sendInteractiveMenu(bot, chatId); }
            else if (action === 'back_main') { state.step = null; await sendInteractiveMenu(bot, chatId); }
            else if (action === 'finish') {
                bot.sendMessage(chatId, "✅ جاري الاستخراج..."); state.isInteractive = false;
                if (state.context) await state.context.close().catch(()=>{}); if (state.tempDir) try { fs.rmSync(state.tempDir, { recursive: true, force: true }); } catch {}
                const jsCode = state.codeGen.getFinalScript(); const logPath = path.join(__dirname, `AutoGenerated_Script_${Date.now()}.js`); fs.writeFileSync(logPath, jsCode);
                await bot.sendDocument(chatId, logPath, { caption: "🧑‍💻 **تم!**", parse_mode: 'Markdown' }); fs.unlinkSync(logPath);
                if (state.resolveInteractive) state.resolveInteractive(); isProcessing = false; sendMainMenu(chatId);
            } return;
        }

        if (data === 'cancel') { 
            state.cancel = true; if (state.resolveInteractive) state.resolveInteractive(); 
            if (state.context) await state.context.close().catch(()=>{}); if (state.tempDir) try { fs.rmSync(state.tempDir, { recursive: true, force: true }); } catch {} 
            bot.sendMessage(chatId, "🛑 تم إلغاء العملية."); isProcessing = false; 
        }
        else if (data === 'create_auto') { 
            if (isProcessing) return bot.sendMessage(chatId, "⚠️ البوت مشغول حالياً، يرجى المحاولة بعد قليل."); isProcessing = true; 
            await createAccountLogic(bot, userState, chatId, false, null, finishProcessing, sendMainMenu, ADMIN_ID, enableLiveMonitor); 
        } 
        else if (data === 'create_manual') { 
            if (chatId !== ADMIN_ID) return bot.sendMessage(chatId, "⚠️ هذا الزر مخصص للإدارة فقط.");
            if (isProcessing) return bot.sendMessage(chatId, "⚠️ مشغول."); state.step = 'awaiting_email'; 
            bot.sendMessage(chatId, "➡️ أرسل **الإيميل**:"); 
        }
    } catch(err) { console.log(err); }
});

process.on('uncaughtException', (err) => { console.error('Uncaught:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled:', reason); });

console.log("🤖 البوت يعمل بنظام الحماية للمشتركين وصور البث للآدمن...");
