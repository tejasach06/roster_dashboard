import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
  Umbrella,
  Users,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { SHIFT_CODES, ShiftCode, SHIFT_CODE_KEYS } from '../constants/shifts';

interface NextSeven {
  start: string;
  end: string;
  scheduled_days: number;
  work_days: number;
  off_days: number;
  leave_days: number;
}

interface DashboardTeam {
  team_id: number;
  team_name: string;
  employee_count: number;
  roster_employee_count: number;
  planned_slots: number;
  scheduled_days: number;
  work_days: number;
  off_days: number;
  leave_days: number;
  open_slots: number;
  coverage_pct: number | null;
  coverage_risk_days: number;
  coverage_risk_entries: number;
  next_7: NextSeven;
  shift_counts: Record<ShiftCode, number>;
}

interface DashboardOverview {
  month: string;
  days_in_month: number;
  teams: DashboardTeam[];
}

type AttentionKind = 'open' | 'leave' | 'coverage';

const dashboardCache = new Map<string, DashboardOverview>();

const toMonthStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const parseMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1); };
const fmtMonth = (m: string) => parseMonth(m).toLocaleString('default', { month: 'long', year: 'numeric' });
const shiftMonth = (m: string, delta: number) => { const d = parseMonth(m); d.setMonth(d.getMonth() + delta); return toMonthStr(d); };
const fmtShortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('default', { month: 'short', day: 'numeric' });

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const [month, setMonth] = useState(toMonthStr(new Date()));
  const selectedTeamId = teamId ? Number(teamId) : null;
  const cacheKey = `${user?.role ?? 'guest'}:${user?.team_id ?? 'all'}:${month}`;
  const [overview, setOverview] = useState<DashboardOverview | null>(() => dashboardCache.get(cacheKey) ?? null);
  const [loading, setLoading] = useState(() => !dashboardCache.has(cacheKey));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const cached = dashboardCache.get(cacheKey);
    if (cached) {
      setOverview(cached);
      setLoading(false);
      setRefreshing(true);
    } else {
      setOverview(null);
      setLoading(true);
      setRefreshing(false);
    }
    setError('');

    const controller = new AbortController();
    api.get<DashboardOverview>(`/roster/overview?month=${month}`, { signal: controller.signal })
      .then(({ data }) => {
        dashboardCache.set(cacheKey, data);
        setOverview(data);
      })
      .catch((err) => {
        if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
          setError('Could not refresh dashboard data.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => controller.abort();
  }, [cacheKey, month]);

  const allTeams = overview?.teams ?? [];
  const team = selectedTeamId ? allTeams.find((t) => t.team_id === selectedTeamId) : null;
  const teamsForDirectory = [...allTeams].sort((a, b) => a.team_name.localeCompare(b.team_name));
  const isCurrentMonth = month === toMonthStr(new Date());

  const teamTotals = useMemo(() => {
    if (!team) return null;
    return {
      employees: team.employee_count,
      rosterEmployees: team.roster_employee_count,
      planned: team.planned_slots,
      scheduled: team.scheduled_days,
      coveragePct: team.coverage_pct,
      work: team.work_days,
      off: team.off_days,
      leave: team.leave_days,
      open: team.open_slots,
      risks: team.coverage_risk_days,
      nextWork: team.next_7.work_days,
      nextLeave: team.next_7.leave_days,
      nextOff: team.next_7.off_days,
      shiftCounts: team.shift_counts,
    };
  }, [team]);

  const coverage = teamTotals ? pct(teamTotals.scheduled, teamTotals.planned) : 0;
  const coverageLabel = teamTotals?.coveragePct === null ? 'n/a' : `${coverage}%`;
  const coverageTone = !teamTotals || teamTotals.planned === 0
    ? 'slate'
    : coverage >= 95 ? 'green' : coverage >= 80 ? 'amber' : 'red';
  const coverageDetail = teamTotals?.planned === 0
    ? 'No actionable days remain'
    : `${teamTotals?.scheduled ?? 0} of ${teamTotals?.planned ?? 0} employee-days`;

  if (!isAdmin && !user?.team_id) return <NoTeamAssigned />;
  if (!isAdmin && user?.team_id && !teamId) return <Navigate to={`/team/${user.team_id}/dashboard`} replace />;

  return (
    <div className="p-4 sm:p-6 xl:p-8 max-w-[1500px] mx-auto space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-slate-400">
            <Activity size={14} className="accent-text" />
            Team roster operations
            {refreshing && <span className="inline-flex items-center gap-1 normal-case font-medium"><RefreshCw size={11} className="animate-spin" /> refreshing</span>}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mt-1">
            {team ? `${team.team_name} dashboard` : 'Choose a team dashboard'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {team ? 'Open gaps, shift mix, and the exact roster areas that need attention.' : 'Each team has its own dashboard. Pick a team to inspect coverage and gaps.'}
          </p>
        </div>

        <MonthPicker month={month} setMonth={setMonth} isCurrentMonth={isCurrentMonth} />
      </div>

      {error && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : !selectedTeamId ? (
        <TeamDashboardDirectory teams={teamsForDirectory} month={month} onOpen={(id) => navigate(`/team/${id}/dashboard`)} />
      ) : !team ? (
        <EmptyDashboard isAdmin={isAdmin} />
      ) : teamTotals ? (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricCard icon={<CheckCircle2 size={17} />} label="Assigned coverage" value={coverageLabel} detail={coverageDetail} tone={coverageTone} />
            <MetricCard icon={<AlertTriangle size={17} />} label="Open slots" value={teamTotals.open.toString()} detail={teamTotals.open === 0 ? 'No missing employee-days' : 'Click attention item to highlight roster cells'} tone={teamTotals.open === 0 ? 'green' : 'red'} />
            <MetricCard icon={<BriefcaseBusiness size={17} />} label="Work shifts" value={teamTotals.work.toString()} detail={`${teamTotals.off} week off · ${teamTotals.leave} leave · ${teamTotals.risks} risk days`} tone={teamTotals.risks > 0 ? 'amber' : 'blue'} />
            <MetricCard icon={<Clock3 size={17} />} label="Next 7 days" value={teamTotals.nextWork.toString()} detail={`${fmtShortDate(team.next_7.start)}-${fmtShortDate(team.next_7.end)} · ${teamTotals.nextLeave} leave`} tone="slate" />
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-5">
            <Panel title="Needs attention" subtitle="Click an issue to open the roster with breathing highlights.">
              <AttentionList team={team} month={month} onOpen={(kind) => navigate(`/team/${team.team_id}?month=${month}&attention=${kind}`)} />
            </Panel>

            <Panel title="Shift mix" subtitle="Monthly distribution for this team.">
              <div className="space-y-3">
                {SHIFT_CODE_KEYS.map((code) => (
                  <ShiftMixRow key={code} code={code} count={teamTotals.shiftCounts[code]} total={Math.max(teamTotals.scheduled, 1)} />
                ))}
              </div>
            </Panel>
          </section>

          <Panel title="Team workload" subtitle="This team only. Use Open roster to edit the highlighted cells.">
            <TeamWorkloadCard team={team} month={month} onOpen={() => navigate(`/team/${team.team_id}?month=${month}`)} />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

function MonthPicker({ month, setMonth, isCurrentMonth }: { month: string; setMonth: (month: string) => void; isCurrentMonth: boolean }) {
  return (
    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm w-fit">
      <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-400 transition-colors" aria-label="Previous month">
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-semibold text-gray-800 dark:text-slate-200 w-36 text-center">{fmtMonth(month)}</span>
      <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-400 transition-colors" aria-label="Next month">
        <ChevronRight size={18} />
      </button>
      {!isCurrentMonth && (
        <button onClick={() => setMonth(toMonthStr(new Date()))} className="ml-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
          Today
        </button>
      )}
    </div>
  );
}

function TeamDashboardDirectory({ teams, month, onOpen }: { teams: DashboardTeam[]; month: string; onOpen: (id: number) => void }) {
  if (teams.length === 0) {
    return <EmptyDashboard isAdmin />;
  }

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
      {teams.map((team) => (
        <button key={team.team_id} onClick={() => onOpen(team.team_id)} className="text-left bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{team.team_name}</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                {team.roster_employee_count} roster · {team.employee_count} team · {fmtMonth(month)}
              </p>
            </div>
            <ArrowRight size={15} className="text-gray-400 dark:text-slate-500 shrink-0 mt-0.5" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <MiniStat icon={<CheckCircle2 size={13} />} label="Cover" value={team.coverage_pct === null ? 'n/a' : team.coverage_pct} suffix={team.coverage_pct === null ? '' : '%'} danger={(team.coverage_pct ?? 100) < 80} />
            <MiniStat icon={<CalendarDays size={13} />} label="Open" value={team.open_slots} danger={team.open_slots > 0} />
            <MiniStat icon={<Umbrella size={13} />} label="Leave" value={team.leave_days} />
          </div>
        </button>
      ))}
    </section>
  );
}

function AttentionList({ team, month, onOpen }: { team: DashboardTeam; month: string; onOpen: (kind: AttentionKind) => void }) {
  const items: Array<{ kind: AttentionKind; title: string; detail: string; severity: 'red' | 'amber' | 'blue' }> = [];
  if (team.coverage_risk_days > 0) {
    items.push({
      kind: 'coverage',
      title: `${team.coverage_risk_days} shift coverage gap day${team.coverage_risk_days === 1 ? '' : 's'}`,
      detail: `${team.coverage_risk_entries} required shift coverage gap${team.coverage_risk_entries === 1 ? '' : 's'} found. MS+AS covers GS; staffed NS is valid.`,
      severity: 'red',
    });
  }
  if (team.open_slots > 0) {
    items.push({
      kind: 'open',
      title: `${team.open_slots} open roster slot${team.open_slots === 1 ? '' : 's'}`,
      detail: 'Highlights blank employee-day cells in the roster.',
      severity: 'red',
    });
  }
  if ((team.coverage_pct ?? 100) < 90 && team.open_slots === 0) {
    items.push({
      kind: 'open',
      title: `${team.coverage_pct}% assigned coverage`,
      detail: 'Opens the roster so you can inspect missing or unusual coverage.',
      severity: 'amber',
    });
  }
  if (team.next_7.leave_days > team.employee_count || team.leave_days > 0) {
    items.push({
      kind: 'leave',
      title: `${team.leave_days} leave entr${team.leave_days === 1 ? 'y' : 'ies'} this month`,
      detail: `Highlights EL cells. Current range: ${fmtMonth(month)}.`,
      severity: team.next_7.leave_days > team.employee_count ? 'amber' : 'blue',
    });
  }
  if (items.length === 0) {
    return (
      <div className="py-10 text-center">
        <CheckCircle2 size={34} className="mx-auto mb-2 text-emerald-500" />
        <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">No obvious gaps for {fmtMonth(month)}</p>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Coverage looks complete from the roster entries available.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-slate-700">
      {items.map((item) => (
        <AttentionItem key={item.kind} item={item} onOpen={() => onOpen(item.kind)} />
      ))}
    </div>
  );
}

function AttentionItem({ item, onOpen }: { item: { title: string; detail: string; severity: 'red' | 'amber' | 'blue' }; onOpen: () => void }) {
  const severityClass = {
    red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
    blue: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
  }[item.severity];

  return (
    <button onClick={onOpen} className="w-full flex items-center justify-between gap-3 px-1 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/40 rounded-lg transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${severityClass}`}>Action</span>
          <span className="font-semibold text-sm text-gray-900 dark:text-slate-100 truncate">{item.title}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{item.detail}</p>
      </div>
      <ArrowRight size={15} className="text-gray-400 dark:text-slate-500 shrink-0" />
    </button>
  );
}

function MetricCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'slate' }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
    red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
    blue: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
    slate: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-700/50 dark:text-slate-200 dark:border-slate-600',
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-slate-400">{label}</span>
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${tones[tone]}`}>{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</div>
      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{detail}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ShiftMixRow({ code, count, total }: { code: ShiftCode; count: number; total: number }) {
  const cfg = SHIFT_CODES[code];
  const width = Math.max(pct(count, total), count > 0 ? 3 : 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <span className={`inline-flex min-w-[42px] justify-center px-2 py-0.5 rounded-md text-xs font-bold border ${cfg.color}`}>{code}</span>
          <span className="text-xs text-gray-600 dark:text-slate-300">{cfg.label}</span>
        </div>
        <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function TeamWorkloadCard({ team, month, onOpen }: { team: DashboardTeam; month: string; onOpen: () => void }) {
  const coverage = team.coverage_pct ?? 0;
  const coverageTone = team.coverage_pct === null
    ? 'text-slate-700 dark:text-slate-300'
    : coverage >= 95 ? 'text-emerald-700 dark:text-emerald-300' : coverage >= 80 ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300';

  return (
    <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{team.team_name}</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            {team.roster_employee_count} roster · {team.employee_count} team · {fmtMonth(month)}
          </p>
        </div>
        <button onClick={onOpen} className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
          Open roster <ArrowRight size={13} />
        </button>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500 dark:text-slate-400">Assigned coverage</span>
          <span className={`font-bold ${coverageTone}`}>{team.coverage_pct === null ? 'n/a' : `${coverage}%`}</span>
        </div>
        <div className="h-2.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full accent-bg rounded-full" style={{ width: `${Math.min(coverage, 100)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-4">
        <MiniStat icon={<BriefcaseBusiness size={13} />} label="Work" value={team.work_days} />
        <MiniStat icon={<CalendarDays size={13} />} label="Open" value={team.open_slots} danger={team.open_slots > 0} />
        <MiniStat icon={<Users size={13} />} label="Off" value={team.off_days} />
        <MiniStat icon={<Umbrella size={13} />} label="Leave" value={team.leave_days} />
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value, suffix = '', danger = false }: { icon: React.ReactNode; label: string; value: number | string; suffix?: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border px-2 py-2 ${danger ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300' : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-300'}`}>
      <div className="flex items-center gap-1 text-[11px] opacity-80">{icon}{label}</div>
      <div className="text-sm font-bold mt-1">{value}{suffix}</div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-lg bg-gray-100 dark:bg-slate-800" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="h-72 rounded-lg bg-gray-100 dark:bg-slate-800" />
        <div className="h-72 rounded-lg bg-gray-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}

function EmptyDashboard({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 py-16 text-center">
      <Users size={40} className="text-gray-200 dark:text-slate-700 mx-auto mb-3" />
      <p className="text-gray-500 dark:text-slate-400 text-sm">No team dashboard data available.</p>
      {isAdmin && <p className="text-gray-500 dark:text-slate-500 text-xs mt-1">Create teams, assign employees, then add roster entries.</p>}
    </div>
  );
}

function NoTeamAssigned() {
  return (
    <div className="p-8 flex items-center justify-center h-full">
      <div className="text-center">
        <Users size={48} className="text-gray-200 dark:text-slate-700 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-slate-400 font-medium">No team assigned</p>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">Contact your admin to get assigned to a team.</p>
      </div>
    </div>
  );
}
