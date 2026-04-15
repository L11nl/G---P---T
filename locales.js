const { userState } = require('./bot');

const locales = {
    ar: {
        welcome: "👋 نورت ! اختر العملية للبدء:\n(يمكنك تشغيل عدة متصفحات معاً)",
        autoBtn: "▶️ تشغيل تلقائي",
        manualBtn: "✍️ تشغيل يدوي (مع 2FA)",
        langBtn: "🌐 التبديل إلى English",
        cancelBtn: "🛑 إلغاء العملية",
        startProcess: "بدء العملية...",
        emailPrompt: "➡️ أرسل **الإيميل** للبدء:",
        invalidEmail: "❌ إيميل غير صحيح.",
        gotEmail: "✅ تم استلام البريد.\n🔑 الباسورد: ",
        browserOpen: "فتح المتصفح ومحاولة تخطي الواجهات الجديدة...",
        findEmail: "البحث عن حقل الإيميل...",
        waitCode: "في انتظار صفحة الكود...",
        sendCodeManual: "🛑 يرجى إرسال الكود المكون من 6 أرقام هنا في الشات (إذا طُلب منك).",
        ageSuccess: "تم ملء بيانات العمر بنجاح",
        waitMain: "في انتظار الصفحة الرئيسية...",
        nukingPopups: "جاري صيد النوافذ الترحيبية وتدميرها...",
        manualSettingsNav: "نافذة الأمان لم تفتح، جاري الدخول إليها يدوياً...",
        successLogin: "نجح الدخول! التوجه الفوري لإعدادات الأمان واستكمال الـ 2FA...",
        findSecret: "جاري البحث عن الكود السري...",
        foundSecret: "تم العثور على الكود السري:",
        done2FA: "✅ **تم إنشاء الحساب وتفعيل المصادقة الثنائية بنجاح!**",
        sessionDoc: "📄 **بيانات السشن (Session Data)**",
        goToPromo: "التوجه لرابط العرض المجاني وسحب الرابط...",
        clickPromo: "الضغط على زر العرض والانتظار 3 ثواني...",
        promoLinkMsg: "💳 **الرابط الحالي (رابط الدفع) جاهز:**",
        scriptDoc: "🧑‍💻 **تم توليد السكربت النهائي بنجاح!**",
        manualModeSwitch: "⚠️ **توقف مؤقت للحماية:**\nتغير شكل الموقع، تم تحويلك للتحكم اليدوي.",
        failClose: "⚠️ **فشل كلي:** لم يتمكن المتصفح من البقاء مفتوحاً.",
        interactiveMenu: "🎮 **أنت الآن تتحكم بالمتصفح:**\nالبوت في وضع الاستعداد ولن يغلق إلا بموافقتك.",
        langChanged: "✅ تم تغيير اللغة إلى العربية."
    },
    en: {
        welcome: "👋 Welcome! Choose an operation to start:\n(You can run multiple browsers concurrently)",
        autoBtn: "▶️ Auto Create",
        manualBtn: "✍️ Manual Create (with 2FA)",
        langBtn: "🌐 Switch to العربية",
        cancelBtn: "🛑 Cancel",
        startProcess: "Starting process...",
        emailPrompt: "➡️ Send the **Email** to start:",
        invalidEmail: "❌ Invalid email.",
        gotEmail: "✅ Email received.\n🔑 Password: ",
        browserOpen: "Opening browser and bypassing initial screens...",
        findEmail: "Looking for email field...",
        waitCode: "Waiting for verification code...",
        sendCodeManual: "🛑 Please send the 6-digit code here in the chat.",
        ageSuccess: "Age/Birthday filled successfully.",
        waitMain: "Waiting for the main page...",
        nukingPopups: "Hunting and destroying welcome popups...",
        manualSettingsNav: "Security window didn't open, navigating manually...",
        successLogin: "Login successful! Heading to Security settings for 2FA...",
        findSecret: "Searching for secret code...",
        foundSecret: "Secret code found:",
        done2FA: "✅ **Account created and 2FA enabled successfully!**",
        sessionDoc: "📄 **Session Data**",
        goToPromo: "Heading to Promo link to extract payment URL...",
        clickPromo: "Clicking Claim button and waiting 3 seconds...",
        promoLinkMsg: "💳 **Current URL (Payment Link) is ready:**",
        scriptDoc: "🧑‍💻 **Final Script generated successfully!**",
        manualModeSwitch: "⚠️ **Temporary Pause:**\nUI changed, switched to manual control.",
        failClose: "⚠️ **Total Failure:** Browser closed unexpectedly.",
        interactiveMenu: "🎮 **You are now controlling the browser:**",
        langChanged: "✅ Language changed to English."
    }
};

function t(chatId, key) {
    const lang = (userState[chatId] && userState[chatId].lang) ? userState[chatId].lang : 'ar';
    return locales[lang][key] || key;
}

module.exports = { t, locales };
