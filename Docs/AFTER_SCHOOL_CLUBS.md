# School Activities: lessons and clubs

Administrators open **School Activities** in the sidebar (`/admin/activities`). The old Special Lessons and After-school Clubs links redirect here. Existing activities and attendance remain available without migration.

## Set up an activity

1. Choose **New activity** and select **Special lesson** or **After-school club**.
2. Enter a title. Suggestions such as Chess, Drama, Sports, Baking and Music fill an editable club title. Custom titles are supported.
3. Add a description, location and teacher leaders. Set the school year, term, optional dates, start/end time and weekly days using the date and time controls.
4. Search and select students from any classes, then save. Students can join multiple activities and retain their main class and academic enrolments.

The larger setup form includes a preview. Edit an activity to change its details, leaders, membership or status. Completed/inactive activities retain history and stop new marking and planning.

## Plan meetings and activities

Each workspace has **Overview**, **Members**, **Meetings & Plans** and **Attendance** tabs. Assigned teachers use **School Activities** in their portal. Administrators manage membership; assigned teachers can plan meetings and record attendance.

Choose **Plan meeting / weekly series**. Set the date, time, location and meeting leaders. Add planned exercises, projects, topics or rehearsals, then record completion and outcomes. To generate weekly meetings, select a repeat-until date and weekdays. The first chosen date is included, followed by selected weekdays. A series supports up to 80 meetings within one year. Each meeting can be edited independently.

Weekly days on the activity are a schedule template: meetings must be created individually or generated as a series. Once attendance is saved, meeting timing is locked; plans, outcomes and cancellation remain editable.

## Attendance and history

Open a meeting register or select it under **Attendance**. Mark every student before saving. **Mark all present** provides a starting point before individual changes. Present, absent, late and school-trip marks are supported. Future dates and dates outside the configured activity period cannot be saved. Re-saving updates that meeting's marks.

Two meetings on the same date have separate registers. **Export activity history CSV** includes meeting titles/times and students' main classes. Cancelled meetings retain their records but are excluded from workspace exports and School Activities attendance totals.

Select **Earlier date-based attendance** to view and correct existing dates from before this update. Create meetings for new attendance. Previously recorded students remain in exports even after membership changes. Current membership determines the marking roster.

Activity attendance is independent of daily and subject attendance. This update does not change parent dashboards or official daily attendance percentages. Testing previews use the production school database: use clearly named test activities and archive them afterwards.

## Administrator testing checklist

1. Create a test club using a suggested title, then customise it. Add a leader and students from two classes. Check the assigned teacher sees the same activity.
2. Create two meetings on the same date at different times. Give them different plans and attendance marks, save and reload. Confirm the registers remain separate.
3. Generate a short weekly series, then edit a single meeting's location, plan completion and outcomes.
4. Export attendance, cancel one recorded meeting and export again. Confirm the marks remain viewable but are excluded from the new export and totals.
5. Open an existing special lesson and earlier date-based attendance. Confirm existing information is available and daily/subject registers are unchanged.
6. Archive the test activity when finished.

## Verification

Frontend suite: `npm run test:run -- --dir src --maxWorkers=1 --pool=forks`.

`scripts/test-activity-rules.mjs` runs security checks against an isolated Firestore emulator and refuses non-demo projects. It checks school isolation, leader permissions, membership, cancellation, timing locks and atomic attendance writes without writing to the live school database.
