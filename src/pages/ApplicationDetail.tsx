import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp, addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Application, ApplicationStatus, NIGERIAN_REGULATIONS, Student } from '../types';
import { motion } from 'motion/react';
import { 
  ArrowLeft, CheckCircle, XCircle, Clock, ShieldCheck, 
  Database, User, BookOpen, Phone, FileText, AlertTriangle, 
  Loader2, Save, Send, MessageSquare
} from 'lucide-react';
import { differenceInYears, parseISO } from 'date-fns';
import { StatusBadge } from './AdminDashboard';

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [verifyingNIN, setVerifyingNIN] = useState(false);
  const [verifyingExam, setVerifyingExam] = useState(false);
  const [ninVerified, setNinVerified] = useState(false);
  const [examVerified, setExamVerified] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, 'applications', id), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Application;
        setApplication({ id: snapshot.id, ...data });
        setNotes(data.reviewerNotes || '');
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, `applications/${id}`));

    return () => unsubscribe();
  }, [id]);

  const handleStatusUpdate = async (newStatus: ApplicationStatus) => {
    if (!id || !application) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'applications', id), {
        status: newStatus,
        reviewerNotes: notes,
        updatedAt: serverTimestamp(),
      });

      // If approved, create a student record if it doesn't exist
      if (newStatus === 'approved') {
        const studentQuery = query(collection(db, 'students'), where('applicationId', '==', id));
        const studentSnap = await getDocs(studentQuery);
        
        if (studentSnap.empty) {
          const studentId = `STU-${Math.floor(1000 + Math.random() * 9000)}`;
          const newStudent: Student = {
            studentName: application.applicantName,
            email: application.email,
            phone: application.phone,
            dob: application.dob,
            gender: application.gender,
            nin: application.nin,
            currentClass: application.classApplyingFor,
            studentId: studentId,
            enrolledAt: serverTimestamp(),
            applicationId: id
          };
          await addDoc(collection(db, 'students'), newStudent);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `applications/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const simulateNINVerification = () => {
    setVerifyingNIN(true);
    setTimeout(() => {
      setVerifyingNIN(false);
      setNinVerified(true);
    }, 2000);
  };

  const simulateExamVerification = () => {
    setVerifyingExam(true);
    setTimeout(() => {
      setVerifyingExam(false);
      setExamVerified(true);
    }, 2500);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!application) return <div className="min-h-screen flex items-center justify-center">Application not found.</div>;

  const age = differenceInYears(new Date(), parseISO(application.dob));
  const isAgeEligible = application.classApplyingFor.startsWith('Primary') 
    ? age >= NIGERIAN_REGULATIONS.minAgePrimary1 
    : application.classApplyingFor.startsWith('JSS') 
      ? age >= NIGERIAN_REGULATIONS.minAgeJSS1 
      : age >= NIGERIAN_REGULATIONS.minAgeSSS1;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <button
        onClick={() => navigate('/admin')}
        className="flex items-center text-slate-500 hover:text-indigo-600 font-medium mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold mr-6">
                  {application.applicantName.charAt(0)}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{application.applicantName}</h1>
                  <div className="flex items-center mt-1 space-x-3">
                    <StatusBadge status={application.status} />
                    <span className="text-slate-400 text-sm">•</span>
                    <span className="text-slate-500 text-sm">Applied for {application.classApplyingFor}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <DetailSection icon={<User className="w-5 h-5" />} title="Personal Details">
                <DetailItem label="Date of Birth" value={`${application.dob} (${age} years old)`} />
                <DetailItem label="Gender" value={application.gender} className="capitalize" />
                <DetailItem label="NIN" value={application.nin} />
              </DetailSection>

              <DetailSection icon={<BookOpen className="w-5 h-5" />} title="Academic History">
                <DetailItem label="Target Class" value={application.classApplyingFor} />
                <DetailItem label="Previous School" value={application.previousSchool} />
                {application.waecNecoNumber && <DetailItem label="WAEC/NECO ID" value={application.waecNecoNumber} />}
              </DetailSection>

              <DetailSection icon={<Phone className="w-5 h-5" />} title="Contact Info">
                <DetailItem label="Email" value={application.email} />
                <DetailItem label="Phone" value={application.phone} />
              </DetailSection>

              <DetailSection icon={<FileText className="w-5 h-5" />} title="Documents">
                <div className="space-y-2 mt-2">
                  <div className="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100 group cursor-pointer hover:bg-indigo-50 hover:border-indigo-100 transition-all">
                    <FileText className="w-4 h-4 text-slate-400 mr-3 group-hover:text-indigo-500" />
                    <span className="text-sm font-medium text-slate-700">Birth_Certificate.pdf</span>
                  </div>
                  <div className="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100 group cursor-pointer hover:bg-indigo-50 hover:border-indigo-100 transition-all">
                    <FileText className="w-4 h-4 text-slate-400 mr-3 group-hover:text-indigo-500" />
                    <span className="text-sm font-medium text-slate-700">Last_Report_Card.pdf</span>
                  </div>
                </div>
              </DetailSection>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div className="flex items-center space-x-3 mb-6">
              <MessageSquare className="w-6 h-6 text-indigo-600" />
              <h2 className="text-xl font-bold text-slate-900">Reviewer Notes</h2>
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add internal notes about this application..."
              className="w-full h-32 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
            />
            <div className="flex justify-end mt-4">
              <button
                onClick={() => handleStatusUpdate(application.status)}
                disabled={saving}
                className="flex items-center px-6 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Notes
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-6">
          {/* Verification Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
              <ShieldCheck className="w-5 h-5 mr-2 text-indigo-600" />
              Verification Checks
            </h3>
            
            <div className="space-y-4">
              <VerificationItem 
                label="Age Eligibility" 
                status={isAgeEligible ? 'success' : 'error'} 
                message={isAgeEligible ? 'Meets minimum age' : 'Below minimum age'}
              />
              
              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">External Databases</p>
                <div className="space-y-3">
                  <button
                    onClick={simulateNINVerification}
                    disabled={verifyingNIN || ninVerified}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                      ninVerified ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center">
                      <ShieldCheck className={`w-4 h-4 mr-3 ${ninVerified ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span className={`text-sm font-bold ${ninVerified ? 'text-emerald-700' : 'text-slate-700'}`}>NIN Verification</span>
                    </div>
                    {verifyingNIN ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : 
                     ninVerified ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : null}
                  </button>

                  <button
                    onClick={simulateExamVerification}
                    disabled={verifyingExam || examVerified}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                      examVerified ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center">
                      <Database className={`w-4 h-4 mr-3 ${examVerified ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span className={`text-sm font-bold ${examVerified ? 'text-emerald-700' : 'text-slate-700'}`}>WAEC/NECO Sync</span>
                    </div>
                    {verifyingExam ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : 
                     examVerified ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : null}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Decision Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Admission Decision</h3>
            <div className="space-y-3">
              <button
                onClick={() => handleStatusUpdate('approved')}
                disabled={saving}
                className="w-full flex items-center justify-center px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-sm hover:shadow-emerald-100"
              >
                <CheckCircle className="w-5 h-5 mr-2" />
                Approve Admission
              </button>
              <button
                onClick={() => handleStatusUpdate('rejected')}
                disabled={saving}
                className="w-full flex items-center justify-center px-6 py-3 bg-white border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-50 transition-all"
              >
                <XCircle className="w-5 h-5 mr-2" />
                Reject Application
              </button>
              <button
                onClick={() => handleStatusUpdate('reviewing')}
                disabled={saving}
                className="w-full flex items-center justify-center px-6 py-3 bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 transition-all"
              >
                <Clock className="w-5 h-5 mr-2" />
                Mark as Reviewing
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 text-indigo-600">
        {icon}
        <h3 className="font-bold text-slate-900">{title}</h3>
      </div>
      <div className="space-y-3 pl-7">
        {children}
      </div>
    </div>
  );
}

function DetailItem({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-slate-700 font-medium ${className}`}>{value}</p>
    </div>
  );
}

function VerificationItem({ label, status, message }: { label: string; status: 'success' | 'error' | 'pending'; message: string }) {
  const icons = {
    success: <CheckCircle className="w-4 h-4 text-emerald-600" />,
    error: <AlertTriangle className="w-4 h-4 text-rose-600" />,
    pending: <Clock className="w-4 h-4 text-amber-600" />,
  };

  const bgColors = {
    success: 'bg-emerald-50 border-emerald-100',
    error: 'bg-rose-50 border-rose-100',
    pending: 'bg-amber-50 border-amber-100',
  };

  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border ${bgColors[status]}`}>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-bold ${status === 'success' ? 'text-emerald-700' : status === 'error' ? 'text-rose-700' : 'text-amber-700'}`}>
          {message}
        </p>
      </div>
      {icons[status]}
    </div>
  );
}
