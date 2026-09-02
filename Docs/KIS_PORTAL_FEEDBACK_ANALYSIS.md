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
| 4 | Messages — guardians showing double | ✅ Done |
| 10 | Curriculum — remove the percentage/coverage bar | ✅ Done |

All other items: not started.

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

### 6. Attendance — separate secondary students by subject

> "James does not write attendance for the whole A level class … set the subject
> attendance to show just the students attending the subjects of the teacher"

- **In code:** **already built.** There's a `subject_attendance` tab, gated on
  `attendanceMode !== 'daily_only'` (`src/pages/TeacherPortal.tsx:1285`), backed by a
  `subjectAttendance` collection (`src/pages/TeacherPortal.tsx:704-733`), with a subject
  picker driven by `mySubjectsForSelectedClass` (`src/pages/TeacherPortal.tsx:1299`).
- **Gap:** it still lists **every student in the class** (`subjectAttendanceRows` maps
  over all `students`, `src/pages/TeacherPortal.tsx:737`) rather than only those enrolled
  in that subject. There's no per-subject enrolment model — students aren't linked to
  subject sets.
- **Work:** Two options —
  (a) quick: KIS enables subject attendance mode in settings and teachers mark only the
  relevant rows (works today);
  (b) proper: add subject enrolment per student and filter the roster.
- **Effort: S** for (a) config, **L** for (b) enrolment model. Also verify KIS's
  `attendanceMode` isn't `daily_only` — if it is, the tab is hidden entirely and that's
  why they think it doesn't exist.

### 7. Admin notification when a teacher isn't in class

> "Does Admin get a notification if a teacher isn't in class?"

- **In code:** there's clock-in / geofence infrastructure (`checkInLoading`,
  `TeacherCheckIn`, "Outside school boundary" hero, `src/pages/TeacherPortal.tsx:259`) but
  **no absence alert** — nothing notifies admin when a teacher fails to clock in or leaves
  the boundary during a scheduled period.
- **Work:** Scheduled job (Vercel cron) that cross-refs timetable periods against
  `TeacherCheckIn` records and writes an admin `notifications` doc when a teacher has a
  class but no active check-in.
- **Effort: M.** New backend, per the Vercel migration architecture. Answer to their
  literal question today: **no.**

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

### 9. Cover teacher — separate login for attendance & comments

> "a separate login for attendance and comments"

- **In code:** no "cover/substitute teacher" role. Roles are staff/admin/etc.; portal
  access assumes the assigned class teacher.
- **Work:** New limited role or a per-day "cover assignment" that grants one teacher
  temporary attendance + behaviour-comment access to another's class. Auth, routing,
  Firestore rules.
- **Effort: L.** Relates to staff account routing work in commit 0343cf6.

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

### 11. Curriculum — let teachers insert curriculum (subject + short description)

> "possibility to insert curriculum. So just the subject and a small description."

- **In code:** teachers currently only get a **read-only** tracker
  (`src/pages/TeacherPortal/CurriculumTracker.tsx`) fed by `useTeacherOverviewData`;
  authoring lives in the separate `src/pages/CurriculumMapping.tsx` (1024 lines,
  admin-oriented, topic-list model). The "project plan for a logistics dashboard" text in
  screenshot 2 is an AI-generated topic from a bad source doc — they want to ditch that
  and just type it themselves.
- **Work:** Give teachers a minimal add form in the Curriculum tab — `subject` (from
  `mySubjectsForSelectedClass`) + free-text description — writing `CurriculumItem` docs.
  Lighter than exposing full CurriculumMapping.
- **Effort: M.**

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
| 5 | Full guardian list in Messages | S | Pairs with #4 |
| 1 | 1/3/5 grade descriptors | S | Config + render check |
| 8 | Remove "Sports" from Behaviour | S→M | Prefer school-configurable trait list |
| 12 | Remove Assignments tab | S | Behind a school flag |
| 6 | Subject-only attendance roster | S→L | Config today; enrolment model later |
| 3 | "All Parents" broadcast | M | Needs one-way vs. threaded decision |
| 11 | Teacher-authored curriculum | M | Minimal add form |
| 7 | Alert admin when teacher not in class | M | New Vercel cron |
| 2 | 6 grades per year | **L** | Schema change — get spec from KIS |
| 9 | Cover-teacher login | **L** | New role + rules |

---

## Cross-cutting recommendation

Items 8 and 12 (and arguably 1) are one school's preferences, not universal. Rather than
editing shared types/tabs, extend the school-settings feature-flag pattern already used
for the grading system (commit 326b239) so KIS's changes don't affect the other 3
schools.
