import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

const originalEnv = { ...process.env };
let tempDirs: string[] = [];

function makeTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-prod-bootstrap-'));
  tempDirs.push(tempDir);
  return path.join(tempDir, 'roster.db');
}

async function importFreshDatabase(dbPath: string, env: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = {
    ...originalEnv,
    ...env,
    NODE_ENV: env.NODE_ENV || 'production',
    ROSTER_DB_PATH: dbPath,
    JWT_SECRET: 'production-secret-with-at-least-thirty-two-chars',
    CORS_ORIGIN: 'http://localhost:5173',
  };
  return (await import('../src/db/database')).default;
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
  for (const tempDir of tempDirs) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDirs = [];
});

describe('production admin bootstrap', () => {
  it('rotates a seeded default admin when ADMIN_PASSWORD is provided', async () => {
    const dbPath = makeTempDb();

    let db = await importFreshDatabase(dbPath, {
      NODE_ENV: 'development',
      ADMIN_PASSWORD: undefined,
    });
    db.close();

    db = await importFreshDatabase(dbPath, {
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'secure-admin-pass-123',
      ADMIN_NAME: 'Production Admin',
    });

    const user = db.prepare('SELECT name, username, password_hash, role FROM users WHERE username = ?')
      .get('admin') as any;
    expect(user.name).toBe('Production Admin');
    expect(user.role).toBe('admin');
    expect(bcrypt.compareSync('admin123', user.password_hash)).toBe(false);
    expect(bcrypt.compareSync('secure-admin-pass-123', user.password_hash)).toBe(true);
    db.close();
  });

  it('still rejects a seeded default admin without a secure replacement password', async () => {
    const dbPath = makeTempDb();

    const setupDb = await importFreshDatabase(dbPath, {
      NODE_ENV: 'development',
      ADMIN_PASSWORD: undefined,
    });
    setupDb.close();

    await expect(importFreshDatabase(dbPath, { ADMIN_PASSWORD: undefined })).rejects.toThrow(
      'Default admin password detected'
    );

    const db = new Database(dbPath);
    const user = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('admin') as any;
    expect(bcrypt.compareSync('admin123', user.password_hash)).toBe(true);
    db.close();
  });
});
