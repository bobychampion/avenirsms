import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { FirebaseProvider, useAuth } from './components/FirebaseProvider';
import ErrorBoundary from './components/ErrorBoundary';
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
import { Layout } from './components/Layout';

function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: 'admin' | 'applicant' | 'teacher' | 'parent' }) {
  const { user, profile, loading, isAdmin } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/" />;
  
  if (role === 'admin') {
    if (!isAdmin) return <Navigate to="/" />;
  } else if (role && profile?.role !== role) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

function AppContent() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/apply"
          element={
            <ProtectedRoute role="applicant">
              <Apply />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/students"
          element={
            <ProtectedRoute role="admin">
              <StudentList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/students/:id"
          element={
            <ProtectedRoute role="admin">
              <StudentProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/gradebook"
          element={
            <ProtectedRoute role="admin">
              <Gradebook />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/report-cards"
          element={
            <ProtectedRoute role="admin">
              <ReportCards />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute role="admin">
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute role="admin">
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/exams"
          element={
            <ProtectedRoute role="admin">
              <ExamManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/timetable"
          element={
            <ProtectedRoute role="admin">
              <TimetableManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/application/:id"
          element={
            <ProtectedRoute role="admin">
              <ApplicationDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher"
          element={
            <ProtectedRoute role="teacher">
              <TeacherPortal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/parent"
          element={
            <ProtectedRoute role="parent">
              <ParentPortal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/finance"
          element={
            <ProtectedRoute role="admin">
              <FinancialManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/classes"
          element={
            <ProtectedRoute role="admin">
              <ClassManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <SchoolCalendar />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <Router>
          <AppContent />
        </Router>
      </FirebaseProvider>
    </ErrorBoundary>
  );
}

export default App;
