# Teacher portal roster correction

The gradebook resolves a permitted subject before displaying it or querying records. A History-only teacher therefore sees History students and History grades, including after changing classes. Grade saves validate the teacher's class and subject assignment. Missing or inactive subject assignments do not expand to the entire class; form tutors keep their existing access.

My Students uses the union of enrolments for the teacher's subjects in the selected class. Behaviour uses the same teaching roster and additionally includes enrolments for subjects covered today. Overlapping students appear once. Existing whole-class subjects and form tutors retain access to the active class roster. Daily attendance continues to use the class register.

Subject enrolments update through a live listener. Previous class results and late callbacks cannot populate the new class roster. Behaviour reads ignore superseded class/term/session responses, and saves are limited to the visible teaching roster. A selection change during a save lookup cancels that save.

No saved grades, skills, enrolments or class membership are migrated or deleted by this change. Existing Behaviour records remain class/term records used by report cards.

Subject Attendance now includes an early departure form in both the teacher and admin portals. The student selector uses the subject register; records retain subject and optional timetable period, with the lesson prefilled. Subject views show their enrolled students' selected-lesson and daily departure evidence; daily/monthly registers continue to show departures across subjects. The teacher subject register also waits for current enrolments and no longer expands to the class roster on loading or read errors.

Deployment correction: Koper's configured domain is `kisportal.koperinternationalschool.si`. It is served by Vercel, as is `www.avenirsms.com.ng`. The previous Firebase-only roster release did not update those domains; their old bundle lacked the roster correction. Publish the Git version through the Vercel integration and verify the custom domain, rather than treating a Firebase release as proof of the school domain's version.

Follow-up validation: all 114 tests in the 14 current source test files passed with nested worktrees excluded and one worker. This includes subject departure forms, saved subject/lesson metadata, roster filtering, form resets and independent attendance status. Parallel workers initially timed out; the single-worker run completed cleanly. Production build passed; TypeScript still reports the six existing errors above.

Regression coverage includes History-only defaults, class changes, overlapping subject enrolments, form tutors, cover subjects, inactive/missing assignments, withdrawn students, live roster refreshes, errors and old listener callbacks.

Validation: 177 tests passed (`npx vitest run src`), and the production build including the service worker succeeded. TypeScript reports the same six pre-existing errors in HrStaffAttendance, LessonCoverage, PayrollManagement, StudentPromotion, TeacherPortal's existing StudentSkillRecord payload type, and TimetableManagement. The initial broad test run also picked up an unrelated timing-sensitive expiration test in `.kilo/worktrees`; it passed on the subsequent run. No new type errors were reported for this correction.
