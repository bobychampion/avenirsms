export type ApplicationStatus = 'pending' | 'reviewing' | 'approved' | 'rejected';

export interface Application {
  id?: string;
  applicantName: string;
  email: string;
  phone: string;
  dob: string;
  gender: 'male' | 'female' | 'other';
  nin?: string;
  classApplyingFor: string;
  previousSchool: string;
  waecNecoNumber?: string;
  status: ApplicationStatus;
  createdAt: any;
  updatedAt?: any;
  reviewerNotes?: string;
  applicantUid: string;
  documents?: { name: string; type: string; url: string }[];
  /** Multi-tenant school identifier */
  schoolId?: string;
  /** True when created directly by admin (not via public form) */
  directAdmission?: boolean;
  /** Guardian info collected on the public application form */
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  guardianRelationship?: string;
  guardianAddress?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  role:
    | 'admin'
    | 'School_admin'
    | 'super_admin'
    | 'applicant'
    | 'student'
    | 'teacher'
    | 'parent'
    | 'accountant'
    | 'hr'
    | 'librarian'
    | 'staff';
  displayName: string;
  disabled?: boolean;
  /** School this user belongs to. Undefined only for super_admin accounts. */
  schoolId?: string;
  /** Firestore Student document IDs linked to this parent account */
  linkedStudentIds?: string[];
  /**
   * Denormalized list of children for quick display (kept in sync on enrol/update).
   * Each entry mirrors a linked student's name + class so the parent sees
   * their children identified by name without an extra Firestore read.
   */
  linkedChildren?: { studentId: string; studentName: string; currentClass: string }[];
  /**
   * Per-user permission overrides (Phase 4). Format: `<resource>.<action>`,
   * e.g. `finance.write`, `admissions.review`. A user inherits the default
   * permission set from their `role` (see DEFAULT_ROLE_PERMISSIONS in
   * src/utils/permissions.ts); entries here grant *additional* capabilities.
   * Use `hasPermission()` from useAuth() to check.
   */
  permissions?: string[];
  /**
   * True when the user must change their password before continuing to the
   * portal. Set by admin-reset or by first-time synthetic student provisioning.
   */
  mustChangePassword?: boolean;
  /**
   * True when this account was provisioned with a synthetic school email
   * (e.g. `{studentId}@students.{slug}.local`) rather than a real deliverable
   * inbox. Used to disable "forgot password" self-service and route admins
   * to the explicit reset flow instead.
   */
  syntheticLogin?: boolean;
}

/** Platform-level school record (schools collection) */
export interface School {
  id?: string;
  name: string;
  adminEmail: string;
  status: 'active' | 'suspended' | 'trial' | 'demo';
  subscriptionPlan: 'free' | 'starter' | 'pro' | 'enterprise';
  subscriptionExpiresAt?: any;
  maxStudents: number;
  maxStaff: number;
  createdAt: any;
  updatedAt?: any;
  createdBy: string;
  country: string;
  timezone: string;
  notes?: string;
  urlSlug?: string;
}

export interface SchoolClass {
  id?: string;
  name: string;
  level: string;
  formTutorId?: string;
  formTutorName?: string;
  academicSession: string;
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
  schoolId?: string;
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
  photoUrl?: string;
  // Guardian / Parent linkage
  guardianName?: string;
  guardianPhone?: string;
  guardianRelationship?: string;
  guardianEmail?: string;
  guardianUserId?: string;   // linked Firebase Auth UID of parent
  // Secondary guardian
  guardian2Name?: string;
  guardian2Phone?: string;
  guardian2Relationship?: string;
  guardian2Email?: string;
  // Sibling links
  siblingIds?: string[];     // array of Student document IDs
  // Academic history
  previousSchool?: string;
  previousClass?: string;
  // Medical
  medicalConditions?: string;
  bloodGroup?: string;
  allergies?: string;
  // Extra
  religion?: string;
  homeAddress?: string;
  stateOfOrigin?: string;
  lga?: string;
  nationality?: string;
  admissionStatus?: 'active' | 'graduated' | 'withdrawn' | 'suspended';
  /** Synthetic school-issued login email, if auto-provisioned at admission. */
  loginEmail?: string;
}

// Guardian record (standalone, so one parent can link multiple children)
export interface Guardian {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  relationship: 'father' | 'mother' | 'uncle' | 'aunt' | 'sibling' | 'guardian' | 'other';
  occupation?: string;
  homeAddress?: string;
  userId?: string;       // Firebase Auth UID if they have a parent portal account
  studentIds: string[];  // linked student document IDs
  /**
   * Denormalized child info stored alongside IDs so admin screens can display
   * "Amara Okafor (JSS 2)" without fetching each student document individually.
   */
  linkedChildren?: { studentId: string; studentName: string; currentClass: string }[];
  createdAt: any;
}

// Admission pipeline note / activity log
export interface AdmissionNote {
  id?: string;
  applicationId: string;
  authorId: string;
  authorName: string;
  content: string;
  type: 'note' | 'status_change' | 'document_request' | 'interview_scheduled';
  createdAt: any;
}

export type SkillRating = 'E' | 'VG' | 'G' | 'F' | 'P';

export interface StudentSkills {
  punctuality: SkillRating;
  neatness: SkillRating;
  cooperation: SkillRating;
  honesty: SkillRating;
  sports: SkillRating;
  creativity: SkillRating;
}

export const SKILL_LABELS: { key: keyof StudentSkills; label: string }[] = [
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'neatness', label: 'Neatness' },
  { key: 'cooperation', label: 'Co-operation' },
  { key: 'honesty', label: 'Honesty' },
  { key: 'sports', label: 'Sports' },
  { key: 'creativity', label: 'Creativity' },
];

export const SKILL_RATING_LABELS: Record<SkillRating, string> = {
  E: 'Excellent',
  VG: 'Very Good',
  G: 'Good',
  F: 'Fair',
  P: 'Poor',
};

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
  subjectPosition?: number;  // rank within the class for this subject
  updatedAt: any;
}

// Standalone skills/psychomotor record per student per term
export interface StudentSkillRecord {
  id?: string;
  studentId: string;
  class: string;
  term: '1st Term' | '2nd Term' | '3rd Term';
  session: string;
  skills: StudentSkills;
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

// ─── New Types ───────────────────────────────────────────────────────────────

export interface Staff {
  id?: string;
  staffName: string;
  email: string;
  phone: string;
  role: 'teacher' | 'admin_staff' | 'support';
  subject?: string;
  basicSalary: number;
  allowances: number;
  bankName?: string;
  accountNumber?: string;
  employedAt: any;
  userId?: string;
  department?: string;
  qualification?: string;
  photoUrl?: string;
}

export interface LeaveRequest {
  id?: string;
  staffId: string;
  staffName: string;
  type: 'annual' | 'sick' | 'maternity' | 'paternity' | 'other';
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  reviewedBy?: string;
}

export interface Payroll {
  id?: string;
  staffId: string;
  staffName: string;
  month: string;
  basicSalary: number;
  allowances: number;
  grossPay: number;
  pension: number;
  paye: number;
  netPay: number;
  status: 'draft' | 'approved' | 'paid';
  generatedAt: any;
  approvedBy?: string;
}

export interface Notification {
  id?: string;
  recipientId: string;
  title: string;
  body: string;
  type: 'fee_due' | 'exam' | 'attendance' | 'general';
  read: boolean;
  createdAt: any;
}

export interface CurriculumItem {
  id?: string;
  subject: string;
  level: string;
  term: '1st Term' | '2nd Term' | '3rd Term';
  topic: string;
  objective: string;
  completed: boolean;
  completedAt?: any;
  teacherId?: string;
  /** Firestore ID of the curriculum_document this item was imported from */
  sourceDocId?: string;
  /** File name of the source document (denormalized for display) */
  sourceDocName?: string;
  /** The specific learning objective from the source document (for alignment tracking) */
  alignedObjective?: string;
  /** Assessment focus areas aligned to this topic from the source document */
  alignedAssessmentFocus?: string[];
  /** Source type: 'manual', 'nerdc', or 'ai_document' */
  source?: 'manual' | 'nerdc' | 'ai_document';
  createdAt?: any;
  updatedAt?: any;
}

export interface CurriculumDocument {
  id?: string;
  schoolId: string;
  fileName: string;
  subject: string;
  level: string;
  term: '1st Term' | '2nd Term' | '3rd Term';
  uploadedBy: string;
  fileUrl?: string;
  summary: {
    keyTopics: string[];
    learningObjectives: string[];
    assessmentFocus: string[];
    rawSummary: string;
  };
  charCount: number;
  uploadedAt: any;
}

export interface QuestionBankItem {
  id?: string;
  schoolId?: string;
  subject: string;
  level: string;
  topic: string;
  questionText: string;
  options: { label: 'A' | 'B' | 'C' | 'D'; text: string }[];
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  difficulty: 'easy' | 'medium' | 'hard';
  sourceDocId?: string;
  sourceType: 'manual' | 'ai_generated';
  createdBy: string;
  createdAt: any;
}

export interface CBTExam {
  id?: string;
  schoolId?: string;
  title: string;
  subject: string;
  targetClass: string;
  durationMinutes: number;
  questionCount: number;
  passMark: number;
  shuffleQuestions: boolean;
  allowedAttempts: 1 | 2 | 3;
  status: 'draft' | 'active' | 'closed';
  questionFilter: {
    subject: string;
    level?: string;
    topics?: string[];
    difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
  };
  type: 'entrance' | 'internal';
  createdAt: any;
}

export interface CBTSession {
  id?: string;
  examId: string;
  studentId: string;
  studentName: string;
  questions: {
    questionId: string;
    questionText: string;
    options: { label: string; text: string }[];
    correctAnswer: string;
  }[];
  answers: Record<string, string>;
  startedAt: any;
  submittedAt?: any;
  score?: number;
  status: 'in_progress' | 'submitted' | 'timed_out';
  durationMinutes: number;
}

export interface CBTAnswer {
  questionId: string;
  selected: string;
}

// ─── Subject Management ───────────────────────────────────────────────────────

export interface SubjectDefinition {
  id?: string;
  name: string;
  code?: string;
  description?: string;
  assignedClasses: string[];
  assignedTeacherId?: string;
  assignedTeacherName?: string;
  level?: 'Primary' | 'Secondary' | 'All';
  isBuiltIn: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const SUBJECTS = [
  'Mathematics', 'English Language', 'Biology', 'Chemistry', 'Physics',
  'Civic Education', 'Economics', 'Government', 'Geography', 'Literature in English',
  'Agricultural Science', 'Computer Studies', 'CRS/IRS', 'Further Mathematics',
  'Technical Drawing', 'Commerce', 'Accounting', 'French', 'Home Economics',
  'Physical & Health Education', 'Fine Art', 'Music', 'Basic Science', 'Basic Technology',
  'Social Studies', 'Cultural & Creative Arts', 'Business Studies', 'History'
];

export type GradingSystem = 'waec' | 'percentage' | 'gpa4' | 'ib' | 'custom';

export interface CustomGradeScale {
  min: number;
  max: number;
  grade: string;
  label: string;
}

export function calculateGrade(
  total: number,
  gradingSystem: GradingSystem = 'waec',
  customScale?: CustomGradeScale[]
): string {
  switch (gradingSystem) {
    case 'waec':
      if (total >= 75) return 'A1';
      if (total >= 70) return 'B2';
      if (total >= 65) return 'B3';
      if (total >= 60) return 'C4';
      if (total >= 55) return 'C5';
      if (total >= 50) return 'C6';
      if (total >= 45) return 'D7';
      if (total >= 40) return 'E8';
      return 'F9';
    case 'percentage':
      if (total >= 90) return 'A+';
      if (total >= 80) return 'A';
      if (total >= 70) return 'B';
      if (total >= 60) return 'C';
      if (total >= 50) return 'D';
      return 'F';
    case 'gpa4':
      if (total >= 90) return 'A (4.0)';
      if (total >= 80) return 'B (3.0)';
      if (total >= 70) return 'C (2.0)';
      if (total >= 60) return 'D (1.0)';
      return 'F (0.0)';
    case 'ib':
      // IB grades 1-7 based on percentage
      if (total >= 86) return '7';
      if (total >= 72) return '6';
      if (total >= 58) return '5';
      if (total >= 44) return '4';
      if (total >= 30) return '3';
      if (total >= 16) return '2';
      return '1';
    case 'custom':
      if (customScale && customScale.length > 0) {
        const sorted = [...customScale].sort((a, b) => b.min - a.min);
        const match = sorted.find(s => total >= s.min && total <= s.max);
        if (match) return match.grade;
      }
      // fallback to percentage
      if (total >= 50) return 'Pass';
      return 'Fail';
    default:
      // Same as WAEC
      if (total >= 75) return 'A1';
      if (total >= 50) return 'C';
      return 'F';
  }
}

export function calculatePAYE(grossPay: number): number {
  // Simplified Nigerian PAYE (Personal Income Tax)
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
  return Math.round(tax / 12);
}

export const SCHOOL_CLASSES = [
  'Kindergarten',
  'Nursery 1', 'Nursery 2',
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
  'JSS 1', 'JSS 2', 'JSS 3',
  'SSS 1', 'SSS 2', 'SSS 3'
];

export const NIGERIAN_REGULATIONS = {
  minAgePrimary1: 6,
  minAgeJSS1: 10,
  minAgeSSS1: 14
};

export const CURRENT_SESSION = '2025/2026';
export const TERMS = ['1st Term', '2nd Term', '3rd Term'] as const;

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Geo-fencing & Teacher Attendance ────────────────────────────────────────

/**
 * A circular geo-fence boundary around the school campus.
 * Stored in Firestore: geofences/main
 */
export interface GeoFence {
  id?: string;
  lat: number;       // Centre latitude (decimal degrees)
  lng: number;       // Centre longitude (decimal degrees)
  radius: number;    // Radius in metres
  schoolName?: string;
  updatedAt?: any;
  updatedBy?: string;
}

/**
 * A teacher GPS check-in or check-out event.
 * Stored in Firestore: attendance_checkins/{uid}_{date}_{type}
 */
export interface TeacherCheckIn {
  id?: string;
  teacherId: string;
  teacherName: string;
  type: 'check_in' | 'check_out';
  date: string;           // YYYY-MM-DD
  timestamp: any;         // Firestore serverTimestamp
  lat: number;
  lng: number;
  accuracy: number;       // GPS accuracy in metres
  withinFence: boolean;   // Was the GPS position inside the school geo-fence?
  spoofDetected?: boolean;
  manualOverride?: boolean;
  overrideReason?: string;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}
