import { describe, expect, it } from 'vitest';
import type { ClassSubject, Student } from '../types';
import { additionalAttendanceIds, mergeAttendanceStudents } from './subjectAttendanceRoster';
import { teachingStudents } from './teacherRoster';
import { subjectGradeStudents } from './gradebookSave';

const students = [
  { id: 'year11', studentName: 'Anna', currentClass: 'Year 11' },
  { id: 'repeat', studentName: 'Ben', currentClass: 'Year 12' },
  { id: 'other', studentName: 'Chris', currentClass: 'Year 12' },
  { id: 'withdrawn', studentName: 'Dan', currentClass: 'Year 12', admissionStatus: 'withdrawn' },
] as Student[];
const maths = { classId: 'y11', subjectName: 'Maths', enrolledStudentIds: ['year11'], additionalAttendanceStudentIds: ['repeat'] } as ClassSubject;

describe('cross-class subject attendance', () => {
  it('adds the Year 12 retaker to Year 11 Maths while preserving their main class', () => {
    const base = teachingStudents(students, 'Year 11', ['Maths'], [maths]);
    const result = mergeAttendanceStudents(base, students, additionalAttendanceIds([maths], 'Maths'));
    expect(result.map(s => s.id)).toEqual(['year11', 'repeat']);
    expect(result[1].currentClass).toBe('Year 12');
    expect(subjectGradeStudents(students, 'Year 11', null).map(s => s.id)).toEqual(['year11']);
  });
  it('does not add retakers to another subject or an inactive assignment', () => {
    expect(additionalAttendanceIds([maths], 'History')).toEqual([]);
    expect(additionalAttendanceIds([{ ...maths, status: 'inactive' }], 'Maths')).toEqual([]);
  });
  it('supports legacy whole-class enrolment and additional attendance together', () => {
    const wholeClass = { ...maths, enrolledStudentIds: [] };
    const base = teachingStudents(students, 'Year 11', ['Maths'], [wholeClass]);
    expect(mergeAttendanceStudents(base, students, ['repeat']).map(s => s.id)).toEqual(['year11', 'repeat']);
  });
  it('deduplicates additional enrolments and excludes withdrawn and uninvited students', () => {
    expect(additionalAttendanceIds([maths, maths], 'Maths')).toEqual(['repeat']);
    const result = mergeAttendanceStudents([students[0]], students, ['year11', 'repeat', 'withdrawn']);
    expect(result.map(s => s.id)).toEqual(['year11', 'repeat']);
  });
  it('removes an additional student when their enrolment is removed', () => {
    expect(mergeAttendanceStudents([students[0]], students, []).map(s => s.id)).toEqual(['year11']);
  });
});
