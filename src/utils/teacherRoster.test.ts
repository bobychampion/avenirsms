import { describe, expect, it } from 'vitest';
import type { ClassSubject, Student } from '../types';
import { permittedSubjects, resolveGradeSubject, teachingStudents, visibleSkills } from './teacherRoster';

const students = [
  { id: 'lena', currentClass: 'Year 12' }, { id: 'justin', currentClass: 'Year 12' },
  { id: 'matija', currentClass: 'Year 12' }, { id: 'itzel', currentClass: 'Year 11' },
  { id: 'withdrawn', currentClass: 'Year 12', admissionStatus: 'withdrawn' },
] as Student[];
const assignments = [
  { classId: 'y12', subjectName: 'History', enrolledStudentIds: ['lena', 'justin', 'withdrawn'] },
  { classId: 'y12', subjectName: 'Mathematics', enrolledStudentIds: ['justin', 'matija'] },
] as ClassSubject[];
const ids = (s: Student[]) => s.map(s => s.id);

describe('teacher subject rosters', () => {
  it('replaces the Mathematics default for a History-only teacher before querying', () => {
    expect(resolveGradeSubject('Mathematics', ['History'])).toBe('History');
    expect(ids(teachingStudents(students, 'Year 12', ['History'], assignments))).toEqual(['lena', 'justin']);
  });
  it('resolves a valid subject on a class change and preserves valid explicit choices', () => {
    expect(resolveGradeSubject('History', ['Biology', 'Physics'])).toBe('Biology');
    expect(resolveGradeSubject('Physics', ['Biology', 'Physics'])).toBe('Physics');
  });
  it('blocks unassigned and still-loading grade contexts', () => {
    expect(resolveGradeSubject('Mathematics', [], false)).toBe('');
    expect(resolveGradeSubject('Mathematics', ['History'], true)).toBe('');
    expect(permittedSubjects([], ['Mathematics'])).toEqual([]);
    expect(teachingStudents(students, 'Year 12', [], assignments)).toEqual([]);
  });
  it('unions overlapping subject enrolments without changing the class register', () => {
    expect(ids(teachingStudents(students, 'Year 12', ['History', 'Mathematics'], assignments))).toEqual(['lena', 'justin', 'matija']);
    expect(students).toHaveLength(5);
  });
  it('preserves form tutor access to active students of the selected class', () => {
    expect(ids(teachingStudents(students, 'Year 12', ['__all__'], []))).toEqual(['lena', 'justin', 'matija']);
    expect(permittedSubjects(['__all__'], ['History', 'Mathematics'])).toEqual(['History', 'Mathematics']);
  });
  it('adds only covered subject students to the behaviour roster', () => {
    expect(ids(teachingStudents(students, 'Year 12', ['Mathematics'], assignments))).toEqual(['justin', 'matija']);
    expect(ids(teachingStudents(students, 'Year 12', ['History', 'Mathematics'], assignments))).toEqual(['lena', 'justin', 'matija']);
  });
  it('keeps legacy whole-class enrolment but denies missing/inactive assignments', () => {
    expect(teachingStudents(students, 'Year 12', ['History'], [])).toEqual([]);
    expect(teachingStudents(students, 'Year 12', ['History'], [{ ...assignments[0], status: 'inactive' }])).toEqual([]);
    expect(teachingStudents(students, 'Year 12', ['History'], [{ ...assignments[0], enrolledStudentIds: [] }])).toHaveLength(3);
  });
  it('excludes hidden skills from saves after enrolment changes', () => {
    const skills = { lena: { honesty: 'G' }, matija: { honesty: 'E' } };
    expect(visibleSkills(teachingStudents(students, 'Year 12', ['History'], assignments), skills)).toEqual([['lena', skills.lena]]);
    expect(ids(teachingStudents(students, 'Year 12', ['History'], [{ ...assignments[0], enrolledStudentIds: ['justin'] }]))).toEqual(['justin']);
  });
});
