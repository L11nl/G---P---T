'use strict';

/**
 * emailService.js
 * Cloudflare Temp Email service integration.
 * JS equivalent of Python email_service.py
 */

const axios  = require('axios');
const { simpleParser } = require('mailparser');
const config = require('./config');
const logger = require('./logger');
const { sleep, extractVerificationCode } = require('./utils');

const { email: emailCfg } = config;

// ─────────────────────────────────────────────────────────────
// HTTP Client
// ─────────────────────────────────────────────────────────────

const httpClient = axios.create({
  timeout: config.browser.httpTimeout * 1000,
  headers: {
    'User-Agent': config.browser.userAgent,
    'Content-Type': 'application/json',
  },
});

// ─────────────────────────────────────────────────────────────
// Create Temp Email
// ─────────────────────────────────────────────────────────────

async function createTempEmail() {
  logger.info('📧 Creating temporary email...');

  const chars  = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const prefix = Array.from({ length: emailCfg.prefixLength }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');

  try {
    const res = await httpClient.post(`${emailCfg.workerUrl}/api/new_address`, {
      name: prefix,
    });

    if (res.status === 200 && res.data) {
      const { jwt, address } = res.data;
      if (jwt && address) {
        logger.info(`✅ Email created: ${address}`);
        return { email: address, jwt };
      }
      if (jwt) {
        const fallback = `tmp${prefix}@${emailCfg.domain}`;
        logger.info(`✅ Email created (fallback): ${fallback}`);
        return { email: fallback, jwt };
      }
    }

    logger.error(`❌ Email API error: HTTP ${res.status}`);
  } catch (err) {
    logger.error(`❌ createTempEmail failed: ${err.message}`);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Fetch Emails
// ─────────────────────────────────────────────────────────────

async function fetchEmails(jwt) {
  try {
    const res = await httpClient.get(`${emailCfg.workerUrl}/api/mails?limit=20&offset=0`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    if (res.status === 200) {
      if (Array.isArray(res.data)) return res.data;
      if (res.data?.results) return res.data.results;
      if (res.data?.mails)   return res.data.mails;
      return [];
    }
  } catch (err) {
    logger.warn(`fetchEmails error: ${err.message}`);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Get Email Detail
// ─────────────────────────────────────────────────────────────

async function getEmailDetail(jwt, emailId) {
  try {
    const res = await httpClient.get(`${emailCfg.workerUrl}/api/mails/${emailId}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status === 200) return res.data;
  } catch (err) {
    logger.warn(`getEmailDetail error: ${err.message}`);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Parse Raw Email
// ─────────────────────────────────────────────────────────────

async function parseRawEmail(raw) {
  if (!raw) return { subject: '', body: '', sender: '' };
  try {
    const parsed = await simpleParser(raw);
    return {
      subject: parsed.subject || '',
      body:    parsed.text || parsed.html || '',
      sender:  parsed.from?.text || '',
    };
  } catch {
    return { subject: '', body: raw, sender: '' };
  }
}

// ─────────────────────────────────────────────────────────────
// Wait For Verification Email
// ─────────────────────────────────────────────────────────────

async function waitForVerificationEmail(jwt, timeout = null) {
  const maxTime = (timeout ?? emailCfg.waitTimeout) * 1000;
  logger.info(`⏳ Waiting for verification email (max ${maxTime / 1000}s)...`);

  const start = Date.now();

  while (Date.now() - start < maxTime) {
    const emails = await fetchEmails(jwt);

    if (emails && emails.length > 0) {
      for (const item of emails) {
        let subject = '', body = '', sender = '';

        if (item.raw) {
          const parsed = await parseRawEmail(item.raw);
          subject = parsed.subject;
          body    = parsed.body;
          sender  = parsed.sender.toLowerCase();
        } else {
          sender  = String(item.from || item.source || '').toLowerCase();
          subject = item.subject || '';
        }

        if (sender.includes('openai') || subject.toLowerCase().includes('chatgpt')) {
          logger.info(`📧 Verification email received! Subject: ${subject}`);

          // Try subject first
          let code = extractVerificationCode(subject);
          if (code) return code;

          // Try body
          if (body) {
            code = extractVerificationCode(body);
            if (code) return code;
          }

          // Try detail endpoint
          if (item.id) {
            const detail = await getEmailDetail(jwt, item.id);
            if (detail) {
              if (detail.raw) {
                const dp = await parseRawEmail(detail.raw);
                code = extractVerificationCode(dp.subject) || extractVerificationCode(dp.body);
                if (code) return code;
              }
              const content = detail.html || detail.text || detail.content || '';
              code = extractVerificationCode(content);
              if (code) return code;
            }
          }
        }
      }
    }

    const elapsed = Math.floor((Date.now() - start) / 1000);
    process.stdout.write(`\r  Waiting... (${elapsed}s)`);
    await sleep(emailCfg.pollInterval * 1000);
  }

  process.stdout.write('\n');
  logger.warn('⏰ Verification email timeout');
  return null;
}

module.exports = {
  createTempEmail,
  fetchEmails,
  getEmailDetail,
  waitForVerificationEmail,
};
