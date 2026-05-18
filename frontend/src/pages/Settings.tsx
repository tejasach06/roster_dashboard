import React, { useEffect, useState } from 'react';
import { Download, Upload, CheckCircle, AlertCircle, FileText, Image as ImageIcon, Palette, Save, RotateCcw } from 'lucide-react';
import api from '../api/client';
import { parseCSV } from '../utils/csv';
import { LoginLogo, useAppSettings } from '../contexts/AppSettingsContext';

function downloadCSV(rows: string[][], filename: string) {
  const content = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

interface ImportResult {
  created?: number; imported?: number; skipped?: number; errors?: string[];
}

const MAX_LOGO_SIZE = 1024 * 1024;

function getLogoMimeType(file: File): LoginLogo['mimeType'] | null {
  const name = file.name.toLowerCase();
  if (file.type === 'image/png' || name.endsWith('.png')) return 'image/png';
  if (file.type === 'image/svg+xml' || name.endsWith('.svg')) return 'image/svg+xml';
  return null;
}

function readLogoFile(file: File, mimeType: LoginLogo['mimeType']): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read logo file.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') reject(new Error('Failed to read logo file.'));
      else if (mimeType === 'image/svg+xml') resolve(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result)}`);
      else resolve(result);
    };
    if (mimeType === 'image/svg+xml') reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

const ACCENT_PRESETS = ['#4f46e5', '#0f766e', '#2563eb', '#7c3aed', '#be123c', '#c2410c'];

export function ThemeSettings() {
  const { loginLogo, accentColor, saveLoginLogo, clearLoginLogo, saveAccentColor } = useAppSettings();
  const [draftLogo, setDraftLogo] = useState<LoginLogo | null>(loginLogo);
  const [draftAccent, setDraftAccent] = useState(accentColor);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const canSaveTheme = /^#[0-9a-fA-F]{6}$/.test(draftAccent);

  useEffect(() => {
    setDraftLogo(loginLogo);
  }, [loginLogo]);

  useEffect(() => {
    setDraftAccent(accentColor);
  }, [accentColor]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setError('');
    setSaved(false);
    if (!file) return;

    const mimeType = getLogoMimeType(file);
    if (!mimeType) {
      setError('Upload a PNG or SVG logo.');
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      setError('Logo must be 1 MB or smaller.');
      return;
    }

    try {
      const dataUrl = await readLogoFile(file, mimeType);
      setDraftLogo({ dataUrl, fileName: file.name, mimeType });
    } catch {
      setError('Could not preview that logo. Try another PNG or SVG file.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (draftLogo) await saveLoginLogo(draftLogo);
      await saveAccentColor(draftAccent);
      setSaved(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not save theme settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError('');
    try {
      await clearLoginLogo();
      setDraftLogo(null);
      setSaved(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not clear the login logo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-100">
          <Palette size={16} className="accent-text" />
          Themes
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Set the login logo and accent color used across the app.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 px-6 py-5">
        <div className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs px-3 py-2 rounded-lg">{error}</div>}
          {saved && <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 text-xs px-3 py-2 rounded-lg">Theme settings updated.</div>}

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-2">Accent color</label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={canSaveTheme ? draftAccent : '#4f46e5'}
                onChange={(e) => { setDraftAccent(e.target.value); setSaved(false); }}
                className="h-10 w-14 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-1 cursor-pointer"
                aria-label="Choose accent color"
              />
              <input
                value={draftAccent}
                onChange={(e) => { setDraftAccent(e.target.value); setSaved(false); }}
                className="w-28 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 accent-ring"
                aria-label="Accent color hex value"
              />
              <div className="flex gap-1.5">
                {ACCENT_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => { setDraftAccent(color); setSaved(false); }}
                    className={`h-7 w-7 rounded-full border-2 ${draftAccent.toLowerCase() === color ? 'border-gray-900 dark:border-white' : 'border-white dark:border-slate-700'} shadow-sm`}
                    style={{ backgroundColor: color }}
                    aria-label={`Use ${color}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-2">Login logo</label>
          <label className="flex items-center gap-3 border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-lg px-4 py-4 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
            <ImageIcon size={20} className="text-gray-400 dark:text-slate-500 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-700 dark:text-slate-200 truncate">{draftLogo?.fileName || 'Choose PNG or SVG logo'}</span>
              <span className="block text-xs text-gray-400 dark:text-slate-500">Maximum 1 MB. Transparent logos work best.</span>
            </span>
            <input type="file" accept="image/png,image/svg+xml,.png,.svg" onChange={handleFile} className="hidden" />
          </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !canSaveTheme}
              className="flex items-center gap-2 accent-bg accent-bg-hover disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Save size={14} /> {saving ? 'Saving...' : 'Save Theme'}
            </button>
            <button
              onClick={handleClear}
              disabled={saving}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              <RotateCcw size={14} /> Default Logo
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">Login preview</p>
          <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 px-5 py-6 text-center" style={{ backgroundColor: draftAccent }}>
            {draftLogo ? (
              <img src={draftLogo.dataUrl} alt="Login logo preview" className="mx-auto mb-3 h-14 max-w-[180px] object-contain" />
            ) : (
              <div className="inline-flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl mb-3">
                <FileText size={22} className="text-white" />
              </div>
            )}
            <div className="text-white font-bold text-lg">Roster Manager</div>
            <div className="text-white/70 text-xs mt-1">Sign in to manage your team</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultBanner({ result, onDismiss }: { result: ImportResult; onDismiss: () => void }) {
  const count = result.created ?? result.imported ?? 0;
  const hasErrors = (result.errors?.length ?? 0) > 0;
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${hasErrors ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-800 dark:text-green-300'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 font-medium">
          {hasErrors ? <AlertCircle size={15} /> : <CheckCircle size={15} />}
          {count} row{count !== 1 ? 's' : ''} imported{result.skipped ? `, ${result.skipped} skipped` : ''}
        </span>
        <button onClick={onDismiss} className="text-xs opacity-60 hover:opacity-100">Dismiss</button>
      </div>
      {hasErrors && (
        <ul className="mt-1.5 space-y-0.5 text-xs opacity-80 list-disc list-inside max-h-32 overflow-y-auto">
          {result.errors!.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}

function ImportCard({
  title, description, templateRows, templateFile, columns, endpoint, parseRows,
}: {
  title: string; description: string;
  templateRows: string[][];  templateFile: string;
  columns: string[];
  endpoint: string;
  parseRows: (rows: Record<string, string>[]) => Record<string, string>[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState('');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setResult(null); setParseError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCSV(ev.target?.result as string);
        const mapped = parseRows(rows);
        setAllRows(mapped);
        setPreview(mapped.slice(0, 5));
        if (mapped.length === 0) setParseError('No valid rows found. Check the file format matches the template.');
      } catch { setParseError('Failed to parse CSV. Ensure it matches the template format.'); }
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (allRows.length === 0) return;
    setLoading(true); setResult(null);
    try {
      const { data } = await api.post(endpoint, { rows: allRows });
      setResult(data);
      setFile(null); setAllRows([]); setPreview([]);
    } catch (err: any) {
      setResult({ errors: [err.response?.data?.error || 'Import failed'] });
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm">{title}</h3>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{description}</p>
        </div>
        <button
          onClick={() => downloadCSV(templateRows, templateFile)}
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-3 py-1.5 rounded-lg transition-colors shrink-0 ml-4"
        >
          <Download size={13} /> Template
        </button>
      </div>

      <div className="px-6 py-4 space-y-4">
        {result && <ResultBanner result={result} onDismiss={() => setResult(null)} />}
        {parseError && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs px-3 py-2 rounded-lg">{parseError}</div>}

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">Upload CSV file</label>
          <label className="flex items-center gap-3 border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
            <FileText size={18} className="text-gray-400 dark:text-slate-500 shrink-0" />
            <span className="text-sm text-gray-500 dark:text-slate-400 truncate">{file ? file.name : 'Click to choose CSV file…'}</span>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
          </label>
        </div>

        {preview.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-1.5">Preview ({preview.length} of {allRows.length} rows)</p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
              <table className="text-xs w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                    {columns.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-slate-400 uppercase text-[10px] tracking-wider whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {preview.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                      {columns.map((c) => (
                        <td key={c} className="px-3 py-2 text-gray-700 dark:text-slate-300 whitespace-nowrap max-w-[160px] truncate">
                          {row[c.toLowerCase()] || <span className="text-gray-300 dark:text-slate-600">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 dark:text-slate-500">
            {allRows.length > 0 ? `${allRows.length} rows ready to import` : 'Upload a CSV to preview before importing'}
          </p>
          <button
            onClick={handleImport}
            disabled={allRows.length === 0 || loading}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Upload size={14} />
            {loading ? 'Importing…' : `Import ${allRows.length > 0 ? allRows.length + ' rows' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BulkImportSettings() {
  return (
      <div className="space-y-5">
        <ImportCard
          title="Import Employees"
          description="Add multiple employees at once. Existing employees are skipped by emp_code when present, otherwise by name."
          endpoint="/employees/bulk-import"
          templateFile="employees_template.csv"
          templateRows={[
            ['name', 'emp_code', 'job_title', 'email', 'phone', 'team_name'],
            ['Alice Johnson', 'STPL1001', 'Support Engineer', 'alice@example.com', '9876543210', 'Support Alpha'],
            ['Bob Smith',     'STPL1002', 'Senior Engineer',  'bob@example.com',   '',           'Support Alpha'],
          ]}
          columns={['Name', 'Emp_Code', 'Job_Title', 'Email', 'Phone', 'Team_Name']}
          parseRows={(rows) => rows.filter((r) => r.name?.trim())}
        />

        <ImportCard
          title="Import Users"
          description="Create login accounts in bulk. team_name must match an existing team exactly."
          endpoint="/users/bulk-import"
          templateFile="users_template.csv"
          templateRows={[
            ['name', 'username', 'password', 'role', 'team_name'],
            ['Alice Johnson', 'alice', 'changeme123', 'member', 'Support Alpha'],
            ['Bob Smith',     'bob',   'changeme123', 'admin',  ''],
          ]}
          columns={['Name', 'Username', 'Password', 'Role', 'Team_Name']}
          parseRows={(rows) => rows.filter((r) => r.name?.trim() && r.username?.trim() && r.password?.trim())}
        />

        <ImportCard
          title="Import Roster"
          description="Grid format: one row per employee, one column per day (1–31). emp_code and team_name must match existing records. Month format: YYYY-MM. Shift codes: MS GS AS NS WO EL. Leave a cell blank for no entry."
          endpoint="/roster/bulk-import"
          templateFile="roster_template.csv"
          templateRows={(() => {
            const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
            const r1 = ['GS','AS','AS','WO','NS','NS','WO','WO','AS','AS','WO','WO','NS','NS','NS','NS','NS','NS','WO','WO','MS','MS','WO','AS','WO','WO','WO','EL','EL','EL','EL'];
            const r2 = ['WO','MS','MS','WO','MS','WO','NS','NS','NS','NS','NS','NS','WO','AS','WO','WO','WO','AS','NS','NS','WO','WO','AS','WO','MS','MS','MS','MS','WO','AS','AS'];
            return [
              ['name', 'emp_code', 'team_name', 'month', ...days],
              ['Aditya', 'STPL1206', 'Support Alpha', '2026-05', ...r1],
              ['Narendra', 'STPL1676', 'Support Alpha', '2026-05', ...r2],
            ];
          })()}
          columns={['Emp_Code', 'Date', 'Shift_Code', 'Team_Name']}
          parseRows={(rows) => {
            const flat: Record<string, string>[] = [];
            for (const row of rows) {
              const empCode = row['emp_code']?.trim();
              const teamName = row['team_name']?.trim();
              const month = row['month']?.trim();
              if (!empCode || !teamName || !month) continue;
              for (let d = 1; d <= 31; d++) {
                const shift = row[String(d)]?.trim().toUpperCase();
                if (shift) {
                  flat.push({
                    emp_code: empCode,
                    date: `${month}-${String(d).padStart(2, '0')}`,
                    shift_code: shift,
                    team_name: teamName,
                  });
                }
              }
            }
            return flat;
          }}
        />
      </div>
  );
}

export default function Settings() {
  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Settings</h1>
        <p className="text-gray-400 dark:text-slate-500 text-sm mt-1">Manage themes and bulk import data from CSV files.</p>
      </div>

      <div className="space-y-5">
        <ThemeSettings />
        <BulkImportSettings />
      </div>
    </div>
  );
}
