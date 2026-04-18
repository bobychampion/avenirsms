import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, orderBy, where, getDocs, updateDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Student, SCHOOL_CLASSES, SchoolClass } from '../types';
import { useSchoolId } from '../hooks/useSchoolId';
import { useSchoolSettings } from './SchoolSettings';
import { buildStudentLoginEmail } from '../utils/studentAccount';
import { motion } from 'motion/react';
import { Search, Filter, User, Phone, Mail, Calendar, Hash, ArrowRight, ArrowLeft, ChevronLeft, ChevronRight, KeyRound, X, Loader2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const PAGE_SIZE = 20;

export default function StudentList() {
  const schoolId = useSchoolId();
  const { settings: schoolSettings } = useSchoolSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialClass = searchParams.get('class') || 'all';

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState(initialClass);
  const [currentPage, setCurrentPage] = useState(0);

  // Set-password modal state
  const [pwStudent, setPwStudent] = useState<Student | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const handleSetPassword = async () => {
    if (!pwStudent || !newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setPwSaving(true);
    try {
      const suffix = Date.now().toString(36);
      const newEmail = buildStudentLoginEmail(`${pwStudent.studentId}-${suffix}`, schoolSettings);

      // Create new Firebase Auth account via secondary app
      const secondaryApp = getApps().find(a => a.name === 'student-pw-reset')
        || initializeApp(firebaseConfig as any, 'student-pw-reset');
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      await firebaseSignOut(secondaryAuth);

      // Disable old auth account's Firestore profile (if one exists)
      if (pwStudent.loginEmail) {
        const oldUserSnap = await getDocs(
          query(collection(db, 'users'), where('email', '==', pwStudent.loginEmail))
        );
        for (const d of oldUserSnap.docs) {
          await updateDoc(d.ref, { disabled: true });
        }
      }

      // Write new users profile
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: newEmail,
        role: 'student',
        displayName: pwStudent.studentName,
        schoolId: pwStudent.schoolId ?? schoolId ?? undefined,
        linkedStudentIds: [pwStudent.id!],
        mustChangePassword: false,
        syntheticLogin: true,
        createdAt: serverTimestamp(),
      });

      // Update student doc with new loginEmail
      await updateDoc(doc(db, 'students', pwStudent.id!), { loginEmail: newEmail });

      toast.success(`Password set for ${pwStudent.studentName}.`);
      alert(
        `✅ Password set for ${pwStudent.studentName}\n\n` +
        `Student ID: ${pwStudent.studentId}\n` +
        `New Password: ${newPassword}\n\n` +
        `Share this with the student. They sign in using their Student ID, not the email address.`
      );
      setPwStudent(null);
      setNewPassword('');
    } catch (err: any) {
      console.error('Set password failed:', err);
      toast.error(err.message || 'Could not set password.');
    } finally {
      setPwSaving(false);
    }
  };

  useEffect(() => {
    if (!schoolId) return;
    const q = query(collection(db, 'students'), where('schoolId', '==', schoolId!), orderBy('enrolledAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(data);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'students'));

    const classesQuery = query(collection(db, 'classes'), where('schoolId', '==', schoolId!));
    const unsubscribeClasses = onSnapshot(classesQuery, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolClass)));
    });

    return () => {
      unsubscribe();
      unsubscribeClasses();
    };
  }, [schoolId]);

  useEffect(() => {
    if (classFilter === 'all') {
      searchParams.delete('class');
    } else {
      searchParams.set('class', classFilter);
    }
    setSearchParams(searchParams);
    setCurrentPage(0); // reset page on filter change
  }, [classFilter]);

  // Also reset on search change
  useEffect(() => { setCurrentPage(0); }, [searchTerm]);

  const filteredStudents = students.filter(student => {
    const matchesSearch = 
      student.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesClass = classFilter === 'all' || student.currentClass === classFilter;
    
    return matchesSearch && matchesClass;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <Link to="/admin" className="text-indigo-600 hover:text-indigo-700 font-bold text-sm flex items-center">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>
      </div>
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Student Directory</h1>
        <p className="text-slate-500 mt-1">Manage and view all currently enrolled students.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-grow">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, ID, or email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>
        <div className="relative min-w-[200px]">
          <Filter className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="w-full pl-10 pr-8 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none bg-white font-medium text-slate-700"
          >
            <option value="all">All Classes</option>
            {classes.length > 0 ? (
              classes.map(c => <option key={c.id} value={c.name}>{c.name} ({c.level})</option>)
            ) : (
              SCHOOL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)
            )}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading students...</div>
      ) : filteredStudents.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <User className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No students found matching your criteria.</p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStudents.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((student) => (
            <motion.div
              key={student.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center">
                  <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xl mr-4 shadow-indigo-100 shadow-lg">
                    {student.studentName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{student.studentName}</h3>
                    <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{student.studentId}</p>
                  </div>
                </div>
                <div className="px-3 py-1 bg-slate-50 rounded-full border border-slate-100 text-xs font-bold text-slate-600">
                  {student.currentClass}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center text-sm text-slate-600">
                  <Mail className="w-4 h-4 mr-3 text-slate-400" />
                  {student.email}
                </div>
                <div className="flex items-center text-sm text-slate-600">
                  <Phone className="w-4 h-4 mr-3 text-slate-400" />
                  {student.phone}
                </div>
                <div className="flex items-center text-sm text-slate-600">
                  <Calendar className="w-4 h-4 mr-3 text-slate-400" />
                  Born: {student.dob}
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center gap-2">
                <button
                  onClick={() => { setPwStudent(student); setNewPassword(''); }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700"
                >
                  <KeyRound className="w-3 h-3" /> Set Password
                </button>
                <Link
                  to={`/admin/students/${student.id}`}
                  className="inline-flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-700"
                >
                  View Profile <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
        {/* Pagination */}
        {Math.ceil(filteredStudents.length / PAGE_SIZE) > 1 && (
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-200">
            <p className="text-sm text-slate-500">
              Page {currentPage + 1} of {Math.ceil(filteredStudents.length / PAGE_SIZE)} &nbsp;·&nbsp; {filteredStudents.length} students
            </p>
            <div className="flex gap-2">
              <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}
                className="flex items-center gap-1 px-4 py-2 text-sm font-bold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <button disabled={currentPage >= Math.ceil(filteredStudents.length / PAGE_SIZE) - 1} onClick={() => setCurrentPage(p => p + 1)}
                className="flex items-center gap-1 px-4 py-2 text-sm font-bold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* ── Set Password Modal ── */}
      {pwStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Set Portal Password</h2>
                <p className="text-xs text-slate-500 mt-0.5">{pwStudent.studentName} · {pwStudent.studentId}</p>
              </div>
              <button onClick={() => setPwStudent(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">New Password</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
                  placeholder="Min. 8 characters"
                  autoFocus
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  The student signs in with their Student ID + this password. Share it with them directly.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPwStudent(null)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSetPassword}
                  disabled={pwSaving || newPassword.length < 8}
                  className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
                >
                  {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {pwSaving ? 'Saving...' : 'Set Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
