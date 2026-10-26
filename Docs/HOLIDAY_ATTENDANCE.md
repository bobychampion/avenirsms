# Calendar holidays and attendance

In **School Calendar**, create or edit an event with **Type: Holiday**, a start date, and an optional inclusive end date. For example, Autumn holiday from 26 October to 30 October covers all five days. A holiday with no end date covers its start date only; its title does not determine its duration.

The calendar drives all classes automatically:

- Daily and subject registers show **Holiday** and the event title. Teachers and administrators cannot mark those dates through the registers.
- Monthly attendance and parent calendars show **H**. Holiday dates are excluded from attendance counts and percentages, including any records saved before the holiday was entered.
- Scheduled missing-register and consecutive-absence alerts skip holiday dates. Financial reminders are unaffected.
- Editing or deleting the calendar holiday updates the registers. Existing student attendance records are retained; removing a holiday makes those records count again.
- Clubs and special activity meetings keep their separate registers, as an activity may take place during a school holiday.

Use the calendar end date to extend an existing single-day autumn holiday across the full break. Academic, sports and other event types do not close attendance. Google Calendar synchronisation includes the full date range when connected.

## Test

1. Create a clearly labelled test holiday spanning two dates, including a weekend or month boundary if desired.
2. Select each date in administrator and teacher daily/subject attendance. Confirm the Holiday notice replaces marking controls. A date outside the range should allow marking.
3. Load the monthly register and check H labels and attendance totals. Check the parent's attendance calendar too.
4. Edit the end date and confirm another open register updates. Delete the test event and confirm normal marking returns.

No per-student holiday attendance documents or automatic absence marks are created. Calendar data is school-scoped, with one shared holiday listener per school in the frontend.
