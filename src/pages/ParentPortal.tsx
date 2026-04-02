import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { collection, query, onSnapshot, where, addDoc, serverTimestamp, getDocs, orderBy, updateDoc, doc } from 'firebase/firestore';
import { Student, Assignment, Message, Grade, Attendance, SchoolEvent, Invoice } from '../types';
import { motion } from 'motion/react';
import { 
  BookOpen, Calendar, MessageSquare, Loader2, 
  CheckCircle2, Clock, User, Bell, TrendingUp, AlertCircle, DollarSign, Receipt, Plus, Send
} from 'lucide-react';

export default function ParentPortal() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChild, setSelectedChild] = useState<Student | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'progress' | 'attendance' | 'assignments' | 'events' | 'messages' | 'finance'>('progress');

  // New Message Form
  const [newMessage, setNewMessage] = useState({
    receiverId: '',
    content: ''
  });

  useEffect(() => {
    if (!user) return;

    const qChildren = query(collection(db, 'students'), where('guardianEmail', '==', user.email));
    const unsubscribeChildren = onSnapshot(qChildren, (snapshot) => {
      const childrenData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setChildren(childrenData);
      if (childrenData.length > 0 && !selectedChild) {
        setSelectedChild(childrenData[0]);
      }
      setLoading(false);
    });

    const qEvents = query(collection(db, 'events'), orderBy('date', 'asc'));
    const unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolEvent)));
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
        // Deduplicate by ID
        return Array.from(new Map(all.map(m => [m.id, m])).values());
      });
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
      unsubscribeChildren();
      unsubscribeEvents();
      unsubscribeMessages();
      unsubscribeSent();
    };
  }, [user]);

  useEffect(() => {
    if (!selectedChild) return;

    const qGrades = query(collection(db, 'grades'), where('studentId', '==', selectedChild.id));
    const unsubscribeGrades = onSnapshot(qGrades, (snapshot) => {
      setGrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade)));
    });

    const qAttendance = query(collection(db, 'attendance'), where('studentId', '==', selectedChild.id));
    const unsubscribeAttendance = onSnapshot(qAttendance, (snapshot) => {
      setAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance)));
    });

    const qAssignments = query(collection(db, 'assignments'), where('class', '==', selectedChild.currentClass));
    const unsubscribeAssignments = onSnapshot(qAssignments, (snapshot) => {
      setAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
    });

    const qInvoices = query(collection(db, 'invoices'), where('studentId', '==', selectedChild.id));
    const unsubscribeInvoices = onSnapshot(qInvoices, (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
    });

    return () => {
      unsubscribeGrades();
      unsubscribeAttendance();
      unsubscribeAssignments();
      unsubscribeInvoices();
    };
  }, [selectedChild]);

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
      setNewMessage({ receiverId: '', content: '' });
      alert('Message sent!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'messages');
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  if (children.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <AlertCircle className="w-16 h-16 text-slate-200 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-slate-900">No student records found</h2>
        <p className="text-slate-500 mt-2">Your email ({user?.email}) is not linked to any enrolled student. Please contact the school administration.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Parent Portal</h1>
          <p className="text-slate-500 mt-1">Welcome back, {profile?.displayName}. Monitor your child's progress.</p>
        </div>
        <div className="flex items-center space-x-4">
          <label className="text-xs font-bold text-slate-400 uppercase">Child:</label>
          <select
            value={selectedChild?.id}
            onChange={(e) => setSelectedChild(children.find(c => c.id === e.target.value) || null)}
            className="px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-sm"
          >
            {children.map(child => <option key={child.id} value={child.id}>{child.studentName}</option>)}
          </select>
        </div>
      </div>

      <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl mb-8 w-fit overflow-x-auto">
        <button
          onClick={() => setActiveTab('progress')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'progress' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <TrendingUp className="w-4 h-4 inline mr-2" />
          Academic Progress
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'attendance' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <CheckCircle2 className="w-4 h-4 inline mr-2" />
          Attendance
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'assignments' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <BookOpen className="w-4 h-4 inline mr-2" />
          Assignments
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'events' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Calendar className="w-4 h-4 inline mr-2" />
          Events
        </button>
        <button
          onClick={() => setActiveTab('messages')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'messages' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <MessageSquare className="w-4 h-4 inline mr-2" />
          Messages
        </button>
        <button
          onClick={() => setActiveTab('finance')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'finance' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <DollarSign className="w-4 h-4 inline mr-2" />
          Fees & Invoices
        </button>
        <button
          onClick={() => navigate('/calendar')}
          className="px-4 py-2 rounded-lg text-sm font-bold text-slate-500 hover:text-indigo-600 transition-all whitespace-nowrap"
        >
          <Calendar className="w-4 h-4 inline mr-2" />
          Calendar
        </button>
      </div>

      {activeTab === 'progress' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {grades.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-slate-50 rounded-2xl border border-slate-100">
              <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500">No grades recorded yet.</p>
            </div>
          ) : (
            grades.map(grade => (
              <div key={grade.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-bold text-slate-900">{grade.subject}</h4>
                    <p className="text-xs text-slate-500">{grade.term} • {grade.session}</p>
                  </div>
                  <div className="bg-indigo-50 px-3 py-1 rounded-lg text-indigo-700 font-bold text-lg">
                    {grade.grade}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase">CA Score</p>
                    <p className="font-medium">{grade.caScore}/40</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase">Exam Score</p>
                    <p className="font-medium">{grade.examScore}/60</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Class</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendance.map(record => (
                <tr key={record.id}>
                  <td className="px-6 py-4 text-sm text-slate-900 font-medium">{record.date}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      record.status === 'present' ? 'bg-emerald-50 text-emerald-700' :
                      record.status === 'absent' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{record.class}</td>
                </tr>
              ))}
              {attendance.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-10 text-center text-slate-400 italic">No attendance records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="space-y-4">
          {assignments.map(assignment => (
            <div key={assignment.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
              <div>
                <h4 className="font-bold text-slate-900">{assignment.title}</h4>
                <p className="text-sm text-slate-500">{assignment.subject} • {assignment.description}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">Due: {assignment.dueDate}</p>
              </div>
            </div>
          ))}
          {assignments.length === 0 && (
            <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100">
              <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500">No assignments posted for this class.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'events' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {events.map(event => (
            <div key={event.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start">
              <div className="bg-indigo-50 w-12 h-12 rounded-xl flex flex-col items-center justify-center text-indigo-700 mr-4 shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900">{event.title}</h4>
                <p className="text-xs text-indigo-600 font-bold uppercase mb-2">{event.date} • {event.type}</p>
                <p className="text-sm text-slate-600">{event.description}</p>
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <div className="col-span-full text-center py-20 bg-slate-50 rounded-2xl border border-slate-100">
              <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500">No upcoming events.</p>
            </div>
          )}
        </div>
      )}

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
                <p className="text-slate-500 max-w-xs">Select a conversation from the left or start a new one to communicate with the school staff.</p>
                
                <div className="mt-8 w-full max-w-sm">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-2 text-left">New Recipient (Teacher Email)</label>
                  <input
                    type="email"
                    placeholder="Enter teacher email..."
                    onChange={e => setNewMessage({ ...newMessage, receiverId: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Invoiced</p>
              <h3 className="text-2xl font-bold text-slate-900">₦{invoices.reduce((sum, i) => sum + i.amount, 0).toLocaleString()}</h3>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Paid</p>
              <h3 className="text-2xl font-bold text-emerald-600">₦{invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0).toLocaleString()}</h3>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Outstanding</p>
              <h3 className="text-2xl font-bold text-amber-600">₦{invoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + i.amount, 0).toLocaleString()}</h3>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Fee Invoices</h3>
              <Receipt className="w-5 h-5 text-slate-400" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Description</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Amount</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Due Date</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-slate-500">No invoices found for this student.</td>
                    </tr>
                  ) : (
                    invoices.map(invoice => (
                      <tr key={invoice.id}>
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-slate-900">{invoice.description}</p>
                          <p className="text-xs text-slate-500">{invoice.term} {invoice.session}</p>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium">₦{invoice.amount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{invoice.dueDate}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                            invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                            invoice.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start">
            <AlertCircle className="w-5 h-5 text-amber-600 mr-3 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">Payment Instructions</p>
              <p className="text-xs text-amber-700 mt-1">Please make all fee payments to the school's bank account and submit the receipt to the bursary office for verification. Online payment integration is coming soon.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
