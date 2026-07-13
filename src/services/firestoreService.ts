import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  QueryConstraint,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { assertNotImpersonating } from '../utils/impersonationGuard';

// ─── Generic CRUD Helpers ─────────────────────────────────────────────────────

/**
 * Add a document to a collection.
 * If schoolId is provided it is merged into the data so every record is
 * automatically scoped to the correct school (multi-tenant safety net).
 */
export async function addDocument<T extends DocumentData>(
  collectionName: string,
  data: T,
  schoolId?: string | null
): Promise<string> {
  assertNotImpersonating();
  const payload: DocumentData = { ...data, createdAt: serverTimestamp() };
  if (schoolId) payload.schoolId = schoolId;
  const ref = await addDoc(collection(db, collectionName), payload);
  return ref.id;
}

export async function updateDocument(
  collectionName: string,
  docId: string,
  data: Partial<DocumentData>
): Promise<void> {
  assertNotImpersonating();
  const ref = doc(db, collectionName, docId);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

export async function deleteDocument(
  collectionName: string,
  docId: string
): Promise<void> {
  assertNotImpersonating();
  const ref = doc(db, collectionName, docId);
  await deleteDoc(ref);
}

export async function getDocument<T>(
  collectionName: string,
  docId: string
): Promise<(T & { id: string }) | null> {
  const ref = doc(db, collectionName, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as T & { id: string };
}

/**
 * Fetch all documents from a collection (one-shot).
 * Pass schoolId to automatically prepend a schoolId equality constraint.
 */
export async function getCollectionOnce<T>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  schoolId?: string | null
): Promise<(T & { id: string })[]> {
  const allConstraints: QueryConstraint[] = schoolId
    ? [where('schoolId', '==', schoolId), ...constraints]
    : constraints;
  const q = query(collection(db, collectionName), ...allConstraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as T & { id: string }));
}

export { where, orderBy, limit, writeBatch, serverTimestamp };

/**
 * Generate next student ID using the school's configured format.
 * Reads prefix/format/padding from school_settings/{schoolId}; falls back to STU-YEAR-SEQ.
 *
 * Formats:
 *   PREFIX-YEAR-SEQ  → KIS-2026-001
 *   PREFIXYEARSEQ    → KIS2026001
 *   PREFIX-SEQ       → KIS-001
 */
export async function generateStudentId(schoolId: string = 'main'): Promise<string> {
  const year = new Date().getFullYear();

  // Fetch school settings for prefix/format/padding
  let prefix = 'STU';
  let format: 'PREFIX-YEAR-SEQ' | 'PREFIXYEARSEQ' | 'PREFIX-SEQ' = 'PREFIX-YEAR-SEQ';
  let padding = 3;
  try {
    const settingsSnap = await getDoc(doc(db, 'school_settings', schoolId));
    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      if (data.studentIdPrefix) prefix = data.studentIdPrefix;
      if (data.studentIdFormat) format = data.studentIdFormat;
      if (data.studentIdPadding) padding = Number(data.studentIdPadding);
    }
  } catch { /* use defaults */ }

  // Count existing students for this school only
  const snap = await getDocs(
    query(collection(db, 'students'), where('schoolId', '==', schoolId))
  );
  const seq = String(snap.size + 1).padStart(padding, '0');

  switch (format) {
    case 'PREFIXYEARSEQ': return `${prefix}${year}${seq}`;
    case 'PREFIX-SEQ':    return `${prefix}-${seq}`;
    default:              return `${prefix}-${year}-${seq}`;
  }
}

/** Bulk upsert attendance records for a whole class */
export async function batchUpsertAttendance(
  records: { studentId: string; date: string; status: 'present' | 'absent' | 'late'; class: string; recordedBy: string }[],
  schoolId?: string | null
): Promise<void> {
  assertNotImpersonating();
  const batch = writeBatch(db);
  for (const record of records) {
    const constraints: QueryConstraint[] = [
      where('studentId', '==', record.studentId),
      where('date', '==', record.date),
    ];
    if (schoolId) constraints.push(where('schoolId', '==', schoolId));
    const q = query(collection(db, 'attendance'), ...constraints);
    const existing = await getDocs(q);
    if (!existing.empty) {
      existing.docs.forEach(d => batch.update(d.ref, { status: record.status, updatedAt: serverTimestamp() }));
    } else {
      const newRef = doc(collection(db, 'attendance'));
      batch.set(newRef, {
        ...record,
        ...(schoolId ? { schoolId } : {}),
        createdAt: serverTimestamp(),
      });
    }
  }
  await batch.commit();
}

/**
 * Fetch daily attendance for a class+date as a studentId -> status map.
 * Used to preload/inherit Subject Attendance defaults from the official daily record.
 */
export async function fetchDailyAttendanceMap(
  className: string,
  date: string,
  schoolId?: string | null
): Promise<Record<string, 'present' | 'absent' | 'late'>> {
  const constraints: QueryConstraint[] = [
    where('class', '==', className),
    where('date', '==', date),
  ];
  if (schoolId) constraints.push(where('schoolId', '==', schoolId));
  const snap = await getDocs(query(collection(db, 'attendance'), ...constraints));
  const map: Record<string, 'present' | 'absent' | 'late'> = {};
  snap.docs.forEach(d => {
    const data = d.data();
    map[data.studentId] = data.status;
  });
  return map;
}

/**
 * Bulk upsert Subject Attendance records (one doc per student per class+subject+date).
 * Independent of `attendance` — never touches the daily record. Matches the upsert
 * pattern used by batchUpsertAttendance for consistency.
 */
export async function batchUpsertSubjectAttendance(
  records: {
    studentId: string;
    classId: string;
    className: string;
    subjectName: string;
    teacherId: string;
    timetablePeriodId?: string;
    academicSession: string;
    term: string;
    attendanceDate: string;
    status: 'present' | 'absent' | 'late';
    inheritedFromDaily: boolean;
    recordedBy: string;
  }[],
  schoolId?: string | null
): Promise<void> {
  assertNotImpersonating();
  const batch = writeBatch(db);
  for (const record of records) {
    const constraints: QueryConstraint[] = [
      where('studentId', '==', record.studentId),
      where('attendanceDate', '==', record.attendanceDate),
      where('classId', '==', record.classId),
      where('subjectName', '==', record.subjectName),
    ];
    // When the record is tied to a specific timetable period, match on it too — otherwise a
    // subject taught twice in one day to the same class (e.g. a double period) would collide
    // into a single doc. Omitted when the caller doesn't know the period, for backward
    // compatibility with the plain class+subject+date matching used before timetable integration.
    if (record.timetablePeriodId) constraints.push(where('timetablePeriodId', '==', record.timetablePeriodId));
    if (schoolId) constraints.push(where('schoolId', '==', schoolId));
    const q = query(collection(db, 'subjectAttendance'), ...constraints);
    const existing = await getDocs(q);
    if (!existing.empty) {
      existing.docs.forEach(d => batch.update(d.ref, {
        status: record.status,
        inheritedFromDaily: record.inheritedFromDaily,
        recordedBy: record.recordedBy,
        recordedAt: serverTimestamp(),
      }));
    } else {
      const newRef = doc(collection(db, 'subjectAttendance'));
      batch.set(newRef, {
        ...record,
        ...(schoolId ? { schoolId } : {}),
        recordedAt: serverTimestamp(),
      });
    }
  }
  await batch.commit();
}

/**
 * Bulk upsert Special Lesson attendance (one doc per student per lesson per date).
 * Fully independent of `attendance`/`subjectAttendance` — same upsert pattern for consistency.
 */
export async function batchUpsertSpecialLessonAttendance(
  records: {
    specialLessonId: string;
    studentId: string;
    attendanceDate: string;
    status: 'present' | 'absent' | 'late';
    recordedBy: string;
  }[],
  schoolId?: string | null
): Promise<void> {
  assertNotImpersonating();
  const batch = writeBatch(db);
  for (const record of records) {
    const constraints: QueryConstraint[] = [
      where('specialLessonId', '==', record.specialLessonId),
      where('studentId', '==', record.studentId),
      where('attendanceDate', '==', record.attendanceDate),
    ];
    if (schoolId) constraints.push(where('schoolId', '==', schoolId));
    const q = query(collection(db, 'specialLessonAttendance'), ...constraints);
    const existing = await getDocs(q);
    if (!existing.empty) {
      existing.docs.forEach(d => batch.update(d.ref, {
        status: record.status,
        recordedBy: record.recordedBy,
        recordedAt: serverTimestamp(),
      }));
    } else {
      const newRef = doc(collection(db, 'specialLessonAttendance'));
      batch.set(newRef, {
        ...record,
        ...(schoolId ? { schoolId } : {}),
        recordedAt: serverTimestamp(),
      });
    }
  }
  await batch.commit();
}

/** Get students in a class, optionally scoped to a school */
export async function getStudentsByClass(className: string, schoolId?: string | null) {
  const constraints: QueryConstraint[] = [
    where('currentClass', '==', className),
    orderBy('studentName', 'asc'),
  ];
  return getCollectionOnce<any>('students', constraints, schoolId);
}

/** Get attendance summary for a student, optionally scoped to a school */
export async function getAttendanceSummary(studentId: string, schoolId?: string | null) {
  const records = await getCollectionOnce<any>(
    'attendance',
    [where('studentId', '==', studentId)],
    schoolId
  );
  const total = records.length;
  const present = records.filter((r: any) => r.status === 'present').length;
  const absent = records.filter((r: any) => r.status === 'absent').length;
  const late = records.filter((r: any) => r.status === 'late').length;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;
  return { total, present, absent, late, rate };
}

/**
 * Calculate payroll deductions.
 *
 * @param basicSalary   - Basic monthly salary
 * @param allowances    - Monthly allowances
 * @param taxModel      - 'nigeria_paye' | 'flat_rate' | 'none'  (default: 'nigeria_paye')
 * @param taxFlatRate   - Flat rate percentage (0–100), used when taxModel === 'flat_rate'
 */
export function computePayroll(
  basicSalary: number,
  allowances: number,
  taxModel: 'nigeria_paye' | 'flat_rate' | 'none' = 'nigeria_paye',
  taxFlatRate = 0
) {
  const grossPay = basicSalary + allowances;

  if (taxModel === 'none') {
    return { grossPay, pension: 0, paye: 0, netPay: grossPay };
  }

  if (taxModel === 'flat_rate') {
    const paye = Math.round(grossPay * Math.min(Math.max(taxFlatRate, 0), 100) / 100);
    return { grossPay, pension: 0, paye, netPay: grossPay - paye };
  }

  // Default: Nigerian PAYE + 8% pension
  const pension = Math.round(basicSalary * 0.08);
  const annualGross = grossPay * 12;
  const personalRelief = 200000 + 0.01 * annualGross;
  const taxableIncome = Math.max(0, annualGross - personalRelief);
  let tax = 0;
  const brackets = [
    { limit: 300000, rate: 0.07 },
    { limit: 300000, rate: 0.11 },
    { limit: 500000, rate: 0.15 },
    { limit: 500000, rate: 0.19 },
    { limit: 1600000, rate: 0.21 },
    { limit: Infinity, rate: 0.24 },
  ];
  let remaining = taxableIncome;
  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, bracket.limit);
    tax += taxable * bracket.rate;
    remaining -= taxable;
  }
  const paye = Math.round(tax / 12);
  const netPay = grossPay - pension - paye;
  return { grossPay, pension, paye, netPay };
}
