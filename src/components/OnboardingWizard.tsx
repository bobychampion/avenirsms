/**
 * OnboardingWizard
 *
 * A 3-step modal that guides a new school admin through:
 *   1. School Settings — configure name, logo, session, etc.
 *   2. Data Import    — upload CSV/Excel, AI maps columns → students + classes
 *   3. Done           — summary and launch
 */
import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import {
  collection, addDoc, getDocs, query, where, serverTimestamp, writeBatch, doc,
} from 'firebase/firestore';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Settings, Upload, CheckCircle2, ArrowRight, ArrowLeft,
  Loader2, FileSpreadsheet, Users, Sparkles, AlertTriangle,
  School, ChevronRight, Download,
} from 'lucide-react';
import { generateStudentId as genId } from '../services/firestoreService';
import { OnboardingStep } from '../hooks/useOnboarding';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedStudent {
  studentName: string;
  email?: string;
  phone?: string;
  dob?: string;
  gender?: string;
  currentClass?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  homeAddress?: string;
  stateOfOrigin?: string;
  bloodGroup?: string;
  religion?: string;
  nin?: string;
  [key: string]: string | undefined;
}

interface ImportSummary {
  created: number;
  skipped: number;
  classesCreated: string[];
}

interface Props {
  schoolId: string;
  currentStep: OnboardingStep;
  settingsDone: boolean;
  importDone: boolean;
  onMarkSettingsDone: () => Promise<void>;
  onMarkImportDone: () => Promise<void>;
  onComplete: () => Promise<void>;
  onDismiss: () => void;
}

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS: { key: OnboardingStep; label: string; icon: React.ReactNode }[] = [
  { key: 'settings', label: 'School Setup',  icon: <Settings size={16} /> },
  { key: 'import',   label: 'Import Data',   icon: <Upload size={16} /> },
  { key: 'done',     label: 'All Set',        icon: <CheckCircle2 size={16} /> },
];

function stepIndex(s: OnboardingStep) {
  return STEPS.findIndex(x => x.key === s);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingWizard({
  schoolId,
  currentStep,
  settingsDone,
  importDone,
  onMarkSettingsDone,
  onMarkImportDone,
  onComplete,
  onDismiss,
}: Props) {
  const navigate = useNavigate();
  const activeIdx = stepIndex(currentStep);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <School size={20} />
              </div>
              <div>
                <h2 className="font-semibold text-lg leading-tight">Welcome to Avenir SIS</h2>
                <p className="text-indigo-200 text-sm">Let's get your school set up in a few steps</p>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              aria-label="Dismiss onboarding"
            >
              <X size={16} />
            </button>
          </div>

          {/* Step progress */}
          <div className="flex items-center gap-2">
            {STEPS.map((step, i) => {
              const done = i < activeIdx || (step.key === 'settings' && settingsDone) || (step.key === 'import' && importDone);
              const active = i === activeIdx;
              return (
                <React.Fragment key={step.key}>
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    done ? 'bg-white/30 text-white' :
                    active ? 'bg-white text-indigo-700' :
                    'bg-white/10 text-indigo-300'
                  }`}>
                    {done ? <CheckCircle2 size={12} /> : step.icon}
                    {step.label}
                  </div>
                  {i < STEPS.length - 1 && (
                    <ChevronRight size={14} className="text-indigo-300 flex-shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {currentStep === 'settings' && (
              <SettingsStep
                onDone={onMarkSettingsDone}
                onNavigate={() => navigate('/admin/settings')}
              />
            )}
            {currentStep === 'import' && (
              <ImportStep
                schoolId={schoolId}
                onDone={onMarkImportDone}
                onSkip={onMarkImportDone}
              />
            )}
            {currentStep === 'done' && (
              <DoneStep onComplete={onComplete} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ─── Step 1: Settings ─────────────────────────────────────────────────────────

function SettingsStep({ onDone, onNavigate }: { onDone: () => Promise<void>; onNavigate: () => void }) {
  const [confirming, setConfirming] = useState(false);

  const handleGoToSettings = () => {
    onNavigate();
  };

  const handleMarkDone = async () => {
    setConfirming(true);
    await onDone();
    setConfirming(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Settings size={24} className="text-indigo-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800 text-lg">Configure your school</h3>
          <p className="text-slate-500 text-sm mt-1">
            Set your school name, logo, academic session, grading system, and other preferences.
            This takes about 5 minutes.
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
        <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-amber-800 text-sm">
          Your school is currently using default settings. Head to School Settings to personalise
          your school name, logo, currency, and more before adding students.
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {[
          'School name, address & contact info',
          'Logo and branding colours',
          'Academic session & term structure',
          'Grading system (percentage, WAEC, GPA, IB)',
          'Country, currency & timezone',
        ].map(item => (
          <div key={item} className="flex items-center gap-2 text-sm text-slate-600">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            {item}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleGoToSettings}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
        >
          <Settings size={16} />
          Open School Settings
          <ArrowRight size={16} />
        </button>
        <button
          onClick={handleMarkDone}
          disabled={confirming}
          className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
        >
          {confirming ? <Loader2 size={14} className="animate-spin" /> : null}
          Already done
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Import ───────────────────────────────────────────────────────────

function ImportStep({
  schoolId,
  onDone,
  onSkip,
}: {
  schoolId: string;
  onDone: () => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mappingLoading, setMappingLoading] = useState(false);
  const [preview, setPreview] = useState<ParsedStudent[]>([]);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const KNOWN_FIELDS = [
    'studentName', 'email', 'phone', 'dob', 'gender', 'currentClass',
    'guardianName', 'guardianPhone', 'guardianEmail', 'homeAddress',
    'stateOfOrigin', 'bloodGroup', 'religion',
  ];

  const parseFile = useCallback(async (f: File) => {
    setFile(f);
    setSummary(null);

    let rows: Record<string, string>[] = [];

    if (f.name.endsWith('.csv')) {
      await new Promise<void>((resolve) => {
        Papa.parse<Record<string, string>>(f, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => { rows = result.data; resolve(); },
        });
      });
    } else {
      // Excel
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
    }

    if (!rows.length) { toast.error('No data found in file'); return; }

    const hdrs = Object.keys(rows[0]);
    setHeaders(hdrs);
    setRawRows(rows);

    // AI column mapping
    setMappingLoading(true);
    try {
      const { mapColumnsToStudentFields } = await import('../services/geminiService');
      const mapped = await mapColumnsToStudentFields(hdrs);
      setMapping(mapped);
      // Build preview
      buildPreview(rows, mapped);
    } catch {
      // Fallback: try exact match
      const fallback: Record<string, string> = {};
      hdrs.forEach(h => { fallback[h] = KNOWN_FIELDS.includes(h) ? h : ''; });
      setMapping(fallback);
      buildPreview(rows, fallback);
    } finally {
      setMappingLoading(false);
    }
  }, []);

  const buildPreview = (rows: Record<string, string>[], map: Record<string, string>) => {
    const students: ParsedStudent[] = rows.slice(0, 5).map(row => {
      const s: ParsedStudent = { studentName: '' };
      for (const [col, field] of Object.entries(map)) {
        if (field && row[col] !== undefined) {
          s[field] = String(row[col]).trim();
        }
      }
      return s;
    });
    setPreview(students);
  };

  const updateMapping = (col: string, field: string) => {
    const newMap = { ...mapping, [col]: field };
    setMapping(newMap);
    buildPreview(rawRows, newMap);
  };

  const handleImport = async () => {
    if (!rawRows.length) return;
    setImporting(true);

    try {
      // Build full student list from mapping
      const allStudents: ParsedStudent[] = rawRows.map(row => {
        const s: ParsedStudent = { studentName: '' };
        for (const [col, field] of Object.entries(mapping)) {
          if (field && row[col] !== undefined) {
            s[field] = String(row[col]).trim();
          }
        }
        return s;
      }).filter(s => s.studentName);

      // Collect unique classes
      const classNames = [...new Set(allStudents.map(s => s.currentClass).filter(Boolean))] as string[];

      // Ensure classes exist in Firestore
      const existingClassSnap = await getDocs(
        query(collection(db, 'classes'), where('schoolId', '==', schoolId))
      );
      const existingClassNames = new Set(existingClassSnap.docs.map(d => d.data().name));
      const newClasses: string[] = [];

      const batch = writeBatch(db);
      for (const cn of classNames) {
        if (!existingClassNames.has(cn)) {
          const ref = doc(collection(db, 'classes'));
          batch.set(ref, {
            name: cn,
            level: cn,
            schoolId,
            academicSession: new Date().getFullYear() + '/' + (new Date().getFullYear() + 1),
            studentCount: 0,
            createdAt: serverTimestamp(),
          });
          newClasses.push(cn);
        }
      }
      await batch.commit();

      // Check existing students to avoid duplicates
      const existingSnap = await getDocs(
        query(collection(db, 'students'), where('schoolId', '==', schoolId))
      );
      const existingNames = new Set(
        existingSnap.docs.map(d => (d.data().studentName ?? '').toLowerCase().trim())
      );

      let created = 0;
      let skipped = 0;

      for (const student of allStudents) {
        const nameKey = student.studentName.toLowerCase().trim();
        if (existingNames.has(nameKey)) { skipped++; continue; }

        const studentId = await genId(schoolId);
        await addDoc(collection(db, 'students'), {
          ...student,
          studentId,
          schoolId,
          enrolledAt: serverTimestamp(),
          applicationId: '',
          admissionStatus: 'active',
          createdAt: serverTimestamp(),
        });
        existingNames.add(nameKey);
        created++;
      }

      setSummary({ created, skipped, classesCreated: newClasses });
      toast.success(`Imported ${created} students`);
      await onDone();
    } catch (err) {
      console.error(err);
      toast.error('Import failed. Please check your file and try again.');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = ['studentName','email','phone','dob','gender','currentClass','guardianName','guardianPhone','guardianEmail','homeAddress','stateOfOrigin','bloodGroup','religion'];
    const sample = ['Adaeze Okonkwo','adaeze@email.com','08012345678','2010-05-15','female','JSS 1','Mrs Okonkwo','08012345679','parent@email.com','5 Main Street Lagos','Anambra','O+','Christianity'];
    const csv = [headers.join(','), sample.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'student_import_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (summary) {
    return (
      <div className="p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={32} className="text-emerald-600" />
          </div>
          <h3 className="font-semibold text-slate-800 text-lg">Import complete</h3>
          <p className="text-slate-500 text-sm mt-1">Your student data has been added to the system</p>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-emerald-700">{summary.created}</div>
            <div className="text-xs text-emerald-600 mt-0.5">Students created</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-amber-700">{summary.skipped}</div>
            <div className="text-xs text-amber-600 mt-0.5">Skipped (duplicates)</div>
          </div>
          <div className="bg-indigo-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-indigo-700">{summary.classesCreated.length}</div>
            <div className="text-xs text-indigo-600 mt-0.5">Classes created</div>
          </div>
        </div>
        {summary.classesCreated.length > 0 && (
          <div className="bg-slate-50 rounded-xl p-3 mb-4">
            <p className="text-xs text-slate-500 mb-1.5">New classes created:</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.classesCreated.map(c => (
                <span key={c} className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-start gap-4 mb-5">
        <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <FileSpreadsheet size={24} className="text-violet-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800 text-lg">Import your student data</h3>
          <p className="text-slate-500 text-sm mt-1">
            Upload a CSV or Excel file. Our AI will automatically map your columns to the right fields.
          </p>
        </div>
      </div>

      {!file ? (
        <>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
            className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-8 text-center cursor-pointer transition-colors mb-4"
          >
            <Upload size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium text-sm">Drop your file here or click to browse</p>
            <p className="text-slate-400 text-xs mt-1">Supports CSV and Excel (.xlsx, .xls)</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }}
            />
          </div>
          <div className="flex items-center justify-between">
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 text-sm font-medium">
              <Download size={14} />
              Download template
            </button>
            <button onClick={onSkip} className="text-slate-400 hover:text-slate-600 text-sm">
              Skip for now
            </button>
          </div>
        </>
      ) : mappingLoading ? (
        <div className="flex flex-col items-center py-8 gap-3">
          <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center">
            <Sparkles size={20} className="text-violet-600 animate-pulse" />
          </div>
          <p className="text-slate-600 text-sm font-medium">AI is mapping your columns...</p>
          <p className="text-slate-400 text-xs">This takes a few seconds</p>
        </div>
      ) : (
        <>
          {/* Column mapping review */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-violet-500" />
              <p className="text-sm font-medium text-slate-700">AI column mapping — review and adjust if needed</p>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {headers.map(col => (
                <div key={col} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-36 truncate flex-shrink-0 bg-slate-50 px-2 py-1 rounded">{col}</span>
                  <ArrowRight size={12} className="text-slate-300 flex-shrink-0" />
                  <select
                    value={mapping[col] || ''}
                    onChange={e => updateMapping(col, e.target.value)}
                    className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700"
                  >
                    <option value="">— ignore —</option>
                    {['studentName','email','phone','dob','gender','currentClass','guardianName','guardianPhone','guardianEmail','homeAddress','stateOfOrigin','bloodGroup','religion','nin'].map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-slate-500 mb-2">Preview (first {preview.length} rows)</p>
              <div className="space-y-1">
                {preview.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                    <Users size={12} className="text-slate-400 flex-shrink-0" />
                    <span className="font-medium">{s.studentName || '—'}</span>
                    {s.currentClass && <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">{s.currentClass}</span>}
                    {s.gender && <span className="text-slate-400">{s.gender}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {importing ? 'Importing...' : `Import ${rawRows.length} students`}
            </button>
            <button
              onClick={() => { setFile(null); setRawRows([]); setHeaders([]); setMapping({}); setPreview([]); }}
              className="border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
            >
              Change file
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Step 3: Done ─────────────────────────────────────────────────────────────

function DoneStep({ onComplete }: { onComplete: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLaunch = async () => {
    setLoading(true);
    await onComplete();
    navigate('/admin');
  };

  return (
    <div className="p-6 text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 size={40} className="text-white" />
      </div>
      <h3 className="font-bold text-slate-800 text-xl mb-2">You're all set</h3>
      <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">
        Your school is configured and your data is loaded. You can always come back to Settings
        or use Bulk Import to add more students later.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6 text-left">
        {[
          { icon: <Settings size={16} className="text-indigo-500" />, label: 'School Settings', path: '/admin/settings' },
          { icon: <Users size={16} className="text-violet-500" />, label: 'View Students', path: '/admin/students' },
          { icon: <FileSpreadsheet size={16} className="text-emerald-500" />, label: 'Bulk Import', path: '/admin/bulk-import' },
          { icon: <School size={16} className="text-amber-500" />, label: 'Manage Classes', path: '/admin/classes' },
        ].map(item => (
          <button
            key={item.path}
            onClick={() => { onComplete(); navigate(item.path); }}
            className="flex items-center gap-2 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 text-sm text-slate-700 transition-colors"
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      <button
        onClick={handleLaunch}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-3 rounded-xl font-semibold text-sm transition-colors"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : null}
        Go to Dashboard
      </button>
    </div>
  );
}
