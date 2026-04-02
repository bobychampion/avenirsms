import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../components/FirebaseProvider';
import { motion } from 'motion/react';
import { CheckCircle, ShieldCheck, Database, GraduationCap, ArrowRight, UserPlus, ShieldAlert } from 'lucide-react';

export default function Home() {
  const { user, profile, login, isAdmin, authError, clearError } = useAuth();
  const navigate = useNavigate();

  const handleStart = () => {
    if (!user) {
      login();
    } else if (isAdmin) {
      navigate('/admin');
    } else if (profile?.role === 'teacher') {
      navigate('/teacher');
    } else if (profile?.role === 'parent') {
      navigate('/parent');
    } else {
      navigate('/apply');
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative py-24 overflow-hidden bg-white">
        <div className="absolute top-0 left-0 w-full h-full bg-slate-50 opacity-50 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-50 text-indigo-700 mb-6">
                <ShieldCheck className="w-4 h-4 mr-2" />
                NIN & Exam Database Integration
              </span>
              <h1 className="text-5xl font-extrabold text-slate-900 tracking-tight mb-6 sm:text-6xl">
                Smart Admissions for <span className="text-indigo-600">Nigerian Schools</span>
              </h1>
              <p className="text-xl text-slate-600 mb-10 leading-relaxed">
                Avenir streamlines the 6-3-3-4 enrollment process with NIN verification,
                WAEC/NECO result validation, and NERDC curriculum alignment.
              </p>

              {authError && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mb-8 p-4 bg-red-50 border border-red-200 rounded-2xl text-left flex items-start gap-4"
                >
                  <div className="bg-red-100 p-2 rounded-lg shrink-0">
                    <ShieldAlert className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-red-900 mb-1">Configuration Required</h3>
                    <p className="text-sm text-red-700 mb-3">{authError}</p>
                    <button 
                      onClick={clearError}
                      className="text-xs font-bold text-red-600 hover:text-red-800 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </motion.div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to={!user ? "/apply" : isAdmin ? "/admin" : profile?.role === 'teacher' ? "/teacher" : profile?.role === 'parent' ? "/parent" : "/apply"}
                  className="w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-200 flex items-center justify-center group"
                >
                  {!user ? 'Start Application' : 
                   isAdmin ? 'Go to Admin Dashboard' :
                   profile?.role === 'teacher' ? 'Go to Teacher Portal' :
                   profile?.role === 'parent' ? 'Go to Parent Portal' :
                   'Continue Application'}
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
                <button className="w-full sm:w-auto px-8 py-4 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center">
                  View Requirements
                </button>
                {!user && (
                  <Link 
                    to="/login"
                    className="w-full sm:w-auto px-8 py-4 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-all flex items-center justify-center"
                  >
                    Admin/Staff Login
                  </Link>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<UserPlus className="w-6 h-6 text-indigo-600" />}
              title="Seamless Registration"
              description="Easy-to-use multi-step forms for parents and students with document upload capabilities."
            />
            <FeatureCard
              icon={<ShieldAlert className="w-6 h-6 text-indigo-600" />}
              title="NIN Verification"
              description="Integrated with national ID databases to ensure identity authenticity and age eligibility."
            />
            <FeatureCard
              icon={<Database className="w-6 h-6 text-indigo-600" />}
              title="Exam Database Sync"
              description="Direct verification of WAEC and NECO results for senior secondary admissions."
            />
          </div>
        </div>
      </section>

      {/* Compliance Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-indigo-900 rounded-3xl p-12 text-white flex flex-col lg:flex-row items-center gap-12">
            <div className="lg:w-1/2">
              <h2 className="text-3xl font-bold mb-6">Built for the Nigerian 6-3-3-4 System</h2>
              <p className="text-indigo-100 text-lg mb-8">
                Our system is pre-configured with NERDC syllabus tracking and age-eligibility checks
                mandated by Nigerian educational regulations.
              </p>
              <ul className="space-y-4">
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 mr-3 text-indigo-400" />
                  Primary (6 years) - Age 6+ entry check
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 mr-3 text-indigo-400" />
                  Junior Secondary (3 years) - JSS 1-3
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 mr-3 text-indigo-400" />
                  Senior Secondary (3 years) - SSS 1-3
                </li>
              </ul>
            </div>
            <div className="lg:w-1/2 grid grid-cols-2 gap-4">
              <div className="bg-indigo-800/50 p-6 rounded-2xl border border-indigo-700">
                <p className="text-4xl font-bold mb-2">100%</p>
                <p className="text-indigo-200 text-sm">NERDC Syllabus Compliant</p>
              </div>
              <div className="bg-indigo-800/50 p-6 rounded-2xl border border-indigo-700">
                <p className="text-4xl font-bold mb-2">Real-time</p>
                <p className="text-indigo-200 text-sm">Credential Verification</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="bg-indigo-50 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
