import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, orderBy, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Student, Attendance } from '../types';
import { batchUpsertAttendance } from '../services/firestoreService';
import { useAuth } from '../components/FirebaseProvider';
import { suggestAttendanceAlert } from '../services/geminiService';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  ClipboardList, Search, CheckCircle, XCircle, Clock, Save,
  BarChart3, Filter, Calendar, Users, Sparkles, Bell
} from 'lucide-react';

type AttendanceStatus = 'present' | 'absent' | 'late';

interface AttendanceRow {
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [classRows, setClassRows] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'mark' | 'report' | 'monthly'>('mark');
  const [reportData, setReportData] = useState<{ studentId: string; studentName: string; present: number; absent: number; late: number; rate: number }[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [aiAlertLoading, setAiAlertLoading] = useState<string | null>(null);

  // Monthly view state
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [monthlyData, setMonthlyData] = useState<{
    studentId: string;
    studentName: string;
    cells: Record<string, 'present' | 'absent' | 'late' | null>;
    present: number; absent: number; late: number; rate: number;
  }[]>([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  // Load classes from Firestore so the dropdown matches actual data
  useEffect(() => {
    const q = query(collection(db, 'classes'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setClassRows(snap.docs.map(d => ({ id: d.id, name: (d.data().name as string) || '' })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    const q = query(
      collection(db, 'students'),
      where('currentClass', '==', selectedClass),
      orderBy('studentName', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
      setStudents(data);
    }, err => handleFirestoreError(err, OperationType.LIST, 'students'));
    return () => unsub();
  }, [selectedClass]);

  // Load existing attendance for the selected class+date
  useEffect(() => {
    if (!selectedClass || !selectedDate || students.length === 0) return;
    const loadExisting = async () => {
      const q = query(
        collection(db, 'attendance'),
        where('class', '==', selectedClass),
        where('date', '==', selectedDate)
      );
      const snap = await getDocs(q);
      const existing: Record<string, AttendanceStatus> = {};
      snap.docs.forEach(d => { existing[d.data().studentId] = d.data().status; });
      setAttendanceRows(students.map(s => ({
        studentId: s.id!,
        studentName: s.studentName,
        status: existing[s.id!] || 'present',
      })));
    };
    loadExisting().catch(console.error);
  }, [students, selectedDate, selectedClass]);

  const setAllStatus = (status: AttendanceStatus) => {
    setAttendanceRows(prev => prev.map(r => ({ ...r, status })));
  };

  const toggleStatus = (studentId: string) => {
    setAttendanceRows(prev => prev.map(r => {
      if (r.studentId !== studentId) return r;
      const cycle: AttendanceStatus[] = ['present', 'absent', 'late'];
      const next = cycle[(cycle.indexOf(r.status) + 1) % cycle.length];
      return { ...r, status: next };
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const records = attendanceRows.map(r => ({
      studentId: r.studentId,
      date: selectedDate,
      status: r.status,
      class: selectedClass,
      recordedBy: user.uid,
    }));
    const tid = toast.loading('Saving attendance…');
    try {
      await batchUpsertAttendance(records);
      toast.success('Attendance saved!', { id: tid });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      toast.error('Failed to save: ' + (e.message || 'Unknown error'), { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const loadReport = async () => {
    if (!selectedClass) return;
    setLoadingReport(true);
    const q = query(collection(db, 'attendance'), where('class', '==', selectedClass));
    const snap = await getDocs(q);
    const byStudent: Record<string, { id: string; name: string; present: number; absent: number; late: number }> = {};
    snap.docs.forEach(d => {
      const { studentId, status } = d.data();
      const student = students.find(s => s.id === studentId);
      if (!byStudent[studentId]) {
        byStudent[studentId] = { id: studentId, name: student?.studentName || studentId, present: 0, absent: 0, late: 0 };
      }
      if (status === 'present') byStudent[studentId].present++;
      else if (status === 'absent') byStudent[studentId].absent++;
      else if (status === 'late') byStudent[studentId].late++;
    });
    const report = Object.values(byStudent).map(s => {
      const total = s.present + s.absent + s.late;
      return { studentId: s.id, studentName: s.name, present: s.present, absent: s.absent, late: s.late, rate: total > 0 ? Math.round((s.present / total) * 100) : 0 };
    }).sort((a, b) => b.rate - a.rate);
    setReportData(report);
    setLoadingReport(false);
  };

  const loadMonthlyData = async () => {
    if (!selectedClass || !selectedMonth) return;
    setLoadingMonthly(true);
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = `${selectedMonth}-01`;
    const lastDay = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
    // Build array of day strings for the month
    const allDays: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      allDays.push(`${selectedMonth}-${String(d).padStart(2, '0')}`);
    }
    const q = query(
      collection(db, 'attendance'),
      where('class', '==', selectedClass),
      where('date', '>=', firstDay),
      where('date', '<=', lastDay)
    );
    const snap = await getDocs(q);
    // Build lookup: studentId -> day -> status
    const lookup: Record<string, Record<string, 'present' | 'absent' | 'late'>> = {};
    snap.docs.forEach(d => {
      const { studentId, date, status } = d.data();
      if (!lookup[studentId]) lookup[studentId] = {};
      lookup[studentId][date] = status;
    });
    const rows = students.map(s => {
      const cells: Record<string, 'present' | 'absent' | 'late' | null> = {};
      let present = 0, absent = 0, late = 0;
      allDays.forEach(day => {
        const st = lookup[s.id!]?.[day] || null;
        cells[day] = st;
        if (st === 'present') present++;
        else if (st === 'absent') absent++;
        else if (st === 'late') late++;
      });
      const total = present + absent + late;
      return { studentId: s.id!, studentName: s.studentName, cells, present, absent, late, rate: total > 0 ? Math.round((present / total) * 100) : 0 };
    }).sort((a, b) => a.studentName.localeCompare(b.studentName));
    setMonthlyData(rows);
    setLoadingMonthly(false);
  };

  const sendAIAlert = async (row: typeof reportData[0]) => {
    setAiAlertLoading(row.studentId);
    const tid = toast.loading(`Generating alert for ${row.studentName}…`);
    try {
      const msg = await suggestAttendanceAlert(row.studentName, row.rate, row.absent);
      // Store as a notification in Firestore (parent will see it)
      const student = students.find(s => s.id === row.studentId);
      if (student?.guardianUserId) {
        await addDoc(collection(db, 'notifications'), {
          recipientId: student.guardianUserId,
          title: `Attendance Alert — ${row.studentName}`,
          body: msg || `Attendance rate is ${row.rate}% with ${row.absent} absences.`,
          type: 'attendance',
          read: false,
          createdAt: serverTimestamp(),
        });
        toast.success(`Alert sent to parent of ${row.studentName}`, { id: tid });
      } else {
        // No linked parent — show the generated message to the admin
        toast.success('Alert generated (no linked parent account)', { id: tid });
        alert(`AI Alert for ${row.studentName}:\n\n${msg}`);
      }
    } catch (e: any) {
      toast.error('Failed to generate alert', { id: tid });
    } finally {
      setAiAlertLoading(null);
    }
  };

  const filtered = attendanceRows.filter(r =>
    r.studentName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const summary = {
    present: attendanceRows.filter(r => r.status === 'present').length,
    absent: attendanceRows.filter(r => r.status === 'absent').length,
    late: attendanceRows.filter(r => r.status === 'late').length,
  };

  const statusIcon = (status: AttendanceStatus) => {
    if (status === 'present') return <CheckCircle className="w-5 h-5 text-emerald-600" />;
    if (status === 'absent') return <XCircle className="w-5 h-5 text-rose-500" />;
    return <Clock className="w-5 h-5 text-amber-500" />;
  };

  const statusBg = (status: AttendanceStatus) => {
    if (status === 'present') return 'bg-emerald-50 border-emerald-200';
    if (status === 'absent') return 'bg-rose-50 border-rose-200';
    return 'bg-amber-50 border-amber-200';
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-indigo-600" />
          Attendance Management
        </h1>
        <p className="text-slate-500 mt-1 text-sm">Mark and track daily attendance for each class.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Class</label>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
            >
              <option value="">Select class...</option>
              {classRows.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setActiveTab('mark'); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'mark' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Mark Attendance
            </button>
            <button
              onClick={() => { setActiveTab('report'); loadReport(); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'report' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <BarChart3 className="w-4 h-4 inline mr-1.5" />
              Report
            </button>
            <button
              onClick={() => setActiveTab('monthly')}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'monthly' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Calendar className="w-4 h-4 inline mr-1.5" />
              Monthly
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'mark' && selectedClass && (
        <>
          {/* Summary + Quick Actions */}
          <div className="flex flex-wrap gap-3 mb-4 items-center justify-between">
            <div className="flex gap-3">
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-semibold border border-emerald-100">
                ✓ Present: {summary.present}
              </span>
              <span className="px-3 py-1.5 bg-rose-50 text-rose-700 rounded-xl text-sm font-semibold border border-rose-100">
                ✗ Absent: {summary.absent}
              </span>
              <span className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-sm font-semibold border border-amber-100">
                ⏰ Late: {summary.late}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAllStatus('present')} className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors">All Present</button>
              <button onClick={() => setAllStatus('absent')} className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors">All Absent</button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search student..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>

          {/* Student List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p>{selectedClass ? 'No students found in this class.' : 'Select a class to begin.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map((row, i) => (
                  <motion.div
                    key={row.studentId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className={`flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors`}
                    onClick={() => toggleStatus(row.studentId)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                        {i + 1}
                      </div>
                      <p className="font-medium text-slate-800 text-sm">{row.studentName}</p>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-semibold capitalize ${statusBg(row.status)}`}>
                      {statusIcon(row.status)}
                      <span className={row.status === 'present' ? 'text-emerald-700' : row.status === 'absent' ? 'text-rose-700' : 'text-amber-700'}>
                        {row.status}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {attendanceRows.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-60"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                {saved ? 'Saved!' : 'Save Attendance'}
              </button>
            </div>
          )}
        </>
      )}

      {activeTab === 'report' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">Attendance Summary — {selectedClass || 'All Classes'}</h2>
          </div>
          {loadingReport ? (
            <div className="py-16 text-center text-slate-400">Loading report...</div>
          ) : reportData.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No attendance data available. Select a class and click Report.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-3">Student</th>
                    <th className="text-center px-4 py-3">Present</th>
                    <th className="text-center px-4 py-3">Absent</th>
                    <th className="text-center px-4 py-3">Late</th>
                    <th className="text-center px-4 py-3">Rate</th>
                    <th className="text-center px-4 py-3">Alert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map(row => (
                    <tr key={row.studentName} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{row.studentName}</td>
                      <td className="px-4 py-3 text-center text-emerald-700 font-semibold">{row.present}</td>
                      <td className="px-4 py-3 text-center text-rose-600 font-semibold">{row.absent}</td>
                      <td className="px-4 py-3 text-center text-amber-600 font-semibold">{row.late}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-slate-200 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${row.rate >= 80 ? 'bg-emerald-500' : row.rate >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${row.rate}%` }} />
                          </div>
                          <span className={`text-xs font-bold ${row.rate >= 80 ? 'text-emerald-700' : row.rate >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>{row.rate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.rate < 75 && (
                          <button
                            onClick={() => sendAIAlert(row)}
                            disabled={aiAlertLoading === row.studentId}
                            title="Send AI attendance alert to parent"
                            className="p-1.5 text-violet-500 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors disabled:opacity-40"
                          >
                            {aiAlertLoading === row.studentId
                              ? <span className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-500 rounded-full animate-spin inline-block" />
                              : <Sparkles className="w-4 h-4" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Monthly View Tab */}
      {activeTab === 'monthly' && (
        <div className="space-y-4">
          {/* Month controls */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Month</label>
              <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <button onClick={loadMonthlyData} disabled={!selectedClass || loadingMonthly}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm disabled:opacity-60">
              {loadingMonthly ? <><Clock className="w-4 h-4 animate-spin" /> Loading…</> : <><Calendar className="w-4 h-4" /> Load Month</>}
            </button>
            {monthlyData.length > 0 && (
              <button onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
                Print / PDF
              </button>
            )}
          </div>

          {!selectedClass && (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
              <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Select a class above to view monthly attendance.</p>
            </div>
          )}

          {selectedClass && monthlyData.length === 0 && !loadingMonthly && (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
              <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Click "Load Month" to display the monthly attendance grid.</p>
            </div>
          )}

          {monthlyData.length > 0 && (() => {
            const [year, month] = selectedMonth.split('-').map(Number);
            const daysInMonth = new Date(year, month, 0).getDate();
            const days = Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1;
              return `${selectedMonth}-${String(d).padStart(2, '0')}`;
            });
            return (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    {selectedClass} — {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </h3>
                  <div className="flex gap-3 text-xs font-medium">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200 inline-block" />Present</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-200 inline-block" />Absent</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 inline-block" />Late</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 inline-block" />No record</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: `${200 + daysInMonth * 30}px` }}>
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 text-left font-bold text-slate-500 sticky left-0 bg-slate-50 z-10 min-w-[140px]">Student</th>
                        {days.map(d => (
                          <th key={d} className="px-1 py-2 text-center font-bold text-slate-400 min-w-[28px]">
                            {Number(d.split('-')[2])}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">P</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">A</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">L</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 min-w-[60px]">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {monthlyData.map(row => (
                        <tr key={row.studentId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-1.5 font-medium text-slate-800 sticky left-0 bg-white z-10">{row.studentName}</td>
                          {days.map(d => {
                            const st = row.cells[d];
                            const bg = st === 'present' ? 'bg-emerald-200' : st === 'absent' ? 'bg-rose-200' : st === 'late' ? 'bg-amber-200' : 'bg-slate-100';
                            const title = st ? st.charAt(0).toUpperCase() + st.slice(1) : '—';
                            return <td key={d} className="px-1 py-1.5 text-center"><span title={title} className={`inline-block w-5 h-5 rounded ${bg}`} /></td>;
                          })}
                          <td className="px-3 py-1.5 text-center font-bold text-emerald-700">{row.present}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-rose-600">{row.absent}</td>
                          <td className="px-3 py-1.5 text-center font-bold text-amber-600">{row.late}</td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`font-bold ${row.rate >= 80 ? 'text-emerald-700' : row.rate >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {row.rate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Summary row */}
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-600">
                        <td className="px-3 py-2 sticky left-0 bg-slate-50 z-10">Total</td>
                        {days.map(d => {
                          const cnt = monthlyData.filter(r => r.cells[d] === 'present').length;
                          return <td key={d} className="px-1 py-2 text-center text-[10px] text-emerald-700">{cnt > 0 ? cnt : ''}</td>;
                        })}
                        <td className="px-3 py-2 text-center text-emerald-700">{monthlyData.reduce((s, r) => s + r.present, 0)}</td>
                        <td className="px-3 py-2 text-center text-rose-600">{monthlyData.reduce((s, r) => s + r.absent, 0)}</td>
                        <td className="px-3 py-2 text-center text-amber-600">{monthlyData.reduce((s, r) => s + r.late, 0)}</td>
                        <td className="px-3 py-2 text-center">
                          {monthlyData.length > 0 ? Math.round(monthlyData.reduce((s, r) => s + r.rate, 0) / monthlyData.length) : 0}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {!selectedClass && activeTab === 'mark' && (
        <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
          <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Select a class and date above to begin marking attendance.</p>
        </div>
      )}
    </div>
  );
}
