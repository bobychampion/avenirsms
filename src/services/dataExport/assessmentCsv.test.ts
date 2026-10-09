import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ added: vi.fn(), writes: vi.fn(), existing: new Map<string, any>() }));
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('../firestoreService', () => ({ generateStudentId: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => name,
  doc: (_db: unknown, name: string, id: string) => `${name}/${id}`,
  serverTimestamp: () => 'SERVER_TIME',
  addDoc: mocks.added, query: vi.fn(), where: vi.fn(), getDocs: vi.fn(), writeBatch: vi.fn(),
  runTransaction: async (_db: unknown, callback: any) => callback({
    get: async (ref: string) => ({ exists: () => mocks.existing.has(ref), data: () => mocks.existing.get(ref) }), set: mocks.writes,
  }),
}));
import { GRADE_CSV_HEADERS, gradeToCsvRow, importGradesFromRows, type GradeCsvRow } from './csvModules';
import { assessmentDocumentId } from '../../utils/assessmentSessions';

const row: GradeCsvRow = { studentId: 'student', studentName: 'Ada', class: 'Year 12', subject: 'Maths', term: '1st Term', session: '2026/2027',
  caScore: '', examScore: '', totalScore: '0', grade: 'F', teacherNotes: 'Review this topic', classId: 'class12', gradingMode: 'score_percentage',
  assessmentId: 'grade-1', assessmentName: 'Grade 1', assessmentDate: '2026-10-09' };

beforeEach(() => { vi.clearAllMocks(); mocks.existing.clear(); });
describe('assessment CSV round trips', () => {
  it('includes assessment identity, label, and date in exports', () => {
    const values = gradeToCsvRow({ ...row, totalScore: 0, caScore: undefined, examScore: undefined, term: '1st Term', updatedAt: null, gradingMode: 'score_percentage' });
    expect(values).toHaveLength(GRADE_CSV_HEADERS.length);
    expect(values[GRADE_CSV_HEADERS.indexOf('assessmentId')]).toBe('grade-1');
    expect(values[GRADE_CSV_HEADERS.indexOf('assessmentName')]).toBe('Grade 1');
    expect(values[GRADE_CSV_HEADERS.indexOf('assessmentDate')]).toBe('2026-10-09');
    expect(values[GRADE_CSV_HEADERS.indexOf('totalScore')]).toBe('0');
  });
  it('imports percentage assessments separately from finals and preserves zero', async () => {
    const result = await importGradesFromRows([row], 'school');
    expect(result[0].status).toBe('success');
    expect(mocks.added).not.toHaveBeenCalled();
    expect(mocks.writes).toHaveBeenCalledWith(expect.stringContaining('assessment_grades/'), expect.objectContaining({ assessmentId: 'grade-1', totalScore: 0, grade: 'F', revision: 1 }));
    expect(mocks.writes.mock.calls[0][1]).not.toHaveProperty('caScore');
  });
  it('increments revisions on reimport instead of creating duplicate assessment records', async () => {
    const id = assessmentDocumentId('school', 'Year 12', 'Maths', '2026/2027', 'grade-1', 'student');
    mocks.existing.set(`assessment_grades/${id}`, { revision: 5 });
    await importGradesFromRows([row], 'school');
    expect(mocks.writes.mock.calls[0][1].revision).toBe(6);
  });
  it('preserves a notes-only draft without inventing a zero score or grade', async () => {
    await importGradesFromRows([{ ...row, grade: '', totalScore: '' }], 'school');
    expect(mocks.writes.mock.calls[0][1]).toMatchObject({ grade: '', teacherNotes: 'Review this topic' });
    expect(mocks.writes.mock.calls[0][1]).not.toHaveProperty('totalScore');
  });
  it('keeps existing CSVs without assessment fields as final-grade imports', async () => {
    await importGradesFromRows([{ ...row, assessmentId: undefined }], 'school');
    expect(mocks.added).toHaveBeenCalledWith('grades', expect.objectContaining({ grade: 'F', totalScore: 0 }));
    expect(mocks.writes).not.toHaveBeenCalled();
  });
});
