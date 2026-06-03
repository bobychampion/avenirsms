import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../components/FirebaseProvider';
import { getPostAuthHomePath } from '../utils/postAuthRedirect';
import { UserProfile } from '../types';
import {
  ShieldCheck, Mail, Lock, ShieldAlert, User,
  BookOpen, Briefcase, Users,
} from 'lucide-react';

type RegisterRole = 'parent' | 'teacher' | 'staff';

interface RoleConfig {
  value: RegisterRole;
  label: string;
  description: string;
  icon: React.ReactNode;
  heading: string;
  tagline: string;
}

const ROLE_CONFIGS: Record<RegisterRole, RoleConfig> = {
  parent: {
    value: 'parent',
    label: 'Parent / Guardian',
    description: "Monitor your child's academic progress and fees",
    icon: <Users className="w-5 h-5" />,
    heading: 'Parent Portal',
    tagline: "Stay connected with your child's school journey.",
  },
  teacher: {
    value: 'teacher',
    label: 'Teacher',
    description: 'Manage gradebooks, attendance and student skills',
    icon: <BookOpen className="w-5 h-5" />,
    heading: 'Teacher Portal',
    tagline: 'Sign in to manage your classes, grades and attendance.',
  },
  staff: {
    value: 'staff',
    label: 'Non-Teaching Staff',
    description: 'Access the staff portal for administrative tasks',
    icon: <Briefcase className="w-5 h-5" />,
    heading: 'Staff Portal',
    tagline: 'Sign in to access your work tools.',
  },
};

const ROLE_OPTIONS: RoleConfig[] = [
  ROLE_CONFIGS.parent,
  ROLE_CONFIGS.teacher,
  ROLE_CONFIGS.staff,
];

function toProfileRole(r: RegisterRole): UserProfile['role'] {
  if (r === 'staff') return 'applicant';
  return r;
}

const URL_ROLE_ALIASES: Record<string, RegisterRole | null> = {
  parent: 'parent',
  teacher: 'teacher',
  staff: 'staff',
  admin: 'staff',
};



export default function Login() {
  const params = useParams<{ role?: string; schoolId?: string }>();
  
  // Check if this is a student login attempt
  const isStudentLoginAttempt = params.role?.toLowerCase() === 'student';
  
  const lockedRole: RegisterRole | null = params.role
    ? (URL_ROLE_ALIASES[params.role.toLowerCase()] ?? null)
    : null;
  const config = lockedRole ? ROLE_CONFIGS[lockedRole] : null;

  const { loginWithEmail, registerWithEmail, authError, clearError, user, profile, loading: authLoading, isAdmin } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [registerRole, setRegisterRole] = useState<RegisterRole>(lockedRole ?? 'parent');
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
      await registerWithEmail(email, password, name, toProfileRole(registerRole), params.schoolId);
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

  const headingText = config?.heading ?? (isRegistering ? 'Create your account' : 'Sign in to Avenir');
  const taglineText = config?.tagline;

  // If this is a student login attempt, show informational message instead of login form
  if (isStudentLoginAttempt) {
    const parentLoginUrl = params.schoolId ? `/s/${params.schoolId}/login/parent` : '/login/parent';
    
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-200">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
          </div>
          <h2 className="mt-6 text-center font-extrabold text-slate-900 text-3xl">
            Student Login Discontinued
          </h2>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-3xl sm:px-10 border border-slate-100">
            <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
              <ShieldAlert className="w-6 h-6 text-blue-600 mb-3" />
              <p className="text-sm text-slate-700 mb-4">
                Student login has been discontinued. Parents can access student information through the parent portal.
              </p>
              
              <div className="space-y-3">
                <a
                  href={parentLoginUrl}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all bg-indigo-600 hover:bg-indigo-700 text-sm"
                >
                  <Users className="w-5 h-5" />
                  Go to Parent Portal
                </a>
                
                <div className="pt-3 border-t border-slate-200">
                  <p className="text-xs text-slate-600 mb-2">
                    Need help accessing your account?
                  </p>
                  <a
                    href="mailto:admin@school.local?subject=Parent Portal Access Help"
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    Contact your school administrator
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-200">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center font-extrabold text-slate-900 text-3xl">
          {headingText}
        </h2>

        {taglineText && (
          <p className="mt-2 text-center text-sm text-slate-600 px-6">{taglineText}</p>
        )}
        <p className="mt-2 text-center text-sm text-slate-600">
          {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={handleSwitchMode} className="font-medium text-indigo-600 hover:text-indigo-500">
            {isRegistering ? 'Sign in instead' : 'Register now'}
          </button>
        </p>
        {/* Generic login: show role-based portal links */}
        {!lockedRole && !isRegistering && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {(['parent', 'teacher'] as const).map(r => (
              <a
                key={r}
                href={params.schoolId ? `/s/${params.schoolId}/login/${r}` : `/login/${r}`}
                className="text-xs font-bold text-indigo-600 border border-indigo-200 rounded-full px-3 py-1 hover:bg-indigo-50 capitalize"
              >
                {r} portal →
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-3xl sm:px-10 border border-slate-100">
          {/* Error display */}
          {authError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-700">{authError}</p>
                <button
                  onClick={() => { clearError(); }}
                  className="mt-2 text-xs font-bold text-red-600 hover:text-red-800"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>

            {/* Register: role selector */}
            {isRegistering && !lockedRole && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">I am registering as</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map(opt => (
                    <button
                      key={opt.value} type="button"
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
              </div>
            )}

            {/* Register: locked-role badge */}
            {isRegistering && lockedRole && config && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                <span className="text-indigo-600">{config.icon}</span>
                <div>
                  <p className="text-xs font-bold text-indigo-800">Registering as {config.label}</p>
                  <p className="text-[11px] text-indigo-600/80 mt-0.5">{config.description}</p>
                </div>
              </div>
            )}

            {/* Register: full name */}
            {isRegistering && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input type="text" required value={name} onChange={e => setName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                    placeholder="e.g. Amaka Okonkwo" />
                </div>
              </div>
            )}

            {/* Email field */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                  placeholder="you@example.com" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="password" required minLength={6} value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                  placeholder="••••••••" />
              </div>
            </div>

            {/* Register: confirm password */}
            {isRegistering && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="password" required minLength={6} value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                    className={`block w-full pl-10 pr-3 py-3 border rounded-xl bg-white placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-sm ${
                      passwordError ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-indigo-500'
                    }`}
                    placeholder="••••••••" />
                </div>
                {passwordError && <p className="mt-1 text-xs text-red-600">{passwordError}</p>}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 transition-all bg-indigo-600 hover:bg-indigo-700 text-sm"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                isRegistering ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          {/* Forgot password link */}
          {!isRegistering && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Forgot your password?{' '}
              <a href={`mailto:admin@school.local?subject=Password Reset Request`}
                className="font-medium text-indigo-600 hover:text-indigo-500">
                Contact your school admin
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
