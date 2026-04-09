'use strict';

/**
 * registrar.js
 * Core registration orchestrator.
 * JS equivalent of Python main.py
 */

const config        = require('./config');
const logger        = require('./logger');
const { sleep, generateRandomPassword, saveToFile, updateAccountStatus } = require('./utils');
const { createTempEmail, waitForVerificationEmail } = require('./emailService');
const {
  createBrowser,
  fillSignupForm,
  enterVerificationCode,
  fillProfileInfo,
  subscribePlusTrial,
  cancelSubscription,
} = require('./browser');

/**
 * Register a single ChatGPT account.
 *
 * @param {Function} onProgress  Async callback (message: string) for live status updates
 * @returns {{ email, password, success }}
 */
async function registerOneAccount(onProgress = async () => {}) {
  let browser = null;
  let page    = null;
  let email   = null;
  let password = null;
  let success = false;

  const report = (msg) => {
    logger.info(msg);
    return onProgress(msg);
  };

  try {
    // 1. Create temporary email
    await report('📧 Creating temporary email...');
    const emailData = await createTempEmail();
    if (!emailData) {
      await report('❌ Failed to create email. Aborting.');
      return { email, password, success: false };
    }
    email = emailData.email;
    const jwt = emailData.jwt;
    await report(`✅ Email: \`${email}\``);

    // 2. Generate password
    password = generateRandomPassword();
    await report('✅ Password generated');

    // 3. Launch browser
    await report('🌐 Launching browser...');
    const instance = await createBrowser();
    browser = instance.browser;
    page    = instance.page;

    // 4. Open registration page
    await report('🔗 Opening ChatGPT signup page...');
    await page.goto('https://chat.openai.com/chat', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);

    // 5. Fill sign-up form
    await report('📝 Filling sign-up form...');
    if (!(await fillSignupForm(page, email, password))) {
      await report('❌ Failed to fill sign-up form');
      return { email, password, success: false };
    }

    // 6. Wait for verification email
    await report('⏳ Waiting for verification email...');
    const code = await waitForVerificationEmail(jwt);
    if (!code) {
      await report('❌ Verification code not received. Aborting.');
      return { email, password, success: false };
    }
    await report(`✅ Verification code received: \`${code}\``);

    // 7. Enter verification code
    await report('🔢 Entering verification code...');
    if (!(await enterVerificationCode(page, code))) {
      await report('❌ Failed to enter verification code');
      return { email, password, success: false };
    }

    // 8. Fill profile
    await report('👤 Filling profile info...');
    if (!(await fillProfileInfo(page))) {
      await report('❌ Failed to fill profile');
      return { email, password, success: false };
    }

    // 9. Save account
    saveToFile(email, password, 'Registered');
    success = true;

    await report([
      '🎉 *Registration successful!*',
      `📧 Email: \`${email}\``,
      `🔑 Password: \`${password}\``,
    ].join('\n'));

    await sleep(5000);

    // 10. Plus subscription
    await report('🚀 Starting Plus subscription...');
    if (await subscribePlusTrial(page)) {
      await report('🎉 Plus subscription activated!');
      updateAccountStatus(email, 'Plus Activated');

      // 11. Cancel subscription
      await report('🛑 Cancelling subscription to prevent billing...');
      await sleep(5000);
      if (await cancelSubscription(page)) {
        await report('✅ Subscription cancelled — Plus access retained for billing period.');
        updateAccountStatus(email, 'Subscription Cancelled');
      } else {
        await report('⚠️ Auto-cancellation failed. *Please cancel manually!*');
        updateAccountStatus(email, 'Cancel Failed - Manual Action Required');
      }
    } else {
      await report('⚠️ Plus subscription failed (card may be invalid)');
      updateAccountStatus(email, 'Plus Failed');
    }

  } catch (err) {
    logger.error(`❌ Registration error: ${err.message}`);
    await report(`❌ Error: ${err.message}`);
    if (email && password) updateAccountStatus(email, `Error: ${err.message.slice(0, 50)}`);
  } finally {
    if (browser) {
      logger.info('🔒 Closing browser...');
      await browser.close().catch(() => {});
    }
  }

  return { email, password, success };
}

/**
 * Run batch registration.
 *
 * @param {number}   totalAccounts   Number of accounts to register
 * @param {Function} onProgress      Progress callback
 * @returns {Array}  List of results
 */
async function runBatch(totalAccounts = null, onProgress = async () => {}) {
  const count = totalAccounts ?? config.registration.totalAccounts;
  const { batchIntervalMin, batchIntervalMax } = config.registration;

  await onProgress(`🚀 Starting batch registration: ${count} account(s)`);

  const results   = [];
  let successCount = 0;
  let failCount    = 0;

  for (let i = 0; i < count; i++) {
    await onProgress(`\n📝 Registering account ${i + 1} / ${count}...`);

    const result = await registerOneAccount(onProgress);
    results.push(result);

    if (result.success) successCount++;
    else failCount++;

    await onProgress([
      `📊 Progress: ${i + 1}/${count}`,
      `✅ Success: ${successCount}  ❌ Failed: ${failCount}`,
    ].join('\n'));

    if (i < count - 1) {
      const wait = batchIntervalMin + Math.floor(Math.random() * (batchIntervalMax - batchIntervalMin + 1));
      await onProgress(`⏳ Waiting ${wait}s before next registration...`);
      await sleep(wait * 1000);
    }
  }

  await onProgress([
    '🏁 *Batch complete!*',
    `Total: ${count}  ✅ Success: ${successCount}  ❌ Failed: ${failCount}`,
  ].join('\n'));

  return results;
}

module.exports = { registerOneAccount, runBatch };
