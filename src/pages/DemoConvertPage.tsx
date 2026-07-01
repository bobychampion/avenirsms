/**
 * DemoConvertPage — route: /admin/convert-demo
 *
 * Demo school admins fill this in when they're ready to go permanent.
 * Fields match what the user spec'd: school name, URL slug, admin email,
 * primary + secondary contact numbers, report forwarding email, and an
 * optional review/feedback.
 *
 * On submit: updates demo_requests (found via adminEmail) to
 * status='conversion_requested' with all the conversion details.
 * Super admin then clicks "Activate School" in the dashboard.
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../components/FirebaseProvider';
import { useSchoolId } from '../hooks/useSchoolId';
import { useSchool } from '../components/SchoolContext';
import toast from 'react-hot-toast';
import {
  ArrowLeft, CheckCircle2, Star, Loader2, Building2, Mail,
  Phone, Globe, Send,
} from 'lucide-react';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function DemoConvertPage() {
  const { user, profile } = useAuth();
  const schoolId = useSchoolId();
  const { schoolName } = useSchool();

  const [form, setForm] = useState({
    finalSchoolName: '',
    urlSlug: '',
    adminEmail: '',
    contactPhone: '',
    contactPhone2: '',
    reportEmail: '',
    review: '',
    stars: 0,
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Pre-fill from known profile data
  useEffect(() => {
    setForm(f => ({
      ...f,
      finalSchoolName: f.finalSchoolName || schoolName,
      adminEmail: f.adminEmail || profile?.email || user?.email || '',
      contactPhone: f.contactPhone || profile?.notificationPrefs ? '' : '',
    }));
  }, [schoolName, profile, user]);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.finalSchoolName || !form.contactPhone || !form.adminEmail) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (form.urlSlug && !SLUG_RE.test(form.urlSlug)) {
      toast.error('URL slug must be lowercase letters, numbers, and hyphens only.');
      return;
    }

    setSaving(true);
    const tid = toast.loading('Submitting conversion request…');
    try {
      // Find the demo_request by admin email
      const adminEmail = profile?.email || user?.email || '';
      const snap = await getDocs(query(
        collection(db, 'demo_requests'),
        where('adminEmail', '==', adminEmail),
      ));
      if (snap.empty) {
        // Fallback: search by email field
        const snap2 = await getDocs(query(collection(db, 'demo_requests'), where('email', '==', adminEmail)));
        if (snap2.empty) {
          toast.error('Could not find your demo request. Please contact support.', { id: tid });
          return;
        }
        await updateDoc(snap2.docs[0].ref, conversionPayload(schoolId));
      } else {
        await updateDoc(snap.docs[0].ref, conversionPayload(schoolId));
      }
      toast.success('Conversion request submitted! We\'ll activate your account shortly.', { id: tid, duration: 6000 });
      setDone(true);
    } catch (err: any) {
      toast.error('Failed to submit: ' + (err.message || 'unknown error'), { id: tid });
    } finally {
      setSaving(false);
    }
  };

  function conversionPayload(sid: string | null) {
    return {
      status: 'conversion_requested',
      finalSchoolName: form.finalSchoolName,
      urlSlug: form.urlSlug || null,
      adminEmail: form.adminEmail,
      contactPhone: form.contactPhone,
      contactPhone2: form.contactPhone2 || null,
      reportEmail: form.reportEmail || null,
      review: form.review || null,
      reviewStars: form.stars || null,
      schoolId: sid,
      conversionRequestedAt: serverTimestamp(),
    };
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Request Submitted!</h1>
        <p className="text-slate-500 mb-8">
          Our team will review your details and activate your full account.
          You'll receive an email confirmation once it's live.
        </p>
        <Link to="/admin" className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <Link to="/admin" className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-bold text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-1">
          <Building2 className="w-6 h-6 text-indigo-600" /> Convert Demo to Full Account
        </h1>
        <p className="text-slate-500 text-sm">
          Confirm your school details below. Once you submit, our team activates your permanent account
          — your existing data (students, settings, invoices) all carries over.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" /> School Identity
          </h2>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">School Name <span className="text-rose-500">*</span></label>
            <input value={form.finalSchoolName} onChange={f('finalSchoolName')} required placeholder="e.g. Bright Future Academy"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              URL Slug <span className="text-slate-400 font-normal normal-case">(optional — e.g. bright-future)</span>
            </label>
            <div className="flex items-center">
              <span className="text-slate-400 text-sm mr-1">avenirsms.com/s/</span>
              <input value={form.urlSlug} onChange={f('urlSlug')} placeholder="bright-future-academy"
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Lowercase letters, numbers, and hyphens only. Leave blank and we'll assign one.</p>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Mail className="w-4 h-4 text-indigo-600" /> Contact Details
          </h2>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Admin Email (Portal Login) <span className="text-rose-500">*</span></label>
            <input type="email" value={form.adminEmail} onChange={f('adminEmail')} required placeholder="admin@yourschool.ng"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Primary Phone <span className="text-rose-500">*</span></label>
              <input type="tel" value={form.contactPhone} onChange={f('contactPhone')} required placeholder="080XXXXXXXX"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Secondary Phone</label>
              <input type="tel" value={form.contactPhone2} onChange={f('contactPhone2')} placeholder="Optional"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Report Forwarding Email
            </label>
            <input type="email" value={form.reportEmail} onChange={f('reportEmail')} placeholder="Where to send grade/attendance reports (optional)"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" /> Leave a Review <span className="text-slate-400 font-normal">(optional)</span>
          </h2>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => setForm(p => ({ ...p, stars: n }))}
                className={`transition-colors ${form.stars >= n ? 'text-amber-400' : 'text-slate-200 hover:text-amber-300'}`}>
                <Star className="w-7 h-7 fill-current" />
              </button>
            ))}
          </div>
          <textarea value={form.review} onChange={f('review')} rows={3}
            placeholder="How was your demo experience? What feature did you find most useful?"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
        </section>

        <button type="submit" disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {saving ? 'Submitting…' : 'Submit Conversion Request'}
        </button>
        <p className="text-center text-xs text-slate-400">
          Our team will review and activate your account. No payment needed until after activation.
        </p>
      </form>
    </div>
  );
}
