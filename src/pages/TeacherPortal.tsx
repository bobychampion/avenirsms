import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { collection, query, onSnapshot, where, addDoc, serverTimestamp, getDocs, orderBy, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { Student, Assignment, Message, UserProfile, SCHOOL_CLASSES, SUBJECTS } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Users, MessageSquare, Plus, Send, Loader2, 
  Calendar, CheckCircle2, Clock, User, Filter, Search,
  Edit2, Trash2, X, AlertCircle
} from 'lucide-react';

export default function TeacherPortal() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'students' | 'assignments' | 'messages'>('students');
  const [selectedClass, setSelectedClass] = useState(SCHOOL_CLASSES[0]);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // New Assignment Form
  const [newAssignment, setNewAssignment] = useState({
    title: '',
    description: '',
    subject: SUBJECTS[0],
    class: SCHOOL_CLASSES[0],
    dueDate: ''
  });

  // New Message Form
  const [newMessage, setNewMessage] = useState({
    receiverId: '',
    content: ''
  });

  useEffect(() => {
    if (!user) return;

    const qStudents = query(collection(db, 'students'), where('currentClass', '==', selectedClass));
    const unsubscribeStudents = onSnapshot(qStudents, (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    });

    const qAssignments = query(collection(db, 'assignments'), where('teacherId', '==', user.uid));
    const unsubscribeAssignments = onSnapshot(qAssignments, (snapshot) => {
      setAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
    });

    const qMessages = query(
      collection(db, 'messages'), 
      where('receiverId', 'in', [user.uid, user.email]),
      orderBy('timestamp', 'desc')
    );
    const qSentMessages = query(
      collection(db, 'messages'),
      where('senderId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeMessages = onSnapshot(qMessages, (snapshot) => {
      const received = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(prev => {
        const sent = prev.filter(m => m.senderId === user.uid);
        const all = [...received, ...sent].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        return Array.from(new Map(all.map(m => [m.id, m])).values());
      });
      setLoading(false);
    });

    const unsubscribeSent = onSnapshot(qSentMessages, (snapshot) => {
      const sent = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(prev => {
        const received = prev.filter(m => m.receiverId === user.uid || m.receiverId === user.email);
        const all = [...received, ...sent].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        return Array.from(new Map(all.map(m => [m.id, m])).values());
      });
    });

    return () => {
      unsubscribeStudents();
      unsubscribeAssignments();
      unsubscribeMessages();
      unsubscribeSent();
    };
  }, [user, selectedClass]);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      if (editingAssignment) {
        const assignmentRef = doc(db, 'assignments', editingAssignment.id!);
        await updateDoc(assignmentRef, {
          ...newAssignment,
          updatedAt: serverTimestamp()
        });
        alert('Assignment updated!');
        setEditingAssignment(null);
      } else {
        await addDoc(collection(db, 'assignments'), {
          ...newAssignment,
          teacherId: user.uid,
          createdAt: serverTimestamp()
        });
        alert('Assignment created!');
      }
      setNewAssignment({ title: '', description: '', subject: SUBJECTS[0], class: SCHOOL_CLASSES[0], dueDate: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'assignments');
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'assignments', id));
      setShowDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'assignments');
    }
  };

  const filteredAssignments = assignments.filter(a => 
    a.title.toLowerCase().includes(assignmentSearch.toLowerCase()) ||
    a.subject.toLowerCase().includes(assignmentSearch.toLowerCase()) ||
    a.class.toLowerCase().includes(assignmentSearch.toLowerCase())
  );

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    try {
      await addDoc(collection(db, 'messages'), {
        ...newMessage,
        senderId: user.uid,
        senderName: profile.displayName,
        timestamp: serverTimestamp(),
        read: false
      });
      setNewMessage({ ...newMessage, content: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'messages');
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Teacher Portal</h1>
        <p className="text-slate-500 mt-1">Welcome back, {profile?.displayName}. Manage your classes and communicate with parents.</p>
      </div>

      <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl mb-8 w-fit">
        <button
          onClick={() => setActiveTab('students')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'students' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          My Students
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'assignments' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <BookOpen className="w-4 h-4 inline mr-2" />
          Assignments
        </button>
        <button
          onClick={() => setActiveTab('messages')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'messages' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <MessageSquare className="w-4 h-4 inline mr-2" />
          Messages
        </button>
        <button
          onClick={() => navigate('/calendar')}
          className="px-4 py-2 rounded-lg text-sm font-bold text-slate-500 hover:text-indigo-600 transition-all"
        >
          <Calendar className="w-4 h-4 inline mr-2" />
          Calendar
        </button>
      </div>

      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="flex items-center space-x-4 mb-6">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-sm"
            >
              {SCHOOL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {students.map(student => (
              <div key={student.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold mr-3">
                    {student.studentName.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{student.studentName}</h4>
                    <p className="text-xs text-slate-400">{student.studentId}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <p><strong>Guardian:</strong> {student.guardianName}</p>
                  <p><strong>Email:</strong> {student.guardianEmail || 'Not set'}</p>
                </div>
                <button 
                  onClick={() => {
                    setActiveTab('messages');
                    setNewMessage({ receiverId: student.guardianEmail || '', content: '' });
                  }}
                  className="mt-4 w-full py-2 bg-slate-50 text-indigo-600 font-bold rounded-lg hover:bg-indigo-50 transition-colors text-xs"
                >
                  Message Parent
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <form onSubmit={handleCreateAssignment} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 sticky top-24">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-900 flex items-center">
                  {editingAssignment ? <Edit2 className="w-5 h-5 mr-2 text-indigo-600" /> : <Plus className="w-5 h-5 mr-2 text-indigo-600" />}
                  {editingAssignment ? 'Edit Assignment' : 'New Assignment'}
                </h3>
                {editingAssignment && (
                  <button 
                    type="button"
                    onClick={() => {
                      setEditingAssignment(null);
                      setNewAssignment({ title: '', description: '', subject: SUBJECTS[0], class: SCHOOL_CLASSES[0], dueDate: '' });
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Title</label>
                <input
                  required
                  type="text"
                  value={newAssignment.title}
                  onChange={e => setNewAssignment({...newAssignment, title: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Subject</label>
                <select
                  value={newAssignment.subject}
                  onChange={e => setNewAssignment({...newAssignment, subject: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none"
                >
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Class</label>
                <select
                  value={newAssignment.class}
                  onChange={e => setNewAssignment({...newAssignment, class: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none"
                >
                  {SCHOOL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Due Date</label>
                <input
                  required
                  type="date"
                  value={newAssignment.dueDate}
                  onChange={e => setNewAssignment({...newAssignment, dueDate: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Description</label>
                <textarea
                  value={newAssignment.description}
                  onChange={e => setNewAssignment({...newAssignment, description: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none resize-none"
                  rows={3}
                />
              </div>
              <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all">
                {editingAssignment ? 'Update Assignment' : 'Create Assignment'}
              </button>
            </form>
          </div>
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
              <h3 className="font-bold text-slate-900">Recent Assignments</h3>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search assignments..."
                  value={assignmentSearch}
                  onChange={e => setAssignmentSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            
            <AnimatePresence mode="popLayout">
              {filteredAssignments.map(assignment => (
                <motion.div 
                  layout
                  key={assignment.id} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-slate-900">{assignment.title}</h4>
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-full uppercase">
                        {assignment.subject}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1 mb-2">{assignment.description}</p>
                    <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider gap-3">
                      <span className="flex items-center"><Users className="w-3 h-3 mr-1" /> {assignment.class}</span>
                      <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" /> Due: {assignment.dueDate}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button 
                      onClick={() => {
                        setEditingAssignment(assignment);
                        setNewAssignment({
                          title: assignment.title,
                          description: assignment.description,
                          subject: assignment.subject,
                          class: assignment.class,
                          dueDate: assignment.dueDate
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="flex-1 sm:flex-none p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setShowDeleteConfirm(assignment.id!)}
                      className="flex-1 sm:flex-none p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredAssignments.length === 0 && (
              <div className="text-center py-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">No assignments found matching your search.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
            >
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-rose-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Delete Assignment?</h3>
              <p className="text-slate-500 text-center mb-8">This action cannot be undone. Are you sure you want to remove this assignment?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeleteAssignment(showDeleteConfirm)}
                  className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {activeTab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[600px]">
          <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center">
                <MessageSquare className="w-5 h-5 mr-2 text-indigo-600" />
                Conversations
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <button 
                onClick={() => setNewMessage({ receiverId: '', content: '' })}
                className="w-full p-3 text-left rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all text-sm font-bold flex items-center justify-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Conversation
              </button>
              {Array.from(new Set(messages.map(m => m.senderId === user?.uid ? m.receiverId : m.senderId))).map(otherId => {
                const lastMsg = messages.find(m => m.senderId === otherId || m.receiverId === otherId);
                const unreadCount = messages.filter(m => m.senderId === otherId && !m.read).length;
                return (
                  <button 
                    key={otherId}
                    onClick={() => {
                      setNewMessage({ receiverId: otherId, content: '' });
                      // Mark as read
                      messages.filter(m => m.senderId === otherId && !m.read).forEach(async m => {
                        await updateDoc(doc(db, 'messages', m.id!), { read: true });
                      });
                    }}
                    className={`w-full p-4 text-left rounded-2xl transition-all ${newMessage.receiverId === otherId ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-slate-50 border-transparent'} border`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-slate-900 text-sm truncate max-w-[120px]">
                        {lastMsg?.senderId === otherId ? lastMsg.senderName : otherId}
                      </p>
                      {unreadCount > 0 && (
                        <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{lastMsg?.content}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative">
            {newMessage.receiverId ? (
              <>
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h3 className="font-bold text-slate-900">{newMessage.receiverId}</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Communication Log</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
                  {messages
                    .filter(m => m.senderId === newMessage.receiverId || m.receiverId === newMessage.receiverId)
                    .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0))
                    .map(msg => (
                      <div key={msg.id} className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${
                          msg.senderId === user?.uid 
                            ? 'bg-indigo-600 text-white rounded-tr-none' 
                            : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'
                        }`}>
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                          <div className={`flex items-center mt-2 text-[10px] ${msg.senderId === user?.uid ? 'text-indigo-200' : 'text-slate-400'}`}>
                            <Clock className="w-3 h-3 mr-1" />
                            {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {msg.senderId === user?.uid && (
                              <span className="ml-2 flex items-center">
                                {msg.read ? (
                                  <><CheckCircle2 className="w-3 h-3 mr-0.5" /> Read</>
                                ) : (
                                  <><Clock className="w-3 h-3 mr-0.5" /> Sent</>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
                <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-white">
                  <div className="flex gap-2">
                    <input
                      required
                      type="text"
                      value={newMessage.content}
                      onChange={e => setNewMessage({...newMessage, content: e.target.value})}
                      placeholder="Type your message..."
                      className="flex-1 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="submit" className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all">
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                  <MessageSquare className="w-10 h-10 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Communication Log</h3>
                <p className="text-slate-500 max-w-xs">Select a conversation from the left or start a new one to communicate with parents.</p>
                
                <div className="mt-8 w-full max-w-sm">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-2 text-left">New Recipient (Parent Email)</label>
                  <input
                    type="email"
                    placeholder="Enter parent email..."
                    onChange={e => setNewMessage({ ...newMessage, receiverId: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
