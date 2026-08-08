import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../components/FirebaseProvider';
import { useSchoolId } from '../hooks/useSchoolId';
import toast from 'react-hot-toast';
import {
  Chrome, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  Link2, Link2Off, HardDrive, Calendar, GraduationCap,
  Mail, Video, Clock, ShieldCheck, ExternalLink, Info,
  Loader2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  Eye, EyeOff,
} from 'lucide-react';
import { formatRelativeTime, formatExpirationTime, formatStatus, formatWorkspaceDomain } from '../utils/statusFormatter';
import { Timestamp } from 'firebase/firestore';

type ServiceKey = 'drive' | 'calendar' | 'classroom' | 'gmail' | 'meet';
type ServiceStatus = 'connected' | 'error' | 'not_enabled';

interface GoogleIntegration {
  connected: boolean;
  connectedAt?: Timestamp;
  adminEmail?: string;
  workspaceDomain?: string;
  tokens?: {
    expiresAt: Timestamp;
    scopes: string[];
  };
  enabledServices: {
    drive: boolean;
    calendar: boolean;
    classroom: boolean;
    gmail: boolean;
    meet: boolean;
  };
  status: {
    drive: ServiceStatus;
    calendar: ServiceStatus;
    classroom: ServiceStatus;
    gmail: ServiceStatus;
    meet: ServiceStatus;
  };
  errors?: {
    drive?: string;
    calendar?: string;
    classroom?: string;
    gmail?: string;
    meet?: string;
  };
  lastVerifiedAt?: Timestamp;
  updatedAt?: Timestamp;
}

const SERVICE_META: Record<ServiceKey, { label: string; icon: React.ElementType; desc: string; scope: string }> = {
  drive: {
    label: 'Google Drive',
    icon: HardDrive,
    desc: 'Share files and resources with students and staff.',
    scope: 'drive.readonly',
  },
  calendar: {
    label: 'Google Calendar',
    icon: Calendar,
    desc: 'Sync school events and timetables to Google Calendar.',
    scope: 'calendar.events',
  },
  classroom: {
    label: 'Google Classroom',
    icon: GraduationCap,
    desc: 'Manage classes and assignments via Google Classroom.',
    scope: 'classroom.courses',
  },
  gmail: {
    label: 'Gmail',
    icon: Mail,
    desc: 'Send school communications through Gmail.',
    scope: 'gmail.send',
  },
  meet: {
    label: 'Google Meet',
    icon: Video,
    desc: 'Create and manage virtual classes with Google Meet.',
    scope: 'calendar.events',
  },
};

function StatusBadge({ status }: { status: ServiceStatus | 'not_connected' }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
        <CheckCircle2 size={11} /> Connected
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <XCircle size={11} /> Error
      </span>
    );
  }
  if (status === 'not_connected') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
        <Link2Off size={11} /> Not Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">
      <ToggleLeft size={11} /> Disabled
    </span>
  );
}

export default function IntegrationSettings() {
  const { profile } = useAuth();
  const schoolId = useSchoolId();
  const [integration, setIntegration] = useState<GoogleIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showTokenInfo, setShowTokenInfo] = useState(false);
  const [showScopes, setShowScopes] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [togglingService, setTogglingService] = useState<ServiceKey | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    const ref = doc(db, 'schools', schoolId, 'integrations', 'google');
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setIntegration(snap.data() as GoogleIntegration);
      } else {
        setIntegration(null);
      }
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [schoolId]);

  const handleConnect = () => {
    // OAuth flow: redirect to Google
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      toast.error('Google OAuth is not configured. Contact your system administrator.');
      return;
    }
    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/classroom.courses',
      'https://www.googleapis.com/auth/gmail.send',
      'openid email profile',
    ].join(' ');
    const state = btoa(JSON.stringify({ schoolId, nonce: crypto.randomUUID(), timestamp: Date.now() }));
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes);
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    window.location.href = url.toString();
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const { callApi } = await import('../services/api');
      await callApi('/api/google?action=verify', { schoolId });
      toast.success('Verification complete.');
    } catch (err: any) {
      toast.error(err?.message || 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { callApi } = await import('../services/api');
      await callApi('/api/google?action=disconnect', { schoolId });
      toast.success('Google Workspace disconnected.');
      setShowDisconnectConfirm(false);
    } catch (err: any) {
      toast.error(err?.message || 'Disconnect failed.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleServiceToggle = async (service: ServiceKey, enabled: boolean) => {
    if (!schoolId) return;
    setTogglingService(service);
    try {
      const ref = doc(db, 'schools', schoolId, 'integrations', 'google');
      await updateDoc(ref, {
        [`enabledServices.${service}`]: enabled,
        updatedAt: serverTimestamp(),
      });
      toast.success(`${SERVICE_META[service].label} ${enabled ? 'enabled' : 'disabled'}.`);

      if (enabled) {
        const { callApi } = await import('../services/api');
        await callApi('/api/google?action=verify', { schoolId }).catch(() => {});
      }
    } catch {
      toast.error('Failed to update service.');
    } finally {
      setTogglingService(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const isConnected = integration?.connected === true;
  const overallStatus: ServiceStatus | 'not_connected' = !isConnected
    ? 'not_connected'
    : Object.values(integration?.status ?? {}).some(s => s === 'error')
    ? 'error'
    : 'connected';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
          <Chrome className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Google Workspace Integration</h1>
          <p className="text-sm text-slate-500">Connect your school's Google Workspace account to unlock Drive, Calendar, Classroom, Gmail and Meet.</p>
        </div>
      </div>

      {/* Connection Status Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-slate-700">
            <ShieldCheck size={16} className="text-indigo-500" />
            Connection Status
          </div>
          <StatusBadge status={overallStatus} />
        </div>

        <div className="px-6 py-5">
          {isConnected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="text-slate-500">Google Account</div>
                <div className="font-medium text-slate-800">{integration?.adminEmail ?? '—'}</div>
                <div className="text-slate-500">Workspace Domain</div>
                <div className="font-medium text-slate-800 flex items-center gap-1">
                  {integration?.workspaceDomain ?? '—'}
                  {integration?.workspaceDomain && (
                    <a
                      href={formatWorkspaceDomain(integration.workspaceDomain)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-500 hover:text-indigo-700"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                <div className="text-slate-500">Connected</div>
                <div className="font-medium text-slate-800">
                  {integration?.connectedAt ? formatRelativeTime(integration.connectedAt) : '—'}
                </div>
                <div className="text-slate-500">Last Verified</div>
                <div className="font-medium text-slate-800">
                  {integration?.lastVerifiedAt ? formatRelativeTime(integration.lastVerifiedAt) : 'Never'}
                </div>
              </div>

              {overallStatus === 'error' && (
                <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  One or more services have errors. Use "Verify Connection" to re-check.
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                <Link2Off className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-700">Not connected</p>
                <p className="text-sm text-slate-500 mt-0.5">Connect your Google Workspace to unlock integrations.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Service Toggles */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2 font-semibold text-slate-700">
          <Chrome size={16} className="text-blue-500" />
          Google Services
        </div>
        <div className="divide-y divide-slate-100">
          {(Object.keys(SERVICE_META) as ServiceKey[]).map((key) => {
            const meta = SERVICE_META[key];
            const Icon = meta.icon;
            const enabled = integration?.enabledServices?.[key] ?? false;
            const status = integration?.status?.[key] ?? 'not_enabled';
            const error = integration?.errors?.[key];
            const isToggling = togglingService === key;

            return (
              <div key={key} className="px-6 py-4 flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={17} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800 text-sm">{meta.label}</span>
                    {isConnected && <StatusBadge status={enabled ? status : 'not_enabled'} />}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{meta.desc}</p>
                  {/* Classroom-specific requirement note */}
                  {key === 'classroom' && (
                    <p className="text-xs text-amber-600 mt-1.5 flex items-start gap-1">
                      <AlertCircle size={11} className="shrink-0 mt-0.5" />
                      Requires a <strong className="font-semibold mx-0.5">Google Workspace for Education</strong> account.
                      Personal Gmail and standard Workspace accounts cannot create courses.{' '}
                      <a
                        href="https://edu.google.com/workspace-for-education/editions/education-fundamentals/"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:text-amber-800 transition-colors"
                      >
                        Learn more →
                      </a>
                    </p>
                  )}
                  {error && enabled && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle size={11} /> {error}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => isConnected && handleServiceToggle(key, !enabled)}
                  disabled={!isConnected || isToggling}
                  className={`shrink-0 transition-colors ${
                    !isConnected ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                  title={isConnected ? (enabled ? 'Disable' : 'Enable') : 'Connect Google Workspace first'}
                >
                  {isToggling ? (
                    <Loader2 size={22} className="animate-spin text-indigo-400" />
                  ) : enabled ? (
                    <ToggleRight size={26} className="text-indigo-600" />
                  ) : (
                    <ToggleLeft size={26} className="text-slate-300" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Token Info (collapsible — admin only) */}
      {isConnected && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowTokenInfo(v => !v)}
            className="w-full px-6 py-4 border-b border-slate-100 flex items-center justify-between font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-indigo-500" />
              Token Information
            </div>
            {showTokenInfo ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showTokenInfo && (
            <div className="px-6 py-5 space-y-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="text-slate-500">Access Token</div>
                <div className="font-medium text-slate-400 italic text-xs">Hidden for security</div>
                <div className="text-slate-500">Token Expires</div>
                <div className="font-medium text-slate-800">
                  {integration?.tokens?.expiresAt
                    ? formatExpirationTime(integration.tokens.expiresAt)
                    : '—'}
                </div>
                <div className="text-slate-500 flex items-center gap-1">
                  Granted Scopes
                  <button onClick={() => setShowScopes(v => !v)} className="text-indigo-400 hover:text-indigo-600">
                    {showScopes ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <div className="font-medium text-slate-800">
                  {showScopes && integration?.tokens?.scopes ? (
                    <ul className="space-y-0.5">
                      {integration.tokens.scopes.map(s => (
                        <li key={s} className="text-xs font-mono text-slate-500">{s}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-400 text-xs italic">Click eye to reveal</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                <Info size={13} className="shrink-0" />
                Access tokens are automatically refreshed before they expire. You don't need to reconnect.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Actions</p>
        <div className="flex flex-wrap gap-3">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
            >
              <Chrome size={16} />
              Connect Google Workspace
            </button>
          ) : (
            <>
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 active:scale-95 transition-all shadow-sm disabled:opacity-60"
              >
                {verifying ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                Verify Connection
              </button>

              <button
                onClick={handleConnect}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
              >
                <Link2 size={15} />
                Reconnect
              </button>

              {!showDisconnectConfirm ? (
                <button
                  onClick={() => setShowDisconnectConfirm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 active:scale-95 transition-all shadow-sm"
                >
                  <Link2Off size={15} />
                  Disconnect
                </button>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-sm">
                  <span className="text-red-700 font-medium">Are you sure?</span>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-60 transition-colors"
                  >
                    {disconnecting ? <Loader2 size={12} className="animate-spin" /> : 'Yes, Disconnect'}
                  </button>
                  <button
                    onClick={() => setShowDisconnectConfirm(false)}
                    className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Help note */}
      <div className="flex items-start gap-2 text-xs text-slate-400 px-1">
        <Info size={13} className="mt-0.5 shrink-0" />
        Google Workspace integration is optional. AVENIR SMS works fully without it. Connecting allows deeper collaboration with Google tools your school already uses.
      </div>
    </div>
  );
}
