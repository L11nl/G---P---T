const fs = require('fs');
const path = require('path');
const config = require('./config');

const USERS_FILE = path.join(__dirname, 'users.json');

// التأكد من وجود الملف
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ approved: [] }));
}

function loadUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function isAuthorized(userId) {
    if (userId.toString() === config.ADMIN_ID.toString()) return true; // المدير دائماً مصرح له
    const data = loadUsers();
    return data.approved.includes(userId.toString());
}

function approveUser(userId) {
    const data = loadUsers();
    if (!data.approved.includes(userId.toString())) {
        data.approved.push(userId.toString());
        saveUsers(data);
    }
}

function removeUser(userId) {
    const data = loadUsers();
    data.approved = data.approved.filter(id => id !== userId.toString());
    saveUsers(data);
}

function getApprovedUsers() {
    return loadUsers().approved;
}

module.exports = { isAuthorized, approveUser, removeUser, getApprovedUsers };
