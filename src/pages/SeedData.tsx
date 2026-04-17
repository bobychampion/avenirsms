import React, { useState } from 'react';
import { db } from '../firebase';
import {
  collection, addDoc, serverTimestamp, writeBatch, doc, getDocs, query, limit
} from 'firebase/firestore';
import { Database, CheckCircle2, Loader2, AlertTriangle, Trash2, Play } from 'lucide-react';
import { useSchoolId } from '../hooks/useSchoolId';

// ─── Sample Nigerian school data ──────────────────────────────────────────────

const SESSION = '2025/2026';
const TERM = '1st Term';

const CLASSES = [
  { name: 'JSS 1A', level: 'JSS 1', academicSession: SESSION },
  { name: 'JSS 2A', level: 'JSS 2', academicSession: SESSION },
  { name: 'JSS 3A', level: 'JSS 3', academicSession: SESSION },
  { name: 'SSS 1A', level: 'SSS 1', academicSession: SESSION },
  { name: 'SSS 2A', level: 'SSS 2', academicSession: SESSION },
  { name: 'SSS 3A', level: 'SSS 3', academicSession: SESSION },
];

const STUDENTS_RAW = [
  // JSS 1A
  { studentName: 'Adaeze Okonkwo', email: 'adaeze.okonkwo@student.avenirsms.ng', phone: '08031234501', dob: '2013-03-12', gender: 'female', nin: 'NIN20130301', currentClass: 'JSS 1A', studentId: 'AVN/2025/001', bloodGroup: 'O+', guardianName: 'Mrs Ngozi Okonkwo', guardianPhone: '08051234501', guardianRelationship: 'mother', guardianEmail: 'ngozi.okonkwo@gmail.com', stateOfOrigin: 'Anambra', religion: 'Christianity', homeAddress: '14 Aba Road, Onitsha', admissionStatus: 'active' as const },
  { studentName: 'Emeka Nwosu', email: 'emeka.nwosu@student.avenirsms.ng', phone: '08031234502', dob: '2013-07-22', gender: 'male', nin: 'NIN20130702', currentClass: 'JSS 1A', studentId: 'AVN/2025/002', bloodGroup: 'A+', guardianName: 'Mr Chidi Nwosu', guardianPhone: '08051234502', guardianRelationship: 'father', guardianEmail: 'chidi.nwosu@gmail.com', stateOfOrigin: 'Imo', religion: 'Christianity', homeAddress: '7 River Street, Owerri', admissionStatus: 'active' as const },
  { studentName: 'Fatima Abubakar', email: 'fatima.abubakar@student.avenirsms.ng', phone: '08031234503', dob: '2013-01-05', gender: 'female', nin: 'NIN20130105', currentClass: 'JSS 1A', studentId: 'AVN/2025/003', bloodGroup: 'B+', guardianName: 'Alhaji Musa Abubakar', guardianPhone: '08051234503', guardianRelationship: 'father', guardianEmail: 'musa.abubakar@gmail.com', stateOfOrigin: 'Kano', religion: 'Islam', homeAddress: '3 Kofar Wambai, Kano', admissionStatus: 'active' as const },
  { studentName: 'Taiwo Adeleke', email: 'taiwo.adeleke@student.avenirsms.ng', phone: '08031234504', dob: '2013-09-18', gender: 'male', nin: 'NIN20130918', currentClass: 'JSS 1A', studentId: 'AVN/2025/004', bloodGroup: 'AB+', guardianName: 'Mrs Bimpe Adeleke', guardianPhone: '08051234504', guardianRelationship: 'mother', guardianEmail: 'bimpe.adeleke@gmail.com', stateOfOrigin: 'Ogun', religion: 'Christianity', homeAddress: '20 Agodi GRA, Ibadan', admissionStatus: 'active' as const },

  // JSS 2A
  { studentName: 'Chisom Eze', email: 'chisom.eze@student.avenirsms.ng', phone: '08031234505', dob: '2012-04-15', gender: 'female', nin: 'NIN20120415', currentClass: 'JSS 2A', studentId: 'AVN/2025/005', bloodGroup: 'O-', guardianName: 'Mr Ikenna Eze', guardianPhone: '08051234505', guardianRelationship: 'father', guardianEmail: 'ikenna.eze@gmail.com', stateOfOrigin: 'Enugu', religion: 'Christianity', homeAddress: '5 Nike Lake Rd, Enugu', admissionStatus: 'active' as const },
  { studentName: 'Abdullahi Garba', email: 'abdullahi.garba@student.avenirsms.ng', phone: '08031234506', dob: '2012-11-30', gender: 'male', nin: 'NIN20121130', currentClass: 'JSS 2A', studentId: 'AVN/2025/006', bloodGroup: 'B-', guardianName: 'Mallam Garba Usman', guardianPhone: '08051234506', guardianRelationship: 'father', guardianEmail: 'garba.usman@gmail.com', stateOfOrigin: 'Kaduna', religion: 'Islam', homeAddress: '12 Kawo District, Kaduna', admissionStatus: 'active' as const },
  { studentName: 'Oluwaseun Balogun', email: 'seun.balogun@student.avenirsms.ng', phone: '08031234507', dob: '2012-06-08', gender: 'male', nin: 'NIN20120608', currentClass: 'JSS 2A', studentId: 'AVN/2025/007', bloodGroup: 'A-', guardianName: 'Chief Balogun', guardianPhone: '08051234507', guardianRelationship: 'father', guardianEmail: 'chief.balogun@gmail.com', stateOfOrigin: 'Lagos', religion: 'Christianity', homeAddress: '9 Lekki Phase 1, Lagos', admissionStatus: 'active' as const },

  // JSS 3A
  { studentName: 'Amina Mohammed', email: 'amina.mohammed@student.avenirsms.ng', phone: '08031234508', dob: '2011-02-20', gender: 'female', nin: 'NIN20110220', currentClass: 'JSS 3A', studentId: 'AVN/2025/008', bloodGroup: 'O+', guardianName: 'Hajiya Fatima Mohammed', guardianPhone: '08051234508', guardianRelationship: 'mother', guardianEmail: 'fatima.mohammed@gmail.com', stateOfOrigin: 'Sokoto', religion: 'Islam', homeAddress: '1 Sultan Abubakar Rd, Sokoto', admissionStatus: 'active' as const },
  { studentName: 'Chukwudi Obi', email: 'chukwudi.obi@student.avenirsms.ng', phone: '08031234509', dob: '2011-08-14', gender: 'male', nin: 'NIN20110814', currentClass: 'JSS 3A', studentId: 'AVN/2025/009', bloodGroup: 'A+', guardianName: 'Mrs Adaeze Obi', guardianPhone: '08051234509', guardianRelationship: 'mother', guardianEmail: 'adaeze.obi@gmail.com', stateOfOrigin: 'Delta', religion: 'Christianity', homeAddress: '6 Asaba GRA, Asaba', admissionStatus: 'active' as const },

  // SSS 1A
  { studentName: 'Zainab Yusuf', email: 'zainab.yusuf@student.avenirsms.ng', phone: '08031234510', dob: '2010-05-17', gender: 'female', nin: 'NIN20100517', currentClass: 'SSS 1A', studentId: 'AVN/2025/010', bloodGroup: 'B+', guardianName: 'Dr Yusuf Ibrahim', guardianPhone: '08051234510', guardianRelationship: 'father', guardianEmail: 'yusuf.ibrahim@gmail.com', stateOfOrigin: 'Katsina', religion: 'Islam', homeAddress: '14 GRA, Katsina', admissionStatus: 'active' as const },
  { studentName: 'Obinna Onuoha', email: 'obinna.onuoha@student.avenirsms.ng', phone: '08031234511', dob: '2010-10-03', gender: 'male', nin: 'NIN20101003', currentClass: 'SSS 1A', studentId: 'AVN/2025/011', bloodGroup: 'AB-', guardianName: 'Engr Onuoha', guardianPhone: '08051234511', guardianRelationship: 'father', guardianEmail: 'engr.onuoha@gmail.com', stateOfOrigin: 'Abia', religion: 'Christianity', homeAddress: '3 Ngwa Rd, Aba', admissionStatus: 'active' as const },
  { studentName: 'Blessing Okafor', email: 'blessing.okafor@student.avenirsms.ng', phone: '08031234512', dob: '2010-12-25', gender: 'female', nin: 'NIN20101225', currentClass: 'SSS 1A', studentId: 'AVN/2025/012', bloodGroup: 'O+', guardianName: 'Pastor Okafor', guardianPhone: '08051234512', guardianRelationship: 'father', guardianEmail: 'pastor.okafor@gmail.com', stateOfOrigin: 'Ebonyi', religion: 'Christianity', homeAddress: '11 Abakaliki GRA, Abakaliki', admissionStatus: 'active' as const },

  // SSS 2A
  { studentName: 'Ibrahim Suleiman', email: 'ibrahim.suleiman@student.avenirsms.ng', phone: '08031234513', dob: '2009-03-30', gender: 'male', nin: 'NIN20090330', currentClass: 'SSS 2A', studentId: 'AVN/2025/013', bloodGroup: 'A+', guardianName: 'Alhaji Suleiman', guardianPhone: '08051234513', guardianRelationship: 'father', guardianEmail: 'suleiman.mai@gmail.com', stateOfOrigin: 'Niger', religion: 'Islam', homeAddress: '2 Minna GRA, Minna', admissionStatus: 'active' as const },
  { studentName: 'Chiamaka Agu', email: 'chiamaka.agu@student.avenirsms.ng', phone: '08031234514', dob: '2009-07-11', gender: 'female', nin: 'NIN20090711', currentClass: 'SSS 2A', studentId: 'AVN/2025/014', bloodGroup: 'B+', guardianName: 'Dr Mrs Agu', guardianPhone: '08051234514', guardianRelationship: 'mother', guardianEmail: 'dragu.mama@gmail.com', stateOfOrigin: 'Rivers', religion: 'Christianity', homeAddress: '7 Trans-Amadi, Port Harcourt', admissionStatus: 'active' as const },

  // SSS 3A
  { studentName: 'Musa Danjuma', email: 'musa.danjuma@student.avenirsms.ng', phone: '08031234515', dob: '2008-01-19', gender: 'male', nin: 'NIN20080119', currentClass: 'SSS 3A', studentId: 'AVN/2025/015', bloodGroup: 'O+', guardianName: 'Alhaji Danjuma', guardianPhone: '08051234515', guardianRelationship: 'father', guardianEmail: 'danjuma.senior@gmail.com', stateOfOrigin: 'Taraba', religion: 'Islam', homeAddress: '4 Jalingo GRA, Jalingo', admissionStatus: 'active' as const },
  { studentName: 'Ngozi Nnaji', email: 'ngozi.nnaji@student.avenirsms.ng', phone: '08031234516', dob: '2008-06-28', gender: 'female', nin: 'NIN20080628', currentClass: 'SSS 3A', studentId: 'AVN/2025/016', bloodGroup: 'A-', guardianName: 'Barrister Nnaji', guardianPhone: '08051234516', guardianRelationship: 'father', guardianEmail: 'barrister.nnaji@gmail.com', stateOfOrigin: 'Anambra', religion: 'Christianity', homeAddress: '8 Awka GRA, Awka', admissionStatus: 'active' as const },
  { studentName: 'Precious Ikpe', email: 'precious.ikpe@student.avenirsms.ng', phone: '08031234517', dob: '2008-09-04', gender: 'female', nin: 'NIN20080904', currentClass: 'SSS 3A', studentId: 'AVN/2025/017', bloodGroup: 'AB+', guardianName: 'Mr Edet Ikpe', guardianPhone: '08051234517', guardianRelationship: 'father', guardianEmail: 'edet.ikpe@gmail.com', stateOfOrigin: 'Cross River', religion: 'Christianity', homeAddress: '2 Duke Town, Calabar', admissionStatus: 'active' as const },
];

const STAFF_RAW = [
  { staffName: 'Mr Tunde Adeyemi', email: 'tunde.adeyemi@avenirsms.ng', phone: '08061234501', role: 'teacher' as const, subject: 'Mathematics', basicSalary: 120000, allowances: 20000, bankName: 'Zenith Bank', accountNumber: '2012345678', department: 'Sciences', qualification: 'B.Sc Mathematics (UNILAG)' },
  { staffName: 'Mrs Grace Effiong', email: 'grace.effiong@avenirsms.ng', phone: '08061234502', role: 'teacher' as const, subject: 'English Language', basicSalary: 115000, allowances: 18000, bankName: 'GTBank', accountNumber: '0012345679', department: 'Arts & Humanities', qualification: 'B.A English (UNICAL)' },
  { staffName: 'Mr Babatunde Olatunji', email: 'babatunde.olatunji@avenirsms.ng', phone: '08061234503', role: 'teacher' as const, subject: 'Physics', basicSalary: 125000, allowances: 22000, bankName: 'First Bank', accountNumber: '3012345670', department: 'Sciences', qualification: 'B.Sc Physics (OAU)' },
  { staffName: 'Mrs Aisha Lawal', email: 'aisha.lawal@avenirsms.ng', phone: '08061234504', role: 'teacher' as const, subject: 'Chemistry', basicSalary: 118000, allowances: 18000, bankName: 'UBA', accountNumber: '2023456781', department: 'Sciences', qualification: 'B.Sc Chemistry (ABU)' },
  { staffName: 'Mr Emeka Okoye', email: 'emeka.okoye@avenirsms.ng', phone: '08061234505', role: 'teacher' as const, subject: 'Biology', basicSalary: 112000, allowances: 16000, bankName: 'Access Bank', accountNumber: '0023456782', department: 'Sciences', qualification: 'B.Sc Biology (UNIBEN)' },
  { staffName: 'Mrs Funke Adeyinka', email: 'funke.adeyinka@avenirsms.ng', phone: '08061234506', role: 'teacher' as const, subject: 'Economics', basicSalary: 110000, allowances: 15000, bankName: 'FCMB', accountNumber: '2033456783', department: 'Social Sciences', qualification: 'B.Sc Economics (UNIABUJA)' },
  { staffName: 'Mr Segun Ogunyemi', email: 'segun.ogunyemi@avenirsms.ng', phone: '08061234507', role: 'admin_staff' as const, subject: undefined, basicSalary: 95000, allowances: 12000, bankName: 'Polaris Bank', accountNumber: '4043456784', department: 'Administration', qualification: 'HND Business Admin (YABATECH)' },
  { staffName: 'Mrs Yetunde Fashola', email: 'yetunde.fashola@avenirsms.ng', phone: '08061234508', role: 'admin_staff' as const, subject: undefined, basicSalary: 90000, allowances: 10000, bankName: 'Sterling Bank', accountNumber: '0053456785', department: 'Finance', qualification: 'B.Sc Accounting (LASU)' },
];

const EVENTS_RAW = [
  { title: 'First Term Resumption', description: 'Students resume for the 2025/2026 first term.', date: '2025-09-15', type: 'academic' as const },
  { title: 'Independence Day Celebration', description: 'Nigeria Independence Day — school parade and cultural activities.', date: '2025-10-01', type: 'holiday' as const },
  { title: 'Mid-Term Break', description: 'First term mid-term break for all students and staff.', date: '2025-10-27', type: 'holiday' as const },
  { title: 'First Term Examination Begins', description: 'First term promotional examinations commence for all classes.', date: '2025-11-24', type: 'academic' as const },
  { title: 'Prize Giving & Closing Ceremony', description: 'End of first term prize-giving ceremony and awards night.', date: '2025-12-12', type: 'academic' as const },
  { title: 'Christmas & New Year Break', description: 'School closes for Christmas and New Year holidays.', date: '2025-12-15', type: 'holiday' as const },
  { title: 'Second Term Resumption', description: 'Students resume for the 2025/2026 second term.', date: '2026-01-12', type: 'academic' as const },
  { title: 'Inter-House Sports Competition', description: 'Annual inter-house sports competition for all students.', date: '2026-02-14', type: 'sports' as const },
  { title: 'Science & Technology Fair', description: 'Students present science projects; external judges invited.', date: '2026-03-07', type: 'other' as const },
  { title: 'Second Term Examination Begins', description: 'Second term promotional examinations commence.', date: '2026-03-23', type: 'academic' as const },
  { title: 'PTA Meeting — 2nd Term', description: 'Parents and teachers association meeting to discuss student progress.', date: '2026-03-28', type: 'other' as const },
];

const EXPENSES_RAW = [
  { category: 'salary' as const, amount: 1200000, description: 'October 2025 Staff Salary', date: '2025-10-31', recordedBy: 'Admin' },
  { category: 'utility' as const, amount: 85000, description: 'EKEDC Electricity Bill — October', date: '2025-10-15', recordedBy: 'Admin' },
  { category: 'maintenance' as const, amount: 150000, description: 'Roof repair — Block C classrooms', date: '2025-10-20', recordedBy: 'Admin' },
  { category: 'supplies' as const, amount: 60000, description: 'Office & classroom stationery', date: '2025-10-05', recordedBy: 'Admin' },
  { category: 'salary' as const, amount: 1200000, description: 'November 2025 Staff Salary', date: '2025-11-30', recordedBy: 'Admin' },
  { category: 'utility' as const, amount: 92000, description: 'EKEDC Electricity Bill — November', date: '2025-11-14', recordedBy: 'Admin' },
  { category: 'other' as const, amount: 45000, description: 'Inter-house sports equipment purchase', date: '2025-11-10', recordedBy: 'Admin' },
  { category: 'maintenance' as const, amount: 38000, description: 'Generator servicing', date: '2025-11-25', recordedBy: 'Admin' },
  { category: 'salary' as const, amount: 1200000, description: 'December 2025 Staff Salary', date: '2025-12-31', recordedBy: 'Admin' },
];

const SUBJECTS_PER_CLASS: Record<string, string[]> = {
  'JSS 1A': ['Mathematics', 'English Language', 'Basic Science', 'Basic Technology', 'Social Studies', 'CRS/IRS', 'Computer Studies', 'Physical & Health Education', 'Cultural & Creative Arts', 'Business Studies'],
  'JSS 2A': ['Mathematics', 'English Language', 'Basic Science', 'Basic Technology', 'Social Studies', 'CRS/IRS', 'Computer Studies', 'Physical & Health Education', 'Cultural & Creative Arts', 'Business Studies'],
  'JSS 3A': ['Mathematics', 'English Language', 'Basic Science', 'Basic Technology', 'Social Studies', 'CRS/IRS', 'Computer Studies', 'Physical & Health Education', 'French', 'Fine Art'],
  'SSS 1A': ['Mathematics', 'English Language', 'Biology', 'Chemistry', 'Physics', 'Economics', 'Government', 'Geography', 'Literature in English', 'Civic Education'],
  'SSS 2A': ['Mathematics', 'English Language', 'Biology', 'Chemistry', 'Physics', 'Economics', 'Government', 'Geography', 'Literature in English', 'Civic Education'],
  'SSS 3A': ['Mathematics', 'English Language', 'Biology', 'Chemistry', 'Physics', 'Economics', 'Government', 'Further Mathematics', 'Literature in English', 'Civic Education'],
};

function randScore(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calculateGradeLocal(total: number): string {
  if (total >= 75) return 'A1';
  if (total >= 70) return 'B2';
  if (total >= 65) return 'B3';
  if (total >= 60) return 'C4';
  if (total >= 55) return 'C5';
  if (total >= 50) return 'C6';
  if (total >= 45) return 'D7';
  if (total >= 40) return 'E8';
  return 'F9';
}

// ─── Step runner ──────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

interface Step {
  id: string;
  label: string;
  count?: number;
  status: StepStatus;
  error?: string;
}

const INITIAL_STEPS: Step[] = [
  { id: 'classes', label: 'School Classes', status: 'pending' },
  { id: 'students', label: 'Students (17)', status: 'pending' },
  { id: 'staff', label: 'Teaching & Admin Staff (8)', status: 'pending' },
  { id: 'grades', label: 'Grades / Scores', status: 'pending' },
  { id: 'attendance', label: 'Attendance Records', status: 'pending' },
  { id: 'invoices', label: 'Fee Invoices', status: 'pending' },
  { id: 'expenses', label: 'School Expenses', status: 'pending' },
  { id: 'events', label: 'School Calendar Events', status: 'pending' },
  { id: 'assignments', label: 'Assignments', status: 'pending' },
  { id: 'notifications', label: 'Notifications', status: 'pending' },
];

export default function SeedData() {
  const schoolId = useSchoolId();
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  function setStepStatus(id: string, status: StepStatus, extra?: Partial<Step>) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, ...extra } : s));
  }

  async function seed() {
    setRunning(true);
    setDone(false);
    setSteps(INITIAL_STEPS);

    // ─── 1. Classes ────────────────────────────────────────────────────
    setStepStatus('classes', 'running');
    const classIdMap: Record<string, string> = {};
    try {
      const batch = writeBatch(db);
      for (const cls of CLASSES) {
        const ref = doc(collection(db, 'classes'));
        classIdMap[cls.name] = ref.id;
        batch.set(ref, { ...cls, schoolId: schoolId ?? 'main' });
      }
      await batch.commit();
      setStepStatus('classes', 'done', { count: CLASSES.length });
    } catch (e: any) {
      setStepStatus('classes', 'error', { error: e.message });
    }

    // ─── 2. Students ───────────────────────────────────────────────────
    setStepStatus('students', 'running');
    const studentIdMap: Record<string, string> = {}; // studentId -> docId
    const studentDocIds: string[] = [];
    try {
      const batch = writeBatch(db);
      for (const s of STUDENTS_RAW) {
        const ref = doc(collection(db, 'students'));
        studentIdMap[s.studentId] = ref.id;
        studentDocIds.push(ref.id);
        // Strip undefined fields
        const sData: Record<string, any> = {
          previousSchool: 'Previous Primary School',
          nationality: 'Nigerian',
          enrolledAt: serverTimestamp(),
          applicationId: 'demo',
          schoolId: schoolId ?? 'main',
        };
        for (const [k, v] of Object.entries(s)) {
          if (v !== undefined) sData[k] = v;
        }
        batch.set(ref, sData);
      }
      await batch.commit();
      setStepStatus('students', 'done', { count: STUDENTS_RAW.length });
    } catch (e: any) {
      setStepStatus('students', 'error', { error: e.message });
    }

    // ─── 3. Staff ──────────────────────────────────────────────────────
    setStepStatus('staff', 'running');
    const staffDocIds: string[] = [];
    try {
      const batch = writeBatch(db);
      for (const st of STAFF_RAW) {
        const ref = doc(collection(db, 'staff'));
        staffDocIds.push(ref.id);
        // Strip undefined fields — Firestore rejects them
        const data: Record<string, any> = { employedAt: serverTimestamp(), schoolId: schoolId ?? 'main' };
        for (const [k, v] of Object.entries(st)) {
          if (v !== undefined) data[k] = v;
        }
        batch.set(ref, data);
      }
      await batch.commit();
      setStepStatus('staff', 'done', { count: STAFF_RAW.length });
    } catch (e: any) {
      setStepStatus('staff', 'error', { error: e.message });
    }

    // ─── 4. Grades ─────────────────────────────────────────────────────
    setStepStatus('grades', 'running');
    try {
      let gradeCount = 0;
      const CHUNK = 499;
      let batch = writeBatch(db);
      let batchCount = 0;

      for (const student of STUDENTS_RAW) {
        const docId = studentIdMap[student.studentId];
        if (!docId) continue;
        const subjects = SUBJECTS_PER_CLASS[student.currentClass] || [];
        for (const subject of subjects) {
          const ca = randScore(18, 40);
          const exam = randScore(32, 60);
          const total = ca + exam;
          const ref = doc(collection(db, 'grades'));
          batch.set(ref, {
            studentId: docId,
            subject,
            class: student.currentClass,
            term: TERM,
            session: SESSION,
            caScore: ca,
            examScore: exam,
            totalScore: total,
            grade: calculateGradeLocal(total),
            schoolId: schoolId ?? 'main',
            updatedAt: serverTimestamp(),
          });
          batchCount++;
          gradeCount++;
          if (batchCount >= CHUNK) {
            await batch.commit();
            batch = writeBatch(db);
            batchCount = 0;
          }
        }
      }
      if (batchCount > 0) await batch.commit();
      setStepStatus('grades', 'done', { count: gradeCount });
    } catch (e: any) {
      setStepStatus('grades', 'error', { error: e.message });
    }

    // ─── 5. Attendance ─────────────────────────────────────────────────
    setStepStatus('attendance', 'running');
    try {
      const schoolDays: string[] = [];
      // Generate school days for Oct–Nov 2025
      const start = new Date('2025-10-01');
      const end = new Date('2025-11-28');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const day = d.getDay();
        if (day !== 0 && day !== 6) {
          schoolDays.push(d.toISOString().split('T')[0]);
        }
      }

      let attCount = 0;
      const CHUNK = 499;
      let batch = writeBatch(db);
      let batchCount = 0;

      for (const student of STUDENTS_RAW) {
        const docId = studentIdMap[student.studentId];
        if (!docId) continue;
        for (const date of schoolDays.slice(0, 20)) { // 20 days per student
          const roll = Math.random();
          const status = roll < 0.85 ? 'present' : roll < 0.95 ? 'late' : 'absent';
          const ref = doc(collection(db, 'attendance'));
          batch.set(ref, {
            studentId: docId,
            date,
            status,
            class: student.currentClass,
            recordedBy: 'demo-admin',
            schoolId: schoolId ?? 'main',
          });
          batchCount++;
          attCount++;
          if (batchCount >= CHUNK) {
            await batch.commit();
            batch = writeBatch(db);
            batchCount = 0;
          }
        }
      }
      if (batchCount > 0) await batch.commit();
      setStepStatus('attendance', 'done', { count: attCount });
    } catch (e: any) {
      setStepStatus('attendance', 'error', { error: e.message });
    }

    // ─── 6. Invoices ───────────────────────────────────────────────────
    setStepStatus('invoices', 'running');
    try {
      const FEE_AMOUNTS: Record<string, number> = {
        'JSS 1A': 85000, 'JSS 2A': 85000, 'JSS 3A': 90000,
        'SSS 1A': 110000, 'SSS 2A': 110000, 'SSS 3A': 115000,
      };
      let invCount = 0;
      const batch = writeBatch(db);
      for (const student of STUDENTS_RAW) {
        const docId = studentIdMap[student.studentId];
        if (!docId) continue;
        const amount = FEE_AMOUNTS[student.currentClass] || 90000;
        const paid = Math.random() > 0.4; // 60% paid
        const ref = doc(collection(db, 'invoices'));
        batch.set(ref, {
          studentId: docId,
          studentName: student.studentName,
          amount,
          description: `${TERM} School Fees`,
          dueDate: '2025-10-15',
          status: paid ? 'paid' : 'pending',
          term: TERM,
          session: SESSION,
          schoolId: schoolId ?? 'main',
          createdAt: serverTimestamp(),
        });
        invCount++;
      }
      await batch.commit();
      setStepStatus('invoices', 'done', { count: invCount });
    } catch (e: any) {
      setStepStatus('invoices', 'error', { error: e.message });
    }

    // ─── 7. Expenses ───────────────────────────────────────────────────
    setStepStatus('expenses', 'running');
    try {
      const batch = writeBatch(db);
      for (const exp of EXPENSES_RAW) {
        const ref = doc(collection(db, 'expenses'));
        batch.set(ref, { ...exp, schoolId: schoolId ?? 'main' });
      }
      await batch.commit();
      setStepStatus('expenses', 'done', { count: EXPENSES_RAW.length });
    } catch (e: any) {
      setStepStatus('expenses', 'error', { error: e.message });
    }

    // ─── 8. Events ─────────────────────────────────────────────────────
    setStepStatus('events', 'running');
    try {
      const batch = writeBatch(db);
      for (const ev of EVENTS_RAW) {
        const ref = doc(collection(db, 'events'));
        batch.set(ref, { ...ev, schoolId: schoolId ?? 'main' });
      }
      await batch.commit();
      setStepStatus('events', 'done', { count: EVENTS_RAW.length });
    } catch (e: any) {
      setStepStatus('events', 'error', { error: e.message });
    }

    // ─── 9. Assignments ────────────────────────────────────────────────
    setStepStatus('assignments', 'running');
    try {
      const assignmentsData = [
        { title: 'Algebraic Equations — Exercise 3', description: 'Solve all questions in Exercise 3 on pages 45–46 of your textbook.', subject: 'Mathematics', class: 'JSS 2A', dueDate: '2025-10-20', teacherId: staffDocIds[0] || 'demo' },
        { title: 'Comprehension — The River Between', description: 'Read Chapter 5 and answer all comprehension questions.', subject: 'English Language', class: 'SSS 1A', dueDate: '2025-10-18', teacherId: staffDocIds[1] || 'demo' },
        { title: 'Newton\'s Laws — Practice Problems', description: 'Complete the 10 practice problems on Newton\'s second law.', subject: 'Physics', class: 'SSS 2A', dueDate: '2025-10-22', teacherId: staffDocIds[2] || 'demo' },
        { title: 'Periodic Table Assignment', description: 'Draw and label the first 20 elements of the periodic table.', subject: 'Chemistry', class: 'SSS 1A', dueDate: '2025-10-25', teacherId: staffDocIds[3] || 'demo' },
        { title: 'Photosynthesis Essay', description: 'Write a 500-word essay explaining the process of photosynthesis.', subject: 'Biology', class: 'SSS 2A', dueDate: '2025-10-27', teacherId: staffDocIds[4] || 'demo' },
        { title: 'Demand & Supply Graph', description: 'Draw demand and supply curves for given data and identify equilibrium.', subject: 'Economics', class: 'SSS 3A', dueDate: '2025-10-30', teacherId: staffDocIds[5] || 'demo' },
      ];
      const batch = writeBatch(db);
      for (const asgn of assignmentsData) {
        const ref = doc(collection(db, 'assignments'));
        batch.set(ref, { ...asgn, schoolId: schoolId ?? 'main', createdAt: serverTimestamp() });
      }
      await batch.commit();
      setStepStatus('assignments', 'done', { count: assignmentsData.length });
    } catch (e: any) {
      setStepStatus('assignments', 'error', { error: e.message });
    }

    // ─── 10. Notifications ─────────────────────────────────────────────
    setStepStatus('notifications', 'running');
    try {
      const notificationsData = [
        { recipientId: 'all', title: 'Welcome to 2025/2026 Session', body: 'We warmly welcome all students, parents, and staff to the new academic session. Let us make it a productive one!', type: 'general', read: false },
        { recipientId: 'all', title: 'First Term Exam Timetable Released', body: 'The first term examination timetable has been published. Please check the portal for your schedule.', type: 'exam', read: false },
        { recipientId: 'all', title: 'Fee Payment Reminder', body: 'This is a reminder that first term school fees are due by 15th October 2025. Please ensure prompt payment to avoid disruption.', type: 'fee_due', read: false },
        { recipientId: 'all', title: 'Inter-House Sports — 14th February 2026', body: 'Students are reminded to register for their preferred sports events. Sports day is on 14th Feb 2026.', type: 'general', read: false },
        { recipientId: 'all', title: 'PTA Meeting — 28th March 2026', body: 'All parents are invited to attend the PTA meeting on 28th March 2026 at 10:00 AM in the school hall.', type: 'general', read: false },
      ];
      const batch = writeBatch(db);
      for (const notif of notificationsData) {
        const ref = doc(collection(db, 'notifications'));
        batch.set(ref, { ...notif, schoolId: schoolId ?? 'main', createdAt: serverTimestamp() });
      }
      await batch.commit();
      setStepStatus('notifications', 'done', { count: notificationsData.length });
    } catch (e: any) {
      setStepStatus('notifications', 'error', { error: e.message });
    }

    setRunning(false);
    setDone(true);
  }

  const statusIcon = (s: StepStatus) => {
    if (s === 'pending') return <span className="w-5 h-5 rounded-full border-2 border-slate-200 inline-block" />;
    if (s === 'running') return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    if (s === 'done') return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    if (s === 'error') return <AlertTriangle className="w-5 h-5 text-rose-500" />;
    if (s === 'skipped') return <span className="w-5 h-5 text-slate-400 text-xs font-bold">—</span>;
  };

  const allDone = steps.every(s => s.status === 'done' || s.status === 'skipped' || s.status === 'error');
  const hasErrors = steps.some(s => s.status === 'error');

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg">
          <Database className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Seed Demo Data</h1>
          <p className="text-sm text-slate-500">Populate the system with realistic Nigerian school data for presentation</p>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 mb-8">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-900">For Demo / Presentation Use Only</p>
          <p className="text-xs text-amber-700 mt-1">
            This will write sample data into your Firestore database — 17 students, 8 staff, grades, attendance,
            invoices, expenses, events, and notifications. Run this only once. Running it again will create duplicates.
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 mb-6">
        {steps.map(step => (
          <div key={step.id} className="flex items-center gap-4 px-6 py-4">
            <div className="flex-shrink-0">{statusIcon(step.status)}</div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${step.status === 'error' ? 'text-rose-700' : 'text-slate-800'}`}>
                {step.label}
                {step.count !== undefined && step.status === 'done' && (
                  <span className="ml-2 text-xs font-normal text-slate-500">({step.count} records)</span>
                )}
              </p>
              {step.status === 'error' && step.error && (
                <p className="text-xs text-rose-600 mt-0.5 truncate">{step.error}</p>
              )}
            </div>
            <div className="flex-shrink-0">
              {step.status === 'done' && <span className="text-xs text-emerald-600 font-bold">✓ Done</span>}
              {step.status === 'pending' && <span className="text-xs text-slate-400">Waiting</span>}
              {step.status === 'running' && <span className="text-xs text-blue-500 font-medium">Running…</span>}
              {step.status === 'error' && <span className="text-xs text-rose-600 font-bold">Failed</span>}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      {!done ? (
        <button
          onClick={seed}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 py-4 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white font-bold rounded-2xl transition-colors text-sm shadow-lg"
        >
          {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
          {running ? 'Seeding data, please wait…' : 'Run Seed Data'}
        </button>
      ) : (
        <div className={`rounded-2xl p-6 text-center ${hasErrors ? 'bg-rose-50 border border-rose-200' : 'bg-emerald-50 border border-emerald-200'}`}>
          {hasErrors ? (
            <>
              <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
              <p className="font-black text-rose-900 text-lg">Completed with Errors</p>
              <p className="text-sm text-rose-700 mt-1">Some steps failed (see above). Check your Firestore rules and admin login, then try again.</p>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <p className="font-black text-emerald-900 text-lg">Data Seeded Successfully!</p>
              <p className="text-sm text-emerald-700 mt-1">Your system is now populated with demo data. You can explore all modules in the dashboard.</p>
            </>
          )}
          <button
            onClick={() => { setDone(false); setSteps(INITIAL_STEPS); }}
            className="mt-4 flex items-center gap-2 mx-auto text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Reset &amp; Run Again
          </button>
        </div>
      )}
    </div>
  );
}
