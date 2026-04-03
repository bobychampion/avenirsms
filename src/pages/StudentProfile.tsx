import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { Student, SCHOOL_CLASSES, SchoolClass, Grade, CURRENT_SESSION, TERMS } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { generateStudentInsights } from '../services/geminiService';
import { 
  ArrowLeft, User, Phone, Mail, GraduationCap, Calendar, Hash, 
  ShieldCheck, Database, Save, Loader2, Heart, Users, BookOpen,
  Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle,
  CreditCard, Printer, X, CheckCircle2, ChevronRight
} from 'lucide-react';

interface AIInsight {
  overallRemark: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  trend: 'improving' | 'stable' | 'declining';
  riskLevel: 'low' | 'medium' | 'high';
}

export default function StudentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Student>>({});

  // AI Insights
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showInsightModal, setShowInsightModal] = useState(false);
  const [insightTerm, setInsightTerm] = useState<'1st Term' | '2nd Term' | '3rd Term'>(TERMS[0]);

  // ID Card
  const [showIdCard, setShowIdCard] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, 'students', id), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Student;
        setStudent({ id: snapshot.id, ...data });
        setFormData(data);
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, `students/${id}`));

    return () => unsubscribe();
  }, [id]);

  useEffect(() => {
    const q = query(collection(db, 'classes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolClass)));
    });
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'students', id), {
        ...formData,
        updatedAt: serverTimestamp()
      });
      toast.success('Profile updated successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateInsights = async () => {
    if (!student) return;
    setAiLoading(true);
    setShowInsightModal(true);
    setAiInsight(null);
    const tid = toast.loading('Analysing student data…');
    try {
      // Fetch grades for the selected term
      const gradesSnap = await getDocs(query(
        collection(db, 'grades'),
        where('studentId', '==', student.id),
        where('term', '==', insightTerm),
        where('session', '==', CURRENT_SESSION)
      ));
      const grades = gradesSnap.docs.map(d => {
        const g = d.data() as Grade;
        return { subject: g.subject, total: g.totalScore ?? (g.caScore + g.examScore), grade: g.grade };
      });

      // Fetch attendance
      const attSnap = await getDocs(query(collection(db, 'attendance'), where('studentId', '==', student.id)));
      const total = attSnap.size;
      const present = attSnap.docs.filter(d => d.data().status === 'present').length;
      const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 100;

      // Fetch skills
      const skillsSnap = await getDocs(query(
        collection(db, 'student_skills'),
        where('studentId', '==', student.id),
        where('term', '==', insightTerm)
      ));
      const skills = skillsSnap.empty ? undefined : skillsSnap.docs[0].data().skills;

      const result = await generateStudentInsights(student.studentName, student.currentClass, grades, attendanceRate, skills);
      setAiInsight(result);
      toast.success('Insights ready!', { id: tid });
    } catch (e: any) {
      toast.error('Failed to generate insights', { id: tid });
      setShowInsightModal(false);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900">Student not found</h2>
          <button onClick={() => navigate('/admin/students')} className="mt-4 text-indigo-600 font-bold">
            Back to Directory
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center space-x-4 mb-8">
        <button
          onClick={() => navigate('/admin/students')}
          className="flex items-center text-slate-500 hover:text-indigo-600 transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Directory
        </button>
        <span className="text-slate-300">|</span>
        <Link to="/admin" className="text-slate-500 hover:text-indigo-600 transition-colors font-medium">
          Dashboard
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div className="flex items-center">
          <div className="w-20 h-20 rounded-3xl bg-indigo-600 flex items-center justify-center text-white font-bold text-3xl mr-6 shadow-xl shadow-indigo-100">
            {student.studentName.charAt(0)}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{student.studentName}</h1>
            <div className="flex items-center mt-1 space-x-3">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{student.studentId}</span>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{student.currentClass}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* ID Card button */}
          <button
            onClick={() => setShowIdCard(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm"
          >
            <CreditCard className="w-4 h-4 text-slate-500" />
            ID Card
          </button>
          {/* AI Insights button */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <select
              value={insightTerm}
              onChange={e => setInsightTerm(e.target.value as '1st Term' | '2nd Term' | '3rd Term')}
              className="px-3 py-2.5 text-sm font-medium outline-none bg-transparent border-r border-slate-200"
            >
              {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={handleGenerateInsights}
              disabled={aiLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 transition-all disabled:opacity-60"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              AI Insights
            </button>
          </div>
          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 text-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Personal Information */}
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
              <User className="w-5 h-5 mr-3 text-indigo-600" />
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  name="studentName"
                  value={formData.studentName || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Phone Number</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date of Birth</label>
                <input
                  type="date"
                  name="dob"
                  value={formData.dob || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gender</label>
                <select
                  name="gender"
                  value={formData.gender || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Class</label>
                <select
                  name="currentClass"
                  value={formData.currentClass || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="">Select Class...</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.name}>{cls.name} ({cls.level})</option>
                  ))}
                  {/* Fallback to default classes if no custom classes defined */}
                  {classes.length === 0 && SCHOOL_CLASSES.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">NIN</label>
                <input
                  type="text"
                  name="nin"
                  value={formData.nin || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          </section>

          {/* Guardian Details */}
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
              <Users className="w-5 h-5 mr-3 text-indigo-600" />
              Guardian Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Guardian Name</label>
                <input
                  type="text"
                  name="guardianName"
                  value={formData.guardianName || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Relationship</label>
                <input
                  type="text"
                  name="guardianRelationship"
                  value={formData.guardianRelationship || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Guardian Email</label>
                <input
                  type="email"
                  name="guardianEmail"
                  value={formData.guardianEmail || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="parent@example.com"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Guardian Phone</label>
                <input
                  type="text"
                  name="guardianPhone"
                  value={formData.guardianPhone || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          </section>

          {/* Academic History */}
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
              <BookOpen className="w-5 h-5 mr-3 text-indigo-600" />
              Academic History
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Previous School</label>
                <input
                  type="text"
                  name="previousSchool"
                  value={formData.previousSchool || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Previous Class</label>
                <input
                  type="text"
                  name="previousClass"
                  value={formData.previousClass || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-8">
          {/* Medical Information */}
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
              <Heart className="w-5 h-5 mr-3 text-rose-600" />
              Medical Info
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Blood Group</label>
                <select
                  name="bloodGroup"
                  value={formData.bloodGroup || ''}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="">Select...</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Allergies</label>
                <textarea
                  name="allergies"
                  value={formData.allergies || ''}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  placeholder="List any allergies..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Medical Conditions</label>
                <textarea
                  name="medicalConditions"
                  value={formData.medicalConditions || ''}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  placeholder="Any chronic conditions..."
                />
              </div>
            </div>
          </section>

          {/* Enrollment Status */}
          <section className="bg-indigo-900 rounded-3xl p-8 text-white">
            <h3 className="text-lg font-bold mb-6 flex items-center">
              <ShieldCheck className="w-5 h-5 mr-3 text-indigo-300" />
              Enrollment
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Enrollment Date</p>
                <p className="font-medium">{student.enrolledAt?.toDate?.()?.toLocaleDateString() || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Current Class</p>
                <p className="font-medium">{student.currentClass}</p>
              </div>
              <div className="pt-4 border-t border-indigo-800">
                <p className="text-xs text-indigo-200 italic">
                  This student record is linked to application ID: {student.applicationId}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

      {/* ── AI INSIGHTS MODAL ── */}
      <AnimatePresence>
        {showInsightModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowInsightModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-gradient-to-r from-violet-600 to-indigo-600 p-6 rounded-t-3xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-white">AI Student Insights</h2>
                      <p className="text-violet-200 text-xs">{student.studentName} · {insightTerm}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowInsightModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 transition-colors">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {aiLoading ? (
                  <div className="py-16 flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin" />
                    <p className="text-slate-500 text-sm font-medium">Analysing academic data with AI…</p>
                    <p className="text-slate-400 text-xs">This may take a few seconds</p>
                  </div>
                ) : aiInsight ? (
                  <>
                    {/* Risk + Trend badges */}
                    <div className="flex gap-2 flex-wrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        aiInsight.riskLevel === 'low' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        aiInsight.riskLevel === 'medium' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {aiInsight.riskLevel === 'low' ? '🟢' : aiInsight.riskLevel === 'medium' ? '🟡' : '🔴'} Risk: {aiInsight.riskLevel.charAt(0).toUpperCase() + aiInsight.riskLevel.slice(1)}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                        aiInsight.trend === 'improving' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        aiInsight.trend === 'declining' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        'bg-slate-50 text-slate-700 border border-slate-200'
                      }`}>
                        {aiInsight.trend === 'improving' ? <TrendingUp className="w-3 h-3" /> : aiInsight.trend === 'declining' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        Trend: {aiInsight.trend.charAt(0).toUpperCase() + aiInsight.trend.slice(1)}
                      </span>
                    </div>

                    {/* Overall Remark */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Overall Assessment</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{aiInsight.overallRemark}</p>
                    </div>

                    {/* Strengths */}
                    <div>
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Strengths
                      </p>
                      <div className="space-y-1.5">
                        {aiInsight.strengths.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                            <span className="text-sm text-emerald-800">{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Weaknesses */}
                    <div>
                      <p className="text-xs font-bold text-rose-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Areas for Improvement
                      </p>
                      <div className="space-y-1.5">
                        {aiInsight.weaknesses.map((w, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 bg-rose-50 rounded-xl border border-rose-100">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                            <span className="text-sm text-rose-800">{w}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recommendations */}
                    <div>
                      <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <ChevronRight className="w-3.5 h-3.5" /> Recommendations
                      </p>
                      <ol className="space-y-2">
                        {aiInsight.recommendations.map((r, i) => (
                          <li key={i} className="flex gap-3 px-3 py-2.5 bg-indigo-50 rounded-xl border border-indigo-100">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                            <span className="text-sm text-indigo-900 leading-relaxed">{r}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <p className="text-[10px] text-slate-400 text-center">Generated by Gemini AI · For guidance purposes only</p>
                  </>
                ) : (
                  <div className="py-12 text-center text-slate-400">
                    <p className="text-sm">Failed to generate insights. Please try again.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── ID CARD MODAL ── */}
      <AnimatePresence>
        {showIdCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowIdCard(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-sm">
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-black text-slate-900">Student ID Card</h2>
                  <button onClick={() => setShowIdCard(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                    <X className="w-4 h-4 text-slate-600" />
                  </button>
                </div>

                {/* The Card itself */}
                <div id="student-id-card" className="bg-gradient-to-br from-indigo-700 to-violet-700 rounded-2xl p-5 text-white shadow-xl shadow-indigo-200">
                  {/* School header */}
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/20">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                      <GraduationCap className="w-5 h-5 text-indigo-700" />
                    </div>
                    <div>
                      <p className="text-sm font-black uppercase tracking-wide">Avenir School</p>
                      <p className="text-indigo-200 text-[10px]">Student Identification Card</p>
                    </div>
                  </div>

                  {/* Photo placeholder + name */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-20 bg-white/20 rounded-xl flex items-center justify-center text-3xl font-black border-2 border-white/30">
                      {student.studentName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-base leading-tight">{student.studentName}</p>
                      <p className="text-indigo-200 text-xs mt-1">{student.currentClass}</p>
                      <p className="text-indigo-300 text-[10px] mt-0.5">{student.gender?.charAt(0).toUpperCase() + (student.gender?.slice(1) || '')}</p>
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-white/10 rounded-xl p-2.5">
                      <p className="text-[9px] font-bold text-indigo-300 uppercase tracking-wider">Student ID</p>
                      <p className="text-xs font-black font-mono mt-0.5">{student.studentId}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-2.5">
                      <p className="text-[9px] font-bold text-indigo-300 uppercase tracking-wider">Session</p>
                      <p className="text-xs font-black mt-0.5">{CURRENT_SESSION}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-2.5">
                      <p className="text-[9px] font-bold text-indigo-300 uppercase tracking-wider">Guardian</p>
                      <p className="text-xs font-semibold mt-0.5 truncate">{student.guardianName || '—'}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-2.5">
                      <p className="text-[9px] font-bold text-indigo-300 uppercase tracking-wider">Blood Group</p>
                      <p className="text-xs font-black mt-0.5">{student.bloodGroup || '—'}</p>
                    </div>
                  </div>

                  {/* Barcode placeholder */}
                  <div className="bg-white/10 rounded-xl p-2.5 text-center">
                    <p className="text-[9px] text-indigo-300 font-mono tracking-widest">{student.studentId?.padStart(12, '0')}</p>
                    <div className="mt-1 flex justify-center gap-px">
                      {Array.from({ length: 28 }).map((_, i) => (
                        <div key={i} className={`bg-white rounded-sm ${i % 3 === 0 ? 'w-1 h-6' : i % 2 === 0 ? 'w-0.5 h-5' : 'w-0.5 h-6'}`} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 mt-4">
                  <button onClick={() => setShowIdCard(false)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-200 transition-all">
                    Close
                  </button>
                  <button
                    onClick={() => {
                      const orig = document.title;
                      document.title = `ID-Card-${student.studentName}`;
                      window.print();
                      document.title = orig;
                    }}
                    className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                    <Printer className="w-4 h-4" /> Print Card
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
