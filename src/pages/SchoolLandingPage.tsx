import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useDomainSchool } from '../components/DomainSchoolContext';
import {
  GraduationCap, MapPin, Phone, Mail, ArrowRight, Loader2, AlertTriangle,
  Facebook, Instagram, Globe, Twitter, Clock,
  Users, BookOpen, LayoutDashboard,
} from 'lucide-react';

interface SchoolInfo {
  schoolName: string;
  address?: string;
  phone?: string;
  email?: string;
  motto?: string;
  logoUrl?: string;
  primaryColor?: string;
  admissionsOpen?: boolean;
  schoolDescription?: string;
  heroBannerImageUrl?: string;
  applicationIntroText?: string;
  applicationDeadline?: string;
  socialLinks?: { facebook?: string; twitter?: string; instagram?: string; website?: string };
  // Stats (optional — shown when present)
  yearFounded?: number;
  studentCount?: number;
  staffCount?: number;
  gradesOffered?: string;    // e.g. "Nursery – SS3" or "Year 1–13"
  curriculumType?: string;   // e.g. "Nigerian National Curriculum", "Cambridge IGCSE"
}

async function resolveSchoolSettings(param: string): Promise<{ data: SchoolInfo; resolvedId: string } | null> {
  const direct = await getDoc(doc(db, 'school_settings', param));
  if (direct.exists()) return { data: direct.data() as SchoolInfo, resolvedId: param };

  const slugDoc = await getDoc(doc(db, 'school_slugs', param));
  if (slugDoc.exists()) {
    const { schoolId } = slugDoc.data() as { schoolId: string };
    const settings = await getDoc(doc(db, 'school_settings', schoolId));
    if (settings.exists()) return { data: settings.data() as SchoolInfo, resolvedId: schoolId };
  }

  return null;
}

function daysUntil(dateStr: string): number {
  const deadline = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || '#4f46e5').replace('#', '');
  if (h.length !== 6) return `rgba(79,70,229,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function SchoolLandingPage() {
  const { schoolId: urlParam } = useParams<{ schoolId: string }>();
  const { domainSchoolId } = useDomainSchool();
  const param = urlParam ?? domainSchoolId ?? undefined;

  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [resolvedId, setResolvedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!param) return;
    resolveSchoolSettings(param)
      .then(result => {
        if (result) { setSchool(result.data); setResolvedId(result.resolvedId); }
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [param]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (notFound || !school) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h1 className="text-2xl font-bold text-slate-800 mb-2">School Not Found</h1>
        <p className="text-slate-500 mb-6">This school link is invalid or has been removed.</p>
        <Link to="/" className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors">
          Go to Homepage
        </Link>
      </div>
    );
  }

  const primary = school.primaryColor || '#4f46e5';
  const acceptingApplications = school.admissionsOpen !== false;
  const deadlineDays = school.applicationDeadline ? daysUntil(school.applicationDeadline) : null;
  const applyPath = `/s/${resolvedId}/apply`;
  const loginPath = `/s/${resolvedId}/login`;
  const hasSocials = school.socialLinks && Object.values(school.socialLinks).some(v => v);
  const hasStats = school.yearFounded || school.studentCount || school.staffCount || school.gradesOffered || school.curriculumType;

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          minHeight: '78vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: '6rem',
          background: school.heroBannerImageUrl
            ? `linear-gradient(to bottom, ${hexToRgba(primary, 0.88)}, ${hexToRgba(primary, 0.96)}), url(${school.heroBannerImageUrl}) center/cover no-repeat`
            : `linear-gradient(155deg, ${primary} 0%, ${hexToRgba(primary, 0.78)} 100%)`,
        }}
      >
        {/* Dot texture */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)`,
            backgroundSize: '30px 30px',
          }}
        />

        {/* Staff login — top right */}
        <div style={{ position: 'absolute', top: '1.25rem', right: '1.5rem', zIndex: 10 }}>
          <Link
            to={loginPath}
            style={{
              fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)',
              textDecoration: 'none', fontWeight: 500,
              transition: 'color 0.15s',
            }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)'; }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
          >
            Staff login →
          </Link>
        </div>

        {/* Hero content */}
        <div
          style={{
            position: 'relative', zIndex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center', padding: '3rem 1.5rem 0',
            maxWidth: '680px', margin: '0 auto',
          }}
        >
          {/* Logo */}
          {school.logoUrl ? (
            <div style={{ marginBottom: '2rem', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.22))' }}>
              <img
                src={school.logoUrl}
                alt={`${school.schoolName} logo`}
                style={{
                  width: '112px', height: '112px', borderRadius: '50%',
                  objectFit: 'cover', display: 'block',
                  border: '4px solid rgba(255,255,255,0.38)',
                  background: 'rgba(255,255,255,0.12)',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: '112px', height: '112px', borderRadius: '50%',
                background: 'rgba(255,255,255,0.14)',
                border: '4px solid rgba(255,255,255,0.32)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '2rem',
                boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
              }}
            >
              <GraduationCap style={{ width: '52px', height: '52px', color: 'rgba(255,255,255,0.8)' }} />
            </div>
          )}

          {/* School name — serif */}
          <h1
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 'clamp(2.1rem, 5.5vw, 3.5rem)',
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.15,
              margin: '0 0 0.875rem',
              textShadow: '0 2px 20px rgba(0,0,0,0.18)',
            }}
          >
            {school.schoolName}
          </h1>

          {school.motto && (
            <p style={{
              fontSize: '1.05rem', color: 'rgba(255,255,255,0.68)',
              fontStyle: 'italic', margin: '0 0 1.125rem', lineHeight: 1.6,
            }}>
              "{school.motto}"
            </p>
          )}

          <span style={{
            fontSize: '0.68rem', letterSpacing: '0.2em',
            textTransform: 'uppercase', fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
          }}>
            Official Admissions Portal
          </span>
        </div>

        {/* Wave transition */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, lineHeight: 0, overflow: 'hidden' }}>
          <svg
            viewBox="0 0 1440 88"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', height: '88px' }}
            aria-hidden="true"
          >
            <path d="M0,44 C180,88 420,0 720,44 C1020,88 1260,0 1440,44 L1440,88 L0,88 Z" fill="#ffffff" />
          </svg>
        </div>
      </section>

      {/* ── Contact strip ─────────────────────────────────────────────────── */}
      {(school.address || school.phone || school.email) && (
        <div style={{ maxWidth: '56rem', margin: '-0.5rem auto 0', padding: '0 1.5rem' }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 4px 32px rgba(0,0,0,0.07)',
            border: '1px solid rgba(0,0,0,0.06)',
            padding: '1.5rem 2rem',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1.25rem',
            }}>
              {school.address && (
                <ContactItem icon={<MapPin style={{ width: '17px', height: '17px', color: primary, flexShrink: 0, marginTop: '2px' }} />}>
                  {school.address}
                </ContactItem>
              )}
              {school.phone && (
                <ContactItem icon={<Phone style={{ width: '17px', height: '17px', color: primary, flexShrink: 0 }} />}>
                  <a
                    href={`tel:${school.phone}`}
                    style={{ color: '#475569', textDecoration: 'none' }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = primary; }}
                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}
                  >
                    {school.phone}
                  </a>
                </ContactItem>
              )}
              {school.email && (
                <ContactItem icon={<Mail style={{ width: '17px', height: '17px', color: primary, flexShrink: 0 }} />}>
                  <a
                    href={`mailto:${school.email}`}
                    style={{ color: '#475569', textDecoration: 'none', wordBreak: 'break-all' }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = primary; }}
                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}
                  >
                    {school.email}
                  </a>
                </ContactItem>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      {hasStats && (
        <div style={{ maxWidth: '56rem', margin: '2.5rem auto 0', padding: '0 1.5rem' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '1px',
            background: 'rgba(0,0,0,0.06)',
            borderRadius: '14px',
            overflow: 'hidden',
            border: '1px solid rgba(0,0,0,0.06)',
          }}>
            {school.yearFounded && (
              <StatCell label="Established" value={`Est. ${school.yearFounded}`} primary={primary} />
            )}
            {school.studentCount && (
              <StatCell label="Students Enrolled" value={`${school.studentCount.toLocaleString()}+`} primary={primary} />
            )}
            {school.staffCount && (
              <StatCell label="Staff Members" value={String(school.staffCount)} primary={primary} />
            )}
            {school.gradesOffered && (
              <StatCell label="Grades Offered" value={school.gradesOffered} primary={primary} />
            )}
            {school.curriculumType && (
              <StatCell label="Curriculum" value={school.curriculumType} primary={primary} />
            )}
          </div>
        </div>
      )}

      {/* ── School description ────────────────────────────────────────────── */}
      {school.schoolDescription && (
        <section style={{ maxWidth: '44rem', margin: '0 auto', padding: '4.5rem 1.5rem 1rem' }}>
          <p style={{
            fontSize: '1.0625rem', color: '#64748b',
            lineHeight: 1.85, textAlign: 'center',
          }}>
            {school.schoolDescription}
          </p>
        </section>
      )}

      {/* ── Deadline banner ───────────────────────────────────────────────── */}
      {deadlineDays !== null && deadlineDays >= 0 && (
        <div style={{ maxWidth: '56rem', margin: '2rem auto 0', padding: '0 1.5rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            background: hexToRgba(primary, 0.07),
            border: `1px solid ${hexToRgba(primary, 0.2)}`,
            borderRadius: '12px', padding: '0.75rem 1.25rem',
            fontSize: '0.875rem', fontWeight: 500, color: primary,
          }}>
            <Clock style={{ width: '15px', height: '15px', flexShrink: 0 }} />
            <span>
              {deadlineDays === 0
                ? "Application deadline is today — don't miss it!"
                : `${deadlineDays} day${deadlineDays !== 1 ? 's' : ''} left to submit your application`}
            </span>
          </div>
        </div>
      )}

      {/* ── Portal access ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '56rem', margin: '4rem auto 0', padding: '0 1.5rem' }}>
        <div style={{ marginBottom: '1.75rem' }}>
          <p style={{
            fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: primary, margin: '0 0 0.625rem',
          }}>
            Portal Access
          </p>
          <h2 style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 'clamp(1.5rem, 3.5vw, 2rem)',
            fontWeight: 700, color: '#0f172a', margin: 0, lineHeight: 1.25,
          }}>
            Already part of {school.schoolName}?
          </h2>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
        }}>
          <PortalCard
            title="Parent Portal"
            description="Track your child's grades, fees, attendance, and school notices"
            icon={<Users style={{ width: '22px', height: '22px' }} />}
            href={`/s/${resolvedId}/login/parent`}
            primary={primary}
          />
          <PortalCard
            title="Student Portal"
            description="View your timetable, assignments, results, and class resources"
            icon={<GraduationCap style={{ width: '22px', height: '22px' }} />}
            href={`/s/${resolvedId}/login/student`}
            primary={primary}
          />
          <PortalCard
            title="Teacher Portal"
            description="Manage classes, record attendance, submit grades, and communicate"
            icon={<BookOpen style={{ width: '22px', height: '22px' }} />}
            href={`/s/${resolvedId}/login/teacher`}
            primary={primary}
          />
          <PortalCard
            title="Admin Portal"
            description="Full school management — admissions, fees, staff, and reports"
            icon={<LayoutDashboard style={{ width: '22px', height: '22px' }} />}
            href={`/s/${resolvedId}/login/admin`}
            primary={primary}
          />
        </div>
      </section>

      {/* ── Admissions CTA ────────────────────────────────────────────────── */}
      <section
        style={{
          background: hexToRgba(primary, 0.045),
          marginTop: '3.5rem',
          padding: '5.5rem 1.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '540px', margin: '0 auto' }}>
          {acceptingApplications ? (
            <>
              <p style={{
                fontSize: '0.68rem', fontWeight: 700,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: primary, margin: '0 0 1.125rem',
              }}>
                Admissions {new Date().getFullYear()}
              </p>

              <h2 style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 'clamp(1.75rem, 4vw, 2.6rem)',
                fontWeight: 700, color: '#0f172a',
                lineHeight: 1.2, margin: '0 0 1.25rem',
              }}>
                Applications Now Open
              </h2>

              <p style={{
                fontSize: '1rem', color: '#64748b',
                lineHeight: 1.75, margin: '0 0 2.5rem',
              }}>
                {school.applicationIntroText ||
                  `Apply for admission to ${school.schoolName}. Complete the application form and our admissions team will be in touch.`}
              </p>

              <Link
                to={applyPath}
                className="inline-flex items-center gap-2.5 transition-all duration-150 hover:-translate-y-0.5"
                style={{
                  background: primary,
                  color: '#ffffff',
                  padding: '1rem 2.5rem',
                  borderRadius: '12px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  boxShadow: `0 6px 24px ${hexToRgba(primary, 0.32)}`,
                }}
                onMouseOver={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 10px 32px ${hexToRgba(primary, 0.42)}`;
                }}
                onMouseOut={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 24px ${hexToRgba(primary, 0.32)}`;
                }}
              >
                Apply for Admission
                <ArrowRight style={{ width: '18px', height: '18px' }} />
              </Link>

              <p style={{ marginTop: '1.5rem', fontSize: '0.8125rem', color: '#94a3b8' }}>
                Already have an account?{' '}
                <Link
                  to={loginPath}
                  style={{ color: primary, fontWeight: 500, textDecoration: 'none' }}
                >
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: '16px', padding: '3rem 2rem', textAlign: 'center',
            }}>
              <AlertTriangle style={{ width: '32px', height: '32px', color: '#f59e0b', margin: '0 auto 1rem' }} />
              <h2 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '1.375rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.75rem' }}>
                Applications Currently Closed
              </h2>
              <p style={{ fontSize: '0.9375rem', color: '#64748b', lineHeight: 1.65, margin: 0 }}>
                This school is not accepting new applications at this time. Please check back later or contact the admissions office directly.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid #f1f5f9', padding: '1.75rem 1.5rem' }}>
        <div style={{
          maxWidth: '56rem', margin: '0 auto',
          display: 'flex', alignItems: 'center',
          justifyContent: hasSocials ? 'space-between' : 'center',
          flexWrap: 'wrap', gap: '1rem',
        }}>
          {hasSocials && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              {school.socialLinks?.website && (
                <FooterLink href={school.socialLinks.website} icon={<Globe style={{ width: '13px', height: '13px' }} />} label="Website" hoverColor="#334155" />
              )}
              {school.socialLinks?.facebook && (
                <FooterLink href={school.socialLinks.facebook} icon={<Facebook style={{ width: '13px', height: '13px' }} />} label="Facebook" hoverColor="#1877F2" />
              )}
              {school.socialLinks?.instagram && (
                <FooterLink href={school.socialLinks.instagram} icon={<Instagram style={{ width: '13px', height: '13px' }} />} label="Instagram" hoverColor="#E1306C" />
              )}
              {school.socialLinks?.twitter && (
                <FooterLink href={school.socialLinks.twitter} icon={<Twitter style={{ width: '13px', height: '13px' }} />} label="X / Twitter" hoverColor="#0f172a" />
              )}
            </div>
          )}
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
            Powered by{' '}
            <span style={{ fontWeight: 600, color: primary }}>AvenirSMS</span>
          </p>
        </div>
      </footer>
    </div>
  );
}

function PortalCard({
  title, description, icon, href, primary,
}: { title: string; description: string; icon: React.ReactNode; href: string; primary: string }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      to={href}
      style={{
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
        padding: '1.375rem 1.5rem',
        borderRadius: '14px',
        border: `1px solid ${hovered ? hexToRgba(primary, 0.3) : 'rgba(0,0,0,0.07)'}`,
        background: hovered ? hexToRgba(primary, 0.04) : '#ffffff',
        textDecoration: 'none',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
        boxShadow: hovered ? `0 4px 24px ${hexToRgba(primary, 0.12)}` : '0 1px 6px rgba(0,0,0,0.05)',
        cursor: 'pointer',
      }}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      <div style={{
        width: '40px', height: '40px', borderRadius: '10px',
        background: hexToRgba(primary, 0.1),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: primary,
      }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a', margin: '0 0 0.375rem' }}>
          {title}
        </p>
        <p style={{ fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.6, margin: 0 }}>
          {description}
        </p>
      </div>
      <div style={{
        marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem',
        fontSize: '0.8125rem', fontWeight: 600, color: primary,
      }}>
        Sign in <ArrowRight style={{ width: '13px', height: '13px' }} />
      </div>
    </Link>
  );
}

function StatCell({ label, value, primary }: { label: string; value: string; primary: string }) {
  return (
    <div style={{
      background: '#ffffff', padding: '1.25rem 1.5rem', textAlign: 'center',
    }}>
      <p style={{
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '1.625rem', fontWeight: 700, color: primary,
        margin: '0 0 0.25rem', lineHeight: 1,
      }}>
        {value}
      </p>
      <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, letterSpacing: '0.03em' }}>
        {label}
      </p>
    </div>
  );
}

function ContactItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
      {icon}
      <span style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.55 }}>{children}</span>
    </div>
  );
}

function FooterLink({ href, icon, label, hoverColor }: { href: string; icon: React.ReactNode; label: string; hoverColor: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: '0.375rem',
        fontSize: '0.8125rem',
        color: hovered ? hoverColor : '#94a3b8',
        textDecoration: 'none',
        transition: 'color 0.15s ease',
      }}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      {icon} {label}
    </a>
  );
}
