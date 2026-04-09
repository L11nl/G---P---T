'use strict';

/**
 * utils.js
 * Helper utilities: password generator, name generator,
 * address generator, account file I/O, and verification code extractor.
 * JS equivalent of Python utils.py
 */

const fs   = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

// ─────────────────────────────────────────────────────────────
// Name Data
// ─────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'James','John','Robert','Michael','William','David','Richard','Joseph',
  'Thomas','Charles','Christopher','Daniel','Matthew','Anthony','Mark',
  'Emily','Sarah','Jessica','Jennifer','Ashley','Amanda','Melissa',
  'Stephanie','Rebecca','Laura','Cynthia','Sandra','Dorothy','Lisa','Nancy',
];

const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
  'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson',
  'Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson',
  'White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
  'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen',
];

// ─────────────────────────────────────────────────────────────
// Random Helpers
// ─────────────────────────────────────────────────────────────

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// Password Generator
// ─────────────────────────────────────────────────────────────

function generateRandomPassword(length = null) {
  const len    = length ?? config.password.length;
  const chars  = config.password.charset;
  const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower  = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%';

  let password =
    randomChoice(upper.split('')) +
    randomChoice(lower.split('')) +
    randomChoice(digits.split('')) +
    randomChoice(special.split(''));

  for (let i = password.length; i < len; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }

  // Shuffle
  password = password.split('').sort(() => Math.random() - 0.5).join('');
  logger.info(`✅ Password generated`);
  return password;
}

// ─────────────────────────────────────────────────────────────
// Name Generator
// ─────────────────────────────────────────────────────────────

function generateRandomName() {
  const first = randomChoice(FIRST_NAMES);
  const last  = randomChoice(LAST_NAMES);
  const name  = `${first} ${last}`;
  logger.info(`✅ Name generated: ${name}`);
  return name;
}

// ─────────────────────────────────────────────────────────────
// Birthday Generator
// ─────────────────────────────────────────────────────────────

function generateRandomBirthday() {
  const { minAge, maxAge } = config.registration;
  const now       = new Date();
  const minYear   = now.getFullYear() - maxAge;
  const maxYear   = now.getFullYear() - minAge;
  const year      = randomInt(minYear, maxYear);
  const month     = randomInt(1, 12);
  const maxDay    = new Date(year, month, 0).getDate(); // last day of month
  const day       = randomInt(1, maxDay);

  const yearStr  = String(year);
  const monthStr = String(month).padStart(2, '0');
  const dayStr   = String(day).padStart(2, '0');

  logger.info(`✅ Birthday generated: ${yearStr}/${monthStr}/${dayStr}`);
  return { year: yearStr, month: monthStr, day: dayStr };
}

// ─────────────────────────────────────────────────────────────
// User Info
// ─────────────────────────────────────────────────────────────

function generateUserInfo() {
  return {
    name: generateRandomName(),
    ...generateRandomBirthday(),
  };
}

// ─────────────────────────────────────────────────────────────
// Address Generators
// ─────────────────────────────────────────────────────────────

function generateJapanAddress() {
  const tokyoWards = [
    { ward: 'Chiyoda-ku', zipPrefix: '100' },
    { ward: 'Shibuya-ku', zipPrefix: '150' },
    { ward: 'Shinjuku-ku', zipPrefix: '160' },
    { ward: 'Minato-ku', zipPrefix: '105' },
    { ward: 'Meguro-ku', zipPrefix: '153' },
    { ward: 'Setagaya-ku', zipPrefix: '154' },
    { ward: 'Nakano-ku', zipPrefix: '164' },
    { ward: 'Toshima-ku', zipPrefix: '170' },
  ];

  const osakaAreas = [
    { area: 'Kita-ku', zipPrefix: '530' },
    { area: 'Chuo-ku', zipPrefix: '540' },
    { area: 'Nishi-ku', zipPrefix: '550' },
    { area: 'Tennoji-ku', zipPrefix: '543' },
  ];

  if (Math.random() < 0.7) {
    const w = randomChoice(tokyoWards);
    return {
      zip: `${w.zipPrefix}-${randomInt(1000, 9999)}`,
      state: 'Tokyo',
      city: w.ward,
      address1: `${randomInt(1, 9)}-${randomInt(1, 30)}-${randomInt(1, 20)}`,
    };
  } else {
    const a = randomChoice(osakaAreas);
    return {
      zip: `${a.zipPrefix}-${randomInt(1000, 9999)}`,
      state: 'Osaka',
      city: a.area,
      address1: `${randomInt(1, 9)}-${randomInt(1, 30)}-${randomInt(1, 20)}`,
    };
  }
}

function generateUSAddress() {
  const states = [
    { name: 'Delaware',      code: 'DE', cities: ['Wilmington', 'Dover', 'Newark'],    zipRange: [19701, 19980] },
    { name: 'Oregon',        code: 'OR', cities: ['Portland', 'Salem', 'Eugene'],       zipRange: [97001, 97920] },
    { name: 'Montana',       code: 'MT', cities: ['Billings', 'Missoula', 'Helena'],    zipRange: [59001, 59937] },
    { name: 'New Hampshire', code: 'NH', cities: ['Manchester', 'Nashua', 'Concord'],   zipRange: [3031, 3897] },
  ];

  const streets = [
    'Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Park Blvd',
    'Washington St', 'Lincoln Ave', 'Jefferson Dr', 'Madison Ln',
  ];

  const s = randomChoice(states);
  return {
    zip: String(randomInt(s.zipRange[0], s.zipRange[1])).padStart(5, '0'),
    state: s.name,
    city: randomChoice(s.cities),
    address1: `${randomInt(100, 9999)} ${randomChoice(streets)}`,
  };
}

function generateBillingInfo(country = 'JP') {
  const name    = generateRandomName();
  const address = country.toUpperCase() === 'US' ? generateUSAddress() : generateJapanAddress();
  const info    = { name, ...address, country: country.toUpperCase() };
  logger.info(`📋 Billing info generated: ${info.city}, ${info.state}`);
  return info;
}

// ─────────────────────────────────────────────────────────────
// Verification Code Extractor
// ─────────────────────────────────────────────────────────────

function extractVerificationCode(content) {
  if (!content) return null;

  const patterns = [
    /代码为\s*(\d{6})/i,
    /code is\s*(\d{6})/i,
    /verification code[:\s]*(\d{6})/i,
    /(\d{6})/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      logger.info(`✅ Verification code extracted: ${match[1]}`);
      return match[1];
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Account File I/O
// ─────────────────────────────────────────────────────────────

function saveToFile(email, password = null, status = 'Registered') {
  try {
    const filePath = path.resolve(config.files.accountsFile);
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newLine = `${email}----${password ?? 'N/A'}----${timestamp}----${status}\n`;

    let lines = [];
    if (fs.existsSync(filePath)) {
      lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    }

    const prefix = `${email}----`;
    const idx = lines.findIndex((l) => l.startsWith(prefix));

    if (idx !== -1) {
      const parts = lines[idx].split('----');
      const finalPwd = password ?? parts[1] ?? 'N/A';
      lines[idx] = `${email}----${finalPwd}----${timestamp}----${status}`;
    } else {
      lines.push(newLine.trim());
    }

    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
    logger.info(`💾 Account status saved: ${status}`);
  } catch (err) {
    logger.error(`❌ Failed to save account: ${err.message}`);
  }
}

function updateAccountStatus(email, newStatus, password = null) {
  saveToFile(email, password, newStatus);
}

function readAccountsFile() {
  try {
    const filePath = path.resolve(config.files.accountsFile);
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  sleep,
  randomInt,
  randomChoice,
  generateRandomPassword,
  generateRandomName,
  generateRandomBirthday,
  generateUserInfo,
  generateBillingInfo,
  extractVerificationCode,
  saveToFile,
  updateAccountStatus,
  readAccountsFile,
};
