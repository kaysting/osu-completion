const Database = require('better-sqlite3');
const path = require('path');
const config = require('./config.json');

const dbPath = path.join(__dirname, config.db_path);

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

module.exports = db;