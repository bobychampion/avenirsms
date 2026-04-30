import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, getDoc, doc, getDocs } from 'firebase/firestore';
import { Application, NIGERIAN_REGULATIONS } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { User, BookOpen, Phone, FileUp, CheckCircle, AlertTriangle, ArrowRight, ArrowLeft, Loader2, Heart } from 'lucide-react';
import { differenceInYears, parseISO } from 'date-fns';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog';

const RELATIONSHIPS = ['father', 'mother', 'uncle', 'aunt', 'sibling', 'guardian', 'other'];

export default function Apply() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // schoolId comes from URL param when accessed via /s/:schoolId/apply
  const { schoolId: urlSchoolId } = useParams<{ schoolId?: string }>();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [schoolName, setSchoolName] = useState<string>('');
  const [schoolClasses, setSchoolClasses] = useState<string[]>([]);
  const [existingApplication, setExistingApplication] = useState<Application | null>(null);
  const [formData, setFormData] = useState<Partial<Application>>({
    applicantName: '',
    email: user?.email || '',
    phone: '',
    dob: '',
    gender: 'male',
    nin: '',
    classApplyingFor: '',
    previousSchool: '',
    waecNecoNumber: '',
    status: 'pending',
    applicantUid: user?.uid || '',
    guardianName: '',
    guardianPhone: '',
    guardianEmail: '',
    guardianRelationship: 'father',
    guardianAddress: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Guard navigation away from partially filled form
  const { blocker } = useUnsavedChanges(isDirty && !submitted && !existingApplication);

  /** Update form field and mark as dirty */
  const updateForm = (patch: Partial<Application>) => {
    setFormData(prev => ({ ...prev, ...patch }));
    setIsDirty(true);
  };

  // Load school name and classes for display
  useEffect(() => {
    if (!urlSchoolId) return;
    // School name
    getDoc(doc(db, 'school_settings', urlSchoolId)).then(snap => {
      if (snap.exists()) setSchoolName((snap.data() as any).schoolName || '');
    });
    // School's actual classes (created by the school admin)
    getDocs(query(collection(db, 'classes'), where('schoolId', '==', urlSchoolId)))
      .then(snap => {
        const names = snap.docs
          .map(d => (d.data() as any).name as string)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        setSchoolClasses(names);
      });
  }, [urlSchoolId]);

  // Check if this user already applied to THIS school
  useEffect(() => {
    if (!user) return;
    const constraints = [where('applicantUid', '==', user.uid)];
    if (urlSchoolId) constraints.push(where('schoolId', '==', urlSchoolId));
    const q = query(collection(db, 'applications'), ...constraints);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setExistingApplication({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Application);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'applications'));

    return () => unsubscribe();
  }, [user, urlSchoolId]);

  const validateStep = () => {
    const newErrors: Record<string, string> = {};
    if (step === 1) {
      if (!formData.applicantName) newErrors.applicantName = 'Name is required';
      if (!formData.dob) newErrors.dob = 'Date of birth is required';
      // NIN is optional — only validate length if provided
      if (formData.nin && formData.nin.length !== 11) newErrors.nin = 'NIN must be 11 digits if provided';
    }
    if (step === 2) {
      if (!formData.classApplyingFor) newErrors.classApplyingFor = 'Target class is required';
      if (formData.dob && formData.classApplyingFor) {
        const age = differenceInYears(new Date(), parseISO(formData.dob));
        if (formData.classApplyingFor.startsWith('Primary') && age < NIGERIAN_REGULATIONS.minAgePrimary1) {
          newErrors.dob = `Minimum age for Primary school is ${NIGERIAN_REGULATIONS.minAgePrimary1} years.`;
        }
      }
      if (formData.classApplyingFor?.startsWith('SSS') && !formData.waecNecoNumber) {
        newErrors.waecNecoNumber = 'WAEC/NECO number is required for SSS admission';
      }
    }
    if (step === 3) {
      if (!formData.phone) newErrors.phone = 'Applicant phone number is required';
      if (!formData.guardianName) newErrors.guardianName = 'Guardian full name is required';
      if (!formData.guardianPhone) newErrors.guardianPhone = 'Guardian phone number is required';
      if (formData.guardianEmail && !/\S+@\S+\.\S+/.test(formData.guardianEmail)) {
        newErrors.guardianEmail = 'Please enter a valid email address';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep()) setStep(s => s + 1);
  };

  const prevStep = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'applications'), {
        ...formData,
        ...(urlSchoolId ? { schoolId: urlSchoolId } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSubmitted(true);
      setIsDirty(false);
      setStep(6); // Success step
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'applications');
    } finally {
      setLoading(false);
    }
  };

  if (existingApplication) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Application Already Submitted</h2>
          <p className="text-slate-600 mb-8 max-w-md mx-auto">
            Your application for <strong>{existingApplication.classApplyingFor}</strong> is currently
            <span className="mx-1 px-2 py-1 rounded bg-indigo-100 text-indigo-700 font-medium capitalize">
              {existingApplication.status}
            </span>.
          </p>
          <div className="bg-slate-50 rounded-xl p-6 text-left border border-slate-100">
            <h3 className="font-semibold text-slate-900 mb-4">Application Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <p className="text-slate-500">Applicant Name</p>
              <p className="text-slate-900 font-medium">{existingApplication.applicantName}</p>
              <p className="text-slate-500">NIN</p>
              <p className="text-slate-900 font-medium">{existingApplication.nin || '—'}</p>
              <p className="text-slate-500">Submitted On</p>
              <p className="text-slate-900 font-medium">
                {existingApplication.createdAt?.toDate ? existingApplication.createdAt.toDate().toLocaleDateString() : 'Just now'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* School banner */}
      {schoolName && (
        <div className="mb-6 text-center">
          <p className="text-sm text-slate-500 uppercase tracking-widest font-medium">Applying to</p>
          <h1 className="text-2xl font-bold text-indigo-700">{schoolName}</h1>
        </div>
      )}
      {/* Unsaved changes guard */}
      <UnsavedChangesDialog
        blocker={blocker}
        title="Leave Application Form?"
        message="You have started filling out your application. If you leave now, your progress will be lost."
        discardLabel="Leave and discard"
        stayLabel="Stay and continue"
      />
      {/* Progress Bar */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col items-center flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                step >= i ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {i}
              </div>
              <span className={`text-xs mt-2 font-medium hidden sm:block ${
                step >= i ? 'text-indigo-600' : 'text-slate-400'
              }`}>
                {['Personal', 'Academic', 'Contact', 'Documents', 'Review'][i-1]}
              </span>
            </div>
          ))}
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-indigo-600"
            initial={{ width: '0%' }}
            animate={{ width: `${(step - 1) * 25}%` }}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-8">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center space-x-3 mb-6">
                  <User className="w-6 h-6 text-indigo-600" />
                  <h2 className="text-2xl font-bold text-slate-900">Personal Information</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    label="Full Name of Applicant"
                    error={errors.applicantName}
                    value={formData.applicantName}
                    onChange={v => updateForm({ applicantName: v })}
                    placeholder="John Doe"
                  />
                  <FormField
                    label="Date of Birth"
                    type="date"
                    error={errors.dob}
                    value={formData.dob}
                    onChange={v => updateForm({ dob: v })}
                  />
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Gender</label>
                    <select
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                      value={formData.gender}
                      onChange={e => updateForm({ gender: e.target.value as any })}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <FormField
                    label="National ID (NIN) — Optional"
                    error={errors.nin}
                    value={formData.nin}
                    onChange={v => updateForm({ nin: v })}
                    placeholder="11-digit number (if available)"
                    maxLength={11}
                  />
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center space-x-3 mb-6">
                  <BookOpen className="w-6 h-6 text-indigo-600" />
                  <h2 className="text-2xl font-bold text-slate-900">Academic Information</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Class Applying For</label>
                    <select
                      className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all ${errors.classApplyingFor ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'}`}
                      value={formData.classApplyingFor}
                      onChange={e => updateForm({ classApplyingFor: e.target.value })}
                    >
                      <option value="">Select class…</option>
                      {schoolClasses.length > 0
                        ? schoolClasses.map(c => <option key={c} value={c}>{c}</option>)
                        : <option disabled>No classes available</option>
                      }
                    </select>
                    {errors.classApplyingFor && (
                      <p className="text-sm text-rose-600 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 shrink-0" />{errors.classApplyingFor}
                      </p>
                    )}
                  </div>
                  <FormField
                    label="Previous School Attended"
                    value={formData.previousSchool}
                    onChange={v => updateForm({ previousSchool: v })}
                    placeholder="Name of school"
                  />
                  {formData.classApplyingFor?.startsWith('SSS') && (
                    <FormField
                      label="WAEC/NECO Examination Number"
                      error={errors.waecNecoNumber}
                      value={formData.waecNecoNumber}
                      onChange={v => updateForm({ waecNecoNumber: v })}
                      placeholder="Verification ID"
                    />
                  )}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center space-x-3 mb-2">
                  <Phone className="w-6 h-6 text-indigo-600" />
                  <h2 className="text-2xl font-bold text-slate-900">Contact Information</h2>
                </div>

                {/* Applicant contact */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    label="Parent/Guardian Email (login)"
                    value={formData.email}
                    disabled
                    onChange={() => {}}
                  />
                  <FormField
                    label="Applicant Phone Number"
                    error={errors.phone}
                    value={formData.phone}
                    onChange={v => updateForm({ phone: v })}
                    placeholder="+234..."
                  />
                </div>

                {/* Guardian section */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-4">
                    <Heart className="w-5 h-5 text-rose-400" />
                    <h3 className="text-base font-bold text-slate-800">Parent / Guardian Details</h3>
                  </div>
                  <p className="text-sm text-slate-500 mb-4">
                    This information is used to create a parent portal account so the guardian can
                    track grades, attendance, and fees online.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <FormField
                        label="Guardian Full Name *"
                        error={errors.guardianName}
                        value={formData.guardianName}
                        onChange={v => updateForm({ guardianName: v })}
                        placeholder="Full legal name"
                      />
                    </div>
                    <FormField
                      label="Guardian Phone *"
                      error={errors.guardianPhone}
                      value={formData.guardianPhone}
                      onChange={v => updateForm({ guardianPhone: v })}
                      placeholder="+234..."
                    />
                    <FormField
                      label="Guardian Email"
                      type="email"
                      error={errors.guardianEmail}
                      value={formData.guardianEmail}
                      onChange={v => updateForm({ guardianEmail: v })}
                      placeholder="email@example.com"
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Relationship to Applicant</label>
                      <select
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all capitalize"
                        value={formData.guardianRelationship}
                        onChange={e => updateForm({ guardianRelationship: e.target.value })}
                      >
                        {RELATIONSHIPS.map(r => (
                          <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <FormField
                        label="Guardian Address"
                        value={formData.guardianAddress}
                        onChange={v => updateForm({ guardianAddress: v })}
                        placeholder="Street address, city"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center space-x-3 mb-6">
                  <FileUp className="w-6 h-6 text-indigo-600" />
                  <h2 className="text-2xl font-bold text-slate-900">Document Upload</h2>
                </div>
                <div className="p-12 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-slate-50">
                  <FileUp className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-600 mb-2 font-medium">Upload Birth Certificate &amp; Transcripts</p>
                  <p className="text-slate-400 text-sm mb-6">PDF, JPG or PNG (Max 5MB)</p>
                  <button className="px-6 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium hover:bg-slate-100 transition-colors">
                    Select Files
                  </button>
                  <p className="mt-4 text-xs text-indigo-600 italic">* Simulated for demo purposes</p>
                </div>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center space-x-3 mb-6">
                  <CheckCircle className="w-6 h-6 text-indigo-600" />
                  <h2 className="text-2xl font-bold text-slate-900">Review Application</h2>
                </div>
                <div className="bg-slate-50 rounded-2xl p-6 space-y-4 border border-slate-100">
                  <ReviewItem label="Applicant Name" value={formData.applicantName} />
                  <ReviewItem label="Date of Birth" value={formData.dob} />
                  {formData.nin && <ReviewItem label="NIN" value={formData.nin} />}
                  <ReviewItem label="Class Applying For" value={formData.classApplyingFor} />
                  <ReviewItem label="Previous School" value={formData.previousSchool} />
                  {formData.waecNecoNumber && <ReviewItem label="WAEC/NECO Number" value={formData.waecNecoNumber} />}
                  <ReviewItem label="Contact Phone" value={formData.phone} />
                  <ReviewItem label="Guardian Name" value={formData.guardianName} />
                  <ReviewItem label="Guardian Phone" value={formData.guardianPhone} />
                  {formData.guardianEmail && <ReviewItem label="Guardian Email" value={formData.guardianEmail} />}
                  <ReviewItem label="Guardian Relationship" value={formData.guardianRelationship} />
                </div>
                <div className="flex items-start p-4 bg-amber-50 rounded-xl border border-amber-100">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mr-3 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    By submitting, you confirm that all information provided is accurate and
                    consents to identity verification via national databases.
                  </p>
                </div>
              </motion.div>
            )}

            {step === 6 && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 mb-4">Application Submitted!</h2>
                <p className="text-slate-600 mb-8 max-w-md mx-auto">
                  Your application has been received and is being reviewed by our admissions team.
                  You will be notified via email of any updates.
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all"
                >
                  Return Home
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {step < 6 && (
          <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 flex justify-between">
            <button
              onClick={prevStep}
              disabled={step === 1 || loading}
              className={`flex items-center px-6 py-2 rounded-lg font-medium transition-colors ${
                step === 1 ? 'text-slate-300' : 'text-slate-600 hover:text-indigo-600'
              }`}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </button>
            {step < 5 ? (
              <button
                onClick={nextStep}
                className="flex items-center px-8 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
              >
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center px-8 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Submit Application
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FormField({ label, type = 'text', error, value, onChange, placeholder, maxLength, disabled }: any) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <input
        type={type}
        disabled={disabled}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${
          error ? 'border-red-300 bg-red-50 focus:ring-red-500' : 'border-slate-200 focus:ring-2 focus:ring-indigo-500'
        } ${disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
      />
      {error && <p className="text-xs font-medium text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-200 last:border-0">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="text-slate-900 font-semibold">{value || 'N/A'}</span>
    </div>
  );
}
