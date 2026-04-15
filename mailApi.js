// mailApi.js

const axios = require('axios');
const { faker } = require('@faker-js/faker');
const crypto = require('crypto');

const MAIL_API = 'https://api.mail.tm';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function generateSecurePassword() {
    const chars = "00CHAT700z00";
    let password = "";
    for(let i=0; i<12; i++) password += chars.charAt(crypto.randomInt(0, chars.length));
    return password;
}

async function createMailTmAccount() {
    try {
        const domainsRes = await axios.get(`${MAIL_API}/domains`);
        const domains = domainsRes.data['hydra:member'] || [];
        const domain = domains[Math.floor(Math.random() * domains.length)].domain;
        const username = faker.person.firstName().toLowerCase() + crypto.randomBytes(2).toString('hex');
        const email = `${username}@${domain}`;
        const password = generateSecurePassword();
        await axios.post(`${MAIL_API}/accounts`, { address: email, password: password });
        const tokenRes = await axios.post(`${MAIL_API}/token`, { address: email, password: password });
        return { email, password, token: tokenRes.data.token };
    } catch (error) { throw new Error('تعذر إنشاء بريد مؤقت'); }
}

async function waitForMailTmCode(email, token, userState, chatId, maxWaitSeconds = 90) {
    const startTime = Date.now();
    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        if (userState[chatId] && userState[chatId].cancel) throw new Error("CANCELLED_BY_USER");
        try {
            const res = await axios.get(`${MAIL_API}/messages`, { headers: { Authorization: `Bearer ${token}` } });
            const messages = res.data['hydra:member'] || [];
            for (const msg of messages) {
                const codeMatch = `${msg.subject || ''} ${msg.intro || ''}`.match(/\b\d{6}\b/);
                if (codeMatch) return codeMatch[0];
            }
        } catch(e) {}
        await sleep(4000);
    }
    return null;
}

module.exports = {
    generateSecurePassword,
    createMailTmAccount,
    waitForMailTmCode,
    sleep
};
