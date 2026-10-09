import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssessmentGrade } from '../utils/assessmentSessions';
import { assessmentDocumentId, chooseFinalAssessment, defaultAssessmentSessions } from '../utils/assessmentSessions';

const mocks = vi.hoisted(() => ({ stored: new Map<string, any>(), writes: [] as { ref: string; data: any }[] }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  serverTimestamp: () => 'SERVER_TIME', deleteField: () => 'DELETE',
  runTransaction: async (_db: unknown, callback: any) => callback({
    get: async (ref: string) => {
      if (mocks.writes.length) throw new Error('Read after write');
      return { exists: () => mocks.stored.has(ref), data: () => mocks.stored.get(ref) };
    },
    set: (ref: string, data: unknown) => mocks.writes.push({ ref, data }),
    update: (ref: string, data: unknown) => mocks.writes.push({ ref, data }),
  }),
}));
import { saveAssessmentChunk, saveAssessmentDefinition } from './assessmentService';

const context = { schoolId: 'school', className: 'Year 12', classId: 'class12', subject: 'Mathematics', session: '2026/2027', recordedBy: 'teacher', gradingMode: 'single_grade' as const };
const makeGrade = (assessmentId = 'grade-1'): AssessmentGrade => ({
  studentId: 'student', class: 'Year 12', subject: 'Mathematics', session: '2026/2027', term: '1st Term',
  grade: '6', teacherNotes: 'Progressing well', updatedAt: null, assessmentId,
  assessmentName: 'Grade 1', assessmentDate: '2026-10-09', caScore: 0, examScore: 0, totalScore: 0,
});

beforeEach(() => { mocks.stored.clear(); mocks.writes.length = 0; });

describe('annual assessment persistence', () => {
  it('provides six stable year slots, with two assigned to each term', () => {
    const defaults = defaultAssessmentSessions();
    expect(defaults).toHaveLength(6);
    expect(new Set(defaults.map(a => a.id)).size).toBe(6);
    expect(defaults.map(a => a.term)).toEqual(['1st Term', '1st Term', '2nd Term', '2nd Term', '3rd Term', '3rd Term']);
  });
  it('isolates schools, years, subjects, and assessments even when names contain separators', () => {
    expect(assessmentDocumentId('a|b', 'c')).not.toBe(assessmentDocumentId('a', 'b|c'));
    const ids = [
      assessmentDocumentId('school', 'Maths', '2026/2027', 'grade-1'),
      assessmentDocumentId('school', 'Maths', '2027/2028', 'grade-1'),
      assessmentDocumentId('school', 'Maths', '2026/2027', 'grade-7'),
      assessmentDocumentId('other-school', 'Maths', '2026/2027', 'grade-1'),
      assessmentDocumentId('school', 'English', '2026/2027', 'grade-1'),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some(id => id.includes('/'))).toBe(false);
  });
  it('saves extra assessments separately from final grades, with attribution and no numeric fields in discrete mode', async () => {
    const a = { ...defaultAssessmentSessions()[0], id: 'extra', name: 'Grade 7', order: 7 };
    await saveAssessmentChunk([{ grade: makeGrade('extra'), revision: 0 }], [a], context);
    expect(mocks.writes.map(w => w.ref.split('/')[0])).toEqual(['grade_assessments', 'assessment_grades']);
    const saved = mocks.writes[1].data;
    expect(saved).toMatchObject({ assessmentId: 'extra', revision: 1, recordedBy: 'teacher', schoolId: 'school', grade: '6' });
    expect(saved).not.toHaveProperty('caScore'); expect(saved).not.toHaveProperty('totalScore');
    expect(Object.values(saved)).not.toContain(undefined);
    // The definition identifier survives backup serializers which strip the document's `id`.
    expect(mocks.writes[0].data).toMatchObject({ assessmentId: 'extra', name: 'Grade 7' });
    expect(mocks.writes[0].data).not.toHaveProperty('id');
  });
  it('rejects a concurrent edit before issuing any writes', async () => {
    const g = { ...makeGrade(), id: 'existing' };
    mocks.stored.set('assessment_grades/existing', { revision: 3 });
    await expect(saveAssessmentChunk([{ grade: g, revision: 2 }], defaultAssessmentSessions().slice(0, 1), context)).rejects.toThrow('Another teacher');
    expect(mocks.writes).toEqual([]);
  });
  it('rejects a changed assessment definition without overwriting it', async () => {
    const a = defaultAssessmentSessions()[0];
    mocks.stored.set(`grade_assessments/${assessmentDocumentId('school', 'Year 12', 'Mathematics', '2026/2027', a.id)}`, { ...a, name: 'Renamed by another teacher' });
    await expect(saveAssessmentChunk([{ grade: makeGrade(), revision: 0 }], [a], context)).rejects.toThrow('Assessment details changed');
    expect(mocks.writes).toEqual([]);
  });
  it('retains zero scores in percentage mode and supports a notes-only draft', async () => {
    await saveAssessmentChunk([{ grade: { ...makeGrade(), totalScore: 0, grade: 'F' }, revision: 0 }], [], { ...context, gradingMode: 'score_percentage' });
    expect(mocks.writes[0].data.totalScore).toBe(0);
    mocks.writes.length = 0;
    await saveAssessmentChunk([{ grade: { ...makeGrade(), grade: '' }, revision: 0 }], [], context);
    expect(mocks.writes[0].data).toMatchObject({ grade: '', teacherNotes: 'Progressing well' });
  });
  it('updates saved history labels and dates without changing the grade or comment', async () => {
    const a = { ...defaultAssessmentSessions()[0], name: 'Autumn assessment', date: '2026-10-09' };
    const g = { ...makeGrade(), id: 'existing' };
    mocks.stored.set('assessment_grades/existing', { ...g, revision: 2 });
    await saveAssessmentDefinition(a, [{ grade: g, revision: 2 }], context);
    expect(mocks.writes[1]).toEqual({ ref: 'assessment_grades/existing', data: expect.objectContaining({ assessmentName: a.name, assessmentDate: a.date, revision: 3 }) });
    expect(mocks.writes[1].data).not.toHaveProperty('grade');
    expect(mocks.writes[1].data).not.toHaveProperty('teacherNotes');
  });
  it('selects a final grade without replacing the legacy record ID or term/year', () => {
    const existing = { ...makeGrade(), id: 'legacy-final', assessmentId: undefined, term: '2nd Term' as const };
    const chosen = chooseFinalAssessment(existing, makeGrade());
    expect(chosen).toMatchObject({ id: 'legacy-final', term: '2nd Term', session: '2026/2027', grade: '6', teacherNotes: 'Progressing well' });
    expect(chosen).not.toHaveProperty('assessmentId', 'grade-1');
  });
});
