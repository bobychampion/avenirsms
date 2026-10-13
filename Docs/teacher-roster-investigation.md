# Teacher portal roster investigation — 12 October 2026

Investigation only. No application code, database records, assignments or deployment changed. Read-only queries against Koper International School and a local React/jsdom reproduction were used.

## Confirmed findings

### Gradebook: displayed subject can differ from the queried subject

TeacherPortal initializes `gradeSubject` from `allSubjects[0]` (Mathematics). Unlike subject attendance, it does not reconcile that state when teacher assignments arrive or the selected class changes. The subject dropdown renders only the teacher's allowed subjects, but retains the previous state value even when that value is absent from its options. React/native select then visibly shows the first available option while application state still contains Mathematics.

Minimal reproduction using the installed React and jsdom packages: controlled select state `Mathematics`, only option `History` => visible selected subject `History`, internal subject used for querying `Mathematics`.

Roster queries, grade queries, assessment context and saved grade payloads use the internal `gradeSubject`, not the visually selected option. There is no explicit assigned-subject validation in the grade save handler. This creates a risk of editing a different subject's grades under a misleading label; the investigation does not establish which past writes, if any, resulted from it.

The supplied screenshot precisely matches the live Year 12 Mathematics roster and first-term 2026/2027 grades: Matija C, Itzel B, Justin C. The live History assignment belongs to Isabel Blore and contains Lena Dimitrijević and Justin Tweedale. Their saved History grades are A and A. Both existing Year 12 History grade documents are inside the current History roster. No duplicate class/subject assignment documents were found in Koper's 188 assignment documents.

Relevant source: `src/pages/TeacherPortal.tsx:279` (initial state), `:291` (roster context), `:304` (roster lookup), `:1008` (grade lookup), `:1100` (save), `:2201` (dropdown). Subject attendance already reconciles its selected subject at `:783`.

### My Students and Behaviour: intentionally broad class roster in current implementation

The shared students listener queries school + `currentClass` and excludes withdrawn students. My Students renders that array directly, as does Behaviour. Neither uses the teacher's subject enrolments. Behaviour loads and saves class/term skills, rather than subject-specific skills.

For the Year 12 History teacher, this means all eight active Year 12 students can appear although only two take History. These screens need a distinct teaching roster; narrowing the shared array would also change daily attendance and other consumers that legitimately need a class register.

Relevant source: `src/pages/TeacherPortal.tsx:451` (shared listener), `:1625` (My Students count/list), `:1056` (skills load), `:1155` (skills save), `:2345` (Behaviour list).

## Scope and secondary risks

- This is not restricted to a single account. Among current valid class/teacher assignment pairs, 89 pairs across 15 teachers lack Mathematics and are not exempted by form-tutor access. These are potential cases for the default-subject mismatch, not confirmed affected user sessions.
- Koper has 73 assignment documents with explicit student rosters; subject filtering therefore matters beyond Year 12 History.
- An absent or empty enrolment list currently means whole class in both admin and teacher gradebooks. It cannot represent an explicitly empty elective roster. That is the existing data contract, not the cause of this screenshot.
- Gradebook roster lookups take the first matching class/subject document and do not select by lifecycle/session/term. No duplicates were found in Koper, so this is a secondary design risk rather than the observed cause.
- Twelve assignment documents reference class IDs absent from the school's current class collection. The assignment hook skips unresolved classes. This is a separate data-cleanup concern, not evidence that it caused the reported Year 12 issue.
- Admin Gradebook populates its subject dropdown with the full school subject list, avoiding the teacher-only dropdown mismatch in this example.

## Recommended correction, pending implementation

1. Resolve the actual permitted gradebook subject after assignments load and on every class change. Use that same resolved subject for the dropdown, reads, assessment context and saves. Block grade operations until class and subject are valid teacher assignments; do not fall back to all school subjects for a subject teacher.
2. Keep a whole-class roster for daily attendance. Build a separate teaching roster for My Students and Behaviour: union of students enrolled in subjects taught by that teacher in the selected class, deduplicated. Preserve full-class access for form tutors and explicitly handle today's subject cover access for Behaviour.
3. Apply the teaching roster to Behaviour loading and saving, while retaining its current class/term report-card record model. Prevent old class/term responses and hidden skill rows from being saved after selection changes.
4. Add regressions for a History-only teacher starting with Mathematics as the default, switching between classes with different subjects, multiple taught subjects with overlapping students, form tutors, cover teachers, and enrolment changes. Verify both portals against the same enrolment records.
5. Review potential historic wrong-subject writes separately before correcting any saved grades. Do not delete students or change class membership to fix this UI defect.

Still useful for confirming the exact user journey: reporting teacher and portal URL, especially whether the screenshot predates the latest frontend release. The identified mismatch exists in current source and also predates the annual assessment changes.
