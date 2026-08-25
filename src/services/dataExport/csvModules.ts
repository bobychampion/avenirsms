/**
 * Per-module CSV schemas, parse helpers, and export utilities.
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  collection, query, where, getDocs, addDoc, serverTimestamp, writeBatch, doc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Student, Staff, Grade, Attendance, SubjectAttendance, SpecialLessonAttendance, calculateGrade, GradingMode, GradingSystem, CustomGradeScale } from '../../types';
import { generateStudentId } from '../firestoreService';

// ─── Generic helpers ─────────────────────────────────────────────────────────

export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const csv = [headers.join(','), ...rows.map(r => r.map(escapeCsvCell).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function parseCsvFile<T extends Record<string, string>>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data),
      error: (err) => reject(err),
    });
  });
}

export async function parseSpreadsheetFile<T extends Record<string, string>>(file: File): Promise<T[]> {
  if (file.name.endsWith('.csv') || file.type === 'text/csv') {
    return parseCsvFile<T>(file);
  }
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<T>(sheet, { defval: '' });
}

// ─── Students ────────────────────────────────────────────────────────────────

export const STUDENT_CSV_HEADERS = [
  'studentId', 'studentName', 'email', 'phone', 'dob', 'gender', 'currentClass',
  'guardianName', 'guardianPhone', 'guardianEmail', 'homeAddress', 'otherNationality',
  'bloodGroup',
] as const;

export type StudentCsvRow = Record<(typeof STUDENT_CSV_HEADERS)[number], string>;

// studentId is optional — leave blank to auto-generate using the school's configured format.
export const STUDENT_TEMPLATE_SAMPLE: string[] = [
  '', 'Adaeze Okonkwo', 'adaeze@email.com', '08012345678', '2010-05-15', 'female', 'JSS 1',
  'Mrs Okonkwo', '08012345679', 'parent@email.com', '5 Main Street Lagos', '',
  'O+',
];

export function validateStudentRow(row: StudentCsvRow, idx: number): string | null {
  if (!row.studentName?.trim()) return `Row ${idx}: Student name is required`;
  if (!row.currentClass?.trim()) return `Row ${idx}: Class is required`;
  if (!row.gender?.trim()) return `Row ${idx}: Gender is required`;
  if (!['male', 'female', 'other'].includes(row.gender.trim().toLowerCase())) {
    return `Row ${idx}: Gender must be male, female, or other`;
  }
  return null;
}

export function studentToCsvRow(s: Student): string[] {
  return [
    s.studentId ?? '', s.studentName ?? '', s.email ?? '', s.phone ?? '', s.dob ?? '', s.gender ?? '',
    s.currentClass ?? '', s.guardianName ?? '', s.guardianPhone ?? '', s.guardianEmail ?? '',
    s.homeAddress ?? '', s.otherNationality ?? '', s.bloodGroup ?? '',
  ];
}

export function downloadStudentTemplate(): void {
  downloadCsv('student_import_template.csv', [...STUDENT_CSV_HEADERS], [STUDENT_TEMPLATE_SAMPLE]);
}

export function exportStudentsCsv(students: Student[]): void {
  downloadCsv(
    `students_export_${new Date().toISOString().slice(0, 10)}.csv`,
    [...STUDENT_CSV_HEADERS],
    students.map(studentToCsvRow)
  );
}

export interface StudentImportResult {
  row: number;
  name: string;
  status: 'success' | 'error' | 'duplicate';
  message?: string;
  studentId?: string;
}

export async function importStudentsFromRows(
  rows: StudentCsvRow[],
  schoolId: string,
  options?: { checkStudentId?: boolean; autoCreateClasses?: boolean }
): Promise<StudentImportResult[]> {
  const results: StudentImportResult[] = [];
  const existingSnap = await getDocs(
    query(collection(db, 'students'), where('schoolId', '==', schoolId))
  );
  const existingEmails = new Set(
    existingSnap.docs.map(d => (d.data().email ?? '').toLowerCase().trim()).filter(Boolean)
  );
  const existingNames = new Set(
    existingSnap.docs.map(d => (d.data().studentName ?? '').toLowerCase().trim()).filter(Boolean)
  );
  const existingStudentIds = new Set(
    existingSnap.docs.map(d => (d.data().studentId ?? '').trim()).filter(Boolean)
  );

  if (options?.autoCreateClasses) {
    const classSnap = await getDocs(
      query(collection(db, 'classes'), where('schoolId', '==', schoolId))
    );
    const existingClasses = new Set(classSnap.docs.map(d => d.data().name as string));
    const batch = writeBatch(db);
    let batchCount = 0;
    for (const row of rows) {
      const cls = row.currentClass?.trim();
      if (cls && !existingClasses.has(cls)) {
        const ref = doc(collection(db, 'classes'));
        batch.set(ref, { name: cls, level: cls, academicSession: '', schoolId });
        existingClasses.add(cls);
        batchCount++;
      }
    }
    if (batchCount > 0) await batch.commit();
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const err = validateStudentRow(row, i + 2);
    if (err) {
      results.push({ row: i + 2, name: row.studentName || '', status: 'error', message: err });
      continue;
    }
    const emailKey = row.email?.trim().toLowerCase() ?? '';
    const nameKey = row.studentName.trim().toLowerCase();
    if (emailKey && existingEmails.has(emailKey)) {
      results.push({ row: i + 2, name: row.studentName, status: 'duplicate', message: 'Email already exists' });
      continue;
    }
    if (options?.checkStudentId !== false && existingNames.has(nameKey)) {
      results.push({ row: i + 2, name: row.studentName, status: 'duplicate', message: 'Student name already exists' });
      continue;
    }
    try {
      const providedId = row.studentId?.trim();
      let newId: string;
      if (providedId) {
        if (existingStudentIds.has(providedId)) {
          results.push({ row: i + 2, name: row.studentName, status: 'duplicate', message: `Student ID "${providedId}" already exists` });
          continue;
        }
        newId = providedId;
      } else {
        newId = await generateStudentId(schoolId);
        if (existingStudentIds.has(newId)) {
          results.push({ row: i + 2, name: row.studentName, status: 'duplicate', message: 'Student ID collision' });
          continue;
        }
      }
      const student: Omit<Student, 'id'> = {
        studentName: row.studentName.trim(),
        email: row.email?.trim() || '',
        phone: row.phone?.trim() || '',
        dob: row.dob?.trim() || '',
        gender: row.gender.trim().toLowerCase() as Student['gender'],
        nin: '',
        currentClass: row.currentClass.trim(),
        studentId: newId,
        enrolledAt: serverTimestamp(),
        applicationId: 'bulk_import',
        admissionStatus: 'active',
        guardianName: row.guardianName?.trim() || '',
        guardianPhone: row.guardianPhone?.trim() || '',
        guardianEmail: row.guardianEmail?.trim() || '',
        homeAddress: row.homeAddress?.trim() || '',
        otherNationality: row.otherNationality?.trim() || '',
        bloodGroup: row.bloodGroup?.trim() || '',
        schoolId,
      };
      await addDoc(collection(db, 'students'), student);
      if (emailKey) existingEmails.add(emailKey);
      existingNames.add(nameKey);
      existingStudentIds.add(newId);
      results.push({ row: i + 2, name: row.studentName, status: 'success', studentId: newId });
    } catch (e) {
      results.push({
        row: i + 2, name: row.studentName, status: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }
  return results;
}

// ─── Staff ───────────────────────────────────────────────────────────────────

export const STAFF_CSV_HEADERS = [
  'staffName', 'email', 'phone', 'role', 'subject',
  'department', 'qualification', 'basicSalary', 'allowances',
  'bankName', 'accountNumber',
] as const;

export type StaffCsvRow = Record<(typeof STAFF_CSV_HEADERS)[number], string>;

export const STAFF_ROLE_MAP: Record<string, Staff['role']> = {
  teacher: 'teacher', tutor: 'teacher', lecturer: 'teacher', instructor: 'teacher',
  admin: 'admin_staff', administrator: 'admin_staff', admin_staff: 'admin_staff',
  secretary: 'admin_staff', clerk: 'admin_staff', accountant: 'admin_staff',
  bursar: 'admin_staff', librarian: 'admin_staff', 'it officer': 'admin_staff',
  support: 'support', cleaner: 'support', security: 'support', driver: 'support',
  janitor: 'support', cook: 'support', 'kitchen staff': 'support',
};

export function resolveStaffRole(raw?: string): Staff['role'] {
  if (!raw) return 'teacher';
  return STAFF_ROLE_MAP[raw.trim().toLowerCase()] ?? 'teacher';
}

export function staffToCsvRow(s: Staff): string[] {
  return [
    s.staffName ?? '', s.email ?? '', s.phone ?? '', s.role ?? '',
    s.subject ?? '', s.department ?? '', s.qualification ?? '',
    String(s.basicSalary ?? 0), String(s.allowances ?? 0),
    s.bankName ?? '', s.accountNumber ?? '',
  ];
}

export function downloadStaffTemplate(): void {
  downloadCsv('staff_import_template.csv', [...STAFF_CSV_HEADERS], [
    ['Amara Okafor', 'amara@school.com', '08012345678', 'teacher', 'Mathematics', 'Sciences', 'B.Sc', '80000', '5000', 'GTBank', '0123456789'],
  ]);
}

export function exportStaffCsv(staff: Staff[]): void {
  downloadCsv(
    `staff_export_${new Date().toISOString().slice(0, 10)}.csv`,
    [...STAFF_CSV_HEADERS],
    staff.map(staffToCsvRow)
  );
}

// ─── Grades ──────────────────────────────────────────────────────────────────

export const GRADE_CSV_HEADERS = [
  'studentId', 'studentName', 'class', 'subject', 'term', 'session',
  'caScore', 'examScore', 'totalScore', 'grade', 'teacherNotes',
  'classId', 'gradingMode',
] as const;

export type GradeCsvRow = Record<(typeof GRADE_CSV_HEADERS)[number], string>;

export function gradeToCsvRow(g: Grade & { studentName?: string }): string[] {
  return [
    g.studentId ?? '', g.studentName ?? '', g.class ?? '', g.subject ?? '',
    g.term ?? '', g.session ?? '',
    // Empty (not '0') when genuinely absent — e.g. single_grade mode has no CA/Exam/Total.
    g.caScore != null ? String(g.caScore) : '', g.examScore != null ? String(g.examScore) : '',
    g.totalScore != null ? String(g.totalScore) : '', g.grade ?? '', g.teacherNotes ?? '',
    g.classId ?? '', g.gradingMode ?? 'ca_exam',
  ];
}

export function downloadGradeTemplate(): void {
  downloadCsv('grade_import_template.csv', [...GRADE_CSV_HEADERS], [
    ['STU-2026-001', 'Adaeze Okonkwo', 'JSS 1', 'Mathematics', '1st Term', '2025/2026', '32', '48', '80', 'A1', 'Excellent work', '', 'ca_exam'],
  ]);
}

export function exportGradesCsv(grades: (Grade & { studentName?: string })[]): void {
  downloadCsv(
    `grades_export_${new Date().toISOString().slice(0, 10)}.csv`,
    [...GRADE_CSV_HEADERS],
    grades.map(gradeToCsvRow)
  );
}

export interface GradeImportResult {
  row: number;
  studentId: string;
  status: 'success' | 'error' | 'skipped';
  message?: string;
}

export async function importGradesFromRows(
  rows: GradeCsvRow[],
  schoolId: string,
  /** Resolves the grading config for a class name + session. Optional so this stays decoupled
   *  from React context; when omitted, every row imports exactly as before (ca_exam-shaped). */
  resolveGrading?: (className: string, session: string) => { gradingMode: GradingMode; allowedGrades?: string[]; gradingSystem: GradingSystem; customGradingScale?: CustomGradeScale[] },
  /** Class name → Firestore doc id, for stamping `classId` (needed for single_grade Rules validation). */
  classesByName?: Record<string, string>
): Promise<GradeImportResult[]> {
  const results: GradeImportResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.studentId?.trim() || !row.subject?.trim()) {
      results.push({ row: i + 2, studentId: row.studentId || '', status: 'error', message: 'studentId and subject required' });
      continue;
    }
    const className = row.class?.trim() || '';
    const session = row.session?.trim() || '';
    const grading = resolveGrading?.(className, session);
    const classId = row.classId?.trim() || classesByName?.[className];

    let payload: Record<string, unknown>;
    if (grading?.gradingMode === 'single_grade') {
      const grade = row.grade?.trim() || '';
      if (!grade || !(grading.allowedGrades ?? []).includes(grade)) {
        results.push({ row: i + 2, studentId: row.studentId, status: 'error', message: `grade "${grade}" not in the allowed list for ${className || 'this class'}` });
        continue;
      }
      if (!classId) {
        results.push({ row: i + 2, studentId: row.studentId, status: 'error', message: `class "${className}" not found — required for single_grade mode` });
        continue;
      }
      payload = { grade, classId, gradingMode: 'single_grade' as GradingMode };
    } else {
      const caScore = Math.min(parseFloat(row.caScore) || 0, 40);
      const examScore = Math.min(parseFloat(row.examScore) || 0, 60);
      const totalScore = caScore + examScore;
      const grade = row.grade?.trim() || (grading ? calculateGrade(totalScore, grading.gradingSystem, grading.customGradingScale) : calculateGrade(totalScore));
      payload = { caScore, examScore, totalScore, grade, classId: classId ?? null, gradingMode: (grading?.gradingMode ?? 'ca_exam') as GradingMode };
    }

    try {
      await addDoc(collection(db, 'grades'), {
        studentId: row.studentId.trim(),
        subject: row.subject.trim(),
        class: className,
        term: row.term?.trim() || '1st Term',
        session,
        ...payload,
        teacherNotes: row.teacherNotes?.trim() || (row as { teacherComment?: string }).teacherComment?.trim() || '',
        schoolId,
        updatedAt: serverTimestamp(),
      });
      results.push({ row: i + 2, studentId: row.studentId, status: 'success' });
    } catch (e) {
      results.push({
        row: i + 2, studentId: row.studentId, status: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }
  return results;
}

// ─── Attendance ──────────────────────────────────────────────────────────────

export const ATTENDANCE_CSV_HEADERS = [
  'studentId', 'studentName', 'class', 'date', 'status',
] as const;

export type AttendanceCsvRow = Record<(typeof ATTENDANCE_CSV_HEADERS)[number], string>;

export function attendanceToCsvRow(a: Attendance & { studentName?: string }): string[] {
  return [
    a.studentId ?? '', a.studentName ?? '', a.class ?? '', a.date ?? '', a.status ?? '',
  ];
}

export function downloadAttendanceTemplate(): void {
  downloadCsv('attendance_import_template.csv', [...ATTENDANCE_CSV_HEADERS], [
    ['STU-2026-001', 'Adaeze Okonkwo', 'JSS 1', '2026-01-15', 'present'],
  ]);
}

export function exportAttendanceCsv(records: (Attendance & { studentName?: string })[]): void {
  downloadCsv(
    `attendance_export_${new Date().toISOString().slice(0, 10)}.csv`,
    [...ATTENDANCE_CSV_HEADERS],
    records.map(attendanceToCsvRow)
  );
}

const SUBJECT_ATTENDANCE_CSV_HEADERS = [
  'studentId', 'studentName', 'className', 'subjectName', 'attendanceDate', 'status', 'inheritedFromDaily', 'recordedBy',
] as const;

export function exportSubjectAttendanceCsv(records: (SubjectAttendance & { studentName?: string })[]): void {
  downloadCsv(
    `subject_attendance_export_${new Date().toISOString().slice(0, 10)}.csv`,
    [...SUBJECT_ATTENDANCE_CSV_HEADERS],
    records.map(r => [
      r.studentId, r.studentName || '', r.className, r.subjectName, r.attendanceDate,
      r.status, String(r.inheritedFromDaily), r.recordedBy,
    ])
  );
}

const SPECIAL_LESSON_ATTENDANCE_CSV_HEADERS = [
  'studentId', 'studentName', 'lessonName', 'attendanceDate', 'status', 'recordedBy',
] as const;

export function exportSpecialLessonAttendanceCsv(records: (SpecialLessonAttendance & { studentName?: string; lessonName?: string })[]): void {
  downloadCsv(
    `special_lesson_attendance_export_${new Date().toISOString().slice(0, 10)}.csv`,
    [...SPECIAL_LESSON_ATTENDANCE_CSV_HEADERS],
    records.map(r => [
      r.studentId, r.studentName || '', r.lessonName || '', r.attendanceDate, r.status, r.recordedBy,
    ])
  );
}

export interface AttendanceImportResult {
  row: number;
  studentId: string;
  status: 'success' | 'error';
  message?: string;
}

export async function importAttendanceFromRows(
  rows: AttendanceCsvRow[],
  schoolId: string,
  recordedBy: string
): Promise<AttendanceImportResult[]> {
  const results: AttendanceImportResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.studentId?.trim() || !row.date?.trim()) {
      results.push({ row: i + 2, studentId: row.studentId || '', status: 'error', message: 'studentId and date required' });
      continue;
    }
    const status = (row.status?.trim().toLowerCase() || 'present') as Attendance['status'];
    if (!['present', 'absent', 'late'].includes(status)) {
      results.push({ row: i + 2, studentId: row.studentId, status: 'error', message: 'status must be present, absent, or late' });
      continue;
    }
    try {
      await addDoc(collection(db, 'attendance'), {
        studentId: row.studentId.trim(),
        date: row.date.trim(),
        status,
        class: row.class?.trim() || '',
        recordedBy,
        schoolId,
        createdAt: serverTimestamp(),
      });
      results.push({ row: i + 2, studentId: row.studentId, status: 'success' });
    } catch (e) {
      results.push({
        row: i + 2, studentId: row.studentId, status: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }
  return results;
}
