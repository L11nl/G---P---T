'use strict';

/**
 * browser.js
 * Puppeteer browser automation for ChatGPT registration.
 * JS equivalent of Python browser.py (Selenium → Puppeteer)
 */

const puppeteer = require('puppeteer');
const config    = require('./config');
const logger    = require('./logger');
const { sleep, generateUserInfo, generateBillingInfo } = require('./utils');

const { browser: browserCfg } = config;

// ─────────────────────────────────────────────────────────────
// Browser Factory
// ─────────────────────────────────────────────────────────────

async function createBrowser() {
  logger.info('🌐 Launching browser...');

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--disable-blink-features=AutomationControlled',
    '--lang=en-US,en',
  ];

  const browser = await puppeteer.launch({
    headless: 'new',
    args,
    ignoreHTTPSErrors: true,
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();

  // ── Anti-detection patches ────────────────────────────────
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

    window.chrome = {
      runtime: {},
      loadTimes: () => {},
      csi: () => {},
      app: {},
    };

    const origQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (params) =>
      params.name === 'notifications'
        ? Promise.resolve({ state: 'denied' })
        : origQuery(params);

    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return 'Intel Inc.';
      if (param === 37446) return 'Intel(R) Iris(R) Xe Graphics';
      return getParam.call(this, param);
    };
  });

  await page.setUserAgent(browserCfg.userAgent);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  logger.info('✅ Browser ready');
  return { browser, page };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function typeSlowly(page, selector, text, delay = 60) {
  await page.focus(selector);
  await page.type(selector, text, { delay });
}

async function waitAndClick(page, selector, timeout = 30000) {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.click(selector);
}

async function safeClick(page, selector, timeout = 30000) {
  try {
    await waitAndClick(page, selector, timeout);
    return true;
  } catch {
    return false;
  }
}

async function clickWithRetry(page, selector, maxRetries = null) {
  const retries = maxRetries ?? browserCfg.buttonClickMaxRetries;
  for (let i = 0; i < retries; i++) {
    if (await safeClick(page, selector)) return true;
    logger.warn(`  Retry click ${i + 1}/${retries}...`);
    await sleep(2000);
  }
  return false;
}

async function checkAndHandleError(page, maxRetries = null) {
  const retries = maxRetries ?? browserCfg.errorPageMaxRetries;
  for (let i = 0; i < retries; i++) {
    try {
      const content = await page.content();
      const lower   = content.toLowerCase();
      const hasError = ['error', 'timed out', 'operation timeout', 'route error', 'invalid content']
        .some((kw) => lower.includes(kw));

      if (hasError) {
        logger.warn(`⚠️ Error page detected, retrying (${i + 1}/${retries})...`);
        await page.click('button[data-dd-action-name="Try again"]').catch(() => {});
        await sleep(5000 + i * 2000);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Handle Cloudflare
// ─────────────────────────────────────────────────────────────

async function handleCloudflare(page) {
  const title = await page.title();
  if (!title.includes('Just a moment') && !title.includes('请稍候')) return;

  logger.warn('⚠️ Cloudflare challenge detected, waiting...');
  await sleep(10000);

  // Try clicking the challenge checkbox inside iframe
  try {
    const frames = page.frames();
    for (const frame of frames) {
      try {
        const checkbox = await frame.$('#checkbox, .checkbox, input[type="checkbox"]');
        if (checkbox) {
          await checkbox.click();
          await sleep(5000);
          break;
        }
      } catch {}
    }
  } catch {}
}

// ─────────────────────────────────────────────────────────────
// Fill Sign-Up Form
// ─────────────────────────────────────────────────────────────

async function fillSignupForm(page, email, password) {
  logger.info('📧 Filling sign-up form...');

  try {
    await handleCloudflare(page);

    // Click Sign up button if present
    try {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const signup = btns.find((b) => /sign up|注册/i.test(b.textContent));
        if (signup) signup.click();
      });
      await sleep(2000);
    } catch {}

    // Wait for email input
    const emailSelector = 'input[type="email"], input[name="email"], input[autocomplete="email"]';
    await page.waitForSelector(emailSelector, { visible: true, timeout: browserCfg.shortWaitTime * 1000 });
    await typeSlowly(page, emailSelector, email);
    logger.info(`✅ Email entered: ${email}`);

    await sleep(1000);

    // Click continue
    await clickWithRetry(page, 'button[type="submit"]');
    logger.info('✅ Continue clicked');
    await sleep(3000);

    // Password
    const pwdSelector = 'input[autocomplete="new-password"], input[type="password"]';
    await page.waitForSelector(pwdSelector, { visible: true, timeout: browserCfg.shortWaitTime * 1000 });
    await page.click(pwdSelector);
    await page.type(pwdSelector, password, { delay: 60 });
    logger.info('✅ Password entered');
    await sleep(2000);

    await clickWithRetry(page, 'button[type="submit"]');
    logger.info('✅ Continue clicked (password)');
    await sleep(3000);

    await checkAndHandleError(page);
    return true;
  } catch (err) {
    logger.error(`❌ fillSignupForm failed: ${err.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Enter Verification Code
// ─────────────────────────────────────────────────────────────

async function enterVerificationCode(page, code) {
  logger.info('🔢 Entering verification code...');

  try {
    await checkAndHandleError(page);

    const codeSelectors = [
      'input[name="code"]',
      'input[placeholder*="code" i]',
      'input[aria-label*="code" i]',
      'input[autocomplete="one-time-code"]',
    ];

    let codeInput = null;
    for (const sel of codeSelectors) {
      try {
        await page.waitForSelector(sel, { visible: true, timeout: 10000 });
        codeInput = sel;
        break;
      } catch {}
    }

    if (!codeInput) {
      // Fallback: wait longer with a generic selector
      await page.waitForSelector('input', { visible: true, timeout: 60000 });
      codeInput = 'input';
    }

    await page.click(codeInput, { clickCount: 3 });
    await page.type(codeInput, code, { delay: 100 });
    logger.info(`✅ Code entered: ${code}`);
    await sleep(2000);

    await clickWithRetry(page, 'button[type="submit"]');
    logger.info('✅ Continue clicked');
    await sleep(3000);

    await checkAndHandleError(page);
    return true;
  } catch (err) {
    logger.error(`❌ enterVerificationCode failed: ${err.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Fill Profile Info
// ─────────────────────────────────────────────────────────────

async function fillProfileInfo(page) {
  logger.info('👤 Filling profile info...');

  const info = generateUserInfo();

  try {
    // Name
    const nameSelector = 'input[name="name"], input[autocomplete="name"]';
    await page.waitForSelector(nameSelector, { visible: true, timeout: 60000 });
    await page.click(nameSelector, { clickCount: 3 });
    await page.type(nameSelector, info.name, { delay: 60 });
    logger.info(`✅ Name entered: ${info.name}`);
    await sleep(1000);

    // Birthday
    await page.waitForSelector('[data-type="year"]', { visible: true, timeout: 30000 });

    await page.click('[data-type="year"]', { clickCount: 3 });
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.type('[data-type="year"]', info.year, { delay: 100 });
    await sleep(500);

    await page.click('[data-type="month"]', { clickCount: 3 });
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.type('[data-type="month"]', info.month, { delay: 100 });
    await sleep(500);

    await page.click('[data-type="day"]', { clickCount: 3 });
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.type('[data-type="day"]', info.day, { delay: 100 });

    logger.info(`✅ Birthday entered: ${info.year}/${info.month}/${info.day}`);
    await sleep(1000);

    // Submit
    await clickWithRetry(page, 'button[type="submit"]');
    logger.info('✅ Profile submitted');
    return true;
  } catch (err) {
    logger.error(`❌ fillProfileInfo failed: ${err.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Stripe Field Filler (handles iframes)
// ─────────────────────────────────────────────────────────────

async function fillStripeField(page, fieldName, selectors, value) {
  const selectorList = selectors.split(',').map((s) => s.trim());

  // Try main frame
  for (const sel of selectorList) {
    try {
      const el = await page.$(sel);
      if (el) {
        const visible = await page.evaluate((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }, el);
        if (visible) {
          await el.click({ clickCount: 3 });
          await page.type(sel, value, { delay: 60 });
          logger.info(`  ✅ ${fieldName} filled (main frame)`);
          return true;
        }
      }
    } catch {}
  }

  // Try iframes
  const frames = page.frames();
  for (const frame of frames) {
    for (const sel of selectorList) {
      try {
        const el = await frame.$(sel);
        if (el) {
          await el.click({ clickCount: 3 });
          await frame.type(sel, value, { delay: 60 });
          logger.info(`  ✅ ${fieldName} filled (iframe)`);
          return true;
        }
      } catch {}
    }
  }

  logger.warn(`  ❌ Could not find field: ${fieldName}`);
  return false;
}

// ─────────────────────────────────────────────────────────────
// Subscribe Plus Trial
// ─────────────────────────────────────────────────────────────

async function subscribePlusTrial(page) {
  logger.info('\n💳 Starting Plus subscription flow...');

  try {
    await page.goto('https://chatgpt.com/#pricing', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(5000);

    // ── Clear onboarding popups ─────────────────────────────
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const popup = btns.find((b) =>
          /next|okay|done|start|got it|close|dismiss|下一步|知道了|开始|跳过/i.test(b.textContent)
        );
        if (popup && !/upgrade|plus|trial/i.test(popup.textContent)) popup.click();
      });
      await sleep(1000);
    }

    // ── Click Plus subscribe button ─────────────────────────
    const plusBtnXPaths = [
      '//button[contains(., "领取免费试用")]',
      '//button[contains(., "Start trial")]',
      '//button[contains(., "Get Plus")]',
      '//button[contains(., "Upgrade to Plus")]',
    ];

    let clicked = false;
    for (const xpath of plusBtnXPaths) {
      try {
        const [btn] = await page.$x(xpath);
        if (btn) {
          await btn.evaluate((b) => b.scrollIntoView({ block: 'center' }));
          await sleep(500);
          await btn.click();
          clicked = true;
          logger.info('✅ Plus button clicked');
          break;
        }
      } catch {}
    }

    if (!clicked) {
      logger.error('❌ Plus subscribe button not found');
      return false;
    }

    // ── Wait for payment form ────────────────────────────────
    logger.info('⏳ Waiting for payment form...');
    const start = Date.now();
    while (Date.now() - start < 30000) {
      const content = await page.content();
      if (content.toLowerCase().includes('stripe') || content.toLowerCase().includes('card')) break;
      await sleep(1000);
    }
    await sleep(2000);

    // ── Detect country ───────────────────────────────────────
    let countryCode = 'JP';
    try {
      const val = await page.$eval(
        'select[name="billingAddressCountry"], select[id^="Field-countryInput"]',
        (el) => el.value
      );
      if (['US', 'United States'].includes(val)) countryCode = 'US';
    } catch {}
    logger.info(`🌏 Country detected: ${countryCode}`);

    const billing = generateBillingInfo(countryCode);
    const card    = config.payment.creditCard;

    // ── Fill billing name ────────────────────────────────────
    await fillStripeField(
      page,
      'Name',
      '#Field-nameInput, #Field-billingNameInput, input[name="name"], input[autocomplete="name"], input[autocomplete="cc-name"]',
      billing.name
    );
    await sleep(800);

    // ── Fill address ─────────────────────────────────────────
    // Zip
    await fillStripeField(
      page,
      'ZIP',
      '#Field-postalCodeInput, input[name="postalCode"], input[placeholder*="Zip" i], input[placeholder*="postal" i]',
      billing.zip
    );
    await sleep(3000); // Stripe loads state/city after zip

    // State
    await fillStripeField(
      page,
      'State',
      '#Field-administrativeAreaInput, select[name="state"], input[name="state"]',
      billing.state
    );
    await sleep(500);

    // City
    await fillStripeField(
      page,
      'City',
      '#Field-localityInput, input[name="city"], input[placeholder*="City" i]',
      billing.city
    );
    await sleep(500);

    // Address line 1
    await fillStripeField(
      page,
      'Address',
      '#Field-addressLine1Input, input[name="addressLine1"], input[placeholder*="Address line 1" i]',
      billing.address1
    );
    await sleep(500);

    // ── Fill card ────────────────────────────────────────────
    await fillStripeField(
      page,
      'Card number',
      'input[name="cardnumber"], input[autocomplete="cc-number"], input[placeholder*="0000" i]',
      card.number
    );
    await sleep(800);

    await fillStripeField(
      page,
      'Expiry',
      'input[name="exp-date"], input[name="expirationDate"], input[placeholder="MM / YY"], input[autocomplete="cc-exp"]',
      card.expiry
    );
    await sleep(800);

    await fillStripeField(
      page,
      'CVC',
      'input[name="cvc"], input[name="securityCode"], input[placeholder="CVC"]',
      card.cvc
    );
    await sleep(800);

    // ── Submit loop ──────────────────────────────────────────
    for (let attempt = 0; attempt < 5; attempt++) {
      logger.info(`🔄 Submit attempt ${attempt + 1}/5...`);
      await safeClick(page, "button[type='submit'], button[class*='Subscribe']");
      await sleep(3000);

      // Check for missing fields and re-fill
      const hasErrors = await page.evaluate(() =>
        !!document.querySelector('.StripeElement--invalid, [class*="error"], [role="alert"]')
      );

      if (!hasErrors) {
        logger.info('✅ No form errors detected');
        break;
      }
      logger.warn('⚠️ Form errors found, retrying...');
      await sleep(1000);
    }

    // ── Wait for success ─────────────────────────────────────
    const waitStart = Date.now();
    while (Date.now() - waitStart < 30000) {
      const url = page.url();
      if (url.includes('chatgpt.com') && !url.includes('pricing') && !url.includes('payment')) {
        logger.info('✅ Redirected to main page — subscription successful!');
        return true;
      }
      await sleep(2000);
    }

    logger.error('❌ Timeout waiting for subscription confirmation');
    return false;
  } catch (err) {
    logger.error(`❌ subscribePlusTrial failed: ${err.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Cancel Subscription
// ─────────────────────────────────────────────────────────────

async function cancelSubscription(page) {
  logger.info('\n🛑 Starting subscription cancellation...');

  try {
    if (!page.url().includes('chatgpt.com')) {
      await page.goto('https://chatgpt.com', { waitUntil: 'networkidle2', timeout: 30000 });
    }

    // Wait for the page to load
    await page.waitForSelector('#prompt-textarea', { timeout: 20000 }).catch(() => {});
    await sleep(2000);

    // Clear welcome dialogs
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const popup = btns.find((b) => /Okay|Let|开始/i.test(b.textContent));
        if (popup) popup.click();
      });
      await sleep(1000);
    }

    // Open user menu
    const menuSelectors = ['div[data-testid="user-menu"]', '.text-token-text-secondary'];
    let menuOpened = false;
    for (const sel of menuSelectors) {
      if (await safeClick(page, sel, 5000)) {
        menuOpened = true;
        break;
      }
    }

    if (!menuOpened) {
      logger.error('❌ Could not open user menu');
      return false;
    }
    await sleep(2000);

    // Try "My Plan" path
    const [myPlan] = await page.$x('//div[contains(text(), "My plan") or contains(text(), "我的套餐")]');
    if (myPlan) {
      await myPlan.click();
      await sleep(2000);

      const [manageBtn] = await page.$x('//button[contains(., "Manage my subscription") or contains(., "管理我的订阅")]');
      if (manageBtn) {
        await manageBtn.click();
        await sleep(5000);
      }
    } else {
      // Settings path
      const [settings] = await page.$x('//div[contains(text(), "Settings") or contains(text(), "设置")]');
      if (settings) {
        await settings.click();
        await sleep(2000);
      }

      // Click Manage
      const manageBtns = await page.$x('//button[contains(., "Manage") or contains(., "管理")]');
      for (const btn of manageBtns) {
        const visible = await btn.evaluate((b) => b.offsetParent !== null);
        if (visible) {
          await btn.click();
          await sleep(2000);
          break;
        }
      }
    }

    // Find cancel option
    const cancelXPaths = [
      '//button[contains(., "Cancel plan") or contains(., "取消方案")]',
      '//button[contains(., "Cancel trial") or contains(., "取消试用")]',
      '//*[contains(text(), "取消订阅") or contains(text(), "Cancel subscription")]',
    ];

    for (const xpath of cancelXPaths) {
      const [cancelBtn] = await page.$x(xpath);
      if (cancelBtn) {
        await cancelBtn.click();
        logger.info('✅ Cancel button clicked');
        await sleep(2000);

        // Confirm
        const confirmXPaths = [
          '//button[contains(., "Cancel plan") or contains(., "Confirm cancellation")]',
          '//button[contains(., "取消方案") or contains(., "确认取消")]',
        ];
        for (const cxp of confirmXPaths) {
          const [confirmBtn] = await page.$x(cxp);
          if (confirmBtn) {
            await confirmBtn.click();
            logger.info('✅ Cancellation confirmed!');
            return true;
          }
        }
        return true; // Treat single click as success
      }
    }

    logger.warn('⚠️ Cancel button not found');
    return false;
  } catch (err) {
    logger.error(`❌ cancelSubscription failed: ${err.message}`);
    return false;
  }
}

module.exports = {
  createBrowser,
  fillSignupForm,
  enterVerificationCode,
  fillProfileInfo,
  subscribePlusTrial,
  cancelSubscription,
};
