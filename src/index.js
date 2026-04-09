'use strict';

/**
 * index.js
 * Telegram Bot entry point.
 * Runs on Railway (or any Node.js host) via GitHub deployment.
 */

require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const config      = require('./config');
const logger      = require('./logger');
const { readAccountsFile } = require('./utils');
const { registerOneAccount, runBatch } = require('./registrar');

// ─────────────────────────────────────────────────────────────
// Bot Setup
// ─────────────────────────────────────────────────────────────

const bot = new TelegramBot(config.telegram.token, { polling: true });
logger.info('🤖 Telegram bot started (polling mode)');

// Track active registration tasks per chat
const activeTasks = new Map();

// ─────────────────────────────────────────────────────────────
// Auth Middleware
// ─────────────────────────────────────────────────────────────

function isAuthorized(userId) {
  if (!config.telegram.allowedUsers || config.telegram.allowedUsers.length === 0) return true;
  return config.telegram.allowedUsers.includes(userId);
}

function authCheck(msg) {
  if (!isAuthorized(msg.from.id)) {
    bot.sendMessage(msg.chat.id, '⛔ You are not authorized to use this bot.');
    logger.warn(`Unauthorized access attempt by user ${msg.from.id}`);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
// Message Helpers
// ─────────────────────────────────────────────────────────────

async function sendMsg(chatId, text, extra = {}) {
  try {
    return await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...extra,
    });
  } catch (err) {
    logger.warn(`sendMsg error: ${err.message}`);
  }
}

async function editMsg(chatId, msgId, text) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'Markdown',
    });
  } catch {
    // Message may not have changed — ignore
  }
}

// ─────────────────────────────────────────────────────────────
// /start  /help
// ─────────────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  if (!authCheck(msg)) return;

  const text = [
    '👋 *Welcome to GPT Auto Register Bot*',
    '',
    '📋 *Available Commands:*',
    '`/register` — Register 1 account',
    '`/batch <n>` — Register N accounts in batch (e.g. `/batch 3`)',
    '`/accounts` — Show saved accounts',
    '`/status` — Show current task status',
    '`/cancel` — Cancel running task',
    '`/help` — Show this help message',
    '',
    '⚠️ _For research and educational purposes only._',
    '_Please respect OpenAI\'s Terms of Service._',
  ].join('\n');

  sendMsg(msg.chat.id, text);
});

bot.onText(/\/help/, (msg) => {
  if (!authCheck(msg)) return;
  bot.emit('text', { ...msg, text: '/start' });
});

// ─────────────────────────────────────────────────────────────
// /register — Single account
// ─────────────────────────────────────────────────────────────

bot.onText(/\/register$/, async (msg) => {
  if (!authCheck(msg)) return;

  const chatId = msg.chat.id;

  if (activeTasks.get(chatId)) {
    return sendMsg(chatId, '⚠️ A registration task is already running. Use /cancel to stop it first.');
  }

  const statusMsg = await sendMsg(chatId, '🔄 *Starting registration...*');
  const logLines  = [];

  const onProgress = async (line) => {
    logLines.push(line);
    // Keep last 20 lines to avoid exceeding Telegram message length
    const visible = logLines.slice(-20).join('\n');
    await editMsg(chatId, statusMsg.message_id, `🔄 *Registration in progress...*\n\n${visible}`);
  };

  const task = (async () => {
    try {
      await registerOneAccount(onProgress);
    } finally {
      activeTasks.delete(chatId);
    }
  })();

  activeTasks.set(chatId, task);
  await task;
});

// ─────────────────────────────────────────────────────────────
// /batch — Batch registration
// ─────────────────────────────────────────────────────────────

bot.onText(/\/batch(?:\s+(\d+))?/, async (msg, match) => {
  if (!authCheck(msg)) return;

  const chatId = msg.chat.id;

  if (activeTasks.get(chatId)) {
    return sendMsg(chatId, '⚠️ A task is already running. Use /cancel to stop it first.');
  }

  const n = match[1] ? parseInt(match[1], 10) : config.registration.totalAccounts;

  if (isNaN(n) || n < 1 || n > 20) {
    return sendMsg(chatId, '❌ Please specify a number between 1 and 20.\nExample: `/batch 3`');
  }

  const statusMsg = await sendMsg(chatId, `🔄 *Starting batch registration for ${n} account(s)...*`);
  const logLines  = [];

  const onProgress = async (line) => {
    logLines.push(line);
    const visible = logLines.slice(-25).join('\n');
    await editMsg(chatId, statusMsg.message_id,
      `🔄 *Batch registration (${n} accounts)*\n\n${visible}`
    );
  };

  const task = (async () => {
    try {
      await runBatch(n, onProgress);
    } finally {
      activeTasks.delete(chatId);
    }
  })();

  activeTasks.set(chatId, task);
  await task;
});

// ─────────────────────────────────────────────────────────────
// /accounts — Show saved accounts
// ─────────────────────────────────────────────────────────────

bot.onText(/\/accounts/, (msg) => {
  if (!authCheck(msg)) return;

  const lines   = readAccountsFile();
  const chatId  = msg.chat.id;

  if (!lines.length) {
    return sendMsg(chatId, '📭 No accounts saved yet.');
  }

  // Format: email | password | date | status
  const rows = lines.map((line, i) => {
    const [email, pwd, date, status] = line.split('----');
    return `*${i + 1}.* \`${email}\`\n   🔑 \`${pwd}\`\n   📅 ${date} — ${status}`;
  });

  // Send in chunks of 10 to avoid huge messages
  const CHUNK = 10;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).join('\n\n');
    sendMsg(chatId, `📋 *Saved Accounts (${i + 1}–${Math.min(i + CHUNK, rows.length)} of ${rows.length}):*\n\n${chunk}`);
  }
});

// ─────────────────────────────────────────────────────────────
// /status
// ─────────────────────────────────────────────────────────────

bot.onText(/\/status/, (msg) => {
  if (!authCheck(msg)) return;

  const chatId = msg.chat.id;
  const running = activeTasks.has(chatId);

  sendMsg(chatId, running
    ? '🟢 *Status:* A registration task is currently running.'
    : '⚪ *Status:* No active tasks.'
  );
});

// ─────────────────────────────────────────────────────────────
// /cancel
// ─────────────────────────────────────────────────────────────

bot.onText(/\/cancel/, (msg) => {
  if (!authCheck(msg)) return;

  const chatId = msg.chat.id;
  if (activeTasks.has(chatId)) {
    activeTasks.delete(chatId);
    sendMsg(chatId, '🛑 Task has been cancelled.');
  } else {
    sendMsg(chatId, '⚪ No active task to cancel.');
  }
});

// ─────────────────────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────────────────────

bot.on('polling_error', (err) => {
  logger.error(`Polling error: ${err.message}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

// ─────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────

async function shutdown() {
  logger.info('🔴 Shutting down bot...');
  await bot.stopPolling();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

logger.info('✅ Bot is running. Send /start to get started.');
