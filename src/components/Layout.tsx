import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './FirebaseProvider';
import { GraduationCap, LogOut, User, LayoutDashboard, FileText, Calendar } from 'lucide-react';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, logout, login, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link 
            to={!user ? "/" : isAdmin ? "/admin" : profile?.role === 'teacher' ? "/teacher" : profile?.role === 'parent' ? "/parent" : "/apply"} 
            className="flex items-center space-x-2"
          >
            <div className="bg-indigo-600 p-2 rounded-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">Avenir SIS</span>
          </Link>

          <nav className="flex items-center space-x-4">
            {user ? (
              <>
                <Link
                  to="/calendar"
                  className="text-slate-600 hover:text-indigo-600 font-medium flex items-center px-3 py-2 rounded-md transition-colors"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Calendar
                </Link>
                {isAdmin ? (
                  <Link
                    to="/admin"
                    className="text-slate-600 hover:text-indigo-600 font-medium flex items-center px-3 py-2 rounded-md transition-colors"
                  >
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Admin Dashboard
                  </Link>
                ) : profile?.role === 'teacher' ? (
                  <Link
                    to="/teacher"
                    className="text-slate-600 hover:text-indigo-600 font-medium flex items-center px-3 py-2 rounded-md transition-colors"
                  >
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Teacher Portal
                  </Link>
                ) : profile?.role === 'parent' ? (
                  <Link
                    to="/parent"
                    className="text-slate-600 hover:text-indigo-600 font-medium flex items-center px-3 py-2 rounded-md transition-colors"
                  >
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Parent Portal
                  </Link>
                ) : (
                  <Link
                    to="/apply"
                    className="text-slate-600 hover:text-indigo-600 font-medium flex items-center px-3 py-2 rounded-md transition-colors"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    My Application
                  </Link>
                )}
                <div className="h-6 w-px bg-slate-200 mx-2" />
                <div className="flex items-center space-x-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-slate-900">{profile?.displayName}</p>
                    <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    title="Logout"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={login}
                className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md"
              >
                Sign In
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-grow">
        {children}
      </main>

      <footer className="bg-white border-t border-slate-200 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8 text-center md:text-left">
            <div>
              <div className="flex items-center justify-center md:justify-start space-x-2 mb-4">
                <div className="bg-indigo-600 p-1.5 rounded-lg">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold text-slate-900 tracking-tight">Avenir SIS</span>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed">
                Empowering Nigerian schools with smart, secure, and efficient management tools.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4">Quick Access</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/" className="text-slate-500 hover:text-indigo-600 transition-colors">Home</Link>
                </li>
                <li>
                  <Link to="/calendar" className="text-slate-500 hover:text-indigo-600 transition-colors">School Calendar</Link>
                </li>
                {user && (
                  <li>
                    <Link 
                      to={isAdmin ? '/admin' : profile?.role === 'teacher' ? '/teacher' : profile?.role === 'parent' ? '/parent' : '/apply'} 
                      className="text-slate-500 hover:text-indigo-600 transition-colors font-medium"
                    >
                      My Dashboard
                    </Link>
                  </li>
                )}
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4">Support</h4>
              <p className="text-slate-500 text-sm">
                Need help? Contact our support team at <br />
                <span className="font-medium text-indigo-600">support@avenir-sis.ng</span>
              </p>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-100 text-center">
            <p className="text-slate-400 text-xs">
              &copy; {new Date().getFullYear()} Avenir Smart School Management System. Built for Nigerian Excellence.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
