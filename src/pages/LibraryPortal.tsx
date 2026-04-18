/**
 * Librarian Portal landing — book catalog stub + circulation/fines placeholders.
 *
 * Phase 3 MVP: scaffolds the dashboard. Full catalog CRUD and issue/return
 * flows ship in a follow-up release. The data model intentionally stays
 * loose (any docs in `library_books` and `library_circulation`) so admins
 * can start using it immediately and we can formalize types later.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useSchool } from '../components/SchoolContext';
import { BookOpen, RotateCcw, AlertCircle, ArrowRight, Library } from 'lucide-react';

export default function LibraryPortal() {
  const { schoolId, schoolName } = useSchool();
  const [stats, setStats] = useState({ totalBooks: 0, checkedOut: 0, overdue: 0 });

  useEffect(() => {
    if (!schoolId) return;
    const bUnsub = onSnapshot(
      query(collection(db, 'library_books'), where('schoolId', '==', schoolId)),
      snap => setStats(s => ({ ...s, totalBooks: snap.size })),
      () => {},
    );
    const cUnsub = onSnapshot(
      query(collection(db, 'library_circulation'), where('schoolId', '==', schoolId), where('status', '==', 'issued')),
      snap => {
        const today = new Date();
        const overdue = snap.docs.filter(d => {
          const v = d.data() as any;
          const due = v.dueDate ? new Date(v.dueDate) : null;
          return due && due < today;
        }).length;
        setStats(s => ({ ...s, checkedOut: snap.size, overdue }));
      },
      () => {},
    );
    return () => { bUnsub(); cUnsub(); };
  }, [schoolId]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Library</p>
        <h1 className="mt-1 text-3xl font-extrabold text-slate-900">Library Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">{schoolName}</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={<Library className="w-5 h-5" />} label="Books in Catalog" value={stats.totalBooks} tone="indigo" />
        <StatCard icon={<RotateCcw className="w-5 h-5" />} label="Currently Issued" value={stats.checkedOut} tone="emerald" />
        <StatCard icon={<AlertCircle className="w-5 h-5" />} label="Overdue Returns" value={stats.overdue} tone="rose" />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <QuickLink to="/library/catalog" icon={<BookOpen className="w-5 h-5" />} title="Catalog" desc="Browse, add and edit books in the library collection." />
        <QuickLink to="/library/circulation" icon={<RotateCcw className="w-5 h-5" />} title="Issue / Return" desc="Check books in and out to students and staff." />
        <QuickLink to="/library/fines" icon={<AlertCircle className="w-5 h-5" />} title="Fines" desc="Track and waive overdue and lost-book fines." />
      </section>

      <div className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        🚧 Catalog CRUD and circulation flows ship in a follow-up release.
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'indigo' | 'emerald' | 'rose' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
  }[tone];
  return (
    <div className={`rounded-2xl border p-5 ${colors}`}>
      <div className="flex items-center gap-2 opacity-80">{icon}<span className="text-xs font-bold uppercase tracking-wider">{label}</span></div>
      <p className="mt-2 text-3xl font-extrabold">{value}</p>
    </div>
  );
}

function QuickLink({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link to={to} className="group block p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">{icon}</div>
        <div className="flex-1">
          <p className="font-bold text-slate-900 text-sm">{title}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
      </div>
      <p className="mt-3 text-xs text-slate-500">{desc}</p>
    </Link>
  );
}
