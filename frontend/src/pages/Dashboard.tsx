import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Users, ArrowRight } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { SHIFT_CODES, ShiftCode, SHIFT_CODE_KEYS } from '../constants/shifts';

interface StatRow {
  team_id: number;
  team_name: string;
  shift_code: ShiftCode | null;
  count: number;
}

interface TeamSummary {
  team_id: number;
  team_name: string;
  shiftCounts: Record<ShiftCode, number>;
  total: number;
}

const toMonthStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const parseMonth  = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1); };
const fmtMonth    = (m: string) => parseMonth(m).toLocaleString('default', { month: 'long', year: 'numeric' });
const prevMonth   = (m: string) => { const d = parseMonth(m); d.setMonth(d.getMonth() - 1); return toMonthStr(d); };
const nextMonth   = (m: string) => { const d = parseMonth(m); d.setMonth(d.getMonth() + 1); return toMonthStr(d); };

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth]   = useState(toMonthStr(new Date()));
  const [teams, setTeams]   = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const load = useCallback(async (m: string) => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get<StatRow[]>(`/roster/stats?month=${m}`);
      const map = new Map<number, TeamSummary>();
      data.forEach((row) => {
        if (!map.has(row.team_id)) {
          map.set(row.team_id, {
            team_id: row.team_id, team_name: row.team_name,
            shiftCounts: { MS: 0, GS: 0, AS: 0, NS: 0, WO: 0, EL: 0 }, total: 0,
          });
        }
        const t = map.get(row.team_id)!;
        if (row.shift_code && row.count) {
          t.shiftCounts[row.shift_code] = (t.shiftCounts[row.shift_code] || 0) + row.count;
          t.total += row.count;
        }
      });
      setTeams(Array.from(map.values()));
    } catch { setError('Failed to load dashboard data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(month); }, [month, load]);

  const isCurrentMonth = month === toMonthStr(new Date());

  if (!isAdmin && !user?.team_id) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-center">
          <Users size={48} className="text-gray-200 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400 font-medium">No team assigned</p>
          <p className="text-gray-400 dark:text-slate-500 text-sm mt-1">Contact your admin to get assigned to a team.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Welcome back, {user?.name}</h1>
          <p className="text-gray-400 dark:text-slate-500 text-sm mt-0.5">Monthly roster coverage overview</p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm">
          <button onClick={() => setMonth(prevMonth(month))} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-400 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-200 w-36 text-center">{fmtMonth(month)}</span>
          <button onClick={() => setMonth(nextMonth(month))} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-400 transition-colors">
            <ChevronRight size={18} />
          </button>
          {!isCurrentMonth && (
            <button onClick={() => setMonth(toMonthStr(new Date()))} className="ml-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
              Today
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg mb-5">{error}</div>}

      {/* Team cards */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : teams.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 py-16 text-center">
          <Users size={40} className="text-gray-200 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-slate-500 text-sm">No roster data for {fmtMonth(month)}</p>
          {isAdmin && <p className="text-gray-300 dark:text-slate-600 text-xs mt-1">Go to a team roster and add members, or create teams in Settings.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {teams.map((team) => (
            <TeamCard key={team.team_id} team={team} onClick={() => navigate(`/team/${team.team_id}?month=${month}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamCard({ team, onClick }: { team: TeamSummary; onClick: () => void }) {
  const maxCount = Math.max(...SHIFT_CODE_KEYS.map((s) => team.shiftCounts[s] || 0), 1);
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center">
            <Users size={16} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm">{team.team_name}</h3>
            <p className="text-xs text-gray-400 dark:text-slate-500">{team.total} day-shifts assigned this month</p>
          </div>
        </div>
        <button onClick={onClick} className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-3 py-1.5 rounded-lg transition-colors">
          View roster <ArrowRight size={13} />
        </button>
      </div>
      <div className="px-5 py-4 space-y-2.5">
        {SHIFT_CODE_KEYS.map((code) => {
          const count = team.shiftCounts[code] || 0;
          const cfg = SHIFT_CODES[code];
          return (
            <div key={code} className="flex items-center gap-3">
              <div className="w-20 shrink-0">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border ${cfg.color}`}>{code}</span>
              </div>
              <div className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                {count > 0 && <div className={`h-full rounded-full transition-all duration-300 ${cfg.bar}`} style={{ width: `${Math.max(Math.round((count / maxCount) * 100), 4)}%` }} />}
              </div>
              <div className="w-8 text-right">
                <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{count || ''}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
