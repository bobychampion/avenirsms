import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, doc, updateDoc, where } from 'firebase/firestore';
import { Invoice, FeePayment, Expense, Student, SCHOOL_CLASSES } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DollarSign, Receipt, TrendingUp, TrendingDown, Plus, 
  Search, Filter, Loader2, Download, PieChart, 
  CreditCard, Wallet, Calendar, User, FileText, CheckCircle2, AlertCircle, ArrowLeft
} from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export default function FinancialManagement() {
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'payments' | 'expenses'>('overview');
  
  // Modals
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

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
    const unsubInvoices = onSnapshot(query(collection(db, 'invoices'), orderBy('createdAt', 'desc')), (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
    });

    const unsubPayments = onSnapshot(query(collection(db, 'fee_payments'), orderBy('date', 'desc')), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeePayment)));
    });

    const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    });

    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
      setLoading(false);
    });

    return () => {
      unsubInvoices();
      unsubPayments();
      unsubExpenses();
      unsubStudents();
    };
  }, []);

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const outstandingFees = invoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + i.amount, 0);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === invoiceForm.studentId);
    if (!student) return;

    try {
      await addDoc(collection(db, 'invoices'), {
        ...invoiceForm,
        studentName: student.studentName,
        createdAt: serverTimestamp()
      });
      setIsInvoiceModalOpen(false);
      setInvoiceForm({ ...invoiceForm, studentId: '', amount: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'invoices');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const invoice = invoices.find(i => i.id === paymentForm.invoiceId);
    if (!invoice) return;

    try {
      await addDoc(collection(db, 'fee_payments'), {
        ...paymentForm,
        studentId: invoice.studentId,
        recordedBy: profile?.displayName || 'Admin'
      });
      
      // Update invoice status
      await updateDoc(doc(db, 'invoices', invoice.id!), {
        status: 'paid'
      });

      setIsPaymentModalOpen(false);
      setPaymentForm({ ...paymentForm, invoiceId: '', amount: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'fee_payments');
    }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'expenses'), {
        ...expenseForm,
        recordedBy: profile?.displayName || 'Admin'
      });
      setIsExpenseModalOpen(false);
      setExpenseForm({ ...expenseForm, amount: 0, description: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'expenses');
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
          <h3 className="text-2xl font-bold text-slate-900">₦{totalRevenue.toLocaleString()}</h3>
          <p className="text-slate-400 text-xs mt-1">All time fee payments</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-rose-50 rounded-2xl">
              <TrendingDown className="w-6 h-6 text-rose-600" />
            </div>
            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full">Total Expenses</span>
          </div>
          <h3 className="text-2xl font-bold text-slate-900">₦{totalExpenses.toLocaleString()}</h3>
          <p className="text-slate-400 text-xs mt-1">All time school spending</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-amber-50 rounded-2xl">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Outstanding</span>
          </div>
          <h3 className="text-2xl font-bold text-slate-900">₦{outstandingFees.toLocaleString()}</h3>
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
                  <p className="text-sm font-bold text-emerald-600">+₦{p.amount.toLocaleString()}</p>
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
                  <p className="text-sm font-bold text-rose-600">-₦{e.amount.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
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
                  <td className="px-6 py-4 text-sm font-medium">₦{invoice.amount.toLocaleString()}</td>
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
                    {invoice.status !== 'paid' && (
                      <button 
                        onClick={() => {
                          setPaymentForm({ ...paymentForm, invoiceId: invoice.id, amount: invoice.amount });
                          setIsPaymentModalOpen(true);
                        }}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                      >
                        Record Payment
                      </button>
                    )}
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
                  <td className="px-6 py-4 text-sm font-bold text-emerald-600">₦{payment.amount.toLocaleString()}</td>
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
                  <td className="px-6 py-4 text-sm font-bold text-rose-600">₦{expense.amount.toLocaleString()}</td>
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
                    <label className="text-xs font-bold text-slate-400 uppercase">Amount (₦)</label>
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
                  <label className="text-xs font-bold text-slate-400 uppercase">Amount Paid (₦)</label>
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
                  <label className="text-xs font-bold text-slate-400 uppercase">Amount (₦)</label>
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
    </div>
  );
}
