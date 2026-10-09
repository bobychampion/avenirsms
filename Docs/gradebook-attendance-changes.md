# Gradebook and attendance changes

Each class/subject/academic year now has six assessment slots by default (two assigned to each term). Teachers can add further assessments, set names and dates, enter grades/scores and comments, and save changed cells. Assessment columns scroll while student names remain visible.

The existing `grades` collection remains the final term grade source for report cards. Existing grades and comments require no migration. Teachers can choose an assessment from the selected term as the final grade, then save the final grades. No average of discrete grade labels is calculated.

Assessment definitions are stored in `grade_assessments`; individual results are in `assessment_grades`. Assessment saves use deterministic document identifiers and revision checks in transactions. Concurrent changes are rejected rather than silently overwritten. Blank cells remain blank; notes-only assessments are supported. Once an assessment is saved, its term is fixed. Renaming or dating an assessment updates the saved history metadata without changing grades or comments.

Early departures use the separate `attendance_departures` collection. The record includes the student, date, departure time, reason, optional lesson and notes, recorder UID, and server timestamp. A departure does not replace present/late status or alter the existing attendance-rate calculation. Teachers append departure records; administrators retain restore permissions. Daily marking, mobile attendance, reports, monthly grids, parent views, and student profiles expose the log. Reports include counts and a departure CSV export.

Saturday and Sunday columns have violet shading in the monthly registers. Attendance colours and lesson indicators remain visible. A purple dot indicates a departure; clicking the cell shows its details, including in schools using daily-only attendance.

Assessment CSV exports include assessment ID, name, and date. Imports route assessment rows to `assessment_grades`, while CSVs without an assessment ID continue to import final grades. All three new collections are included in full school backups and restore ordering.

## Rollout

Deploy the updated `firestore.rules` before releasing the frontend. New collection access depends on these rules. No existing records need to be rewritten. Live Firestore access rules have not been exercised against a deployed database by the local tests.

## Manual acceptance checks

1. Open both gradebooks. Confirm six annual columns and preserved final grades/comments.
2. Save different results for the same student in two assessments. Reload and confirm both remain distinct.
3. Add Grade 7, name/date it, save results, and verify parent history and CSV output.
4. Switch class, subject, or academic year and confirm results remain isolated.
5. Choose an assessment from the selected term as final, save final grades, and check the report card.
6. Record a departure for a student marked late. Confirm both facts remain after saving attendance again.
7. Confirm the departure reason/time in desktop and mobile logs, monthly details, reports, parent views, and exports.
8. Inspect September 2026: weekends are 5–6, 12–13, 19–20, and 26–27. Check leap February and a month beginning on Sunday.
