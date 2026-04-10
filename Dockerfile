# استخدام نسخة Node.js الرسمية
FROM mcr.microsoft.com/playwright:v1.42.1-jammy

# إنشاء مجلد العمل داخل السيرفر
WORKDIR /app

# نسخ ملفات الإعدادات أولاً
COPY package*.json ./

# تثبيت المكتبات
RUN npm install

# نسخ بقية ملفات المشروع (مثل index.js)
COPY . .

# أمر تشغيل البوت
CMD ["node", "index.js"]
