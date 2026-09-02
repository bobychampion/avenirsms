import React, { useEffect, useState } from 'react';
import { Filter, Plus, Trash2, Check, Loader2, BookMarked } from 'lucide-react';
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../components/FirebaseProvider';
import { Student, CurriculumItem } from '../../types';
import { useTeacherOverviewData } from './hooks/useTeacherOverviewData';
import CurriculumTracker from './CurriculumTracker';
import toast from 'react-hot-toast';

interface CurriculumPageProps {
  schoolId: string | null | undefined;
  selectedClass: string;
  myAssignedClasses: string[];
  onSelectClass: (cls: string) => void;
  subjectsForClass: string[];
  students: Student[];
  currentTerm: string;
  currentSession: string;
}

export default function CurriculumPage({
  schoolId, selectedClass, myAssignedClasses, onSelectClass, subjectsForClass, students, currentTerm, currentSession,
}: CurriculumPageProps) {
  const { user } = useAuth();
  const data = useTeacherOverviewData({ schoolId, selectedClass, subjectsForClass, students, currentTerm, currentSession });

  // The teacher's own curriculum entries for this class (source === 'teacher').
  const [myItems, setMyItems] = useState<CurriculumItem[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schoolId || !selectedClass || !user) { setMyItems([]); return; }
    const q = query(
      collection(db, 'curriculum_items'),
      where('schoolId', '==', schoolId),
      where('level', '==', selectedClass),
      where('createdBy', '==', user.uid),
    );
    const unsub = onSnapshot(
      q,
      snap => setMyItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as CurriculumItem))),
      err => console.error('[CurriculumPage] my-items query failed:', err.code, err.message),
    );
    return () => unsub();
  }, [schoolId, selectedClass, user]);

  // Keep the subject select valid as the class (and so its subject list) changes.
  useEffect(() => {
    setNewSubject(prev => (subjectsForClass.includes(prev) ? prev : (subjectsForClass[0] ?? '')));
  }, [subjectsForClass]);

  const addItem = async () => {
    const subject = newSubject.trim();
    const topic = newTopic.trim();
    if (!subject || !topic || !schoolId || !user) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'curriculum_items'), {
        subject,
        level: selectedClass,
        term: currentTerm,
        topic,
        objective: '',
        completed: false,
        source: 'teacher',
        createdBy: user.uid,
        schoolId,
        createdAt: serverTimestamp(),
      });
      setNewTopic('');
    } catch (e: any) {
      console.error('[CurriculumPage] add failed:', e?.code, e?.message);
      toast.error('Could not add curriculum entry.');
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (item: CurriculumItem) => {
    if (!item.id) return;
    await updateDoc(doc(db, 'curriculum_items', item.id), {
      completed: !item.completed,
      completedAt: !item.completed ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    }).catch(e => console.error('[CurriculumPage] toggle failed:', e?.code, e?.message));
  };

  const removeItem = async (id?: string) => {
    if (!id) return;
    await deleteDoc(doc(db, 'curriculum_items', id))
      .catch(e => console.error('[CurriculumPage] delete failed:', e?.code, e?.message));
  };

  const sortedItems = [...myItems].sort((a, b) =>
    a.subject === b.subject ? a.topic.localeCompare(b.topic) : a.subject.localeCompare(b.subject),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Filter className="w-5 h-5 text-slate-400" />
        <select
          value={selectedClass}
          onChange={e => onSelectClass(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-sm"
        >
          {myAssignedClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-slate-400 font-medium">{currentTerm} · {currentSession}</span>
      </div>

      {data.loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Loading curriculum data…</div>
      ) : (
        <CurriculumTracker upcomingLessons={data.upcomingLessons} />
      )}

      {/* Teacher-authored curriculum entries */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
          <BookMarked className="w-4 h-4 text-indigo-600" /> My Curriculum Entries
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Add what you plan to cover in {selectedClass} this term — a subject and a short description. These show up in the tracker above.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <select
            value={newSubject}
            onChange={e => setNewSubject(e.target.value)}
            className="sm:w-44 px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            {subjectsForClass.length === 0
              ? <option value="">No subjects</option>
              : subjectsForClass.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
            placeholder="e.g. Photosynthesis — light-dependent reactions"
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={addItem}
            disabled={saving || !newSubject.trim() || !newTopic.trim()}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </button>
        </div>

        {sortedItems.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">Nothing added yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sortedItems.map(item => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <button
                  onClick={() => toggleComplete(item)}
                  title={item.completed ? 'Mark as not covered' : 'Mark as covered'}
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                    item.completed
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-slate-300 hover:border-indigo-400'
                  }`}
                >
                  {item.completed && <Check className="w-3.5 h-3.5" />}
                </button>
                <span className={`flex-1 text-sm ${item.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {item.topic}
                </span>
                <span className="text-xs text-slate-400 shrink-0">{item.subject}</span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-slate-300 hover:text-rose-500 shrink-0"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
