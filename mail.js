const axios = require('axios');
const { faker } = require('@faker-js/faker');
const crypto = require('crypto');
const config = require('./config');
const { sleep, generateSecurePassword } = require('./utils');
const { userState } = require('./bot');

async function createMailTmAccount() {
    try {
        // موقع Byom لا يحتاج إلى إنشاء حساب عبر سيرفر خارجي
        // نكتفي بتوليد اسم عشوائي فريد وإضافة @byom.de
        const username = faker.person.firstName().toLowerCase() + crypto.randomBytes(3).toString('hex');
        const email = `${username}@byom.de`;
        const password = generateSecurePassword(); // احتفظنا بها كي لا يتعطل باقي مشروعك
        
        // نرجع المتغيرات بنفس الهيكلية القديمة لكي يقرأها core.js بدون أخطاء
        return { email, password, token: username }; 
    } catch (error) { 
        throw new Error('تعذر إنشاء بريد مؤقت'); 
    }
}

async function waitForMailTmCode(email, token, chatId, maxWaitSeconds = 90) {
    const startTime = Date.now();
    // استخراج اسم الايميل (ما قبل الـ @) لاستخدامه في رابط الـ RSS
    const prefix = email.split('@')[0];
    const feedUrl = `${config.MAIL_API}${prefix}`;

    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        if (userState[chatId]?.cancel) throw new Error("CANCELLED_BY_USER");
        try {
            // جلب بيانات الـ RSS بصيغة XML عبر axios 
            const res = await axios.get(feedUrl);
            const xmlData = res.data; // النص الكامل للرسائل

            // إذا كان النص يحتوي على <item> فهذا يعني أن هناك رسالة جديدة وصلت
            if (xmlData.includes('<item>')) {
                // البحث عن أي كود مكون من 6 أرقام (OTP) داخل محتوى الرسالة
                const codeMatch = xmlData.match(/\b\d{6}\b/);
                if (codeMatch) return codeMatch[0];
            }
        } catch(e) {
            // تجاهل أخطاء الشبكة المؤقتة بصمت واستمرار المحاولة
        }
        await sleep(4000); // الانتظار 4 ثوانٍ قبل التحديث مرة أخرى
    }
    return null; // إذا انتهى الوقت ولم يصل شيء
}

module.exports = { createMailTmAccount, waitForMailTmCode };
