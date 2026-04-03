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

// ─── Generic CRUD Helpers ─────────────────────────────────────────────────────

export async function addDocument<T extends DocumentData>(
  collectionName: string,
  data: T
): Promise<string> {
  const ref = await addDoc(collection(db, collectionName), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateDocument(
  collectionName: string,
  docId: string,
  data: Partial<DocumentData>
): Promise<void> {
  const ref = doc(db, collectionName, docId);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

export async function deleteDocument(
  collectionName: string,
  docId: string
): Promise<void> {
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

export async function getCollectionOnce<T>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<(T & { id: string })[]> {
  const q = query(collection(db, collectionName), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as T & { id: string }));
}

export { where, orderBy, limit, writeBatch, serverTimestamp };

/** Generate next student ID like AVN-2026-001 */
export async function generateStudentId(): Promise<string> {
  const year = new Date().getFullYear();
  const snap = await getDocs(collection(db, 'students'));
  const count = snap.size + 1;
  return `AVN-${year}-${String(count).padStart(3, '0')}`;
}

/** Bulk upsert attendance records for a whole class */
export async function batchUpsertAttendance(
  records: { studentId: string; date: string; status: 'present' | 'absent' | 'late'; class: string; recordedBy: string }[]
): Promise<void> {
  const batch = writeBatch(db);
  for (const record of records) {
    const q = query(
      collection(db, 'attendance'),
      where('studentId', '==', record.studentId),
      where('date', '==', record.date)
    );
    const existing = await getDocs(q);
    if (!existing.empty) {
      existing.docs.forEach(d => batch.update(d.ref, { status: record.status, updatedAt: serverTimestamp() }));
    } else {
      const newRef = doc(collection(db, 'attendance'));
      batch.set(newRef, { ...record, createdAt: serverTimestamp() });
    }
  }
  await batch.commit();
}

/** Get students in a class */
export async function getStudentsByClass(className: string) {
  return getCollectionOnce<any>('students', [
    where('currentClass', '==', className),
    orderBy('studentName', 'asc'),
  ]);
}

/** Get attendance summary for a student */
export async function getAttendanceSummary(studentId: string) {
  const records = await getCollectionOnce<any>('attendance', [where('studentId', '==', studentId)]);
  const total = records.length;
  const present = records.filter((r: any) => r.status === 'present').length;
  const absent = records.filter((r: any) => r.status === 'absent').length;
  const late = records.filter((r: any) => r.status === 'late').length;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;
  return { total, present, absent, late, rate };
}

/** Calculate Nigerian payroll deductions */
export function computePayroll(basicSalary: number, allowances: number) {
  const grossPay = basicSalary + allowances;
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
