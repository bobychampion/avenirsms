import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, orderBy, where, doc, updateDoc } from 'firebase/firestore';
import { Application, ApplicationStatus } from '../types';
import { useAuth } from '../components/FirebaseProvider';
import { motion } from 'motion/react';
import { Search, Filter, Eye, Clock, CheckCircle2, XCircle, AlertCircle, Users, FileText, ChevronRight, GraduationCap, BookOpen, FileBarChart, Calendar, LayoutGrid, DollarSign, RefreshCw } from 'lucide-react';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<ApplicationStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [resetting, setResetting] = useState(false);

  const handleResetProfile = async () => {
    if (!user) return;
    setResetting(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { role: 'admin' });
      alert('Admin profile reset successfully. Please refresh the page.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    const q = filterStatus === 'all' 
      ? query(collection(db, 'applications'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'applications'), where('status', '==', filterStatus), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Application));
      setApplications(apps);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'applications'));

    return () => unsubscribe();
  }, [filterStatus]);

  const filteredApps = applications.filter(app => 
    app.applicantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.nin.includes(searchTerm)
  );

  const stats = {
    total: applications.length,
    pending: applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Admissions & Academic Dashboard</h1>
          <p className="text-slate-500 mt-1">Manage student applications, grades, and examinations.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleResetProfile}
            disabled={resetting}
            className="flex items-center px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 text-indigo-600 ${resetting ? 'animate-spin' : ''}`} />
            {resetting ? 'Resetting...' : 'Reset Admin Profile'}
          </button>
          <Link
            to="/admin/finance"
            className="flex items-center px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm text-sm"
          >
            <DollarSign className="w-4 h-4 mr-2 text-indigo-600" />
            Finance
          </Link>
          <Link
            to="/admin/users"
            className="flex items-center px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm text-sm"
          >
            <Users className="w-4 h-4 mr-2 text-indigo-600" />
            Users
          </Link>
          <Link
            to="/admin/students"
            className="flex items-center px-3 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-sm text-sm"
          >
            <GraduationCap className="w-4 h-4 mr-2" />
            Directory
          </Link>
          <Link
            to="/admin/gradebook"
            className="flex items-center px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm text-sm"
          >
            <BookOpen className="w-4 h-4 mr-2 text-indigo-600" />
            Gradebook
          </Link>
          <Link
            to="/admin/report-cards"
            className="flex items-center px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm text-sm"
          >
            <FileBarChart className="w-4 h-4 mr-2 text-indigo-600" />
            Reports
          </Link>
          <Link
            to="/admin/classes"
            className="flex items-center px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm text-sm"
          >
            <LayoutGrid className="w-4 h-4 mr-2 text-indigo-600" />
            Classes
          </Link>
          <Link
            to="/admin/timetable"
            className="flex items-center px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm text-sm"
          >
            <LayoutGrid className="w-4 h-4 mr-2 text-indigo-600" />
            Timetable
          </Link>
          <Link
            to="/calendar"
            className="flex items-center px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm text-sm"
          >
            <Calendar className="w-4 h-4 mr-2 text-indigo-600" />
            Calendar
          </Link>
          <Link
            to="/admin/exams"
            className="flex items-center px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm text-sm"
          >
            <Calendar className="w-4 h-4 mr-2 text-indigo-600" />
            Exams
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="relative flex-grow sm:flex-grow-0">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search applicants..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-full sm:w-64 text-sm"
            />
          </div>
          <div className="relative">
            <Filter className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className="pl-10 pr-8 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white font-medium text-slate-700 text-sm"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="reviewing">Reviewing</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
        <div className="text-sm text-slate-400 font-medium">
          Showing {filteredApps.length} of {applications.length} applications
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard title="Total Applications" value={stats.total} icon={<FileText className="w-6 h-6 text-indigo-600" />} color="indigo" />
        <StatCard title="Pending Review" value={stats.pending} icon={<Clock className="w-6 h-6 text-amber-600" />} color="amber" />
        <StatCard title="Approved" value={stats.approved} icon={<CheckCircle2 className="w-6 h-6 text-emerald-600" />} color="emerald" />
        <StatCard title="Rejected" value={stats.rejected} icon={<XCircle className="w-6 h-6 text-rose-600" />} color="rose" />
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">Applicant</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">Class</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">NIN</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Loading applications...</td>
                </tr>
              ) : filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">No applications found.</td>
                </tr>
              ) : (
                filteredApps.map((app) => (
                  <motion.tr 
                    key={app.id} 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    className="hover:bg-slate-50 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold mr-3">
                          {app.applicantName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{app.applicantName}</p>
                          <p className="text-xs text-slate-500">{app.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">{app.classApplyingFor}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{app.nin}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        to={`/admin/application/${app.id}`}
                        className="inline-flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-all group-hover:shadow-sm"
                      >
                        Review
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Link>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }: any) {
  const colors: any = {
    indigo: 'bg-indigo-50 text-indigo-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl ${colors[color]}`}>
          {icon}
        </div>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Live</span>
      </div>
      <p className="text-3xl font-extrabold text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-500">{title}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const styles: any = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    reviewing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}
