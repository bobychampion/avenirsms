import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { getPostAuthHomePath } from '../utils/postAuthRedirect';
import { UserProfile } from '../types';
import {
  ShieldCheck, Mail, Lock, ShieldAlert, User,
  GraduationCap, BookOpen, Briefcase, Users, Sparkles, Hash,
} from 'lucide-react';

type RegisterRole = 'applicant' | 'parent' | 'teacher' | 'staff';

interface RoleConfig {
  value: RegisterRole;
  label: string;
  description: string;
  icon: React.ReactNode;
  heading: string;
  tagline: string;
  kidFriendly?: boolean;
}

const ROLE_CONFIGS: Record<RegisterRole, RoleConfig> = {
  applicant: {
    value: 'applicant',
    label: 'Student / Applicant',
    description: 'Apply for admission or access your student portal',
    icon: <GraduationCap className="w-5 h-5" />,
    heading: 'Welcome, Student! 🎒',
    tagline: 'Enter your Student ID and password to sign in.',
    kidFriendly: true,
  },
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
  ROLE_CONFIGS.applicant,
  ROLE_CONFIGS.parent,
  ROLE_CONFIGS.teacher,
  ROLE_CONFIGS.staff,
];

function toProfileRole(r: RegisterRole): UserProfile['role'] {
  if (r === 'staff') return 'applicant';
  return r;
}

const URL_ROLE_ALIASES: Record<string, RegisterRole> = {
  student: 'applicant',
  applicant: 'applicant',
  parent: 'parent',
  teacher: 'teacher',
  staff: 'staff',
  admin: 'staff',
};

/** Resolve a Student ID to the school-issued login email stored on the student doc. */
async function resolveStudentLoginEmail(studentId: string, schoolId?: string): Promise<string | null> {
  try {
    const constraints = [where('studentId', '==', studentId.trim().toUpperCase())];
    if (schoolId) constraints.push(where('schoolId', '==', schoolId));
    const snap = await getDocs(query(collection(db, 'students'), ...constraints));
    if (snap.empty) return null;
    return (snap.docs[0].data().loginEmail as string) ?? null;
  } catch {
    return null;
  }
}

export default function Login() {
  const params = useParams<{ role?: string; schoolId?: string }>();
  const lockedRole: RegisterRole | null = params.role
    ? URL_ROLE_ALIASES[params.role.toLowerCase()] ?? null
    : null;
  const config = lockedRole ? ROLE_CONFIGS[lockedRole] : null;
  const isStudentLogin = lockedRole === 'applicant';
  const isKidFriendly = !!config?.kidFriendly;

  const { loginWithEmail, registerWithEmail, authError, clearError, user, profile, loading: authLoading, isAdmin } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [registerRole, setRegisterRole] = useState<RegisterRole>(lockedRole ?? 'applicant');
  const [passwordError, setPasswordError] = useState('');
  const [resolveError, setResolveError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!user || authLoading) return;
    navigate(getPostAuthHomePath(isAdmin, profile), { replace: true });
  }, [user, profile, authLoading, isAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setResolveError('');

    if (isRegistering && password !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setLoading(true);

    if (isRegistering) {
      await registerWithEmail(email, password, name, toProfileRole(registerRole), params.schoolId);
    } else if (isStudentLogin) {
      // Student login: resolve Student ID → loginEmail → sign in
      const loginEmail = await resolveStudentLoginEmail(studentId, params.schoolId);
      if (!loginEmail) {
        setResolveError(
          'No portal account found for that Student ID. ' +
          'Contact your school administrator if you believe this is an error.'
        );
        setLoading(false);
        return;
      }
      await loginWithEmail(loginEmail, password);
    } else {
      await loginWithEmail(email, password);
    }

    setLoading(false);
  };

  const handleSwitchMode = () => {
    setIsRegistering(!isRegistering);
    setPasswordError('');
    setResolveError('');
    setConfirmPassword('');
    clearError();
  };

  const headingText = config?.heading ?? (isRegistering ? 'Create your account' : 'Sign in to Avenir');
  const taglineText = config?.tagline;

  const wrapperClass = isKidFriendly
    ? 'min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gradient-to-br from-indigo-50 via-pink-50 to-amber-50'
    : 'min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8';

  const logoWrapperClass = isKidFriendly
    ? 'bg-indigo-600 p-4 rounded-full shadow-xl shadow-indigo-300 ring-4 ring-white'
    : 'bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-200';

  const cardClass = isKidFriendly
    ? 'bg-white py-8 px-4 shadow-2xl shadow-indigo-200/50 sm:rounded-3xl sm:px-10 border-2 border-white'
    : 'bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-3xl sm:px-10 border border-slate-100';

  return (
    <div className={wrapperClass}>
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className={logoWrapperClass}>
            {isKidFriendly ? <Sparkles className="w-10 h-10 text-white" /> : <ShieldCheck className="w-10 h-10 text-white" />}
          </div>
        </div>
        <h2 className={`mt-6 text-center font-extrabold text-slate-900 ${isKidFriendly ? 'text-3xl' : 'text-3xl'}`}>
          {headingText}
        </h2>
        {taglineText && (
          <p className="mt-2 text-center text-sm text-slate-600 px-6">{taglineText}</p>
        )}
        {/* Only show register toggle for non-student portals */}
        {!isStudentLogin && (
          <p className="mt-2 text-center text-sm text-slate-600">
            {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={handleSwitchMode} className="font-medium text-indigo-600 hover:text-indigo-500">
              {isRegistering ? 'Sign in instead' : 'Register now'}
            </button>
          </p>
        )}
        {/* Generic login: show role-based portal links */}
        {!lockedRole && !isRegistering && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {(['student', 'parent', 'teacher'] as const).map(r => (
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
        <div className={cardClass}>
          {/* Error display */}
          {(authError || resolveError) && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-700">{authError || resolveError}</p>
                <button
                  onClick={() => { clearError(); setResolveError(''); }}
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

            {/* ── Student login: Student ID field ── */}
            {isStudentLogin && !isRegistering ? (
              <div>
                <label className={`block font-bold mb-2 ${isKidFriendly ? 'text-base text-indigo-700' : 'text-sm text-slate-700'}`}>
                  Student ID
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="text" required value={studentId}
                    onChange={e => setStudentId(e.target.value.toUpperCase())}
                    className={`block w-full pl-10 pr-3 py-3 border rounded-xl bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm font-mono tracking-wide ${isKidFriendly ? 'border-indigo-200 text-lg py-4' : 'border-slate-200'}`}
                    placeholder="e.g. STU-2026-001"
                    autoCapitalize="characters"
                    autoComplete="username"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Your student ID was given to you by the school at enrolment.</p>
              </div>
            ) : (
              /* Standard email field for all non-student logins and registration */
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                    placeholder="you@example.com" />
                </div>
              </div>
            )}

            {/* Password */}
            <div>
              <label className={`block font-bold mb-2 ${isKidFriendly && !isRegistering ? 'text-base text-indigo-700' : 'text-sm text-slate-700'}`}>
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="password" required minLength={6} value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={`block w-full pl-10 pr-3 border rounded-xl bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm ${isKidFriendly && !isRegistering ? 'py-4 border-indigo-200' : 'py-3 border-slate-200'}`}
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
              className={`w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 transition-all ${
                isKidFriendly
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-base py-4 rounded-2xl shadow-lg shadow-indigo-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-sm'
              }`}
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                isRegistering ? 'Create Account' : isStudentLogin ? '🎒 Sign In' : 'Sign In'
              )}
            </button>
          </form>

          {/* Parent portal: show forgot password link */}
          {!isRegistering && !isStudentLogin && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Forgot your password?{' '}
              <a href={`mailto:admin@school.local?subject=Password Reset Request`}
                className="font-medium text-indigo-600 hover:text-indigo-500">
                Contact your school admin
              </a>
            </p>
          )}

          {/* Student portal: forgot hint */}
          {!isRegistering && isStudentLogin && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Forgot your password? Ask your teacher or school office to reset it for you.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
