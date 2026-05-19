import { Router } from 'express';
import db from '../db/database';
import { authenticate, requireAdmin, AuthRequest, canAccessTeam } from '../middleware/auth';

const router = Router();

const VALID_CODES = ['MS', 'GS', 'AS', 'NS', 'WO', 'EL'];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const WORK_CODES = ['MS', 'GS', 'AS', 'NS'];

// ── helpers ──────────────────────────────────────────────────────────────────
function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function validMonth(m: unknown): m is string {
  return typeof m === 'string' && MONTH_RE.test(m);
}
function validDate(d: unknown): d is string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const parsed = new Date(`${d}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
}
function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = daysInMonth(y, m);
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}`, last };
}
function inclusiveDayCount(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00.000Z`).getTime();
  const endTime = new Date(`${end}T00:00:00.000Z`).getTime();
  return Math.max(Math.floor((endTime - startTime) / 86_400_000) + 1, 0);
}
function missingCoverageRequirements(shiftCounts: Map<string, number>) {
  const hasMorning = (shiftCounts.get('MS') ?? 0) > 0;
  const hasGeneral = (shiftCounts.get('GS') ?? 0) > 0;
  const hasAfternoon = (shiftCounts.get('AS') ?? 0) > 0;
  const hasNight = (shiftCounts.get('NS') ?? 0) > 0;
  const missing: string[] = [];

  if (!hasMorning) missing.push('MS');
  if (!hasGeneral && !(hasMorning && hasAfternoon)) missing.push('GS');
  if (!hasAfternoon) missing.push('AS');
  if (!hasNight) missing.push('NS');
  return missing;
}
function employeeBelongsToTeam(employeeId: unknown, teamId: number): boolean {
  const employee = db.prepare('SELECT team_id FROM employees WHERE id = ?').get(Number(employeeId)) as any;
  return employee?.team_id === teamId;
}

const ENTRY_JOIN = `
  SELECT re.id, re.shift_code, re.date, re.notes,
         e.id AS employee_id, e.name, e.emp_code, e.job_title, e.email, e.phone
  FROM roster_entries re
  JOIN employees e ON e.id = re.employee_id
`;

// ── GET /roster/stats?month=YYYY-MM ──────────────────────────────────────────
// Shift-code totals per team for the dashboard
router.get('/stats', authenticate, (req: AuthRequest, res) => {
  const user = req.user!;
  const monthParam = (req.query.month as string) || currentMonth();
  if (!validMonth(monthParam)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const { start, end } = monthBounds(monthParam);

  const where = user.role === 'admin' ? '' : 'AND t.id = ?';
  const params: any[] = [start, end];
  if (user.role !== 'admin') params.push(user.team_id);

  const rows = db.prepare(
    `SELECT t.id AS team_id, t.name AS team_name,
            re.shift_code, COUNT(re.id) AS count
     FROM teams t
     LEFT JOIN roster_entries re ON re.team_id = t.id AND re.date >= ? AND re.date <= ?
     WHERE 1=1 ${where}
     GROUP BY t.id, re.shift_code
     ORDER BY t.name`
  ).all(...params);
  res.json(rows);
});

// ── GET /roster/overview?month=YYYY-MM ───────────────────────────────────────
// Operational dashboard: coverage, open slots, shift mix, and next-7-day load.
router.get('/overview', authenticate, (req: AuthRequest, res) => {
  const user = req.user!;
  const monthParam = (req.query.month as string) || currentMonth();
  if (!validMonth(monthParam)) return res.status(400).json({ error: 'month must be YYYY-MM' });

  const { start, end, last } = monthBounds(monthParam);
  const today = new Date().toISOString().slice(0, 10);
  const activeStart = today > end ? null : today < start ? start : today;
  const activeEnd = activeStart ? end : null;
  const remainingDays = activeStart && activeEnd ? inclusiveDayCount(activeStart, activeEnd) : 0;
  const nextStart = activeStart ?? start;
  const nextEndDate = new Date(`${nextStart}T00:00:00.000Z`);
  nextEndDate.setUTCDate(nextEndDate.getUTCDate() + 6);
  const nextEndCandidate = nextEndDate.toISOString().slice(0, 10);
  const nextEnd = activeStart ? (nextEndCandidate > end ? end : nextEndCandidate) : end;

  const teamWhere = user.role === 'admin' ? '' : 'WHERE t.id = ?';
  const teamParams = user.role === 'admin' ? [] : [user.team_id];

  const teams = db.prepare(
    `SELECT t.id AS team_id, t.name AS team_name, COUNT(e.id) AS employee_count
     FROM teams t
     LEFT JOIN employees e ON e.team_id = t.id
     ${teamWhere}
     GROUP BY t.id
     ORDER BY t.name`
  ).all(...teamParams) as Array<{ team_id: number; team_name: string; employee_count: number }>;

  const rosterWhere = user.role === 'admin' ? '' : 'AND team_id = ?';
  const rosterMemberParams: any[] = [start, end];
  if (user.role !== 'admin') rosterMemberParams.push(user.team_id);
  const rosterMemberRows = db.prepare(
    `SELECT team_id, COUNT(DISTINCT employee_id) AS roster_employee_count
     FROM roster_entries
     WHERE date >= ? AND date <= ? ${rosterWhere}
     GROUP BY team_id`
  ).all(...rosterMemberParams) as Array<{ team_id: number; roster_employee_count: number }>;
  const rosterMembersByTeam = new Map(rosterMemberRows.map((row) => [row.team_id, row.roster_employee_count]));

  const shiftRows = activeStart && activeEnd
    ? (() => {
        const rosterParams: any[] = [activeStart, activeEnd];
        if (user.role !== 'admin') rosterParams.push(user.team_id);
        return db.prepare(
          `SELECT team_id, shift_code, COUNT(*) AS count
           FROM roster_entries
           WHERE date >= ? AND date <= ? ${rosterWhere}
           GROUP BY team_id, shift_code`
        ).all(...rosterParams) as Array<{ team_id: number; shift_code: string; count: number }>;
      })()
    : [];

  const nextRows = activeStart
    ? (() => {
        const nextParams: any[] = [nextStart, nextEnd];
        if (user.role !== 'admin') nextParams.push(user.team_id);
        return db.prepare(
          `SELECT team_id, shift_code, COUNT(*) AS count
           FROM roster_entries
           WHERE date >= ? AND date <= ? ${rosterWhere}
           GROUP BY team_id, shift_code`
        ).all(...nextParams) as Array<{ team_id: number; shift_code: string; count: number }>;
      })()
    : [];

  const dateShiftRows = activeStart && activeEnd
    ? (() => {
        const dateShiftParams: any[] = [activeStart, activeEnd];
        if (user.role !== 'admin') dateShiftParams.push(user.team_id);
        return db.prepare(
          `SELECT team_id, date, shift_code, COUNT(*) AS count
           FROM roster_entries
           WHERE date >= ? AND date <= ? ${rosterWhere}
             AND shift_code IN (${WORK_CODES.map(() => '?').join(', ')})
           GROUP BY team_id, date, shift_code`
        ).all(...dateShiftParams, ...WORK_CODES) as Array<{ team_id: number; date: string; shift_code: string; count: number }>;
      })()
    : [];

  const byTeam = new Map<number, any>();
  for (const team of teams) {
    const roster_employee_count = rosterMembersByTeam.get(team.team_id) ?? 0;
    const planned_slots = roster_employee_count * remainingDays;
    byTeam.set(team.team_id, {
      ...team,
      roster_employee_count,
      planned_slots,
      scheduled_days: 0,
      work_days: 0,
      off_days: 0,
      leave_days: 0,
      open_slots: planned_slots,
      coverage_pct: planned_slots > 0 ? 0 : null,
      coverage_risk_days: 0,
      coverage_risk_entries: 0,
      next_7: { start: nextStart, end: nextEnd, work_days: 0, off_days: 0, leave_days: 0, scheduled_days: 0 },
      shift_counts: { MS: 0, GS: 0, AS: 0, NS: 0, WO: 0, EL: 0 },
    });
  }

  for (const row of shiftRows) {
    const team = byTeam.get(row.team_id);
    if (!team || !VALID_CODES.includes(row.shift_code)) continue;
    team.shift_counts[row.shift_code] = row.count;
    team.scheduled_days += row.count;
    if (row.shift_code === 'WO') team.off_days += row.count;
    else if (row.shift_code === 'EL') team.leave_days += row.count;
    else team.work_days += row.count;
  }

  for (const row of nextRows) {
    const team = byTeam.get(row.team_id);
    if (!team || !VALID_CODES.includes(row.shift_code)) continue;
    team.next_7.scheduled_days += row.count;
    if (row.shift_code === 'WO') team.next_7.off_days += row.count;
    else if (row.shift_code === 'EL') team.next_7.leave_days += row.count;
    else team.next_7.work_days += row.count;
  }

  const dayCoverage = new Map<number, Map<string, Map<string, number>>>();
  for (const row of dateShiftRows) {
    if (!dayCoverage.has(row.team_id)) dayCoverage.set(row.team_id, new Map());
    const teamDays = dayCoverage.get(row.team_id)!;
    if (!teamDays.has(row.date)) teamDays.set(row.date, new Map());
    teamDays.get(row.date)!.set(row.shift_code, row.count);
  }

  for (const [teamId, teamDays] of dayCoverage.entries()) {
    const team = byTeam.get(teamId);
    if (!team) continue;
    for (const shiftCounts of teamDays.values()) {
      const missing = missingCoverageRequirements(shiftCounts);
      if (missing.length === 0) continue;
      team.coverage_risk_days += 1;
      team.coverage_risk_entries += missing.length;
    }
  }

  const overview = Array.from(byTeam.values()).map((team) => {
    team.open_slots = Math.max(team.planned_slots - team.scheduled_days, 0);
    team.coverage_pct = team.planned_slots > 0 ? Math.round((team.scheduled_days / team.planned_slots) * 100) : null;
    return team;
  });

  res.json({ month: monthParam, days_in_month: last, teams: overview });
});

// ── GET /roster/team/:teamId?month=YYYY-MM ───────────────────────────────────
router.get('/team/:teamId', authenticate, (req: AuthRequest, res) => {
  const teamId = Number(req.params.teamId);
  if (!canAccessTeam(req.user, teamId)) return res.status(403).json({ error: 'Access denied' });

  const monthParam = (req.query.month as string) || currentMonth();
  if (!validMonth(monthParam)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const { start, end } = monthBounds(monthParam);

  const entries = db.prepare(
    `${ENTRY_JOIN} WHERE re.team_id = ? AND re.date >= ? AND re.date <= ? ORDER BY e.name, re.date`
  ).all(teamId, start, end);
  res.json(entries);
});

// ── POST /roster — single day entry ─────────────────────────────────────────
router.post('/', authenticate, (req: AuthRequest, res) => {
  const user = req.user!;
  const { employee_id, date, shift_code, notes } = req.body;
  const team_id = user.role === 'admin' ? req.body.team_id : user.team_id;

  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
  if (!validDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  if (!shift_code || !VALID_CODES.includes(shift_code)) return res.status(400).json({ error: 'Invalid shift_code' });
  if (!team_id) return res.status(400).json({ error: 'team_id is required' });
  if (!canAccessTeam(user, Number(team_id))) return res.status(403).json({ error: 'Access denied' });
  if (!employeeBelongsToTeam(employee_id, Number(team_id))) {
    return res.status(400).json({ error: 'Employee must belong to the selected team' });
  }

  try {
    const result = db.prepare(
      `INSERT INTO roster_entries (employee_id, team_id, shift_code, date, notes) VALUES (?, ?, ?, ?, ?)`
    ).run(employee_id, team_id, shift_code, date, notes?.trim() || '');
    const entry = db.prepare(`${ENTRY_JOIN} WHERE re.id = ?`).get(result.lastInsertRowid);
    res.json(entry);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Entry already exists for this date' });
    res.status(500).json({ error: 'Failed to create roster entry' });
  }
});

// ── PUT /roster/:id — update shift code for a single day ────────────────────
router.put('/:id', authenticate, (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM roster_entries WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Entry not found' });
  if (!canAccessTeam(req.user, existing.team_id)) return res.status(403).json({ error: 'Access denied' });

  const { shift_code, notes } = req.body;
  if (!shift_code || !VALID_CODES.includes(shift_code)) return res.status(400).json({ error: 'Invalid shift_code' });

  db.prepare(
    `UPDATE roster_entries SET shift_code = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(shift_code, notes?.trim() ?? existing.notes, req.params.id);

  const entry = db.prepare(`${ENTRY_JOIN} WHERE re.id = ?`).get(req.params.id);
  res.json(entry);
});

// ── DELETE /roster/employee/:employeeId?team_id=X&month=YYYY-MM ─────────────
// Removes all entries for one employee from the given team + month
router.delete('/employee/:employeeId', authenticate, (req: AuthRequest, res) => {
  const employeeId = Number(req.params.employeeId);
  const teamId     = Number(req.query.team_id);
  const month      = req.query.month as string;

  if (!teamId || !month) return res.status(400).json({ error: 'team_id and month are required' });
  if (!validMonth(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  if (!canAccessTeam(req.user, teamId)) return res.status(403).json({ error: 'Access denied' });

  const { start, end } = monthBounds(month);
  const result = db
    .prepare(`DELETE FROM roster_entries WHERE employee_id = ? AND team_id = ? AND date >= ? AND date <= ?`)
    .run(employeeId, teamId, start, end);

  res.json({ deleted: result.changes });
});

// ── DELETE /roster/:id ───────────────────────────────────────────────────────
router.delete('/:id', authenticate, (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM roster_entries WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Entry not found' });
  if (!canAccessTeam(req.user, existing.team_id)) return res.status(403).json({ error: 'Access denied' });
  db.prepare('DELETE FROM roster_entries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── POST /roster/bulk — assign a shift to multiple dates for one employee ───
router.post('/bulk', authenticate, (req: AuthRequest, res) => {
  const user = req.user!;
  const { employee_id, shift_code, dates } = req.body;
  const team_id = user.role === 'admin' ? req.body.team_id : user.team_id;

  if (!employee_id || !shift_code || !Array.isArray(dates) || dates.length === 0)
    return res.status(400).json({ error: 'employee_id, shift_code, and dates[] are required' });
  if (!VALID_CODES.includes(shift_code)) return res.status(400).json({ error: 'Invalid shift_code' });
  if (!team_id) return res.status(400).json({ error: 'team_id is required' });
  if (!canAccessTeam(user, Number(team_id))) return res.status(403).json({ error: 'Access denied' });
  if (!employeeBelongsToTeam(employee_id, Number(team_id))) {
    return res.status(400).json({ error: 'Employee must belong to the selected team' });
  }

  const stmt = db.prepare(
    `INSERT INTO roster_entries (employee_id, team_id, shift_code, date, notes)
     VALUES (?, ?, ?, ?, '')
     ON CONFLICT(employee_id, date) DO UPDATE SET team_id = excluded.team_id, shift_code = excluded.shift_code, updated_at = CURRENT_TIMESTAMP`
  );
  let count = 0;
  for (const date of dates) {
    if (validDate(date)) { stmt.run(employee_id, team_id, shift_code, date); count++; }
  }
  res.json({ updated: count });
});

// ── POST /roster/copy — copy a month's schedule to another month ─────────────
router.post('/copy', authenticate, (req: AuthRequest, res) => {
  const user = req.user!;
  const { team_id, from_month, to_month } = req.body;
  if (!team_id || !from_month || !to_month) return res.status(400).json({ error: 'team_id, from_month, to_month required' });
  if (!validMonth(from_month) || !validMonth(to_month)) return res.status(400).json({ error: 'from_month and to_month must be YYYY-MM' });
  if (!canAccessTeam(user, Number(team_id))) return res.status(403).json({ error: 'Access denied' });

  const { start: fStart, end: fEnd } = monthBounds(from_month);
  const [ty, tm] = to_month.split('-').map(Number);
  const toLastDay = daysInMonth(ty, tm);

  const entries = db.prepare(
    `SELECT * FROM roster_entries WHERE team_id = ? AND date >= ? AND date <= ?`
  ).all(team_id, fStart, fEnd) as any[];

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO roster_entries (employee_id, team_id, shift_code, date, notes) VALUES (?, ?, ?, ?, ?)`
  );

  let copied = 0;
  for (const e of entries) {
    const day = Number(e.date.slice(8, 10));
    if (day > toLastDay) continue;
    const newDate = `${to_month}-${String(day).padStart(2, '0')}`;
    const info = stmt.run(e.employee_id, e.team_id, e.shift_code, newDate, e.notes);
    if (info.changes) copied++;
  }
  res.json({ copied, skipped: entries.length - copied });
});

// ── POST /roster/bulk-import — CSV-style mass import ────────────────────────
router.post('/bulk-import', authenticate, requireAdmin, (req: AuthRequest, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'rows array required' });

  const stmt = db.prepare(
    `INSERT INTO roster_entries (employee_id, team_id, shift_code, date, notes)
     VALUES (?, ?, ?, ?, '')
     ON CONFLICT(employee_id, date) DO UPDATE SET team_id = excluded.team_id, shift_code = excluded.shift_code, updated_at = CURRENT_TIMESTAMP`
  );

  let imported = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const { emp_code, date, shift_code, team_name } = row;
    if (!emp_code || !date || !shift_code || !team_name) {
      errors.push(`Missing fields in row: ${JSON.stringify(row)}`); continue;
    }
    if (!VALID_CODES.includes(shift_code)) {
      errors.push(`Invalid shift_code "${shift_code}" (${emp_code} ${date})`); continue;
    }
    if (!validDate(date)) {
      errors.push(`Invalid date "${date}" for ${emp_code}`); continue;
    }
    const emp  = db.prepare('SELECT id, team_id FROM employees WHERE emp_code = ?').get(emp_code) as any;
    const team = db.prepare('SELECT id FROM teams WHERE name = ?').get(team_name) as any;
    if (!emp)  { errors.push(`Employee not found: emp_code "${emp_code}"`); continue; }
    if (!team) { errors.push(`Team not found: "${team_name}"`); continue; }
    if (emp.team_id !== team.id) {
      errors.push(`Employee "${emp_code}" is not assigned to team "${team_name}"`);
      continue;
    }
    try { stmt.run(emp.id, team.id, shift_code, date); imported++; }
    catch { errors.push(`Failed to import row (${emp_code} ${date})`); }
  }
  res.json({ imported, errors: errors.slice(0, 30) });
});

export default router;
