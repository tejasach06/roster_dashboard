import { Router } from 'express';
import db from '../db/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, (req: AuthRequest, res) => {
  const user = req.user!;
  if (user.role === 'admin') {
    const teams = db
      .prepare(
        `SELECT t.*, COUNT(re.id) as member_count
         FROM teams t
         LEFT JOIN roster_entries re ON re.team_id = t.id
         GROUP BY t.id
         ORDER BY t.name`
      )
      .all();
    return res.json(teams);
  }

  if (!user.team_id) return res.json([]);

  const team = db
    .prepare(
      `SELECT t.*, COUNT(re.id) as member_count
       FROM teams t
       LEFT JOIN roster_entries re ON re.team_id = t.id
       WHERE t.id = ?
       GROUP BY t.id`
    )
    .get(user.team_id);
  res.json(team ? [team] : []);
});

router.post('/', authenticate, requireAdmin, (req: AuthRequest, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Team name is required' });
  try {
    const result = db
      .prepare('INSERT INTO teams (name, description) VALUES (?, ?)')
      .run(name.trim(), description?.trim() || '');
    res.json({ id: result.lastInsertRowid, name: name.trim(), description: description?.trim() || '', member_count: 0 });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Team name already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticate, requireAdmin, (req: AuthRequest, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Team name is required' });
  try {
    db.prepare('UPDATE teams SET name = ?, description = ? WHERE id = ?').run(
      name.trim(),
      description?.trim() || '',
      req.params.id
    );
    res.json({ success: true });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Team name already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, requireAdmin, (req: AuthRequest, res) => {
  db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
