# AVENIR SIS — School Transport Management Module
## Comprehensive Architecture Audit & Design Document v1.0

> **Status:** Architecture approved — pending implementation sign-off  
> **Author:** Lead Software Architect  
> **Date:** 2026-07-02  
> **Scope:** Full system audit + transport module design + phased implementation plan

---

## TABLE OF CONTENTS

1. [Phase 1 — System Audit](#phase-1--system-audit)
   - [1.1 Authentication & Role System](#11-authentication--role-system)
   - [1.2 Database — Complete Collection Inventory](#12-database--complete-collection-inventory)
   - [1.3 Type System](#13-type-system)
   - [1.4 Notification System](#14-notification-system)
   - [1.5 GPS & Geofence Infrastructure](#15-gps--geofence-infrastructure)
   - [1.6 Parent Portal](#16-parent-portal)
   - [1.7 UI Patterns & Component Library](#17-ui-patterns--component-library)
   - [1.8 Finance Module](#18-finance-module)
   - [1.9 AI Service (Gemini)](#19-ai-service-gemini)
   - [1.10 School Settings](#110-school-settings)
   - [1.11 Application Routes](#111-application-routes)
   - [1.12 Firestore Composite Indexes](#112-firestore-composite-indexes)
   - [1.13 Staff Portal Layout](#113-staff-portal-layout)
   - [1.14 Mobile Architecture](#114-mobile-architecture)
2. [Phase 2 — Transport Module Design](#phase-2--transport-module-design)
   - [2.1 Positioning Within AVENIR Architecture](#21-positioning-within-avenir-architecture)
   - [2.2 New Firestore Collections](#22-new-firestore-collections)
   - [2.3 Firebase Realtime Database Schema](#23-firebase-realtime-database-schema)
   - [2.4 GPS Provider Abstraction Layer](#24-gps-provider-abstraction-layer)
   - [2.5 Boarding Verification Architecture](#25-boarding-verification-architecture)
   - [2.6 Notification Integration](#26-notification-integration)
   - [2.7 AI Integration](#27-ai-integration)
   - [2.8 Finance Integration](#28-finance-integration)
3. [Phase 3 — Implementation Plan](#phase-3--implementation-plan)
   - [3.1 New Firestore Composite Indexes](#31-new-firestore-composite-indexes)
   - [3.2 New Cloud Functions](#32-new-cloud-functions)
   - [3.3 New UI Screens](#33-new-ui-screens)
   - [3.4 New Roles and Permissions](#34-new-roles-and-permissions)
   - [3.5 Hardware Integrations](#35-hardware-integrations)
   - [3.6 Third-Party APIs](#36-third-party-apis)
   - [3.7 Security Considerations](#37-security-considerations)
   - [3.8 Nigerian Operational Context](#38-nigerian-operational-context)
   - [3.9 Scalability Strategy](#39-scalability-strategy)
   - [3.10 Development Milestones](#310-development-milestones)
4. [Integration Summary](#integration-summary)

---

## PHASE 1 — SYSTEM AUDIT

### 1.1 Authentication & Role System

**File:** `src/utils/permissions.ts`

#### Existing Roles (9)

| Role | Scope | Key Capabilities |
|---|---|---|
| `super_admin` | Platform | Manages all schools; bypasses all other checks via `hasPermission()` line 87; `platform.manage` permission |
| `admin` | School | Full school control: finance, payroll, admissions, students, grades, attendance, exams, timetable, curriculum, staff, notifications, settings, users |
| `School_admin` | School | Identical capabilities to `admin`; treated identically by `isAdmin()` rule |
| `teacher` | School | `students.read`, `grades.write`, `attendance.write`, `exams.create`, `curriculum.write`, `messages.send`, `library.read` |
| `accountant` | School | `finance.read/write`, `payroll.read/process`, `expenses.write`, `messages.send` |
| `hr` | School | `staff.read/manage`, `leave.approve`, `payroll.input`, `messages.send` |
| `librarian` | School | `library.read/write/circulate`, `messages.send` |
| `parent` | School | `students.read` (own children only), `messages.send`, `library.read` |
| `student` | School | `students.read`, `messages.send`, `library.read` |
| `applicant` | School | No permissions |

#### RBAC Mechanics

- **Per-user overrides:** Stored in `users/{uid}.permissions[]` as `"<resource>.<action>"` strings (e.g. `"finance.write"`). Additive only — extends role defaults, never replaces.
- **Client-side enforcement:** `ProtectedRoute` in `App.tsx` (lines 107–212) gates routes by role/roles/permission. Multi-role support via `roles` prop. Finance routes use `allowFinanceRoles` prop grouping `['admin', 'School_admin', 'accountant']`.
- **Impersonation:** When super_admin impersonates, routes check the *impersonated* profile's role, not real super_admin.

#### Key Helper Functions

```typescript
hasPermission(profile, perm)        // true if role default OR per-user override includes perm
effectivePermissions(profile)       // union of role defaults + per-user overrides (deduped)
grantablePermissions(role)          // permissions available for override UI (excludes role defaults)
```

#### Firestore Rules Mirror

```javascript
function isAdmin() {
  return isActiveAccount() &&
    userProfile().role in ['admin', 'School_admin'] &&
    userProfile().schoolId != null;
}
// Users can only read peers in their own school OR their own profile
// Admins can create non-admin accounts only within their school
// Reserved emails must be super_admin only
```

**Critical gap identified:** No `transport_manager` or `driver` role exists. Transport requires two new roles.

---

### 1.2 Database — Complete Collection Inventory

**53 Firestore collections.** All are multi-tenant via `schoolId`. Every collection has at least one `(schoolId ASC, X)` composite index. Firebase Realtime Database (RTDB) is **not yet used**.

#### Core Academic

| Collection | Key Fields |
|---|---|
| `students` | `schoolId`, `studentName`, `email`, `phone`, `dob`, `gender`, `nin`, `currentClass`, `guardianEmail`, `guardianUserId`, `homeAddress`, `medicalConditions`, `bloodGroup`, `admissionStatus` |
| `classes` | `schoolId`, `name`, `level`, `formTutorId`, `academicSession`, `googleCourseId` |
| `class_subjects` | `schoolId`, `classId`, `subjectName`, `teacherId`, `teacherName` |
| `subjects` | `schoolId`, `name`, `code`, `level` |
| `grades` | `schoolId`, `studentId`, `subject`, `class`, `term`, `session`, `caScore`, `examScore`, `totalScore`, `grade`, `subjectPosition` |
| `student_skills` | `studentId`, `class`, `term`, `session`, `skills` (punctuality, neatness, cooperation, honesty, sports, creativity) |

#### Attendance

| Collection | Key Fields |
|---|---|
| `attendance` | `schoolId`, `studentId`, `date`, `status` ('present'\|'absent'\|'late'), `class`, `recordedBy` |
| `attendance_checkins` | `schoolId`, `staffId`, `staffName`, `staffRole`, `teacherId` (legacy), `type` ('check_in'\|'check_out'), `date`, `timestamp`, `lat`, `lng`, `accuracy`, `withinFence`, `spoofDetected`, `autoDetected` |

#### Admissions Pipeline

| Collection | Key Fields |
|---|---|
| `applications` | `schoolId`, `applicantName`, `email`, `status` ('pending'\|'reviewing'\|'approved'\|'rejected'), `applicantUid`, `directAdmission` |
| `guardians` | `schoolId`, `fullName`, `email`, `phone`, `relationship`, `userId`, `studentIds[]`, `linkedChildren[]` |

#### Academic Planning

| Collection | Key Fields |
|---|---|
| `timetables` | `schoolId`, `class`, `term`, `session`, `schedule` (map of day → periods[]) |
| `curriculum_documents` | `schoolId`, `fileName`, `subject`, `level`, `uploadedBy`, `summary` (keyTopics, learningObjectives, assessmentFocus, rawSummary) |
| `curriculum_items` | `schoolId`, `subject`, `level`, `term`, `topic`, `objective`, `completed`, `source` ('manual'\|'nerdc'\|'ai_document') |
| `question_bank` | `schoolId`, `subject`, `level`, `topic`, `questionText`, `options[]`, `correctAnswer`, `difficulty` |
| `cbt_exams` | `schoolId`, `title`, `subject`, `targetClass`, `durationMinutes`, `questionCount`, `passMark`, `shuffleQuestions`, `status` ('draft'\|'active'\|'closed'), `type` ('entrance'\|'internal') |
| `cbt_sessions` | `schoolId`, `examId`, `studentId`, `questions[]`, `answers{}`, `startedAt`, `submittedAt`, `score`, `status` |
| `exams` | `schoolId`, `date`, `examName` |
| `exam_seating` | `examName`, `hallName`, `studentId`, `seatNumber`, `date` |

#### Communications

| Collection | Key Fields |
|---|---|
| `messages` | `schoolId`, `senderId`, `senderName`, `receiverId`, `content`, `timestamp`, `read` |
| `notifications` | `schoolId`, `recipientId`, `title`, `body`, `type`, `read`, `link` |
| `notification_broadcasts` | `schoolId`, `createdAt` |
| `fcm_tokens` | `uid`, `token`, `platform`, `updatedAt` |
| `whatsapp_logs` | `schoolId`, `sentAt` |

#### Finance

| Collection | Key Fields |
|---|---|
| `invoices` | `schoolId`, `studentId`, `amount`, `description`, `dueDate`, `status` ('pending'\|'awaiting_confirmation'\|'paid'\|'overdue'\|'cancelled'), `term`, `session`, `paystackReference` |
| `fee_payments` | `schoolId`, `invoiceId`, `studentId`, `amount`, `paymentMethod` ('cash'\|'bank_transfer'\|'card'\|'other'), `date`, `status` ('pending'\|'confirmed'\|'rejected') |
| `fee_categories` | `schoolId`, `name`, `defaultAmount` |
| `fee_templates` | `schoolId`, `name`, `amount`, `target` ('class'\|'everyone'), `term` |
| `expenses` | `schoolId`, `category` ('salary'\|'maintenance'\|'supplies'\|'utility'\|'other'), `amount`, `description`, `date`, `recordedBy` |
| `payments` | `schoolId` (general payment ledger) |

#### HR & Payroll

| Collection | Key Fields |
|---|---|
| `staff` | `schoolId`, `staffName`, `email`, `phone`, `role`, `subject`, `basicSalary`, `allowances`, `userId` |
| `payroll` | `schoolId`, `staffId`, `month`, `basicSalary`, `allowances`, `grossPay`, `pension`, `paye`, `netPay`, `status` |
| `leave_requests` | `schoolId`, `staffId`, `type`, `startDate`, `endDate`, `reason`, `status` |
| `leave_entitlements` | `schoolId`, `year` |
| `hr_policies` | `schoolId` |
| `onboarding_records` | `schoolId` |

#### Library

| Collection | Key Fields |
|---|---|
| `library_books` | `schoolId` |
| `library_circulation` | `schoolId`, `status` |

#### School Config & Platform

| Collection | Key Fields |
|---|---|
| `schools` | `name`, `adminEmail`, `status`, `subscriptionPlan`, `maxStudents`, `maxStaff`, `country`, `timezone`, `urlSlug` |
| `school_settings` | 80+ branding/academic fields (see §1.10) |
| `school_slugs` | slug → schoolId reverse lookup |
| `geofences` | `schoolId`, `lat`, `lng`, `radius` (metres) |
| `storage_settings` | `schoolId`, `provider` ('cloudinary'\|'firebase'\|'s3'\|'supabase') |
| `users` | `uid`, `email`, `role`, `displayName`, `schoolId`, `disabled`, `linkedStudentIds[]`, `permissions[]` |

#### Audit & Compliance

| Collection | Key Fields |
|---|---|
| `audit_log` | `schoolId`, `action`, `createdAt` |
| `lifecycle_events` | `schoolId`, `studentId`, `type` ('enrolled'\|'promoted'\|'graduated'\|'withdrawn'\|'suspended') |
| `behavioral_records` | `schoolId`, `studentId`, `type`, `severity` |
| `alumni_profiles` | `schoolId`, `studentId`, `graduationYear`, `engagementStatus` |

#### Other Collections

`cover_assignments`, `school_trips`, `trip_registrations`, `absence_requests`, `events`, `platform_invoices`, `pins`, `promotions`, `impersonation_logs`, `demo_requests`, `_connection_test_`

---

### 1.3 Type System

**File:** `src/types.ts`

#### Core Interfaces

```typescript
interface UserProfile {
  uid: string;
  email: string;
  role: 'admin'|'School_admin'|'super_admin'|'applicant'|'student'|
        'teacher'|'parent'|'accountant'|'hr'|'librarian'|'staff';
  displayName: string;
  photoUrl?: string;
  disabled?: boolean;
  schoolId?: string;
  linkedStudentIds?: string[];
  linkedChildren?: { studentId: string; studentName: string; currentClass: string }[];
  permissions?: string[];            // "<resource>.<action>" additive overrides
  mustChangePassword?: boolean;
  syntheticLogin?: boolean;
  notificationPrefs?: { attendance?: boolean; fees?: boolean; general?: boolean };
  deletedAt?: any;
}

interface Student {
  id?: string;
  schoolId?: string;
  studentName: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  nin: string;
  currentClass: string;
  studentId: string;                 // Formatted ID (e.g. STU-2026-001)
  enrolledAt: any;
  photoUrl?: string;
  guardianEmail?: string;
  guardianUserId?: string;           // Linked parent's Firebase UID
  guardian2Name?: string;
  guardian2Phone?: string;
  homeAddress?: string;
  medicalConditions?: string;
  bloodGroup?: string;
  allergies?: string;
  admissionStatus?: 'active'|'graduated'|'withdrawn'|'suspended';
}

interface GeoFence {
  id?: string;
  lat: number;
  lng: number;
  radius: number;                    // Metres
  schoolName?: string;
  updatedAt?: any;
  updatedBy?: string;
}

interface TeacherCheckIn {
  id?: string;
  staffId: string;                   // Generalized from teacherId
  staffName: string;
  staffRole: string;
  teacherId: string;                 // Legacy compat
  teacherName: string;               // Legacy compat
  type: 'check_in'|'check_out';
  date: string;                      // YYYY-MM-DD
  timestamp: any;
  lat: number;
  lng: number;
  accuracy: number;
  withinFence: boolean;
  spoofDetected?: boolean;
  autoDetected?: boolean;
  schoolId: string;
}
```

#### Finance Interfaces

```typescript
interface Invoice {
  id?: string;
  studentId: string;
  amount: number;
  status: 'pending'|'awaiting_confirmation'|'paid'|'overdue'|'cancelled';
  term: '1st Term'|'2nd Term'|'3rd Term';
  session: string;
  paystackReference?: string;
  schoolId?: string;
}

interface Expense {
  id?: string;
  category: 'salary'|'maintenance'|'supplies'|'utility'|'other';
  amount: number;
  description: string;
  date: string;
  recordedBy: string;
}
```

#### Key Constants

```typescript
SUBJECTS      // 27 subjects (Mathematics, English Language, Biology, etc.)
SCHOOL_CLASSES // 14 classes: Kindergarten → SSS 3
TERMS         // ['1st Term', '2nd Term', '3rd Term']
CURRENT_SESSION // '2025/2026'
```

#### Grading Systems

`'waec'` (A1–F9) | `'percentage'` (A+–F) | `'igcse'` | `'alevel'` | `'ib'` (1–7) | `'gpa4'` | `'custom'`

---

### 1.4 Notification System

**File:** `src/services/notificationService.ts`

#### Active Channels

| Channel | Implementation | Status |
|---|---|---|
| **In-app** | `notifications` Firestore collection + `NotificationBell` component | ✅ Live |
| **FCM Push** | `initFCMForUser()`, `onForegroundMessage()`, `fcm_tokens` collection | ✅ Live |
| **WhatsApp** | `WhatsAppNotifications.tsx` + `whatsapp_logs` collection | ✅ Live |
| **SMS** | Not yet implemented | 🔲 Planned |
| **Email** | Not yet implemented | 🔲 Planned |

#### Notification Type Enum (current)

```typescript
type NotificationType =
  | 'fee_due' | 'exam' | 'attendance' | 'general'
  | 'message' | 'grade' | 'assignment';
```

*Transport adds 6 new types — see §2.6.*

#### FCM Functions

```typescript
initFCMForUser(uid: string): Promise<string | null>
// Requests permission → retrieves token → stores in fcm_tokens/{uid}

onForegroundMessage(callback: ({ title, body, data }) => void): Promise<() => void>
// Listens for incoming FCM messages while app is open
```

#### Notification Payload Shape

```typescript
interface NotifyOptions {
  category: 'check_in'|'check_in_out_of_fence'|'check_out'|
            'idle_class'|'absence_alert'|'fcm_push';
  title: string;
  body: string;
  url?: string;    // Deep link
  urgent?: boolean; // Sets requireInteraction
}
```

#### Pre-Built Notification Functions

```typescript
notifyCheckIn(teacherName, time, withinFence)   // GPS attendance check-in
notifyCheckOut(teacherName, time)                // GPS attendance check-out
notifyIdleClass(className, subject, teacher, minutesLate) // Unattended class (urgent)
notifyAbsence(teacherName)                       // Teacher absence (urgent)
showFcmPushNotification(title, body)             // Generic FCM relay
```

---

### 1.5 GPS & Geofence Infrastructure

**File:** `src/services/geofenceService.ts`

#### Core Functions

```typescript
haversineDistance(lat1, lng1, lat2, lng2): number
// Haversine great-circle distance in metres (EARTH_RADIUS_M = 6,371,000)

isWithinFence(lat, lng, fence: GeoFence): boolean
// Returns true if distance from point to fence centre ≤ fence.radius

isAccuracyAcceptable(accuracy: number): boolean
// MAX_ACCEPTABLE_ACCURACY_M = 150 — rejects imprecise GPS readings

isSpoofedVelocity(current, previous): boolean
// MAX_PLAUSIBLE_SPEED_MS = 55 (~200 km/h) — flags teleportation attacks
// Also flags if timestamp went backwards

getCurrentPosition(): Promise<GpsResult>
// Strategy: High-accuracy (30s timeout, 60s cache) →
//   on timeout: retry with Wi-Fi fallback (15s timeout, 120s cache)
// Returns { lat, lng, accuracy, timestamp }
```

#### Current Usage

- All existing GPS is **browser-based** via `navigator.geolocation` (user's phone)
- `geofences` collection stores school boundary (single radial fence per school)
- Used by: `TeacherPortal.tsx` (watchPosition for staff attendance), `Layout.tsx` (TeacherPresenceBadge)

#### Critical Finding for Transport

> Bus GPS comes from **hardware devices installed in vehicles** — a fundamentally different integration from the browser-based staff attendance GPS. The transport module extends this service with a provider abstraction layer (§2.4) without modifying any existing functions.

---

### 1.6 Parent Portal

**File:** `src/pages/ParentPortal.tsx`

#### Child Linkage Strategy (Two-Pass)

1. Match `students.guardianEmail == user.email`
2. Match `students.guardianUserId == user.uid`
3. Merge & deduplicate by studentId

#### Current Tabs

`progress` | `attendance` | `assignments` | `absences` | `finance` | `messages` | `notifications` | `report_card`

**Transport adds a 9th tab: `transport`** — slots in without modifying existing tabs.

#### Collections Read by Parent Portal

```
students          (guardianEmail / guardianUserId filter)
grades            (studentId filter)
attendance        (studentId filter)
assignments       (class filter)
assignment_submissions (studentId filter)
messages          (receiverId filter)
invoices          (studentId filter)
fee_payments      (studentId filter)
notifications     (recipientId filter)
```

#### Finance Integration

- Paystack card payment → auto-confirms as `'paid'`
- Bank/cash → parent declares → `'awaiting_confirmation'` → admin approves in `FinancialManagement`

---

### 1.7 UI Patterns & Component Library

#### Core Libraries

| Library | Version | Purpose |
|---|---|---|
| Tailwind CSS | v4 | All styling (utility-first) |
| Lucide React | latest | All icons exclusively |
| Recharts | v3 | Charts (Bar, Line, Pie, Area) |
| Framer Motion (`motion/react`) | v12 | Animations |
| react-hot-toast | v2 | Toast notifications |

#### Layout Components

| Component | Used By | Description |
|---|---|---|
| `Layout.tsx` | Admin, Teacher, Parent (desktop) | Sidebar + top bar, responsive |
| `StaffLayout.tsx` | Accountant, HR, Librarian | Slim focused sidebar, role nav |
| `MobileShell.tsx` | All roles (mobile PWA) | Bottom tab bar, install prompts, offline banner |

#### Card Pattern

```html
<div class="group block p-5 rounded-2xl bg-white border border-slate-200
            hover:border-indigo-300 hover:shadow-md transition-all">
```

#### Status Badge Pattern

```html
<span class="bg-{color}-50 text-{color}-700 border border-{color}-100 rounded-full px-2 py-0.5 text-xs font-bold">
```

| State | Color |
|---|---|
| Pending | `amber` |
| Approved / Active | `emerald` |
| Rejected / Error | `rose` |
| Reviewing / In Progress | `blue` |
| Info | `indigo` |
| Warning | `orange` |

#### StatCard Pattern (HrPortal.tsx)

```html
<div class="rounded-2xl border p-5 bg-{tone}-50 text-{tone}-700 border-{tone}-100">
  <p class="text-3xl font-extrabold">{value}</p>
</div>
```

#### Module Category Colors (AdminDashboard.tsx)

| Category | Border | Background | Label |
|---|---|---|---|
| Academic | `border-blue-200` | `bg-blue-50` | `text-blue-700` |
| Finance & HR | `border-emerald-200` | `bg-emerald-50` | `text-emerald-700` |
| Admissions | `border-indigo-200` | `bg-indigo-50` | `text-indigo-700` |

#### Mobile Role Colors (MobileShell.tsx)

```typescript
admin:   'from-indigo-600 to-violet-600'
teacher: 'from-emerald-500 to-teal-600'
parent:  'from-sky-500 to-blue-600'
// transport_manager: 'from-orange-500 to-amber-600' (proposed)
// driver:            'from-teal-500 to-cyan-600'    (proposed)
```

#### StaffLayout Sidebar (Dark)

```
bg-slate-900 text-white (w-64)
Active link:   bg-indigo-600 text-white shadow-lg shadow-indigo-600/30
Inactive link: text-white/70 hover:bg-white/5 hover:text-white
```

---

### 1.8 Finance Module

**File:** `src/pages/FinancialManagement.tsx`

#### Collections Used

`invoices`, `fee_payments`, `expenses`, `students`, `fee_categories`, `fee_templates`

#### Tab Structure

```
overview    → KPIs (pending/paid/overdue), pie & bar charts
invoices    → CRUD; bulk-create from template; mark overdue
pending     → Unconfirmed bank/cash payments awaiting approval
templates   → Save/reuse bulk-create configs
payments    → Payment record history; filter by method/status
expenses    → Operational costs (salary, maintenance, supplies, utility, other)
```

#### Current Expense Categories

```typescript
category: 'salary' | 'maintenance' | 'supplies' | 'utility' | 'other'
```

**Gap:** No `'transport'` category. Transport fuel and maintenance have vehicle-specific data (busId, odometer, litres, driver) that the generic `expenses` shape cannot capture. Solution: separate transport collections with monthly rollup into `expenses` for school-wide reporting (§2.8).

#### AI Integration

```typescript
generateFeeReminderDraft(studentName, guardianName, amount, description, dueDate, daysOverdue?)
// Returns formal 2–3 paragraph reminder letter
```

---

### 1.9 AI Service (Gemini)

**File:** `src/services/geminiService.ts`

**SDK:** `@google/genai` · **Models:** `gemini-2.5-flash` (primary), `gemini-2.5-flash-lite` (lighter tasks)

#### Existing Functions

| Function | Output Type | Purpose |
|---|---|---|
| `generateLessonNotes(subject, topic, level)` | Markdown string | NERDC-aligned lesson notes |
| `generateExamQuestions(subject, topic, count)` | JSON array | MCQ with A–D options |
| `suggestGradingComment(score, subject, studentName?)` | Plain text | 2–3 sentence feedback |
| `generateReportSummary(studentName, grades, attendanceRate)` | Plain text | Principal's report card comment |
| `generatePayrollSummary(month, totalStaff, totalGross, ...)` | Plain text | Finance report paragraph |
| `suggestAttendanceAlert(studentName, rate, totalAbsent)` | Plain text | Parent SMS draft |
| `generateCurriculumObjective(subject, topic, level)` | Plain text | Single learning objective |
| `generateStudentInsights(studentName, class, grades, ...)` | JSON object | `{ overallRemark, strengths[], weaknesses[], recommendations[], trend, riskLevel }` |
| `summarizeCurriculumDocument(text, subject, level)` | JSON object | `{ keyTopics[], learningObjectives[], assessmentFocus[], rawSummary }` |
| `generateQuestionsFromCurriculum(...)` | JSON array | Curriculum-aligned questions |
| `generateFeeReminderDraft(...)` | Plain text | Formal fee reminder letter |
| `mapColumnsToStudentFields(headers)` | JSON map | Smart CSV column mapper |

#### Pattern for Transport AI Extensions

```typescript
// All new functions follow this pattern
export async function functionName(params): Promise<ReturnType> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: 'Nigerian school context instruction...',
      responseMimeType: 'application/json', // for structured outputs
    },
  });
  // Parse, validate, return (with null/default on error)
}
```

---

### 1.10 School Settings

**File:** `src/pages/SchoolSettings.tsx` · **Storage:** `school_settings/{schoolId}`

#### Key Config Fields (80+)

```typescript
// Identity & Branding
schoolName, address, phone, email, logoUrl, faviconUrl
primaryColor, secondaryColor, sidebarStyle ('dark'|'light'|'brand'|'minimal')
appDisplayName, fontFamily, urlSlug

// Academic
currentSession, currentTerm, examLocked
schoolLevels[], customSubjects[], timetablePeriods[]
gradingSystem, customGradingScale[], levelGradingOverrides{}

// Locale
country, timezone, locale, currency ('NGN' default), phoneCountryCode ('+234' default)
nationalIdLabel  // 'NIN' in Nigeria

// Report Cards
reportShowLogo, reportFooterText, reportCardShowPhoto
principalName, motto, stampImageUrl

// Public Landing Page
schoolDescription, socialLinks{}, applicationIntroText, applicationDeadline
heroBannerImageUrl, loginBgImageUrl, loginWelcomeText
```

**Transport addition:** `transport_settings` collection (separate, see §2.2) to avoid bloating `school_settings`.

---

### 1.11 Application Routes

**File:** `src/App.tsx` · **Total:** 60+ routes

#### Route Namespaces

```
/                     Public landing
/s/:schoolId          Per-school public pages
/super-admin          Platform admin (lazy-loaded)
/admin                School admin portal (30+ sub-routes)
/teacher              Teacher portal
/parent               Parent portal
/accountant           Accountant portal (StaffLayout)
/hr                   HR portal (StaffLayout, 5 sub-routes)
/library              Librarian portal (StaffLayout, 3 sub-routes)
/calendar             Shared calendar (all roles)
/profile              Self-service profile (all roles)
/mobile/*             Mobile PWA quick-action pages
/cbt/:sessionId       Full-screen CBT exam engine
```

#### ProtectedRoute Variants

```jsx
<ProtectedRoute role="admin" />                          // admin|School_admin only
<ProtectedRoute roles={["hr", "admin", "School_admin"]}/>  // any of these roles
<ProtectedRoute allowFinanceRoles />                     // accountant|admin|School_admin
<ProtectedRoute superAdminOnly />                        // super_admin only
<ProtectedRoute />                                       // any authenticated user
```

#### Layout Wrappers

```jsx
<Layout>              // Main sidebar; responsive admin/teacher/parent desktop
<StaffLayout role>    // Slim staff sidebar; accountant/HR/librarian
// No wrapper         // Full-screen: CBT, mobile PWA pages
```

---

### 1.12 Firestore Composite Indexes

**File:** `firestore.indexes.json` · **Total:** 47 composite indexes

#### Pattern

Every school-scoped collection has at minimum one `(schoolId ASC, X)` index. Common patterns:

```json
(schoolId ASC, createdAt DESC)   → Recent items
(schoolId ASC, status ASC, X)    → Filtered by status
(schoolId ASC, studentId ASC, X) → Student-scoped
(schoolId ASC, date ASC/DESC)    → Time-series
```

#### Collections With Existing Indexes

`students` (5) · `grades` (2) · `attendance` (3) · `invoices` (4) · `assignments` (2) · `messages` (2) · `applications` (2) · `classes` (1) · `notifications` (3) · `payroll` (2) · `staff` (1) · `behavioral_records` (2) · `curriculum_documents` (2) · `fee_categories` (1) · `audit_log` (2) · `cbt_exams` (2) · and 14 more.

---

### 1.13 Staff Portal Layout

**File:** `src/components/StaffLayout.tsx`

#### Role-Specific Navigation (existing)

**Accountant:** Overview → Invoices & Payments → Payroll → Reports  
**HR:** Dashboard → Staff Directory → Leave Requests → Onboarding → Policies  
**Librarian:** Dashboard → Catalog → Issue/Return → Fines

#### Layout Structure

```
Desktop (lg+):   Fixed sidebar (w-64, bg-slate-900) + flex-1 main content
Mobile (<lg):    Drawer sidebar (fixed, z-50) + overlay + top bar with hamburger
```

Sidebar anatomy:
- **Header:** Logo or role icon + school name + role label (`text-[10px] uppercase`)
- **Nav:** `flex-1 overflow-y-auto p-3 space-y-1`
- **Footer:** User avatar + display name + role + logout button

**Transport adopts this layout verbatim** with a new `role="transport_manager"` variant.

---

### 1.14 Mobile Architecture

**File:** `src/components/MobileShell.tsx` · **Pages:** `src/pages/mobile/`

#### MobileShell Features

- Sticky top bar (h-14): logo, school name, role, install button, avatar, logout
- **Back chevron** when on off-tab routes (e.g. `/calendar`, `/profile`)
- iOS install hint (dismissible)
- Offline banner (`useOfflineStatus()`)
- `pb-20` main content padding for bottom bar
- Fixed bottom tab bar (h-16, `max-w-md`, safe-area-bottom)

#### Current Mobile Pages

```
/mobile/admin    → AdminMobileDashboard (pending apps, overdue fees, notifications)
/mobile/teacher  → TeacherMobileAttendance (mark class attendance fast)
/mobile/parent   → ParentMobileHome (child grades/fees/notifications at a glance)
```

**Transport adds:** `/mobile/driver` — trip management, QR boarding scanner, incident logging.

#### PWA Hooks

```typescript
const { canInstall, isIOS, isInstalled, promptInstall } = usePWAInstall();
```

---

## PHASE 2 — TRANSPORT MODULE DESIGN

### 2.1 Positioning Within AVENIR Architecture

The Transport module is an **independent sub-system** that integrates with — but never duplicates — five existing modules:

| Existing Module | Integration Point | Mechanism |
|---|---|---|
| Student Management | Bus assignments reference `students/{id}` | Foreign key via `studentId` — no data duplication |
| Parent Portal | New "Transport" tab in `ParentPortal.tsx` | Reads from `transport_*` collections |
| Notifications | Bus events fire existing notification pipeline | Write to `notifications` + FCM + WhatsApp |
| Finance | Monthly transport costs roll up to reporting | Separate collections; Cloud Function aggregates to `expenses` |
| Attendance | Boarding events optionally generate attendance records | Cross-reference, not duplication |

#### What Is NOT Duplicated

- Student profiles → only referenced by `studentId`
- Parent contacts → read from `students.guardianPhone/guardianUserId`
- Notification delivery → existing `notifications` collection and FCM pipeline
- Geofence math → existing `haversineDistance()` and `isWithinFence()` reused as-is

---

### 2.2 New Firestore Collections (10)

#### `transport_buses`

```typescript
{
  schoolId: string
  plateNumber: string             // Vehicle registration e.g. 'LND 234 AB'
  make: string                    // e.g. 'Toyota'
  model: string                   // e.g. 'Coaster'
  year: number
  colour: string
  capacity: number                // Seat count
  driverId: string | null         // → transport_drivers/{id}
  conductorId: string | null
  routeId: string | null          // → transport_routes/{id}
  insuranceExpiry: string         // ISO date YYYY-MM-DD
  lastServiceDate: string
  nextServiceDue: string          // Auto-computed from service interval
  status: 'active' | 'inactive' | 'maintenance' | 'decommissioned'
  fuelType: 'petrol' | 'diesel' | 'CNG' | 'electric'
  currentOdometer: number         // km
  gpsDeviceId: string | null      // Hardware device serial/identifier
  gpsProvider: string | null      // 'rtdb' | 'traccar' | 'google_fleet'
  gpsDeviceApiKey: string | null  // Stored encrypted server-side only
  photoUrl: string | null
  notes: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

#### `transport_drivers`

```typescript
{
  schoolId: string
  userId: string | null           // → users/{uid} if has app login
  displayName: string
  phone: string
  email: string
  photoUrl: string | null
  licenseNumber: string
  licenseClass: string            // 'B' | 'C' | 'D' | 'E' (Nigerian categories)
  licenseExpiry: string           // ISO date
  nin: string                     // National Identification Number
  address: string
  assignedBusId: string | null    // → transport_buses/{id}
  emergencyContactName: string
  emergencyContactPhone: string
  hiredAt: string                 // ISO date
  status: 'active' | 'suspended' | 'on_leave' | 'terminated'
  performanceScore: number        // 0–100, computed from incidents + trips
  totalTrips: number              // Running count
  totalIncidents: number          // Safety incident count
  notes: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

#### `transport_routes`

```typescript
{
  schoolId: string
  name: string                    // e.g. 'Route A — Lekki Phase 1'
  description: string
  busId: string | null            // → transport_buses/{id}
  driverId: string | null
  morningDepartureTime: string    // 'HH:MM' from school
  afternoonDepartureTime: string  // 'HH:MM' from school
  estimatedDurationMin: number
  distanceKm: number
  stops: TransportStop[]          // Ordered array (embedded, not subcollection)
  status: 'active' | 'inactive' | 'suspended'
  campus: string | null           // For multi-campus schools
  colour: string                  // Hex for map visualisation
  studentCount: number            // Denormalized for dashboard
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Embedded stop shape
interface TransportStop {
  stopId: string                  // UUID generated client-side
  name: string                    // e.g. 'Chevron Roundabout'
  address: string
  lat: number
  lng: number
  sequence: number                // Ordered pickup sequence
  estimatedArrival: string        // 'HH:MM' offset from departure
}
```

#### `transport_route_students`

One doc per student enrolled in transport:

```typescript
{
  schoolId: string
  studentId: string               // → students/{id}
  studentName: string             // Denormalized for queries
  studentClass: string            // Denormalized
  routeId: string                 // → transport_routes/{id}
  pickupStopId: string            // stopId within route.stops[]
  dropoffStopId: string
  parentPhone: string             // Primary contact for bus alerts
  parentPhone2: string | null     // Secondary contact
  whatsappEnabled: boolean
  smsEnabled: boolean
  pushEnabled: boolean
  morningTransport: boolean
  afternoonTransport: boolean
  status: 'active' | 'suspended' | 'terminated'
  enrolledAt: Timestamp
  updatedAt: Timestamp
}
```

#### `transport_trips`

One document per route per run (AM/PM). Written at trip start; updated throughout:

```typescript
{
  schoolId: string
  routeId: string
  busId: string
  driverId: string
  conductorId: string | null
  date: string                    // YYYY-MM-DD
  tripType: 'morning_pickup' | 'afternoon_dropoff' | 'special'
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  departedAt: Timestamp | null
  completedAt: Timestamp | null
  startOdometer: number | null
  endOdometer: number | null
  studentsOnboard: number         // Live count (updated by boarding events)
  studentsBoarded: number         // Total who boarded during trip
  studentsDroppedOff: number      // Total dropped off
  incidentCount: number
  fuelUsedLitres: number | null   // Optional if fuel sensor available
  notes: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

#### `transport_boarding_events`

One event per student boarding or alighting action:

```typescript
{
  schoolId: string
  tripId: string                  // → transport_trips/{id}
  studentId: string               // → students/{id}
  studentName: string             // Denormalized
  busId: string
  routeId: string
  stopId: string
  eventType: 'boarded' | 'alighted' | 'missed_pickup' | 'unauthorized'
  verificationMethod: 'qr_scan' | 'rfid' | 'manual' | 'facial' | 'auto'
  recordedBy: string              // driverId or conductorId (uid)
  lat: number | null
  lng: number | null
  timestamp: Timestamp
  notificationSent: boolean
  alertType: string | null        // 'missed_pickup' | 'unauthorized' | null
}
```

**Immutability rule:** Boarding events cannot be deleted or modified by drivers. Admin/transport_manager may add `overrideNote` only. Safeguarding audit trail.

#### `transport_fuel_logs`

```typescript
{
  schoolId: string
  busId: string
  driverId: string | null
  date: string                    // YYYY-MM-DD
  litres: number
  costPerLitre: number
  totalCost: number
  odometer: number
  stationName: string
  receiptUrl: string | null       // Photo uploaded via Cloudinary
  fuelType: 'petrol' | 'diesel' | 'CNG'
  notes: string
  recordedBy: string              // staff uid
  createdAt: Timestamp
}
```

#### `transport_maintenance`

```typescript
{
  schoolId: string
  busId: string
  type: 'oil_change' | 'tyre_replacement' | 'brake_service' | 'engine_repair' |
        'body_repair' | 'electrical' | 'inspection' | 'scheduled_service' | 'other'
  description: string
  vendor: string                  // Mechanic/workshop name
  cost: number
  date: string                    // When service was done (YYYY-MM-DD)
  odometer: number
  nextDueDate: string | null      // YYYY-MM-DD
  nextDueOdometer: number | null
  status: 'scheduled' | 'in_progress' | 'completed' | 'overdue'
  invoiceUrl: string | null
  notes: string
  recordedBy: string              // staff uid
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

#### `transport_incidents`

```typescript
{
  schoolId: string
  busId: string
  tripId: string | null
  driverId: string
  date: string
  time: string                    // 'HH:MM'
  type: 'overspeeding' | 'harsh_braking' | 'route_deviation' |
        'unauthorized_stop' | 'accident' | 'breakdown' |
        'student_injury' | 'long_idling' | 'other'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  lat: number | null
  lng: number | null
  speed: number | null            // km/h at time of incident (if GPS-detected)
  autoDetected: boolean           // true if triggered by GPS threshold crossing
  resolved: boolean
  resolvedAt: Timestamp | null
  resolvedBy: string | null
  adminNotes: string
  attachmentUrl: string | null
  createdAt: Timestamp
}
```

#### `transport_settings` (keyed by schoolId)

```typescript
{
  schoolId: string
  speedLimitKmh: number           // Default 60; alert above this
  schoolZoneSpeedKmh: number      // Default 20 near school geofence
  idlingAlertMinutes: number      // Default 10
  stopGeofenceRadiusM: number     // Default 200 (proximity alert radius)
  boardingWindowMinutes: number   // How long stop remains "open"
  gpsUpdateIntervalSec: number    // How often device sends position (10–60)
  enableParentTracking: boolean   // Parents can see live bus on map
  enableSmsAlerts: boolean
  enableWhatsappAlerts: boolean
  enablePushAlerts: boolean
  maintenanceReminderDays: number // Alert N days before service due
  fuelAlertThresholdLitres: number
  campuses: {
    id: string
    name: string
    lat: number
    lng: number
  }[]
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

### 2.3 Firebase Realtime Database Schema

RTDB is used exclusively for **live bus position data**. Firestore's per-write billing and consistency model are unsuitable for position updates every 10–30 seconds. RTDB overwrites (not appends) are ideal for current position and provide low-latency fan-out to all subscribers.

```
bus_live/
  {schoolId}/
    {busId}/
      lat: number
      lng: number
      speed: number              // km/h
      heading: number            // degrees 0–360
      accuracy: number           // metres
      timestamp: number          // Unix ms
      status: 'moving' | 'stopped' | 'signal_lost' | 'offline'
      tripId: string | null
      studentsOnboard: number
      trail/                     // Ring buffer of last 20 positions
        {timestamp}/
          lat: number
          lng: number
          speed: number
```

#### RTDB Security Rules

```json
{
  "rules": {
    "bus_live": {
      "$schoolId": {
        ".read": "auth != null",
        "$busId": {
          ".write": "auth != null && (
            auth.token.role === 'transport_manager' ||
            auth.token.role === 'admin' ||
            auth.token.role === 'School_admin' ||
            auth.token.role === 'driver'
          )"
        }
      }
    }
  }
}
```

**Position data is written only by the `ingestBusPosition` Cloud Function** using the Admin SDK (bypasses rules). Client apps are read-only. No client ever writes directly to `bus_live/`.

---

### 2.4 GPS Provider Abstraction Layer

**New file:** `src/services/transport/gpsProvider.ts`

```typescript
interface GpsProvider {
  name: string;
  getBusPosition(busId: string): Promise<BusPosition | null>;
  subscribeToPosition(busId: string, cb: (pos: BusPosition) => void): () => void;
  getRouteHistory(busId: string, from: Date, to: Date): Promise<BusPosition[]>;
}

interface BusPosition {
  lat: number;
  lng: number;
  speed: number;          // km/h
  heading: number;        // degrees 0–360
  accuracy: number;       // metres
  timestamp: number;      // Unix ms
  status: 'moving' | 'stopped' | 'signal_lost' | 'offline';
}

function GpsProviderFactory {
  static create(providerName: string): GpsProvider
  // Reads transport_buses.gpsProvider and returns correct implementation
}
```

#### Concrete Implementations

| Provider | Status | Description |
|---|---|---|
| `FirebaseRTDBGpsProvider` | ✅ Build in M4 | Reads/subscribes from `bus_live/{schoolId}/{busId}` in RTDB |
| `TraccarGpsProvider` | 🔲 Future | Polls Traccar self-hosted API |
| `GoogleFleetGpsProvider` | 🔲 Future | Google Maps Platform Fleet Tracking |

Provider selection is per-bus from `transport_buses.gpsProvider`. UI and tracking logic never reference a specific provider directly. Swapping provider requires only changing that field and deploying a new implementation class — zero UI changes.

---

### 2.5 Boarding Verification Architecture

**New file:** `src/services/transport/boardingVerifier.ts`

```typescript
interface BoardingVerifier {
  method: 'qr_scan' | 'rfid' | 'manual' | 'facial';
  verify(input: string, tripId: string): Promise<BoardingResult>;
}

interface BoardingResult {
  success: boolean;
  studentId: string | null;
  studentName: string | null;
  isAuthorized: boolean;        // Student is assigned to this bus/route
  eventType: 'boarded' | 'alighted' | 'unauthorized';
  message: string;
}
```

#### Verification Methods

| Method | Technology | Platform Support | Priority |
|---|---|---|---|
| **QR Code** | Camera + `jsQR` library | All browsers with camera | M5 — Primary |
| **Manual** | Roster tap (list select) | All browsers | M5 — Always-available fallback |
| **NFC/RFID** | WebNFC API | Android Chrome 89+ only | M5 — iOS fallback to QR |
| **Facial Recognition** | Cloud Vision API / TF.js | Requires camera | Future |

#### QR Code Format

```
avenir-transport:{schoolId}:{studentId}:{hmacSHA256}
```

HMAC prevents screenshot replay attacks. Secret is school-specific, stored server-side. Generated by `generateQRCode` Cloud Function. Displayed in Parent Portal → Transport tab and printed on student ID card.

#### Boarding Flow

```
1. Driver opens boarding scanner on /mobile/driver
2. Camera scans QR → verifier resolves studentId + validates HMAC
3. System checks transport_route_students: is student on this bus today?
4. Writes transport_boarding_event (immutable)
5. Fires triggerBoardingAlert Cloud Function
6. Parent receives FCM push + WhatsApp notification
7. Live student count on bus updates in RTDB
```

---

### 2.6 Notification Integration

Transport hooks into the **existing** notification pipeline without creating a new service.

#### 6 New Notification Types

| Type | Trigger | Recipients | Urgency |
|---|---|---|---|
| `transport_boarding` | Student scanned onto bus | Parent(s) | Normal |
| `transport_dropoff` | Student scanned off at stop | Parent(s) | Normal |
| `transport_approaching` | Bus 200–500m from student's stop | Parent(s) | Normal |
| `transport_missed_pickup` | Bus departed stop; student not boarded | Parent(s) + Admin | High |
| `transport_delay` | Bus 5+ min behind ETA | All route parents + Admin | Normal |
| `transport_emergency` | Incident filed as `critical` or `high` | Admin + All route parents | Critical |

#### Delivery Cascade (per alert)

```
1. Write to notifications/{id}          → In-app bell updates live
2. Cloud Function → FCM API             → Push to parent's device
3. if whatsappEnabled → whatsapp_logs   → WhatsApp message
4. if smsEnabled → Termii/Twilio        → SMS fallback
```

#### Updated Notification Type Enum

```typescript
// src/types.ts — additive change, no existing types removed
type NotificationType =
  | 'fee_due' | 'exam' | 'attendance' | 'general'
  | 'message' | 'grade' | 'assignment'
  // Transport additions:
  | 'transport_boarding'
  | 'transport_dropoff'
  | 'transport_approaching'
  | 'transport_missed_pickup'
  | 'transport_delay'
  | 'transport_emergency';
```

---

### 2.7 AI Integration

Extends `src/services/geminiService.ts` following the existing pattern precisely:

| Function | Input | Output | Model |
|---|---|---|---|
| `suggestRouteOptimization(stops[], trafficContext)` | Ordered stops array | Reordered stops + estimated time/fuel savings | `gemini-2.5-flash` |
| `predictFuelConsumption(fuelLogs[], avgKm, routes[])` | Historical fuel data | Predicted litres + cost next 30 days | `gemini-2.5-flash` |
| `predictMaintenanceNeeds(maintenance[], odometer, busAge)` | Maintenance history | Risk items list + recommended service dates | `gemini-2.5-flash` (JSON) |
| `analyzeDriverBehavior(incidents[], trips[], driverId)` | Incident + trip data | Performance summary + coaching recommendations | `gemini-2.5-flash` |
| `generateTransportReport(tripStats, costs, incidents, month)` | Aggregated stats | 3-paragraph executive narrative | `gemini-2.5-flash` |
| `detectAnomalousRoute(gpsTrail, plannedRoute)` | GPS positions | Deviation description + severity | `gemini-2.5-flash` (JSON) |

All functions include Nigerian context in `systemInstruction`:
- Lagos traffic patterns
- Nigerian road quality classifications
- Local fuel price context (per-litre ₦)
- School bus regulatory requirements (Nigerian Highway Code)

---

### 2.8 Finance Integration

#### Design Decision: Separate Collections + Monthly Rollup

**Option A** (rejected): Add transport categories to existing `expenses`. Loses vehicle-specific data (busId, odometer, driver, litres).

**Option B** (adopted): Separate `transport_fuel_logs` and `transport_maintenance` collections → Cloud Function aggregates to `expenses` monthly.

#### Monthly Rollup Cloud Function (`monthlyTransportRollup`)

Runs on last day of each month:
```
1. Aggregate transport_fuel_logs by schoolId for the month
2. Aggregate transport_maintenance costs by schoolId for the month
3. Sum both → create expense record in 'expenses' collection:
   { schoolId, category: 'transport', amount: totalCost,
     description: 'Transport: fuel + maintenance (Month YYYY)',
     date: lastDayOfMonth, recordedBy: 'system' }
4. This feeds into existing AnalyticsDashboard.tsx finance charts
```

#### Transport Finance Dashboard Metrics

- Fuel spend by bus (Recharts BarChart)
- Maintenance cost by bus (Recharts BarChart)
- Cost per kilometre per route: `totalCost / (distanceKm × tripsThisMonth)`
- Monthly trend (last 6 months Recharts LineChart)
- Fuel vs. maintenance breakdown (Recharts PieChart)

---

## PHASE 3 — IMPLEMENTATION PLAN

### 3.1 New Firestore Composite Indexes

22 new entries to add to `firestore.indexes.json`:

```json
[
  { "collectionGroup": "transport_buses",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "status","order": "ASCENDING"}] },
  { "collectionGroup": "transport_buses",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "routeId","order": "ASCENDING"}] },

  { "collectionGroup": "transport_drivers",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "status","order": "ASCENDING"}] },

  { "collectionGroup": "transport_routes",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "status","order": "ASCENDING"}] },

  { "collectionGroup": "transport_route_students",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "routeId","order": "ASCENDING"},{"fieldPath": "status","order": "ASCENDING"}] },
  { "collectionGroup": "transport_route_students",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "studentId","order": "ASCENDING"}] },

  { "collectionGroup": "transport_trips",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "date","order": "DESCENDING"},{"fieldPath": "routeId","order": "ASCENDING"}] },
  { "collectionGroup": "transport_trips",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "busId","order": "ASCENDING"},{"fieldPath": "date","order": "DESCENDING"}] },
  { "collectionGroup": "transport_trips",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "status","order": "ASCENDING"},{"fieldPath": "date","order": "ASCENDING"}] },

  { "collectionGroup": "transport_boarding_events",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "tripId","order": "ASCENDING"},{"fieldPath": "timestamp","order": "ASCENDING"}] },
  { "collectionGroup": "transport_boarding_events",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "studentId","order": "ASCENDING"},{"fieldPath": "timestamp","order": "DESCENDING"}] },
  { "collectionGroup": "transport_boarding_events",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "eventType","order": "ASCENDING"},{"fieldPath": "timestamp","order": "DESCENDING"}] },

  { "collectionGroup": "transport_fuel_logs",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "busId","order": "ASCENDING"},{"fieldPath": "date","order": "DESCENDING"}] },
  { "collectionGroup": "transport_fuel_logs",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "createdAt","order": "DESCENDING"}] },

  { "collectionGroup": "transport_maintenance",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "busId","order": "ASCENDING"},{"fieldPath": "date","order": "DESCENDING"}] },
  { "collectionGroup": "transport_maintenance",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "status","order": "ASCENDING"},{"fieldPath": "nextDueDate","order": "ASCENDING"}] },

  { "collectionGroup": "transport_incidents",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "busId","order": "ASCENDING"},{"fieldPath": "date","order": "DESCENDING"}] },
  { "collectionGroup": "transport_incidents",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "driverId","order": "ASCENDING"},{"fieldPath": "createdAt","order": "DESCENDING"}] },
  { "collectionGroup": "transport_incidents",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"},{"fieldPath": "severity","order": "ASCENDING"},{"fieldPath": "resolved","order": "ASCENDING"}] },

  { "collectionGroup": "transport_settings",
    "fields": [{"fieldPath": "schoolId","order": "ASCENDING"}] }
]
```

---

### 3.2 New Cloud Functions

Added to `functions/src/index.ts` or organized into `functions/src/transport/`:

| Function | Type | Trigger | Purpose |
|---|---|---|---|
| `ingestBusPosition` | `onRequest` (HTTP) | GPS device POST | Validates API key; writes lat/lng/speed to RTDB; updates trail ring buffer |
| `triggerBoardingAlert` | `onCall` | After boarding event written | Fires parent notification (FCM + WhatsApp + in-app) |
| `checkApproachingBuses` | `onSchedule` every 30s | Cloud Scheduler | Compares all active bus positions vs. route stops; fires approach alert at 500m |
| `generateQRCode` | `onCall` | Admin/parent requests QR | Returns HMAC-signed QR payload for student |
| `startTrip` | `onCall` | Driver starts trip | Creates `transport_trips` doc; sets RTDB `status: 'in_progress'` |
| `endTrip` | `onCall` | Driver ends trip | Closes trip; computes stats; updates odometer; clears RTDB live data |
| `dailyMaintenanceReminders` | `onSchedule` (nightly) | Cloud Scheduler | Scans `transport_maintenance`; fires admin alerts for items due within N days |
| `monthlyTransportRollup` | `onSchedule` (end of month) | Cloud Scheduler | Aggregates fuel + maintenance costs; creates `expenses` summary record |
| `computeDriverScore` | `onCall` | After incident resolved / trip closed | Recalculates driver performance score from incident rate and trip history |

---

### 3.3 New UI Screens

#### Transport Manager Portal (StaffLayout `role="transport_manager"`)

```
Sidebar Navigation:
  Dashboard          /transport
  Buses              /transport/buses
  Drivers            /transport/drivers
  Routes             /transport/routes
  Students           /transport/students
  Live Tracking      /transport/tracking
  Fuel Logs          /transport/fuel
  Maintenance        /transport/maintenance
  Incidents          /transport/incidents
  Reports            /transport/reports
  Settings           /transport/settings
```

#### Screen Inventory

| Route | Component | Key Features |
|---|---|---|
| `/transport` | `TransportDashboard.tsx` | KPI tiles: active buses, students onboard now, pending alerts, fuel MTD cost |
| `/transport/buses` | `BusFleet.tsx` | Bus list + CRUD; insurance/service expiry colour badges; status management |
| `/transport/buses/:id` | `BusDetail.tsx` | Full bus info; service history; incident log; GPS device config + API key management |
| `/transport/drivers` | `DriverManagement.tsx` | Driver directory; license expiry alerts; performance score badges |
| `/transport/drivers/:id` | `DriverDetail.tsx` | Profile; trip history; incident timeline; AI behavior analysis |
| `/transport/routes` | `RouteManagement.tsx` | Route list; Google Maps preview per route; student count |
| `/transport/routes/:id` | `RouteDetail.tsx` | Stop editor (drag-reorder, map picker); student assignment list; schedule |
| `/transport/students` | `StudentAssignment.tsx` | Search students; assign/change route; boarding history per student |
| `/transport/tracking` | `LiveTracking.tsx` | Full-screen Google Maps; all active bus markers; live positions; click bus → detail panel with speed, students onboard, route progress |
| `/transport/fuel` | `FuelManagement.tsx` | Fuel log table; add log form; cost-per-km chart; monthly trend |
| `/transport/maintenance` | `MaintenanceTracker.tsx` | Service records; upcoming due (green/amber/red by days remaining); add record |
| `/transport/incidents` | `IncidentLog.tsx` | Safety incidents; severity filter; resolve workflow; GPS-auto vs. manual badge |
| `/transport/reports` | `TransportReports.tsx` | Date range selector; 6 report types; Recharts visualisations; PDF export |
| `/transport/settings` | `TransportSettings.tsx` | Speed limits; alert thresholds; GPS config; notification channels; campuses |

#### Driver Mobile Page (`/mobile/driver`)

New `MobileShell` page with `role="driver"` color scheme (`from-teal-500 to-cyan-600`):

| Section | Feature |
|---|---|
| Today's Trip | Trip status badge; Start Trip / End Trip button; student roster for this route |
| Boarding Scanner | Camera QR reader (jsQR); manual roster tap fallback; live onboard count |
| Route Progress | Stop-by-stop checklist with arrival time vs. ETA |
| Quick Incident | One-tap incident logging with photo capture |
| Navigation | Deep link to Google Maps with route pre-loaded |

Bottom tabs: `My Trip` · `Roster` · `Scanner`

#### Parent Portal — Transport Tab

Added as 9th tab in `ParentPortal.tsx` (no existing tabs modified):

| Section | Content |
|---|---|
| Assignment | Route name; bus plate number; driver name; pickup/dropoff stop |
| Today's Status | Boarded time / Dropped-off time if recorded; or "Not yet recorded" |
| Live Map | Bus current position on Google Maps (only if `enableParentTracking = true`) |
| History | 30-day boarding/alighting log with times |
| Preferences | Toggle: push / WhatsApp / SMS alerts for this student |

#### Admin Dashboard Integration

New "Transport" section card in `AdminDashboard.tsx` (same grid pattern as existing sections):

```
Card colour: from-orange-500 to-amber-600 (transport accent)
Stats:  Active buses today  /  Students currently onboard  /  Pending alerts
Link:   → /transport (transport_manager) or → /admin/transport (admin overview)
```

---

### 3.4 New Roles and Permissions

#### New Roles

| Role | Description | Portal |
|---|---|---|
| `transport_manager` | Manages fleet, routes, drivers, fuel, maintenance | `/transport` (StaffLayout) |
| `driver` | Runs trips; scans boarding via mobile app | `/mobile/driver` (MobileShell) |

#### New Permissions

```typescript
// Added to permissions.ts permission matrix

'transport.read'    // View all transport data for school
'transport.write'   // Create/edit buses, routes, drivers, student assignments
'transport.manage'  // Approve incidents; configure GPS; manage fuel/maintenance
'transport.track'   // Access live GPS tracking map
'transport.trip'    // Start/end trips; record boarding events (driver-level)
```

#### Permission Matrix

| Permission | super_admin | admin | School_admin | transport_manager | driver | parent |
|---|---|---|---|---|---|---|
| `transport.read` | ✓ | ✓ | ✓ | ✓ | own bus only | own children only |
| `transport.write` | ✓ | ✓ | ✓ | ✓ | — | — |
| `transport.manage` | ✓ | ✓ | ✓ | ✓ | — | — |
| `transport.track` | ✓ | ✓ | ✓ | ✓ | own bus only | read-only (if enabled) |
| `transport.trip` | ✓ | ✓ | ✓ | ✓ | ✓ | — |

#### Firestore Rule Additions

```javascript
// New helper function in firestore.rules
function isTransportManager() {
  return isActiveAccount() &&
    userProfile().role in ['transport_manager', 'driver'] &&
    userProfile().schoolId != null;
}

// transport_buses, transport_routes, transport_drivers, transport_settings
match /transport_buses/{busId} {
  allow read: if isSuperAdmin() || (isAuthenticated() && docBelongsToCallerSchool());
  allow write: if isSuperAdmin() ||
               (isAdmin() && newDocBelongsToCallerSchool()) ||
               (isTransportManager() && newDocBelongsToCallerSchool());
}

// transport_boarding_events — driver can create; admin/manager can read all; parent reads own child
match /transport_boarding_events/{eventId} {
  allow create: if isAuthenticated() && newDocBelongsToCallerSchool();
  allow read: if isSuperAdmin() ||
              (isAdmin() && docBelongsToCallerSchool()) ||
              isTransportManager() ||
              (isParent() && isGuardianOfStudent(resource.data.studentId));
  allow update, delete: if false; // Immutable — safeguarding audit trail
}

// transport_route_students — parent reads own children
match /transport_route_students/{assignId} {
  allow read: if isSuperAdmin() ||
              (isAdmin() && docBelongsToCallerSchool()) ||
              isTransportManager() ||
              (isParent() && isGuardianOfStudent(resource.data.studentId));
  allow write: if isSuperAdmin() ||
               (isAdmin() && newDocBelongsToCallerSchool()) ||
               (isTransportManager() && newDocBelongsToCallerSchool());
}
```

---

### 3.5 Hardware Integrations

#### Tier 1 — Required (GPS)

Any tracker that sends HTTP POST is compatible. Common devices available in Nigeria (₦15,000–₦80,000 range):

| Device | Protocol | Nigerian Availability |
|---|---|---|
| Teltonika FMB920 / FMB140 | HTTP configurable | Available from Teltonika distributors |
| Queclink GV300 | HTTP | Available online |
| Concox GT06N | TCP / HTTP | Very common, cheap |
| SIM808 / SIM868 (Arduino kit) | HTTP (custom firmware) | DIY friendly, low cost |
| Generic OBD2 + GPRS module | HTTP | Widely available |

**Required GPS device configuration:**

```
Server URL:  https://us-central1-{projectId}.cloudfunctions.net/ingestBusPosition
Method:      POST
Headers:     { "X-Device-Key": "{deviceApiKey}", "Content-Type": "application/json" }
Payload:     { "lat": float, "lng": float, "speed": float, "heading": float, "accuracy": float }
Interval:    10–60 seconds (configurable per school in transport_settings)
```

API key per device stored encrypted server-side. Rotatable from admin UI without reflashing device.

#### Tier 2 — Optional (Boarding)

| Device | Method | Notes |
|---|---|---|
| Camera phone (driver's) | QR scan | `getUserMedia` + `jsQR` library — works offline |
| NFC-enabled Android phone | NFC tap | WebNFC API (Chrome Android 89+); iOS fallback to QR |
| Dedicated NFC reader | USB/Bluetooth | Via Web Serial API or Web Bluetooth API |
| Raspberry Pi + USB RFID | HTTP POST | Local device → Cloud Function endpoint |

#### Tier 3 — Future

| Device | Capability | Integration Path |
|---|---|---|
| Vehicle CAN bus adapter | OBD2 telemetry (speed, RPM, fuel level) | BLE → mobile app → Cloud Function |
| Fuel level float sensor | Accurate tank level | MQTT broker → Cloud Function |
| Driver panic button | Emergency alert | HTTP/SMS → Cloud Function or Twilio webhook |
| AI dashcam | Facial recognition boarding | Cloud Vision API endpoint |

---

### 3.6 Third-Party APIs

| API | Purpose | Cost Model | Priority |
|---|---|---|---|
| **Google Maps JavaScript API** | Route visualisation; live bus markers; stop picker | Per map load (~$7/1000, $200 free credit/month) | Required |
| **Google Maps Directions API** | Route polyline drawing; ETA computation | Per request (~$5/1000) | Required |
| **Google Maps Geocoding API** | Address → lat/lng for stop entry | Per request (~$5/1000) | Required |
| **Termii** (Nigerian SMS) | SMS alerts for parents without smartphones | Per SMS (₦4–8 each) | High priority |
| **Google Maps Distance Matrix** | Stop-to-stop ETA with real traffic | Per element (~$10/1000) | Recommended |
| **Traccar** (open source) | Alternative self-hostable GPS server | Free (self-host) | Optional |
| **Google Cloud Vision** | Facial recognition boarding (future) | Per image (~$1.5/1000) | Future milestone |

**Note:** Google Maps API key already exists in the project (used by Google Calendar/Classroom integration). Same key can enable Maps JavaScript API — billing just needs Maps service enabled.

---

### 3.7 Security Considerations

#### GPS Ingest Security

- `ingestBusPosition` endpoint authenticates via `X-Device-Key` header — per-device API key stored only in `storage_secrets/{schoolId}/transport/{busId}` (Admin SDK accessible only; never exposed to Firestore client reads)
- API keys are rotatable from admin UI without reflashing device firmware
- Rate limiting: maximum 6 requests per minute per device key (Cloud Function rate limiter)
- IP allowlisting optional for enterprise schools

#### QR Code Anti-Forgery

- QR payload: `avenir-transport:{schoolId}:{studentId}:{hmacSHA256}`
- HMAC signed with a school-specific secret stored server-side
- QR codes expire after 24 hours (timestamp embedded in payload)
- Prevents screenshot replay: each scan is recorded; duplicate scans within 30 seconds are flagged

#### Parent Privacy (Live Tracking)

- Parents see bus position only — **not** which other students are on the bus
- Student boarding status (who is on/off) is private per-family
- `enableParentTracking` flag in `transport_settings` — admin can disable at any time
- Parent's map shows only their child's assigned bus, not all buses

#### Driver Scope Restriction

- `driver` role can only read/write for their assigned bus
- Firestore rule enforces: `resource.data.busId == userProfile().assignedBusId`
- Driver cannot access finance, maintenance, or other buses' data
- Boarding events are immutable once written (no delete, no update)

#### Boarding Event Immutability

- `allow update, delete: if false` on `transport_boarding_events`
- Admin/transport_manager may add an `overrideNote` field only via a specific Cloud Function
- Safeguarding requirement: complete audit trail for student location during transport

#### Incident Report Confidentiality

- Incident details (driver name, exact location, timestamp) visible only to admin and transport_manager
- Parent notifications contain only event type ("delay" / "incident") — never driver identifiers
- Severity `critical` incidents trigger immediate admin notification + lock incident from driver editing

---

### 3.8 Nigerian Operational Context

| Challenge | Design Response |
|---|---|
| **Intermittent connectivity** | Firebase offline persistence for Firestore; RTDB offline mode; boarding events queued in `IndexedDB` and synced on reconnect; QR scanner works offline (camera + local HMAC validation) |
| **GPS signal loss** | Bus `status: 'signal_lost'` vs `'offline'`; UI shows last known position + "Signal lost X min ago" timestamp; auto-detection resumes when signal returns without driver action |
| **Fuel scarcity** | Fuel log tracks volume at each fill-up; alert when days since fill exceed threshold; `fuelType` field tracks diesel/petrol/CNG for multi-fuel fleet; monthly consumption forecast via AI |
| **Poor road conditions** | Speed limits configurable per school (not hardcoded); school in dense Lagos traffic uses different thresholds than rural school; harsh braking uses GPS acceleration delta, not fixed speed |
| **Heavy traffic** | ETAs use Google Maps real-time traffic (Directions API `departure_time: now`); delay alert triggers when bus is 5+ min behind rolling ETA, not static schedule |
| **Multiple campuses** | `transport_routes.campus` field; `transport_settings.campuses[]` array; routes tagged to campus; multi-campus dashboard shows per-campus fleet status |
| **Flooding / road closures** | Manual `'suspended'` status on route; all route parents notified immediately; admin logs reason message; suspended routes excluded from live tracking dashboard |
| **Low-end devices (drivers)** | Driver mobile page intentionally minimal; no heavy charts; boarding scanner optimised for low-light (torch toggle); < 2MB total page load |
| **Power outages** | GPS hardware spec requirement: minimum 4-hour internal battery backup. Communicated to schools as hardware procurement requirement. Driver mobile caches trip state; manual boarding fallback always available |
| **No formal addresses** | Stop entry supports lat/lng picker on map as primary method; address field optional; drivers recognize stops by name ("Chevron Roundabout"), not address |

---

### 3.9 Scalability Strategy

#### Per-School Isolation

All Firestore collections use `where('schoolId', '==', schoolId)` as the primary filter. RTDB namespaced under `bus_live/{schoolId}/`. No cross-school data leakage by architecture.

#### Write Volume Estimates (per school)

| Data Type | Volume | Cost Impact |
|---|---|---|
| Boarding events | 30 students × 2 trips × 250 days = 15,000/year | Negligible |
| Fuel logs | ~2/bus/week × 10 buses × 52 weeks = 1,040/year | Negligible |
| Maintenance records | ~2/bus/month × 10 buses × 12 = 240/year | Negligible |
| GPS positions (RTDB) | 10 buses × 2 writes/min × 10 hrs = 1,200/day | Free (RTDB not billed per write) |
| GPS ingest Cloud Function | 1,200 calls/day × 250 days = 300,000/year | Within Blaze free tier (2M/month) |

#### Multi-School Scaling

Architecture supports unlimited schools. RTDB fan-out scales horizontally — 1,000 concurrent subscribers per bus position requires no architectural change.

#### Google Maps API Cost at Scale (50 schools)

```
50 schools × 10 buses × 1 tracking session/bus/day × 250 days = 125,000 map loads/year
Cost at $7/1000 = ~$875/year ≈ ₦1.4M/year (well within $200/month free credit for many months)
```

---

### 3.10 Development Milestones

#### Milestone 1 — Foundation (Weeks 1–2)

- Add `transport_manager` and `driver` roles to `src/utils/permissions.ts`
- Update `App.tsx` with new `ProtectedRoute` guards and `/transport/*` routes
- Update `firestore.rules` with all transport collection rules including `isTransportManager()` helper
- Add 22 new composite indexes to `firestore.indexes.json`
- Create all transport TypeScript interfaces in `src/types.ts`
- Create `StaffLayout` nav variant for `role="transport_manager"`
- Create empty portal shell at `/transport` with sidebar navigation and placeholder cards
- **Deliverable:** Transport portal accessible to transport_manager; navigation works; no data yet

#### Milestone 2 — Fleet & Drivers (Weeks 3–4)

- `src/pages/transport/BusFleet.tsx` — list + CRUD; insurance/service expiry colour badges
- `src/pages/transport/BusDetail.tsx` — full bus info; GPS device configuration
- `src/pages/transport/DriverManagement.tsx` — driver directory; license expiry alerts
- `src/pages/transport/DriverDetail.tsx` — driver profile with placeholder for performance metrics
- Wire `transport_drivers.userId` to `users` collection for app login capability
- **Deliverable:** Admin can register and manage fleet and drivers

#### Milestone 3 — Routes & Student Assignment (Weeks 5–6)

- `src/pages/transport/RouteManagement.tsx` — route list; Google Maps Static preview per route
- `src/pages/transport/RouteDetail.tsx` — stop editor with Google Maps Geocoding + drag-reorder
- `src/pages/transport/StudentAssignment.tsx` — search students; assign to routes; view assignments
- `transport_route_students` write logic with parent contact population from `students` collection
- Parent Portal: add 9th tab `transport` with assignment info (no live map yet)
- **Deliverable:** Students assigned to buses; parents see their assignment

#### Milestone 4 — GPS Live Tracking (Weeks 7–8)

- Provision Firebase RTDB in Firebase Console
- Update RTDB security rules
- `ingestBusPosition` Cloud Function deployed
- `src/services/transport/gpsProvider.ts` — abstraction + `FirebaseRTDBGpsProvider` implementation
- `src/pages/transport/LiveTracking.tsx` — Google Maps JS API; real-time bus markers from RTDB
- Bus detail panel: click marker → driver, route, students onboard, speed, signal age
- GPS trail: polyline of last 20 positions
- Per-bus GPS device configuration screen: device ID + API key generation
- Parent Portal transport tab: live map section (conditional on `enableParentTracking`)
- **Deliverable:** Admin and parents can watch buses in real time

#### Milestone 5 — Trip Management & Boarding (Weeks 9–10)

- `startTrip` and `endTrip` Cloud Functions
- `generateQRCode` Cloud Function + HMAC implementation
- `src/pages/mobile/DriverMobileApp.tsx` with MobileShell
- QR scanner: camera via `getUserMedia` + `jsQR` library
- Manual boarding: roster list with tap-to-record
- `src/services/transport/boardingVerifier.ts` — QR and manual implementations
- `transport_boarding_events` written on each scan; RTDB `studentsOnboard` updated
- QR code display added to Parent Portal transport tab (for student's assigned bus)
- **Deliverable:** Drivers can run trips and record student boarding/alighting

#### Milestone 6 — Parent Notifications (Weeks 11–12)

- Add 6 new `NotificationType` values to `src/types.ts`
- `triggerBoardingAlert` Cloud Function (fires on each boarding event)
- Approach detection: RTDB position subscriber checks all active buses vs. route stops via `haversineDistance()`; fires alert at configured `stopGeofenceRadiusM` (default 500m)
- Missed pickup detection: end-of-stop-window check when bus departs without boarding event for assigned students
- Delay detection: rolling ETA comparison; alert when 5+ min behind
- Parent Portal notification preferences: transport alert toggles per-child
- WhatsApp message templates for each transport alert type
- **Deliverable:** Parents receive real-time boarding, approach, delay, and missed-pickup alerts

#### Milestone 7 — Fuel & Maintenance (Weeks 13–14)

- `src/pages/transport/FuelManagement.tsx` — log table; add form; monthly cost trend chart
- `src/pages/transport/MaintenanceTracker.tsx` — service records; due-date colour coding
- `dailyMaintenanceReminders` Cloud Function (nightly, checks `nextDueDate`)
- `monthlyTransportRollup` Cloud Function (end-of-month, writes to `expenses`)
- Auto-odometer update from trip `startOdometer`/`endOdometer` fields
- Finance module integration: `'transport'` in `AnalyticsDashboard.tsx` expense breakdown
- **Deliverable:** Full fuel and maintenance management; auto-reminders; finance integration

#### Milestone 8 — Safety Monitoring & Incidents (Weeks 15–16)

- GPS-based auto-detection in `ingestBusPosition`:
  - Overspeed: `speed > transport_settings.speedLimitKmh`
  - Long idling: `status == 'stopped' AND tripId != null` for `> idlingAlertMinutes`
  - Route deviation: bus position `> 500m` from nearest planned stop sequence segment
- `transport_incidents` auto-create from GPS ingest when threshold crossed
- Manual incident logging from driver mobile (quick form with photo)
- `src/pages/transport/IncidentLog.tsx` — admin review and resolution workflow
- Driver performance score recalculation (`computeDriverScore`) after each incident/trip close
- Critical incident → immediate admin notification + parent delay alert
- **Deliverable:** Automated safety monitoring with auto-flagging and admin resolution workflow

#### Milestone 9 — Reporting & AI (Weeks 17–18)

- `src/pages/transport/TransportReports.tsx`:
  - Daily trip summary (departure times, students, route completion)
  - Fleet utilisation (buses used / total fleet)
  - Driver performance leaderboard
  - Fuel consumption by bus and route
  - Maintenance cost by bus
  - Incident frequency by driver and route
  - Date range selector; Recharts visualisations; PDF export
- `src/pages/transport/DriverDetail.tsx` complete: performance chart; AI behavior analysis panel
- Gemini functions added to `geminiService.ts`: fuel prediction, maintenance prediction, driver behavior, route optimisation, monthly executive summary
- AI Insights panel in `TransportDashboard.tsx`
- **Deliverable:** Full reporting dashboard and AI-powered predictive analytics

#### Milestone 10 — QA, Offline Mode & Production Rollout (Weeks 19–20)

- Offline boarding event queue: `IndexedDB` cache + sync-on-reconnect
- GPS signal loss graceful degradation: UI behaviour at each signal state
- Performance test: 20 simultaneous buses + 500 boarding events in 60 seconds
- Nigerian field test with real GPS hardware (Teltonika FMB920 or Concox GT06N)
- Edge case resolution from real-world testing
- Firestore rules audit: penetration test simulating cross-school data access attempts
- Documentation:
  - Driver app quick-start guide (1 page, illustrated)
  - Admin transport setup guide (GPS configuration, route setup, student assignment)
  - GPS device configuration guide (Teltonika + generic HTTP tracker)
  - Parent guide (how to read bus alerts and live tracking)
- **Deliverable:** Production-ready transport module deployed to all schools

---

## INTEGRATION SUMMARY

```
New Firestore Collections (10):
  transport_buses            transport_drivers          transport_routes
  transport_route_students   transport_trips            transport_boarding_events
  transport_fuel_logs        transport_maintenance      transport_incidents
  transport_settings

New RTDB Paths:
  bus_live/{schoolId}/{busId}          Current position (overwrites)
  bus_live/{schoolId}/{busId}/trail    Last 20 positions (ring buffer)

New Composite Indexes:    22 new entries in firestore.indexes.json
New Cloud Functions:       9 (ingest, alerts, QR, trip, reminders, rollup, score)
New App Routes:           13 under /transport/* + /mobile/driver
New Roles:                transport_manager, driver
New Permissions:          transport.read/write/manage/track/trip
New Notification Types:   6 transport_* types

Files Modified (existing — additive changes only):
  src/types.ts              → new interfaces + 6 notification types
  src/utils/permissions.ts  → new roles + permissions
  src/App.tsx               → new routes + ProtectedRoute guards
  src/pages/ParentPortal.tsx → new Transport tab
  src/pages/AdminDashboard.tsx → transport summary card
  src/services/geminiService.ts → 6 new AI functions
  firestore.rules           → transport collection rules + isTransportManager()
  firestore.indexes.json    → 22 new composite indexes

New Files:
  src/services/transport/gpsProvider.ts         GPS abstraction layer
  src/services/transport/boardingVerifier.ts    Boarding verification abstraction
  src/pages/transport/TransportDashboard.tsx
  src/pages/transport/BusFleet.tsx
  src/pages/transport/BusDetail.tsx
  src/pages/transport/DriverManagement.tsx
  src/pages/transport/DriverDetail.tsx
  src/pages/transport/RouteManagement.tsx
  src/pages/transport/RouteDetail.tsx
  src/pages/transport/StudentAssignment.tsx
  src/pages/transport/LiveTracking.tsx
  src/pages/transport/FuelManagement.tsx
  src/pages/transport/MaintenanceTracker.tsx
  src/pages/transport/IncidentLog.tsx
  src/pages/transport/TransportReports.tsx
  src/pages/transport/TransportSettings.tsx
  src/pages/mobile/DriverMobileApp.tsx
  functions/src/transport/ingestBusPosition.ts
  functions/src/transport/tripManagement.ts
  functions/src/transport/boardingAlerts.ts
  functions/src/transport/approachDetection.ts
  functions/src/transport/qrGenerator.ts
  functions/src/transport/maintenanceReminders.ts
  functions/src/transport/monthlyRollup.ts
  functions/src/transport/driverScore.ts

Unmodified (zero changes):
  All existing student, finance, attendance, HR, library,
  exam, calendar, gradebook, report card, and CBT modules.
  Every change to existing files is strictly additive.
```

---

*Document produced after deep codebase audit of 53 Firestore collections, 47 composite indexes, 9 roles, 14 existing UI patterns, and all 60+ application routes.*  
*Implementation begins at Milestone 1 upon architecture approval.*
