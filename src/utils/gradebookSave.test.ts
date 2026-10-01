import { describe, expect, it } from 'vitest';
import type { Grade, Student } from '../types';
import { gradePayload, gradeUpdatePayload, gradesToSave, subjectGradeStudents } from './gradebookSave';

const grade = (studentId: string, value: string): Grade => ({
  studentId, subject: 'Spanish', class: 'Year 11', term: '1st Term',
  session: '2026/2027', grade: value, caScore: undefined,
  examScore: undefined, totalScore: undefined, updatedAt: null,
});
const students = [{ id: 'julian' }, { id: 'ethem' }, { id: 'ungraded' }] as Student[];

describe('gradebook saves', () => {
  it('filters elective enrolment and excludes a previously selected class', () => {
    const roster = [
      { id: 'julian', currentClass: 'Year 11' },
      { id: 'ethem', currentClass: 'Year 11' },
      { id: 'other', currentClass: 'Year 11' },
      { id: 'old-class', currentClass: 'Year 10' },
    ] as Student[];
    expect(subjectGradeStudents(roster, 'Year 11', ['julian', 'ethem', 'old-class']).map(s => s.id))
      .toEqual(['julian', 'ethem']);
    expect(subjectGradeStudents(roster, 'Year 11', null)).toHaveLength(3);
    expect(subjectGradeStudents(roster, 'Year 11', [])).toHaveLength(3);
  });
  it('saves the two entered grades while excluding blanks and students outside the subject roster', () => {
    const records = gradesToSave(students, {
      julian: grade('julian', '8'), ethem: grade('ethem', '6'),
      ungraded: grade('ungraded', ''), other: grade('other', '9'),
    });
    expect(records.map(g => g.studentId)).toEqual(['julian', 'ethem']);
    for (const record of records) {
      const payload = gradePayload(record, 'single_grade', 'year11', 'kis');
      expect(Object.values(payload)).not.toContain(undefined);
      expect(payload).not.toHaveProperty('caScore');
      expect(payload).not.toHaveProperty('examScore');
      expect(payload).not.toHaveProperty('totalScore');
    }
  });

  it('returns no writes for an entirely ungraded roster', () => {
    expect(gradesToSave(students, { julian: grade('julian', '') })).toEqual([]);
  });

  it('preserves the existing document ID for the caller to update, but excludes it from stored fields', () => {
    const existing = { ...grade('julian', '8'), id: 'existing-doc' };
    expect(gradesToSave(students, { julian: existing })[0].id).toBe('existing-doc');
    expect(gradePayload(existing, 'single_grade', 'year11', 'kis')).not.toHaveProperty('id');
  });

  it('retains legitimate zero scores in CA/exam mode', () => {
    const record = { ...grade('julian', 'F9'), caScore: 0, examScore: 0, totalScore: 0 };
    expect(gradePayload(record, 'ca_exam', 'year11', 'kis')).toMatchObject({ caScore: 0, examScore: 0, totalScore: 0 });
  });

  it('retains the percentage total while removing unused CA/exam fields', () => {
    const record = { ...grade('julian', 'A'), caScore: 20, examScore: 60, totalScore: 80 };
    const payload = gradePayload(record, 'score_percentage', 'year11', 'kis');
    expect(payload.totalScore).toBe(80);
    expect(payload).not.toHaveProperty('caScore');
    expect(payload).not.toHaveProperty('examScore');
  });

  it('deletes obsolete numeric fields on existing single-grade records', () => {
    const payload = gradeUpdatePayload(grade('julian', '8'), 'single_grade', 'year11', 'kis');
    for (const field of ['caScore', 'examScore', 'totalScore', 'subjectPosition']) {
      expect(payload[field]).toBeDefined();
      expect(typeof payload[field]).toBe('object');
    }
  });
});
