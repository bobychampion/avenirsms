import React, { useState } from 'react';
import { usePaystackPayment } from 'react-paystack';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { Invoice, FeePayment } from '../types';
import { formatCurrency } from '../utils/formatCurrency';
import { CreditCard, Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  invoice: Invoice;
  payerEmail: string;
  payerName: string;
  /** This school's own Paystack public key (school_settings/{schoolId}.paystackPublicKey). */
  publicKey: string;
  schoolId: string;
  locale: string;
  currency: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

/**
 * Card payment via Paystack. The calling component (PaymentMethodModal)
 * only renders this when the school has both enabled Paystack AND set a
 * public key — so this component can assume publicKey is non-empty.
 *
 * Confirmation note: success here is trusted purely on Paystack's client-side
 * callback. Proper server-side verification (calling Paystack's verify-
 * transaction endpoint) needs a Cloud Function, which isn't available on
 * this project's free Spark plan. This is a known, accepted trade-off — see
 * SPARK-PLAN-TODO below.
 */
// SPARK-PLAN-TODO: once on Blaze, add a verifyPaystackTransaction Cloud
// Function and call it here instead of trusting onPaystackSuccess directly,
// to close the (low-risk but real) client-side-spoofing gap.
function PaystackButton({ invoice, payerEmail, payerName, publicKey, schoolId, locale, currency, onSuccess, onClose }: Props) {
  const [processing, setProcessing] = useState(false);

  const config = {
    reference: `AVN-${invoice.id}-${Date.now()}`,
    email: payerEmail,
    amount: invoice.amount * 100, // Paystack expects kobo
    publicKey,
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
      const payment: Omit<FeePayment, 'id'> = {
        invoiceId: invoice.id!,
        studentId: invoice.studentId,
        schoolId,
        amount: invoice.amount,
        paymentMethod: 'card',
        reference: ref.reference,
        date: new Date().toISOString().split('T')[0],
        recordedBy: payerEmail,
        status: 'confirmed', // card payments are auto-confirmed (see SPARK-PLAN-TODO above)
        confirmedAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'fee_payments'), payment);

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
      {processing ? 'Processing…' : invoice.status === 'paid' ? 'Already Paid' : `Pay ${formatCurrency(invoice.amount, locale, currency)} via Card`}
    </button>
  );
}

export default PaystackButton;
