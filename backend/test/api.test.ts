import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type Database from 'better-sqlite3';

let app: Express;
let db: Database.Database;
let adminToken: string;
let tempDir: string;

function auth(token = adminToken) {
  return { Authorization: `Bearer ${token}` };
}

function createTeam(name: string) {
  return db.prepare('INSERT INTO teams (name) VALUES (?)').run(name).lastInsertRowid as number;
}

function createEmployee(name: string, empCode: string, teamId: number | null) {
  return db
    .prepare('INSERT INTO employees (name, emp_code, team_id) VALUES (?, ?, ?)')
    .run(name, empCode, teamId).lastInsertRowid as number;
}

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-api-test-'));
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-chars';
  process.env.ROSTER_DB_PATH = path.join(tempDir, 'roster.db');

  app = (await import('../src/app')).default;
  db = (await import('../src/db/database')).default;

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  adminToken = login.body.token;
});

afterAll(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec(`
    DELETE FROM app_settings;
    DELETE FROM roster_entries;
    DELETE FROM employees;
    DELETE FROM teams;
    DELETE FROM users WHERE username <> 'admin';
  `);
});

describe('settings', () => {
  it('lets admins update public theme settings', async () => {
    const logo = {
      dataUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
      fileName: 'logo.svg',
      mimeType: 'image/svg+xml',
    };

    await request(app).get('/api/settings/public').expect(200, { loginLogo: null, accentColor: '#4f46e5' });
    await request(app).put('/api/settings/login-logo').send({ loginLogo: logo }).expect(401);

    await request(app)
      .put('/api/settings/login-logo')
      .set(auth())
      .send({ loginLogo: logo })
      .expect(200);

    await request(app)
      .put('/api/settings/accent-color')
      .set(auth())
      .send({ accentColor: '#0f766e' })
      .expect(200, { accentColor: '#0f766e' });

    const publicSettings = await request(app).get('/api/settings/public').expect(200);
    expect(publicSettings.body.loginLogo).toEqual(logo);
    expect(publicSettings.body.accentColor).toBe('#0f766e');

    await request(app)
      .put('/api/settings/login-logo')
      .set(auth())
      .send({ loginLogo: null })
      .expect(200, { loginLogo: null });
  });
});

describe('auth', () => {
  it('rejects protected routes without a token and logs in the seeded admin', async () => {
    await request(app).get('/api/teams').expect(401);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);

    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.role).toBe('admin');
  });
});

describe('teams', () => {
  it('counts assigned employees, not roster entries', async () => {
    const teamId = createTeam('Support Alpha');
    const employeeId = createEmployee('Alice', 'STPL1001', teamId);
    createEmployee('Bob', 'STPL1002', teamId);

    db.prepare(
      `INSERT INTO roster_entries (employee_id, team_id, shift_code, date) VALUES (?, ?, ?, ?)`
    ).run(employeeId, teamId, 'GS', '2026-05-01');
    db.prepare(
      `INSERT INTO roster_entries (employee_id, team_id, shift_code, date) VALUES (?, ?, ?, ?)`
    ).run(employeeId, teamId, 'MS', '2026-05-02');
    db.prepare(
      `INSERT INTO roster_entries (employee_id, team_id, shift_code, date) VALUES (?, ?, ?, ?)`
    ).run(employeeId, teamId, 'NS', '2026-05-03');

    const res = await request(app).get('/api/teams').set(auth()).expect(200);

    expect(res.body).toMatchObject([
      { id: teamId, name: 'Support Alpha', member_count: 2 },
    ]);
  });
});

describe('employee import', () => {
  it('assigns teams, skips duplicates, and reports missing teams', async () => {
    const teamId = createTeam('Support Alpha');

    const res = await request(app)
      .post('/api/employees/bulk-import')
      .set(auth())
      .send({
        rows: [
          { name: 'Alice Johnson', emp_code: 'STPL1001', team_name: 'Support Alpha' },
          { name: 'Duplicate Code', emp_code: 'STPL1001', team_name: 'Support Alpha' },
          { name: 'Bob Smith', team_name: 'Support Alpha' },
          { name: 'bob smith', team_name: 'Support Alpha' },
          { name: 'Missing Team', emp_code: 'STPL9999', team_name: 'No Such Team' },
        ],
      })
      .expect(200);

    expect(res.body.created).toBe(2);
    expect(res.body.skipped).toBe(3);
    expect(res.body.errors).toContain('Team not found: "No Such Team" (employee: Missing Team)');

    const rows = db
      .prepare('SELECT name, emp_code, team_id FROM employees ORDER BY name')
      .all() as Array<{ name: string; emp_code: string; team_id: number }>;
    expect(rows).toEqual([
      { name: 'Alice Johnson', emp_code: 'STPL1001', team_id: teamId },
      { name: 'Bob Smith', emp_code: '', team_id: teamId },
    ]);
  });
});

describe('roster import', () => {
  it('imports only rows matching the employee team', async () => {
    const alphaId = createTeam('Support Alpha');
    const betaId = createTeam('Support Beta');
    const employeeId = createEmployee('Alice', 'STPL1001', alphaId);

    db.prepare(
      `INSERT INTO roster_entries (employee_id, team_id, shift_code, date) VALUES (?, ?, ?, ?)`
    ).run(employeeId, betaId, 'NS', '2026-05-01');

    const res = await request(app)
      .post('/api/roster/bulk-import')
      .set(auth())
      .send({
        rows: [
          { emp_code: 'STPL1001', team_name: 'Support Alpha', date: '2026-05-01', shift_code: 'GS' },
          { emp_code: 'STPL1001', team_name: 'Support Beta', date: '2026-05-02', shift_code: 'MS' },
          { emp_code: 'STPL1001', team_name: 'Support Alpha', date: '2026-05-03', shift_code: 'BAD' },
        ],
      })
      .expect(200);

    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toContain('Employee "STPL1001" is not assigned to team "Support Beta"');
    expect(res.body.errors).toContain('Invalid shift_code "BAD" (STPL1001 2026-05-03)');

    const entries = db
      .prepare('SELECT employee_id, team_id, shift_code, date FROM roster_entries')
      .all() as Array<{ employee_id: number; team_id: number; shift_code: string; date: string }>;
    expect(entries).toEqual([
      { employee_id: employeeId, team_id: alphaId, shift_code: 'GS', date: '2026-05-01' },
    ]);
  });
});

describe('member access', () => {
  it('limits member users to their assigned team', async () => {
    const alphaId = createTeam('Support Alpha');
    const betaId = createTeam('Support Beta');
    createEmployee('Alpha Employee', 'A100', alphaId);
    createEmployee('Beta Employee', 'B100', betaId);

    db.prepare(
      'INSERT INTO users (name, username, password_hash, role, team_id) VALUES (?, ?, ?, ?, ?)'
    ).run('Member', 'member', bcrypt.hashSync('memberpass', 10), 'member', alphaId);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'member', password: 'memberpass' })
      .expect(200);
    const memberToken = login.body.token;

    await request(app).get(`/api/roster/team/${betaId}?month=2026-05`).set(auth(memberToken)).expect(403);

    const employees = await request(app).get('/api/employees').set(auth(memberToken)).expect(200);
    expect(employees.body).toHaveLength(1);
    expect(employees.body[0].name).toBe('Alpha Employee');
  });
});
