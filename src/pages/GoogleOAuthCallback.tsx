import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { callApi } from '../services/api';
import { Loader2, CheckCircle2, XCircle, Chrome } from 'lucide-react';

type Status = 'loading' | 'success' | 'error';

export default function GoogleOAuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('Completing Google Workspace connection...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    // User cancelled or Google returned an error
    if (error) {
      setStatus('error');
      setMessage(
        error === 'access_denied'
          ? 'Connection cancelled. You declined the Google permissions.'
          : `Google returned an error: ${error}`
      );
      setTimeout(() => navigate('/admin/integrations/google'), 3000);
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setMessage('Invalid callback — missing code or state. Please try again.');
      setTimeout(() => navigate('/admin/integrations/google'), 3000);
      return;
    }

    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI;

    const connect = async () => {
      try {
        await callApi('/api/google?action=connect', { code, state, redirectUri });
        setStatus('success');
        setMessage('Google Workspace connected successfully!');
        setTimeout(() => navigate('/admin/integrations/google'), 2000);
      } catch (err: any) {
        console.error('connectGoogleWorkspace error:', err);
        setStatus('error');
        setMessage(
          err?.message?.includes('OAuth state is expired')
            ? 'The connection request expired. Please try connecting again.'
            : err?.message || 'Failed to connect Google Workspace. Please try again.'
        );
        setTimeout(() => navigate('/admin/integrations/google'), 4000);
      }
    };

    connect();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-10 py-10 max-w-md w-full text-center space-y-5">

        {/* Icon */}
        <div className="flex justify-center">
          {status === 'loading' && (
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          )}
          {status === 'success' && (
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
          )}
          {status === 'error' && (
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          )}
        </div>

        {/* Google branding */}
        <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
          <Chrome size={14} />
          Google Workspace
        </div>

        {/* Status message */}
        <div>
          <p className="font-semibold text-slate-800 text-lg">
            {status === 'loading' && 'Connecting...'}
            {status === 'success' && 'Connected!'}
            {status === 'error' && 'Connection Failed'}
          </p>
          <p className="text-sm text-slate-500 mt-1">{message}</p>
        </div>

        {/* Redirect notice */}
        <p className="text-xs text-slate-400">
          {status === 'loading'
            ? 'Please wait, do not close this tab.'
            : 'Redirecting you back to integration settings...'}
        </p>
      </div>
    </div>
  );
}
