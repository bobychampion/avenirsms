# Avenir SIS — Multi-Tenancy Architecture & Audit Documentation

**Version:** 1.0  
**Date:** April 2026  
**Status:** Fully Audited & Hardened  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Design](#2-architecture-design)
3. [The schoolId Field — The Cornerstone of Isolation](#3-the-schoolid-field)
4. [Key Hooks & Contexts](#4-key-hooks--contexts)
5. [Firestore Security Rules](#5-firestore-security-rules)
6. [The Super Admin School-Switching System](#6-the-super-admin-school-switching-system)
7. [Developer Rules — The Checklist Every Dev Must Follow](#7-developer-rules)
8. [Full Audit Log — What Was Found & Fixed](#8-full-audit-log)
9. [Known Remaining Risks & Recommended Next Steps](#9-known-remaining-risks--recommended-next-steps)
10. [Firestore Collections Reference](#10-firestore-collections-reference)

---

## 1. Overview

Avenir SIS is a **multi-tenant SaaS School Information System**. Multiple independent schools (tenants) share a single Firebase/Firestore backend and a single deployed frontend application. Each school's data must be **completely invisible** to all other schools at every level.

### What Multi-Tenancy Means Here

- A school admin at **School A** must never see students, staff, events, settings, notifications, exams, or any other data belonging to **School B**.
- A super_admin is the only role that can see data across all schools — and only when explicitly "entering" a school context.
- Data isolation is enforced at **two independent layers**: the application (React + Firestore queries) and the database (Firestore Security Rules).

### Isolation Model

```
┌─────────────────────────────────────────────────────────┐
│                    Firebase Firestore                    │
│                                                         │
│  /students/{id}   schoolId: "school_abc"  ←─────────┐  │
│  /students/{id}   schoolId: "school_xyz"  ←──────┐  │  │
│  /events/{id}     schoolId: "school_abc"  ←─────┐ │  │  │
│  /question_bank   schoolId: "school_abc"  ←───┐ │ │  │  │
│                                               │ │ │  │  │
│         Security Rules enforce schoolId ──────┘ │ │  │  │
└─────────────────────────────────────────────────┘─┘──┘──┘
                                                  │  │  │
                     React App (Query Layer) ──────┘  │  │
                     where('schoolId','==',schoolId) ──┘  │
                     useSchoolId() hook ──────────────────┘
```

---

## 2. Architecture Design

### Tenancy Strategy: Shared Collections, Scoped by `schoolId` Field

We use the **shared-collection, field-based tenancy** pattern. All schools write documents into the same Firestore collections (e.g., `/students`, `/events`, `/staff`). Each document carries a `schoolId` field that identifies which school owns it.

**Why this pattern?**
- Simpler to manage than separate databases per school
- Firebase Security Rules can enforce isolation at the document level
- Scales to hundreds of schools without infrastructure changes
- Super admin can query across schools when needed

**Alternative considered (and rejected):** Separate Firestore subcollections per school (e.g., `/schools/{schoolId}/students/{id}`). Rejected because it would require restructuring all existing data and complicating cross-collection joins.

---

## 3. The `schoolId` Field

### What It Is

`schoolId` is a string field present on **every school-scoped document** in Firestore. Its value is the document ID of the school from the `/schools` collection (e.g., `"KrDw4fBzLmNpQr7TxVy2"`).

### Where It Comes From for Each User Type

| User Role | Where `schoolId` Comes From |
|-----------|----------------------------|
| `admin` / `School_admin` | Their `/users/{uid}.schoolId` profile field |
| `teacher` | Their `/users/{uid}.schoolId` profile field |
| `parent` | Their `/users/{uid}.schoolId` profile field |
| `accountant` | Their `/users/{uid}.schoolId` profile field |
| `super_admin` | **None by default.** Set temporarily via `SuperAdminContext.activeSchoolId` when entering a school |
| `applicant` | Set on the application document at submission time |

### The Rule: Every Write Must Include `schoolId`

When any page creates or updates a document in a school-scoped collection, it **must** include `schoolId` in the data. Example:

```typescript
// ✅ CORRECT
await addDoc(collection(db, 'events'), {
  title: formData.title,
  date: formData.date,
  schoolId,            // ← ALWAYS include this
  createdAt: serverTimestamp(),
});

// ❌ WRONG — document has no schoolId, becomes orphaned
await addDoc(collection(db, 'events'), {
  title: formData.title,
  date: formData.date,
});
```

### The Rule: Every Read Must Filter by `schoolId`

Every Firestore `onSnapshot` or `getDocs` that reads from a school-scoped collection **must** include a `where('schoolId', '==', schoolId)` clause:

```typescript
// ✅ CORRECT
const q = query(
  collection(db, 'events'),
  where('schoolId', '==', schoolId),
  orderBy('date', 'asc')
);

// ❌ WRONG — returns ALL schools' events
const q = query(collection(db, 'events'), orderBy('date', 'asc'));
```

---

## 4. Key Hooks & Contexts

### `useSchoolId()` — The Single Source of Truth

**File:** `src/hooks/useSchoolId.ts`

This is the **most important hook in the system**. Every page that reads or writes school-scoped data must call this hook to get the effective `schoolId`.

```typescript
export function useSchoolId(): string | null {
  const { schoolId: profileSchoolId } = useAuth();
  const { activeSchoolId } = useSuperAdmin();
  return activeSchoolId ?? profileSchoolId;
}
```

**Resolution logic:**
1. If `super_admin` has entered a school (`activeSchoolId` is set) → returns that school's ID
2. Otherwise → returns the user's own `profile.schoolId`
3. If neither exists (super_admin on their platform dashboard) → returns `null`

**Usage pattern (mandatory):**
```typescript
const schoolId = useSchoolId();

useEffect(() => {
  if (!schoolId) return;  // ← ALWAYS guard against null
  const unsub = onSnapshot(
    query(collection(db, 'students'), where('schoolId', '==', schoolId)),
    snap => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)))
  );
  return () => unsub();
}, [schoolId]);  // ← ALWAYS include schoolId in dep array
```

**The dependency array rule:** `schoolId` MUST be in the `useEffect` dependency array. Without it, when a super_admin switches schools, the old subscriptions keep running against the old school — this was the root cause of the data-bleed issue that was audited and fixed.

---

### `SuperAdminContext` — School Switching

**File:** `src/components/SuperAdminContext.tsx`

A React-only context (no Firestore reads). Manages the super_admin's "active school" session.

```typescript
interface SuperAdminContextType {
  activeSchoolId: string | null;   // null = on platform dashboard
  activeSchoolName: string;
  enterSchool: (id: string, name: string) => void;
  exitSchool: () => void;
}
```

When `enterSchool(id, name)` is called:
- `activeSchoolId` is set → `useSchoolId()` returns it
- All `useEffect` hooks with `[schoolId]` deps re-fire automatically
- Old subscriptions unsubscribe, new ones subscribe to the new school

When `exitSchool()` is called:
- `activeSchoolId` returns to `null`
- All school-scoped subscriptions cleanly unsubscribe

---

### `SchoolContext` — Shared School State

**File:** `src/components/SchoolContext.tsx`

Provides school-wide shared configuration fetched once and shared across all pages:
- `classes` — school's class list (from Firestore `/classes`)
- `subjects` — merged built-in + custom subjects
- `schoolLevels`, `periodTimes`, `currentSession`, `currentTerm`
- `schoolName`, `logoUrl`, `primaryColor` — branding
- `gradingSystem`, `currency`, `timezone`, `locale` — regional settings

All subscriptions inside `SchoolContext` are scoped to `useSchoolId()` and have `[schoolId]` in their dep arrays.

---

## 5. Firestore Security Rules

**File:** `firestore.rules`

Security Rules are the **backend enforcement layer**. Even if a bug in the React code sends an unscoped query, the rules will block returning documents that don't belong to the caller's school.

### Key Helper Functions

```javascript
/** Caller belongs to the given schoolId */
function belongsToSchool(sid) {
  return isAuthenticated() && userProfile().schoolId == sid;
}

/** Existing document's schoolId matches the caller's schoolId */
function docBelongsToCallerSchool() {
  return isAuthenticated() &&
    resource.data.get('schoolId', null) == userProfile().schoolId;
}

/** New document being written has schoolId matching caller's schoolId */
function newDocBelongsToCallerSchool() {
  return isAuthenticated() &&
    request.resource.data.get('schoolId', null) == userProfile().schoolId;
}
```

### Isolation Pattern Applied to Every Collection

Every school-scoped collection follows this pattern:

```javascript
match /students/{studentId} {
  allow read:  if isSuperAdmin() || ((isAdmin() || isTeacher()) && docBelongsToCallerSchool());
  allow write: if isSuperAdmin() || (isAdmin() && newDocBelongsToCallerSchool());
}
```

- **`docBelongsToCallerSchool()`** on reads: ensures you can only read documents where `schoolId` matches yours
- **`newDocBelongsToCallerSchool()`** on writes: ensures you can only create documents tagged with your own `schoolId` — prevents injecting data into another school
- **`isSuperAdmin()`**: bypasses school-level checks but requires the `super_admin` role

### Collections with Security Rules Defined

| Collection | Read Scope | Write Scope |
|-----------|------------|-------------|
| `schools` | super_admin, own school admin | super_admin only |
| `school_settings` | super_admin, own school | super_admin, own school admin |
| `geofences` | super_admin, own school | super_admin, own school admin |
| `users` | super_admin, own profile, same-school admin/teacher | super_admin, own school admin, self (limited) |
| `students` | super_admin, same-school admin/teacher, own guardian | super_admin, own school admin |
| `events` | super_admin, same-school users | super_admin, own school admin |
| `notifications` | super_admin, same-school admin, own recipient | super_admin, own school admin |
| `notification_broadcasts` | super_admin, same-school | super_admin, own school admin |
| `question_bank` | super_admin, same-school | super_admin, same-school admin/teacher |
| `cbt_exams` | super_admin, same-school | super_admin, own school admin |
| `cbt_sessions` | super_admin, same-school admin, own student | authenticated users (⚠️ see known risks) |
| `curriculum_documents` | super_admin, same-school | super_admin, same-school admin/teacher |
| `exams`, `exam_seating` | super_admin, same-school | super_admin, own school admin |
| `timetables` | super_admin, same-school | super_admin, own school admin |
| `staff`, `leave_requests`, `payroll` | super_admin, same-school admin | super_admin, own school admin |
| `invoices`, `fee_payments`, `expenses` | super_admin, same-school admin, own guardian | super_admin, own school admin |
| `attendance` | super_admin, same-school admin/teacher, own guardian | super_admin, same-school admin/teacher |
| `assignments`, `grades` | super_admin, same-school | super_admin, same-school admin/teacher |

---

## 6. The Super Admin School-Switching System

The super_admin role manages all schools from a central dashboard at `/super-admin`. To view or edit a specific school's data, they "enter" the school:

```
Super Admin Dashboard
         │
         ▼
  [Click "Manage" on School A]
         │
         ▼
  enterSchool("school_abc", "Avenir Academy")
         │
         ▼
  activeSchoolId = "school_abc"
         │
         ▼
  useSchoolId() now returns "school_abc"
         │
         ▼
  All page subscriptions re-fire with schoolId = "school_abc"
  Data shown: ONLY School A's data
         │
         ▼
  [Click "Exit School" in banner]
         │
         ▼
  exitSchool() → activeSchoolId = null
  All subscriptions unsubscribe
  Returns to platform dashboard
```

**Banner UI:** When `activeSchoolId` is set, a persistent top banner shows:  
`"Viewing: Avenir Academy [Exit School ✕]"` — always visible so super_admin knows which school context is active.

---

## 7. Developer Rules

### The Mandatory Checklist for Every New Page or Feature

Before submitting any code that reads or writes Firestore, verify all of the following:

---

#### ✅ Reading Data

```typescript
// 1. Always call useSchoolId()
const schoolId = useSchoolId();

// 2. Always guard against null at the top of useEffect
useEffect(() => {
  if (!schoolId) return;  // ← mandatory guard

  // 3. Always filter by schoolId
  const q = query(
    collection(db, 'your_collection'),
    where('schoolId', '==', schoolId),
    // ... other filters
  );

  const unsub = onSnapshot(q, snap => { /* ... */ });
  return () => unsub();

}, [schoolId]);  // 4. ← schoolId MUST be in the dep array
```

**Why the dep array matters:** If `schoolId` is not in the array, the `useEffect` runs only once on mount. When a super_admin switches from School A to School B, the subscription still points at School A's data. School B's admin would see School A's data. This is the exact bug this audit found and fixed.

---

#### ✅ Writing Data

```typescript
const schoolId = useSchoolId();

const handleSave = async () => {
  if (!schoolId) return;  // ← guard before every write

  await addDoc(collection(db, 'your_collection'), {
    // ... your fields
    schoolId,             // ← always include
    createdAt: serverTimestamp(),
  });
};
```

---

#### ✅ One-Time Reads (`getDocs`)

```typescript
const snap = await getDocs(
  query(
    collection(db, 'your_collection'),
    where('schoolId', '==', schoolId!)
  )
);
```

---

#### ❌ Anti-Patterns — Never Do These

```typescript
// ❌ WRONG: no schoolId filter
const q = query(collection(db, 'events'), orderBy('date'));

// ❌ WRONG: empty dep array when schoolId is used inside
useEffect(() => {
  const q = query(collection(db, 'events'), where('schoolId', '==', schoolId));
  // ...
}, []);  // ← BUG: won't update when school switches

// ❌ WRONG: write without schoolId
await addDoc(collection(db, 'events'), { title: 'Sports Day' });

// ❌ WRONG: using schoolId ?? 'main' as fallback
const q = query(collection(db, 'events'), where('schoolId', '==', schoolId ?? 'main'));
// 'main' is not a real schoolId — creates orphaned documents

// ❌ WRONG: not guarding null
useEffect(() => {
  // schoolId could be null for super_admin on platform dashboard
  const q = query(collection(db, 'events'), where('schoolId', '==', schoolId!));
  // Using ! here is unsafe — will produce an invalid query or crash
}, [schoolId]);
```

---

#### ✅ For Sub-Components That Need schoolId

Sub-components rendered inside a page should either:

**Option A:** Receive `schoolId` as a prop
```typescript
function MySubComponent({ schoolId }: { schoolId: string }) { ... }
```

**Option B:** Call `useSchoolId()` themselves (preferred — no prop drilling)
```typescript
function MySubComponent() {
  const schoolId = useSchoolId();
  // ...
}
```

`QuestionBankTab`, `CBTExamsTab`, and `ResultsTab` inside `ExamManagement.tsx` are examples of this pattern — each sub-component calls `useSchoolId()` independently.

---

## 8. Full Audit Log — What Was Found & Fixed

### Audit Date: April 2026

All files in `src/pages/` were reviewed for:
1. Missing `schoolId` filters on Firestore queries
2. Missing `schoolId` on Firestore writes
3. `useEffect` hooks that use `schoolId` but have `[]` as their dependency array

---

### Issues Found & Fixed

| # | File | Component | Issue | Fix Applied |
|---|------|-----------|-------|-------------|
| 1 | `SchoolSettings.tsx` | Main component | `useEffect` subscribing to `subjects`, `users`, `classes`, `geofences` had `[]` dep array — subscriptions never re-attached when super_admin switched schools | Changed dep array `[]` → `[schoolId]` |
| 2 | `AdminDashboard.tsx` | Main component | Applications listener had `[]` dep array | Changed `[]` → `[schoolId]` |
| 3 | `AdminDashboard.tsx` | Main component | Live board subscriptions (geofence, checkins, timetables, teachers, student attendance) had `[]` dep array | Changed `[]` → `[schoolId]` |
| 4 | `SchoolCalendar.tsx` | `SchoolCalendar` | Events query had **no `schoolId` filter** — all schools shared the same calendar. `handleSaveEvent` did not write `schoolId`. `useEffect` had `[]` dep. | Added `where('schoolId','==',schoolId)` to query; added `schoolId` to writes; added `useSchoolId()` hook; dep `[]` → `[schoolId]` |
| 5 | `NotificationComposer.tsx` | `NotificationComposer` | `students` query had no `schoolId` filter. `notification_broadcasts` query had no `schoolId` filter. Neither `notifications` nor `notification_broadcasts` documents were written with `schoolId`. `useEffect` had `[]` dep. | Added `where` filters to both queries; added `schoolId` to all writes; dep `[]` → `[schoolId]` |
| 6 | `ExamManagement.tsx` | `QuestionBankTab` | `question_bank` and `curriculum_documents` queries had no `schoolId` filter. AI-generated and manual questions were saved without `schoolId`. `useEffect` had `[]` dep. | Added `where` filters; added `schoolId` to all writes; added `useSchoolId()`; dep `[]` → `[schoolId]` |
| 7 | `ExamManagement.tsx` | `CBTExamsTab` | `cbt_exams` and `question_bank` queries had no `schoolId` filter. New CBT exams saved without `schoolId`. `useEffect` had `[]` dep. | Added `where` filters; added `schoolId` to exam writes; dep `[]` → `[schoolId]` |
| 8 | `ExamManagement.tsx` | `ResultsTab` | `cbt_sessions` and `cbt_exams` queries had no `schoolId` filter. `useEffect` had `[]` dep. | Added `where` filters; added `useSchoolId()`; dep `[]` → `[schoolId]` |
| 9 | `TimetableManagement.tsx` | Main component | `users` collection queried with no `schoolId` filter — all schools' teachers were visible in timetable teacher dropdowns | Added `where('schoolId','==',schoolId!)` and `where('role','==','teacher')` to query |

---

### Pages Confirmed Clean (No Issues Found)

| File | Status |
|------|--------|
| `StudentList.tsx` | ✅ Scoped |
| `StudentProfile.tsx` | ✅ Scoped |
| `StaffManagement.tsx` | ✅ Scoped |
| `FinancialManagement.tsx` | ✅ Scoped |
| `AttendancePage.tsx` | ✅ Scoped |
| `Gradebook.tsx` | ✅ Scoped |
| `ReportCards.tsx` | ✅ Scoped |
| `TeacherPortal.tsx` | ✅ Scoped |
| `AdmissionsManagement.tsx` | ✅ Scoped |
| `ApplicationDetail.tsx` | ✅ Scoped |
| `PayrollManagement.tsx` | ✅ Scoped |
| `PinManagement.tsx` | ✅ Scoped |
| `ClassManagement.tsx` | ✅ Scoped |
| `UserManagement.tsx` | ✅ Scoped |
| `CurriculumMapping.tsx` | ✅ Scoped |
| `NotificationsManagement.tsx` | ✅ Scoped |
| `StudentPromotion.tsx` | ✅ Scoped |
| `ParentPortal.tsx` | ✅ Scoped |
| `BulkStudentImport.tsx` | ✅ Scoped |
| `AnalyticsDashboard.tsx` | ✅ Scoped |
| `WhatsAppNotifications.tsx` | ✅ Scoped |

---

## 9. Known Remaining Risks & Recommended Next Steps

### ✅ Previously High Priority — Now Fixed (April 18, 2026)

#### ~~1. Firestore Rule: `cbt_sessions` Create is Unscoped~~ — FIXED
**Was:** `allow create: if isAuthenticated();` — any authenticated user could create a session for any school.  
**Fixed in:** `firestore.rules` — April 18, 2026  
**Resolution:**
```javascript
// firestore.rules — cbt_sessions
allow create: if isSuperAdmin() ||
              ((isAdmin() || isTeacher()) && newDocBelongsToCallerSchool());
allow delete: if isSuperAdmin() || (isAdmin() && docBelongsToCallerSchool());
```
> Note: Students only ever call `updateDoc` (submitting answers). `addDoc` for sessions is only called by admin/teacher screens in `ExamManagement.tsx`, which already stamps `schoolId: exam.schoolId` on the document.

#### ~~2. Firestore Rule: `mail` Create is Unscoped~~ — FIXED
**Was:** `allow create: if isAuthenticated();`  
**Fixed in:** `firestore.rules` — April 18, 2026  
**Resolution:**
```javascript
// firestore.rules — mail
allow create: if isSuperAdmin() ||
              (isAuthenticated() && newDocBelongsToCallerSchool());
```
> Note: The `mail` collection is written by Firebase Trigger Email extension via Admin SDK (bypasses rules). The rule is defensive: if a future feature ever writes to `mail` from the frontend, the schoolId will be enforced. Also added `mail` to `DataMigration.tsx` collection list so legacy mail documents are backfilled.

#### ~~3. Orphaned Legacy Data~~ — MIGRATION TOOL ALREADY EXISTS
A browser-based migration tool exists at **`/admin/migrate`** (`src/pages/DataMigration.tsx`), accessible only to `super_admin`. It:
- Backfills `schoolId: 'main'` on all documents that are missing `schoolId`
- Skips `super_admin` users during user migration
- Seeds a `schools/main` document if it doesn't exist
- Is idempotent (safe to run multiple times)
- Covers all 37 domain collections including `cbt_sessions`, `question_bank`, `events`, `notification_broadcasts`, `curriculum_documents`, and `mail`

**Action required:** Super admin must navigate to `/admin/migrate` and click **"Run Migration"** once after deploying the updated `firestore.rules`.

**Collections covered by migration tool:**
```
students, applications, guardians, classes, class_subjects, subjects, grades,
student_skills, attendance, attendance_checkins, timetables, assignments, messages,
invoices, fee_payments, payments, expenses, staff, leave_requests, payroll,
notifications, notification_broadcasts, fcm_tokens, exams, exam_seating,
question_bank, cbt_exams, cbt_sessions, curriculum_documents, curriculum_items,
pins, promotions, demo_requests, whatsapp_logs, events, mail
```

---

### 🟡 Medium Priority

#### 4. `SeedData.tsx` Must Be Removed or Fully Gated in Production
The seed data page writes directly to Firestore. Ensure it is either:
- Removed entirely from the production build
- Gated behind `isSuperAdmin()` and requires explicit `schoolId` selection before seeding

#### 5. `SchoolContext` State Not Cleared on School Switch
When super_admin switches from School A to School B, the `SchoolContext` (classes, subjects, settings) state may briefly show School A's values while the new subscriptions are loading. This can cause wrong options in dropdowns for a split second.

**Fix:** In `SchoolContext.tsx`, reset all state to defaults synchronously when `schoolId` changes, before the new subscriptions fire:
```typescript
useEffect(() => {
  setClasses([]);
  setSubjectDefs([]);
  // ... reset other state
  if (!schoolId) return;
  // then subscribe ...
}, [schoolId]);
```

#### 6. `useSchoolId` Must Not Return Stale Value During Transition
Confirm `SuperAdminContext` sets `activeSchoolId` synchronously (it does — it uses `useState`). No async gap should exist between `exitSchool()` and the value returning `null`.

---

### 🟢 Low Priority (Good Practice)

#### 7. Composite Firestore Indexes
All `where('schoolId',...) + orderBy(...)` queries require composite indexes. Ensure `firestore.indexes.json` has entries for:

| Collection | Fields |
|-----------|--------|
| `events` | `schoolId ASC`, `date ASC` |
| `notification_broadcasts` | `schoolId ASC`, `createdAt DESC` |
| `question_bank` | `schoolId ASC`, `createdAt DESC` |
| `cbt_exams` | `schoolId ASC`, `createdAt DESC` |
| `cbt_sessions` | `schoolId ASC`, `startedAt DESC` |
| `curriculum_documents` | `schoolId ASC`, `uploadedAt DESC` |

Without these, queries will fail in production (they work in development via auto-creation but must be explicitly defined before deploying).

#### 8. Parent Portal `schoolId` Cross-Check
Parents query their student by `guardianUserId`. Confirm the parent's `schoolId` is also verified so a parent cannot access a student from another school by direct document ID knowledge.

---

## 10. Firestore Collections Reference

All collections that carry `schoolId` and are therefore school-scoped:

| Collection | schoolId Required | Notes |
|-----------|:-----------------:|-------|
| `students` | ✅ | Core student records |
| `guardians` | ✅ | Parent/guardian records |
| `staff` | ✅ | Staff/employee records |
| `users` | ✅ | Auth profiles (except super_admin) |
| `classes` | ✅ | Class definitions |
| `subjects` | ✅ | Subject definitions |
| `class_subjects` | ✅ | Class-subject mappings |
| `grades` | ✅ | Student grades |
| `student_skills` | ✅ | Skill assessments |
| `attendance` | ✅ | Daily attendance |
| `attendance_checkins` | ✅ | Teacher geo-checkins |
| `timetables` | ✅ | Class timetables |
| `assignments` | ✅ | Teacher assignments |
| `events` | ✅ | Calendar events (fixed in audit) |
| `notifications` | ✅ | Push notifications |
| `notification_broadcasts` | ✅ | Sent notification history (fixed) |
| `invoices` | ✅ | Fee invoices |
| `fee_payments` | ✅ | Payment records |
| `payments` | ✅ | General payments |
| `expenses` | ✅ | School expenses |
| `exams` | ✅ | Exam schedules |
| `exam_seating` | ✅ | Seating arrangements |
| `question_bank` | ✅ | CBT question bank (fixed in audit) |
| `cbt_exams` | ✅ | CBT exam configs (fixed in audit) |
| `cbt_sessions` | ✅ | Student CBT sessions (fixed in audit) |
| `curriculum_documents` | ✅ | Uploaded curriculum files (fixed) |
| `curriculum_items` | ✅ | Curriculum mapping items |
| `leave_requests` | ✅ | Staff leave requests |
| `payroll` | ✅ | Payroll records |
| `pins` | ✅ | Generated PIN codes |
| `promotions` | ✅ | Student promotions |
| `whatsapp_logs` | ✅ | WhatsApp message logs |
| `messages` | ✅ | Internal messaging |
| `school_settings` | 🔑 IS the schoolId (doc ID) | Keyed by schoolId directly |
| `geofences` | 🔑 IS the schoolId (doc ID) | Keyed by schoolId directly |
| `schools` | 🔑 IS the schoolId (doc ID) | Platform-level school registry |
| `demo_requests` | ❌ Public | Public landing page submissions |
| `fcm_tokens` | ❌ User-scoped | Keyed by user UID |
| `mail` | ✅ Rule enforced (Apr 18) | Firebase Trigger Email extension; rule & migration added |

---

## Appendix: Quick Reference Card for Developers

```
┌──────────────────────────────────────────────────────────────────┐
│            MULTI-TENANCY QUICK REFERENCE                         │
├──────────────────────────────────────────────────────────────────┤
│  1. HOOK:   const schoolId = useSchoolId();                      │
│  2. GUARD:  if (!schoolId) return;                               │
│  3. READ:   where('schoolId', '==', schoolId)                    │
│  4. WRITE:  include { schoolId } in every addDoc/updateDoc       │
│  5. DEPS:   [schoolId] in every useEffect that uses it           │
│                                                                  │
│  If all 5 are present → the feature is tenant-safe ✅            │
│  If any one is missing → it is a multi-tenancy bug ❌            │
└──────────────────────────────────────────────────────────────────┘
```

---

*Document maintained by the Avenir SIS development team.*  
*Last updated: April 18, 2026 — Firestore rules gaps closed (cbt_sessions create, mail create); DataMigration tool updated to include mail collection.*
