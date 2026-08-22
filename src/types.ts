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
  /**
   * In-progress admin edits to the Guardian & Sibling Linking panel, saved via
   * its "Save Draft" button so the selection survives a reload before the
   * application is actually approved (approval itself persists the real
   * students/guardians/users records — these two fields are draft-only).
   */
  draftGuardianForm?: Record<string, string>;
  draftSiblingIds?: string[];
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
  /** Profile picture URL (Cloudinary), set via the self-service My Profile page. */
  photoUrl?: string;
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
  /**
   * Parent preference: show their child's photo on the report card they view/print.
   * Undefined/missing means "show" (opt-out, not opt-in).
   */
  reportCardShowPhoto?: boolean;
  /**
   * Per-user notification category opt-outs. Undefined/missing for any key
   * means "on" (opt-out, not opt-in) — matches reportCardShowPhoto's convention.
   */
  notificationPrefs?: { attendance?: boolean; fees?: boolean; general?: boolean };
  /**
   * Set when an admin "deletes" this user. We can't delete the underlying
   * Firebase Auth credential client-side (needs the Admin SDK), so deletion
   * instead overwrites this doc with a disabled tombstone — this flag marks
   * that state so the UI can hide/label it distinctly from a normal disable.
   */
  deletedAt?: any;
  lastLoginAt?: any;
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
  /** School's own domain/subdomain, e.g. "portal.someschool.com". Mirrored into school_domains/{customDomain}. */
  customDomain?: string;
}

export interface SchoolClass {
  id?: string;
  name: string;
  level: string;
  formTutorId?: string;
  formTutorName?: string;
  academicSession: string;
  studentCount?: number;
  /** Google Classroom course ID — set after successful sync */
  googleCourseId?: string;
}

export interface ClassSubject {
  id?: string;
  classId: string;
  subjectName: string;
  teacherId?: string;
  teacherName?: string;
  // Session/term scoping + lifecycle status. Optional for backward compatibility with
  // pre-existing docs (created before this sprint) — absence is treated as "active" for
  // the currently active session/term everywhere this field is read.
  academicSession?: string;
  term?: string;
  status?: 'active' | 'inactive';
  /**
   * Elective support: which students in the class actually take this subject.
   * Undefined or empty means the WHOLE class takes it — that's the default and
   * keeps every pre-existing assignment working unchanged. Populate it only for
   * optional subjects, where a class shares a common core but individual
   * students pick different extras.
   */
  enrolledStudentIds?: string[];
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
  guardian2UserId?: string;  // linked Firebase Auth UID of secondary guardian
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
  homeAddress?: string;
  otherNationality?: string;
  lga?: string;
  nationality?: string;
  admissionStatus?: 'active' | 'graduated' | 'withdrawn' | 'suspended';
  /** Set when admissionStatus is changed to 'withdrawn'; cleared on reinstatement. */
  withdrawnAt?: any;
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
  /** Links to school_settings.timetablePeriods[].id */
  slotId?: string;
  subject: string;
  startTime: string;
  endTime: string;
  teacher?: string;
}

export type { TimetablePeriodSlot, TimetablePeriodSlotType } from './utils/timetablePeriods';
export {
  DEFAULT_TIMETABLE_PERIODS,
  resolveTimetablePeriodSlots,
  sortedPeriodSlots,
  lessonSlots,
  periodTimesFromSlots,
} from './utils/timetablePeriods';

export interface Timetable {
  id?: string;
  class: string;
  term: '1st Term' | '2nd Term' | '3rd Term';
  session: string;
  /**
   * Keyed by weekday name. Saturday/Sunday keys are only populated when the
   * school has opted into weekend classes (school_settings.weekendDays) —
   * the key union is a fixed superset so indexing with any weekday is always
   * type-safe regardless of which days a given school actually uses.
   */
  schedule: {
    [key in 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday']: TimetablePeriod[];
  };
  updatedAt: any;
}

/** Base weekday set — always available regardless of school settings. */
export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
/** Opt-in weekend days a school can enable via school_settings.weekendDays. */
export const WEEKEND_DAYS = ['Saturday', 'Sunday'] as const;
export type WeekendDay = typeof WEEKEND_DAYS[number];

export interface Attendance {
  id?: string;
  studentId: string;
  date: string;
  status: 'present' | 'absent' | 'late';
  class: string;
  recordedBy: string;
}

/**
 * Per-lesson attendance exception. Independent of `Attendance` (the official daily record) —
 * only written when a school's attendanceMode is 'daily_and_subject' or 'subject_only'.
 * One doc per student per class per subject per date. `inheritedFromDaily: true` marks rows
 * a teacher hasn't explicitly overridden (their status mirrors the day's `Attendance` doc).
 */
export interface SubjectAttendance {
  id?: string;
  schoolId: string;
  studentId: string;
  classId: string;
  /** Denormalized class name, matching Student.currentClass / Attendance.class conventions. */
  className: string;
  /** Matches ClassSubject.subjectName — this codebase keys subjects by name, not a subjects collection FK. */
  subjectName: string;
  teacherId: string;
  timetablePeriodId?: string;
  academicSession: string;
  term: string;
  attendanceDate: string;
  status: 'present' | 'absent' | 'late';
  inheritedFromDaily: boolean;
  recordedBy: string;
  recordedAt?: any;
}

/**
 * Extra-curricular / out-of-timetable lesson (coaching, clubs, remedial classes, etc.).
 * Independent of the normal class timetable — a student can be enrolled in any number of
 * these regardless of which class/form they belong to (e.g. "JSS2A" + "WAEC Coaching" +
 * "Coding Club" simultaneously). Enrollment is a plain array on the lesson doc rather than
 * a separate join collection, matching this project's preference for simple denormalized
 * lists over join tables where the list stays small (a lesson's roster, not a global index).
 */
export interface SpecialLesson {
  id?: string;
  schoolId: string;
  name: string;
  description?: string;
  teacherIds: string[];
  teacherNames?: string[];
  academicSession: string;
  term: string;
  startDate: string;
  endDate: string;
  /** Weekday/weekend names this lesson runs on, e.g. ['Saturday'] or ['Monday','Wednesday']. */
  days: string[];
  time?: string;
  status: 'active' | 'inactive' | 'completed';
  enrolledStudentIds: string[];
  createdAt?: any;
  updatedAt?: any;
}

/**
 * Attendance for a Special Lesson session — fully independent of `Attendance` (daily) and
 * `SubjectAttendance`. Does not affect a student's official daily attendance percentage
 * unless a school explicitly configures that (not implemented — flagged for a future setting).
 */
export interface SpecialLessonAttendance {
  id?: string;
  schoolId: string;
  specialLessonId: string;
  studentId: string;
  attendanceDate: string;
  status: 'present' | 'absent' | 'late';
  recordedBy: string;
  recordedAt?: any;
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
  /** Denormalized count — updated whenever a submission is added/removed */
  submissionCount?: number;
  schoolId?: string;
}

/**
 * A student's submission for an assignment. Stored in `assignment_submissions`
 * collection, scoped by schoolId. Parents submit on behalf of their child;
 * teachers read and grade from the TeacherPortal.
 */
export interface AssignmentSubmission {
  id?: string;
  assignmentId: string;
  assignmentTitle: string;
  studentId: string;
  studentName: string;
  /** Firebase Auth UID of the parent who submitted */
  submittedBy: string;
  submitterName: string;
  note: string;
  /** Optional external file link (Drive, Cloudinary, etc.) */
  fileUrl?: string;
  status: 'submitted' | 'graded';
  grade?: string;
  feedback?: string;
  schoolId: string;
  submittedAt: any;
  gradedAt?: any;
  gradedBy?: string;
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
  schoolId?: string;
  /** Google Calendar event ID — set after successful sync */
  googleEventId?: string;
}

export interface Invoice {
  id?: string;
  studentId: string;
  studentName: string;
  amount: number;
  description: string;
  dueDate: string;
  /**
   * 'awaiting_confirmation' = a parent has declared a bank transfer/cash
   * payment via the portal; an admin must approve or reject it in
   * FinancialManagement before it becomes 'paid'.
   */
  status: 'pending' | 'awaiting_confirmation' | 'paid' | 'overdue' | 'cancelled';
  term: '1st Term' | '2nd Term' | '3rd Term';
  session: string;
  createdAt: any;
  /** Set when a parent declares payment via the portal (bank transfer/cash). */
  paymentClaimedAt?: any;
  paidAt?: any;
  /** Paystack transaction reference, set when paid via card. */
  paystackReference?: string;
  /** Always written in practice; declared here so it's no longer just an undocumented runtime field. */
  schoolId?: string;
  /** References FeeCategory.id. Optional for backward compatibility with invoices created before categories existed. */
  category?: string;
  /** Set when this invoice was bulk-created from a FeeTemplate. */
  templateId?: string;
}

/** Admin-configurable per-school fee type, e.g. "Tuition", "Transport", "PTA Levy". */
export interface FeeCategory {
  id?: string;
  schoolId: string;
  name: string;
  defaultAmount?: number;
  createdAt: any;
}

/**
 * Reusable invoice blueprint — since there's no Cloud Function/cron to
 * auto-generate fees on a schedule (Spark plan), a template instead lets an
 * admin re-run the same bulk-create with one click each term, rather than
 * rebuilding the form from scratch.
 */
export interface FeeTemplate {
  id?: string;
  schoolId: string;
  name: string;
  categoryId?: string;
  description: string;
  amount: number;
  target: 'class' | 'everyone';
  targetClass?: string;
  term: Invoice['term'];
  createdAt: any;
  lastGeneratedAt?: any;
}

export interface FeePayment {
  id?: string;
  invoiceId: string;
  studentId: string;
  schoolId?: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'card' | 'other';
  reference?: string;
  date: string;
  recordedBy: string;
  /**
   * 'pending' = parent self-reported via the portal, awaiting admin
   * confirmation. 'confirmed' = either recorded directly by an admin, or a
   * parent-reported claim an admin approved (or an auto-confirmed card
   * payment). 'rejected' = admin determined the claim was invalid.
   * Missing/undefined is treated as 'confirmed' for older records.
   */
  status?: 'pending' | 'confirmed' | 'rejected';
  confirmedBy?: string;
  confirmedAt?: any;
  rejectedReason?: string;
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
  schoolId?: string;
  reviewedBy?: string;
  reviewComment?: string;
  reviewedAt?: any;
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
  /** Firebase UID of the recipient, or 'all' for a school-wide broadcast. */
  recipientId: string;
  title: string;
  body: string;
  type: 'fee_due' | 'exam' | 'attendance' | 'general' | 'message' | 'grade' | 'assignment';
  read: boolean;
  createdAt: any;
  schoolId?: string;
  /** Optional deep-link target, e.g. a specific message thread or assignment. */
  link?: string;
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

// ─── Storage Provider Connection ──────────────────────────────────────────────

export type StorageProviderName = 'cloudinary' | 'firebase' | 's3' | 'supabase';

/** Mirrors storage_settings/{schoolId} — never contains the secret. */
export interface StorageSettings {
  schoolId: string;
  provider: StorageProviderName;
  cloudName?: string;
  apiKey?: string;
  status: 'connected' | 'disconnected' | 'error';
  connectedAt?: any;
  connectedBy?: string;
  updatedAt?: any;
}

/** Normalized result every StorageProviderAdapter.upload() resolves to. */
export interface UploadResult {
  url: string;
  publicId: string;
  type: string;
  uploadedAt: string;
}

export type GradingSystem = 'waec' | 'percentage' | 'gpa4' | 'ib' | 'igcse' | 'alevel' | 'custom';

export const GRADING_SYSTEM_OPTIONS: { value: GradingSystem; label: string; description: string }[] = [
  { value: 'waec', label: 'WAEC / NECO (A1–F9)', description: 'Nigerian national grading — A1 ≥75, B2 ≥70 … F9 <40' },
  { value: 'percentage', label: 'Percentage (A+–F)', description: 'Letter grades from percentage score — A+ ≥90 … F <50' },
  { value: 'igcse', label: 'Cambridge IGCSE (A*–U)', description: 'International GCSE — A* ≥90, A ≥80 … U <20' },
  { value: 'alevel', label: 'Cambridge A-Level (A*–U)', description: 'A-Level — A* ≥90, A ≥80 … U <40' },
  { value: 'ib', label: 'IB (1–7)', description: 'International Baccalaureate 7-point scale' },
  { value: 'gpa4', label: 'GPA 4.0', description: 'American-style A–F mapped to 4.0 scale' },
  { value: 'custom', label: 'Custom Scale', description: 'Define your own grade boundaries in school settings' },
];

export interface CustomGradeScale {
  min: number;
  max: number;
  grade: string;
  label: string;
}

/** Grading rules for one school level (e.g. "Kindergarten", "Primary 1"), overriding the school-wide default. */
export interface LevelGradingOverride {
  gradingSystem: GradingSystem;
  customGradingScale?: CustomGradeScale[];
}

/**
 * Resolves which grading system/scale applies to a given class level, falling back to the
 * school-wide default when no override exists for that level (or no level is given).
 */
export function resolveGradingForLevel(
  level: string | undefined,
  defaultGradingSystem: GradingSystem,
  defaultCustomScale: CustomGradeScale[] | undefined,
  levelOverrides?: Record<string, LevelGradingOverride>
): { gradingSystem: GradingSystem; customGradingScale?: CustomGradeScale[] } {
  const override = level ? levelOverrides?.[level] : undefined;
  if (override) {
    return { gradingSystem: override.gradingSystem, customGradingScale: override.customGradingScale };
  }
  return { gradingSystem: defaultGradingSystem, customGradingScale: defaultCustomScale };
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
    case 'igcse':
      // Cambridge IGCSE (A*–U)
      if (total >= 90) return 'A*';
      if (total >= 80) return 'A';
      if (total >= 70) return 'B';
      if (total >= 60) return 'C';
      if (total >= 50) return 'D';
      if (total >= 40) return 'E';
      if (total >= 30) return 'F';
      if (total >= 20) return 'G';
      return 'U';
    case 'alevel':
      // Cambridge A-Level (A*–U)
      if (total >= 90) return 'A*';
      if (total >= 80) return 'A';
      if (total >= 70) return 'B';
      if (total >= 60) return 'C';
      if (total >= 50) return 'D';
      if (total >= 40) return 'E';
      return 'U';
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
 * A staff GPS check-in or check-out event.
 * Stored in Firestore: attendance_checkins (auto-ID, multiple events per day allowed).
 * Legacy teacher-only records used {uid}_{date}_{type} IDs — still readable.
 */
export interface TeacherCheckIn {
  id?: string;
  // Generalised fields (all staff)
  staffId: string;        // uid of any staff member
  staffName: string;      // display name
  staffRole: string;      // 'teacher' | 'admin' | 'hr' | 'accountant' | 'librarian' | …
  // Legacy fields kept for backward compat with existing teacher records
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
  autoDetected?: boolean; // true when fired by watchPosition crossing, false = manual button
  manualOverride?: boolean;
  overrideReason?: string;
  schoolId: string;
}

/** Parent-logged drop-off/pickup event — a simple timestamped log, no GPS/geofence. */
export interface PickupDropoffLog {
  id?: string;
  schoolId: string;
  parentUid: string;
  parentName: string;
  type: 'dropoff' | 'pickup';
  childIds: string[];
  childNames: string[];
  timestamp: any;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ─── Student Lifecycle & Alumni ───────────────────────────────────────────────

/** A single event in a student's lifecycle timeline */
export interface LifecycleEvent {
  id?: string;
  studentId: string;
  schoolId: string;
  type: 'enrolled' | 'promoted' | 'detained' | 'graduated' | 'withdrawn' | 'suspended' | 'reinstated' | 'note';
  title: string;
  description?: string;
  fromClass?: string;
  toClass?: string;
  session?: string;
  recordedBy?: string;
  createdAt: any;
}

/** Behavioral record — incident or commendation */
export interface BehavioralRecord {
  id?: string;
  studentId: string;
  schoolId: string;
  type: 'commendation' | 'warning' | 'suspension' | 'incident' | 'achievement';
  title: string;
  description: string;
  severity?: 'low' | 'medium' | 'high';
  recordedBy: string;
  date: string;
  createdAt: any;
}

/** Alumni profile — created when a student graduates */
export interface AlumniProfile {
  id?: string;
  studentId: string;
  schoolId: string;
  studentName: string;
  graduationYear: string;
  graduationClass: string;
  currentOccupation?: string;
  employer?: string;
  university?: string;
  course?: string;
  personalEmail?: string;
  phone?: string;
  linkedIn?: string;
  engagementStatus: 'active' | 'inactive' | 'lost_contact';
  totalDonations: number;
  donationNotes?: string;
  networkingNotes?: string;
  lastContactDate?: string;
  createdAt: any;
  updatedAt?: any;
}


// ─── Lesson Coverage ──────────────────────────────────────────────────────────

export type LessonStatus = 'completed' | 'not_completed' | 'partially_completed';
export type LessonType = 'regular' | 'cover';

export interface LessonCoverage {
  id?: string;
  schoolId: string;
  /** ISO date string: YYYY-MM-DD */
  date: string;
  session: string;
  term: string;
  className: string;
  subject: string;
  /** Period label, e.g. "Period 1" or a timetablePeriod slotId */
  period: string;
  topicCovered: string;
  lessonStatus: LessonStatus;
  lessonType: LessonType;
  teacherName: string;
  teacherId: string;
  remarks: string;
  recordedBy: string;
  recordedAt: any;
  /** curriculum_items doc ID that this lesson is linked to, null if free-text entry */
  curriculumItemId?: string | null;
}

// ─── Command Center: Tasks (super admin ops) ──────────────────────────────────

export type TaskCategory = 'Sales' | 'Marketing' | 'School Support' | 'Onboarding' | 'Billing' | 'Technical' | 'Content' | 'Product' | 'Internal';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskStatus = 'Backlog' | 'To Do' | 'In Progress' | 'Waiting' | 'Completed';

export interface CommandTask {
  id?: string;
  title: string;
  description?: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeUid?: string;
  assigneeName?: string;
  /** ISO date string: YYYY-MM-DD */
  dueDate?: string;
  relatedSchoolId?: string;
  relatedSchoolName?: string;
  relatedLeadId?: string;
  relatedLeadName?: string;
  notes?: string;
  createdBy: string;
  createdAt: any;
  updatedAt?: any;
  completedAt?: any;
}
