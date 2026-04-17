import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, doc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { Invoice, FeePayment, Expense, Student, TERMS, CURRENT_SESSION } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '../components/Toast';
import { generateFeeReminderDraft } from '../services/geminiService';
import { useClassSelectOptions, useSchool } from '../components/SchoolContext';
import { useSchoolId } from '../hooks/useSchoolId';
import { formatCurrency } from '../utils/formatCurrency';
import { 
  DollarSign, Receipt, TrendingUp, TrendingDown, Plus, 
  Search, Filter, Loader2, Download, PieChart, 
  CreditCard, Wallet, Calendar, User, FileText, CheckCircle2, AlertCircle, ArrowLeft, Printer,
  Sparkles, X, Copy, RefreshCw, Layers
} from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { DOCUMENT_TITLE_DEFAULT } from '../constants/appMeta';

export default function FinancialManagement() {
  const { profile } = useAuth();
  const classSelectOptions = useClassSelectOptions();
  const { locale, currency } = useSchool();
  const schoolId = useSchoolId();
  const fmt = (amount: number) => formatCurrency(amount, locale, currency);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'payments' | 'expenses'>('overview');
  const [markingOverdue, setMarkingOverdue] = useState(false);
  
  // Modals
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [receiptInvoice, setReceiptInvoice] = useState<Invoice | null>(null);

  // Fee Schedule (bulk invoice creation)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<{ description: string; amount: number; targetClass: string; term: '1st Term' | '2nd Term' | '3rd Term'; session: string; dueDate: string }>({
    description: 'School Fees',
    amount: 0,
    targetClass: '',
    term: TERMS[0],
    session: CURRENT_SESSION,
    dueDate: '',
  });
  const [creatingSchedule, setCreatingSchedule] = useState(false);

  // AI Fee Reminder
  const [reminderInvoice, setReminderInvoice] = useState<Invoice | null>(null);
  const [reminderDraft, setReminderDraft] = useState('');
  const [reminderLoading, setReminderLoading] = useState(false);

  // Form States
  const [invoiceForm, setInvoiceForm] = useState<Partial<Invoice>>({
    studentId: '',
    amount: 0,
    description: 'School Fees',
    dueDate: '',
    term: '1st Term',
    session: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
    status: 'pending'
  });

  const [paymentForm, setPaymentForm] = useState<Partial<FeePayment>>({
    invoiceId: '',
    studentId: '',
    amount: 0,
    paymentMethod: 'bank_transfer',
    date: new Date().toISOString().split('T')[0]
  });

  const [expenseForm, setExpenseForm] = useState<Partial<Expense>>({
    category: 'supplies',
    amount: 0,
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (!schoolId) return;
    const unsubInvoices = onSnapshot(query(collection(db, 'invoices'), where('schoolId', '==', schoolId!), orderBy('createdAt', 'desc')), (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
    });

    const unsubPayments = onSnapshot(query(collection(db, 'fee_payments'), where('schoolId', '==', schoolId!), orderBy('date', 'desc')), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeePayment)));
    });

    const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), where('schoolId', '==', schoolId!), orderBy('date', 'desc')), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    });

    const unsubStudents = onSnapshot(query(collection(db, 'students'), where('schoolId', '==', schoolId!)), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
      setLoading(false);
    });

    return () => {
      unsubInvoices();
      unsubPayments();
      unsubExpenses();
      unsubStudents();
    };
  }, [schoolId]);

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const outstandingFees = invoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + i.amount, 0);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === invoiceForm.studentId);
    if (!student) return;
    const tid = toast.loading('Creating invoice…');
    try {
      await addDoc(collection(db, 'invoices'), {
        ...invoiceForm,
        studentName: student.studentName,
        schoolId,
        createdAt: serverTimestamp()
      });
      toast.success('Invoice created!', { id: tid });
      setIsInvoiceModalOpen(false);
      setInvoiceForm({ ...invoiceForm, studentId: '', amount: 0 });
    } catch (error) {
      toast.error('Failed to create invoice', { id: tid });
      handleFirestoreError(error, OperationType.WRITE, 'invoices');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const invoice = invoices.find(i => i.id === paymentForm.invoiceId);
    if (!invoice) return;
    const tid = toast.loading('Recording payment…');
    try {
      await addDoc(collection(db, 'fee_payments'), {
        ...paymentForm,
        studentId: invoice.studentId,
        recordedBy: profile?.displayName || 'Admin',
        schoolId,
      });
      await updateDoc(doc(db, 'invoices', invoice.id!), { status: 'paid' });
      toast.success('Payment recorded!', { id: tid });
      setIsPaymentModalOpen(false);
      setPaymentForm({ ...paymentForm, invoiceId: '', amount: 0 });
    } catch (error) {
      toast.error('Failed to record payment', { id: tid });
      handleFirestoreError(error, OperationType.WRITE, 'fee_payments');
    }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const tid = toast.loading('Recording expense…');
    try {
      await addDoc(collection(db, 'expenses'), {
        ...expenseForm,
        recordedBy: profile?.displayName || 'Admin',
        schoolId,
      });
      toast.success('Expense recorded!', { id: tid });
      setIsExpenseModalOpen(false);
      setExpenseForm({ ...expenseForm, amount: 0, description: '' });
    } catch (error) {
      toast.error('Failed to record expense', { id: tid });
      handleFirestoreError(error, OperationType.WRITE, 'expenses');
    }
  };

  // Auto-mark overdue invoices where dueDate < today and status is still 'pending'
  const markOverdueInvoices = async () => {
    const today = new Date().toISOString().split('T')[0];
    const overdueList = invoices.filter(i => i.status === 'pending' && i.dueDate && i.dueDate < today);
    if (overdueList.length === 0) { toast('No overdue invoices found.'); return; }
    setMarkingOverdue(true);
    const batch = writeBatch(db);
    overdueList.forEach(inv => {
      batch.update(doc(db, 'invoices', inv.id!), { status: 'overdue' });
    });
    const tid = toast.loading(`Marking ${overdueList.length} invoice(s) as overdue…`);
    try {
      await batch.commit();
      toast.success(`${overdueList.length} invoice(s) marked overdue!`, { id: tid });
    } catch (e: any) {
      toast.error('Failed to update invoices', { id: tid });
    } finally {
      setMarkingOverdue(false);
    }
  };

  // Batch-create invoices for all students in a class
  const handleCreateFeeSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.targetClass || !scheduleForm.amount || !scheduleForm.dueDate) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setCreatingSchedule(true);
    const tid = toast.loading('Creating invoices for class…');
    try {
      const classStudents = students.filter(s => s.currentClass === scheduleForm.targetClass);
      if (classStudents.length === 0) {
        toast.error('No students found in that class.', { id: tid });
        setCreatingSchedule(false);
        return;
      }
      const batch: Promise<any>[] = classStudents.map(s =>
        addDoc(collection(db, 'invoices'), {
          studentId: s.id,
          studentName: s.studentName,
          description: scheduleForm.description,
          amount: Number(scheduleForm.amount),
          term: scheduleForm.term,
          session: scheduleForm.session,
          dueDate: scheduleForm.dueDate,
          status: 'pending',
          schoolId,
          createdAt: serverTimestamp(),
        })
      );
      await Promise.all(batch);
      toast.success(`Created ${classStudents.length} invoice(s) for ${scheduleForm.targetClass}`, { id: tid });
      setIsScheduleModalOpen(false);
      setScheduleForm({ ...scheduleForm, targetClass: '', amount: 0, dueDate: '' });
    } catch (err: any) {
      toast.error('Failed to create invoices: ' + err.message, { id: tid });
    } finally {
      setCreatingSchedule(false);
    }
  };

  // Generate AI reminder draft for an unpaid/overdue invoice
  const handleGenerateReminder = async (invoice: Invoice) => {
    setReminderInvoice(invoice);
    setReminderDraft('');
    setReminderLoading(true);
    const tid = toast.loading('Drafting reminder with AI…');
    try {
      const student = students.find(s => s.id === invoice.studentId);
      const daysOverdue = invoice.dueDate
        ? Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86400000))
        : 0;
      const draft = await generateFeeReminderDraft(
        invoice.studentName,
        student?.guardianName || 'Parent/Guardian',
        invoice.amount,
        invoice.description,
        invoice.dueDate || 'N/A',
        daysOverdue
      );
      setReminderDraft(draft || '');
      toast.success('Reminder drafted!', { id: tid });
    } catch (err: any) {
      toast.error('Failed to generate reminder', { id: tid });
      setReminderInvoice(null);
    } finally {
      setReminderLoading(false);
    }
  };

  const chartData = [
    { name: 'Revenue', value: totalRevenue, color: '#4f46e5' },
    { name: 'Expenses', value: totalExpenses, color: '#e11d48' },
    { name: 'Outstanding', value: outstandingFees, color: '#f59e0b' }
  ];

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <Link to="/admin" className="text-indigo-600 hover:text-indigo-700 font-bold text-sm flex items-center">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>
      </div>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Financial Management</h1>
          <p className="text-slate-500 mt-1">Track fees, manage expenses, and view financial health.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setIsInvoiceModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center">
            <Plus className="w-4 h-4 mr-2" />
            New Invoice
          </button>
          <button onClick={() => setIsScheduleModalOpen(true)} className="px-4 py-2 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all flex items-center">
            <Layers className="w-4 h-4 mr-2 text-indigo-500" />
            Fee Schedule
          </button>
          <button onClick={() => setIsExpenseModalOpen(true)} className="px-4 py-2 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all flex items-center">
            <Plus className="w-4 h-4 mr-2" />
            Record Expense
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-50 rounded-2xl">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Total Revenue</span>
          </div>
          <h3 className="text-2xl font-bold text-slate-900">{fmt(totalRevenue)}</h3>
          <p className="text-slate-400 text-xs mt-1">All time fee payments</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-rose-50 rounded-2xl">
              <TrendingDown className="w-6 h-6 text-rose-600" />
            </div>
            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full">Total Expenses</span>
          </div>
          <h3 className="text-2xl font-bold text-slate-900">{fmt(totalExpenses)}</h3>
          <p className="text-slate-400 text-xs mt-1">All time school spending</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-amber-50 rounded-2xl">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Outstanding</span>
          </div>
          <h3 className="text-2xl font-bold text-slate-900">{fmt(outstandingFees)}</h3>
          <p className="text-slate-400 text-xs mt-1">Unpaid student invoices</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl mb-8 w-fit">
        <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Overview</button>
        <button onClick={() => setActiveTab('invoices')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'invoices' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Invoices</button>
        <button onClick={() => setActiveTab('payments')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'payments' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Payments</button>
        <button onClick={() => setActiveTab('expenses')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'expenses' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Expenses</button>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
              <PieChart className="w-5 h-5 mr-3 text-indigo-600" />
              Financial Distribution
            </h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </RePieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
              <TrendingUp className="w-5 h-5 mr-3 text-emerald-600" />
              Recent Activity
            </h3>
            <div className="space-y-4">
              {payments.slice(0, 5).map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <div className="flex items-center">
                    <div className="p-2 bg-emerald-100 rounded-lg mr-3">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">Fee Payment</p>
                      <p className="text-xs text-slate-500">{p.date}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-emerald-600">+{fmt(p.amount)}</p>
                </div>
              ))}
              {expenses.slice(0, 5).map(e => (
                <div key={e.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <div className="flex items-center">
                    <div className="p-2 bg-rose-100 rounded-lg mr-3">
                      <TrendingDown className="w-4 h-4 text-rose-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{e.category}</p>
                      <p className="text-xs text-slate-500">{e.date}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-rose-600">-{fmt(e.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="font-bold text-slate-900 text-sm">
              {invoices.length} invoices &nbsp;·&nbsp;
              <span className="text-amber-600">{invoices.filter(i => i.status === 'pending').length} pending</span>
              &nbsp;·&nbsp;
              <span className="text-rose-600">{invoices.filter(i => i.status === 'overdue').length} overdue</span>
            </p>
            <button
              onClick={markOverdueInvoices}
              disabled={markingOverdue}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-all disabled:opacity-50"
            >
              {markingOverdue ? <span className="w-3 h-3 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
              Mark Overdue
            </button>
          </div>
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Student</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Due Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map(invoice => (
                <tr key={invoice.id}>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-900">{invoice.studentName}</p>
                    <p className="text-xs text-slate-500">{invoice.term} {invoice.session}</p>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">{fmt(invoice.amount)}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{invoice.dueDate}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                      invoice.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {invoice.status !== 'paid' && (
                        <>
                          <button 
                            onClick={() => {
                              setPaymentForm({ ...paymentForm, invoiceId: invoice.id, amount: invoice.amount });
                              setIsPaymentModalOpen(true);
                            }}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                          >
                            Record Payment
                          </button>
                          <button
                            onClick={() => handleGenerateReminder(invoice)}
                            title="Generate AI payment reminder"
                            className="flex items-center gap-1 text-xs font-bold text-violet-600 hover:text-violet-700"
                          >
                            <Sparkles className="w-3 h-3" /> Remind
                          </button>
                        </>
                      )}
                      {invoice.status === 'paid' && (
                        <button
                          onClick={() => setReceiptInvoice(invoice)}
                          className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                        >
                          <Printer className="w-3 h-3" /> Receipt
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

      {activeTab === 'payments' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Method</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Reference</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map(payment => (
                <tr key={payment.id}>
                  <td className="px-6 py-4 text-sm font-medium">{payment.date}</td>
                  <td className="px-6 py-4 text-sm font-bold text-emerald-600">{fmt(payment.amount)}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 capitalize">{payment.paymentMethod.replace('_', ' ')}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{payment.reference || 'N/A'}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{payment.recordedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Description</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map(expense => (
                <tr key={expense.id}>
                  <td className="px-6 py-4 text-sm font-medium">{expense.date}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600 uppercase">{expense.category}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{expense.description}</td>
                  <td className="px-6 py-4 text-sm font-bold text-rose-600">{fmt(expense.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Modal */}
      <AnimatePresence>
        {isInvoiceModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsInvoiceModalOpen(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg relative z-10 p-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Create New Invoice</h3>
              <form onSubmit={handleCreateInvoice} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Student</label>
                  <select required value={invoiceForm.studentId} onChange={e => setInvoiceForm({...invoiceForm, studentId: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none">
                    <option value="">Select Student...</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.studentName} ({s.currentClass})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Amount</label>
                    <input required type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm({...invoiceForm, amount: Number(e.target.value)})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Due Date</label>
                    <input required type="date" value={invoiceForm.dueDate} onChange={e => setInvoiceForm({...invoiceForm, dueDate: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Term</label>
                    <select value={invoiceForm.term} onChange={e => setInvoiceForm({...invoiceForm, term: e.target.value as any})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none">
                      <option value="1st Term">1st Term</option>
                      <option value="2nd Term">2nd Term</option>
                      <option value="3rd Term">3rd Term</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Session</label>
                    <input type="text" value={invoiceForm.session} onChange={e => setInvoiceForm({...invoiceForm, session: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Description</label>
                  <input type="text" value={invoiceForm.description} onChange={e => setInvoiceForm({...invoiceForm, description: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" />
                </div>
                <div className="pt-4 flex gap-4">
                  <button type="button" onClick={() => setIsInvoiceModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl">Cancel</button>
                  <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl">Generate Invoice</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsPaymentModalOpen(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg relative z-10 p-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Record Fee Payment</h3>
              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Amount Paid</label>
                  <input required type="number" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: Number(e.target.value)})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Payment Method</label>
                  <select value={paymentForm.paymentMethod} onChange={e => setPaymentForm({...paymentForm, paymentMethod: e.target.value as any})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none">
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Reference / Receipt #</label>
                  <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm({...paymentForm, reference: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Payment Date</label>
                  <input required type="date" value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" />
                </div>
                <div className="pt-4 flex gap-4">
                  <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl">Cancel</button>
                  <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl">Confirm Payment</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Expense Modal */}
      <AnimatePresence>
        {isExpenseModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsExpenseModalOpen(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg relative z-10 p-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Record School Expense</h3>
              <form onSubmit={handleRecordExpense} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Category</label>
                  <select value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value as any})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none">
                    <option value="salary">Salaries</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="supplies">Supplies</option>
                    <option value="utility">Utilities</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Amount</label>
                  <input required type="number" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: Number(e.target.value)})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Description</label>
                  <textarea required value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none resize-none" rows={3} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Date</label>
                  <input required type="date" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" />
                </div>
                <div className="pt-4 flex gap-4">
                  <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl">Cancel</button>
                  <button type="submit" className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl">Record Expense</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Receipt Print Modal */}
      <AnimatePresence>
        {receiptInvoice && (() => {
          const matchedPayment = payments.find(p => p.invoiceId === receiptInvoice.id);
          const student = students.find(s => s.id === receiptInvoice.studentId);
          const receiptRows = [
            { label: 'Receipt No.', value: `RCP-${receiptInvoice.id?.slice(0, 8).toUpperCase()}` },
            { label: 'Student Name', value: receiptInvoice.studentName },
            { label: 'Class', value: student?.currentClass || '—' },
            { label: 'Description', value: receiptInvoice.description },
            { label: 'Term / Session', value: `${receiptInvoice.term} · ${receiptInvoice.session}` },
            { label: 'Payment Date', value: matchedPayment?.date || '—' },
            { label: 'Payment Method', value: matchedPayment?.paymentMethod?.replace('_', ' ') || '—' },
            { label: 'Reference', value: matchedPayment?.reference || 'N/A' },
            { label: 'Recorded By', value: matchedPayment?.recordedBy || '—' },
            { label: 'Status', value: 'PAID IN FULL' },
          ];
          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <style>{`@media print { body > *:not(#receipt-print-root) { display: none !important; } #receipt-print-root { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; } }`}</style>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setReceiptInvoice(null)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
              <motion.div id="receipt-print-root" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-sm relative z-10">
                {/* Receipt content */}
                <div className="p-8">
                  {/* Header */}
                  <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Receipt className="w-7 h-7 text-white" />
                    </div>
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-wider">Official Receipt</h2>
                    <p className="text-xs text-slate-400 font-medium mt-1">Avenir School Management System</p>
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-700">Payment Confirmed</span>
                    </div>
                  </div>

                  {/* Amount highlight */}
                  <div className="mb-5 p-5 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl text-center">
                    <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">Amount Paid</p>
                    <p className="text-4xl font-black text-white">{fmt(receiptInvoice.amount)}</p>
                  </div>

                  {/* Details */}
                  <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                    {receiptRows.map(row => (
                      <div key={row.label} className="flex justify-between items-center px-4 py-2.5">
                        <span className="text-xs text-slate-500 font-medium">{row.label}</span>
                        <span className={`text-xs font-bold capitalize ${row.label === 'Status' ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="mt-5 pt-4 border-t border-dashed border-slate-200 text-center space-y-1">
                    <p className="text-[10px] text-slate-400 font-medium">
                      Printed: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-[10px] text-slate-400">This receipt is computer-generated and valid without a signature.</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-2">Thank you for your payment.</p>
                  </div>
                </div>

                <div className="px-8 pb-6 flex gap-3 print:hidden">
                  <button onClick={() => setReceiptInvoice(null)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-200 transition-all">
                    Close
                  </button>
                  <button
                    onClick={() => {
                      document.title = `Receipt-${receiptInvoice.studentName}-${receiptInvoice.term}`;
                      window.print();
                      document.title = DOCUMENT_TITLE_DEFAULT;
                    }}
                    className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                    <Printer className="w-4 h-4" /> Print Receipt
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* ── FEE SCHEDULE MODAL ── */}
      <AnimatePresence>
        {isScheduleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsScheduleModalOpen(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-md">
              <div className="p-7">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                      <Layers className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900">Fee Schedule</h2>
                      <p className="text-xs text-slate-400">Create invoices for an entire class at once</p>
                    </div>
                  </div>
                  <button onClick={() => setIsScheduleModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                    <X className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
                <form onSubmit={handleCreateFeeSchedule} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Fee Description</label>
                    <input type="text" value={scheduleForm.description}
                      onChange={e => setScheduleForm(p => ({ ...p, description: e.target.value }))}
                      required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="e.g. School Fees, PTA Levy…" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Amount</label>
                      <input type="number" value={scheduleForm.amount || ''}
                        onChange={e => setScheduleForm(p => ({ ...p, amount: Number(e.target.value) }))}
                        required min={1} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Due Date</label>
                      <input type="date" value={scheduleForm.dueDate}
                        onChange={e => setScheduleForm(p => ({ ...p, dueDate: e.target.value }))}
                        required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Target Class</label>
                    <select value={scheduleForm.targetClass}
                      onChange={e => setScheduleForm(p => ({ ...p, targetClass: e.target.value }))}
                      required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white">
                      <option value="">Select class…</option>
                      {classSelectOptions.map(o => <option key={o.key} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Term</label>
                      <select value={scheduleForm.term} onChange={e => setScheduleForm(p => ({ ...p, term: e.target.value as '1st Term' | '2nd Term' | '3rd Term' }))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white">
                        {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Session</label>
                      <input type="text" value={scheduleForm.session}
                        onChange={e => setScheduleForm(p => ({ ...p, session: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                    </div>
                  </div>

                  {scheduleForm.targetClass && (
                    <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-sm text-indigo-700 font-medium">
                      This will create <strong>{students.filter(s => s.currentClass === scheduleForm.targetClass).length}</strong> invoice(s) for all students in <strong>{scheduleForm.targetClass}</strong>.
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setIsScheduleModalOpen(false)}
                      className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-200 transition-all">
                      Cancel
                    </button>
                    <button type="submit" disabled={creatingSchedule}
                      className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                      {creatingSchedule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                      Create All Invoices
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── AI FEE REMINDER MODAL ── */}
      <AnimatePresence>
        {reminderInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setReminderInvoice(null); setReminderDraft(''); }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-7">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900">AI Fee Reminder</h2>
                      <p className="text-xs text-slate-400">{reminderInvoice.studentName} · {fmt(reminderInvoice.amount)}</p>
                    </div>
                  </div>
                  <button onClick={() => { setReminderInvoice(null); setReminderDraft(''); }}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                    <X className="w-4 h-4 text-slate-600" />
                  </button>
                </div>

                {reminderLoading ? (
                  <div className="py-16 flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin" />
                    <p className="text-slate-500 text-sm font-medium">Drafting reminder letter…</p>
                  </div>
                ) : reminderDraft ? (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Generated Reminder Letter</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleGenerateReminder(reminderInvoice)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                          <RefreshCw className="w-3 h-3" /> Regenerate
                        </button>
                        <button onClick={() => { navigator.clipboard.writeText(reminderDraft); toast.success('Copied!'); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={reminderDraft}
                      onChange={e => setReminderDraft(e.target.value)}
                      rows={12}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 leading-relaxed focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-2 text-center">You can edit the draft above before copying or sending.</p>
                  </>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
