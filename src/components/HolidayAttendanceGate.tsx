import React from 'react';
import { useSchoolHolidays } from '../hooks/useSchoolHolidays';
import { schoolHolidayOn } from '../utils/schoolHolidays';

export default function HolidayAttendanceGate({ schoolId, date, children }: { schoolId: string | null | undefined; date: string; children: React.ReactNode }) {
  const { holidays, loading, error } = useSchoolHolidays(schoolId);
  const holiday = schoolHolidayOn(date, holidays);
  if (loading) return <p role="status" className="p-5 text-sm text-slate-500">Checking school calendar…</p>;
  if (error) return <p role="alert" className="p-5 rounded-xl bg-amber-50 text-amber-800">{error}</p>;
  if (!holiday) return <>{children}</>;
  return <section role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-2">
    <h3 className="text-lg font-bold text-amber-900">Holiday — {holiday.title}</h3>
    <p className="text-sm text-amber-800">{holiday.date}{holiday.endDate && holiday.endDate !== holiday.date ? ` to ${holiday.endDate}` : ''} · Whole school</p>
    <p className="text-sm text-amber-800">No daily or subject attendance is required. This date is excluded from attendance totals. Holiday dates are managed in School Calendar.</p>
  </section>;
}
