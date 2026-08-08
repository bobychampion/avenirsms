/**
 * StorageConnectionWizard
 *
 * 2-step modal: (1) instructions for creating a free Cloudinary account and
 * finding the Cloud Name / API Key / API Secret, (2) a form that tests the
 * credentials server-side (testStorageConnection) before persisting them
 * (connectStorageProvider). The API secret is only ever sent once, over
 * HTTPS, directly to the Cloud Function — never stored or logged client-side.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import {
  X, ExternalLink, ArrowRight, ArrowLeft, Loader2, CheckCircle2, XCircle, CloudUpload,
} from 'lucide-react';

interface Props {
  schoolId: string;
  onClose: () => void;
  onConnected: () => void;
}

type TestState = 'idle' | 'testing' | 'success' | 'failure';

const FUNCTION_TO_ROUTE: Record<string, string> = {
  testStorageConnection: '/api/storage?action=test',
  connectStorageProvider: '/api/storage?action=connect',
  disconnectStorageProvider: '/api/storage?action=disconnect',
  getUploadSignature: '/api/get-upload-signature',
  deleteStorageFile: '/api/storage?action=delete-file',
  verifyStorageConnection: '/api/storage?action=verify',
};

async function callFunction<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
  const { callApi } = await import('../services/api');
  const route = FUNCTION_TO_ROUTE[name] ?? `/api/${name}`;
  return callApi<TRes>(route, data);
}

export default function StorageConnectionWizard({ schoolId, onClose, onConnected }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [cloudName, setCloudName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [connecting, setConnecting] = useState(false);

  const credsFilled = cloudName.trim() && apiKey.trim() && apiSecret.trim();

  const handleTest = async () => {
    if (!credsFilled) return;
    setTestState('testing');
    setTestMessage('');
    try {
      const res = await callFunction<
        { schoolId: string; provider: 'cloudinary'; cloudName: string; apiKey: string; apiSecret: string },
        { ok: boolean; message: string }
      >('testStorageConnection', {
        schoolId, provider: 'cloudinary',
        cloudName: cloudName.trim(), apiKey: apiKey.trim(), apiSecret: apiSecret.trim(),
      });
      setTestState(res.ok ? 'success' : 'failure');
      setTestMessage(res.message);
    } catch (e: any) {
      setTestState('failure');
      setTestMessage(e.message || 'Could not reach the server. Please try again.');
    }
  };

  const handleConnect = async () => {
    if (!credsFilled) return;
    setConnecting(true);
    try {
      const res = await callFunction<
        { schoolId: string; provider: 'cloudinary'; cloudName: string; apiKey: string; apiSecret: string },
        { ok: boolean; message: string }
      >('connectStorageProvider', {
        schoolId, provider: 'cloudinary',
        cloudName: cloudName.trim(), apiKey: apiKey.trim(), apiSecret: apiSecret.trim(),
      });
      if (res.ok) {
        toast.success(res.message);
        onConnected();
        onClose();
      } else {
        setTestState('failure');
        setTestMessage(res.message);
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.error(e.message || 'Could not connect storage. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col z-10"
      >
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <CloudUpload className="w-5 h-5 text-indigo-600" /> Connect Cloudinary
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">Step {step} of 2</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-8 py-6">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
                <p className="text-sm text-slate-600">
                  Cloudinary stores your school's files (photos, documents, certificates). Create a free account, then come back here with three values from your dashboard.
                </p>
                <ol className="space-y-3 text-sm text-slate-700">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">1</span>
                    <span>
                      <a href="https://cloudinary.com/users/register/free" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-semibold hover:underline inline-flex items-center gap-1">
                        Sign up for a free Cloudinary account <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">2</span>
                    <span>Go to your <strong>Dashboard</strong> (it's the first page after login)</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">3</span>
                    <span>Copy your <strong>Cloud Name</strong>, <strong>API Key</strong>, and <strong>API Secret</strong> (click "reveal" next to the secret)</span>
                  </li>
                </ol>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  Your API Secret is sent once, directly and securely, to connect your account. It is never stored in plain text or visible again after this step.
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Cloud Name</label>
                  <input value={cloudName} onChange={e => { setCloudName(e.target.value); setTestState('idle'); }}
                    placeholder="e.g. avenir-koper"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">API Key</label>
                  <input value={apiKey} onChange={e => { setApiKey(e.target.value); setTestState('idle'); }}
                    placeholder="123456789012345"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">API Secret</label>
                  <input type="password" value={apiSecret} onChange={e => { setApiSecret(e.target.value); setTestState('idle'); }}
                    placeholder="••••••••••••••••"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" />
                </div>

                <button
                  onClick={handleTest}
                  disabled={!credsFilled || testState === 'testing'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  {testState === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Test Connection
                </button>

                {testState === 'success' && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-sm text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {testMessage}
                  </div>
                )}
                {testState === 'failure' && (
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-sm text-rose-700">
                    <XCircle className="w-4 h-4 flex-shrink-0" /> {testMessage}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between px-8 py-5 border-t border-slate-100">
          {step === 2 ? (
            <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-xl transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : <span />}

          {step === 1 ? (
            <button onClick={() => setStep(2)} className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
              I have my credentials <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={!credsFilled || connecting}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Connect Cloudinary
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
