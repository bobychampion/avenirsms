import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { CurriculumItem, SCHOOL_CLASSES, SUBJECTS } from '../types';
import { generateCurriculumObjective } from '../services/geminiService';
import { Map, Plus, X, CheckCircle, Circle, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

const NERDC_TOPICS: Record<string, string[]> = {
  'Mathematics': ['Number & Numeration','Algebra','Geometry','Trigonometry','Statistics & Probability','Calculus'],
  'English Language': ['Comprehension','Summary Writing','Essay Writing','Grammar','Oral English','Literature'],
  'Biology': ['Cell Biology','Genetics','Ecology','Evolution','Physiology','Reproduction'],
  'Chemistry': ['Atomic Structure','Periodic Table','Chemical Bonding','Acids & Bases','Organic Chemistry','Electrochemistry'],
  'Physics': ['Mechanics','Waves & Optics','Electricity','Magnetism','Modern Physics','Thermodynamics'],
  'Civic Education': ['Citizenship','Human Rights','Rule of Law','Democracy','National Values'],
  'Economics': ['Demand & Supply','Market Structures','National Income','International Trade','Economic Development'],
};

export default function CurriculumMapping() {
  const [items, setItems] = useState<CurriculumItem[]>([]);
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0]);
  const [selectedLevel, setSelectedLevel] = useState(SCHOOL_CLASSES[6]);
  const [selectedTerm, setSelectedTerm] = useState<'1st Term'|'2nd Term'|'3rd Term'>('1st Term');
  const [isModal, setIsModal] = useState(false);
  const [form, setForm] = useState<Partial<CurriculumItem>>({ topic:'', objective:'', completed:false });
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'curriculum_items'), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as CurriculumItem)));
    });
    return () => unsub();
  }, []);

  const filtered = items.filter(i => i.subject === selectedSubject && i.level === selectedLevel && i.term === selectedTerm);
  const completed = filtered.filter(i => i.completed).length;
  const progress = filtered.length > 0 ? Math.round((completed / filtered.length) * 100) : 0;

  const toggleComplete = async (item: CurriculumItem) => {
    if (!item.id) return;
    await updateDoc(doc(db, 'curriculum_items', item.id), {
      completed: !item.completed,
      completedAt: !item.completed ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    }).catch(console.error);
  };

  const saveItem = async () => {
    if (!form.topic) return;
    await addDoc(collection(db, 'curriculum_items'), {
      ...form,
      subject: selectedSubject,
      level: selectedLevel,
      term: selectedTerm,
      completed: false,
      createdAt: serverTimestamp(),
    }).catch(console.error);
    setIsModal(false);
    setForm({ topic:'', objective:'', completed:false });
  };

  const generateObjective = async () => {
    if (!form.topic) return;
    setAiLoading(true);
    const obj = await generateCurriculumObjective(selectedSubject, form.topic, selectedLevel).catch(()=>null);
    if (obj) setForm(p => ({ ...p, objective: obj.trim() }));
    setAiLoading(false);
  };

  const addFromNERDC = async (topic: string) => {
    await addDoc(collection(db, 'curriculum_items'), {
      subject: selectedSubject, level: selectedLevel, term: selectedTerm,
      topic, objective: `Students will understand ${topic} in ${selectedSubject}`,
      completed: false, createdAt: serverTimestamp(),
    }).catch(console.error);
  };

  const nerdc = NERDC_TOPICS[selectedSubject] || [];
  const existingTopics = filtered.map(i => i.topic);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Map className="w-6 h-6 text-indigo-600" />Curriculum Mapping
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Map topics to NERDC curriculum standards and track coverage.</p>
        </div>
        <button onClick={() => setIsModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm">
          <Plus className="w-4 h-4" /> Add Topic
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap gap-4">
          {[
            { label:'Subject', value:selectedSubject, set:setSelectedSubject, opts:SUBJECTS },
            { label:'Level', value:selectedLevel, set:setSelectedLevel, opts:SCHOOL_CLASSES },
          ].map(f=>(
            <div key={f.label}>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">{f.label}</label>
              <select value={f.value} onChange={e=>f.set(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                {f.opts.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Term</label>
            <select value={selectedTerm} onChange={e=>setSelectedTerm(e.target.value as any)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
              <option>1st Term</option><option>2nd Term</option><option>3rd Term</option>
            </select>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-slate-900 text-sm">{selectedSubject} — {selectedLevel} — {selectedTerm}</p>
          <p className="text-sm font-bold text-indigo-600">{completed}/{filtered.length} topics covered ({progress}%)</p>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-3">
          <div className="h-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all" style={{width:`${progress}%`}} />
        </div>
      </div>

      {/* NERDC Suggested Topics */}
      {nerdc.length > 0 && (
        <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-5 mb-6">
          <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-3">NERDC Suggested Topics for {selectedSubject}</p>
          <div className="flex flex-wrap gap-2">
            {nerdc.map(topic=>(
              <button key={topic} onClick={()=>!existingTopics.includes(topic)&&addFromNERDC(topic)}
                disabled={existingTopics.includes(topic)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${existingTopics.includes(topic)?'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default':'bg-white text-slate-700 border-slate-200 hover:border-indigo-400 hover:text-indigo-700 cursor-pointer'}`}>
                {existingTopics.includes(topic)?'✓ ':''}{topic}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Topics List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900 text-sm">Curriculum Topics ({filtered.length})</h2>
        </div>
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Map className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No topics added yet. Add topics or click NERDC suggestions above.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(item=>(
              <motion.div key={item.id} className="flex items-start gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
                <button onClick={()=>toggleComplete(item)} className="mt-0.5 flex-shrink-0">
                  {item.completed
                    ? <CheckCircle className="w-5 h-5 text-emerald-500" />
                    : <Circle className="w-5 h-5 text-slate-300 hover:text-indigo-400 transition-colors" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${item.completed?'line-through text-slate-400':'text-slate-800'}`}>{item.topic}</p>
                  {item.objective && <p className="text-xs text-slate-500 mt-0.5">{item.objective}</p>}
                </div>
                {item.completed && <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">Done</span>}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Add Topic Modal */}
      <AnimatePresence>
        {isModal && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e=>e.target===e.currentTarget&&setIsModal(false)}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-slate-900">Add Curriculum Topic</h2>
                <button onClick={()=>setIsModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Topic</label>
                  <input type="text" value={form.topic||''} onChange={e=>setForm(p=>({...p,topic:e.target.value}))}
                    placeholder="e.g. Quadratic Equations"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Learning Objective</label>
                    <button onClick={generateObjective} disabled={aiLoading||!form.topic}
                      className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-semibold disabled:opacity-40">
                      {aiLoading?<div className="w-3 h-3 border border-violet-400/30 border-t-violet-500 rounded-full animate-spin"/>:<Sparkles className="w-3 h-3"/>}
                      AI Generate
                    </button>
                  </div>
                  <textarea value={form.objective||''} onChange={e=>setForm(p=>({...p,objective:e.target.value}))} rows={3}
                    placeholder="Students will be able to..."
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={()=>setIsModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                <button onClick={saveItem} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm">Save Topic</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
