import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { X, Landmark, Banknote, CreditCard, Copy, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Invoice, FeePayment } from '../types';
import { formatCurrency } from '../utils/formatCurrency';
import { useSchoolSettings } from '../pages/SchoolSettings';
import PaystackButton from './PaystackPayment';

type Method = 'bank_transfer' | 'cash' | 'card';

interface Props {
  invoice: Invoice;
  schoolId: string;
  payerEmail: string;
  payerName: string;
  locale: string;
  currency: string;
  onClose: () => void;
}

/**
 * Lets a parent choose how to pay an invoice (Bank Transfer / Cash /
 * Card via Paystack), based on which methods the school has enabled in
 * Settings. Bank transfer and cash both create a 'pending' fee_payment
 * claim and flip the invoice to 'awaiting_confirmation' — an admin must
 * approve it in Financial Management before it's actually Paid. Card
 * payments go through PaystackPayment.tsx, which auto-confirms.
 */
export default function PaymentMethodModal({ invoice, schoolId, payerEmail, payerName, locale, currency, onClose }: Props) {
  const { settings, loading } = useSchoolSettings();
  const [method, setMethod] = useState<Method | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);

  const { bankTransfer, cash, paystack } = settings.paymentMethods;
  const paystackReady = paystack && !!settings.paystackPublicKey;
  const noMethodsEnabled = !bankTransfer && !cash && !paystackReady;

  const claimPayment = async (paymentMethod: 'bank_transfer' | 'cash') => {
    setClaiming(true);
    const tid = toast.loading('Submitting…');
    try {
      const payment: Omit<FeePayment, 'id'> = {
        invoiceId: invoice.id!,
        studentId: invoice.studentId,
        schoolId,
        amount: invoice.amount,
        paymentMethod,
        date: new Date().toISOString().split('T')[0],
        recordedBy: payerEmail,
        status: 'pending',
      };
      await addDoc(collection(db, 'fee_payments'), payment);
      await updateDoc(doc(db, 'invoices', invoice.id!), {
        status: 'awaiting_confirmation',
        paymentClaimedAt: serverTimestamp(),
      });
      toast.success("Payment declared — awaiting confirmation from the school's accounts office.", { id: tid, duration: 5000 });
      onClose();
    } catch (e: any) {
      toast.error('Could not submit: ' + (e.message || 'unknown error'), { id: tid });
    } finally {
      setClaiming(false);
    }
  };

  const copyAccountNumber = () => {
    navigator.clipboard.writeText(settings.bankDetails.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Pay Invoice</h3>
              <p className="text-sm text-slate-500 mt-0.5">{invoice.description} · {formatCurrency(invoice.amount, locale, currency)}</p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
            ) : noMethodsEnabled ? (
              <div className="text-center py-6">
                <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                <p className="font-bold text-slate-800">Online payment isn't set up yet</p>
                <p className="text-sm text-slate-500 mt-1">
                  Please contact the school's accounts office directly to arrange payment of this invoice.
                </p>
              </div>
            ) : !method ? (
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Choose a payment method</p>
                {bankTransfer && (
                  <button onClick={() => setMethod('bank_transfer')}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-left">
                    <div className="p-2.5 bg-indigo-50 rounded-xl"><Landmark className="w-5 h-5 text-indigo-600" /></div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">Bank Transfer</p>
                      <p className="text-xs text-slate-500">Transfer to the school's account</p>
                    </div>
                  </button>
                )}
                {cash && (
                  <button onClick={() => setMethod('cash')}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-left">
                    <div className="p-2.5 bg-emerald-50 rounded-xl"><Banknote className="w-5 h-5 text-emerald-600" /></div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">Cash</p>
                      <p className="text-xs text-slate-500">Pay in person at the accounts office</p>
                    </div>
                  </button>
                )}
                {paystackReady && (
                  <button onClick={() => setMethod('card')}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50/50 transition-all text-left">
                    <div className="p-2.5 bg-violet-50 rounded-xl"><CreditCard className="w-5 h-5 text-violet-600" /></div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">Card Payment</p>
                      <p className="text-xs text-slate-500">Pay instantly via Paystack</p>
                    </div>
                  </button>
                )}
              </div>
            ) : method === 'bank_transfer' ? (
              <div className="space-y-4">
                <button onClick={() => setMethod(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600">← Back</button>
                <div className="bg-slate-50 rounded-2xl border border-slate-200 divide-y divide-slate-200">
                  <Row label="Bank Name" value={settings.bankDetails.bankName} />
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Account Number</p>
                      <p className="text-sm font-mono font-bold text-slate-900 select-all">{settings.bankDetails.accountNumber}</p>
                    </div>
                    <button onClick={copyAccountNumber}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
                      <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <Row label="Account Name" value={settings.bankDetails.accountName} />
                  <Row label="Amount" value={formatCurrency(invoice.amount, locale, currency)} />
                </div>
                <p className="text-xs text-slate-500">
                  After transferring, tap the button below. Your invoice will show "Awaiting Confirmation"
                  until the school's accounts office verifies the transfer.
                </p>
                <button onClick={() => claimPayment('bank_transfer')} disabled={claiming}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
                  {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  I've Made This Transfer
                </button>
              </div>
            ) : method === 'cash' ? (
              <div className="space-y-4">
                <button onClick={() => setMethod(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600">← Back</button>
                <p className="text-sm text-slate-600">
                  Please pay <strong>{formatCurrency(invoice.amount, locale, currency)}</strong> in cash at the school's
                  accounts office. Your invoice will show "Awaiting Confirmation" until they record receipt of payment.
                </p>
                <button onClick={() => claimPayment('cash')} disabled={claiming}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm">
                  {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  I'll Pay In Person
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <button onClick={() => setMethod(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600">← Back</button>
                <PaystackButton
                  invoice={invoice}
                  payerEmail={payerEmail}
                  payerName={payerName}
                  publicKey={settings.paystackPublicKey!}
                  schoolId={schoolId}
                  locale={locale}
                  currency={currency}
                  onSuccess={onClose}
                  onClose={() => {}}
                />
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-bold text-slate-900">{value || '—'}</p>
    </div>
  );
}
