/**
 * DataMigration.tsx
 *
 * Browser-based one-time migration tool — accessible only to super_admin.
 * Backfills schoolId: 'main' on all existing Firestore documents so the
 * multi-tenant upgrade doesn't break any existing school's data.
 *
 * Route: /admin/migrate
 */

import React, { useState } from 'react';
import {
  collection, getDocs, writeBatch, doc, setDoc, getDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { Database, CheckCircle2, AlertCircle, Loader2, PlayCircle, ChevronDown, ChevronRight } from 'lucide-react';

// All collections that need schoolId backfilled (excluding 'schools' which is new)
const COLLECTIONS_TO_MIGRATE = [
  'students', 'applications', 'guardians', 'classes', 'class_subjects',
  'subjects', 'grades', 'student_skills', 'attendance', 'attendance_checkins',
  'timetables', 'assignments', 'messages', 'invoices', 'fee_payments', 'payments',
  'expenses', 'staff', 'leave_requests', 'payroll', 'notifications',
  'notification_broadcasts', 'fcm_tokens', 'exams', 'exam_seating',
  'question_bank', 'cbt_exams', 'cbt_sessions', 'curriculum_documents',
  'curriculum_items', 'pins', 'promotions', 'demo_requests', 'whatsapp_logs',
  'events',
];

// Users are handled separately (super_admin must NOT get schoolId)
const USERS_COLLECTION = 'users';

type CollectionStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

interface CollectionProgress {
  name: string;
  status: CollectionStatus;
  total: number;
  migrated: number;
  error?: string;
}

const DEFAULT_SCHOOL_ID = 'main';

async function migrateCollection(
  name: string,
  schoolId: string,
  onProgress: (migrated: number, total: number) => void
): Promise<{ migrated: number; total: number }> {
  const snap = await getDocs(collection(db, name));
  const docs = snap.docs.filter(d => !d.data().schoolId); // only backfill missing
  const total = snap.docs.length;
  let migrated = 0;

  // Batch writes in groups of 490 (Firestore limit is 500)
  const BATCH_SIZE = 490;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + BATCH_SIZE);
    for (const d of chunk) {
      batch.update(d.ref, { schoolId });
    }
    await batch.commit();
    migrated += chunk.length;
    onProgress(migrated, total);
  }

  return { migrated: docs.length, total };
}

async function migrateUsers(
  schoolId: string,
  onProgress: (migrated: number, total: number) => void
): Promise<{ migrated: number; total: number }> {
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  // Only stamp schoolId on users that are NOT super_admin and don't have a schoolId yet
  const docs = snap.docs.filter(d => {
    const data = d.data();
    return data.role !== 'super_admin' && !data.schoolId;
  });
  const total = snap.docs.length;
  let migrated = 0;

  const BATCH_SIZE = 490;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + BATCH_SIZE);
    for (const d of chunk) {
      batch.update(d.ref, { schoolId });
    }
    await batch.commit();
    migrated += chunk.length;
    onProgress(migrated, total);
  }

  return { migrated: docs.length, total };
}

async function seedSchoolDocument(schoolId: string): Promise<void> {
  const schoolRef = doc(db, 'schools', schoolId);
  const existing = await getDoc(schoolRef);
  if (existing.exists()) return; // already seeded

  // Fetch the existing school name from school_settings
  let schoolName = 'My School';
  let country = '';
  let timezone = '';
  try {
    const settingsSnap = await getDoc(doc(db, 'school_settings', schoolId));
    if (settingsSnap.exists()) {
      const d = settingsSnap.data();
      if (d.schoolName) schoolName = d.schoolName;
      if (d.country) country = d.country;
      if (d.timezone) timezone = d.timezone;
    }
  } catch { /* use defaults */ }

  await setDoc(schoolRef, {
    id: schoolId,
    name: schoolName,
    adminEmail: '',
    status: 'active',
    subscriptionPlan: 'pro',
    subscriptionExpiresAt: null,
    maxStudents: 0,
    maxStaff: 0,
    createdAt: serverTimestamp(),
    createdBy: 'migration',
    country,
    timezone,
    notes: 'Seeded by DataMigration tool from existing school data.',
  });
}

export default function DataMigration() {
  const [collections, setCollections] = useState<CollectionProgress[]>(
    COLLECTIONS_TO_MIGRATE.map(name => ({
      name, status: 'pending', total: 0, migrated: 0
    }))
  );
  const [usersProgress, setUsersProgress] = useState<CollectionProgress>({
    name: 'users', status: 'pending', total: 0, migrated: 0
  });
  const [schoolSeedStatus, setSchoolSeedStatus] = useState<'pending' | 'running' | 'done' | 'error'>('pending');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const schoolId = DEFAULT_SCHOOL_ID;

  const updateCollection = (name: string, patch: Partial<CollectionProgress>) => {
    setCollections(prev => prev.map(c => c.name === name ? { ...c, ...patch } : c));
  };

  const runMigration = async () => {
    setRunning(true);
    setDone(false);

    // Step 1: Seed the schools/{schoolId} document
    setSchoolSeedStatus('running');
    try {
      await seedSchoolDocument(schoolId);
      setSchoolSeedStatus('done');
    } catch (err) {
      setSchoolSeedStatus('error');
    }

    // Step 2: Migrate all domain collections
    for (const col of collections) {
      updateCollection(col.name, { status: 'running' });
      try {
        const { migrated, total } = await migrateCollection(
          col.name, schoolId,
          (m, t) => updateCollection(col.name, { migrated: m, total: t })
        );
        updateCollection(col.name, { status: 'done', migrated, total });
      } catch (err: any) {
        updateCollection(col.name, { status: 'error', error: err?.message || 'Unknown error' });
      }
    }

    // Step 3: Migrate users (handled separately — super_admin excluded)
    setUsersProgress(p => ({ ...p, status: 'running' }));
    try {
      const { migrated, total } = await migrateUsers(
        schoolId,
        (m, t) => setUsersProgress(p => ({ ...p, migrated: m, total: t }))
      );
      setUsersProgress(p => ({ ...p, status: 'done', migrated, total }));
    } catch (err: any) {
      setUsersProgress(p => ({ ...p, status: 'error', error: err?.message }));
    }

    setRunning(false);
    setDone(true);
  };

  const statusIcon = (status: CollectionStatus | 'running' | 'done' | 'error') => {
    if (status === 'running') return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === 'error') return <AlertCircle className="w-4 h-4 text-red-500" />;
    return <div className="w-4 h-4 rounded-full border-2 border-slate-300" />;
  };

  const totalMigrated = collections.reduce((a, c) => a + c.migrated, 0) + usersProgress.migrated;
  const totalDone = collections.filter(c => c.status === 'done').length + (usersProgress.status === 'done' ? 1 : 0);
  const totalCols = collections.length + 1;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-purple-600 p-2.5 rounded-xl">
          <Database className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Multi-Tenant Migration</h1>
          <p className="text-slate-500 text-sm">Backfills <code className="bg-slate-100 px-1 rounded">schoolId: "{schoolId}"</code> on all existing Firestore documents</p>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1.5">
        <p className="font-bold">Before running:</p>
        <ul className="list-disc list-inside space-y-1 text-amber-700">
          <li>This is a one-time operation — safe to run multiple times (idempotent).</li>
          <li>Only documents <strong>without</strong> a <code className="bg-amber-100 px-0.5 rounded">schoolId</code> field are updated.</li>
          <li><code className="bg-amber-100 px-0.5 rounded">super_admin</code> users are excluded from the users backfill.</li>
          <li>A <code className="bg-amber-100 px-0.5 rounded">schools/main</code> document is created if it doesn't exist.</li>
        </ul>
      </div>

      {/* Schools doc seed status */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
        {statusIcon(schoolSeedStatus)}
        <div className="flex-1">
          <p className="font-semibold text-slate-800 text-sm">Seed <code>schools/main</code> document</p>
          <p className="text-slate-500 text-xs">Creates the platform-level school record</p>
        </div>
        {schoolSeedStatus === 'done' && <span className="text-xs text-emerald-600 font-medium">Done</span>}
        {schoolSeedStatus === 'error' && <span className="text-xs text-red-600 font-medium">Error</span>}
      </div>

      {/* Overall progress */}
      {running && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Overall Progress</span>
            <span className="text-sm text-slate-500">{totalDone} / {totalCols} collections</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(totalDone / totalCols) * 100}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1.5">{totalMigrated.toLocaleString()} documents updated</p>
        </div>
      )}

      {/* Users row */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
        {statusIcon(usersProgress.status)}
        <div className="flex-1">
          <p className="font-semibold text-slate-800 text-sm">users collection</p>
          <p className="text-slate-500 text-xs">Skips super_admin accounts</p>
        </div>
        {usersProgress.status === 'done' && (
          <span className="text-xs text-emerald-600 font-medium">{usersProgress.migrated} updated</span>
        )}
        {usersProgress.status === 'error' && (
          <span className="text-xs text-red-600 font-medium">{usersProgress.error}</span>
        )}
      </div>

      {/* Collection list (collapsible) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => setExpanded(e => !e)}
        >
          <span>Domain collections ({collections.length})</span>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {expanded && (
          <div className="border-t border-slate-100 divide-y divide-slate-50">
            {collections.map(col => (
              <div key={col.name} className="flex items-center gap-3 px-4 py-2.5">
                {statusIcon(col.status)}
                <p className="flex-1 text-sm text-slate-700 font-mono">{col.name}</p>
                {col.status === 'running' && (
                  <span className="text-xs text-blue-500">{col.migrated} / {col.total}</span>
                )}
                {col.status === 'done' && (
                  <span className="text-xs text-emerald-600">{col.migrated} updated</span>
                )}
                {col.status === 'error' && (
                  <span className="text-xs text-red-500 truncate max-w-[200px]">{col.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action button */}
      {done ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          <div>
            <p className="font-bold text-emerald-800">Migration complete!</p>
            <p className="text-sm text-emerald-600">{totalMigrated.toLocaleString()} documents updated across {totalCols} collections.</p>
          </div>
        </div>
      ) : (
        <button
          onClick={runMigration}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-lg shadow-purple-200"
        >
          {running ? (
            <><Loader2 className="w-5 h-5 animate-spin" />Running migration…</>
          ) : (
            <><PlayCircle className="w-5 h-5" />Run Migration</>
          )}
        </button>
      )}
    </div>
  );
}
