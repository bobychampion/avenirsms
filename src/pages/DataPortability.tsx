/**
 * Data Portability hub — full JSON ZIP backup/restore and module tool links.
 */
import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Download, Upload, Database, FileSpreadsheet,
  Loader2, CheckCircle2, AlertTriangle, Info, Package,
} from 'lucide-react';
import { useSchoolId } from '../hooks/useSchoolId';
import { useSchool } from '../components/SchoolContext';
import { useAuth } from '../components/FirebaseProvider';
import {
  exportSchoolData, downloadBlob, exportFilename,
} from '../services/dataExport/dataExportService';
import {
  importSchoolData, previewImport,
} from '../services/dataExport/dataImportService';
import {
  type ExportTier, type ImportMode, tierLabel, EXPORT_WARNINGS,
  type ExportManifest,
} from '../services/dataExport/exportManifest';
import {
  downloadStudentTemplate, downloadStaffTemplate,
  downloadGradeTemplate, downloadAttendanceTemplate,
  exportStudentsCsv, exportStaffCsv, exportGradesCsv, exportAttendanceCsv,
  parseSpreadsheetFile, importGradesFromRows, importAttendanceFromRows,
  type GradeCsvRow, type AttendanceCsvRow,
} from '../services/dataExport/csvModules';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { Student, Staff, Grade, Attendance } from '../types';

type Tab = 'backup' | 'restore' | 'modules';

export default function DataPortability() {
  const schoolId = useSchoolId();
  const { schoolName } = useSchool();
  const { user, profile, isSuperAdmin } = useAuth();

  const [tab, setTab] = useState<Tab>('backup');
  const [tiers, setTiers] = useState<ExportTier[]>([1]);
  const [includeGeofence, setIncludeGeofence] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportLog, setExportLog] = useState<string[]>([]);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ExportManifest | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [targetSchoolId, setTargetSchoolId] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const gradeFileRef = useRef<HTMLInputElement>(null);
  const attendanceFileRef = useRef<HTMLInputElement>(null);

  const effectiveTarget = (isSuperAdmin && targetSchoolId.trim()) ? targetSchoolId.trim() : (schoolId ?? '');

  const toggleTier = (tier: ExportTier) => {
    setTiers(prev => {
      if (prev.includes(tier)) {
        const next = prev.filter(t => t !== tier);
        return next.length ? next : [1];
      }
      const next = [...prev, tier].sort();
      if (tier === 2 && !next.includes(1)) next.unshift(1);
      if (tier === 3 && !next.includes(2)) { if (!next.includes(1)) next.unshift(1); next.push(2); }
      return [...new Set(next)] as ExportTier[];
    });
  };

  const handleExport = async () => {
    if (!schoolId || !user) return;
    setExporting(true);
    setExportLog([]);
    try {
      const blob = await exportSchoolData({
        schoolId,
        schoolName: schoolName || schoolId,
        exportedBy: user.email || user.uid,
        tiers,
        includeGeofence,
        onProgress: (p) => {
          if (p.phase === 'reading') {
            setExportLog(prev => [...prev, `${p.collection}: ${p.count} records`]);
          }
        },
      });
      downloadBlob(blob, exportFilename(schoolId));
      toast.success('Export downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    setImportFile(file);
    try {
      const manifest = await previewImport(file);
      setImportPreview(manifest);
      if (!targetSchoolId) setTargetSchoolId(schoolId ?? manifest.schoolId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid export file');
      setImportPreview(null);
    }
  };

  const handleImport = async () => {
    if (!importFile || !effectiveTarget || !profile) return;
    if (importMode === 'replace' && confirmName !== (importPreview?.schoolName ?? schoolName)) {
      toast.error('Type the school name exactly to confirm replace mode');
      return;
    }
    setImporting(true);
    setImportLog([]);
    try {
      const result = await importSchoolData({
        file: importFile,
        targetSchoolId: effectiveTarget,
        mode: importMode,
        migrateSchoolId: effectiveTarget !== importPreview?.schoolId,
        sourceSchoolId: importPreview?.schoolId,
        onProgress: (p) => {
          if (p.phase === 'importing') {
            setImportLog(prev => {
              const line = `${p.collection}: ${p.written}/${p.total} (${p.skipped} skipped)`;
              const filtered = prev.filter(l => !l.startsWith(p.collection + ':'));
              return [...filtered, line];
            });
          }
        },
      });
      if (result.success) {
        toast.success('Import completed successfully');
      } else {
        toast.error('Import completed with some errors — check log');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const quickCsvExport = async (module: 'students' | 'staff' | 'grades' | 'attendance') => {
    if (!schoolId) return;
    const tid = toast.loading('Preparing export…');
    try {
      if (module === 'students') {
        const snap = await getDocs(query(collection(db, 'students'), where('schoolId', '==', schoolId)));
        exportStudentsCsv(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
      } else if (module === 'staff') {
        const snap = await getDocs(query(collection(db, 'staff'), where('schoolId', '==', schoolId)));
        exportStaffCsv(snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff)));
      } else if (module === 'grades') {
        const snap = await getDocs(query(collection(db, 'grades'), where('schoolId', '==', schoolId)));
        exportGradesCsv(snap.docs.map(d => ({ id: d.id, ...d.data() } as Grade)));
      } else {
        const snap = await getDocs(query(collection(db, 'attendance'), where('schoolId', '==', schoolId)));
        exportAttendanceCsv(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      }
      toast.success('CSV downloaded', { id: tid });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed', { id: tid });
    }
  };

  const handleGradeImport = async (file: File) => {
    if (!schoolId) return;
    const rows = await parseSpreadsheetFile<GradeCsvRow>(file);
    const results = await importGradesFromRows(rows, schoolId);
    const ok = results.filter(r => r.status === 'success').length;
    toast.success(`Grades import: ${ok}/${rows.length} rows imported`);
  };

  const handleAttendanceImport = async (file: File) => {
    if (!schoolId || !user) return;
    const rows = await parseSpreadsheetFile<AttendanceCsvRow>(file);
    const results = await importAttendanceFromRows(rows, schoolId, user.uid);
    const ok = results.filter(r => r.status === 'success').length;
    toast.success(`Attendance import: ${ok}/${rows.length} rows imported`);
  };

  if (!schoolId) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center text-slate-500">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
        <p>Select a school context before using data portability tools.</p>
      </div>
    );
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
      tab === t ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <Link to="/admin" className="text-indigo-600 hover:text-indigo-700 font-bold text-sm flex items-center mb-6">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Package className="w-8 h-8 text-indigo-600" />
          Data Portability
        </h1>
        <p className="text-slate-500 mt-1">
          Export or restore full school backups (JSON ZIP) and manage per-module CSV tools.
        </p>
        <p className="text-xs text-slate-400 mt-1 font-mono">School: {schoolName} ({schoolId})</p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button type="button" className={tabCls('backup')} onClick={() => setTab('backup')}>Full Backup</button>
        <button type="button" className={tabCls('restore')} onClick={() => setTab('restore')}>Restore / Import</button>
        <button type="button" className={tabCls('modules')} onClick={() => setTab('modules')}>Module Tools</button>
      </div>

      {tab === 'backup' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Download className="w-5 h-5 text-indigo-600" /> Export JSON ZIP
          </h2>
          <p className="text-sm text-slate-500">Select data tiers to include in the backup bundle.</p>

          <div className="space-y-2">
            {([1, 2, 3] as ExportTier[]).map(tier => (
              <label key={tier} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tiers.includes(tier)}
                  onChange={() => toggleTier(tier)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <div>
                  <p className="font-medium text-slate-800">Tier {tier}: {tierLabel(tier)}</p>
                  <p className="text-xs text-slate-400">
                    {tier === 1 && 'Students, staff, classes, grades, attendance, assignments…'}
                    {tier === 2 && 'Finance, payroll, timetables, applications, events…'}
                    {tier === 3 && 'Exams, CBT, library, trips, HR policies, curriculum…'}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={includeGeofence} onChange={e => setIncludeGeofence(e.target.checked)} />
            Include geofence settings
          </label>

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">
            <Info className="w-4 h-4 inline mr-1" />
            {EXPORT_WARNINGS.join(' · ')}
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? 'Exporting…' : 'Download Backup ZIP'}
          </button>

          {exportLog.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-4 text-xs font-mono text-slate-600 max-h-40 overflow-y-auto">
              {exportLog.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      )}

      {tab === 'restore' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-600" /> Import JSON ZIP
          </h2>

          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
          >
            <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-medium text-slate-700">
              {importFile ? importFile.name : 'Choose an Avenir export ZIP file'}
            </p>
          </button>

          {importPreview && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <p><strong>Source school:</strong> {importPreview.schoolName} ({importPreview.schoolId})</p>
              <p><strong>Exported:</strong> {new Date(importPreview.exportedAt).toLocaleString()}</p>
              <p><strong>Records:</strong></p>
              <ul className="text-xs font-mono grid grid-cols-2 gap-1">
                {Object.entries(importPreview.collections).map(([k, v]) => (
                  <li key={k}>{k}: {v}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Import mode</label>
            <select
              value={importMode}
              onChange={e => setImportMode(e.target.value as ImportMode)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="merge">Merge — add only new records</option>
              <option value="upsert">Upsert — update existing, add new</option>
              <option value="replace">Replace — wipe school data first, then import</option>
            </select>
          </div>

          {isSuperAdmin && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Target school ID (migration)
              </label>
              <input
                value={targetSchoolId}
                onChange={e => setTargetSchoolId(e.target.value)}
                placeholder={schoolId}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">Super admin only — import into a different school ID</p>
            </div>
          )}

          {importMode === 'replace' && (
            <div>
              <label className="block text-sm font-semibold text-red-700 mb-1">
                Type school name to confirm: {importPreview?.schoolName ?? schoolName}
              </label>
              <input
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleImport}
            disabled={!importFile || importing}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {importing ? 'Importing…' : 'Run Import'}
          </button>

          {importLog.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-4 text-xs font-mono text-slate-600 max-h-48 overflow-y-auto">
              {importLog.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      )}

      {tab === 'modules' && (
        <div className="space-y-4">
          {[
            { label: 'Students', importLink: '/admin/bulk-import', export: () => quickCsvExport('students'), template: downloadStudentTemplate },
            { label: 'Staff', importLink: '/admin/bulk-staff-import', export: () => quickCsvExport('staff'), template: downloadStaffTemplate },
            { label: 'Grades', importLink: null, export: () => quickCsvExport('grades'), template: downloadGradeTemplate },
            { label: 'Attendance', importLink: null, export: () => quickCsvExport('attendance'), template: downloadAttendanceTemplate },
          ].map(mod => (
            <div key={mod.label} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                <span className="font-semibold text-slate-800">{mod.label}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={mod.template} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">Template</button>
                <button type="button" onClick={mod.export} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1">
                  <Download className="w-3 h-3" /> Export CSV
                </button>
                {mod.importLink && (
                  <Link to={mod.importLink} className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                    Import Page
                  </Link>
                )}
              </div>
            </div>
          ))}

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <p className="font-semibold text-slate-800">Quick CSV import (grades & attendance)</p>
            <input ref={gradeFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleGradeImport(f); e.target.value = ''; }} />
            <input ref={attendanceFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAttendanceImport(f); e.target.value = ''; }} />
            <div className="flex gap-2">
              <button type="button" onClick={() => gradeFileRef.current?.click()}
                className="text-sm px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50">Import Grades CSV</button>
              <button type="button" onClick={() => attendanceFileRef.current?.click()}
                className="text-sm px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50">Import Attendance CSV</button>
            </div>
          </div>

          <Link to="/admin/data-reset" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
            <Database className="w-4 h-4" /> School Data Reset (selective wipe before replace import)
          </Link>
        </div>
      )}
    </div>
  );
}
