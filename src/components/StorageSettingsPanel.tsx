/**
 * Settings → Storage panel: shows the connected provider's status and lets
 * an admin test the connection, disconnect, or switch providers.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { CloudUpload, CheckCircle2, XCircle, Loader2, Unplug } from 'lucide-react';
import { useStorageSettings } from '../hooks/useStorageSettings';
import StorageConnectionWizard from './StorageConnectionWizard';

interface Props {
  schoolId: string;
}

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

export default function StorageSettingsPanel({ schoolId }: Props) {
  const { settings, isConnected, loading } = useStorageSettings();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleTest = async () => {
    if (!settings) return;
    setTesting(true);
    try {
      // Re-uses the same test endpoint; the server re-reads the already-stored,
      // encrypted credentials rather than trusting anything from the client here —
      // it only needs cloudName/apiKey to look up the right doc.
      const res = await callFunction<{ schoolId: string }, { ok: boolean; message: string }>(
        'verifyStorageConnection',
        { schoolId }
      );
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch (e: any) {
      toast.error(e.message || 'Could not verify the connection.');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect storage? Existing uploaded files remain in Cloudinary, but new uploads will be blocked until you reconnect.')) return;
    setDisconnecting(true);
    try {
      await callFunction<{ schoolId: string }, { ok: boolean }>('disconnectStorageProvider', { schoolId });
      toast.success('Storage disconnected.');
    } catch (e: any) {
      toast.error(e.message || 'Could not disconnect.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
        <CloudUpload className="w-4 h-4 text-indigo-600" /> Storage Connection
      </h2>
      <p className="text-xs text-slate-500 mb-5">
        Securely connected file storage for student photos, admission documents, certificates, and assignments.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : isConnected && settings ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Provider</p>
              <p className="text-sm font-semibold text-slate-800 capitalize">{settings.provider}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Status</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4" /> Connected
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Cloud Name</p>
              <p className="text-sm font-mono text-slate-700">{settings.cloudName}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Connected</p>
              <p className="text-sm text-slate-700">
                {settings.connectedAt?.toDate ? settings.connectedAt.toDate().toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button onClick={handleTest} disabled={testing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Test Connection
            </button>
            <button onClick={() => setWizardOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              <CloudUpload className="w-3.5 h-3.5" /> Change Provider
            </button>
            <button onClick={handleDisconnect} disabled={disconnecting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40 transition-colors">
              {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />} Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <XCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">No storage provider connected yet.</p>
          <button onClick={() => setWizardOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 transition-colors whitespace-nowrap">
            <CloudUpload className="w-3.5 h-3.5" /> Connect Cloudinary
          </button>
        </div>
      )}

      {wizardOpen && (
        <StorageConnectionWizard schoolId={schoolId} onClose={() => setWizardOpen(false)} onConnected={() => setWizardOpen(false)} />
      )}
    </section>
  );
}
