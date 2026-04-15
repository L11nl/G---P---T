require('dotenv').config();

module.exports = {
    // يتم استدعاء التوكن من ملف .env فقط لحماية بياناتك
    BOT_TOKEN: process.env.BOT_TOKEN,
    
    // يتم استدعاء آيدي المدير من ملف .env
    ADMIN_ID: process.env.ADMIN_ID,
    
    // 🟢 تم التعديل إلى واجهة Byom.de الجديدة
    MAIL_API: 'https://byom.de/api/rss.php?mail=',
    
    ACCOUNTS_FILE: 'accounts.txt',
    
    // إعدادات الشبكة الأصلية الخاصة بك
    GRID_COLS: 45,
    GRID_ROWS: 25,
    
    // أضفنا هذا السطر لأن نظام الماوس يحتاجه لمعرفة الحد الأقصى للمربعات (45 × 25)
    TOTAL_CELLS: 1125 
};
