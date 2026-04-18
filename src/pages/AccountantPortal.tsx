/**
 * Accountant overview — landing page at /accountant.
 * Slim summary card + deep-links into existing finance pages.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useSchool } from '../components/SchoolContext';
import { DollarSign, Receipt, FileText, ArrowRight, TrendingUp, AlertCircle } from 'lucide-react';

export default function AccountantPortal() {
  const { schoolId, schoolName } = useSchool();
  const [stats, setStats] = useState({ outstanding: 0, paidThisMonth: 0, expensesThisMonth: 0 });

  useEffect(() => {
    if (!schoolId) return;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const invUnsub = onSnapshot(
      query(collection(db, 'invoices'), where('schoolId', '==', schoolId)),
      snap => {
        const outstanding = snap.docs.reduce((sum, d) => {
          const v = d.data() as any;
          return v.status !== 'paid' ? sum + (Number(v.amount) || 0) : sum;
        }, 0);
        setStats(s => ({ ...s, outstanding }));
      },
      () => {},
    );

    const payUnsub = onSnapshot(
      query(collection(db, 'fee_payments'), where('schoolId', '==', schoolId)),
      snap => {
        const paid = snap.docs.reduce((sum, d) => {
          const v = d.data() as any;
          const ts = v.paidAt?.toDate?.() ?? null;
          return ts && ts >= monthStart ? sum + (Number(v.amount) || 0) : sum;
        }, 0);
        setStats(s => ({ ...s, paidThisMonth: paid }));
      },
      () => {},
    );

    const expUnsub = onSnapshot(
      query(collection(db, 'expenses'), where('schoolId', '==', schoolId)),
      snap => {
        const exp = snap.docs.reduce((sum, d) => {
          const v = d.data() as any;
          const ts = v.date ? new Date(v.date) : null;
          return ts && ts >= monthStart ? sum + (Number(v.amount) || 0) : sum;
        }, 0);
        setStats(s => ({ ...s, expensesThisMonth: exp }));
      },
      () => {},
    );

    return () => { invUnsub(); payUnsub(); expUnsub(); };
  }, [schoolId]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Accountant</p>
        <h1 className="mt-1 text-3xl font-extrabold text-slate-900">Finance Overview</h1>
        <p className="mt-1 text-sm text-slate-500">{schoolName}</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<AlertCircle className="w-5 h-5" />}
          label="Outstanding fees"
          value={`₦${stats.outstanding.toLocaleString()}`}
          tone="rose"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Collected this month"
          value={`₦${stats.paidThisMonth.toLocaleString()}`}
          tone="emerald"
        />
        <StatCard
          icon={<Receipt className="w-5 h-5" />}
          label="Expenses this month"
          value={`₦${stats.expensesThisMonth.toLocaleString()}`}
          tone="indigo"
        />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <QuickLink to="/admin/finance" icon={<Receipt className="w-5 h-5" />} title="Invoices & Payments" desc="Issue invoices, record payments, AI-driven reminders." />
        <QuickLink to="/admin/payroll" icon={<DollarSign className="w-5 h-5" />} title="Payroll" desc="Process monthly salaries with PAYE/flat tax." />
        <QuickLink to="/admin/analytics" icon={<FileText className="w-5 h-5" />} title="Reports" desc="Cash-flow, fee defaulters, expense breakdowns." />
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'rose' | 'emerald' | 'indigo' }) {
  const colors = {
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  }[tone];
  return (
    <div className={`rounded-2xl border p-5 ${colors}`}>
      <div className="flex items-center gap-2 opacity-80">{icon}<span className="text-xs font-bold uppercase tracking-wider">{label}</span></div>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function QuickLink({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link to={to} className="group block p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">{icon}</div>
        <div className="flex-1">
          <p className="font-bold text-slate-900">{title}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
      </div>
      <p className="mt-3 text-xs text-slate-500">{desc}</p>
    </Link>
  );
}
