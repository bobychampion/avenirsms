import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  GraduationCap, MapPin, Phone, Mail, ArrowRight, Loader2, AlertTriangle,
  Facebook, Instagram, Globe, Twitter, Clock,
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
}

async function resolveSchoolSettings(param: string): Promise<{ data: SchoolInfo; resolvedId: string } | null> {
  // Try as raw schoolId first
  const direct = await getDoc(doc(db, 'school_settings', param));
  if (direct.exists()) return { data: direct.data() as SchoolInfo, resolvedId: param };

  // Try as slug
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

export default function SchoolLandingPage() {
  const { schoolId: param } = useParams<{ schoolId: string }>();
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div
        className="relative overflow-hidden"
        style={{
          background: school.heroBannerImageUrl
            ? `linear-gradient(to bottom, ${primary}cc, ${primary}ee), url(${school.heroBannerImageUrl}) center/cover`
            : `linear-gradient(135deg, ${primary} 0%, ${primary}cc 100%)`,
        }}
      >
        <div className="max-w-4xl mx-auto px-6 py-20 text-center text-white">
          {school.logoUrl ? (
            <img src={school.logoUrl} alt={school.schoolName} className="w-24 h-24 rounded-full mx-auto mb-6 object-cover border-4 border-white/30 shadow-lg" />
          ) : (
            <div className="w-24 h-24 rounded-full mx-auto mb-6 bg-white/20 flex items-center justify-center border-4 border-white/30">
              <GraduationCap className="w-12 h-12 text-white" />
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-extrabold mb-3 drop-shadow">{school.schoolName}</h1>
          {school.motto && (
            <p className="text-lg text-white/80 italic mb-2">"{school.motto}"</p>
          )}
          <p className="text-white/70 text-sm">Official Admissions Portal</p>
        </div>
      </div>

      {/* Info cards */}
      <div className="max-w-4xl mx-auto px-6 -mt-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-600">
          {school.address && (
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <span>{school.address}</span>
            </div>
          )}
          {school.phone && (
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>{school.phone}</span>
            </div>
          )}
          {school.email && (
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>{school.email}</span>
            </div>
          )}
        </div>
      </div>

      {/* School description */}
      {school.schoolDescription && (
        <div className="max-w-4xl mx-auto px-6 pt-10">
          <p className="text-slate-600 text-center leading-relaxed">{school.schoolDescription}</p>
        </div>
      )}

      {/* Deadline banner */}
      {deadlineDays !== null && deadlineDays >= 0 && (
        <div className="max-w-4xl mx-auto px-6 pt-8">
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 text-sm text-amber-800">
            <Clock className="w-4 h-4 shrink-0" />
            <span>
              {deadlineDays === 0
                ? 'Application deadline is today!'
                : `Application deadline: ${deadlineDays} day${deadlineDays !== 1 ? 's' : ''} remaining`}
            </span>
          </div>
        </div>
      )}

      {/* Apply CTA */}
      <div className="max-w-4xl mx-auto px-6 py-12 text-center">
        {acceptingApplications ? (
          <>
            <h2 className="text-2xl font-bold text-slate-800 mb-3">Applications Now Open</h2>
            <p className="text-slate-500 mb-4 max-w-md mx-auto">
              {school.applicationIntroText ||
                `Apply for admission to ${school.schoolName}. Fill out the form and our admissions team will review your application.`}
            </p>
            <Link
              to={applyPath}
              className="inline-flex items-center gap-2 px-8 py-4 text-white font-bold rounded-xl shadow-lg hover:opacity-90 transition-all text-lg"
              style={{ backgroundColor: primary }}
            >
              Apply for Admission
              <ArrowRight className="w-5 h-5" />
            </Link>
          </>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Applications Closed</h2>
            <p className="text-slate-500">This school is not currently accepting new applications. Please check back later.</p>
          </div>
        )}
      </div>

      {/* Social links */}
      {school.socialLinks && Object.values(school.socialLinks).some(v => v) && (
        <div className="max-w-4xl mx-auto px-6 pb-8 flex justify-center gap-4">
          {school.socialLinks.website && (
            <a href={school.socialLinks.website} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors">
              <Globe className="w-4 h-4" /> Website
            </a>
          )}
          {school.socialLinks.facebook && (
            <a href={school.socialLinks.facebook} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors">
              <Facebook className="w-4 h-4" /> Facebook
            </a>
          )}
          {school.socialLinks.instagram && (
            <a href={school.socialLinks.instagram} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-pink-600 transition-colors">
              <Instagram className="w-4 h-4" /> Instagram
            </a>
          )}
          {school.socialLinks.twitter && (
            <a href={school.socialLinks.twitter} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-500 transition-colors">
              <Twitter className="w-4 h-4" /> X / Twitter
            </a>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-slate-200 mt-4 py-6 text-center text-slate-400 text-xs">
        Powered by <span className="font-semibold text-indigo-500">AvenirSMS</span>
      </div>
    </div>
  );
}
