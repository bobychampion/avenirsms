# KIS Portal Feedback — Analysis

**Source:** `SUGGESTIONS FOR KIS PORTAL.docx` — client feedback from Toba Ade-Balogun
(created 2026-08-29, last edited 2026-08-31), collecting teacher requests from
**Koper International School** (KIS) about the **Teacher Portal**.

The doc includes 3 screenshots, all marked with red boxes / crosses ("remove / fix these"):

1. Messages "Select a conversation" search — guardians listed twice.
2. Curriculum Coverage bar + "Upcoming Lessons" — crossed out.
3. Assignments tab — crossed out.

Each item below is the verbatim intent from the doc, mapped to where it lives in the
code and what it takes to do.

## Status

| # | Item | Status |
|---|------|--------|
| 1 | Gradebook — 1/3/5 grade descriptors | ✅ Done |
| 4 | Messages — guardians showing double | ✅ Done |
| 5 | Messages — show full guardian/contact list | ✅ Done |
| 8 | Behaviour — remove "Sports" (now configurable) | ✅ Done |
| 7 | Alert admin when attendance isn't taken (timetable-driven) | ✅ Done — needs 1 deploy step |
| 10 | Curriculum — remove the percentage/coverage bar | ✅ Done |
| 12 | Remove Assignments tab (now a school toggle) | ✅ Done |

Not started: #2, #3.

**#7 post-deploy step:** add repo secrets `ATTENDANCE_WATCH_URL` +
`CRON_SECRET`, then `firebase deploy --only firestore:indexes`.

### How to configure the new toggles (School Settings → Academic)
- **#1** — set Grading Mode to *Single Grade*, add a band with grade values `1`,
  `3`, `5`, and type a description next to each (e.g. `3` → "Meeting the standard").
  The descriptor then shows in the Gradebook picker and on report cards.
- **#8** — *Behaviour Traits*: click a trait (e.g. Sports) to switch it off. It
  disappears from the teacher Behaviour tab, the parent portal and report cards.
- **#12** — *Modules*: untick **Assignments** to hide the Assignments tab from the
  teacher and parent portals.

---

## Item-by-item analysis

### 1. Gradebook — grade descriptions (1 / 3 / 5 scale)

> "3 – meeting the standard, 5 – they should be fast tracked, 1 – below the expected standard…"

- **What they want:** a `single_grade` scale using **1/3/5** with those exact descriptor
  labels, instead of letters/percentages.
- **In code:** already supported in principle. `src/pages/Gradebook.tsx:125` handles
  `single_grade` mode ("teacher picks a value directly — no score"), and the scale itself
  comes from `gradebookGrading.customGradingScale` (`src/types.ts:278-286`,
  `GRADING_SYSTEM_OPTIONS` at `src/types.ts:804`).
- **Work:** Configuration, not new code — set KIS's school grading system to Single Grade
  and enter a custom scale
  `{1: "Below the expected standard", 3: "Meeting the standard", 5: "Should be fast-tracked"}`.
  Verify the custom-scale editor in School Settings accepts numeric values + long
  descriptors and that Report Cards render the descriptor.
- **Effort: S** (mostly setup + a rendering check).

### 2. Gradebook — more than one grade per year (~6)

> "The option to add more than one grade (6 per year I think)"

- **What they want:** multiple gradebook entries per subject per year — 6 assessment
  columns, not one grade per term.
- **In code:** Gradebook is keyed by **term** only —
  `where('term', '==', selectedTerm)` (`src/pages/Gradebook.tsx:86`), and the `Grade`
  record has no assessment/sequence field (`src/types.ts:278-286`). With 3 terms you get
  3 data points max.
- **Work:** Real schema change. Add an `assessmentIndex` / `assessmentLabel` to the grade
  doc key, UI to add/switch assessment columns, and roll-up logic for report cards
  (average? latest? weighted?). Touches Gradebook, ReportCards, ParentPortal, Firestore
  indexes.
- **Effort: L.** Needs a spec decision from KIS on how the 6 grades combine into a
  term/annual result.

### 3. Messages — "All Parents in same year" broadcast button

> "a button that will say 'All Parents' … send to all parents of the same year"

- **In code:** messaging is 1:1 only. `guardianContacts` is built per-student
  (`src/pages/TeacherPortal.tsx:170`) and send is single-`receiverId`
  (`src/pages/TeacherPortal.tsx:1503`). No fan-out.
- **Work:** Add an "All Parents – Year X" pseudo-recipient that expands to every guardian
  of the selected class/year and writes N message docs (or one broadcast doc the parent
  portal reads). Reuse the guardian-UID fan-out already written for notifications at
  `src/pages/TeacherPortal.tsx:1079-1085`.
- **Effort: M.** Decide: true per-parent threads (so replies work) vs. one-way
  announcement.

### 4. Messages — guardians showing double  ★ confirmed bug — ✅ DONE

> "The guardians are showing double."

- **Root cause found:** `src/pages/TeacherPortal.tsx:176-181` deliberately added each
  guardian **twice** when they had both a `guardianUserId` and a `guardianEmail` — once
  keyed by UID, once keyed by email:

  ```
  const id = s.guardianUserId || s.guardianEmail;
  if (id && !seen.has(id)) { ...push... }
  if (s.guardianUserId && s.guardianEmail && !seen.has(s.guardianEmail)) { ...push again... }
  ```

  This is exactly what the screenshot showed (Valentina Mamaikina ×2, Yutong Chen ×2).
- **Fix applied:** `guardianContacts` now builds **one row per guardian** (`id` = linked
  uid, else email). Added an `aliasIds` array holding every id form the guardian can be
  addressed by; `contactNameMap` and the `knownIds` resolver iterate `aliasIds`, so
  inbound messages addressed by either uid or email still resolve to a name (the reason
  the dual-indexing existed). Also dedupes a guardian with multiple children in the
  teacher's classes. The "New Conversation" search dropdown consumes `guardianContacts`
  directly, so it inherits the dedupe.
- **Effort: S.** Verified via `tsc --noEmit` (no new errors); not yet browser-verified.

### 5. Messages — filter to show all guardians of the teacher's students

> "can you set the filter to show all guardians of the teacher's students"

- **In code:** `guardianContacts` already only includes guardians of students the teacher
  has visibility over (`src/pages/TeacherPortal.tsx:167-181`), and search filters that
  list (`src/pages/TeacherPortal.tsx:2534`). The complaint is likely that the picker shows
  a short "SUGGESTED" slice, not the full roster.
- **Work:** Show the full guardian list (grouped by class) when the search box is empty,
  instead of a truncated suggestion set.
- **Effort: S.** Pairs naturally with #4.

### 6. Attendance — separate secondary students by subject — ✅ DONE

> "James does not write attendance for the whole A level class … set the subject
> attendance to show just the students attending the subjects of the teacher"

- **In code:** the `subject_attendance` tab (gated on `attendanceMode !== 'daily_only'`)
  previously listed **every** student in the class.
- **Turned out to be small:** the enrolment model already exists —
  `class_subjects.enrolledStudentIds` (a non-empty array = only those students take the
  subject), set per class+subject by admins in **Class Management → enrolment mode
  "Selected"**, and already respected by the Gradebook.
- **Fix applied:** the Subject Attendance tab now subscribes to the `class_subjects` doc
  for the selected class + subject and filters its roster to `enrolledStudentIds` when the
  list is non-empty (whole class otherwise). Save, the Present/Absent/Late tallies and the
  empty state all follow the filtered roster; a "Showing N students enrolled in {subject}"
  hint appears when a filter is active. Mirrors `Gradebook.tsx`'s elective logic; no new
  Firestore index (equality-only query).
- **Effort: S.** For KIS: set each split subject's enrolment to "Selected" in Class
  Management and tick the students; confirm `attendanceMode` is `daily_and_subject` or
  `subject_only` so the tab is visible.

### 7. Admin notification when a teacher isn't in class — ✅ DONE (needs one deploy step)

> "Does Admin get a notification if a teacher isn't in class? ... some schools don't use
> geofencing so use the timetable — if the class starts and the teacher hasn't recorded
> attendance within a stipulated time adjusted by the admin, it just sends notice to the
> admin."

- **Design (timetable-driven, no GPS):** if a timetabled lesson has started and **no
  attendance — daily *or* subject — has been recorded for that class today**, once the
  admin-set grace period elapses, every school admin gets a `notifications` doc
  (`type: 'attendance'`) plus an FCM push.
- **Fix applied:**
  - `api/_lib/jobs.ts` → `runAttendanceWatch`, dispatched by `api/cron/index.ts` at
    `/api/cron?job=attendance-watch`. Per school with alerts enabled: resolves "now" in
    the school's timezone, walks today's `timetables`, and for each lesson whose
    `start + grace` is within the last 90 min checks `attendance` (by class + date) and
    `subjectAttendance` (by className + subjectName + date). If neither exists it alerts
    every `admin` / `School_admin` user. Idempotent via an
    `attendance_alerts/{school_date_class_period}` marker (one alert per lesson, ever);
    markers self-purge after 3 days.
  - All cron work was consolidated into one dispatcher function in the same change —
    Vercel Hobby caps the project at 12 Serverless Functions and the new endpoint had
    pushed it to 13 (failed deploy). Now 10.
  - `school_settings.attendanceAlertsEnabled` (default **off**) +
    `attendanceAlertGraceMinutes` (default 15) — **School Settings → Attendance**, a
    checkbox and a minutes field.
  - `firestore.indexes.json` — added `subjectAttendance (schoolId, attendanceDate)`.
  - `.github/workflows/attendance-watch.yml` — pings the endpoint every 20 min on
    weekdays. It is **not** a Vercel cron: the Hobby plan caps crons at 2 (both used) and
    runs them once/day, too coarse for a "15 min after class starts" check.
- **Deploy step (once):** add repo secrets `ATTENDANCE_WATCH_URL`
  (`https://www.avenirsms.com.ng/api/cron?job=attendance-watch`) and `CRON_SECRET` (same
  value as the Vercel env var), then run `firebase deploy --only firestore:indexes`. Any
  external scheduler (cron-job.org, etc.) hitting that URL with the bearer token works as
  an alternative to GitHub Actions.
- **Effort: M.** Delivered.

### 8. Behaviour — remove "Sports"

> "Behaviour: remove sports"

- **In code:** `sports` is a hard-coded key in `StudentSkills` (`src/types.ts:243-250`)
  and `SKILL_LABELS` (`src/types.ts:252-259`), consumed by TeacherPortal, ParentPortal,
  ReportCards, plus the default at `src/pages/TeacherPortal.tsx:941`.
- **Work:** Removing it globally is a type change affecting 3 portals + existing saved
  records (which still carry a `sports` field — harmless, just ignored). Cleaner long-term
  fix: make the behaviour trait list **school-configurable** (same pattern as the grading
  system in commit 326b239).
- **Effort: S** to drop it globally, **M** to make it configurable. Since this is one
  school's preference, configurable is the right call.

### 9. Cover teacher — separate login for attendance & comments — ✅ DONE

> "a separate login for attendance and comments"

- **Already there:** `src/pages/CoverManager.tsx` already lets an admin assign an existing
  staff member as cover for a specific period/date, stored in `cover_assignments`
  (`coverTeacherId`, `className`, `subject`, `date`, `status`). The Firestore rules for
  `attendance`, `subjectAttendance` and `student_skills` already allow any teacher in the
  school to write — so the whole gap was **client-side**: the covered class never showed
  in the cover teacher's portal (the onboarding docs told admins to hack it via the form
  tutor field).
- **Fix applied (frontend only — no new role, no rules or index change):**
  - `useTeacherAssignments` now also loads `cover_assignments` where
    `coverTeacherId == me`, keeps only rows for **today** with `status: 'assigned'`, and
    exposes `coverClassNamesToday` / `coverSubjectsByClassToday` / `isCoveringToday()`.
    Deliberately **not** merged into `assignedClassNames` / `subjectsByClass`, so Gradebook,
    Curriculum and Assignments stay locked to owned classes.
  - `TeacherPortal` derives `attendanceClasses = own ∪ cover-today` and uses it for the
    **Attendance**, **Subject Attendance** and **Behaviour** tab pickers, the Home
    "attendance not marked" banner and the Today panel. Covered classes show a
    "Cover · today" badge and a `(cover)` suffix in the dropdown. Save handlers already
    key off `selectedClass`, so nothing else was needed.
- **Effort: M** (was L — the admin side + rules were already done).
- **For KIS:** cover teachers must be **existing staff accounts**. Admin assigns cover in
  **Cover Manager**; the covered class then appears in that teacher's portal for that day,
  attendance + behaviour only.

### 10. Curriculum — remove the percentage/coverage bar — ✅ DONE

> "Remove the percentage bar in Curriculum coverage"

- **In code:** exactly `src/pages/TeacherPortal/CurriculumTracker.tsx:16-19` — the
  `{coverage}%` label + the `bg-slate-100 rounded-full h-2` bar. Screenshot 2 crosses out
  this whole block including "Upcoming Lessons".
- **Fix applied:** removed the `{coverage}%` figure and the progress bar from
  `CurriculumTracker.tsx`; card retitled "Curriculum Coverage" → "Curriculum"; the
  "Upcoming Lessons" list is kept. Dropped the now-unused `coverage` prop from both call
  sites (`CurriculumPage.tsx`, `TeacherOverview.tsx`).
- **Left in place (not flagged):** the separate "Course Progress" `{curriculumCoverage}%`
  metric card on the teacher overview dashboard (`MetricsGrid.tsx:84`) — remove separately
  if KIS wants that gone too.
- **Effort: XS.**

### 11. Curriculum — let teachers insert curriculum (subject + short description) — ✅ DONE

> "possibility to insert curriculum. So just the subject and a small description."

- **In code:** teachers only had a **read-only** tracker; authoring lived in the
  admin-only `CurriculumMapping.tsx`. The Firestore rules for `curriculum_items` already
  allowed teachers to create/update/delete in their school, and `useTeacherOverviewData`
  already surfaces `curriculum_items` (by `schoolId + level + term`) as "Upcoming Lessons".
- **Fix applied:** `src/pages/TeacherPortal/CurriculumPage.tsx` gained a **"My Curriculum
  Entries"** card — a subject dropdown (their assigned subjects) + a short-description
  field → writes a `curriculum_items` doc with `source: 'teacher'`, `createdBy: <uid>`,
  `level: <selected class>`, `term: <current term>`. Below it, a live list of that
  teacher's own entries with a covered/not-covered toggle and delete. Entries flow
  straight into the tracker's "Upcoming Lessons" above (same collection + query). No new
  type work beyond `CurriculumItem.createdBy` + `source: 'teacher'`; no rules or index
  change (equality-only query).
- **Effort: M.** For KIS: teachers open **Curriculum**, pick the class, and add rows;
  they only see and manage their own.

### 12. Curriculum / nav — remove Assignments

> "Remove assignments."

- **In code:** the `assignments` tab at `src/pages/TeacherPortal.tsx:1291`, its data
  subscription (`src/pages/TeacherPortal.tsx:400-402`), the `filteredAssignments` UI
  (`src/pages/TeacherPortal.tsx:2251-2296`), `useTeacherAssignments` hook, and the
  parallel view in ParentPortal.
- **Work:** Hide the tab (1 line) — easy. But **KIS-specific**, so make it a school
  feature flag rather than deleting it for every tenant. Also check nothing else routes to
  `assignments` (e.g. `navigateTab('assignments')`).
- **Effort: S** as a flag.

---

## Suggested priority order

| # | Item | Effort | Notes |
|---|------|--------|-------|
| 4 | Guardians showing double | **S** | ✅ Done |
| 10 | Remove curriculum % bar | **XS** | ✅ Done |
| 5 | Full guardian list in Messages | S | ✅ Done |
| 1 | 1/3/5 grade descriptors | S | ✅ Done — optional `gradeLabels` per grade band |
| 8 | Remove "Sports" from Behaviour | S→M | ✅ Done — configurable `hiddenBehaviourTraits` |
| 12 | Remove Assignments tab | S | ✅ Done — `assignmentsModuleEnabled` school toggle |
| 6 | Subject-only attendance roster | S | ✅ Done — filters by `class_subjects.enrolledStudentIds` |
| 3 | "All Parents" broadcast | M | Needs one-way vs. threaded decision |
| 11 | Teacher-authored curriculum | M | ✅ Done — "My Curriculum Entries" in the teacher Curriculum tab |
| 7 | Alert admin when attendance not taken | M | ✅ Done — `/api/cron?job=attendance-watch` + GH Actions ping |
| 2 | 6 grades per year | **L** | Schema change — get spec from KIS |
| 9 | Cover-teacher login | M | ✅ Done — `cover_assignments` surfaced in teacher portal (attendance + behaviour, today only) |

---

## Cross-cutting recommendation

Items 8 and 12 (and arguably 1) are one school's preferences, not universal. Rather than
editing shared types/tabs, extend the school-settings feature-flag pattern already used
for the grading system (commit 326b239) so KIS's changes don't affect the other 3
schools.
