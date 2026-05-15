import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Users, Building2, ShieldCheck, UserSquare2, Mail, Phone, ListChecks, X } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';

interface Team     { id: number; name: string; description: string; member_count: number; }
interface AppUser  { id: number; name: string; username: string; role: string; team_id: number | null; team_name?: string; }
interface Employee { id: number; name: string; emp_code: string; job_title: string; email: string; phone: string; team_id: number | null; team_name?: string; }

export default function AdminPanel() {
  const [tab, setTab] = useState<'teams' | 'users' | 'employees'>('employees');

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Admin Panel</h1>
        <p className="text-gray-400 dark:text-slate-500 text-sm mt-1">Manage employees, teams, and user accounts</p>
      </div>

      <div className="flex gap-1.5 mb-6 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-1 w-full sm:w-fit">
        <TabBtn active={tab === 'employees'} onClick={() => setTab('employees')} icon={<UserSquare2 size={15} />} label="Employees" />
        <TabBtn active={tab === 'teams'}     onClick={() => setTab('teams')}     icon={<Building2 size={15} />}    label="Teams" />
        <TabBtn active={tab === 'users'}     onClick={() => setTab('users')}     icon={<Users size={15} />}        label="Users" />
      </div>

      {tab === 'employees' && <EmployeesTab />}
      {tab === 'teams'     && <TeamsTab />}
      {tab === 'users'     && <UsersTab />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function EmployeesTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [teams, setTeams]         = useState<Team[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  // Single-employee modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Employee | null>(null);
  const [form, setForm]           = useState({ name: '', emp_code: '', job_title: '', email: '', phone: '', team_id: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  // Bulk selection + edit
  const [selectedIds, setSelectedIds]   = useState<Set<number>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkField, setBulkField]       = useState<'job_title' | 'team_id'>('job_title');
  const [bulkValue, setBulkValue]       = useState('');
  const [bulkSaving, setBulkSaving]     = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [empRes, teamRes] = await Promise.all([
        api.get<Employee[]>('/employees'),
        api.get<Team[]>('/teams'),
      ]);
      setEmployees(empRes.data);
      setTeams(teamRes.data);
    } catch { setError('Failed to load employees'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openAdd  = () => {
    setEditing(null);
    setForm({ name: '', emp_code: '', job_title: '', email: '', phone: '', team_id: '' });
    setFormError(''); setShowModal(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({ name: e.name, emp_code: e.emp_code, job_title: e.job_title, email: e.email, phone: e.phone, team_id: e.team_id?.toString() || '' });
    setFormError(''); setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true);
    try {
      const payload = { ...form, team_id: form.team_id ? Number(form.team_id) : null };
      if (editing) await api.put(`/employees/${editing.id}`, payload);
      else         await api.post('/employees', payload);
      setShowModal(false); fetchAll();
    } catch (err: any) { setFormError(err.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await api.delete(`/employees/${deleteTarget.id}`); setDeleteTarget(null); fetchAll(); }
    catch (err: any) { setError(err.response?.data?.error || 'Delete failed'); }
  };

  // Bulk selection helpers
  const allSelected = employees.length > 0 && selectedIds.size === employees.length;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(employees.map((e) => e.id)));
  const toggleOne = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const openBulkEdit = (field: 'job_title' | 'team_id') => {
    setBulkField(field); setBulkValue(''); setShowBulkModal(true);
  };

  const handleBulkSave = async (e: React.FormEvent) => {
    e.preventDefault(); setBulkSaving(true);
    try {
      const value = bulkField === 'team_id' ? (bulkValue ? Number(bulkValue) : null) : bulkValue;
      await api.put('/employees/bulk-edit', { ids: Array.from(selectedIds), field: bulkField, value });
      setShowBulkModal(false); setSelectedIds(new Set()); fetchAll();
    } catch (err: any) { setError(err.response?.data?.error || 'Bulk update failed'); }
    finally { setBulkSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <>
      {error && <ErrorBanner msg={error} />}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">

        {/* Card header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{employees.length} employee{employees.length !== 1 ? 's' : ''} in directory</span>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">These are the people you can assign to monthly rosters</p>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Plus size={15} /> Add Employee
          </button>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-6 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800">
            <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => openBulkEdit('job_title')}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-colors"
            >
              <ListChecks size={13} /> Edit Job Title
            </button>
            <button
              onClick={() => openBulkEdit('team_id')}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-colors"
            >
              <ListChecks size={13} /> Assign Team
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
            >
              <X size={12} /> Clear
            </button>
          </div>
        )}

        {employees.length === 0 ? (
          <div className="py-16 text-center">
            <UserSquare2 size={36} className="text-gray-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-gray-400 dark:text-slate-500 text-sm font-medium">No employees yet</p>
            <p className="text-gray-300 dark:text-slate-600 text-xs mt-1">Add employees here, then assign them to team rosters by month.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      className="rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase hidden sm:table-cell">Emp Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase hidden md:table-cell">Job Title</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase hidden md:table-cell">Team</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase hidden lg:table-cell">Contact</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {employees.map((emp) => {
                  const isSelected = selectedIds.has(emp.id);
                  return (
                    <tr
                      key={emp.id}
                      className={`transition-colors ${isSelected ? 'bg-indigo-50/60 dark:bg-indigo-900/15' : 'hover:bg-gray-50 dark:hover:bg-slate-700/40'}`}
                    >
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox" checked={isSelected} onChange={() => toggleOne(emp.id)}
                          className="rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-semibold text-sm shrink-0">
                            {emp.name[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-sm text-gray-900 dark:text-slate-100">{emp.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400 font-mono hidden sm:table-cell">{emp.emp_code || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400 hidden md:table-cell">{emp.job_title || '—'}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {emp.team_name
                          ? <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800"><Building2 size={10} />{emp.team_name}</span>
                          : <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="space-y-0.5">
                          {emp.email && <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><Mail size={11} /> {emp.email}</div>}
                          {emp.phone && <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><Phone size={11} /> {emp.phone}</div>}
                          {!emp.email && !emp.phone && <span className="text-xs text-gray-300 dark:text-slate-600">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <ActionBtn icon={<Pencil size={14} />} onClick={() => openEdit(emp)} color="indigo" />
                          <ActionBtn icon={<Trash2 size={14} />} onClick={() => setDeleteTarget(emp)} color="red" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Single-employee add/edit modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Employee' : 'Add Employee'} onClose={() => setShowModal(false)} size="sm">
          <form onSubmit={handleSave} className="space-y-4">
            {formError && <ErrorBanner msg={formError} />}
            <Field label="Full Name *">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} required />
            </Field>
            <Field label="Employee Code">
              <input value={form.emp_code} onChange={(e) => setForm({ ...form, emp_code: e.target.value })} className={INPUT} placeholder="e.g. STPL1206" />
            </Field>
            <Field label="Job Title">
              <input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} className={INPUT} placeholder="e.g. Support Engineer" />
            </Field>
            <Field label="Team">
              <select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })} className={INPUT}>
                <option value="">No team assigned</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} placeholder="optional" />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT} placeholder="optional" />
            </Field>
            <ModalActions onCancel={() => setShowModal(false)} saving={saving} label={editing ? 'Save Changes' : 'Add Employee'} />
          </form>
        </Modal>
      )}

      {/* Bulk edit modal */}
      {showBulkModal && (
        <Modal
          title={`${bulkField === 'job_title' ? 'Edit Job Title' : 'Assign Team'} — ${selectedIds.size} employee${selectedIds.size !== 1 ? 's' : ''}`}
          onClose={() => setShowBulkModal(false)}
          size="sm"
        >
          <form onSubmit={handleBulkSave} className="space-y-4">
            <p className="text-xs text-gray-500 dark:text-slate-400">
              This will overwrite the current value for all {selectedIds.size} selected employee{selectedIds.size !== 1 ? 's' : ''}.
            </p>
            {bulkField === 'job_title' ? (
              <Field label="New Job Title">
                <input
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className={INPUT}
                  placeholder="e.g. Support Engineer"
                  autoFocus
                />
              </Field>
            ) : (
              <Field label="Assign Team">
                <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className={INPUT}>
                  <option value="">No team (clear assignment)</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            )}
            <ModalActions onCancel={() => setShowBulkModal(false)} saving={bulkSaving} label="Apply to Selected" />
          </form>
        </Modal>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <Modal title="Remove Employee" onClose={() => setDeleteTarget(null)} size="sm">
          <p className="text-gray-600 dark:text-slate-300 text-sm mb-5">
            Remove <strong>{deleteTarget.name}</strong> from the employee directory? This will also remove them from all roster assignments.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteTarget(null)} className={BTN_CANCEL}>Cancel</button>
            <button onClick={handleDelete} className={BTN_DANGER}>Remove</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function TeamsTab() {
  const [teams, setTeams]         = useState<Team[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Team | null>(null);
  const [form, setForm]           = useState({ name: '', description: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  const fetch = useCallback(async () => {
    try { const { data } = await api.get<Team[]>('/teams'); setTeams(data); }
    catch { setError('Failed to load teams'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const openAdd  = () => { setEditing(null); setForm({ name: '', description: '' }); setFormError(''); setShowModal(true); };
  const openEdit = (t: Team) => { setEditing(t); setForm({ name: t.name, description: t.description }); setFormError(''); setShowModal(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true);
    try {
      if (editing) await api.put(`/teams/${editing.id}`, form);
      else         await api.post('/teams', form);
      setShowModal(false); fetch();
    } catch (err: any) { setFormError(err.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await api.delete(`/teams/${deleteTarget.id}`); setDeleteTarget(null); fetch(); }
    catch (err: any) { setError(err.response?.data?.error || 'Delete failed'); }
  };

  if (loading) return <Spinner />;

  return (
    <>
      {error && <ErrorBanner msg={error} />}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <span className="text-sm font-medium text-gray-500 dark:text-slate-400">{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
          <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Plus size={15} /> Add Team
          </button>
        </div>
        {teams.length === 0 ? (
          <div className="py-16 text-center text-gray-400 dark:text-slate-500 text-sm">No teams yet.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Team</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase hidden md:table-cell">Description</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Roster Entries</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {teams.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                  <td className="px-6 py-4 font-medium text-sm text-gray-900 dark:text-slate-100">{t.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400 hidden md:table-cell">{t.description || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{t.member_count}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <ActionBtn icon={<Pencil size={14} />} onClick={() => openEdit(t)} color="indigo" />
                      <ActionBtn icon={<Trash2 size={14} />} onClick={() => setDeleteTarget(t)} color="red" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Team' : 'Add Team'} onClose={() => setShowModal(false)} size="sm">
          <form onSubmit={handleSave} className="space-y-4">
            {formError && <ErrorBanner msg={formError} />}
            <Field label="Team Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} required /></Field>
            <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={INPUT} placeholder="optional" /></Field>
            <ModalActions onCancel={() => setShowModal(false)} saving={saving} label={editing ? 'Save Changes' : 'Add Team'} />
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Confirm Delete" onClose={() => setDeleteTarget(null)} size="sm">
          <p className="text-gray-600 dark:text-slate-300 text-sm mb-5">
            Delete team <strong>{deleteTarget.name}</strong>? All roster entries for this team will also be deleted.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteTarget(null)} className={BTN_CANCEL}>Cancel</button>
            <button onClick={handleDelete} className={BTN_DANGER}>Delete</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function UsersTab() {
  const [users, setUsers]         = useState<AppUser[]>([]);
  const [teams, setTeams]         = useState<Team[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<AppUser | null>(null);
  const [form, setForm]           = useState({ name: '', username: '', password: '', role: 'member', team_id: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [ur, tr] = await Promise.all([api.get<AppUser[]>('/users'), api.get<Team[]>('/teams')]);
      setUsers(ur.data); setTeams(tr.data);
    } catch { setError('Failed to load users'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openAdd  = () => { setEditing(null); setForm({ name: '', username: '', password: '', role: 'member', team_id: '' }); setFormError(''); setShowModal(true); };
  const openEdit = (u: AppUser) => { setEditing(u); setForm({ name: u.name, username: u.username, password: '', role: u.role, team_id: u.team_id?.toString() || '' }); setFormError(''); setShowModal(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true);
    try {
      const payload = { ...form, team_id: form.team_id ? Number(form.team_id) : null };
      if (editing) await api.put(`/users/${editing.id}`, payload);
      else         await api.post('/users', payload);
      setShowModal(false); fetchAll();
    } catch (err: any) { setFormError(err.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await api.delete(`/users/${deleteTarget.id}`); setDeleteTarget(null); fetchAll(); }
    catch (err: any) { setError(err.response?.data?.error || 'Delete failed'); }
  };

  if (loading) return <Spinner />;

  return (
    <>
      {error && <ErrorBanner msg={error} />}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{users.length} user{users.length !== 1 ? 's' : ''}</span>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Login accounts — assign to teams to restrict their view</p>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Plus size={15} /> Add User
          </button>
        </div>
        {users.length === 0 ? (
          <div className="py-16 text-center text-gray-400 dark:text-slate-500 text-sm">No users yet.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Name</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Username</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase hidden md:table-cell">Team</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Role</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                  <td className="px-6 py-4 font-medium text-sm text-gray-900 dark:text-slate-100">{u.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400 font-mono">{u.username}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400 hidden md:table-cell">{u.team_name || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400'}`}>
                      {u.role === 'admin' && <ShieldCheck size={11} />} {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <ActionBtn icon={<Pencil size={14} />} onClick={() => openEdit(u)} color="indigo" />
                      <ActionBtn icon={<Trash2 size={14} />} onClick={() => setDeleteTarget(u)} color="red" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit User' : 'Add User'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            {formError && <ErrorBanner msg={formError} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} required /></Field>
              <Field label="Username *"><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={INPUT} required /></Field>
              <Field label={editing ? 'New Password (leave blank to keep)' : 'Password *'}>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={INPUT} required={!editing} />
              </Field>
              <Field label="Role">
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={INPUT}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <div className="col-span-2">
                <Field label="Assign to Team">
                  <select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })} className={INPUT}>
                    <option value="">No team (admin-only or unassigned)</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
              </div>
            </div>
            <ModalActions onCancel={() => setShowModal(false)} saving={saving} label={editing ? 'Save Changes' : 'Add User'} />
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Confirm Delete" onClose={() => setDeleteTarget(null)} size="sm">
          <p className="text-gray-600 dark:text-slate-300 text-sm mb-5">Delete user <strong>{deleteTarget.name}</strong>?</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteTarget(null)} className={BTN_CANCEL}>Cancel</button>
            <button onClick={handleDelete} className={BTN_DANGER}>Delete</button>
          </div>
        </Modal>
      )}
    </>
  );
}

const INPUT = 'w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const BTN_CANCEL = 'px-4 py-2 text-sm text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700';
const BTN_DANGER = 'px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium';

function Spinner() {
  return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;
}
function ErrorBanner({ msg }: { msg: string }) {
  return <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg mb-4">{msg}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{label}</label>{children}</div>;
}
function ModalActions({ onCancel, saving, label }: { onCancel: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className={BTN_CANCEL}>Cancel</button>
      <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-60 font-medium">
        {saving ? 'Saving...' : label}
      </button>
    </div>
  );
}
function ActionBtn({ icon, onClick, color }: { icon: React.ReactNode; onClick: () => void; color: 'indigo' | 'red' }) {
  return (
    <button onClick={onClick} className={`p-1.5 rounded-lg transition-colors ${color === 'indigo' ? 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30' : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30'}`}>
      {icon}
    </button>
  );
}
