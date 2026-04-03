import React, { useState } from 'react';
import { usePaystackPayment } from 'react-paystack';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { Invoice, FeePayment, formatNaira } from '../types';
import { CreditCard, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  invoice: Invoice;
  payerEmail: string;
  payerName: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

// Paystack public key comes from env
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';

function PaystackButton({ invoice, payerEmail, payerName, onSuccess, onClose }: Props) {
  const [processing, setProcessing] = useState(false);

  const config = {
    reference: `AVN-${invoice.id}-${Date.now()}`,
    email: payerEmail,
    amount: invoice.amount * 100, // Paystack expects kobo
    publicKey: PAYSTACK_PUBLIC_KEY,
    metadata: {
      custom_fields: [
        { display_name: 'Student', variable_name: 'student', value: invoice.studentName },
        { display_name: 'Invoice ID', variable_name: 'invoice_id', value: invoice.id },
        { display_name: 'Payer', variable_name: 'payer', value: payerName },
      ],
    },
    currency: 'NGN',
    label: `School Fees - ${invoice.studentName}`,
  };

  const onPaystackSuccess = async (ref: { reference: string }) => {
    setProcessing(true);
    const tid = toast.loading('Recording payment…');
    try {
      // Record payment
      const payment: Omit<FeePayment, 'id'> = {
        invoiceId: invoice.id!,
        studentId: invoice.studentId,
        amount: invoice.amount,
        paymentMethod: 'card',
        reference: ref.reference,
        date: new Date().toISOString().split('T')[0],
        recordedBy: payerEmail,
      };
      await addDoc(collection(db, 'payments'), payment);

      // Update invoice status
      await updateDoc(doc(db, 'invoices', invoice.id!), {
        status: 'paid',
        paidAt: serverTimestamp(),
        paystackReference: ref.reference,
      });

      toast.success('Payment successful! Invoice marked as paid.', { id: tid, duration: 5000 });
      onSuccess?.();
    } catch (e: any) {
      toast.error('Payment recorded on Paystack but failed to update records. Contact admin.', { id: tid });
    } finally {
      setProcessing(false);
    }
  };

  const onPaystackClose = () => {
    toast('Payment cancelled.', { icon: '⚠️' });
    onClose?.();
  };

  const initializePayment = usePaystackPayment(config);

  if (!PAYSTACK_PUBLIC_KEY) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 flex-shrink-0" />
        Paystack key not configured. Add VITE_PAYSTACK_PUBLIC_KEY to .env
      </div>
    );
  }

  return (
    <button
      onClick={() => initializePayment({ onSuccess: onPaystackSuccess, onClose: onPaystackClose })}
      disabled={processing || invoice.status === 'paid'}
      className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
    >
      {processing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : invoice.status === 'paid' ? (
        <CheckCircle2 className="w-4 h-4" />
      ) : (
        <CreditCard className="w-4 h-4" />
      )}
      {processing ? 'Processing…' : invoice.status === 'paid' ? 'Already Paid' : `Pay ${formatNaira(invoice.amount)} via Card`}
    </button>
  );
}

export default PaystackButton;
