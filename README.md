# 🤖 GPT Auto Register — Telegram Bot (JS/Node.js)

A fully rewritten JavaScript version of the original Python `gpt-auto-register` tool,
running as a **Telegram bot** deployed on **Railway** via **GitHub**.

---

## ✨ Features

| Feature | Description |
|---|---|
| `/register` | Register 1 account (email → verify → profile → Plus → cancel) |
| `/batch <n>` | Register up to 20 accounts in batch |
| `/accounts` | List all saved accounts with passwords and statuses |
| `/status` | Check if a task is running |
| `/cancel` | Cancel any active task |
| Live progress | Real-time status updates inside Telegram |
| Anti-detect | Puppeteer with stealth patches (WebGL, plugins, webdriver) |
| Secure | Only whitelisted Telegram user IDs can use the bot |

---

## 🚀 Deployment (Railway + GitHub)

### Step 1 — Fork/Push to GitHub

Push this repository to your GitHub account.

### Step 2 — Create a Railway Project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo**
3. Select your repository

### Step 3 — Set Environment Variables

In Railway → your service → **Variables**, add **all** of the following:

```
TELEGRAM_BOT_TOKEN         = your_bot_token (from @BotFather)
ALLOWED_USER_IDS           = your_telegram_id (comma-separated for multiple)

EMAIL_WORKER_URL           = https://your-cloudflare-worker.workers.dev
EMAIL_DOMAIN               = your-domain.com
EMAIL_ADMIN_PASSWORD       = your-admin-password

CARD_NUMBER                = 4111111111111111
CARD_EXPIRY                = 1225
CARD_EXPIRY_MONTH          = 12
CARD_EXPIRY_YEAR           = 2025
CARD_CVC                   = 123
```

Optional (have defaults):
```
TOTAL_ACCOUNTS             = 1
MIN_AGE                    = 20
MAX_AGE                    = 40
PASSWORD_LENGTH            = 16
EMAIL_WAIT_TIMEOUT         = 120
BATCH_INTERVAL_MIN         = 5
BATCH_INTERVAL_MAX         = 15
```

### Step 4 — Deploy

Railway will automatically deploy on every push to your main branch.

---

## 🗂️ Project Structure

```
src/
├── index.js          # Telegram bot entry point & command handlers
├── registrar.js      # Registration orchestrator (main.py equivalent)
├── browser.js        # Puppeteer automation (browser.py equivalent)
├── emailService.js   # Cloudflare Temp Email API (email_service.py equivalent)
├── config.js         # Environment variable loader (config.py equivalent)
├── utils.js          # Helpers: password, name, address, file I/O
└── logger.js         # Winston logger
railway.toml          # Railway deployment config
nixpacks.toml         # Build config (installs Chromium on Railway)
.env.example          # Environment variable template
```

---

## 🔑 Getting Your Telegram User ID

Send a message to [@userinfobot](https://t.me/userinfobot) on Telegram.
Copy your numeric ID and add it to `ALLOWED_USER_IDS`.

---

## ⚠️ Disclaimer

This project is for **educational and research purposes only**.
Please comply with [OpenAI's Terms of Service](https://openai.com/policies/terms-of-use).
The authors are not responsible for any misuse.
