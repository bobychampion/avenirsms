export type ApplicationStatus = 'pending' | 'reviewing' | 'approved' | 'rejected';

export interface Application {
  id?: string;
  applicantName: string;
  email: string;
  phone: string;
  dob: string;
  gender: 'male' | 'female' | 'other';
  nin: string;
  classApplyingFor: string;
  previousSchool: string;
  waecNecoNumber?: string;
  status: ApplicationStatus;
  createdAt: any;
  updatedAt?: any;
  reviewerNotes?: string;
  applicantUid: string;
  documents?: { name: string; type: string; url: string }[];
}

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'applicant' | 'teacher' | 'parent' | 'School_admin';
  displayName: string;
}

export interface SchoolClass {
  id?: string;
  name: string; // e.g., 'JSS 1A'
  level: string; // e.g., 'JSS 1' from SCHOOL_CLASSES
  formTutorId?: string;
  formTutorName?: string;
  academicSession: string; // e.g., '2025/2026'
  studentCount?: number;
}

export interface ClassSubject {
  id?: string;
  classId: string;
  subjectName: string;
  teacherId?: string;
  teacherName?: string;
}

export interface Student {
  id?: string;
  studentName: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  nin: string;
  currentClass: string;
  studentId: string;
  enrolledAt: any;
  applicationId: string;
  // Guardian Details
  guardianName?: string;
  guardianPhone?: string;
  guardianRelationship?: string;
  guardianEmail?: string; // Link to parent user
  // Academic Records
  previousSchool?: string;
  previousClass?: string;
  // Medical Information
  medicalConditions?: string;
  bloodGroup?: string;
  allergies?: string;
}

export interface Grade {
  id?: string;
  studentId: string;
  subject: string;
  class: string;
  term: '1st Term' | '2nd Term' | '3rd Term';
  session: string;
  caScore: number;
  examScore: number;
  totalScore: number;
  grade: string;
  teacherNotes?: string;
  updatedAt: any;
}

export interface ExamSeating {
  id?: string;
  examName: string;
  hallName: string;
  studentId: string;
  seatNumber: string;
  date: string;
  time: string;
}

export interface TimetablePeriod {
  subject: string;
  startTime: string;
  endTime: string;
  teacher?: string;
}

export interface Timetable {
  id?: string;
  class: string;
  term: '1st Term' | '2nd Term' | '3rd Term';
  session: string;
  schedule: {
    [key in 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday']: TimetablePeriod[];
  };
  updatedAt: any;
}

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

export interface Attendance {
  id?: string;
  studentId: string;
  date: string;
  status: 'present' | 'absent' | 'late';
  class: string;
  recordedBy: string;
}

export interface Assignment {
  id?: string;
  title: string;
  description: string;
  subject: string;
  class: string;
  dueDate: string;
  teacherId: string;
  createdAt: any;
}

export interface Message {
  id?: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  content: string;
  timestamp: any;
  read: boolean;
}

export interface SchoolEvent {
  id?: string;
  title: string;
  description: string;
  date: string;
  type: 'academic' | 'holiday' | 'sports' | 'other';
}

export interface Invoice {
  id?: string;
  studentId: string;
  studentName: string;
  amount: number;
  description: string;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  term: '1st Term' | '2nd Term' | '3rd Term';
  session: string;
  createdAt: any;
}

export interface FeePayment {
  id?: string;
  invoiceId: string;
  studentId: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'card' | 'other';
  reference?: string;
  date: string;
  recordedBy: string;
}

export interface Expense {
  id?: string;
  category: 'salary' | 'maintenance' | 'supplies' | 'utility' | 'other';
  amount: number;
  description: string;
  date: string;
  recordedBy: string;
}

export const SUBJECTS = [
  'Mathematics', 'English Language', 'Biology', 'Chemistry', 'Physics',
  'Civic Education', 'Economics', 'Government', 'Geography', 'Literature in English',
  'Agricultural Science', 'Computer Studies', 'CRS/IRS'
];

export function calculateGrade(total: number): string {
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

export const SCHOOL_CLASSES = [
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
  'JSS 1', 'JSS 2', 'JSS 3',
  'SSS 1', 'SSS 2', 'SSS 3'
];

export const NIGERIAN_REGULATIONS = {
  minAgePrimary1: 6,
  minAgeJSS1: 10,
  minAgeSSS1: 14
};
