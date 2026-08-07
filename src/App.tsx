import React, { useEffect, lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { FirebaseProvider, useAuth } from './components/FirebaseProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { AppToaster } from './components/Toast';
import { SchoolProvider, useSchool } from './components/SchoolContext';
import { DomainSchoolProvider, useDomainSchool } from './components/DomainSchoolContext';
import { SuperAdminProvider, useSuperAdmin } from './components/SuperAdminContext';
import { ImpersonationProvider, useImpersonation } from './components/ImpersonationContext';
import { getPostAuthHomePath } from './utils/postAuthRedirect';
import type { UserProfile } from './types';
import LandingPage from './pages/LandingPage';
import SchoolLandingPage from './pages/SchoolLandingPage';
import Home from './pages/Home';
import Apply from './pages/Apply';
import AdminDashboard from './pages/AdminDashboard';
import ApplicationDetail from './pages/ApplicationDetail';
import StudentList from './pages/StudentList';
import StudentProfile from './pages/StudentProfile';
import StudentLifecycle from './pages/StudentLifecycle';
import TeacherPortal from './pages/TeacherPortal';
import ParentPortal from './pages/ParentPortal';
import SchoolCalendar from './pages/SchoolCalendar';
import MyProfile from './pages/MyProfile';
import FinancialManagement from './pages/FinancialManagement';
import Gradebook from './pages/Gradebook';
import ReportCards from './pages/ReportCards';
import ExamManagement from './pages/ExamManagement';
import TimetableManagement from './pages/TimetableManagement';
import ClassManagement from './pages/ClassManagement';
import UserManagement from './pages/UserManagement';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import AttendancePage from './pages/AttendancePage';
import SpecialLessons from './pages/SpecialLessons';
import StaffManagement from './pages/StaffManagement';
import PayrollManagement from './pages/PayrollManagement';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import CurriculumMapping from './pages/CurriculumMapping';
import LessonCoverage from './pages/LessonCoverage';
import AdmissionsManagement from './pages/AdmissionsManagement';
import StudentPromotion from './pages/StudentPromotion';
import SchoolSettingsPage from './pages/SchoolSettings';
import PinManagement from './pages/PinManagement';
import NotificationsManagement from './pages/NotificationsManagement';
import BulkStudentImport from './pages/BulkStudentImport';
import BulkStaffImport from './pages/BulkStaffImport';
import IntegrationSettings from './pages/IntegrationSettings';
import GoogleOAuthCallback from './pages/GoogleOAuthCallback';
import WhatsAppNotifications from './pages/WhatsAppNotifications';
import OnboardingTutorial from './pages/OnboardingTutorial';
import MobileWelcome from './pages/MobileWelcome';
import { Capacitor } from '@capacitor/core';
import CBTExamEngine from './pages/CBTExamEngine';
import AdminMobileDashboard from './pages/mobile/AdminMobileDashboard';
import TeacherMobileAttendance from './pages/mobile/TeacherMobileAttendance';
import ParentMobileHome from './pages/mobile/ParentMobileHome';
import { Layout } from './components/Layout';
import { StaffLayout } from './components/StaffLayout';
import AccountantPortal from './pages/AccountantPortal';
import HrPortal from './pages/HrPortal';
import LibraryPortal from './pages/LibraryPortal';
import RolesPermissions from './pages/RolesPermissions';
import ParentList from './pages/ParentList';
import SchoolDataReset from './pages/SchoolDataReset';
import DataPortability from './pages/DataPortability';
import DemoConvertPage from './pages/DemoConvertPage';
import HrLeave from './pages/hr/HrLeave';
import HrOnboarding from './pages/hr/HrOnboarding';
import HrPolicies from './pages/hr/HrPolicies';
import HrStaffAttendance from './pages/hr/HrStaffAttendance';
import LibraryCatalog from './pages/library/LibraryCatalog';
import LibraryCirculation from './pages/library/LibraryCirculation';
import LibraryFines from './pages/library/LibraryFines';
import MyLeavePage from './pages/staff/MyLeavePage';
import CoverManager from './pages/CoverManager';
import TripRegister from './pages/TripRegister';
import AbsenceRequests from './pages/AbsenceRequests';

// Super Admin pages — lazy-loaded (only needed by super_admin users)
const SuperAdminDashboard = lazy(() => import('./pages/super-admin/SuperAdminDashboard'));
const SchoolList = lazy(() => import('./pages/super-admin/SchoolList'));
const SchoolOnboarding = lazy(() => import('./pages/super-admin/SchoolOnboarding'));
const SchoolDetail = lazy(() => import('./pages/super-admin/SchoolDetail'));
const InvoiceGenerator = lazy(() => import('./pages/super-admin/InvoiceGenerator'));
const DataMigration = lazy(() => import('./pages/DataMigration'));

// Roles that have access to admin-level finance/payroll/analytics routes
const FINANCE_ROLES = ['admin', 'School_admin', 'accountant'] as const;

/** Shared loading spinner */
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-600 text-sm">Loading...</p>
    </div>
  </div>
);

type GuardRole =
  | 'admin'
  | 'School_admin'
  | 'applicant'
  | 'teacher'
  | 'parent'
  | 'super_admin'
  | 'accountant'
  | 'hr'
  | 'librarian'
  | 'staff';

function ProtectedRoute({
  children,
  role,
  roles,
  allowFinanceRoles,
  superAdminOnly,
}: {
  children: React.ReactNode;
  role?: GuardRole;
  /** Multi-role guard — caller's role must be in this list. */
  roles?: GuardRole[];
  /** When true, accountant + admin + School_admin may access this route */
  allowFinanceRoles?: boolean;
  /** When true, only super_admin can access this route */
  superAdminOnly?: boolean;
}) {
  const { user, profile, loading, isAdmin, isSuperAdmin } = useAuth();
  const { activeSchoolId } = useSuperAdmin();
  const { impersonatedProfile } = useImpersonation();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/" />;

  // Force password change if flagged (synthetic student login, admin reset, etc.)
  if (profile?.mustChangePassword && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  // Super admin "View As" session active: gate routes by the IMPERSONATED
  // role (never admin/super_admin — enforced server-side at session start),
  // so the super_admin actually sees the target user's portal.
  //
  // IMPORTANT: redirect to the impersonated user's own home, never to "/".
  // LandingPage's post-login redirect uses the REAL (super_admin) profile,
  // so bouncing to "/" while impersonating sends them to /super-admin, which
  // is itself superAdminOnly and bounces straight back to "/" — an infinite
  // redirect loop (this caused the "Maximum update depth exceeded" bug).
  if (isSuperAdmin && impersonatedProfile) {
    const effectiveRole = impersonatedProfile.role;
    const impersonatedHome = getPostAuthHomePath(
      ['admin', 'School_admin', 'accountant'].includes(effectiveRole),
      impersonatedProfile as unknown as UserProfile
    );
    // The Cloud Function/rules layer already rejects admin/super_admin
    // targets at session start, so effectiveRole here is never admin-like —
    // superAdminOnly routes are simply off-limits while impersonating.
    if (superAdminOnly) return <Navigate to={impersonatedHome} replace />;
    if (allowFinanceRoles) {
      if (!FINANCE_ROLES.includes(effectiveRole as any)) return <Navigate to={impersonatedHome} replace />;
      return <>{children}</>;
    }
    if (role && effectiveRole !== role) return <Navigate to={impersonatedHome} replace />;
    if (roles && roles.length > 0 && !roles.includes(effectiveRole as GuardRole)) {
      return <Navigate to={impersonatedHome} replace />;
    }
    return <>{children}</>;
  }

  // Super-admin-only routes (migration tool, platform dashboard, school management)
  if (superAdminOnly) {
    if (!isSuperAdmin) return <Navigate to="/" />;
    return <>{children}</>;
  }

  // Super admin trying to access school routes:
  // - If they've entered a school context → allow through
  // - Otherwise redirect to their platform dashboard
  if (isSuperAdmin) {
    if (role === 'admin' || allowFinanceRoles) {
      if (!activeSchoolId) return <Navigate to="/super-admin" replace />;
      return <>{children}</>;
    }
    // super_admin-specific route
    if (role === 'super_admin') return <>{children}</>;
    return <Navigate to="/super-admin" replace />;
  }

  // Finance routes: allow admin, School_admin, and accountant
  if (allowFinanceRoles) {
    if (!profile?.role || !FINANCE_ROLES.includes(profile.role as any)) return <Navigate to="/" />;
    return <>{children}</>;
  }

  // Teachers trying to access admin routes → redirect to their portal
  if (role === 'admin' && profile?.role === 'teacher') {
    return <Navigate to="/teacher" replace />;
  }
  // Accountants trying to access admin routes → redirect to finance
  if (role === 'admin' && profile?.role === 'accountant') {
    return <Navigate to="/admin/finance" replace />;
  }

  if (role === 'admin') {
    if (!isAdmin) return <Navigate to="/" />;
  } else if (role && profile?.role !== role) {
    return <Navigate to="/" />;
  }

  if (roles && roles.length > 0) {
    if (!profile?.role || !roles.includes(profile.role as GuardRole)) {
      return <Navigate to="/" />;
    }
  }

  return <>{children}</>;
}

/**
 * Keeps the browser tab title and favicon in sync with the school's
 * branding settings stored in Firestore (school_settings/{schoolId}).
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function SyncDocumentTitle() {
  const { pathname } = useLocation();
  const { schoolName, faviconUrl } = useSchool();

  // Update tab title whenever the route or school name changes
  useEffect(() => {
    document.title = schoolName ? `${schoolName} — School Management` : 'School Management';
  }, [pathname, schoolName]);

  // Swap the <link rel="icon"> whenever the favicon URL changes
  useEffect(() => {
    if (!faviconUrl) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, [faviconUrl]);

  return null;
}

function RootRoute() {
  const { domainSchoolId, domainSchoolLoading } = useDomainSchool();
  // On the native mobile app skip the marketing landing page entirely
  if (Capacitor.isNativePlatform()) return <Navigate to="/welcome" replace />;
  if (domainSchoolLoading) return <PageLoader />;
  return domainSchoolId ? <SchoolLandingPage /> : <LandingPage />;
}

function AppContent() {
  return (
    <>
      <ScrollToTop />
      <SyncDocumentTitle />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* ── Standalone promotional landing page (no Layout wrapper) ── */}
          {/* On a school's own custom domain, this resolves to that school's own landing page instead. */}
          <Route path="/" element={<RootRoute />} />

          {/* ── Mobile app welcome / role picker (Capacitor native only) ── */}
          <Route path="/welcome" element={<MobileWelcome />} />

          {/* ── Per-school public pages (no login required) ── */}
          <Route path="/s/:schoolId" element={<SchoolLandingPage />} />
          <Route path="/s/:schoolId/apply" element={<Layout><Apply /></Layout>} />
          <Route path="/s/:schoolId/login" element={<Login />} />
          <Route path="/s/:schoolId/login/:role" element={<Login />} />

          {/* ── All app routes wrapped in Layout ── */}
          <Route path="/home" element={<Layout><Home /></Layout>} />
          <Route path="/login" element={<Login />} />
          <Route path="/login/:role" element={<Login />} />
          <Route path="/change-password" element={<ChangePassword />} />

          {/* Applicant (legacy — kept for existing logged-in applicant role) */}
          <Route path="/apply" element={<Layout><ProtectedRoute role="applicant"><Apply /></ProtectedRoute></Layout>} />

          {/* ── Super Admin platform routes ── */}
          <Route path="/super-admin" element={<Layout><ProtectedRoute superAdminOnly><SuperAdminDashboard /></ProtectedRoute></Layout>} />
          <Route path="/super-admin/schools" element={<Layout><ProtectedRoute superAdminOnly><SchoolList /></ProtectedRoute></Layout>} />
          <Route path="/super-admin/schools/new" element={<Layout><ProtectedRoute superAdminOnly><SchoolOnboarding /></ProtectedRoute></Layout>} />
          <Route path="/super-admin/schools/:schoolId" element={<Layout><ProtectedRoute superAdminOnly><SchoolDetail /></ProtectedRoute></Layout>} />
          <Route path="/super-admin/invoices" element={<Layout><ProtectedRoute superAdminOnly><InvoiceGenerator /></ProtectedRoute></Layout>} />

          {/* Admin routes */}
          <Route path="/admin" element={<Layout><ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute></Layout>} />
          <Route path="/admin/admissions" element={<Layout><ProtectedRoute role="admin"><AdmissionsManagement /></ProtectedRoute></Layout>} />
          <Route path="/admin/students" element={<Layout><ProtectedRoute role="admin"><StudentList /></ProtectedRoute></Layout>} />
          <Route path="/admin/students/:id" element={<Layout><ProtectedRoute role="admin"><StudentProfile /></ProtectedRoute></Layout>} />
          <Route path="/admin/students/:id/lifecycle" element={<Layout><ProtectedRoute role="admin"><StudentLifecycle /></ProtectedRoute></Layout>} />
          <Route path="/admin/gradebook" element={<Layout><ProtectedRoute role="admin"><Gradebook /></ProtectedRoute></Layout>} />
          <Route path="/admin/report-cards" element={<Layout><ProtectedRoute role="admin"><ReportCards /></ProtectedRoute></Layout>} />
          <Route path="/admin/users" element={<Layout><ProtectedRoute role="admin"><UserManagement /></ProtectedRoute></Layout>} />
          <Route path="/admin/roles" element={<Layout><ProtectedRoute role="admin"><RolesPermissions /></ProtectedRoute></Layout>} />
          <Route path="/admin/parents" element={<Layout><ProtectedRoute role="admin"><ParentList /></ProtectedRoute></Layout>} />
          <Route path="/admin/exams" element={<Layout><ProtectedRoute role="admin"><ExamManagement /></ProtectedRoute></Layout>} />
          <Route path="/admin/timetable" element={<Layout><ProtectedRoute role="admin"><TimetableManagement /></ProtectedRoute></Layout>} />
          <Route path="/admin/application/:id" element={<Layout><ProtectedRoute role="admin"><ApplicationDetail /></ProtectedRoute></Layout>} />
          <Route path="/admin/finance" element={<Layout><ProtectedRoute allowFinanceRoles><FinancialManagement /></ProtectedRoute></Layout>} />
          <Route path="/admin/classes" element={<Layout><ProtectedRoute role="admin"><ClassManagement /></ProtectedRoute></Layout>} />
          <Route path="/admin/attendance" element={<Layout><ProtectedRoute role="admin"><AttendancePage /></ProtectedRoute></Layout>} />
          <Route path="/admin/special-lessons" element={<Layout><ProtectedRoute role="admin"><SpecialLessons /></ProtectedRoute></Layout>} />
          <Route path="/admin/staff" element={<Layout><ProtectedRoute role="admin"><StaffManagement /></ProtectedRoute></Layout>} />
          <Route path="/admin/payroll" element={<Layout><ProtectedRoute allowFinanceRoles><PayrollManagement /></ProtectedRoute></Layout>} />
          <Route path="/admin/analytics" element={<Layout><ProtectedRoute allowFinanceRoles><AnalyticsDashboard /></ProtectedRoute></Layout>} />
          <Route path="/admin/curriculum" element={<Layout><ProtectedRoute role="admin"><CurriculumMapping /></ProtectedRoute></Layout>} />
          <Route path="/admin/lesson-coverage" element={<Layout><ProtectedRoute roles={['admin', 'School_admin', 'teacher']}><LessonCoverage /></ProtectedRoute></Layout>} />
          <Route path="/admin/promotion" element={<Layout><ProtectedRoute role="admin"><StudentPromotion /></ProtectedRoute></Layout>} />
          <Route path="/admin/pins" element={<Layout><ProtectedRoute role="admin"><PinManagement /></ProtectedRoute></Layout>} />
          <Route path="/admin/settings" element={<Layout><ProtectedRoute role="admin"><SchoolSettingsPage /></ProtectedRoute></Layout>} />
          <Route path="/admin/data-reset" element={<Layout><ProtectedRoute role="admin"><SchoolDataReset /></ProtectedRoute></Layout>} />
          <Route path="/admin/data-portability" element={<Layout><ProtectedRoute role="admin"><DataPortability /></ProtectedRoute></Layout>} />
          <Route path="/admin/convert-demo" element={<Layout><ProtectedRoute role="admin"><DemoConvertPage /></ProtectedRoute></Layout>} />
          <Route path="/admin/integrations/google" element={<Layout><ProtectedRoute role="admin"><IntegrationSettings /></ProtectedRoute></Layout>} />
          <Route path="/auth/google/callback" element={<ProtectedRoute role="admin"><GoogleOAuthCallback /></ProtectedRoute>} />
          <Route path="/admin/notifications" element={<Layout><ProtectedRoute role="admin"><NotificationsManagement /></ProtectedRoute></Layout>} />
          <Route path="/admin/bulk-import" element={<Layout><ProtectedRoute role="admin"><BulkStudentImport /></ProtectedRoute></Layout>} />
          <Route path="/admin/bulk-staff-import" element={<Layout><ProtectedRoute role="admin"><BulkStaffImport /></ProtectedRoute></Layout>} />
          <Route path="/admin/whatsapp" element={<Layout><ProtectedRoute role="admin"><WhatsAppNotifications /></ProtectedRoute></Layout>} />
          <Route path="/admin/migrate" element={<Layout><ProtectedRoute superAdminOnly><DataMigration /></ProtectedRoute></Layout>} />
          <Route path="/admin/cover" element={<Layout><ProtectedRoute role="admin"><CoverManager /></ProtectedRoute></Layout>} />
          <Route path="/admin/trips" element={<Layout><ProtectedRoute role="admin"><TripRegister /></ProtectedRoute></Layout>} />
          <Route path="/admin/absences" element={<Layout><ProtectedRoute role="admin"><AbsenceRequests /></ProtectedRoute></Layout>} />

          {/* Onboarding Tutorial — accessible to admin, teacher, parent */}
          <Route path="/onboarding" element={<Layout><ProtectedRoute><OnboardingTutorial /></ProtectedRoute></Layout>} />

          {/* Portals */}
          <Route path="/teacher" element={<Layout><ProtectedRoute role="teacher"><TeacherPortal /></ProtectedRoute></Layout>} />
          <Route path="/parent" element={<Layout><ProtectedRoute role="parent"><ParentPortal /></ProtectedRoute></Layout>} />

          {/* Student portal removed — redirect to home */}
          <Route path="/student/*" element={<Navigate to="/home" replace />} />

          {/* Accountant portal — dedicated landing + reuses /admin/finance pages */}
          <Route path="/accountant" element={<ProtectedRoute role="accountant"><StaffLayout role="accountant"><AccountantPortal /></StaffLayout></ProtectedRoute>} />
          <Route path="/accountant/leave" element={<ProtectedRoute role="accountant"><StaffLayout role="accountant"><MyLeavePage /></StaffLayout></ProtectedRoute>} />

          {/* HR portal + sub-pages */}
          <Route path="/hr" element={<ProtectedRoute roles={["hr", "admin", "School_admin"]}><StaffLayout role="hr"><HrPortal /></StaffLayout></ProtectedRoute>} />
          <Route path="/hr/staff" element={<Layout><ProtectedRoute roles={["hr", "admin", "School_admin"]}><StaffManagement /></ProtectedRoute></Layout>} />
          <Route path="/hr/leave" element={<ProtectedRoute roles={["hr", "admin", "School_admin"]}><StaffLayout role="hr"><HrLeave /></StaffLayout></ProtectedRoute>} />
          <Route path="/hr/onboarding" element={<ProtectedRoute roles={["hr", "admin", "School_admin"]}><StaffLayout role="hr"><HrOnboarding /></StaffLayout></ProtectedRoute>} />
          <Route path="/hr/policies" element={<ProtectedRoute roles={["hr", "admin", "School_admin"]}><StaffLayout role="hr"><HrPolicies /></StaffLayout></ProtectedRoute>} />
          <Route path="/hr/attendance" element={<Layout><ProtectedRoute roles={["hr", "admin", "School_admin"]}><HrStaffAttendance /></ProtectedRoute></Layout>} />

          {/* Librarian portal + sub-pages */}
          <Route path="/library" element={<ProtectedRoute roles={["librarian", "admin", "School_admin"]}><StaffLayout role="librarian"><LibraryPortal /></StaffLayout></ProtectedRoute>} />
          <Route path="/library/catalog" element={<ProtectedRoute roles={["librarian", "admin", "School_admin"]}><StaffLayout role="librarian"><LibraryCatalog /></StaffLayout></ProtectedRoute>} />
          <Route path="/library/circulation" element={<ProtectedRoute roles={["librarian", "admin", "School_admin"]}><StaffLayout role="librarian"><LibraryCirculation /></StaffLayout></ProtectedRoute>} />
          <Route path="/library/fines" element={<ProtectedRoute roles={["librarian", "admin", "School_admin"]}><StaffLayout role="librarian"><LibraryFines /></StaffLayout></ProtectedRoute>} />
          <Route path="/library/leave" element={<ProtectedRoute roles={["librarian", "admin", "School_admin"]}><StaffLayout role="librarian"><MyLeavePage /></StaffLayout></ProtectedRoute>} />

          {/* Calendar (all roles) */}
          <Route path="/calendar" element={<Layout><ProtectedRoute><SchoolCalendar /></ProtectedRoute></Layout>} />

          {/* My Profile (all roles) */}
          <Route path="/profile" element={<Layout><ProtectedRoute><MyProfile /></ProtectedRoute></Layout>} />

          {/* CBT Exam Engine — standalone full-screen (no Layout) */}
          <Route path="/cbt/:sessionId" element={<ProtectedRoute><CBTExamEngine /></ProtectedRoute>} />

          {/* ── Mobile PWA Quick-Action Pages (no Layout — MobileShell embedded) ── */}
          <Route path="/mobile/admin" element={<ProtectedRoute role="admin"><AdminMobileDashboard /></ProtectedRoute>} />
          <Route path="/mobile/teacher" element={<ProtectedRoute role="teacher"><TeacherMobileAttendance /></ProtectedRoute>} />
          <Route path="/mobile/parent" element={<ProtectedRoute role="parent"><ParentMobileHome /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </>
  );
}

function AppShell() {
  return (
    <ErrorBoundary>
      <DomainSchoolProvider>
        <FirebaseProvider>
          <SuperAdminProvider>
            <ImpersonationProvider>
              <SchoolProvider>
                <AppToaster />
                <AppContent />
              </SchoolProvider>
            </ImpersonationProvider>
          </SuperAdminProvider>
        </FirebaseProvider>
      </DomainSchoolProvider>
    </ErrorBoundary>
  );
}

const router = createBrowserRouter([
  { path: '*', element: <AppShell /> },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
