import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, writeBatch } from 'firebase/firestore';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Settings, Save, School, Calendar, Lock, Phone, Loader2,
  Hash, Layers, BookOpen, Clock, Plus, X, Trash2, AlertTriangle
} from 'lucide-react';
import { SCHOOL_CLASSES, SUBJECTS, TERMS } from '../types';

export interface SchoolSettings {
  schoolName: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  currentSession: string;
  currentTerm: '1st Term' | '2nd Term' | '3rd Term';
  examLocked: boolean;
  motto?: string;
  principalName?: string;
  // Student ID configuration
  studentIdPrefix: string;
  studentIdFormat: 'PREFIX-YEAR-SEQ' | 'PREFIXYEARSEQ' | 'PREFIX-SEQ';
  studentIdPadding: number;
  // Dynamic lists
  schoolLevels: string[];
  customSubjects: string[];
  periodTimes: string[];
  updatedAt?: any;
}

const SETTINGS_DOC = 'school_settings';
const SETTINGS_ID = 'main';

const DEFAULT_PERIOD_TIMES = [
  '07:00', '07:40', '08:20', '09:00', '09:40', '10:20',
  '11:00', '11:40', '12:20', '13:00', '14:00', '14:40', '15:20'
];

export const defaultSettings: SchoolSettings = {
  schoolName: 'Avenir Secondary School',
  address: '',
  phone: '',
  email: '',
  logoUrl: '',
  currentSession: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
  currentTerm: '1st Term',
  examLocked: false,
  motto: '',
  principalName: '',
  studentIdPrefix: 'STU',
  studentIdFormat: 'PREFIX-YEAR-SEQ',
  studentIdPadding: 3,
  schoolLevels: [...SCHOOL_CLASSES],
  customSubjects: [],
  periodTimes: [...DEFAULT_PERIOD_TIMES],
};

export function useSchoolSettings() {
  const [settings, setSettings] = useState<SchoolSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, SETTINGS_DOC, SETTINGS_ID)).then(snap => {
      if (snap.exists()) setSettings({ ...defaultSettings, ...snap.data() } as SchoolSettings);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return { settings, loading };
}

// ─── Tag List Editor ──────────────────────────────────────────────────────────
function TagListEditor({
  label, items, placeholder, validate, onAdd, onRemove
}: {
  label: string;
  items: string[];
  placeholder: string;
  validate?: (v: string) => string | null;
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
}) {
  const [input, setInput] = useState('');
  const [err, setErr] = useState('');

  const handleAdd = () => {
    const val = input.trim();
    if (!val) return;
    if (items.includes(val)) { setErr('Already exists'); return; }
    const validationErr = validate?.(val);
    if (validationErr) { setErr(validationErr); return; }
    onAdd(val);
    setInput('');
    setErr('');
  };

  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{label}</label>
      <div className="flex flex-wrap gap-2 mb-3 min-h-[36px]">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-100">
            {item}
            <button onClick={() => onRemove(i)} className="ml-0.5 text-indigo-400 hover:text-red-500 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-slate-400 italic">No items yet</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
        />
        <button onClick={handleAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );
}

// ─── ID Preview helper ────────────────────────────────────────────────────────
function previewStudentId(prefix: string, format: SchoolSettings['studentIdFormat'], padding: number): string {
  const year = new Date().getFullYear();
  const seq = String(1).padStart(padding, '0');
  switch (format) {
    case 'PREFIX-YEAR-SEQ': return `${prefix}-${year}-${seq}`;
    case 'PREFIXYEARSEQ':   return `${prefix}${year}${seq}`;
    case 'PREFIX-SEQ':      return `${prefix}-${seq}`;
  }
}

export default function SchoolSettingsPage() {
  const [form, setForm] = useState<SchoolSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(db, SETTINGS_DOC, SETTINGS_ID)).then(snap => {
      if (snap.exists()) setForm({ ...defaultSettings, ...snap.data() } as SchoolSettings);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const tid = toast.loading('Saving settings…');
    try {
      await setDoc(doc(db, SETTINGS_DOC, SETTINGS_ID), {
        ...form,
        updatedAt: serverTimestamp(),
      });
      toast.success('Settings saved!', { id: tid });
    } catch (e: any) {
      toast.error('Failed to save: ' + (e.message || 'Unknown'), { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof SchoolSettings, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const validateTime = (v: string) => {
    if (!/^\d{2}:\d{2}$/.test(v)) return 'Format must be HH:MM (e.g. 08:30)';
    const [h, m] = v.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) return 'Invalid time value';
    return null;
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-600" />
          School Settings
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Configure your school identity, academic settings, and customise student IDs, levels, subjects, and timetable periods.
        </p>
      </div>

      <div className="space-y-6">
        {/* Identity */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
            <School className="w-4 h-4 text-indigo-600" /> School Identity
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">School Name *</label>
              <input value={form.schoolName} onChange={e => field('schoolName', e.target.value)}
                placeholder="e.g. Avenir Secondary School"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Principal's Name</label>
              <input value={form.principalName || ''} onChange={e => field('principalName', e.target.value)}
                placeholder="e.g. Mr. A. Adeyemi"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">School Motto</label>
              <input value={form.motto || ''} onChange={e => field('motto', e.target.value)}
                placeholder="e.g. Excellence in Education"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">School Logo URL</label>
              <input value={form.logoUrl} onChange={e => field('logoUrl', e.target.value)}
                placeholder="https://… (paste a URL to your school logo)"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              {form.logoUrl && (
                <img src={form.logoUrl} alt="School logo preview" className="mt-2 h-14 w-14 object-contain rounded-lg border border-slate-200" />
              )}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
            <Phone className="w-4 h-4 text-indigo-600" /> Contact Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Phone</label>
              <input value={form.phone} onChange={e => field('phone', e.target.value)}
                placeholder="e.g. +1 234 567 8900"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => field('email', e.target.value)}
                placeholder="school@example.com"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Address</label>
              <textarea value={form.address} onChange={e => field('address', e.target.value)}
                rows={2} placeholder="Full school address"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
            </div>
          </div>
        </section>

        {/* Academic Period */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
            <Calendar className="w-4 h-4 text-indigo-600" /> Academic Period
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Current Session</label>
              <input value={form.currentSession} onChange={e => field('currentSession', e.target.value)}
                placeholder="e.g. 2025/2026"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Current Term</label>
              <select value={form.currentTerm} onChange={e => field('currentTerm', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                {TERMS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Student ID Format */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
            <Hash className="w-4 h-4 text-indigo-600" /> Student ID Format
          </h2>
          <p className="text-xs text-slate-500 mb-5">
            Define how student IDs are generated. Changes apply to new students only.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Prefix</label>
              <input
                value={form.studentIdPrefix}
                onChange={e => field('studentIdPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="e.g. KIS"
                maxLength={6}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Format</label>
              <select value={form.studentIdFormat} onChange={e => field('studentIdFormat', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white">
                <option value="PREFIX-YEAR-SEQ">PREFIX-YEAR-SEQ</option>
                <option value="PREFIXYEARSEQ">PREFIXYEARSEQ</option>
                <option value="PREFIX-SEQ">PREFIX-SEQ</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Sequence Digits</label>
              <input
                type="number" min={2} max={8}
                value={form.studentIdPadding}
                onChange={e => field('studentIdPadding', Math.max(2, Math.min(8, Number(e.target.value))))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
            <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide">Preview:</span>
            <span className="font-mono font-bold text-indigo-700 text-sm">
              {previewStudentId(form.studentIdPrefix || 'STU', form.studentIdFormat, form.studentIdPadding)}
            </span>
          </div>
        </section>

        {/* Academic Levels */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-indigo-600" /> Academic Levels
          </h2>
          <p className="text-xs text-slate-500 mb-5">
            Define the grade levels available at your school (e.g. Year 7, Grade 10, Form 3). Used when creating classes.
          </p>
          <TagListEditor
            label="Grade / Year Levels"
            items={form.schoolLevels}
            placeholder="e.g. Year 7, Grade 10, Form 3"
            onAdd={v => field('schoolLevels', [...form.schoolLevels, v])}
            onRemove={i => field('schoolLevels', form.schoolLevels.filter((_, idx) => idx !== i))}
          />
        </section>

        {/* Subjects */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-indigo-600" /> Custom Subjects
          </h2>
          <p className="text-xs text-slate-500 mb-5">
            Add subjects specific to your school. These are combined with the built-in subject list throughout the app.
          </p>
          <TagListEditor
            label="Additional subjects"
            items={form.customSubjects}
            placeholder="e.g. Mandarin, IB Theory of Knowledge"
            onAdd={v => field('customSubjects', [...form.customSubjects, v])}
            onRemove={i => field('customSubjects', form.customSubjects.filter((_, idx) => idx !== i))}
          />
        </section>

        {/* Period Times */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-indigo-600" /> Timetable Period Times
          </h2>
          <p className="text-xs text-slate-500 mb-5">
            Define the time slots available when building timetables. Enter times manually in HH:MM format (24-hour).
          </p>
          <TagListEditor
            label="Available time slots"
            items={form.periodTimes}
            placeholder="e.g. 08:30"
            validate={validateTime}
            onAdd={v => {
              const sorted = [...form.periodTimes, v].sort();
              field('periodTimes', sorted);
            }}
            onRemove={i => field('periodTimes', form.periodTimes.filter((_, idx) => idx !== i))}
          />
        </section>

        {/* Exam Lock */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-indigo-600" /> Exam Result Access
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            When exams are locked, students and parents must use a PIN to view results (like a scratch-card access system).
          </p>
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" className="sr-only peer" checked={form.examLocked}
                onChange={e => field('examLocked', e.target.checked)} />
              <div className="w-11 h-6 bg-slate-200 peer-checked:bg-indigo-600 rounded-full transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
            </div>
            <span className="text-sm font-semibold text-slate-700">
              {form.examLocked ? '🔒 Exam results are LOCKED (PIN required)' : '🔓 Exam results are OPEN'}
            </span>
          </label>
        </section>

        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-60 text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>

        {/* Danger Zone */}
        <DangerZone />
      </div>
    </div>
  );
}

// ─── Collections to wipe (excludes users & school_settings) ──────────────────
const DEMO_COLLECTIONS = [
  { key: 'students',      label: 'Students' },
  { key: 'applications',  label: 'Applications' },
  { key: 'attendance',    label: 'Attendance' },
  { key: 'grades',        label: 'Grades' },
  { key: 'classes',       label: 'Classes' },
  { key: 'class_subjects',label: 'Class Subjects' },
  { key: 'timetables',    label: 'Timetables' },
  { key: 'invoices',      label: 'Invoices' },
  { key: 'fee_payments',  label: 'Fee Payments' },
  { key: 'expenses',      label: 'Expenses' },
  { key: 'events',        label: 'Events' },
  { key: 'assignments',   label: 'Assignments' },
  { key: 'messages',      label: 'Messages' },
  { key: 'exam_seating',  label: 'Exam Seating' },
];

async function deleteCollection(collectionName: string): Promise<number> {
  const snap = await getDocs(collection(db, collectionName));
  if (snap.empty) return 0;
  // Firestore batch max is 500 writes
  let deleted = 0;
  const chunks: typeof snap.docs[] = [];
  for (let i = 0; i < snap.docs.length; i += 490) {
    chunks.push(snap.docs.slice(i, i + 490));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

function DangerZone() {
  const [selected, setSelected] = useState<Set<string>>(new Set(DEMO_COLLECTIONS.map(c => c.key)));
  const [confirm, setConfirm] = useState('');
  const [clearing, setClearing] = useState(false);
  const [step, setStep] = useState<'idle' | 'confirm'>('idle');

  const toggle = (key: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleClear = async () => {
    if (confirm.trim().toLowerCase() !== 'clear') {
      toast.error('Type "clear" to confirm');
      return;
    }
    setClearing(true);
    const tid = toast.loading('Clearing data…');
    let total = 0;
    try {
      for (const col of DEMO_COLLECTIONS) {
        if (!selected.has(col.key)) continue;
        const count = await deleteCollection(col.key);
        total += count;
      }
      toast.success(`Done — ${total} documents deleted`, { id: tid });
      setStep('idle');
      setConfirm('');
    } catch (e: any) {
      toast.error('Error: ' + (e.message || 'Unknown'), { id: tid });
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border-2 border-red-200 shadow-sm p-6">
      <h2 className="font-bold text-red-700 text-sm flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4" /> Danger Zone — Clear Test / Demo Data
      </h2>
      <p className="text-xs text-slate-500 mb-5">
        Permanently delete selected collections. <strong>Users</strong> and <strong>School Settings</strong> are always preserved.
        This action <strong>cannot be undone</strong>.
      </p>

      {step === 'idle' && (
        <button
          onClick={() => setStep('confirm')}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-700 border border-red-200 font-bold rounded-xl hover:bg-red-100 transition-colors text-sm">
          <Trash2 className="w-4 h-4" /> Clear Demo Data…
        </button>
      )}

      {step === 'confirm' && (
        <div className="space-y-4">
          {/* Collection checkboxes */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DEMO_COLLECTIONS.map(col => (
              <label key={col.key} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selected.has(col.key)}
                  onChange={() => toggle(col.key)}
                  className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-slate-700">{col.label}</span>
              </label>
            ))}
          </div>

          <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-xs text-red-700">
            <strong>{selected.size}</strong> collection{selected.size !== 1 ? 's' : ''} selected for deletion.
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Type <span className="font-mono text-red-600">clear</span> to confirm
            </label>
            <input
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder='Type "clear" here'
              className="w-full sm:w-64 px-3 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-400 outline-none text-sm font-mono"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleClear}
              disabled={clearing || selected.size === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors text-sm disabled:opacity-50">
              {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {clearing ? 'Clearing…' : 'Confirm Clear'}
            </button>
            <button
              onClick={() => { setStep('idle'); setConfirm(''); }}
              disabled={clearing}
              className="px-5 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
