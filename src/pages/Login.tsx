import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../components/FirebaseProvider';
import { getPostAuthHomePath } from '../utils/postAuthRedirect';
import { UserProfile } from '../types';
import { motion } from 'motion/react';
import { ShieldCheck, Mail, Lock, ArrowRight, ShieldAlert, User, GraduationCap, BookOpen, Briefcase, Users } from 'lucide-react';

type RegisterRole = 'applicant' | 'parent' | 'teacher' | 'staff';

const ROLE_OPTIONS: { value: RegisterRole; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'applicant',
    label: 'Student / Applicant',
    description: 'Apply for admission or access your student portal',
    icon: <GraduationCap className="w-5 h-5" />,
  },
  {
    value: 'parent',
    label: 'Parent / Guardian',
    description: 'Monitor your child\'s academic progress and fees',
    icon: <Users className="w-5 h-5" />,
  },
  {
    value: 'teacher',
    label: 'Teacher',
    description: 'Manage gradebooks, attendance and student skills',
    icon: <BookOpen className="w-5 h-5" />,
  },
  {
    value: 'staff',
    label: 'Non-Teaching Staff',
    description: 'Access the staff portal for administrative tasks',
    icon: <Briefcase className="w-5 h-5" />,
  },
];

// Map register role choices to UserProfile roles
function toProfileRole(r: RegisterRole): UserProfile['role'] {
  if (r === 'staff') return 'applicant'; // staff accounts are upgraded by admin
  return r;
}

export default function Login() {
  const { loginWithEmail, registerWithEmail, authError, clearError, user, profile, loading: authLoading, isAdmin } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [registerRole, setRegisterRole] = useState<RegisterRole>('applicant');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!user || authLoading) return;
    navigate(getPostAuthHomePath(isAdmin, profile), { replace: true });
  }, [user, profile, authLoading, isAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (isRegistering && password !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setLoading(true);
    if (isRegistering) {
      await registerWithEmail(email, password, name, toProfileRole(registerRole));
    } else {
      await loginWithEmail(email, password);
    }
    setLoading(false);
  };

  const handleSwitchMode = () => {
    setIsRegistering(!isRegistering);
    setPasswordError('');
    setConfirmPassword('');
    clearError();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-200">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          {isRegistering ? 'Create your account' : 'Sign in to Avenir'}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={handleSwitchMode}
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            {isRegistering ? 'Sign in instead' : 'Register now'}
          </button>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-3xl sm:px-10 border border-slate-100">
          {authError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-700">{authError}</p>
                <button 
                  onClick={clearError}
                  className="mt-2 text-xs font-bold text-red-600 hover:text-red-800"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>

            {/* ── REGISTER: Role selector ── */}
            {isRegistering && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  I am registering as
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRegisterRole(opt.value)}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                        registerRole === opt.value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <span className={`mt-0.5 shrink-0 ${registerRole === opt.value ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {opt.icon}
                      </span>
                      <div>
                        <p className={`text-xs font-bold leading-tight ${registerRole === opt.value ? 'text-indigo-800' : 'text-slate-700'}`}>
                          {opt.label}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{opt.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {registerRole === 'teacher' || registerRole === 'staff' ? (
                  <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <strong>Note:</strong> {registerRole === 'teacher' ? 'Teacher' : 'Staff'} accounts require admin approval before full access is granted. Your school administrator will be notified.
                  </p>
                ) : null}
              </div>
            )}

            {/* ── REGISTER: Full name ── */}
            {isRegistering && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all"
                    placeholder="e.g. Amaka Okonkwo"
                  />
                </div>
              </div>
            )}

            {/* ── Email ── */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* ── Password ── */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* ── REGISTER: Confirm password ── */}
            {isRegistering && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                    className={`block w-full pl-10 pr-3 py-3 border rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-sm transition-all ${
                      passwordError ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-indigo-500 focus:border-indigo-500'
                    }`}
                    placeholder="••••••••"
                  />
                </div>
                {passwordError && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">{passwordError}</p>
                )}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center">
                    {isRegistering ? 'Create Account' : 'Sign In'}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </span>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Or go back to</span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                to="/"
                className="w-full flex justify-center py-3 px-4 border border-slate-200 rounded-xl shadow-sm text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
              >
                Home Page
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
