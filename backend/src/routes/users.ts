import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

const MIN_PASSWORD_LEN = 8;

function adminCount(): number {
  return (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as any).c;
}

router.get('/', authenticate, requireAdmin, (_req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.name, u.username, u.role, u.team_id, u.created_at, t.name as team_name
       FROM users u
       LEFT JOIN teams t ON t.id = u.team_id
       ORDER BY u.name`
    )
    .all();
  res.json(users);
});

router.post('/', authenticate, requireAdmin, (req: AuthRequest, res) => {
  const { name, username, password, role, team_id } = req.body;
  if (!name?.trim() || !username?.trim() || !password) {
    return res.status(400).json({ error: 'Name, username, and password are required' });
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters` });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare('INSERT INTO users (name, username, password_hash, role, team_id) VALUES (?, ?, ?, ?, ?)')
      .run(name.trim(), username.trim(), hash, role === 'admin' ? 'admin' : 'member', team_id || null);
    res.json({
      id: result.lastInsertRowid,
      name: name.trim(),
      username: username.trim(),
      role: role === 'admin' ? 'admin' : 'member',
      team_id: team_id || null,
    });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticate, requireAdmin, (req: AuthRequest, res) => {
  const { name, username, password, role, team_id } = req.body;
  if (!name?.trim() || !username?.trim()) {
    return res.status(400).json({ error: 'Name and username are required' });
  }
  if (password && password.length < MIN_PASSWORD_LEN) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters` });
  }

  // Prevent demoting the last admin
  const targetId = Number(req.params.id);
  if (role !== 'admin') {
    const target = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId) as any;
    if (target?.role === 'admin' && adminCount() <= 1) {
      return res.status(400).json({ error: 'Cannot demote the last admin account' });
    }
  }

  try {
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare(
        'UPDATE users SET name = ?, username = ?, password_hash = ?, role = ?, team_id = ? WHERE id = ?'
      ).run(name.trim(), username.trim(), hash, role === 'admin' ? 'admin' : 'member', team_id || null, targetId);
    } else {
      db.prepare('UPDATE users SET name = ?, username = ?, role = ?, team_id = ? WHERE id = ?').run(
        name.trim(),
        username.trim(),
        role === 'admin' ? 'admin' : 'member',
        team_id || null,
        targetId
      );
    }
    res.json({ success: true });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, requireAdmin, (req: AuthRequest, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user!.id) {
    return res.status(400).json({ error: "You can't delete your own account" });
  }
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId) as any;
  if (target?.role === 'admin' && adminCount() <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last admin account' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  res.json({ success: true });
});

// ── POST /users/bulk-import ──────────────────────────────────────────────────
router.post('/bulk-import', authenticate, requireAdmin, (req: AuthRequest, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'rows array required' });

  let created = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const { name, username, password, role = 'member', team_name } = row;
    if (!name?.trim() || !username?.trim() || !password) {
      errors.push(`Missing name/username/password for row: ${username || '?'}`);
      skipped++; continue;
    }
    if (password.length < MIN_PASSWORD_LEN) {
      errors.push(`Password too short for user "${username}" (min ${MIN_PASSWORD_LEN} chars)`);
      skipped++; continue;
    }
    let team_id = null;
    if (team_name?.trim()) {
      const team = db.prepare('SELECT id FROM teams WHERE name = ?').get(team_name.trim()) as any;
      if (!team) { errors.push(`Team not found: "${team_name}" (user: ${username})`); skipped++; continue; }
      team_id = team.id;
    }
    try {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('INSERT INTO users (name, username, password_hash, role, team_id) VALUES (?, ?, ?, ?, ?)')
        .run(name.trim(), username.trim(), hash, role === 'admin' ? 'admin' : 'member', team_id);
      created++;
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) errors.push(`Username "${username}" already exists`);
      else errors.push(`Failed to create user "${username}"`);
      skipped++;
    }
  }
  res.json({ created, skipped, errors: errors.slice(0, 20) });
});

export default router;
