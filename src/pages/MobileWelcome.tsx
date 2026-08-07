import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Building2, BookOpen, Users, GraduationCap, ChevronRight } from 'lucide-react';

const ROLES = [
  {
    key: 'admin',
    label: 'School Owner',
    sublabel: 'Admin · Principal',
    description: 'Manage your school, staff, finances and operations',
    Icon: Building2,
    from: '#4f46e5',
    to: '#7c3aed',
    route: '/login/admin',
  },
  {
    key: 'teacher',
    label: 'Teacher',
    sublabel: 'Educator · Form Tutor',
    description: 'Manage classes, grades, attendance and lessons',
    Icon: BookOpen,
    from: '#0284c7',
    to: '#0369a1',
    route: '/login/teacher',
  },
  {
    key: 'parent',
    label: 'Parent / Guardian',
    sublabel: 'Family',
    description: "Track your child's progress, fees and school news",
    Icon: Users,
    from: '#059669',
    to: '#0f766e',
    route: '/login/parent',
  },
  {
    key: 'student',
    label: 'Student',
    sublabel: 'Learner',
    description: 'Access your results and school updates',
    Icon: GraduationCap,
    from: '#d97706',
    to: '#b45309',
    route: '/login/student',
  },
] as const;

export default function MobileWelcome() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 60%, #0f172a 100%)' }}
    >
      {/* ── Header / Brand ── */}
      <motion.div
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="flex flex-col items-center pt-16 pb-6 px-6"
      >
        {/* Logo mark */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4 shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            boxShadow: '0 8px 32px rgba(79,70,229,0.5)',
          }}
        >
          <Building2 className="w-10 h-10 text-white" />
        </div>

        <h1
          className="text-3xl font-black tracking-tight text-white"
          style={{ letterSpacing: '-0.5px' }}
        >
          Avenir SIS
        </h1>
        <p className="text-indigo-300 text-xs font-semibold tracking-widest uppercase mt-1">
          School Information System
        </p>
      </motion.div>

      {/* ── Welcome text ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-center px-8 mb-8"
      >
        <h2 className="text-2xl font-bold text-white mb-1">Welcome!</h2>
        <p className="text-slate-400 text-sm">Who are you? Select your role to get started.</p>
      </motion.div>

      {/* ── Role cards ── */}
      <div className="flex-1 px-5 pb-10 flex flex-col gap-3">
        {ROLES.map((role, i) => (
          <motion.button
            key={role.key}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(role.route)}
            className="w-full text-left rounded-2xl overflow-hidden focus:outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex items-center gap-4 p-4">
              {/* Icon pill */}
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${role.from}, ${role.to})`,
                  boxShadow: `0 4px 16px ${role.from}55`,
                }}
              >
                <role.Icon className="w-7 h-7 text-white" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-bold text-white">{role.label}</span>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                    style={{
                      background: `${role.from}30`,
                      color: role.from,
                    }}
                  >
                    {role.sublabel}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-0.5 leading-snug truncate">{role.description}</p>
              </div>

              {/* Arrow */}
              <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
            </div>
          </motion.button>
        ))}
      </div>

      {/* ── Footer ── */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="text-center text-slate-600 text-[11px] pb-8"
      >
        Powered by Avenir SIS · Smart School Management
      </motion.p>
    </div>
  );
}
