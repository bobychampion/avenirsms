import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, orderBy, query,
} from 'firebase/firestore';
import { CurriculumItem, CurriculumDocument, SCHOOL_CLASSES, SUBJECTS } from '../types';
import { generateCurriculumObjective, summarizeCurriculumDocument } from '../services/geminiService';
import {
  Map, Plus, X, CheckCircle, Circle, Sparkles, Brain,
  Upload, FileText, Trash2, ChevronDown, ChevronUp, BookOpen,
  AlertCircle, Loader2, Link2, Target, ClipboardList, BarChart2,
  ArrowDownToLine, CheckSquare,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../components/FirebaseProvider';
import toast from 'react-hot-toast';

const NERDC_TOPICS: Record<string, string[]> = {
  'Mathematics': ['Number & Numeration', 'Algebra', 'Geometry', 'Trigonometry', 'Statistics & Probability', 'Calculus'],
  'English Language': ['Comprehension', 'Summary Writing', 'Essay Writing', 'Grammar', 'Oral English', 'Literature'],
  'Biology': ['Cell Biology', 'Genetics', 'Ecology', 'Evolution', 'Physiology', 'Reproduction'],
  'Chemistry': ['Atomic Structure', 'Periodic Table', 'Chemical Bonding', 'Acids & Bases', 'Organic Chemistry', 'Electrochemistry'],
  'Physics': ['Mechanics', 'Waves & Optics', 'Electricity', 'Magnetism', 'Modern Physics', 'Thermodynamics'],
  'Civic Education': ['Citizenship', 'Human Rights', 'Rule of Law', 'Democracy', 'National Values'],
  'Economics': ['Demand & Supply', 'Market Structures', 'National Income', 'International Trade', 'Economic Development'],
};

type TabId = 'mapping' | 'ai_training';

// ─── AI Training Tab ──────────────────────────────────────────────────────────

function AISummaryCard({ doc: cdoc, onDelete }: { doc: CurriculumDocument; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.div layout className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 flex items-start gap-4">
        <div className="p-2.5 bg-indigo-50 rounded-xl flex-shrink-0">
          <FileText className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-slate-900 text-sm truncate">{cdoc.fileName}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-[11px] font-semibold">{cdoc.subject}</span>
                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-full text-[11px] font-semibold">{cdoc.level}</span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[11px] font-semibold">{cdoc.term}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setExpanded(e => !e)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                title="Delete document"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Key topics preview */}
          {cdoc.summary.keyTopics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {cdoc.summary.keyTopics.slice(0, 4).map(t => (
                <span key={t} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[11px] font-medium">
                  {t}
                </span>
              ))}
              {cdoc.summary.keyTopics.length > 4 && (
                <span className="px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 rounded-full text-[11px]">
                  +{cdoc.summary.keyTopics.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 p-5 space-y-4">
              {cdoc.summary.rawSummary && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">AI Summary</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{cdoc.summary.rawSummary}</p>
                </div>
              )}
              {cdoc.summary.learningObjectives.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Learning Objectives</p>
                  <ul className="space-y-1">
                    {cdoc.summary.learningObjectives.map((o, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="text-indigo-400 font-bold mt-0.5">•</span>{o}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {cdoc.summary.assessmentFocus.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Assessment Focus</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cdoc.summary.assessmentFocus.map(f => (
                      <span key={f} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[11px] font-medium">{f}</span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-400">{cdoc.charCount.toLocaleString()} characters processed</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AITrainingTab() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<CurriculumDocument[]>([] as CurriculumDocument[]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [form, setForm] = useState({ subject: SUBJECTS[0], level: SCHOOL_CLASSES[6], term: '1st Term' as const });
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'curriculum_documents'), orderBy('uploadedAt', 'desc')),
      snap => setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as CurriculumDocument))),
      () => {}
    );
    return () => unsub();
  }, []);

  const extractText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const pdfjsLib = await import('pdfjs-dist');
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
              'pdfjs-dist/build/pdf.worker.min.mjs',
              import.meta.url
            ).toString();
            const typedArray = new Uint8Array(reader.result as ArrayBuffer);
            const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
            let text = '';
            for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
              const page = await pdf.getPage(i);
              const content = await page.getTextContent();
              text += content.items.map((item: any) => item.str).join(' ') + '\n';
            }
            resolve(text);
          } catch (err) {
            reject(new Error('PDF parsing failed. Please convert to TXT and retry.'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read PDF file.'));
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = e => resolve((e.target?.result as string) || '');
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsText(file);
      }
    });
  };

  const processFile = async (file: File) => {
    if (!user) { toast.error('Not logged in'); return; }
    const allowed = ['application/pdf', 'text/plain', 'text/markdown'];
    if (!allowed.includes(file.type) && !file.name.endsWith('.md')) {
      toast.error('Only PDF, TXT, or MD files are supported.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10 MB.');
      return;
    }

    setUploading(true);
    setUploadProgress('Reading file…');
    try {
      const text = await extractText(file);
      if (!text.trim()) throw new Error('No text found in file.');

      setUploadProgress('Sending to Gemini for analysis…');
      const summary = await summarizeCurriculumDocument(text, form.subject, form.level);

      setUploadProgress('Saving to Firestore…');
      await addDoc(collection(db, 'curriculum_documents'), {
        schoolId: 'main',
        fileName: file.name,
        subject: form.subject,
        level: form.level,
        term: form.term,
        uploadedBy: user.uid,
        summary,
        charCount: text.length,
        uploadedAt: serverTimestamp(),
      } as Omit<CurriculumDocument, 'id'>);

      toast.success(`"${file.name}" processed and saved!`);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed. Try again.');
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const deleteDocument = async (id: string) => {
    if (!confirm('Delete this document and its AI summary?')) return;
    await deleteDoc(doc(db, 'curriculum_documents', id)).catch(console.error);
    toast.success('Document deleted.');
  };

  const filtered = docs.filter(d =>
    (!filterSubject || d.subject === filterSubject) &&
    (!filterLevel || d.level === filterLevel)
  );

  const grouped = filtered.reduce<Record<string, CurriculumDocument[]>>((acc, d) => {
    if (!acc[d.subject]) acc[d.subject] = [];
    acc[d.subject].push(d);
    return acc;
  }, {} as Record<string, CurriculumDocument[]>);

  return (
    <div className="space-y-6">
      {/* Upload card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <Brain className="w-5 h-5 text-violet-600" />
          <h2 className="font-bold text-slate-900">Upload Curriculum Document</h2>
          <span className="ml-auto text-xs text-slate-400">PDF · TXT · MD · max 10 MB</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Subject', value: form.subject, key: 'subject' as const, opts: SUBJECTS },
            { label: 'Level', value: form.level, key: 'level' as const, opts: SCHOOL_CLASSES },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">{f.label}</label>
              <select
                value={f.value}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
              >
                {f.opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Term</label>
            <select
              value={form.term}
              onChange={e => setForm(p => ({ ...p, term: e.target.value as any }))}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
            >
              <option>1st Term</option><option>2nd Term</option><option>3rd Term</option>
            </select>
          </div>
        </div>

        {/* Drop zone */}
        <div
          ref={dropRef}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
            ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}
            ${uploading ? 'cursor-not-allowed opacity-70' : ''}`}
        >
          <input ref={fileRef} type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" className="hidden" onChange={handleFileChange} disabled={uploading} />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
              <p className="text-sm font-semibold text-indigo-700">{uploadProgress}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-indigo-50 rounded-xl">
                <Upload className="w-8 h-8 text-indigo-500" />
              </div>
              <div>
                <p className="font-bold text-slate-700">Drag & drop or click to upload</p>
                <p className="text-sm text-slate-400 mt-1">Gemini will analyse and summarise the document for AI-enhanced question generation</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Document Library */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            Curriculum Library ({docs.length})
          </h2>
          <div className="flex gap-2">
            <select
              value={filterSubject}
              onChange={e => setFilterSubject(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-xs font-medium"
            >
              <option value="">All Subjects</option>
              {SUBJECTS.map(s => <option key={s}>{s}</option>)}
            </select>
            <select
              value={filterLevel}
              onChange={e => setFilterLevel(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-xs font-medium"
            >
              <option value="">All Levels</option>
              {SCHOOL_CLASSES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {docs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
            <Brain className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No curriculum documents yet.</p>
            <p className="text-slate-400 text-sm mt-1">Upload a PDF or TXT file above to get started.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
            <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No documents match the selected filters.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([subject, subjectDocs]) => (
              <div key={subject}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                  {subject} <span className="text-slate-300">({subjectDocs.length})</span>
                </p>
                <div className="space-y-3">
                  {subjectDocs.map(d => (
                    <AISummaryCard key={d.id} doc={d} onDelete={() => deleteDocument(d.id!)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI Document Import Panel (inside Mapping tab) ────────────────────────────

interface ImportableItem {
  topic: string;
  objective: string;
  assessmentFocus: string[];
  docId: string;
  docName: string;
}

function AIDocumentImportPanel({
  subject, level, term, existingTopics, onImport,
}: {
  subject: string;
  level: string;
  term: string;
  existingTopics: string[];
  onImport: (items: ImportableItem[]) => Promise<void>;
}) {
  const [docs, setDocs] = useState<CurriculumDocument[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'curriculum_documents'), orderBy('uploadedAt', 'desc')),
      snap => setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as CurriculumDocument))),
      () => {}
    );
    return () => unsub();
  }, []);

  // Reset selection when context changes
  useEffect(() => { setSelected(new Set()); }, [subject, level, term]);

  const matchingDocs = docs.filter(d => d.subject === subject && d.level === level && d.term === term);

  // Build a flat list of importable items across all matching docs
  const importableItems: ImportableItem[] = matchingDocs.flatMap(d => {
    const topics = d.summary.keyTopics;
    const objectives = d.summary.learningObjectives;
    const focus = d.summary.assessmentFocus;
    return topics.map((topic, idx) => ({
      topic,
      objective: objectives[idx] ?? (objectives[0] ?? `Students will understand ${topic} in ${subject}`),
      assessmentFocus: focus,
      docId: d.id!,
      docName: d.fileName,
    }));
  });

  const newItems = importableItems.filter(i => !existingTopics.includes(i.topic));
  const alreadyMapped = importableItems.filter(i => existingTopics.includes(i.topic));

  const toggleItem = (topic: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(topic) ? next.delete(topic) : next.add(topic);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(newItems.map(i => i.topic)));
  const clearAll = () => setSelected(new Set());

  const handleImport = async () => {
    if (selected.size === 0) return;
    const toImport = importableItems.filter(i => selected.has(i.topic));
    setImporting(true);
    await onImport(toImport);
    setImporting(false);
    setSelected(new Set());
  };

  if (matchingDocs.length === 0) return null;

  // Compute coverage: how many of the AI doc's topics are already in the mapping
  const coveredCount = alreadyMapped.length;
  const totalCount = importableItems.length;
  const coveragePct = totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 0;

  return (
    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl border border-violet-100 p-5 mb-6">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-violet-100 rounded-lg">
            <Brain className="w-4 h-4 text-violet-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-violet-900">
              AI Curriculum Documents
              <span className="ml-2 px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded-md text-[11px]">
                {matchingDocs.length} doc{matchingDocs.length !== 1 ? 's' : ''}
              </span>
            </p>
            <p className="text-xs text-violet-600">
              {coveredCount}/{totalCount} topics aligned · {coveragePct}% coverage
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mini coverage bar */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-24 bg-violet-100 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-violet-500 transition-all"
                style={{ width: `${coveragePct}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-violet-700">{coveragePct}%</span>
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-violet-400 group-hover:text-violet-600 transition-colors" />
            : <ChevronDown className="w-4 h-4 text-violet-400 group-hover:text-violet-600 transition-colors" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-4">
              {/* Per-document coverage */}
              {matchingDocs.map(d => {
                const docTopics = d.summary.keyTopics;
                const docCovered = docTopics.filter(t => existingTopics.includes(t)).length;
                const docPct = docTopics.length > 0 ? Math.round((docCovered / docTopics.length) * 100) : 0;
                return (
                  <div key={d.id} className="bg-white/70 rounded-xl p-3 border border-violet-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-slate-700 truncate flex items-center gap-1.5">
                        <FileText className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                        {d.fileName}
                      </p>
                      <span className="text-[11px] font-bold text-violet-700 flex-shrink-0 ml-2">
                        {docCovered}/{docTopics.length} aligned
                      </span>
                    </div>
                    <div className="w-full bg-violet-100 rounded-full h-1">
                      <div className="h-1 rounded-full bg-violet-400 transition-all" style={{ width: `${docPct}%` }} />
                    </div>
                    {/* Learning Objectives from this doc */}
                    {d.summary.learningObjectives.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                          <Target className="w-2.5 h-2.5" /> Learning Outcomes
                        </p>
                        <ul className="space-y-0.5">
                          {d.summary.learningObjectives.slice(0, 3).map((obj, i) => (
                            <li key={i} className="text-[11px] text-slate-600 flex items-start gap-1">
                              <span className="text-violet-400 font-bold">•</span>{obj}
                            </li>
                          ))}
                          {d.summary.learningObjectives.length > 3 && (
                            <li className="text-[11px] text-slate-400">+{d.summary.learningObjectives.length - 3} more objectives…</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Topic import checklist */}
              {newItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      <ArrowDownToLine className="w-3.5 h-3.5 text-indigo-500" />
                      Import to Curriculum Map
                    </p>
                    <div className="flex gap-2">
                      <button onClick={selectAll} className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold">Select all</button>
                      <span className="text-slate-300">|</span>
                      <button onClick={clearAll} className="text-[11px] text-slate-500 hover:text-slate-700 font-semibold">Clear</button>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {newItems.map(item => (
                      <label
                        key={item.topic}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors
                          ${selected.has(item.topic)
                            ? 'bg-indigo-50 border-indigo-200'
                            : 'bg-white/80 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(item.topic)}
                          onChange={() => toggleItem(item.topic)}
                          className="mt-0.5 accent-indigo-600 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800">{item.topic}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{item.objective}</p>
                          {item.assessmentFocus.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.assessmentFocus.slice(0, 3).map(f => (
                                <span key={f} className="px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded text-[10px]">{f}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Already mapped topics */}
              {alreadyMapped.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 mb-1.5">
                    <CheckSquare className="w-3.5 h-3.5" />
                    Already in curriculum map ({alreadyMapped.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {alreadyMapped.map(i => (
                      <span key={i.topic} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[11px] font-medium">
                        ✓ {i.topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {newItems.length === 0 && alreadyMapped.length > 0 && (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-xl p-3">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="text-xs font-semibold">All AI-extracted topics are already mapped for this term.</p>
                </div>
              )}

              {/* Import button */}
              {selected.size > 0 && (
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-60"
                >
                  {importing
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
                    : <><ArrowDownToLine className="w-4 h-4" /> Import {selected.size} topic{selected.size !== 1 ? 's' : ''} to Curriculum Map</>}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CurriculumMapping() {
  const [activeTab, setActiveTab] = useState<TabId>('mapping');
  const [items, setItems] = useState<CurriculumItem[]>([]);
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0]);
  const [selectedLevel, setSelectedLevel] = useState(SCHOOL_CLASSES[6]);
  const [selectedTerm, setSelectedTerm] = useState<'1st Term' | '2nd Term' | '3rd Term'>('1st Term');
  const [isModal, setIsModal] = useState(false);
  const [form, setForm] = useState<Partial<CurriculumItem>>({ topic: '', objective: '', completed: false });
  const [aiLoading, setAiLoading] = useState(false);
  // Track which item is expanded for outcome details
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'curriculum_items'), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as CurriculumItem)));
    });
    return () => unsub();
  }, []);

  const filtered = items.filter(i => i.subject === selectedSubject && i.level === selectedLevel && i.term === selectedTerm);
  const completed = filtered.filter(i => i.completed).length;
  const progress = filtered.length > 0 ? Math.round((completed / filtered.length) * 100) : 0;
  const aiAligned = filtered.filter(i => i.source === 'ai_document').length;

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
      source: 'manual',
      createdAt: serverTimestamp(),
    }).catch(console.error);
    setIsModal(false);
    setForm({ topic: '', objective: '', completed: false });
  };

  const generateObjective = async () => {
    if (!form.topic) return;
    setAiLoading(true);
    const obj = await generateCurriculumObjective(selectedSubject, form.topic, selectedLevel).catch(() => null);
    if (obj) setForm(p => ({ ...p, objective: obj.trim() }));
    setAiLoading(false);
  };

  const addFromNERDC = async (topic: string) => {
    await addDoc(collection(db, 'curriculum_items'), {
      subject: selectedSubject, level: selectedLevel, term: selectedTerm,
      topic, objective: `Students will understand ${topic} in ${selectedSubject}`,
      completed: false, source: 'nerdc', createdAt: serverTimestamp(),
    }).catch(console.error);
  };

  const importFromAIDocs = async (importItems: ImportableItem[]) => {
    const promises = importItems.map(item =>
      addDoc(collection(db, 'curriculum_items'), {
        subject: selectedSubject,
        level: selectedLevel,
        term: selectedTerm,
        topic: item.topic,
        objective: item.objective,
        alignedObjective: item.objective,
        alignedAssessmentFocus: item.assessmentFocus,
        sourceDocId: item.docId,
        sourceDocName: item.docName,
        completed: false,
        source: 'ai_document',
        createdAt: serverTimestamp(),
      } as Omit<CurriculumItem, 'id'>)
    );
    await Promise.all(promises);
    toast.success(`${importItems.length} topic${importItems.length !== 1 ? 's' : ''} imported from AI document!`);
  };

  const nerdc = NERDC_TOPICS[selectedSubject] || [];
  const existingTopics = filtered.map(i => i.topic);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'mapping', label: 'Curriculum Mapping', icon: <Map className="w-4 h-4" /> },
    { id: 'ai_training', label: 'AI Training', icon: <Brain className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Map className="w-6 h-6 text-indigo-600" />Curriculum
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Map topics to NERDC standards and train AI with curriculum documents.</p>
        </div>
        {activeTab === 'mapping' && (
          <button onClick={() => setIsModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-sm">
            <Plus className="w-4 h-4" /> Add Topic
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl mb-6 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── Curriculum Mapping Tab ── */}
      {activeTab === 'mapping' && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
            <div className="flex flex-wrap gap-4">
              {[
                { label: 'Subject', value: selectedSubject, set: setSelectedSubject, opts: SUBJECTS },
                { label: 'Level', value: selectedLevel, set: setSelectedLevel, opts: SCHOOL_CLASSES },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">{f.label}</label>
                  <select value={f.value} onChange={e => f.set(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                    {f.opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Term</label>
                <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value as any)}
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
            <div className="w-full bg-slate-200 rounded-full h-3 mb-3">
              <div className="h-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            {/* Stats row */}
            {filtered.length > 0 && (
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-violet-400" />
                  <span><span className="font-bold text-violet-700">{aiAligned}</span> AI-aligned</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span><span className="font-bold text-indigo-700">{filtered.filter(i => i.source === 'nerdc').length}</span> NERDC</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
                  <span><span className="font-bold text-slate-700">{filtered.filter(i => !i.source || i.source === 'manual').length}</span> Manual</span>
                </div>
              </div>
            )}
          </div>

          {/* AI Document Import Panel */}
          <AIDocumentImportPanel
            subject={selectedSubject}
            level={selectedLevel}
            term={selectedTerm}
            existingTopics={existingTopics}
            onImport={importFromAIDocs}
          />

          {/* NERDC Suggested Topics */}
          {nerdc.length > 0 && (
            <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-5 mb-6">
              <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-3">NERDC Suggested Topics for {selectedSubject}</p>
              <div className="flex flex-wrap gap-2">
                {nerdc.map(topic => (
                  <button key={topic} onClick={() => !existingTopics.includes(topic) && addFromNERDC(topic)}
                    disabled={existingTopics.includes(topic)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${existingTopics.includes(topic) ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default' : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-400 hover:text-indigo-700 cursor-pointer'}`}>
                    {existingTopics.includes(topic) ? '✓ ' : ''}{topic}
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
                <p className="text-sm">No topics added yet. Add topics, click NERDC suggestions, or import from AI documents above.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map(item => (
                  <div key={item.id} className="hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3 px-5 py-4">
                      <button onClick={() => toggleComplete(item)} className="mt-0.5 flex-shrink-0">
                        {item.completed
                          ? <CheckCircle className="w-5 h-5 text-emerald-500" />
                          : <Circle className="w-5 h-5 text-slate-300 hover:text-indigo-400 transition-colors" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`font-semibold text-sm ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {item.topic}
                          </p>
                          {/* Source badges */}
                          {item.source === 'ai_document' && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-100 rounded-md text-[10px] font-semibold">
                              <Brain className="w-2.5 h-2.5" /> AI Doc
                            </span>
                          )}
                          {item.source === 'nerdc' && (
                            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[10px] font-semibold">
                              NERDC
                            </span>
                          )}
                        </div>
                        {item.objective && (
                          <p className="text-xs text-slate-500 mt-0.5">{item.objective}</p>
                        )}
                        {/* AI-aligned details toggle */}
                        {item.source === 'ai_document' && (item.alignedAssessmentFocus?.length || item.sourceDocName) && (
                          <button
                            onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id!)}
                            className="mt-1 text-[11px] text-violet-600 hover:text-violet-800 font-semibold flex items-center gap-1"
                          >
                            <Link2 className="w-3 h-3" />
                            {expandedItemId === item.id ? 'Hide' : 'Show'} learning outcome alignment
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {item.completed && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-semibold">Done</span>
                        )}
                      </div>
                    </div>

                    {/* Expanded: Learning Outcome Alignment */}
                    <AnimatePresence>
                      {expandedItemId === item.id && item.source === 'ai_document' && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mx-5 mb-4 bg-violet-50 rounded-xl p-3 border border-violet-100 space-y-2">
                            {item.sourceDocName && (
                              <div className="flex items-center gap-1.5 text-[11px] text-violet-700">
                                <FileText className="w-3 h-3" />
                                <span className="font-semibold">Source:</span> {item.sourceDocName}
                              </div>
                            )}
                            {item.alignedObjective && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                  <Target className="w-2.5 h-2.5" /> Learning Outcome
                                </p>
                                <p className="text-xs text-slate-700 leading-snug">{item.alignedObjective}</p>
                              </div>
                            )}
                            {item.alignedAssessmentFocus && item.alignedAssessmentFocus.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                                  <ClipboardList className="w-2.5 h-2.5" /> Assessment Focus
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {item.alignedAssessmentFocus.map(f => (
                                    <span key={f} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[10px] font-medium">{f}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── AI Training Tab ── */}
      {activeTab === 'ai_training' && <AITrainingTab />}

      {/* Add Topic Modal */}
      <AnimatePresence>
        {isModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setIsModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-slate-900">Add Curriculum Topic</h2>
                <button onClick={() => setIsModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Topic</label>
                  <input type="text" value={form.topic || ''} onChange={e => setForm(p => ({ ...p, topic: e.target.value }))}
                    placeholder="e.g. Quadratic Equations"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Learning Objective</label>
                    <button onClick={generateObjective} disabled={aiLoading || !form.topic}
                      className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-semibold disabled:opacity-40">
                      {aiLoading ? <div className="w-3 h-3 border border-violet-400/30 border-t-violet-500 rounded-full animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      AI Generate
                    </button>
                  </div>
                  <textarea value={form.objective || ''} onChange={e => setForm(p => ({ ...p, objective: e.target.value }))} rows={3}
                    placeholder="Students will be able to..."
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setIsModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                <button onClick={saveItem} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 text-sm">Save Topic</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
