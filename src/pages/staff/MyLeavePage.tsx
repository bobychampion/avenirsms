/**
 * Standalone "My Leave" page for non-teaching staff (accountant, librarian)
 * whose portals are dashboard-style rather than tabbed. Wraps the same
 * self-service panel used by TeacherPortal's "My Leave" tab and HR's own
 * self-submit flow.
 */
import React from 'react';
import { useSchoolId } from '../../hooks/useSchoolId';
import MyLeaveRequests from '../../components/MyLeaveRequests';

export default function MyLeavePage() {
  const schoolId = useSchoolId();
  return (
    <div className="max-w-3xl mx-auto p-6">
      <MyLeaveRequests schoolId={schoolId} />
    </div>
  );
}
