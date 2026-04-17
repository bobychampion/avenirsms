import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Staff, Payroll } from '../types';
import { computePayroll } from '../services/firestoreService';
import { generatePayrollSummary } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { CreditCard, Printer, Sparkles, CheckCircle, RefreshCw, X } from 'lucide-react';
import { useSchool } from '../components/SchoolContext';
import { useSchoolId } from '../hooks/useSchoolId';
import { formatCurrency } from '../utils/formatCurrency';

export default function PayrollManagement() {
  const schoolId = useSchoolId();
  const { locale, currency, taxModel, taxFlatRate } = useSchool();
  const fmt = (amount: number) => formatCurrency(amount, locale, currency);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [generating, setGenerating] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [printSlip, setPrintSlip] = useState<Payroll | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    const unsub1 = onSnapshot(query(collection(db, 'staff'), where('schoolId', '==', schoolId!), orderBy('staffName')), snap => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff)));
    });
    const unsub2 = onSnapshot(query(collection(db, 'payroll'), where('schoolId', '==', schoolId!), orderBy('generatedAt', 'desc')), snap => {
      setPayrolls(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payroll)));
    });
    return () => { unsub1(); unsub2(); };
  }, [schoolId]);

  const monthPayrolls = payrolls.filter(p => p.month === selectedMonth);

  const generatePayroll = async () => {
    if (staff.length === 0) { alert('No staff records found.'); return; }
    setGenerating(true);
    // remove existing for this month
    const existingQ = query(collection(db, 'payroll'), where('schoolId', '==', schoolId!), where('month', '==', selectedMonth));
    const existing = await getDocs(existingQ);
    await Promise.all(existing.docs.map(d => deleteDoc(d.ref)));
    // create new
    await Promise.all(staff.map(s => {
      const computed = computePayroll(s.basicSalary || 0, s.allowances || 0, taxModel, taxFlatRate);
      const record: Omit<Payroll, 'id'> = {
        staffId: s.id!,
        staffName: s.staffName,
        month: selectedMonth,
        basicSalary: s.basicSalary || 0,
        allowances: s.allowances || 0,
        grossPay: computed.grossPay,
        pension: computed.pension,
        paye: computed.paye,
        netPay: computed.netPay,
        status: 'draft',
        generatedAt: serverTimestamp(),
        schoolId: schoolId ?? undefined,
      };
      return addDoc(collection(db, 'payroll'), record);
    }));
    setGenerating(false);
  };

  const approveAll = async () => {
    await Promise.all(monthPayrolls.map(p => updateDoc(doc(db, 'payroll', p.id!), { status: 'approved', updatedAt: serverTimestamp() })));
  };

  const markPaid = async (id: string) => {
    await updateDoc(doc(db, 'payroll', id), { status: 'paid', updatedAt: serverTimestamp() });
  };

  const generateAI = async () => {
    if (monthPayrolls.length === 0) return;
    setLoadingAi(true);
    const total = monthPayrolls.reduce((a, p) => ({ gross: a.gross + p.grossPay, net: a.net + p.netPay, pension: a.pension + p.pension, paye: a.paye + p.paye }), { gross: 0, net: 0, pension: 0, paye: 0 });
    const summary = await generatePayrollSummary(selectedMonth, monthPayrolls.length, total.gross, total.net, total.pension, total.paye).catch(() => null);
    setAiSummary(summary || 'Could not generate summary.');
    setLoadingAi(false);
  };

  const totals = monthPayrolls.reduce((a, p) => ({
    gross: a.gross + p.grossPay, pension: a.pension + p.pension,
    paye: a.paye + p.paye, net: a.net + p.netPay
  }), { gross: 0, pension: 0, paye: 0, net: 0 });

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-indigo-600" />
          Payroll Management
        </h1>
        <p className="text-slate-500 mt-1 text-sm">Generate monthly payroll with Nigerian statutory deductions (PAYE + 8% Pension).</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Month</label>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <button onClick={generatePayroll} disabled={generating || staff.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm disabled:opacity-60">
            {generating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Generate Payroll
          </button>
          {monthPayrolls.length > 0 && (
            <>
              <button onClick={approveAll} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all text-sm">
                <CheckCircle className="w-4 h-4" /> Approve All
              </button>
              <button onClick={generateAI} disabled={loadingAi}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-all text-sm disabled:opacity-60">
                {loadingAi ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
                AI Summary
              </button>
            </>
          )}
        </div>

        {aiSummary && (
          <div className="mt-4 p-4 bg-violet-50 rounded-xl border border-violet-200">
            <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-1.5">AI Payroll Summary</p>
            <p className="text-sm text-slate-700 leading-relaxed">{aiSummary}</p>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {monthPayrolls.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Gross Pay', value: totals.gross, color: 'from-indigo-500 to-indigo-600' },
            { label: 'Pension (8%)', value: totals.pension, color: 'from-amber-500 to-amber-600' },
            { label: 'PAYE Tax', value: totals.paye, color: 'from-rose-500 to-rose-600' },
            { label: 'Net Pay', value: totals.net, color: 'from-emerald-500 to-emerald-600' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs text-slate-500 font-medium mb-1">{card.label}</p>
              <p className="text-lg font-bold text-slate-900">{fmt(card.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Payroll Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Payroll — {selectedMonth} ({monthPayrolls.length} staff)</h2>
        </div>
        {monthPayrolls.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No payroll generated for {selectedMonth}. Click "Generate Payroll".</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">Staff Name</th>
                  <th className="px-4 py-3 text-right">Basic</th>
                  <th className="px-4 py-3 text-right">Allowances</th>
                  <th className="px-4 py-3 text-right">Gross</th>
                  <th className="px-4 py-3 text-right">Pension</th>
                  <th className="px-4 py-3 text-right">PAYE</th>
                  <th className="px-4 py-3 text-right">Net Pay</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthPayrolls.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-800">{p.staffName}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{fmt(p.basicSalary)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{fmt(p.allowances)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(p.grossPay)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{fmt(p.pension)}</td>
                    <td className="px-4 py-3 text-right text-rose-600">{fmt(p.paye)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmt(p.netPay)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full capitalize ${p.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : p.status === 'approved' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setPrintSlip(p)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {p.status === 'approved' && (
                          <button onClick={() => markPaid(p.id!)} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors">
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Print Pay Slip Modal */}
      <AnimatePresence>
        {printSlip && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setPrintSlip(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-6 print:hidden">
                <h2 className="font-bold text-slate-900">Pay Slip</h2>
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-sm font-bold rounded-xl hover:bg-slate-900">
                    <Printer className="w-3.5 h-3.5" /> Print
                  </button>
                  <button onClick={() => setPrintSlip(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="border-2 border-slate-200 rounded-xl p-5">
                <div className="text-center mb-5 pb-4 border-b border-slate-200">
                  <h3 className="font-bold text-slate-900 text-lg">Avenir Secondary School</h3>
                  <p className="text-slate-500 text-sm">PAY SLIP — {printSlip.month}</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Staff Name:</span><span className="font-bold text-slate-900">{printSlip.staffName}</span></div>
                  <div className="pt-2 mt-2 border-t border-slate-100 space-y-2">
                    <div className="flex justify-between"><span className="text-slate-600">Basic Salary</span><span>{fmt(printSlip.basicSalary)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">Allowances</span><span>{fmt(printSlip.allowances)}</span></div>
                    <div className="flex justify-between font-semibold border-t border-slate-100 pt-2"><span>Gross Pay</span><span>{fmt(printSlip.grossPay)}</span></div>
                  </div>
                  <div className="pt-2 mt-1 border-t border-slate-100 space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Deductions</p>
                    <div className="flex justify-between text-rose-600"><span>Pension (8%)</span><span>-{fmt(printSlip.pension)}</span></div>
                    <div className="flex justify-between text-rose-600"><span>PAYE Tax</span><span>-{fmt(printSlip.paye)}</span></div>
                  </div>
                  <div className="flex justify-between font-bold text-lg text-emerald-700 border-t-2 border-slate-200 pt-3 mt-2">
                    <span>NET PAY</span><span>{fmt(printSlip.netPay)}</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 text-center mt-4 pt-3 border-t border-slate-100">
                  Status: <span className="capitalize font-semibold">{printSlip.status}</span> · Generated by Avenir SIS
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
