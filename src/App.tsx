import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { FirebaseProvider, useAuth } from './components/FirebaseProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { AppToaster } from './components/Toast';
import { SchoolProvider } from './components/SchoolContext';
import LandingPage from './pages/LandingPage';
import Home from './pages/Home';
import Apply from './pages/Apply';
import AdminDashboard from './pages/AdminDashboard';
import ApplicationDetail from './pages/ApplicationDetail';
import StudentList from './pages/StudentList';
import StudentProfile from './pages/StudentProfile';
import TeacherPortal from './pages/TeacherPortal';
import ParentPortal from './pages/ParentPortal';
import SchoolCalendar from './pages/SchoolCalendar';
import FinancialManagement from './pages/FinancialManagement';
import Gradebook from './pages/Gradebook';
import ReportCards from './pages/ReportCards';
import ExamManagement from './pages/ExamManagement';
import TimetableManagement from './pages/TimetableManagement';
import ClassManagement from './pages/ClassManagement';
import UserManagement from './pages/UserManagement';
import Login from './pages/Login';
import AttendancePage from './pages/AttendancePage';
import StaffManagement from './pages/StaffManagement';
import PayrollManagement from './pages/PayrollManagement';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import CurriculumMapping from './pages/CurriculumMapping';
import AdmissionsManagement from './pages/AdmissionsManagement';
import StudentPromotion from './pages/StudentPromotion';
import SchoolSettingsPage from './pages/SchoolSettings';
import PinManagement from './pages/PinManagement';
import NotificationsManagement from './pages/NotificationsManagement';
import BulkStudentImport from './pages/BulkStudentImport';
import WhatsAppNotifications from './pages/WhatsAppNotifications';
import SeedData from './pages/SeedData';
import { Layout } from './components/Layout';

function ProtectedRoute({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: 'admin' | 'applicant' | 'teacher' | 'parent';
}) {
  const { user, profile, loading, isAdmin } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-600 text-sm">Loading...</p>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/" />;

  // Teachers trying to access admin routes → redirect to their portal
  if (role === 'admin' && profile?.role === 'teacher') {
    return <Navigate to="/teacher" replace />;
  }

  if (role === 'admin') {
    if (!isAdmin) return <Navigate to="/" />;
  } else if (role && profile?.role !== role) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

function AppContent() {
  return (
    <Routes>
      {/* ── Standalone promotional landing page (no Layout wrapper) ── */}
      <Route path="/" element={<LandingPage />} />

      {/* ── All app routes wrapped in Layout ── */}
      <Route path="/home" element={<Layout><Home /></Layout>} />
      <Route path="/login" element={<Layout><Login /></Layout>} />

      {/* Applicant */}
      <Route path="/apply" element={<Layout><ProtectedRoute role="applicant"><Apply /></ProtectedRoute></Layout>} />

      {/* Admin routes */}
      <Route path="/admin" element={<Layout><ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute></Layout>} />
      <Route path="/admin/admissions" element={<Layout><ProtectedRoute role="admin"><AdmissionsManagement /></ProtectedRoute></Layout>} />
      <Route path="/admin/students" element={<Layout><ProtectedRoute role="admin"><StudentList /></ProtectedRoute></Layout>} />
      <Route path="/admin/students/:id" element={<Layout><ProtectedRoute role="admin"><StudentProfile /></ProtectedRoute></Layout>} />
      <Route path="/admin/gradebook" element={<Layout><ProtectedRoute role="admin"><Gradebook /></ProtectedRoute></Layout>} />
      <Route path="/admin/report-cards" element={<Layout><ProtectedRoute role="admin"><ReportCards /></ProtectedRoute></Layout>} />
      <Route path="/admin/users" element={<Layout><ProtectedRoute role="admin"><UserManagement /></ProtectedRoute></Layout>} />
      <Route path="/admin/exams" element={<Layout><ProtectedRoute role="admin"><ExamManagement /></ProtectedRoute></Layout>} />
      <Route path="/admin/timetable" element={<Layout><ProtectedRoute role="admin"><TimetableManagement /></ProtectedRoute></Layout>} />
      <Route path="/admin/application/:id" element={<Layout><ProtectedRoute role="admin"><ApplicationDetail /></ProtectedRoute></Layout>} />
      <Route path="/admin/finance" element={<Layout><ProtectedRoute role="admin"><FinancialManagement /></ProtectedRoute></Layout>} />
      <Route path="/admin/classes" element={<Layout><ProtectedRoute role="admin"><ClassManagement /></ProtectedRoute></Layout>} />
      <Route path="/admin/attendance" element={<Layout><ProtectedRoute role="admin"><AttendancePage /></ProtectedRoute></Layout>} />
      <Route path="/admin/staff" element={<Layout><ProtectedRoute role="admin"><StaffManagement /></ProtectedRoute></Layout>} />
      <Route path="/admin/payroll" element={<Layout><ProtectedRoute role="admin"><PayrollManagement /></ProtectedRoute></Layout>} />
      <Route path="/admin/analytics" element={<Layout><ProtectedRoute role="admin"><AnalyticsDashboard /></ProtectedRoute></Layout>} />
      <Route path="/admin/curriculum" element={<Layout><ProtectedRoute role="admin"><CurriculumMapping /></ProtectedRoute></Layout>} />
      <Route path="/admin/promotion" element={<Layout><ProtectedRoute role="admin"><StudentPromotion /></ProtectedRoute></Layout>} />
      <Route path="/admin/pins" element={<Layout><ProtectedRoute role="admin"><PinManagement /></ProtectedRoute></Layout>} />
      <Route path="/admin/settings" element={<Layout><ProtectedRoute role="admin"><SchoolSettingsPage /></ProtectedRoute></Layout>} />
      <Route path="/admin/notifications" element={<Layout><ProtectedRoute role="admin"><NotificationsManagement /></ProtectedRoute></Layout>} />
      <Route path="/admin/bulk-import" element={<Layout><ProtectedRoute role="admin"><BulkStudentImport /></ProtectedRoute></Layout>} />
      <Route path="/admin/whatsapp" element={<Layout><ProtectedRoute role="admin"><WhatsAppNotifications /></ProtectedRoute></Layout>} />
      <Route path="/admin/seed" element={<Layout><ProtectedRoute role="admin"><SeedData /></ProtectedRoute></Layout>} />

      {/* Portals */}
      <Route path="/teacher" element={<Layout><ProtectedRoute role="teacher"><TeacherPortal /></ProtectedRoute></Layout>} />
      <Route path="/parent" element={<Layout><ProtectedRoute role="parent"><ParentPortal /></ProtectedRoute></Layout>} />

      {/* Calendar (all roles) */}
      <Route path="/calendar" element={<Layout><ProtectedRoute><SchoolCalendar /></ProtectedRoute></Layout>} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <SchoolProvider>
          <Router>
            <AppToaster />
            <AppContent />
          </Router>
        </SchoolProvider>
      </FirebaseProvider>
    </ErrorBoundary>
  );
}

export default App;
