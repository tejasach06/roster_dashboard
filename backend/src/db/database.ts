import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_PATH = path.join(__dirname, '../../../roster.db');
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
`);

// Add emp_code column to existing installs (idempotent)
try { db.exec(`ALTER TABLE employees ADD COLUMN emp_code TEXT DEFAULT ''`); } catch {}
// Add team_id to employees (idempotent)
try { db.exec(`ALTER TABLE employees ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL`); } catch {}

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

// Seed default admin
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    "INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, 'admin')"
  ).run('Admin', 'admin', hash);
}

export default db;
