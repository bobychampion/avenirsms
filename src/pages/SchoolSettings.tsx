import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { Settings, Save, School, Calendar, Lock, Phone, Mail, MapPin, Loader2 } from 'lucide-react';
import { SCHOOL_CLASSES, TERMS } from '../types';

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
  updatedAt?: any;
}

const SETTINGS_DOC = 'school_settings';
const SETTINGS_ID = 'main';

const defaultSettings: SchoolSettings = {
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

  const field = (key: keyof SchoolSettings, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }));

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
          Configure your school name, contact info, current term, and exam lock status.
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
                placeholder="e.g. 08012345678"
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

        {/* Academic */}
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

        {/* Exam Lock */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-indigo-600" /> Exam Result Access
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            When exams are locked, students and parents must use a PIN to view results (like WAEC scratch-card system).
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
      </div>
    </div>
  );
}
