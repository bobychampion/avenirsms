
import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import {
  collection, addDoc, serverTimestamp, getDocs, query, where,
} from 'firebase/firestore';
import { Staff } from '../types';
import { useSchoolId } from '../hooks/useSchoolId';
import { useSchool } from '../components/SchoolContext';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Download, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Users, FileSpreadsheet, ArrowLeft, RefreshCw,
  Sparkles, Eye, EyeOff, Copy, CheckCheck, Info,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CSVRow {
  staffName: string;
  email?: string;
  phone?: string;
  role?: string;
  subject?: string;
  department?: string;
  qualification?: string;
  basicSalary?: string;
  allowances?: string;
  bankName?: string;
  accountNumber?: string;
}

interface ProcessedRow extends CSVRow {
  resolvedRole: Staff['role'];
  generatedEmail?: string;   // set when no email provided
  generatedPassword: string;
  loginEmail: string;        // final email used for login
}

interface ImportResult {
  row: number;
  name: string;
  status: 'success' | 'error' | 'duplicate';
  message?: string;
  loginEmail?: string;
  password?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_MAP: Record<string, Staff['role']> = {
  teacher: 'teacher', tutor: 'teacher', lecturer: 'teacher', instructor: 'teacher',
  admin: 'admin_staff', administrator: 'admin_staff', admin_staff: 'admin_staff',
  secretary: 'admin_staff', clerk: 'admin_staff', accountant: 'admin_staff',
  bursar: 'admin_staff', librarian: 'admin_staff', 'it officer': 'admin_staff',
  support: 'support', cleaner: 'support', security: 'support', driver: 'support',
  janitor: 'support', cook: 'support', 'kitchen staff': 'support',
};

function resolveRole(raw?: string): Staff['role'] {
  if (!raw) return 'teacher';
  const key = raw.trim().toLowerCase();
  return ROLE_MAP[key] ?? 'teacher';
}

function generatePassword(name: string): string {
  const base = name.split(' ')[0].replace(/[^a-zA-Z]/g, '') || 'Staff';
  const cap = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
  const num = Math.floor(100 + Math.random() * 900);
  return `${cap}@${num}`;
}

function generateEmail(name: string, slug: string): string {
  const clean = name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.');
  return `${clean}@staff.${slug}`;
}

const TEMPLATE_HEADERS = [
  'staffName', 'email', 'phone', 'role', 'subject',
  'department', 'qualification', 'basicSalary', 'allowances',
  'bankName', 'accountNumber',
];

const TEMPLATE_SAMPLES = [
  ['Amara Okafor', 'amara@school.com', '08012345678', 'teacher', 'Mathematics', 'Sciences', 'B.Sc', '80000', '5000', 'GTBank', '0123456789'],
  ['Bola Adeyemi', '', '08098765432', 'admin_staff', '', 'Admin', 'HND', '60000', '3000', 'Access Bank', '9876543210'],
  ['Chidi Eze', '', '07011223344', 'support', '', '', 'SSCE', '40000', '2000', '', ''],
];

// ─── Credentials reveal modal ─────────────────────────────────────────────────

function CredentialsModal({
  results, onClose,
}: { results: ImportResult[]; onClose: () => void }) {
  const [visible, setVisible] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const generated = results.filter(r => r.status === 'success' && r.loginEmail);

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = () => {
    const text = generated
      .map(r => `${r.name}\nEmail: ${r.loginEmail}\nPassword: ${r.password}`)
      .join('\n\n');
    copy(text, 'all');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4 text-white">
          <h2 className="font-bold text-lg">Generated Login Credentials</h2>
          <p className="text-indigo-200 text-sm mt-0.5">
            Save these now — passwords won't be shown again
          </p>
        </div>
        <div className="p-4 max-h-96 overflow-y-auto space-y-3">
          {generated.map((r, i) => (
            <div key={i} className="bg-slate-50 rounded-xl border border-slate-200 p-3">
              <p className="font-semibold text-slate-800 text-sm mb-2">{r.name}</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 w-16 flex-shrink-0">Email</span>
                  <span className="text-xs font-mono text-slate-700 flex-1 truncate">{r.loginEmail}</span>
                  <button onClick={() => copy(r.loginEmail!, `email-${i}`)} className="p-1 rounded hover:bg-slate-200 text-slate-400">
                    {copied === `email-${i}` ? <CheckCheck className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 w-16 flex-shrink-0">Password</span>
                  <span className="text-xs font-mono text-slate-700 flex-1">
                    {visible[i] ? r.password : '••••••••'}
                  </span>
                  <button onClick={() => setVisible(v => ({ ...v, [i]: !v[i] }))} className="p-1 rounded hover:bg-slate-200 text-slate-400">
                    {visible[i] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button onClick={() => copy(r.password!, `pw-${i}`)} className="p-1 rounded hover:bg-slate-200 text-slate-400">
                    {copied === `pw-${i}` ? <CheckCheck className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4 flex gap-3">
          <button
            onClick={copyAll}
            className="flex items-center gap-2 flex-1 justify-center border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            {copied === 'all' ? <CheckCheck className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied === 'all' ? 'Copied!' : 'Copy All'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BulkStaffImport() {
  const schoolId = useSchoolId();
  const { urlSlug, schoolName } = useSchool();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProcessedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Derive a slug for generated emails
  const slug = urlSlug || (schoolName || 'school').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

  const processRows = (rows: CSVRow[]): { processed: ProcessedRow[]; errs: string[] } => {
    const errs: string[] = [];
    const processed: ProcessedRow[] = rows.map((row, i) => {
      if (!row.staffName?.trim()) errs.push(`Row ${i + 2}: Staff name is required`);
      const resolvedRole = resolveRole(row.role);
      const hasEmail = !!row.email?.trim();
      const loginEmail = hasEmail ? row.email!.trim() : generateEmail(row.staffName || `staff${i}`, slug);
      return {
        ...row,
        staffName: row.staffName?.trim() || '',
        resolvedRole,
        generatedEmail: hasEmail ? undefined : loginEmail,
        loginEmail,
        generatedPassword: generatePassword(row.staffName || 'Staff'),
      };
    });
    return { processed, errs };
  };

  const handleFile = (f: File) => {
    setFile(f);
    setResults([]);
    setDone(false);
    Papa.parse<CSVRow>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const { processed, errs } = processRows(result.data as CSVRow[]);
        setPreview(processed);
        setErrors(errs);
      },
      error: () => toast.error('Failed to parse CSV file'),
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.csv') || f.type === 'text/csv')) handleFile(f);
    else toast.error('Please drop a CSV file');
  };

  const handleImport = async () => {
    if (!preview.length || errors.length > 0) return;
    setImporting(true);
    const sid = schoolId ?? 'main';
    const importResults: ImportResult[] = [];
    const tid = toast.loading(`Importing ${preview.length} staff members…`);

    try {
      // Pre-fetch existing staff emails to detect duplicates
      const existingSnap = await getDocs(
        query(collection(db, 'staff'), where('schoolId', '==', sid))
      );
      const existingEmails = new Set(
        existingSnap.docs.map(d => (d.data().email ?? '').toLowerCase().trim()).filter(Boolean)
      );

      for (let i = 0; i < preview.length; i++) {
        const row = preview[i];
        if (!row.staffName) {
          importResults.push({ row: i + 2, name: '(blank)', status: 'error', message: 'Name is required' });
          continue;
        }

        const emailKey = row.loginEmail.toLowerCase();
        if (existingEmails.has(emailKey)) {
          importResults.push({ row: i + 2, name: row.staffName, status: 'duplicate', message: 'Email already exists' });
          continue;
        }

        try {
          const staffDoc: Omit<Staff, 'id'> & { schoolId: string; loginEmail: string; generatedLogin: boolean; pendingPassword?: string } = {
            staffName: row.staffName,
            email: row.loginEmail,
            phone: row.phone?.trim() || '',
            role: row.resolvedRole,
            subject: row.subject?.trim() || '',
            department: row.department?.trim() || '',
            qualification: row.qualification?.trim() || '',
            basicSalary: parseFloat(row.basicSalary || '0') || 0,
            allowances: parseFloat(row.allowances || '0') || 0,
            bankName: row.bankName?.trim() || '',
            accountNumber: row.accountNumber?.trim() || '',
            employedAt: serverTimestamp(),
            schoolId: sid,
            loginEmail: row.loginEmail,
            generatedLogin: !!row.generatedEmail,
            // Store the generated password so User Management can pre-fill it
            // when creating the Firebase Auth account. Cleared after account creation.
            pendingPassword: row.generatedPassword,
          };

          await addDoc(collection(db, 'staff'), staffDoc);
          existingEmails.add(emailKey);

          importResults.push({
            row: i + 2,
            name: row.staffName,
            status: 'success',
            loginEmail: row.loginEmail,
            password: row.generatedPassword,
            message: row.generatedEmail ? 'Auto-generated email' : undefined,
          });
        } catch (e: any) {
          importResults.push({ row: i + 2, name: row.staffName, status: 'error', message: e.message });
        }
      }
    } catch (e: any) {
      toast.error('Import failed: ' + (e.message || 'Unknown error'), { id: tid });
      setImporting(false);
      return;
    }

    setResults(importResults);
    setDone(true);
    setImporting(false);

    const successCount = importResults.filter(r => r.status === 'success').length;
    const dupCount = importResults.filter(r => r.status === 'duplicate').length;
    const errCount = importResults.filter(r => r.status === 'error').length;
    toast.success(
      `Import complete: ${successCount} added · ${dupCount} duplicates · ${errCount} errors`,
      { id: tid, duration: 6000 }
    );

    if (successCount > 0) setShowCredentials(true);
  };

  const downloadTemplate = () => {
    const rows = [TEMPLATE_HEADERS, ...TEMPLATE_SAMPLES];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'staff_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null); setPreview([]); setErrors([]); setResults([]); setDone(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const dupCount = results.filter(r => r.status === 'duplicate').length;
  const errCount = results.filter(r => r.status === 'error').length;
  const generatedCount = preview.filter(r => !!r.generatedEmail).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* Credentials modal */}
      <AnimatePresence>
        {showCredentials && (
          <CredentialsModal
            results={results}
            onClose={() => setShowCredentials(false)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin/staff" className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            Bulk Staff Import
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Upload a CSV to add multiple staff members at once</p>
        </div>
      </div>

      {/* Template download */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 mb-6 flex items-start gap-4">
        <div className="bg-indigo-100 p-2.5 rounded-xl flex-shrink-0">
          <Download className="w-5 h-5 text-indigo-700" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-indigo-900 mb-1">Step 1: Download the CSV Template</h3>
          <p className="text-sm text-indigo-700 mb-1">
            Only <strong>staffName</strong> is required. Leave <strong>email</strong> blank and the system
            will auto-generate a login email and password for that staff member.
          </p>
          <p className="text-xs text-indigo-600 mb-3">
            Role values: <code className="bg-indigo-100 px-1 rounded">teacher</code>,{' '}
            <code className="bg-indigo-100 px-1 rounded">admin_staff</code>,{' '}
            <code className="bg-indigo-100 px-1 rounded">support</code> — or use job titles like
            "Principal", "Bursar", "Cleaner" and the system will map them automatically.
          </p>
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Template (.csv)
          </button>
        </div>
      </div>

      {/* Auto-email info banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex gap-3">
        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <strong>Staff without emails</strong> will receive a generated login like{' '}
          <code className="bg-amber-100 px-1 rounded text-xs">firstname.lastname@staff.{slug}</code>{' '}
          and a temporary password. They must change it on first login. You can view and copy all
          generated credentials after import.
        </div>
      </div>

      {/* Upload zone */}
      {!done && (
        <div
          className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all mb-6"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
          <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-700 font-semibold mb-1">
            {file ? file.name : 'Drop your CSV here or click to browse'}
          </p>
          <p className="text-slate-400 text-sm">Only .csv files are supported</p>
        </div>
      )}

      {/* Validation errors */}
      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span className="font-semibold text-rose-800">Validation Errors ({errors.length})</span>
            </div>
            <ul className="space-y-1">
              {errors.map((e, i) => <li key={i} className="text-sm text-rose-700">• {e}</li>)}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview table */}
      {preview.length > 0 && !done && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-slate-900">{preview.length} staff ready to import</span>
            </div>
            <div className="flex items-center gap-3">
              {generatedCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                  <Sparkles className="w-3 h-3" />
                  {generatedCount} email{generatedCount > 1 ? 's' : ''} will be auto-generated
                </span>
              )}
              {errors.length === 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2.5 py-1 rounded-full">
                  All rows valid ✓
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['#', 'Name', 'Role', 'Login Email', 'Subject / Dept', 'Salary'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.slice(0, 20).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{row.staffName}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        row.resolvedRole === 'teacher' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                        row.resolvedRole === 'admin_staff' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-slate-50 text-slate-700 border-slate-200'
                      }`}>
                        {row.resolvedRole === 'teacher' ? 'Teacher' : row.resolvedRole === 'admin_staff' ? 'Admin Staff' : 'Support'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">
                      {row.loginEmail}
                      {row.generatedEmail && (
                        <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-sans font-medium">auto</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{row.subject || row.department || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{row.basicSalary ? `${row.basicSalary}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 20 && (
              <p className="px-4 py-3 text-sm text-slate-400 border-t border-slate-100">
                … and {preview.length - 20} more rows
              </p>
            )}
          </div>
        </div>
      )}

      {/* Import button */}
      {preview.length > 0 && !done && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={importing || errors.length > 0}
            className="flex items-center gap-2 bg-indigo-600 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? 'Importing…' : `Import ${preview.length} Staff`}
          </button>
          <button onClick={reset} className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Results */}
      {done && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-emerald-700">{successCount}</p>
              <p className="text-sm text-emerald-600">Imported</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
              <AlertTriangle className="w-6 h-6 text-amber-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-amber-700">{dupCount}</p>
              <p className="text-sm text-amber-600">Duplicates</p>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
              <XCircle className="w-6 h-6 text-rose-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-rose-700">{errCount}</p>
              <p className="text-sm text-rose-600">Errors</p>
            </div>
          </div>

          {/* Results table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-slate-900">Import Results</span>
              {successCount > 0 && (
                <button
                  onClick={() => setShowCredentials(true)}
                  className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Generated Credentials
                </button>
              )}
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {['Row', 'Name', 'Status', 'Login Email / Note'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-400">{r.row}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{r.name}</td>
                      <td className="px-4 py-2.5">
                        {r.status === 'success' && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Success</span>}
                        {r.status === 'duplicate' && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Duplicate</span>}
                        {r.status === 'error' && <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium">Error</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">
                        {r.loginEmail || r.message}
                        {r.message && r.status === 'success' && (
                          <span className="ml-1.5 font-sans text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">auto-generated</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="flex items-center gap-2 bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">
              <RefreshCw className="w-4 h-4" />
              Import Another File
            </button>
            <Link to="/admin/staff" className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors">
              <Users className="w-4 h-4" />
              View Staff
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
