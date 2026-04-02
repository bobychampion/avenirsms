import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { Student, SCHOOL_CLASSES, SchoolClass } from '../types';
import { motion } from 'motion/react';
import { Search, Filter, User, Phone, Mail, GraduationCap, Calendar, Hash, ArrowRight, ArrowLeft } from 'lucide-react';

export default function StudentList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialClass = searchParams.get('class') || 'all';
  
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState(initialClass);

  useEffect(() => {
    const q = query(collection(db, 'students'), orderBy('enrolledAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(data);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'students'));

    const classesQuery = query(collection(db, 'classes'));
    const unsubscribeClasses = onSnapshot(classesQuery, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolClass)));
    });

    return () => {
      unsubscribe();
      unsubscribeClasses();
    };
  }, []);

  useEffect(() => {
    if (classFilter === 'all') {
      searchParams.delete('class');
    } else {
      searchParams.set('class', classFilter);
    }
    setSearchParams(searchParams);
  }, [classFilter]);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStudents.map((student) => (
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

              <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center">
                <div className="flex items-center text-xs text-slate-400">
                  <Hash className="w-3 h-3 mr-1" />
                  NIN: {student.nin}
                </div>
                <Link 
                  to={`/admin/students/${student.id}`}
                  className="inline-flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  View Profile
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
