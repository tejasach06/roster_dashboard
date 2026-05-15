import { Router } from 'express';
import db from '../db/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, (_req, res) => {
  const employees = db
    .prepare(`
      SELECT e.*, t.name AS team_name
      FROM employees e
      LEFT JOIN teams t ON e.team_id = t.id
      ORDER BY e.name
    `)
    .all();
  res.json(employees);
});

router.post('/', authenticate, requireAdmin, (req: AuthRequest, res) => {
  const { name, emp_code, job_title, email, phone, team_id } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const result = db
    .prepare('INSERT INTO employees (name, emp_code, job_title, email, phone, team_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(
      name.trim(),
      emp_code?.trim() || '',
      job_title?.trim() || '',
      email?.trim() || '',
      phone?.trim() || '',
      team_id ? Number(team_id) : null,
    );

  res.json({ id: result.lastInsertRowid, name: name.trim() });
});

// ── POST /employees/bulk-import ──────────────────────────────────────────────
router.post('/bulk-import', authenticate, requireAdmin, (req: AuthRequest, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'rows array required' });

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO employees (name, emp_code, job_title, email, phone) VALUES (?, ?, ?, ?, ?)`
  );
  let created = 0, skipped = 0;
  for (const row of rows) {
    const { name, emp_code = '', job_title = '', email = '', phone = '' } = row;
    if (!name?.trim()) { skipped++; continue; }
    const info = stmt.run(name.trim(), emp_code.trim(), job_title.trim(), email.trim(), phone.trim());
    if (info.changes) created++; else skipped++;
  }
  res.json({ created, skipped });
});

// ── PUT /employees/bulk-edit ─────────────────────────────────────────────────
router.put('/bulk-edit', authenticate, requireAdmin, (req: AuthRequest, res) => {
  const { ids, field, value } = req.body;
  const allowed = ['job_title', 'team_id'];
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: 'ids array required' });
  if (!allowed.includes(field))
    return res.status(400).json({ error: 'Invalid field' });

  const stmt = db.prepare(`UPDATE employees SET ${field} = ? WHERE id = ?`);
  const updateMany = db.transaction((idList: number[]) => {
    for (const id of idList) stmt.run(value ?? null, id);
  });
  updateMany(ids.map(Number));
  res.json({ updated: ids.length });
});

router.put('/:id', authenticate, requireAdmin, (req: AuthRequest, res) => {
  const { name, emp_code, job_title, email, phone, team_id } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  db.prepare(
    'UPDATE employees SET name = ?, emp_code = ?, job_title = ?, email = ?, phone = ?, team_id = ? WHERE id = ?'
  ).run(
    name.trim(),
    emp_code?.trim() || '',
    job_title?.trim() || '',
    email?.trim() || '',
    phone?.trim() || '',
    team_id ? Number(team_id) : null,
    req.params.id,
  );
  res.json({ success: true });
});

router.delete('/:id', authenticate, requireAdmin, (req: AuthRequest, res) => {
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
