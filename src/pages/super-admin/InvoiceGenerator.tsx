/**
 * InvoiceGenerator — Platform-level invoice management for super_admin.
 *
 * Features:
 * - View all platform invoices (school subscription billing records)
 * - Create single invoice for any school (auto-populated from school data)
 * - Bulk generate invoices across multiple schools at once
 * - Customisable invoice templates (Standard / Formal / Minimal)
 * - Print / PDF-ready invoice preview modal
 * - Track paid / unpaid / overdue status
 * - Firestore collection: platform_invoices
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, query, orderBy, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { School } from '../../types';
import { formatNaira } from '../../types';
import {
  FileText, Plus, Printer, CheckCircle2, Clock, XCircle,
  Download, Layers, Building2, Search, ChevronDown, X,
  ArrowLeft, Loader2, Zap, Eye, CreditCard, AlertCircle,
  Calendar, RefreshCw, Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────────────────────────────

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
type BillingCycle = 'termly' | 'yearly';
type TemplateStyle = 'standard' | 'formal' | 'minimal';

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface PlatformInvoice {
  id?: string;
  invoiceNumber: string;
  schoolId: string;
  schoolName: string;
  schoolAdminEmail: string;
  schoolCountry: string;
  subscriptionPlan: School['subscriptionPlan'];
  billingCycle: BillingCycle;
  issueDate: string;   // ISO date string
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: LineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  notes: string;
  template: TemplateStyle;
  createdAt: any;
  paidAt?: any;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAN_PRICES: Record<School['subscriptionPlan'], { termly: number; yearly: number; label: string }> = {
  free:       { termly: 0,       yearly: 0,        label: 'Free' },
  starter:    { termly: 30000,   yearly: 90000,    label: 'Basic / Starter' },
  pro:        { termly: 60000,   yearly: 180000,   label: 'Professional' },
  enterprise: { termly: 100000,  yearly: 300000,   label: 'College / Enterprise' },
};

const PLAN_FEATURES: Record<School['subscriptionPlan'], string[]> = {
  free:       ['Student Management', 'Attendance Tracking', 'Basic Reports'],
  starter:    ['Student Management', 'Attendance Tracking', 'Fee Management & Paystack', 'Report Cards', 'Timetable', 'Parent Portal', 'WhatsApp Notifications'],
  pro:        ['Everything in Basic', 'Exam Seating', 'Curriculum Mapping', 'Student Promotion', 'Payroll Management', 'Analytics Dashboard', 'Bulk CSV Import', 'AI Features (5 modules)'],
  enterprise: ['Everything in Professional', 'Unlimited Users', 'Multi-campus Support', 'Custom Branding', 'Advanced Analytics', 'Staff Leave Management', 'Career Discovery Access', 'SLA-backed Uptime', 'Dedicated Onboarding'],
};

const STATUS_META: Record<InvoiceStatus, { label: string; color: string; bg: string; Icon: any }> = {
  draft:     { label: 'Draft',     color: 'text-slate-600', bg: 'bg-slate-100',   Icon: FileText },
  sent:      { label: 'Sent',      color: 'text-blue-700',  bg: 'bg-blue-100',    Icon: Clock },
  paid:      { label: 'Paid',      color: 'text-emerald-700', bg: 'bg-emerald-100', Icon: CheckCircle2 },
  overdue:   { label: 'Overdue',   color: 'text-rose-700',  bg: 'bg-rose-100',    Icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'text-slate-500', bg: 'bg-slate-100',   Icon: XCircle },
};

const TEMPLATES: { id: TemplateStyle; label: string; desc: string }[] = [
  { id: 'standard', label: 'Standard',  desc: 'Clean layout with branding and colour accents' },
  { id: 'formal',   label: 'Formal',    desc: 'Conservative, letter-style business invoice' },
  { id: 'minimal',  label: 'Minimal',   desc: 'Compact black-and-white, printer-friendly' },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10); }
function addDays(date: string, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function periodEnd(start: string, cycle: BillingCycle) {
  const d = new Date(start);
  if (cycle === 'termly') d.setMonth(d.getMonth() + 4); // ~1 term ≈ 4 months
  else d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}
function generateInvoiceNo(prefix = 'AVN') {
  const now = new Date();
  return `${prefix}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}
function buildLineItems(plan: School['subscriptionPlan'], cycle: BillingCycle): LineItem[] {
  const price = PLAN_PRICES[plan];
  const unitPrice = cycle === 'termly' ? price.termly : price.yearly;
  const items: LineItem[] = [
    {
      description: `Avenir SIS ${price.label} Plan — ${cycle === 'termly' ? 'Termly' : 'Annual'} Subscription`,
      quantity: 1,
      unitPrice,
    },
  ];
  PLAN_FEATURES[plan].forEach(f => {
    items.push({ description: `  ✓ ${f}`, quantity: 1, unitPrice: 0 });
  });
  return items;
}

// ─── Invoice print template ────────────────────────────────────────────────

function InvoicePrintView({ inv, template }: { inv: PlatformInvoice; template: TemplateStyle }) {
  const isStandard = template === 'standard';
  const isFormal   = template === 'formal';

  const header = isStandard
    ? 'bg-indigo-600 text-white'
    : isFormal
    ? 'bg-slate-800 text-white'
    : 'bg-white text-slate-900 border-b-2 border-slate-900';

  return (
    <div id="invoice-print-area" className="bg-white text-slate-900 font-sans" style={{ minWidth: 640, maxWidth: 800, margin: '0 auto' }}>
      {/* Header band */}
      <div className={`${header} px-10 py-8`}>
        <div className="flex justify-between items-start">
          <div>
            {isStandard || isFormal ? (
              <div className="text-2xl font-extrabold tracking-tight">AVENIR SIS</div>
            ) : (
              <div className="text-2xl font-extrabold text-slate-900">AVENIR SIS</div>
            )}
            <p className={`text-xs mt-1 ${isStandard || isFormal ? 'text-indigo-100 opacity-80' : 'text-slate-500'}`}>
              Smart School Information System
            </p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-black tracking-widest ${isStandard ? '' : isFormal ? '' : 'text-slate-900'}`}>INVOICE</p>
            <p className={`text-sm mt-1 font-mono ${isStandard || isFormal ? 'opacity-80' : 'text-slate-500'}`}>
              #{inv.invoiceNumber}
            </p>
          </div>
        </div>
      </div>

      <div className="px-10 py-8">
        {/* Bill to / Invoice meta */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billed To</p>
            <p className="font-bold text-slate-900 text-sm">{inv.schoolName}</p>
            <p className="text-sm text-slate-500">{inv.schoolAdminEmail}</p>
            <p className="text-sm text-slate-500">{inv.schoolCountry}</p>
            <div className="mt-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                inv.subscriptionPlan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                inv.subscriptionPlan === 'pro' ? 'bg-indigo-100 text-indigo-700' :
                'bg-blue-100 text-blue-700'
              }`}>{PLAN_PRICES[inv.subscriptionPlan].label} Plan</span>
            </div>
          </div>
          <div className="text-right space-y-1.5">
            {[
              { label: 'Invoice No.',     val: `#${inv.invoiceNumber}` },
              { label: 'Issue Date',      val: fmtDate(inv.issueDate) },
              { label: 'Due Date',        val: fmtDate(inv.dueDate) },
              { label: 'Billing Period',  val: `${fmtDate(inv.periodStart)} – ${fmtDate(inv.periodEnd)}` },
              { label: 'Billing Cycle',   val: inv.billingCycle === 'termly' ? 'Termly' : 'Yearly' },
            ].map(r => (
              <div key={r.label} className="flex justify-end gap-4">
                <span className="text-xs text-slate-400 w-28 text-left">{r.label}</span>
                <span className="text-xs font-semibold text-slate-700">{r.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status badge */}
        {inv.status !== 'draft' && (
          <div className="mb-6 flex items-center gap-2">
            <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide ${STATUS_META[inv.status].bg} ${STATUS_META[inv.status].color}`}>
              {STATUS_META[inv.status].label}
            </span>
            {inv.status === 'paid' && inv.paidAt && (
              <span className="text-xs text-slate-400">Paid on {fmtDate(inv.paidAt?.toDate ? inv.paidAt.toDate().toISOString().slice(0, 10) : today())}</span>
            )}
          </div>
        )}

        {/* Line items */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className={`${isStandard ? 'bg-indigo-50 text-indigo-800' : isFormal ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-700'}`}>
              <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wide rounded-l">Description</th>
              <th className="text-center px-4 py-2.5 font-semibold text-xs uppercase tracking-wide w-16">Qty</th>
              <th className="text-right px-4 py-2.5 font-semibold text-xs uppercase tracking-wide w-28 rounded-r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lineItems.map((item, i) => {
              const isFeature = item.description.startsWith('  ✓');
              return (
                <tr key={i} className={isFeature ? '' : 'border-b border-slate-100'}>
                  <td className={`px-4 py-2 ${isFeature ? 'text-slate-400 text-xs pl-8' : 'text-slate-800 font-medium'}`}>
                    {item.description}
                  </td>
                  <td className={`px-4 py-2 text-center ${isFeature ? 'text-slate-300 text-xs' : 'text-slate-600'}`}>
                    {isFeature ? '' : item.quantity}
                  </td>
                  <td className={`px-4 py-2 text-right ${isFeature ? 'text-slate-300 text-xs' : 'text-slate-800 font-semibold'}`}>
                    {isFeature ? '' : item.unitPrice === 0 ? '—' : formatNaira(item.unitPrice * item.quantity)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span><span>{formatNaira(inv.subtotal)}</span>
            </div>
            {inv.discount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Discount</span><span>–{formatNaira(inv.discount)}</span>
              </div>
            )}
            {inv.tax > 0 && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>Tax / VAT</span><span>{formatNaira(inv.tax)}</span>
              </div>
            )}
            <div className={`flex justify-between font-bold text-base pt-2 border-t ${isStandard ? 'border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-900'}`}>
              <span>Total Due</span><span>{formatNaira(inv.total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {inv.notes && (
          <div className="border border-slate-200 rounded-xl p-4 mb-6 text-sm text-slate-600 bg-slate-50">
            <p className="font-semibold text-slate-700 mb-1 text-xs uppercase tracking-wide">Notes</p>
            <p>{inv.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-100 pt-6 flex items-center justify-between text-xs text-slate-400">
          <div>
            <p className="font-semibold text-slate-500">Avenir Technologies Ltd.</p>
            <p>hello@avenirsms.com · avenirsms.com</p>
          </div>
          <p>Generated by Avenir SIS Platform</p>
        </div>
      </div>
    </div>
  );
}

// ─── Create Invoice Modal ─────────────────────────────────────────────────────

interface CreateModalProps {
  schools: School[];
  onClose: () => void;
  onCreated: (inv: PlatformInvoice) => void;
}

function CreateInvoiceModal({ schools, onClose, onCreated }: CreateModalProps) {
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('termly');
  const [template, setTemplate] = useState<TemplateStyle>('standard');
  const [issueDate, setIssueDate] = useState(today());
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState('Thank you for choosing Avenir SIS. Please make payment within 7 days of invoice date.');
  const [saving, setSaving] = useState(false);

  const selectedSchool = schools.find(s => s.id === selectedSchoolId) ?? null;

  const lineItems = selectedSchool
    ? buildLineItems(selectedSchool.subscriptionPlan, billingCycle)
    : [];
  const subtotal = lineItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const total = subtotal - discount + tax;

  const handleCreate = async () => {
    if (!selectedSchool) { toast.error('Select a school first'); return; }
    if (total < 0) { toast.error('Total cannot be negative'); return; }
    setSaving(true);
    try {
      const inv: Omit<PlatformInvoice, 'id'> = {
        invoiceNumber:    generateInvoiceNo(),
        schoolId:         selectedSchool.id!,
        schoolName:       selectedSchool.name,
        schoolAdminEmail: selectedSchool.adminEmail || '',
        schoolCountry:    selectedSchool.country || 'Nigeria',
        subscriptionPlan: selectedSchool.subscriptionPlan,
        billingCycle,
        issueDate,
        dueDate:          addDays(issueDate, 7),
        periodStart:      issueDate,
        periodEnd:        periodEnd(issueDate, billingCycle),
        lineItems,
        subtotal,
        discount,
        tax,
        total,
        status:           'draft',
        notes,
        template,
        createdAt:        serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'platform_invoices'), inv);
      toast.success('Invoice created');
      onCreated({ ...inv, id: ref.id });
      onClose();
    } catch {
      toast.error('Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-500" /> New Invoice
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* School selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              School * {schools.length > 0 ? `(${schools.length} available)` : ''}
            </label>
            <select className={inputCls} value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)}>
              <option value="">— Select school —</option>
              {schools.filter(s => s.id).map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({PLAN_PRICES[s.subscriptionPlan]?.label ?? s.subscriptionPlan})
                </option>
              ))}
            </select>
            {schools.length === 0 && (
              <p className="text-xs text-rose-500 mt-1">No schools loaded — ensure schools exist in Firestore.</p>
            )}
          </div>

          {selectedSchool && (
            <div className="bg-indigo-50 rounded-xl p-3 text-sm">
              <p className="font-semibold text-indigo-800">{selectedSchool.name}</p>
              <p className="text-indigo-600 text-xs">{selectedSchool.adminEmail} · {selectedSchool.country}</p>
              <p className="text-indigo-600 text-xs mt-0.5">Plan: <strong>{PLAN_PRICES[selectedSchool.subscriptionPlan]?.label ?? selectedSchool.subscriptionPlan}</strong></p>
            </div>
          )}

          {/* Billing cycle */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Billing Cycle</label>
            <div className="flex gap-2">
              {(['termly', 'yearly'] as BillingCycle[]).map(c => (
                <button
                  key={c}
                  onClick={() => setBillingCycle(c)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                    billingCycle === c
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 text-slate-500 hover:border-indigo-300'
                  }`}
                >{c === 'termly' ? 'Termly' : 'Yearly'}</button>
              ))}
            </div>
          </div>

          {/* Issue date */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Issue Date</label>
            <input type="date" className={inputCls} value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          </div>

          {/* Template */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Template Style</label>
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    template === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-700">{t.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Discount / Tax */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Discount (₦)</label>
              <input type="number" min={0} className={inputCls} value={discount} onChange={e => setDiscount(+e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tax / VAT (₦)</label>
              <input type="number" min={0} className={inputCls} value={tax} onChange={e => setTax(+e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Notes</label>
            <textarea
              className={inputCls + ' h-20 resize-none'}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {/* Summary */}
          {selectedSchool && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-1 text-sm">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatNaira(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>–{formatNaira(discount)}</span></div>}
              {tax > 0 && <div className="flex justify-between text-slate-500"><span>Tax</span><span>+{formatNaira(tax)}</span></div>}
              <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-200 text-indigo-700">
                <span>Total Due</span><span>{formatNaira(total)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !selectedSchoolId}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Creating…' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Generate Modal ─────────────────────────────────────────────────────

interface BulkModalProps {
  schools: School[];
  onClose: () => void;
  onDone: (created: PlatformInvoice[]) => void;
}

function BulkGenerateModal({ schools, onClose, onDone }: BulkModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('termly');
  const [template, setTemplate] = useState<TemplateStyle>('standard');
  const [issueDate, setIssueDate] = useState(today());
  const [discount, setDiscount] = useState(0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggleSchool = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(schools.filter(s => s.id).map(s => s.id!)));
  const clearAll  = () => setSelectedIds(new Set());

  const handleGenerate = async () => {
    if (selectedIds.size === 0) { toast.error('Select at least one school'); return; }
    setRunning(true);
    const created: PlatformInvoice[] = [];
    const list = schools.filter(s => s.id && selectedIds.has(s.id));

    // Firestore batch limit = 500; each invoice = 1 write, safe for any realistic school count
    const batch = writeBatch(db);
    for (const school of list) {
      const lineItems = buildLineItems(school.subscriptionPlan, billingCycle);
      const subtotal = lineItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      const total = subtotal - discount;
      const invRef = doc(collection(db, 'platform_invoices'));
      const inv: Omit<PlatformInvoice, 'id'> = {
        invoiceNumber:    generateInvoiceNo(),
        schoolId:         school.id!,
        schoolName:       school.name,
        schoolAdminEmail: school.adminEmail || '',
        schoolCountry:    school.country || 'Nigeria',
        subscriptionPlan: school.subscriptionPlan,
        billingCycle,
        issueDate,
        dueDate:          addDays(issueDate, 7),
        periodStart:      issueDate,
        periodEnd:        periodEnd(issueDate, billingCycle),
        lineItems,
        subtotal,
        discount,
        tax: 0,
        total,
        status:           'draft',
        notes:            'Thank you for choosing Avenir SIS. Please make payment within 7 days.',
        template,
        createdAt:        serverTimestamp(),
      };
      batch.set(invRef, inv);
      created.push({ ...inv, id: invRef.id });
      setProgress(Math.round((created.length / list.length) * 100));
    }

    try {
      await batch.commit();
      toast.success(`${created.length} invoice${created.length !== 1 ? 's' : ''} generated`);
      onDone(created);
      onClose();
    } catch {
      toast.error('Bulk generation failed');
    } finally {
      setRunning(false);
      setProgress(0);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" /> Bulk Generate Invoices
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Billing cycle */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Billing Cycle</label>
            <div className="flex gap-2">
              {(['termly', 'yearly'] as BillingCycle[]).map(c => (
                <button key={c} onClick={() => setBillingCycle(c)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${billingCycle === c ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
                  {c === 'termly' ? 'Termly' : 'Yearly'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Issue Date</label>
              <input type="date" className={inputCls} value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Discount per Invoice (₦)</label>
              <input type="number" min={0} className={inputCls} value={discount} onChange={e => setDiscount(+e.target.value)} />
            </div>
          </div>

          {/* Template */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Template</label>
            <select className={inputCls} value={template} onChange={e => setTemplate(e.target.value as TemplateStyle)}>
              {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label} — {t.desc}</option>)}
            </select>
          </div>

          {/* School list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-700">Schools ({selectedIds.size} selected)</label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-indigo-600 hover:underline font-semibold">All</button>
                <span className="text-slate-300">|</span>
                <button onClick={clearAll} className="text-xs text-slate-500 hover:underline font-semibold">None</button>
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-50">
              {schools.map(school => (
                <label key={school.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(school.id!)}
                    onChange={() => toggleSchool(school.id!)}
                    className="rounded text-indigo-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{school.name}</p>
                    <p className="text-xs text-slate-400">{school.adminEmail}</p>
                  </div>
                  <span className="text-xs font-bold text-slate-500 shrink-0">{PLAN_PRICES[school.subscriptionPlan].label}</span>
                  <span className="text-xs font-bold text-indigo-600 shrink-0">
                    {formatNaira(PLAN_PRICES[school.subscriptionPlan][billingCycle])}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Summary */}
          {selectedIds.size > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm">
              <p className="font-semibold text-amber-800">
                {selectedIds.size} invoices · Total value:{' '}
                {formatNaira(
                  schools
                    .filter(s => s.id && selectedIds.has(s.id))
                    .reduce((sum, s) => sum + PLAN_PRICES[s.subscriptionPlan][billingCycle] - discount, 0)
                )}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">All will be created as <strong>Draft</strong> — you can mark them Sent individually.</p>
            </div>
          )}

          {/* Progress */}
          {running && progress > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Generating…</span><span>{progress}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-2 bg-indigo-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={running || selectedIds.size === 0}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {running ? 'Generating…' : `Generate ${selectedIds.size || ''} Invoice${selectedIds.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({ inv, onClose, onStatusChange }: {
  inv: PlatformInvoice;
  onClose: () => void;
  onStatusChange: (id: string, status: InvoiceStatus) => void;
}) {
  const [updatingStatus, setUpdatingStatus] = useState<InvoiceStatus | null>(null);

  const handlePrint = () => {
    // Grab the rendered invoice HTML and open it in a clean new window for printing
    const el = document.getElementById('invoice-print-area');
    if (!el) return;

    // Collect all <link rel="stylesheet"> and <style> tags from the current page
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(node => node.outerHTML)
      .join('\n');

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { window.print(); return; }

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Invoice ${inv.invoiceNumber}</title>
  ${styles}
  <style>
    @page { margin: 12mm; }
    body { margin: 0; padding: 0; background: white; font-family: sans-serif; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  ${el.outerHTML}
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); window.close(); }, 400);
    };
  <\/script>
</body>
</html>`);
    win.document.close();
  };

  const handleStatus = async (newStatus: InvoiceStatus) => {
    if (!inv.id) return;
    setUpdatingStatus(newStatus);
    try {
      const patch: any = { status: newStatus, updatedAt: serverTimestamp() };
      if (newStatus === 'paid') patch.paidAt = serverTimestamp();
      await updateDoc(doc(db, 'platform_invoices', inv.id), patch);
      onStatusChange(inv.id, newStatus);
      toast.success(`Invoice marked as ${newStatus}`);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div id="invoice-print-portal" className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Actions bar */}
        <div id="invoice-print-actions" className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            {/* Status actions */}
            {inv.status !== 'paid' && (
              <button
                onClick={() => handleStatus('paid')}
                disabled={!!updatingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {updatingStatus === 'paid' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Mark Paid
              </button>
            )}
            {inv.status === 'draft' && (
              <button
                onClick={() => handleStatus('sent')}
                disabled={!!updatingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {updatingStatus === 'sent' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
                Mark Sent
              </button>
            )}
            {inv.status !== 'cancelled' && inv.status !== 'paid' && (
              <button
                onClick={() => handleStatus('overdue')}
                disabled={!!updatingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold transition-colors disabled:opacity-50"
              >
                <AlertCircle className="w-3 h-3" /> Mark Overdue
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
            >
              <Printer className="w-3 h-3" /> Print / PDF
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Invoice preview */}
        <div className="overflow-y-auto p-6">
          <InvoicePrintView inv={inv} template={inv.template} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InvoiceGenerator() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [planFilter, setPlanFilter] = useState<School['subscriptionPlan'] | 'all'>('all');

  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [previewInv, setPreviewInv] = useState<PlatformInvoice | null>(null);

  // Load data in parallel
  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'platform_invoices'), orderBy('createdAt', 'desc'))),
      getDocs(collection(db, 'schools')),
    ]).then(([invSnap, schoolSnap]) => {
      setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() } as PlatformInvoice)));
      setSchools(schoolSnap.docs.map(d => ({ id: d.id, ...d.data() } as School)));
    }).catch((err) => {
      console.error('InvoiceGenerator load error:', err);
      toast.error('Failed to load data');
    })
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = (inv: PlatformInvoice) => {
    setInvoices(prev => [inv, ...prev]);
  };
  const handleBulkDone = (created: PlatformInvoice[]) => {
    setInvoices(prev => [...created, ...prev]);
  };
  const handleStatusChange = (id: string, status: InvoiceStatus) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    if (previewInv?.id === id) setPreviewInv(p => p ? { ...p, status } : p);
  };

  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (planFilter !== 'all' && inv.subscriptionPlan !== planFilter) return false;
    const q = search.toLowerCase();
    return !q || inv.schoolName.toLowerCase().includes(q) || inv.invoiceNumber.toLowerCase().includes(q);
  });

  // KPI calculations
  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const outstanding   = invoices.filter(i => i.status === 'sent' || i.status === 'draft').reduce((s, i) => s + i.total, 0);
  const overdueAmt    = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);

  const kpis = [
    { label: 'Total Revenue',   value: formatNaira(totalRevenue), icon: CheckCircle2, color: 'bg-emerald-600', sub: `${invoices.filter(i => i.status === 'paid').length} paid` },
    { label: 'Outstanding',     value: formatNaira(outstanding),  icon: Clock,        color: 'bg-blue-500',    sub: `${invoices.filter(i => i.status === 'sent' || i.status === 'draft').length} invoices` },
    { label: 'Overdue',         value: formatNaira(overdueAmt),   icon: AlertCircle,  color: 'bg-rose-500',    sub: `${invoices.filter(i => i.status === 'overdue').length} invoices` },
    { label: 'Total Invoices',  value: invoices.length,           icon: FileText,     color: 'bg-indigo-600',  sub: `${schools.length} schools` },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/super-admin')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-6 h-6 text-indigo-600" /> Invoice Generator
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Subscription billing management for all schools</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors shadow-lg shadow-amber-200"
          >
            <Zap className="w-4 h-4" /> Bulk Generate
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors shadow-lg shadow-indigo-200"
          >
            <Plus className="w-4 h-4" /> New Invoice
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-500">{k.label}</p>
              <div className={`${k.color} p-2 rounded-xl`}>
                <k.icon className="w-4 h-4 text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{loading ? '—' : k.value.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by school name or invoice number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
        >
          <option value="all">All Statuses</option>
          {(Object.keys(STATUS_META) as InvoiceStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
        <select
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value as any)}
          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
        >
          <option value="all">All Plans</option>
          {(Object.keys(PLAN_PRICES) as Array<School['subscriptionPlan']>).map(p => (
            <option key={p} value={p}>{PLAN_PRICES[p].label}</option>
          ))}
        </select>
      </div>

      {/* Invoice table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Loading invoices…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {invoices.length === 0 ? 'No invoices yet' : 'No invoices match your filters'}
            </p>
            {invoices.length === 0 && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Create First Invoice
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">Invoice #</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">School</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Plan</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Cycle</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Issue Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Due Date</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Amount</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(inv => {
                  const sm = STATUS_META[inv.status];
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
                          {inv.invoiceNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 max-w-[160px] truncate">{inv.schoolName}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[160px]">{inv.schoolAdminEmail}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          inv.subscriptionPlan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                          inv.subscriptionPlan === 'pro'        ? 'bg-indigo-100 text-indigo-700' :
                          inv.subscriptionPlan === 'starter'    ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {PLAN_PRICES[inv.subscriptionPlan].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 capitalize">
                        {inv.billingCycle === 'termly' ? 'Termly' : 'Yearly'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{fmtDate(inv.issueDate)}</td>
                      <td className="px-4 py-3 text-slate-500">{fmtDate(inv.dueDate)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{formatNaira(inv.total)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${sm.bg} ${sm.color}`}>
                          <sm.Icon className="w-3 h-3" />
                          {sm.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setPreviewInv(inv)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          <Eye className="w-3 h-3" /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Result count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-slate-400 text-center">
          Showing {filtered.length} of {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateInvoiceModal
          schools={schools}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {showBulk && (
        <BulkGenerateModal
          schools={schools}
          onClose={() => setShowBulk(false)}
          onDone={handleBulkDone}
        />
      )}
      {previewInv && (
        <PreviewModal
          inv={previewInv}
          onClose={() => setPreviewInv(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
