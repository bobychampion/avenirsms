import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { CBTSession } from '../types';
import CBTTimer from '../components/CBTTimer';
import { CheckCircle, XCircle, ChevronLeft, ChevronRight, Send, LayoutGrid, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';

export default function CBTExamEngine() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<CBTSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [savingIndicator, setSavingIndicator] = useState(false);

  // Real-time session listener
  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(doc(db, 'cbt_sessions', sessionId), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as CBTSession;
        setSession(data);
        if (Object.keys(localAnswers).length === 0) {
          setLocalAnswers(data.answers || {});
        }
        if (data.status === 'submitted' || data.status === 'timed_out') {
          setSubmitted(true);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save every 30s
  useEffect(() => {
    if (!sessionId || submitted) return;
    const id = setInterval(async () => {
      if (Object.keys(localAnswers).length > 0) {
        setSavingIndicator(true);
        await updateDoc(doc(db, 'cbt_sessions', sessionId), { answers: localAnswers }).catch(() => {});
        setTimeout(() => setSavingIndicator(false), 1000);
      }
    }, 30000);
    return () => clearInterval(id);
  }, [sessionId, localAnswers, submitted]);

  const handleAnswer = (questionId: string, answer: string) => {
    setLocalAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const submitExam = useCallback(async (reason: 'manual' | 'timed_out' = 'manual') => {
    if (!session || !sessionId || submitting) return;
    if (reason === 'manual' && !confirm('Submit your exam? You cannot change answers after submitting.')) return;

    setSubmitting(true);
    try {
      // Calculate score
      const questions = session.questions;
      let correct = 0;
      questions.forEach(q => {
        if (localAnswers[q.questionId] === q.correctAnswer) correct++;
      });
      const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;

      await updateDoc(doc(db, 'cbt_sessions', sessionId), {
        answers: localAnswers,
        status: reason === 'timed_out' ? 'timed_out' : 'submitted',
        submittedAt: serverTimestamp(),
        score,
      });
      setSubmitted(true);
      toast.success(reason === 'timed_out' ? 'Time up! Exam auto-submitted.' : 'Exam submitted successfully!');
    } catch (err) {
      toast.error('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [session, sessionId, localAnswers, submitting]);

  const handleExpire = useCallback(() => {
    submitExam('timed_out');
  }, [submitExam]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-rose-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Session Not Found</h2>
          <p className="text-slate-400 mb-6">This exam session does not exist or has expired.</p>
          <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-indigo-600 rounded-xl font-semibold">Go Home</button>
        </div>
      </div>
    );
  }

  const questions = session.questions;
  const currentQ = questions[currentIndex];
  const totalAnswered = Object.keys(localAnswers).length;

  // ─── Results Screen ───────────────────────────────────────────────────────
  if (submitted) {
    const correct = questions.filter(q => localAnswers[q.questionId] === q.correctAnswer).length;
    const scoreVal = session.score ?? (questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0);
    // Try to get passMark from session (we'll just use 50 as default if not stored)
    const passed = scoreVal >= 50;

    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
          <div className={`p-8 text-center ${passed ? 'bg-emerald-500' : 'bg-rose-500'}`}>
            {passed
              ? <CheckCircle className="w-16 h-16 text-white mx-auto mb-3" />
              : <XCircle className="w-16 h-16 text-white mx-auto mb-3" />
            }
            <h1 className="text-3xl font-black text-white">{scoreVal}%</h1>
            <p className="text-white/90 font-bold text-lg mt-1">{passed ? 'PASSED' : 'NOT PASSED'}</p>
            <p className="text-white/70 mt-1">{session.studentName}</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Correct', value: correct, color: 'text-emerald-600' },
                { label: 'Wrong', value: questions.length - correct, color: 'text-rose-600' },
                { label: 'Total', value: questions.length, color: 'text-slate-700' },
              ].map(stat => (
                <div key={stat.label} className="text-center bg-slate-50 rounded-2xl p-4">
                  <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs font-bold text-slate-500 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Question review */}
            <h3 className="font-bold text-slate-900 mb-3">Review</h3>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {questions.map((q, idx) => {
                const answered = localAnswers[q.questionId];
                const isCorrect = answered === q.correctAnswer;
                return (
                  <div key={q.questionId} className={`rounded-xl p-3 border text-sm ${isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    <div className="flex items-start gap-2">
                      {isCorrect
                        ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        : <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 text-xs line-clamp-2">{idx + 1}. {q.questionText}</p>
                        <div className="flex gap-3 mt-1 text-xs">
                          <span className={answered ? (isCorrect ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold') : 'text-slate-400'}>
                            Your answer: {answered || '—'}
                          </span>
                          {!isCorrect && <span className="text-emerald-700 font-semibold">Correct: {q.correctAnswer}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Exam Screen ──────────────────────────────────────────────────────────
  if (!currentQ) return null;

  const startedMs = session.startedAt instanceof Timestamp
    ? session.startedAt.toMillis()
    : typeof session.startedAt?.seconds === 'number'
      ? session.startedAt.seconds * 1000
      : Date.now();

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Top bar */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">{session.studentName}</p>
          <p className="text-slate-400 text-xs">{totalAnswered}/{questions.length} answered</p>
        </div>
        <div className="flex items-center gap-3">
          {savingIndicator && <span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
          <CBTTimer
            durationSeconds={session.durationMinutes * 60}
            startedAt={startedMs}
            onExpire={handleExpire}
          />
          <button
            onClick={() => setShowNav(n => !n)}
            className="p-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-white transition-colors"
            title="Question navigator"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main question area */}
        <div className="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto">
          <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
            {/* Question number + progress */}
            <div className="flex items-center justify-between mb-6">
              <span className="text-slate-400 text-sm font-semibold">Question {currentIndex + 1} of {questions.length}</span>
              <div className="w-40 bg-slate-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Question text */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex-1"
              >
                <div className="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700">
                  <p className="text-white text-lg font-semibold leading-relaxed">{currentQ.questionText}</p>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  {currentQ.options.map(opt => {
                    const selected = localAnswers[currentQ.questionId] === opt.label;
                    return (
                      <button
                        key={opt.label}
                        onClick={() => handleAnswer(currentQ.questionId, opt.label)}
                        className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all font-medium
                          ${selected
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/30'
                            : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-indigo-500/50 hover:bg-slate-700'
                          }`}
                      >
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0
                          ${selected ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'}`}>
                          {opt.label}
                        </span>
                        <span>{opt.text}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-700">
              <button
                onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 text-white rounded-xl font-semibold disabled:opacity-40 hover:bg-slate-600 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>

              {currentIndex < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => submitExam('manual')}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Submit Exam
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Side navigator */}
        <AnimatePresence>
          {showNav && (
            <motion.div
              initial={{ width: 0, opacity: 0 }} animate={{ width: 240, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              className="bg-slate-800 border-l border-slate-700 overflow-hidden flex-shrink-0"
            >
              <div className="p-4 w-60">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Questions</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {questions.map((q, idx) => {
                    const ans = localAnswers[q.questionId];
                    const isCurrent = idx === currentIndex;
                    return (
                      <button
                        key={q.questionId}
                        onClick={() => setCurrentIndex(idx)}
                        className={`w-9 h-9 rounded-lg text-xs font-bold transition-all
                          ${isCurrent
                            ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                            : ans
                              ? 'bg-emerald-600/80 text-white'
                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                          }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="w-3 h-3 rounded bg-emerald-600 inline-block" />Answered ({totalAnswered})
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="w-3 h-3 rounded bg-slate-700 inline-block" />Unanswered ({questions.length - totalAnswered})
                  </div>
                </div>
                <button
                  onClick={() => submitExam('manual')}
                  disabled={submitting}
                  className="w-full mt-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors disabled:opacity-60"
                >
                  Submit Exam
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
