import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { GradingMode } from '../types';
import { gradePayload } from '../utils/gradebookSave';
import { AssessmentGrade, AssessmentSession, assessmentDocumentId } from '../utils/assessmentSessions';

interface AssessmentSaveContext {
  schoolId: string;
  className: string;
  classId: string;
  subject: string;
  session: string;
  recordedBy: string;
  gradingMode: GradingMode;
}

/** Each chunk is atomic: concurrent edits leave the whole chunk untouched. */
export async function saveAssessmentChunk(
  entries: { grade: AssessmentGrade; revision: number }[],
  definitions: AssessmentSession[],
  context: AssessmentSaveContext,
) {
  const { schoolId, className, classId, subject, session, recordedBy, gradingMode } = context;
  const refs = entries.map(({ grade }) => doc(db, 'assessment_grades', grade.id ?? assessmentDocumentId(schoolId, className, subject, session, grade.assessmentId, grade.studentId)));
  const definitionRefs = definitions.map(a => doc(db, 'grade_assessments', assessmentDocumentId(schoolId, className, subject, session, a.id)));
  await runTransaction(db, async tx => {
    const existing = await Promise.all(refs.map(ref => tx.get(ref)));
    const existingDefinitions = await Promise.all(definitionRefs.map(ref => tx.get(ref)));
    existing.forEach((snap, i) => {
      if ((snap.data()?.revision ?? 0) !== entries[i].revision) throw new Error('Another teacher changed an assessment. Reopen the gradebook before saving.');
    });
    existingDefinitions.forEach((snap, i) => {
      if (snap.exists() && (snap.data().term !== definitions[i].term || snap.data().name !== definitions[i].name || snap.data().date !== definitions[i].date)) throw new Error('Assessment details changed. Reopen the gradebook before saving.');
    });
    // Reads precede all writes, as required by Firestore transactions.
    definitions.forEach((a, i) => {
      if (!existingDefinitions[i].exists()) tx.set(definitionRefs[i], {
        assessmentId: a.id, name: a.name, date: a.date, term: a.term, order: a.order, schoolId, class: className, classId, subject, session, recordedBy, updatedAt: serverTimestamp(),
      });
    });
    entries.forEach(({ grade, revision }, i) => {
      tx.set(refs[i], { ...gradePayload(grade, gradingMode, classId, schoolId), revision: revision + 1, recordedBy, updatedAt: serverTimestamp() });
    });
  });
}

/** Keep the assessment label/date in parent history and exports consistent with the teacher's grid. */
export async function saveAssessmentDefinition(
  definition: AssessmentSession,
  entries: { grade: AssessmentGrade; revision: number }[],
  context: AssessmentSaveContext,
) {
  const { schoolId, className, classId, subject, session, recordedBy } = context;
  const ref = doc(db, 'grade_assessments', assessmentDocumentId(schoolId, className, subject, session, definition.id));
  const refs = entries.map(({ grade }) => doc(db, 'assessment_grades', grade.id ?? assessmentDocumentId(schoolId, className, subject, session, grade.assessmentId, grade.studentId)));
  if (entries.length > 499) throw new Error('This assessment has too many records to rename in one save. Please contact your administrator.');
  await runTransaction(db, async tx => {
    const existing = await tx.get(ref);
    const saved = await Promise.all(refs.map(r => tx.get(r)));
    if (existing.exists() && existing.data().term !== definition.term) throw new Error('The term of a saved assessment cannot be changed. Add a new assessment for another term.');
    saved.forEach((snap, i) => {
      if (!snap.exists() || (snap.data().revision ?? 0) !== entries[i].revision) throw new Error('Another teacher changed an assessment. Reopen the gradebook before editing its details.');
    });
    tx.set(ref, { assessmentId: definition.id, name: definition.name, date: definition.date, term: definition.term, order: definition.order,
      schoolId, class: className, classId, subject, session, recordedBy, updatedAt: serverTimestamp() });
    saved.forEach((snap, i) => {
      tx.update(refs[i], { assessmentName: definition.name, assessmentDate: definition.date, revision: entries[i].revision + 1, updatedAt: serverTimestamp(), recordedBy });
    });
  });
}
