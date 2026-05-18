import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_PATH = process.env.ROSTER_DB_PATH || path.join(__dirname, '../../../roster.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emp_code TEXT DEFAULT '',
    job_title TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add emp_code column to existing installs (idempotent)
try { db.exec(`ALTER TABLE employees ADD COLUMN emp_code TEXT DEFAULT ''`); }
catch (e: any) { if (!e.message?.includes('duplicate column name')) throw e; }
// Add team_id to employees (idempotent)
try { db.exec(`ALTER TABLE employees ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL`); }
catch (e: any) { if (!e.message?.includes('duplicate column name')) throw e; }

// Drop old month-based roster_entries if it exists (schema migration)
const hasOldSchema = db
  .prepare(`SELECT COUNT(*) as c FROM pragma_table_info('roster_entries') WHERE name = 'month'`)
  .get() as any;
if (hasOldSchema?.c > 0) {
  db.exec(`DROP TABLE IF EXISTS roster_entries`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS roster_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    team_id    INTEGER NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
    shift_code TEXT NOT NULL,
    date       TEXT NOT NULL,
    notes      TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, date)
  );
`);

const isProduction = process.env.NODE_ENV === 'production';
const MIN_BOOTSTRAP_PASSWORD_LEN = 12;

function readBootstrapAdmin() {
  const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Admin';

  if (!password || password.length < MIN_BOOTSTRAP_PASSWORD_LEN) {
    throw new Error(
      `Set ADMIN_PASSWORD (${MIN_BOOTSTRAP_PASSWORD_LEN}+ chars) to bootstrap or rotate the production admin account.`
    );
  }

  return { username, password, name };
}

// Seed default admin
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!adminExists && !isProduction) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    "INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, 'admin')"
  ).run('Admin', 'admin', hash);
}

const totalAdmins = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as any).c;
if (isProduction && totalAdmins === 0) {
  const { username, password, name } = readBootstrapAdmin();
  const hash = bcrypt.hashSync(password, 12);
  db.prepare(
    "INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, 'admin')"
  ).run(name, username, hash);
}

const defaultAdmin = db.prepare("SELECT id, password_hash FROM users WHERE username = 'admin'").get() as any;
if (isProduction && defaultAdmin && bcrypt.compareSync('admin123', defaultAdmin.password_hash)) {
  if (!process.env.ADMIN_PASSWORD) {
    throw new Error(
      `Default admin password detected. Set ADMIN_PASSWORD (${MIN_BOOTSTRAP_PASSWORD_LEN}+ chars) to rotate it before production startup.`
    );
  }

  const { username, password, name } = readBootstrapAdmin();
  const usernameOwner = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as any;
  if (usernameOwner && usernameOwner.id !== defaultAdmin.id) {
    throw new Error(`Cannot rotate default admin: username "${username}" already exists.`);
  }

  const hash = bcrypt.hashSync(password, 12);
  db.prepare(
    "UPDATE users SET name = ?, username = ?, password_hash = ?, role = 'admin', team_id = NULL WHERE id = ?"
  ).run(name, username, hash, defaultAdmin.id);
}

export default db;
