import React, { useState, useEffect, useCallback } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  collection, query, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, where, getDocs, orderBy, writeBatch,
} from 'firebase/firestore';
import { ExamSeating, Student, SUBJECTS, QuestionBankItem, CBTExam, CBTSession, SCHOOL_CLASSES } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import {
  GraduationCap, Plus, Printer, Trash2, X, Search, Users,
  Calendar, Brain, Cpu, BookOpen, BarChart2, Sparkles, Edit2,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Copy, Loader2,
  AlertCircle, Download,
} from 'lucide-react';
import { useClassSelectOptions } from '../components/SchoolContext';
import { useAuth } from '../components/FirebaseProvider';
import { useSchoolId } from '../hooks/useSchoolId';
import { generateQuestionBatch } from '../services/geminiService';
import toast from 'react-hot-toast';

// ─── local types ──────────────────────────────────────────────────────────────
interface Exam {
  id?: string;
  name: string;
  subject: string;
  class: string;
  date: string;
  startTime: string;
  endTime: string;
  hall: string;
  createdAt?: any;
}

type TabId = 'exams' | 'question_bank' | 'cbt' | 'results';

// ─── Question Bank Tab ────────────────────────────────────────────────────────
function QuestionBankTab() {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [filterSubject, setFilterSubject] = useState(SUBJECTS[0]);
  const [filterLevel, setFilterLevel] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genForm, setGenForm] = useState({ subject: SUBJECTS[0], level: SCHOOL_CLASSES[6], count: 10, topics: '' });
  const [curriculumDocs, setCurriculumDocs] = useState<{ id: string; fileName: string; subject: string; summary: any }[]>([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  // Manual add
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<Partial<QuestionBankItem>>({
    subject: SUBJECTS[0], level: SCHOOL_CLASSES[6], topic: '', questionText: '',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
    correctAnswer: 'A', difficulty: 'medium',
  });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'question_bank'), orderBy('createdAt', 'desc')),
      snap => setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionBankItem))),
      () => {}
    );
    const unsub2 = onSnapshot(
      query(collection(db, 'curriculum_documents'), orderBy('uploadedAt', 'desc')),
      snap => setCurriculumDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as any))),
      () => {}
    );
    return () => { unsub(); unsub2(); };
  }, []);

  const filtered = questions.filter(q =>
    (!filterSubject || q.subject === filterSubject) &&
    (!filterLevel || q.level === filterLevel) &&
    (!filterSource || q.sourceType === filterSource)
  );

  const deleteQuestion = async (id: string) => {
    if (!confirm('Delete this question?')) return;
    await deleteDoc(doc(db, 'question_bank', id)).catch(console.error);
    toast.success('Question deleted.');
  };

  const generateBatch = async () => {
    if (!user) { toast.error('Not logged in'); return; }
    const topicList = genForm.topics.split(',').map(t => t.trim()).filter(Boolean);
    if (topicList.length === 0) { toast.error('Enter at least one topic.'); return; }

    setGenerating(true);
    try {
      let context = '';
      if (selectedDocId) {
        const docData = curriculumDocs.find(d => d.id === selectedDocId);
        if (docData?.summary?.rawSummary) context = docData.summary.rawSummary;
      }
      const rawItems = await generateQuestionBatch(genForm.subject, genForm.level, topicList, genForm.count, context);
      if (!rawItems.length) throw new Error('AI returned no questions.');

      const batch = writeBatch(db);
      rawItems.forEach(item => {
        const ref = doc(collection(db, 'question_bank'));
        batch.set(ref, {
          subject: genForm.subject,
          level: genForm.level,
          topic: (item as any).topic || topicList[0],
          questionText: item.questionText,
          options: item.options,
          correctAnswer: item.correctAnswer,
          difficulty: item.difficulty,
          sourceType: 'ai_generated',
          sourceDocId: selectedDocId || null,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        } as Omit<QuestionBankItem, 'id'>);
      });
      await batch.commit();
      toast.success(`${rawItems.length} questions added to Question Bank!`);
    } catch (err: any) {
      toast.error(err.message || 'Generation failed. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  const saveManualQuestion = async () => {
    if (!user) return;
    const q = addForm;
    if (!q.topic || !q.questionText) { toast.error('Fill in topic and question text.'); return; }
    await addDoc(collection(db, 'question_bank'), {
      ...q,
      sourceType: 'manual',
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    }).catch(console.error);
    toast.success('Question added!');
    setShowAddModal(false);
  };

  const relevantDocs = curriculumDocs.filter(d => d.subject === genForm.subject);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: filter + list */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Question Bank ({questions.length} total)</h2>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Manual
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3">
          <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All Subjects</option>
            {SUBJECTS.map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All Levels</option>
            {SCHOOL_CLASSES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All Sources</option>
            <option value="manual">Manual</option>
            <option value="ai_generated">AI Generated</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
            <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500">No questions found. Generate some using the AI panel →</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(q => (
              <motion.div key={q.id} layout className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-[11px] font-semibold">{q.subject}</span>
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-full text-[11px] font-semibold">{q.level}</span>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[11px]">{q.topic}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        q.difficulty === 'easy' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        q.difficulty === 'hard' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                        'bg-amber-50 text-amber-700 border-amber-100'}`}>
                        {q.difficulty}
                      </span>
                      {q.sourceType === 'ai_generated' && (
                        <span className="px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-100 rounded-full text-[11px] font-semibold flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />AI
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-800 line-clamp-2">{q.questionText}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setExpandedId(expandedId === q.id ? null : q.id!)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      {expandedId === q.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button onClick={() => deleteQuestion(q.id!)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <AnimatePresence>
                  {expandedId === q.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="border-t border-slate-100 p-4 grid grid-cols-2 gap-2">
                        {q.options.map(opt => (
                          <div key={opt.label} className={`flex items-center gap-2 p-2.5 rounded-xl text-sm border
                            ${opt.label === q.correctAnswer
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                              : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0
                              ${opt.label === q.correctAnswer ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                              {opt.label}
                            </span>
                            {opt.text}
                            {opt.label === q.correctAnswer && <CheckCircle className="w-3.5 h-3.5 text-emerald-500 ml-auto" />}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Right: AI Generate panel */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-violet-600" />
            <h3 className="font-bold text-slate-900">AI Generate Questions</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Subject</label>
              <select value={genForm.subject} onChange={e => { setGenForm(p => ({ ...p, subject: e.target.value })); setSelectedDocId(''); }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Level</label>
              <select value={genForm.level} onChange={e => setGenForm(p => ({ ...p, level: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                {SCHOOL_CLASSES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Topics (comma-separated)</label>
              <input type="text" value={genForm.topics} onChange={e => setGenForm(p => ({ ...p, topics: e.target.value }))}
                placeholder="e.g. Algebra, Geometry"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Number of Questions</label>
              <input type="number" min={1} max={50} value={genForm.count} onChange={e => setGenForm(p => ({ ...p, count: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            {relevantDocs.length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
                  Use Curriculum Context (optional)
                </label>
                <select value={selectedDocId} onChange={e => setSelectedDocId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                  <option value="">None</option>
                  {relevantDocs.map(d => <option key={d.id} value={d.id}>{d.fileName}</option>)}
                </select>
              </div>
            )}
            <button onClick={generateBatch} disabled={generating}
              className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-60 text-sm">
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                : <><Sparkles className="w-4 h-4" /> Generate Questions</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* Add Manual Question Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-slate-900">Add Question Manually</h2>
                <button onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Subject</label>
                    <select value={addForm.subject} onChange={e => setAddForm(p => ({ ...p, subject: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Level</label>
                    <select value={addForm.level} onChange={e => setAddForm(p => ({ ...p, level: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      {SCHOOL_CLASSES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Topic</label>
                  <input value={addForm.topic || ''} onChange={e => setAddForm(p => ({ ...p, topic: e.target.value }))}
                    placeholder="e.g. Quadratic Equations"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Question</label>
                  <textarea value={addForm.questionText || ''} onChange={e => setAddForm(p => ({ ...p, questionText: e.target.value }))} rows={3}
                    placeholder="Type the question here…"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                </div>
                {(['A', 'B', 'C', 'D'] as const).map((label, idx) => (
                  <div key={label}>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Option {label}</label>
                    <input
                      value={(addForm.options as any)?.[idx]?.text || ''}
                      onChange={e => setAddForm(p => ({
                        ...p,
                        options: (p.options as any[]).map((o: any, i: number) => i === idx ? { ...o, text: e.target.value } : o),
                      }))}
                      placeholder={`Option ${label}`}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Correct Answer</label>
                    <select value={addForm.correctAnswer} onChange={e => setAddForm(p => ({ ...p, correctAnswer: e.target.value as any }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option>A</option><option>B</option><option>C</option><option>D</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Difficulty</label>
                    <select value={addForm.difficulty} onChange={e => setAddForm(p => ({ ...p, difficulty: e.target.value as any }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                <button onClick={saveManualQuestion} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm">Save Question</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── CBT Exams Tab ────────────────────────────────────────────────────────────
function CBTExamsTab() {
  const { user } = useAuth();
  const classSelectOptions = useClassSelectOptions();
  const [cbtExams, setCbtExams] = useState<CBTExam[]>([]);
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<CBTExam>>({
    title: '', subject: SUBJECTS[0], targetClass: '', durationMinutes: 30,
    questionCount: 20, passMark: 50, shuffleQuestions: true,
    allowedAttempts: 1, status: 'draft', type: 'internal',
    questionFilter: { subject: SUBJECTS[0] },
  });
  const [creatingSession, setCreatingSession] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'cbt_exams'), orderBy('createdAt', 'desc')), snap => {
      setCbtExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as CBTExam)));
    }, () => {});
    const unsub2 = onSnapshot(collection(db, 'question_bank'), snap => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionBankItem)));
    }, () => {});
    return () => { unsub(); unsub2(); };
  }, []);

  const saveExam = async () => {
    if (!form.title || !form.targetClass) { toast.error('Fill in title and class.'); return; }
    const data: Omit<CBTExam, 'id'> = {
      title: form.title!,
      subject: form.subject!,
      targetClass: form.targetClass!,
      durationMinutes: form.durationMinutes || 30,
      questionCount: form.questionCount || 20,
      passMark: form.passMark || 50,
      shuffleQuestions: form.shuffleQuestions ?? true,
      allowedAttempts: form.allowedAttempts || 1,
      status: form.status || 'draft',
      type: form.type || 'internal',
      questionFilter: { subject: form.subject! },
      createdAt: serverTimestamp(),
    };
    await addDoc(collection(db, 'cbt_exams'), data).catch(console.error);
    toast.success('CBT Exam created!');
    setShowModal(false);
  };

  const toggleStatus = async (exam: CBTExam) => {
    const next = exam.status === 'active' ? 'closed' : exam.status === 'draft' ? 'active' : 'draft';
    await updateDoc(doc(db, 'cbt_exams', exam.id!), { status: next }).catch(console.error);
  };

  const deleteExam = async (id: string) => {
    if (!confirm('Delete this CBT exam?')) return;
    await deleteDoc(doc(db, 'cbt_exams', id)).catch(console.error);
    toast.success('Exam deleted.');
  };

  const createStudentSession = async (exam: CBTExam) => {
    if (!user) return;
    setCreatingSession(exam.id!);
    try {
      // Pick questions from bank
      let pool = questions.filter(q => q.subject === exam.subject);
      if (exam.questionFilter.level) pool = pool.filter(q => q.level === exam.questionFilter.level);
      if (pool.length === 0) throw new Error('No questions in bank for this subject. Add questions first.');

      // Shuffle
      const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(exam.questionCount, pool.length));
      const sessionQuestions = shuffled.map(q => ({
        questionId: q.id!,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
      }));

      const sessionRef = await addDoc(collection(db, 'cbt_sessions'), {
        examId: exam.id!,
        studentId: user.uid,
        studentName: 'Test Student (Preview)',
        questions: sessionQuestions,
        answers: {},
        startedAt: serverTimestamp(),
        status: 'in_progress',
        durationMinutes: exam.durationMinutes,
      } as Omit<CBTSession, 'id'>);

      const link = `${window.location.origin}/cbt/${sessionRef.id}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      setCopiedLink(sessionRef.id);
      toast.success('Session created! Link copied to clipboard.');
      setTimeout(() => setCopiedLink(null), 3000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create session.');
    } finally {
      setCreatingSession(null);
    }
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    closed: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-slate-900">CBT Exams ({cbtExams.length})</h2>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus className="w-3.5 h-3.5" /> New CBT Exam
        </button>
      </div>

      {cbtExams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <Cpu className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500">No CBT exams yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cbtExams.map(exam => (
            <motion.div key={exam.id} layout className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-900">{exam.title}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusColors[exam.status]}`}>
                      {exam.status.toUpperCase()}
                    </span>
                    <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-[11px] font-semibold">
                      {exam.type}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <span><span className="font-medium text-slate-700">Subject:</span> {exam.subject}</span>
                    <span><span className="font-medium text-slate-700">Class:</span> {exam.targetClass}</span>
                    <span><span className="font-medium text-slate-700">Duration:</span> {exam.durationMinutes} min</span>
                    <span><span className="font-medium text-slate-700">Questions:</span> {exam.questionCount}</span>
                    <span><span className="font-medium text-slate-700">Pass Mark:</span> {exam.passMark}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => toggleStatus(exam)}
                    className="px-3 py-1.5 bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                    {exam.status === 'active' ? 'Close' : exam.status === 'draft' ? 'Activate' : 'Reopen'}
                  </button>
                  <button
                    onClick={() => createStudentSession(exam)}
                    disabled={!!creatingSession}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors
                      ${copiedLink === exam.id
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                      } disabled:opacity-60`}
                  >
                    {creatingSession === exam.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : copiedLink === exam.id
                        ? <><CheckCircle className="w-3.5 h-3.5" /> Copied!</>
                        : <><Copy className="w-3.5 h-3.5" /> Create Session</>
                    }
                  </button>
                  <button onClick={() => deleteExam(exam.id!)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-slate-900">Create CBT Exam</h2>
                <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Exam Title</label>
                  <input value={form.title || ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. 1st Term Mathematics CBT"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Subject</label>
                    <select value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value, questionFilter: { subject: e.target.value } }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Target Class</label>
                    <select value={form.targetClass} onChange={e => setForm(p => ({ ...p, targetClass: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="">Select class</option>
                      {classSelectOptions.map(o => <option key={o.key} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Duration (min)</label>
                    <input type="number" value={form.durationMinutes || 30} onChange={e => setForm(p => ({ ...p, durationMinutes: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Questions</label>
                    <input type="number" value={form.questionCount || 20} onChange={e => setForm(p => ({ ...p, questionCount: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Pass Mark %</label>
                    <input type="number" value={form.passMark || 50} onChange={e => setForm(p => ({ ...p, passMark: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Type</label>
                    <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as any }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="internal">Internal Assessment</option>
                      <option value="entrance">Entrance Exam</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Allowed Attempts</label>
                    <select value={form.allowedAttempts} onChange={e => setForm(p => ({ ...p, allowedAttempts: Number(e.target.value) as any }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="shuffle" checked={form.shuffleQuestions ?? true}
                    onChange={e => setForm(p => ({ ...p, shuffleQuestions: e.target.checked }))}
                    className="w-4 h-4 rounded accent-indigo-600" />
                  <label htmlFor="shuffle" className="text-sm text-slate-700 font-medium">Shuffle questions</label>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                <button onClick={saveExam} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm">Create Exam</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Results Tab ──────────────────────────────────────────────────────────────
function ResultsTab() {
  const [sessions, setSessions] = useState<CBTSession[]>([]);
  const [cbtExams, setCbtExams] = useState<CBTExam[]>([]);
  const [filterExam, setFilterExam] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'cbt_sessions'), orderBy('startedAt', 'desc')), snap => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as CBTSession)));
    }, () => {});
    const unsub2 = onSnapshot(collection(db, 'cbt_exams'), snap => {
      setCbtExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as CBTExam)));
    }, () => {});
    return () => { unsub(); unsub2(); };
  }, []);

  const submitted = sessions.filter(s => s.status === 'submitted' || s.status === 'timed_out');
  const filtered = filterExam ? submitted.filter(s => s.examId === filterExam) : submitted;

  const exportCSV = () => {
    const header = 'Student Name,Exam,Score (%),Status,Submitted At';
    const rows = filtered.map(s => {
      const exam = cbtExams.find(e => e.id === s.examId);
      const date = s.submittedAt?.toDate ? s.submittedAt.toDate().toLocaleDateString() : 'N/A';
      return `"${s.studentName}","${exam?.title || s.examId}",${s.score ?? '—'},${s.status},${date}`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'cbt_results.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const avg = filtered.length > 0
    ? Math.round(filtered.reduce((sum, s) => sum + (s.score ?? 0), 0) / filtered.length)
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-bold text-slate-900">Exam Results ({filtered.length})</h2>
        <div className="flex gap-2">
          <select value={filterExam} onChange={e => setFilterExam(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All Exams</option>
            {cbtExams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          {filtered.length > 0 && (
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Attempts', value: filtered.length, color: 'text-slate-700' },
            { label: 'Average Score', value: `${avg}%`, color: avg >= 50 ? 'text-emerald-600' : 'text-rose-600' },
            { label: 'Pass Rate', value: `${Math.round((filtered.filter(s => (s.score ?? 0) >= 50).length / filtered.length) * 100)}%`, color: 'text-indigo-600' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
              <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-slate-500 mt-1 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <BarChart2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500">No completed exam sessions yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Exam</th>
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-left">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(s => {
                const exam = cbtExams.find(e => e.id === s.examId);
                const passed = (s.score ?? 0) >= 50;
                const date = s.submittedAt?.toDate ? s.submittedAt.toDate().toLocaleDateString() : 'N/A';
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{s.studentName}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{exam?.title || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {s.score ?? '—'}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border
                        ${passed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        {passed ? 'Passed' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main ExamManagement ──────────────────────────────────────────────────────
export default function ExamManagement() {
  const schoolId = useSchoolId();
  const classSelectOptions = useClassSelectOptions();
  const [activeTab, setActiveTab] = useState<TabId>('exams');
  const [exams, setExams] = useState<Exam[]>([]);
  const [seatings, setSeatings] = useState<ExamSeating[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExamModal, setIsExamModal] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [examForm, setExamForm] = useState<Partial<Exam>>({
    name: '', subject: SUBJECTS[0], class: '',
    date: '', startTime: '09:00', endTime: '11:00', hall: 'Hall A'
  });
  const [autoAssigning, setAutoAssigning] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const unsub1 = onSnapshot(query(collection(db, 'exams'), where('schoolId', '==', schoolId!)), snap => {
      setExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)));
      setLoading(false);
    });
    const unsub2 = onSnapshot(query(collection(db, 'exam_seating'), where('schoolId', '==', schoolId!)), snap => {
      setSeatings(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamSeating)));
    });
    const unsub3 = onSnapshot(query(collection(db, 'students'), where('schoolId', '==', schoolId!)), snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [schoolId]);

  const saveExam = async () => {
    if (!examForm.name || !examForm.date) return;
    if ((examForm as any).id) {
      await updateDoc(doc(db, 'exams', (examForm as any).id), { ...examForm }).catch(console.error);
    } else {
      await addDoc(collection(db, 'exams'), { ...examForm, createdAt: serverTimestamp(), schoolId: schoolId ?? undefined }).catch(console.error);
    }
    setIsExamModal(false);
    setExamForm({ name: '', subject: SUBJECTS[0], class: '', date: '', startTime: '09:00', endTime: '11:00', hall: 'Hall A' });
  };

  const deleteExam = async (id: string) => {
    if (!confirm('Delete this exam?')) return;
    await deleteDoc(doc(db, 'exams', id)).catch(console.error);
  };

  const autoAssignSeats = async (exam: Exam) => {
    setAutoAssigning(true);
    const classStudents = students.filter(s => s.currentClass === exam.class);
    const existingQ = query(collection(db, 'exam_seating'), where('schoolId', '==', schoolId!), where('examName', '==', exam.name));
    const existing = await getDocs(existingQ);
    await Promise.all(existing.docs.map(d => deleteDoc(d.ref)));
    await Promise.all(classStudents.map((s, i) =>
      addDoc(collection(db, 'exam_seating'), {
        examName: exam.name,
        hallName: exam.hall,
        studentId: s.id,
        seatNumber: `${exam.hall.replace(/\s/g, '')}-${String(i + 1).padStart(2, '0')}`,
        date: exam.date,
        time: exam.startTime,
        createdAt: serverTimestamp(),
        schoolId: schoolId ?? undefined,
      })
    ));
    setAutoAssigning(false);
    alert(`Seats assigned for ${classStudents.length} students.`);
  };

  const getSeatingForExam = (examName: string) => seatings.filter(s => s.examName === examName);
  const getStudentName = (id: string) => students.find(s => s.id === id)?.studentName || id;
  const getStudentId = (id: string) => students.find(s => s.id === id)?.studentId || '';

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'exams', label: 'Exam Schedule', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'question_bank', label: 'Question Bank', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'cbt', label: 'CBT Exams', icon: <Cpu className="w-4 h-4" /> },
    { id: 'results', label: 'Results', icon: <BarChart2 className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-600" />
            Exam Management
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Schedule exams, manage question bank, run CBT sessions, view results.</p>
        </div>
        {activeTab === 'exams' && (
          <button onClick={() => setIsExamModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm">
            <Plus className="w-4 h-4" /> New Exam
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0
              ${activeTab === tab.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── Exam Schedule Tab ── */}
      {activeTab === 'exams' && (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400">Loading...</div>
          ) : exams.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
              <GraduationCap className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500">No exams scheduled. Create your first exam.</p>
            </div>
          ) : (
            exams.map(exam => {
              const examSeatings = getSeatingForExam(exam.name);
              return (
                <motion.div key={exam.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-bold text-slate-900">{exam.name}</h3>
                        <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100">{exam.class}</span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                        <span><span className="font-medium text-slate-700">Subject:</span> {exam.subject}</span>
                        <span><span className="font-medium text-slate-700">Date:</span> {exam.date}</span>
                        <span><span className="font-medium text-slate-700">Time:</span> {exam.startTime} – {exam.endTime}</span>
                        <span><span className="font-medium text-slate-700">Hall:</span> {exam.hall}</span>
                        <span><span className="font-medium text-slate-700">Seats:</span> {examSeatings.length}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => autoAssignSeats(exam)} disabled={autoAssigning}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-60">
                        {autoAssigning ? '...' : 'Auto-Assign Seats'}
                      </button>
                      <button onClick={() => setSelectedExam(exam === selectedExam ? null : exam)}
                        className="px-3 py-1.5 bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                        {selectedExam?.id === exam.id ? 'Hide' : 'View Seats'}
                      </button>
                      <button onClick={() => { setPrintingId(exam.id!); setTimeout(() => { window.print(); setPrintingId(null); }, 200); }}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Printer className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteExam(exam.id!)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <AnimatePresence>
                    {selectedExam?.id === exam.id && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="border-t border-slate-100 overflow-x-auto">
                          {examSeatings.length === 0 ? (
                            <p className="px-5 py-4 text-sm text-slate-400">No seats assigned yet. Click "Auto-Assign Seats".</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                                <tr>
                                  <th className="px-5 py-2 text-left">Seat No.</th>
                                  <th className="px-4 py-2 text-left">Student Name</th>
                                  <th className="px-4 py-2 text-left">Student ID</th>
                                  <th className="px-4 py-2 text-left">Hall</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {examSeatings.map(seat => (
                                  <tr key={seat.id} className="hover:bg-slate-50">
                                    <td className="px-5 py-2 font-mono font-bold text-indigo-700">{seat.seatNumber}</td>
                                    <td className="px-4 py-2 font-medium text-slate-800">{getStudentName(seat.studentId)}</td>
                                    <td className="px-4 py-2 text-slate-500 font-mono text-xs">{getStudentId(seat.studentId)}</td>
                                    <td className="px-4 py-2 text-slate-500">{seat.hallName}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'question_bank' && <QuestionBankTab />}
      {activeTab === 'cbt' && <CBTExamsTab />}
      {activeTab === 'results' && <ResultsTab />}

      {/* Create Exam Modal (original) */}
      <AnimatePresence>
        {isExamModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setIsExamModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-900">Schedule New Exam</h2>
                <button onClick={() => setIsExamModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Exam Name', key: 'name', type: 'text', placeholder: 'e.g. 1st Term Mathematics Exam' },
                  { label: 'Date', key: 'date', type: 'date' },
                  { label: 'Start Time', key: 'startTime', type: 'time' },
                  { label: 'End Time', key: 'endTime', type: 'time' },
                  { label: 'Hall / Venue', key: 'hall', type: 'text', placeholder: 'e.g. Hall A' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">{f.label}</label>
                    <input type={f.type} value={(examForm as any)[f.key] || ''} placeholder={f.placeholder}
                      onChange={e => setExamForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Subject</label>
                    <select value={examForm.subject} onChange={e => setExamForm(p => ({ ...p, subject: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                      {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Class</label>
                    <select value={examForm.class} onChange={e => setExamForm(p => ({ ...p, class: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                      {classSelectOptions.map(o => <option key={o.key} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setIsExamModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                <button onClick={saveExam} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm">Save Exam</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
