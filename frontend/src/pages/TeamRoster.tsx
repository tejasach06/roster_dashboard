import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Copy, ChevronLeft, ChevronRight, X, Search, CalendarDays, Pencil, Check, Eye, Trash2 } from 'lucide-react';
import api from '../api/client';
import { SHIFT_CODES, ShiftCode, SHIFT_CODE_KEYS } from '../constants/shifts';
import Modal from '../components/Modal';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Employee { id: number; name: string; emp_code: string; job_title: string; team_id?: number | null; }
interface DayEntry  { id: number; shift_code: ShiftCode; notes: string; date: string; }
interface ApiEntry  {
  id: number; shift_code: string; date: string; notes: string;
  employee_id: number; name: string; emp_code: string; job_title: string;
}
interface Team { id: number; name: string; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toMonthStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const parseMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1); };
const formatMonthLabel = (m: string) => parseMonth(m).toLocaleString('default', { month: 'long', year: 'numeric' });
const shiftMonth = (m: string, delta: number) => {
  const d = parseMonth(m); d.setMonth(d.getMonth() + delta); return toMonthStr(d);
};

function buildDayHeaders(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const total = new Date(y, mo, 0).getDate();
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  return Array.from({ length: total }, (_, i) => {
    const dow = new Date(y, mo - 1, i + 1).getDay();
    return { num: i + 1, dow: DOW[dow], isWeekend: dow === 0 || dow === 6 };
  });
}

function todayDayInMonth(m: string): number | null {
  const now = new Date();
  const [y, mo] = m.split('-').map(Number);
  if (now.getFullYear() === y && now.getMonth() + 1 === mo) return now.getDate();
  return null;
}
function firstActionableDayInMonth(m: string): number | null {
  const now = new Date();
  const [y, mo] = m.split('-').map(Number);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (y < currentYear || (y === currentYear && mo < currentMonth)) return null;
  if (y === currentYear && mo === currentMonth) return now.getDate();
  return 1;
}

type RosterHighlight = 'open' | 'leave' | 'off' | 'coverage' | null;

// ─── Component ───────────────────────────────────────────────────────────────
export default function TeamRoster() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [month, setMonth] = useState(searchParams.get('month') || toMonthStr(new Date()));
  const [attentionHighlight, setAttentionHighlight] = useState<RosterHighlight>(() => {
    const value = searchParams.get('attention');
    return value === 'open' || value === 'leave' || value === 'off' || value === 'coverage' ? value : null;
  });
  const [team, setTeam] = useState<Team | null>(null);
  const [apiEntries, setApiEntries] = useState<ApiEntry[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Cell popover
  const [popoverCell, setPopoverCell] = useState<{ employeeId: number; day: number; x: number; y: number } | null>(null);
  const [popoverSaving, setPopoverSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Date-range picker
  const [datePickerPos, setDatePickerPos] = useState<{ x: number; y: number } | null>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Add-employee modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addEmpId, setAddEmpId] = useState('');
  const [addDefaultShift, setAddDefaultShift] = useState<ShiftCode>('GS');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  // Copy-month modals
  const [showCopyModal, setShowCopyModal]         = useState(false); // copy prev → current
  const [showCopyNextModal, setShowCopyNextModal] = useState(false); // copy current → next
  const [copying, setCopying] = useState(false);

  // Remove employee from month
  const [removeTarget, setRemoveTarget] = useState<{ id: number; name: string; entryCount: number } | null>(null);
  const [removing, setRemoving] = useState(false);

  // Filters
  const [empSearch, setEmpSearch] = useState('');
  const [shiftFilter, setShiftFilter] = useState<ShiftCode | 'all'>('all');
  const [dateFrom, setDateFrom] = useState(1);
  const [dateTo, setDateTo] = useState(31);
  const [crosshair, setCrosshair] = useState<{ empId: number | null; day: number | null }>({ empId: null, day: null });
  const [editMode, setEditMode] = useState(false);

  // Sync month → URL
  useEffect(() => {
    setSearchParams((p) => { p.set('month', month); return p; }, { replace: true });
  }, [month]);

  useEffect(() => {
    const value = searchParams.get('attention');
    setAttentionHighlight(value === 'open' || value === 'leave' || value === 'off' || value === 'coverage' ? value : null);
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [teamRes, entriesRes, empRes] = await Promise.all([
        api.get<Team[]>('/teams'),
        api.get<ApiEntry[]>(`/roster/team/${teamId}?month=${month}`),
        api.get<Employee[]>('/employees'),
      ]);
      setTeam(teamRes.data.find((t) => t.id === Number(teamId)) || null);
      setApiEntries(entriesRes.data);
      setAllEmployees(empRes.data);
    } catch {
      setError('Failed to load roster');
    } finally {
      setLoading(false);
    }
  }, [teamId, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset date range when month changes
  useEffect(() => {
    const total = buildDayHeaders(month).length;
    setDateFrom(1);
    setDateTo(total);
    setDatePickerPos(null);
  }, [month]);

  useEffect(() => {
    if (attentionHighlight !== 'open') return;
    const firstActionableDay = firstActionableDayInMonth(month);
    if (!firstActionableDay) return;
    const total = buildDayHeaders(month).length;
    setDateFrom(firstActionableDay);
    setDateTo(total);
  }, [attentionHighlight, month]);

  // Close cell popover on outside click / scroll
  useEffect(() => {
    if (!popoverCell) return;
    const onMouse = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopoverCell(null);
    };
    const onScroll = () => setPopoverCell(null);
    document.addEventListener('mousedown', onMouse);
    window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('mousedown', onMouse); window.removeEventListener('scroll', onScroll, true); };
  }, [popoverCell]);

  // Close date picker on outside click
  useEffect(() => {
    if (!datePickerPos) return;
    const onMouse = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setDatePickerPos(null);
    };
    document.addEventListener('mousedown', onMouse);
    return () => document.removeEventListener('mousedown', onMouse);
  }, [datePickerPos]);

  // ─── Derived grid data ───────────────────────────────────────────────────
  const headers = buildDayHeaders(month);
  const todayDay = todayDayInMonth(month);
  const firstActionableDay = firstActionableDayInMonth(month);
  const isActionableDay = (day: number) => firstActionableDay !== null && day >= firstActionableDay;

  const empMap = new Map<number, { emp: Employee; days: Record<number, DayEntry> }>();
  for (const e of apiEntries) {
    if (!empMap.has(e.employee_id)) {
      empMap.set(e.employee_id, {
        emp: { id: e.employee_id, name: e.name, emp_code: e.emp_code || '', job_title: e.job_title || '', team_id: Number(teamId) },
        days: {},
      });
    }
    const day = Number(e.date.slice(8, 10));
    empMap.get(e.employee_id)!.days[day] = { id: e.id, shift_code: e.shift_code as ShiftCode, notes: e.notes, date: e.date };
  }

  const rows = Array.from(empMap.values()).sort((a, b) => a.emp.name.localeCompare(b.emp.name));
  const assignedIds = new Set(apiEntries.map((entry) => entry.employee_id));
  const unassignedEmployees = allEmployees.filter(
    (e) => !assignedIds.has(e.id) && e.team_id === Number(teamId)
  );
  const isCurrentMonth = month === toMonthStr(new Date());

  // ─── Filtered views ──────────────────────────────────────────────────────
  const clampedFrom = Math.max(1, Math.min(dateFrom, headers.length));
  const clampedTo   = Math.max(clampedFrom, Math.min(dateTo, headers.length));

  const visibleHeaders = headers.filter((h) => h.num >= clampedFrom && h.num <= clampedTo);

  const visibleRows = rows.filter((row) => {
    if (empSearch) {
      const q = empSearch.toLowerCase();
      if (!row.emp.name.toLowerCase().includes(q) && !row.emp.emp_code.toLowerCase().includes(q)) return false;
    }
    if (shiftFilter !== 'all') {
      if (!visibleHeaders.some((h) => row.days[h.num]?.shift_code === shiftFilter)) return false;
    }
    return true;
  });

  const isTodayActive = todayDay !== null && clampedFrom === todayDay && clampedTo === todayDay;
  const isFullMonth = clampedFrom === 1 && clampedTo === headers.length;
  const hasActiveFilters = empSearch !== '' || shiftFilter !== 'all' || !isFullMonth;
  const coverageGapDays = new Set<number>();
  for (const h of headers) {
    if (!isActionableDay(h.num)) continue;
    const dayShifts = new Set(rows.map((row) => row.days[h.num]?.shift_code).filter(Boolean));
    const hasMorning = dayShifts.has('MS');
    const hasGeneral = dayShifts.has('GS');
    const hasAfternoon = dayShifts.has('AS');
    const hasNight = dayShifts.has('NS');
    if (!hasMorning || (!hasGeneral && !(hasMorning && hasAfternoon)) || !hasAfternoon || !hasNight) {
      coverageGapDays.add(h.num);
    }
  }

  const highlightLabel =
    attentionHighlight === 'open' ? 'Open roster slots are highlighted'
    : attentionHighlight === 'coverage' ? 'Shift coverage gaps are highlighted'
    : attentionHighlight === 'leave' ? 'Leave entries are highlighted'
    : attentionHighlight === 'off' ? 'Week-off entries are highlighted'
    : '';

  const clearFilters = () => {
    setEmpSearch(''); setShiftFilter('all'); setDateFrom(1); setDateTo(headers.length);
  };

  const clearAttentionHighlight = () => {
    setAttentionHighlight(null);
    setSearchParams((p) => {
      p.delete('attention');
      p.set('month', month);
      return p;
    }, { replace: true });
  };

  const handleTodayClick = () => {
    if (!todayDay) return;
    if (isTodayActive) { setDateFrom(1); setDateTo(headers.length); }
    else { setDateFrom(todayDay); setDateTo(todayDay); }
  };

  const handleDatePickerToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (datePickerPos) { setDatePickerPos(null); }
    else {
      const rect = e.currentTarget.getBoundingClientRect();
      setDatePickerPos({ x: rect.left, y: rect.bottom + 4 });
    }
  };

  // ─── Cell popover handlers ───────────────────────────────────────────────
  const handleCellClick = (e: React.MouseEvent<HTMLButtonElement>, empId: number, day: number) => {
    if (!editMode) return;
    if (popoverCell?.employeeId === empId && popoverCell?.day === day) { setPopoverCell(null); }
    else {
      const rect = e.currentTarget.getBoundingClientRect();
      setPopoverCell({ employeeId: empId, day, x: rect.left + rect.width / 2, y: rect.bottom + 4 });
    }
  };

  const handleShiftPick = async (shift: ShiftCode | null) => {
    if (!popoverCell || popoverSaving) return;
    const { employeeId, day } = popoverCell;
    const entry = empMap.get(employeeId)?.days[day];
    setPopoverSaving(true);
    try {
      if (shift === null && entry) { await api.delete(`/roster/${entry.id}`); }
      else if (shift && entry) { await api.put(`/roster/${entry.id}`, { shift_code: shift, notes: entry.notes }); }
      else if (shift && !entry) {
        const dateStr = `${month}-${String(day).padStart(2, '0')}`;
        await api.post('/roster', { employee_id: employeeId, team_id: Number(teamId), shift_code: shift, date: dateStr });
      }
      setPopoverCell(null);
      fetchData();
    } catch (err: any) { setError(err.response?.data?.error || 'Failed to update cell'); }
    finally { setPopoverSaving(false); }
  };

  const handleAddEmployee = async () => {
    if (!addEmpId) { setAddError('Please select an employee'); return; }
    setAddSaving(true); setAddError('');
    try {
      const dates = headers.map((h) => `${month}-${String(h.num).padStart(2, '0')}`);
      await api.post('/roster/bulk', { employee_id: Number(addEmpId), team_id: Number(teamId), shift_code: addDefaultShift, dates });
      setShowAddModal(false); setAddEmpId(''); setAddDefaultShift('GS'); fetchData();
    } catch (err: any) { setAddError(err.response?.data?.error || 'Failed to add employee'); }
    finally { setAddSaving(false); }
  };

  const handleCopyMonth = async () => {
    setCopying(true);
    try {
      const from = shiftMonth(month, -1);
      const { data } = await api.post('/roster/copy', { team_id: Number(teamId), from_month: from, to_month: month });
      setShowCopyModal(false);
      if (data.copied === 0) setError('No entries found in the previous month.');
      fetchData();
    } catch (err: any) { setError(err.response?.data?.error || 'Copy failed'); }
    finally { setCopying(false); }
  };

  const handleCopyToNext = async () => {
    setCopying(true);
    try {
      const to = shiftMonth(month, 1);
      const { data } = await api.post('/roster/copy', { team_id: Number(teamId), from_month: month, to_month: to });
      setShowCopyNextModal(false);
      if (data.copied === 0) { setError('No entries to copy.'); }
      else { setMonth(to); }
    } catch (err: any) { setError(err.response?.data?.error || 'Copy failed'); }
    finally { setCopying(false); }
  };

  const handleRemoveEmployee = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.delete(`/roster/employee/${removeTarget.id}?team_id=${teamId}&month=${month}`);
      setRemoveTarget(null);
      if (attentionHighlight) clearAttentionHighlight();
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove employee');
      setRemoveTarget(null);
    } finally { setRemoving(false); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // Date range label for the picker button
  const dateRangeLabel = isFullMonth
    ? 'Full month'
    : clampedFrom === clampedTo
    ? `Day ${clampedFrom}`
    : `Day ${clampedFrom} – ${clampedTo}`;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/team/${teamId}/dashboard`)} className="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-slate-100">{team?.name || 'Team Roster'}</h1>
            <p className="text-gray-500 dark:text-slate-400 text-xs mt-0.5">
              {visibleRows.length !== rows.length
                ? `${visibleRows.length} of ${rows.length} employees`
                : `${rows.length} employee${rows.length !== 1 ? 's' : ''}`
              } · {formatMonthLabel(month)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-2 py-1.5">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-slate-400 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-slate-200 w-28 sm:w-32 text-center">{formatMonthLabel(month)}</span>
            <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-slate-400 transition-colors">
              <ChevronRight size={16} />
            </button>
            {!isCurrentMonth && (
              <button onClick={() => setMonth(toMonthStr(new Date()))} className="ml-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
                Today
              </button>
            )}
          </div>

          {/* Mutating actions — only in edit mode */}
          {editMode && rows.length === 0 && (
            <button onClick={() => setShowCopyModal(true)} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 px-3 py-2 rounded-xl transition-colors">
              <Copy size={14} /> <span className="hidden sm:inline">Copy prev month</span><span className="sm:hidden">Copy prev</span>
            </button>
          )}

          {editMode && rows.length > 0 && (
            <button
              onClick={() => setShowCopyNextModal(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-3 py-2 rounded-xl transition-colors"
            >
              <Copy size={14} /> <span className="hidden sm:inline">Plan next month</span><span className="sm:hidden">Plan next</span>
            </button>
          )}

          {editMode && (
            <button
              onClick={() => { setShowAddModal(true); setAddEmpId(''); setAddDefaultShift('GS'); setAddError(''); }}
              disabled={allEmployees.length === 0 || unassignedEmployees.length === 0}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-3 sm:px-4 py-2 rounded-xl transition-colors"
              title={unassignedEmployees.length === 0 ? 'All team members are already in the roster' : ''}
            >
              <Plus size={14} /> <span className="hidden sm:inline">Add Employee</span><span className="sm:hidden">Add</span>
            </button>
          )}

          {/* Edit mode toggle */}
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border transition-colors ${
              editMode
                ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-sm'
                : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
            }`}
          >
            {editMode ? <><Check size={14} /> Done</> : <><Pencil size={14} /> Edit</>}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-2.5 rounded-lg flex items-center justify-between shrink-0">
          {error}
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {attentionHighlight && (
        <div className="mx-4 sm:mx-6 mt-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 text-sm px-4 py-2.5 rounded-lg flex items-center justify-between gap-3 shrink-0">
          <span>{highlightLabel}. Follow the breathing cells to see where action is needed.</span>
          <button onClick={clearAttentionHighlight} className="text-xs font-semibold hover:underline shrink-0">Clear</button>
        </div>
      )}

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center gap-2 px-4 sm:px-6 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 shrink-0">
          <Pencil size={11} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
            Editing — click any cell to change shifts. Press <strong>Done</strong> when finished.
          </span>
        </div>
      )}

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-2.5 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 shrink-0 overflow-x-auto scrollbar-none">

        {/* Employee search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
          <input
            value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
            placeholder="Search employee…"
            className="pl-7 pr-7 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
          />
          {empSearch && (
            <button onClick={() => setEmpSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Shift filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 dark:text-slate-400 mr-0.5">Shift</span>
          {(['all', ...SHIFT_CODE_KEYS] as (ShiftCode | 'all')[]).map((code) => (
            <button
              key={code}
              onClick={() => setShiftFilter(code)}
              className={`px-2 py-1 rounded-md text-xs font-bold border transition-colors ${
                shiftFilter === code
                  ? code === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : `${SHIFT_CODES[code as ShiftCode].color} ring-2 ring-indigo-500`
                  : code === 'all' ? 'bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500' : `${SHIFT_CODES[code as ShiftCode].color} opacity-60 hover:opacity-100`
              }`}
            >
              {code === 'all' ? 'All' : code}
            </button>
          ))}
        </div>

        {/* Today shortcut */}
        {todayDay && (
          <button
            onClick={handleTodayClick}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              isTodayActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400'
            }`}
          >
            Today
          </button>
        )}

        {/* Date range picker */}
        <button
          onClick={handleDatePickerToggle}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
            datePickerPos || !isFullMonth
              ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-300 dark:border-indigo-600'
              : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400'
          }`}
        >
          <CalendarDays size={13} />
          {dateRangeLabel}
        </button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="ml-auto flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {/* ── Summary strip ───────────────────────────────────────────────── */}
      {rows.length > 0 && (() => {
        const shiftTotals = SHIFT_CODE_KEYS.reduce((acc, code) => {
          acc[code] = rows.reduce((sum, { days }) =>
            sum + Object.values(days).filter((e) => e.shift_code === code).length, 0);
          return acc;
        }, {} as Record<ShiftCode, number>);
        return (
          <div className="flex items-stretch border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 overflow-x-auto">
            <RosterStat label="Staff" value={rows.length} />
            <RosterStat label="Days" value={headers.length} />
            {SHIFT_CODE_KEYS.map((code) => (
              <RosterStat key={code} label={code} value={shiftTotals[code]} color={SHIFT_CODES[code].color} />
            ))}
          </div>
        );
      })()}

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-slate-400 text-sm">No roster entries for {formatMonthLabel(month)}</p>
            <p className="text-gray-500 dark:text-slate-500 text-xs mt-1">Click "Add Employee" to start building this month's roster.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {visibleRows.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <p className="text-gray-500 dark:text-slate-400 text-sm">No employees match the current filters</p>
                <button onClick={clearFilters} className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Clear filters</button>
              </div>
            </div>
          ) : (
            <table
              className="border-collapse"
              style={{ tableLayout: 'fixed' }}
              onMouseLeave={() => setCrosshair({ empId: null, day: null })}
            >
              <colgroup>
                <col style={{ width: '164px' }} />
                <col style={{ width: '80px' }} />
                {visibleHeaders.map((h) => <col key={h.num} style={{ width: '38px' }} />)}
              </colgroup>
              <thead className="sticky top-0 z-30">
                <tr className="bg-gray-50 dark:bg-slate-900 border-b-2 border-gray-300 dark:border-slate-600">
                  <th className="sticky left-0 z-40 bg-gray-50 dark:bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider border-r border-gray-300 dark:border-slate-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                    Employee
                  </th>
                  <th className="sticky left-[164px] z-40 bg-gray-50 dark:bg-slate-900 px-2 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase border-r border-gray-300 dark:border-slate-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                    Code
                  </th>
                  {visibleHeaders.map((h) => (
                    <th
                      key={h.num}
                      onMouseEnter={() => setCrosshair({ empId: null, day: h.num })}
                      onClick={() => {
                        if (attentionHighlight === 'coverage' && coverageGapDays.has(h.num)) clearAttentionHighlight();
                      }}
                      className={`px-0 py-1.5 text-center border-r border-gray-200 dark:border-slate-600 transition-colors ${
                        crosshair.day === h.num
                          ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                          : h.num === todayDay
                          ? 'bg-indigo-50 text-indigo-600 dark:text-indigo-400'
                          : h.isWeekend
                          ? 'bg-blue-50 text-blue-600 dark:bg-transparent dark:text-blue-400'
                          : 'text-gray-500 dark:text-slate-400'
                      } ${attentionHighlight === 'coverage' && coverageGapDays.has(h.num) ? 'attention-breathe cursor-pointer' : ''}`}
                    >
                      <div className="text-xs font-bold leading-tight">{h.num}</div>
                      <div className="text-[11px] font-normal opacity-60">{h.dow}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ emp, days }) => (
                  <tr key={emp.id} className="border-b border-gray-200 dark:border-slate-600 group">
                    <td
                      onMouseEnter={() => setCrosshair({ empId: emp.id, day: null })}
                      className={`sticky left-0 z-20 border-r border-gray-300 dark:border-slate-600 px-3 py-1.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] transition-colors ${
                        crosshair.empId === emp.id
                          ? 'bg-indigo-50 dark:bg-indigo-900/25'
                          : 'bg-white dark:bg-slate-800 group-hover:bg-gray-50/80 dark:group-hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm text-gray-900 dark:text-slate-100 truncate" title={emp.name}>{emp.name}</div>
                          {emp.job_title && <div className="text-[11px] text-gray-500 dark:text-slate-400 truncate">{emp.job_title}</div>}
                        </div>
                        {editMode && (
                          <button
                            onClick={() => setRemoveTarget({ id: emp.id, name: emp.name, entryCount: Object.keys(days).length })}
                            className="shrink-0 p-1 rounded text-gray-500 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            title="Remove from this month's roster"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td
                      onMouseEnter={() => setCrosshair({ empId: emp.id, day: null })}
                      className={`sticky left-[164px] z-20 border-r border-gray-300 dark:border-slate-600 px-2 py-1.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] transition-colors ${
                        crosshair.empId === emp.id
                          ? 'bg-indigo-50 dark:bg-indigo-900/25'
                          : 'bg-white dark:bg-slate-800 group-hover:bg-gray-50/80 dark:group-hover:bg-slate-700/50'
                      }`}
                    >
                      <span className="text-[11px] font-mono text-gray-500 dark:text-slate-400">{emp.emp_code || '—'}</span>
                    </td>
                    {visibleHeaders.map((h) => {
                      const entry = days[h.num];
                      const sc = entry?.shift_code;
                      const cfg = sc ? SHIFT_CODES[sc] : null;
                      const isOpen = popoverCell?.employeeId === emp.id && popoverCell?.day === h.num;
                      const isToday = h.num === todayDay;
                      const isActionable = isActionableDay(h.num);
                      const shouldBreathe =
                        attentionHighlight === 'open' ? isActionable && !entry
                        : attentionHighlight === 'coverage' ? coverageGapDays.has(h.num)
                        : attentionHighlight === 'leave' ? isActionable && sc === 'EL'
                        : attentionHighlight === 'off' ? isActionable && sc === 'WO'
                        : false;

                      const isRowHit = crosshair.empId === emp.id;
                      const isColHit = crosshair.day === h.num;
                      const isIntersect = isRowHit && isColHit;

                      return (
                        <td
                          key={h.num}
                          onMouseEnter={() => setCrosshair({ empId: emp.id, day: h.num })}
                          className={`p-0 relative border-r border-gray-200 dark:border-slate-600 ${isToday ? 'bg-indigo-50/30 dark:bg-indigo-900/20' : h.isWeekend ? 'bg-blue-50/20 dark:bg-blue-900/10' : ''}`}
                        >
                          <button
                            className={`relative z-[1] w-full h-8 flex items-center justify-center text-[11px] font-bold select-none transition-colors
                              ${cfg
                                ? cfg.cellBg
                                : editMode
                                  ? 'text-gray-200 hover:bg-indigo-50 hover:text-indigo-400'
                                  : 'text-transparent'
                              }
                              ${!editMode ? 'cursor-default' : ''}
                              ${isOpen && editMode ? 'outline outline-2 outline-indigo-400 outline-offset-[-2px] z-10' : ''}
                              ${shouldBreathe ? 'attention-breathe' : ''}
                            `}
                            onClick={(e) => {
                              if (shouldBreathe && attentionHighlight) clearAttentionHighlight();
                              handleCellClick(e, emp.id, h.num);
                            }}
                            title={editMode ? (cfg ? `${cfg.label}${cfg.time ? ' · ' + cfg.time : ''}` : 'Click to assign') : cfg?.label}
                          >
                            {sc ?? (editMode
                              ? <span className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-slate-500">+</span>
                              : null
                            )}
                          </button>
                          {(isRowHit || isColHit) && (
                            <div className={`absolute inset-0 pointer-events-none z-[2] ${
                              isIntersect
                                ? 'bg-indigo-400/30 dark:bg-indigo-300/20'
                                : 'bg-indigo-400/15 dark:bg-indigo-300/10'
                            }`} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Per-employee totals table ────────────────────────────────── */}
          {visibleRows.length > 0 && (() => {
            const empTotals = rows.map(({ emp, days }) => {
              const counts = SHIFT_CODE_KEYS.reduce((acc, code) => {
                acc[code] = Object.values(days).filter((e) => e.shift_code === code).length;
                return acc;
              }, {} as Record<ShiftCode, number>);
              const total = Object.values(days).length;
              return { emp, counts, total };
            });
            return (
              <div className="mt-6 mx-4 mb-4 rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 shadow-sm">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-[#1F3864] dark:bg-slate-700 text-white">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold tracking-wide">Name</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">Emp Code</th>
                      {SHIFT_CODE_KEYS.map((code) => (
                        <th key={code} className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">{code}</th>
                      ))}
                      <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empTotals.map(({ emp, counts, total }, i) => (
                      <tr key={emp.id} className={i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-slate-800/60'}>
                        <td className="px-4 py-2 font-medium text-gray-900 dark:text-slate-100 text-sm">{emp.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-slate-400">{emp.emp_code || '—'}</td>
                        {SHIFT_CODE_KEYS.map((code) => {
                          const n = counts[code] || 0;
                          const cfg = SHIFT_CODES[code];
                          return (
                            <td key={code} className="px-3 py-2 text-center">
                              {n > 0
                                ? <span className={`inline-block min-w-[28px] px-1.5 py-0.5 rounded text-xs font-bold border ${cfg.color}`}>{n}</span>
                                : <span className="text-gray-400 dark:text-slate-500 text-xs">0</span>
                              }
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center">
                          <span className="text-sm font-bold text-gray-800 dark:text-slate-200">{total}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Shift legend ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 px-6 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 shrink-0">
        {SHIFT_CODE_KEYS.map((code) => {
          const c = SHIFT_CODES[code];
          return (
            <span key={code} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${c.color}`}>
              <span className="font-bold">{code}</span>
              <span className="font-normal opacity-70 hidden sm:inline">{c.label}</span>
              {c.time && <span className="opacity-50 hidden md:inline">· {c.time}</span>}
            </span>
          );
        })}
      </div>

      {/* ── Cell popover ─────────────────────────────────────────────────── */}
      {popoverCell && (() => {
        const pw = 160; // w-40
        const ph = 120; // approx popover height
        const safeLeft = Math.min(Math.max(popoverCell.x - pw / 2, 8), window.innerWidth - pw - 8);
        const safeTop = popoverCell.y + ph > window.innerHeight - 8
          ? popoverCell.y - ph - 8
          : popoverCell.y;
        return (
        <div
          ref={popoverRef}
          style={{ position: 'fixed', left: safeLeft, top: safeTop, zIndex: 1000 }}
          className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-2xl p-2 w-40"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-3 gap-1 mb-1.5">
            {SHIFT_CODE_KEYS.map((code) => {
              const c = SHIFT_CODES[code];
              const currentCode = empMap.get(popoverCell.employeeId)?.days[popoverCell.day]?.shift_code;
              return (
                <button
                  key={code}
                  disabled={popoverSaving}
                  onClick={() => handleShiftPick(code)}
                  title={c.label}
                  className={`py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 ${currentCode === code ? 'ring-2 ring-indigo-500 ' : ''}${c.color}`}
                >
                  {code}
                </button>
              );
            })}
          </div>
          {empMap.get(popoverCell.employeeId)?.days[popoverCell.day] && (
            <button
              disabled={popoverSaving}
              onClick={() => handleShiftPick(null)}
              className="w-full text-center text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 py-1 rounded-lg transition-colors disabled:opacity-40"
            >
              Clear
            </button>
          )}
          {popoverSaving && (
            <div className="flex justify-center pt-1">
              <div className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        );
      })()}

      {/* ── Date range picker ────────────────────────────────────────────── */}
      {datePickerPos && (
        <div
          ref={datePickerRef}
          style={{
            position: 'fixed',
            left: Math.min(datePickerPos.x, window.innerWidth - 268),
            top: Math.min(datePickerPos.y, window.innerHeight - 320),
            zIndex: 1000,
          }}
          className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <MiniCalendar
            month={month}
            from={clampedFrom}
            to={clampedTo}
            onChange={(f, t) => { setDateFrom(f); setDateTo(t); setDatePickerPos(null); }}
            onClose={() => setDatePickerPos(null)}
          />
        </div>
      )}

      {/* ── Add Employee Modal ────────────────────────────────────────────── */}
      {showAddModal && (
        <Modal title="Add Employee to Roster" onClose={() => setShowAddModal(false)}>
          <div className="space-y-4">
            {addError && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-3 py-2 rounded-lg">{addError}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
              <select
                value={addEmpId}
                onChange={(e) => setAddEmpId(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select employee…</option>
                {unassignedEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.emp_code ? ` (${e.emp_code})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default shift for all {headers.length} days</label>
              <select
                value={addDefaultShift}
                onChange={(e) => setAddDefaultShift(e.target.value as ShiftCode)}
                className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {SHIFT_CODE_KEYS.map((code) => (
                  <option key={code} value={code}>{SHIFT_CODES[code].label} ({code})</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">You can click individual cells to override after adding.</p>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700">Cancel</button>
              <button onClick={handleAddEmployee} disabled={addSaving || !addEmpId} className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-60 font-medium">
                {addSaving ? 'Adding…' : 'Add to Roster'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Copy prev → current modal ─────────────────────────────────────── */}
      {showCopyModal && (
        <Modal title="Copy Previous Month's Roster" onClose={() => setShowCopyModal(false)} size="sm">
          <p className="text-gray-600 text-sm mb-5">
            Copy all entries from <strong>{formatMonthLabel(shiftMonth(month, -1))}</strong> into <strong>{formatMonthLabel(month)}</strong>?
            <br /><span className="text-gray-500 dark:text-slate-400 text-xs mt-1 block">Existing entries for this month won't be overwritten.</span>
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowCopyModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700">Cancel</button>
            <button onClick={handleCopyMonth} disabled={copying} className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-60">
              {copying ? 'Copying…' : 'Copy Roster'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Remove employee modal ─────────────────────────────────────────── */}
      {removeTarget && (
        <Modal title="Remove Employee from Roster" onClose={() => setRemoveTarget(null)} size="sm">
          <p className="text-gray-600 dark:text-slate-300 text-sm mb-2">
            Remove <strong>{removeTarget.name}</strong> from the <strong>{formatMonthLabel(month)}</strong> roster?
          </p>
          <p className="text-gray-500 dark:text-slate-400 text-xs mb-5">
            {removeTarget.entryCount} shift {removeTarget.entryCount === 1 ? 'entry' : 'entries'} will be permanently deleted.
            This only affects this month — other months are not changed.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setRemoveTarget(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700">
              Cancel
            </button>
            <button
              onClick={handleRemoveEmployee}
              disabled={removing}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-60"
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Copy current → next modal ─────────────────────────────────────── */}
      {showCopyNextModal && (
        <Modal title="Plan Next Month's Roster" onClose={() => setShowCopyNextModal(false)} size="sm">
          <p className="text-gray-600 text-sm mb-5">
            Copy <strong>{formatMonthLabel(month)}</strong>'s roster into <strong>{formatMonthLabel(shiftMonth(month, 1))}</strong>?
            <br /><span className="text-gray-500 dark:text-slate-400 text-xs mt-1 block">
              Existing entries for {formatMonthLabel(shiftMonth(month, 1))} won't be overwritten.
              You'll be taken there after copying to fine-tune.
            </span>
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowCopyNextModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700">Cancel</button>
            <button onClick={handleCopyToNext} disabled={copying} className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-60">
              {copying ? 'Copying…' : 'Copy & Go to Next Month'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Roster stat tile ─────────────────────────────────────────────────────────
function RosterStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center px-5 py-2.5 border-r border-gray-100 dark:border-slate-700 min-w-[64px] ${color ?? 'text-gray-700 dark:text-slate-300'}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-60 mb-0.5">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────
function MiniCalendar({
  month, from, to, onChange, onClose,
}: {
  month: string; from: number; to: number;
  onChange: (from: number, to: number) => void;
  onClose: () => void;
}) {
  const [selecting, setSelecting] = useState<number | null>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  const [y, mo] = month.split('-').map(Number);
  const totalDays = new Date(y, mo, 0).getDate();
  const firstDow = new Date(y, mo - 1, 1).getDay();

  const now = new Date();
  const todayDay = now.getFullYear() === y && now.getMonth() + 1 === mo ? now.getDate() : null;

  // Grid cells: null for leading blanks, then 1..totalDays
  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const handleDayClick = (day: number) => {
    if (selecting === null) {
      setSelecting(day);
    } else {
      const a = Math.min(selecting, day);
      const b = Math.max(selecting, day);
      onChange(a, b);
      setSelecting(null);
      setHoverDay(null);
    }
  };

  // Preview range while user picks the second point
  const previewFrom = selecting !== null && hoverDay !== null ? Math.min(selecting, hoverDay) : from;
  const previewTo   = selecting !== null && hoverDay !== null ? Math.max(selecting, hoverDay) : to;

  return (
    <div className="p-3 w-64 select-none">
      {/* Quick presets */}
      <div className="flex gap-1.5 mb-3">
        <button
          onClick={() => { onChange(1, totalDays); onClose(); }}
          className="flex-1 text-xs py-1.5 rounded-lg bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 font-medium transition-colors"
        >
          Full month
        </button>
        {todayDay && (
          <button
            onClick={() => { onChange(todayDay, todayDay); onClose(); }}
            className="flex-1 text-xs py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium border border-indigo-200 transition-colors"
          >
            Today
          </button>
        )}
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
          <div key={d} className={`text-center text-[11px] font-semibold py-0.5 ${i === 0 || i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const isStart = day === previewFrom;
          const isEnd   = day === previewTo;
          const inRange = day >= previewFrom && day <= previewTo;
          const isToday = day === todayDay;
          const dow = (firstDow + day - 1) % 7;
          const isWeekend = dow === 0 || dow === 6;
          const isPending = selecting !== null && day === selecting;

          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              onMouseEnter={() => selecting !== null && setHoverDay(day)}
              onMouseLeave={() => selecting !== null && setHoverDay(null)}
              className={`text-xs py-1.5 rounded-md font-medium transition-colors leading-none ${
                isStart || isEnd || isPending
                  ? 'bg-indigo-600 text-white'
                  : inRange
                  ? 'bg-indigo-100 text-indigo-800'
                  : isToday
                  ? 'ring-1 ring-indigo-400 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30'
                  : isWeekend
                  ? 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Status line */}
      <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-slate-700 text-xs text-center text-gray-500 dark:text-slate-400">
        {selecting !== null
          ? 'Click end date to complete range'
          : from === to ? `Day ${from} selected` : `Days ${from} – ${to} (${to - from + 1} days)`
        }
      </div>
    </div>
  );
}
