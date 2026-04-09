'use strict';

/**
 * config.js
 * Loads and validates all configuration from environment variables.
 * Equivalent to the Python config.py module.
 */

require('dotenv').config();

function requireEnv(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optionalEnv(key, defaultValue) {
  return process.env[key] || defaultValue;
}

function optionalInt(key, defaultValue) {
  const val = process.env[key];
  return val ? parseInt(val, 10) : defaultValue;
}

const config = {
  // ── Telegram ─────────────────────────────────────────────────────────────
  telegram: {
    token: requireEnv('TELEGRAM_BOT_TOKEN'),
    allowedUsers: process.env.ALLOWED_USER_IDS
      ? process.env.ALLOWED_USER_IDS.split(',').map((id) => parseInt(id.trim(), 10))
      : [],
  },

  // ── Cloudflare Temp Email ─────────────────────────────────────────────────
  email: {
    workerUrl:     requireEnv('EMAIL_WORKER_URL'),
    domain:        requireEnv('EMAIL_DOMAIN'),
    prefixLength:  optionalInt('EMAIL_PREFIX_LENGTH', 10),
    waitTimeout:   optionalInt('EMAIL_WAIT_TIMEOUT', 120),
    pollInterval:  optionalInt('EMAIL_POLL_INTERVAL', 3),
    adminPassword: requireEnv('EMAIL_ADMIN_PASSWORD'),
  },

  // ── Registration ──────────────────────────────────────────────────────────
  registration: {
    totalAccounts:   optionalInt('TOTAL_ACCOUNTS', 1),
    minAge:          optionalInt('MIN_AGE', 20),
    maxAge:          optionalInt('MAX_AGE', 40),
    batchIntervalMin: optionalInt('BATCH_INTERVAL_MIN', 5),
    batchIntervalMax: optionalInt('BATCH_INTERVAL_MAX', 15),
  },

  // ── Password ──────────────────────────────────────────────────────────────
  password: {
    length: optionalInt('PASSWORD_LENGTH', 16),
    charset: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%',
  },

  // ── Payment ───────────────────────────────────────────────────────────────
  payment: {
    creditCard: {
      number:      optionalEnv('CARD_NUMBER', ''),
      expiry:      optionalEnv('CARD_EXPIRY', ''),
      expiryMonth: optionalEnv('CARD_EXPIRY_MONTH', ''),
      expiryYear:  optionalEnv('CARD_EXPIRY_YEAR', ''),
      cvc:         optionalEnv('CARD_CVC', ''),
    },
  },

  // ── Browser ───────────────────────────────────────────────────────────────
  browser: {
    maxWaitTime:          optionalInt('MAX_WAIT_TIME', 600),
    shortWaitTime:        optionalInt('SHORT_WAIT_TIME', 120),
    httpMaxRetries:       optionalInt('HTTP_MAX_RETRIES', 5),
    httpTimeout:          optionalInt('HTTP_TIMEOUT', 30),
    errorPageMaxRetries:  optionalInt('ERROR_PAGE_MAX_RETRIES', 5),
    buttonClickMaxRetries: optionalInt('BUTTON_CLICK_MAX_RETRIES', 3),
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },

  // ── Files ─────────────────────────────────────────────────────────────────
  files: {
    accountsFile: optionalEnv('ACCOUNTS_FILE', 'registered_accounts.txt'),
  },
};

module.exports = config;
