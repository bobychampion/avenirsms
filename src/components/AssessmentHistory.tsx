import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { AssessmentGrade } from '../utils/assessmentSessions';

export default function AssessmentHistory({ schoolId, studentId, session, term }: { schoolId: string | null | undefined; studentId: string; session: string; term?: string }) {
  const [records, setRecords] = useState<AssessmentGrade[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    setRecords([]); setError(false);
    if (!schoolId || !studentId) return;
    return onSnapshot(query(collection(db, 'assessment_grades'), where('schoolId', '==', schoolId), where('studentId', '==', studentId)), snap => {
      setRecords(snap.docs.map(d => ({ ...d.data(), id: d.id } as AssessmentGrade)));
    }, () => setError(true));
  }, [schoolId, studentId]);
  const visible = records.filter(g => g.session === session && (!term || g.term === term)).sort((a, b) => a.subject.localeCompare(b.subject) || a.assessmentDate.localeCompare(b.assessmentDate) || a.assessmentName.localeCompare(b.assessmentName, undefined, { numeric: true }));
  return <section className="bg-white rounded-xl border border-slate-200 p-4">
    <h3 className="font-bold text-sm mb-3">Assessment history — {session}</h3>
    {error ? <p role="alert" className="text-sm text-rose-600">Unable to load assessments.</p> : !visible.length ? <p className="text-sm text-slate-500">No assessments recorded{term ? ` for ${term}` : ''}.</p> : <div className="overflow-x-auto"><table className="w-full text-sm text-left">
      <thead className="bg-slate-50"><tr>{['Subject', 'Assessment', 'Term', 'Date', 'Grade', 'Comment'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
      <tbody>{visible.map(g => <tr key={g.id} className="border-t"><td className="p-2">{g.subject}</td><td className="p-2">{g.assessmentName}</td><td className="p-2">{g.term}</td><td className="p-2">{g.assessmentDate || '—'}</td><td className="p-2 font-semibold">{g.grade || '—'}</td><td className="p-2">{g.teacherNotes || '—'}</td></tr>)}</tbody>
    </table></div>}
  </section>;
}
