import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection, query, onSnapshot, addDoc, deleteDoc,
  where, getDocs, serverTimestamp, doc, updateDoc, getDoc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '../components/Toast';
import { Key, Trash2, Plus, Lock, Unlock, Shield, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';

interface Pin {
  id?: string;
  code: string;
  timesUsed: number;
  maxUses: number;
  isUsed: boolean;
  studentId?: string;
  studentName?: string;
  createdAt: any;
}

// Generate a random PIN code like "AK4X-82JQ-0W1P"
function generatePinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg()}-${seg()}-${seg()}`;
}

// ── PinGate: shown to students/parents before they can view results ──────────
export function PinGate({
  studentId,
  studentName,
  onVerified,
}: {
  studentId: string;
  studentName: string;
  onVerified: () => void;
}) {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const verify = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { toast.error('Please enter a PIN code.'); return; }
    setVerifying(true);
    const tid = toast.loading('Verifying PIN…');
    try {
      // Look for valid pin with this exact code
      const q = query(
        collection(db, 'pins'),
        where('code', '==', trimmed),
        where('isUsed', '==', false)
      );
      const snap = await getDocs(q);
      // Also allow a pin already tied to this student (reuse)
      const q2 = query(
        collection(db, 'pins'),
        where('code', '==', trimmed),
        where('studentId', '==', studentId)
      );
      const snap2 = await getDocs(q2);

      const validDoc = snap.docs[0] || snap2.docs[0];

      if (!validDoc) {
        toast.error('Invalid or already used PIN.', { id: tid });
        setVerifying(false);
        return;
      }

      const pinData = validDoc.data() as Pin;
      if (pinData.timesUsed >= pinData.maxUses) {
        toast.error('This PIN has reached its maximum usage.', { id: tid });
        setVerifying(false);
        return;
      }

      // Mark pin as used (or increment usage)
      await updateDoc(doc(db, 'pins', validDoc.id), {
        timesUsed: pinData.timesUsed + 1,
        isUsed: pinData.timesUsed + 1 >= pinData.maxUses,
        studentId,
        studentName,
      });

      // Store in sessionStorage so user doesn't need to re-enter every page visit
      sessionStorage.setItem(`pin_verified_${studentId}`, '1');
      toast.success('PIN verified! Access granted.', { id: tid });
      onVerified();
    } catch (e: any) {
      toast.error('Verification failed: ' + (e.message || 'Unknown'), { id: tid });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl border-2 border-indigo-100 shadow-xl p-8 max-w-md w-full text-center"
      >
        <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-indigo-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Result Access PIN Required</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Enter the PIN from your result-checker scratch card to view <strong>{studentName}</strong>'s results.
        </p>
        <div className="space-y-4">
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && verify()}
            placeholder="XXXX-XXXX-XXXX"
            maxLength={14}
            className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none text-center text-lg font-mono tracking-widest"
          />
          <button
            onClick={verify}
            disabled={verifying || !code.trim()}
            className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-60"
          >
            {verifying ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verifying…
              </span>
            ) : 'Verify PIN'}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          Don't have a PIN? Contact the school's examination office.
        </p>
      </motion.div>
    </div>
  );
}

// ── Admin PIN Management page ─────────────────────────────────────────────────
export default function PinManagement() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genCount, setGenCount] = useState(10);
  const [showUsed, setShowUsed] = useState(false);
  const [deleteUsedOpen, setDeleteUsedOpen] = useState(false);
  const [showCodes, setShowCodes] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'pins')), snap => {
      setPins(snap.docs.map(d => ({ id: d.id, ...d.data() } as Pin)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const validPins = pins.filter(p => !p.isUsed);
  const usedPins = pins.filter(p => p.isUsed);
  const displayPins = showUsed ? usedPins : validPins;

  const handleGenerate = async () => {
    if (validPins.length >= 500) {
      toast.error('Maximum 500 valid PINs allowed. Delete used ones first.');
      return;
    }
    const actualCount = Math.min(genCount, 500 - validPins.length);
    setGenerating(true);
    const tid = toast.loading(`Generating ${actualCount} PINs…`);
    try {
      const existing = new Set(pins.map(p => p.code));
      let created = 0;
      const batch: Promise<any>[] = [];
      for (let i = 0; i < actualCount; i++) {
        let code = generatePinCode();
        // Ensure uniqueness
        while (existing.has(code)) code = generatePinCode();
        existing.add(code);
        batch.push(addDoc(collection(db, 'pins'), {
          code,
          timesUsed: 0,
          maxUses: 6,
          isUsed: false,
          createdAt: serverTimestamp(),
        }));
        created++;
      }
      await Promise.all(batch);
      toast.success(`Generated ${created} new PINs!`, { id: tid });
    } catch (e: any) {
      toast.error('Generation failed: ' + (e.message || 'Unknown'), { id: tid });
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteUsed = async () => {
    const tid = toast.loading(`Deleting ${usedPins.length} used PINs…`);
    try {
      await Promise.all(usedPins.map(p => deleteDoc(doc(db, 'pins', p.id!))));
      toast.success(`${usedPins.length} used PINs deleted.`, { id: tid });
      setDeleteUsedOpen(false);
    } catch (e: any) {
      toast.error('Failed to delete: ' + (e.message || 'Unknown'), { id: tid });
    }
  };

  const handleDeleteSingle = async (pin: Pin) => {
    await deleteDoc(doc(db, 'pins', pin.id!)).then(() => toast.success('PIN deleted.')).catch(e => toast.error(e.message));
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Key className="w-6 h-6 text-indigo-600" />
          Result-Checker PINs
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Generate scratch-card PINs for students and parents to access locked exam results.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total PINs', value: pins.length, color: 'bg-slate-50 text-slate-700', icon: <Key className="w-5 h-5" /> },
          { label: 'Valid (Unused)', value: validPins.length, color: 'bg-emerald-50 text-emerald-700', icon: <CheckCircle2 className="w-5 h-5" /> },
          { label: 'Used', value: usedPins.length, color: 'bg-amber-50 text-amber-700', icon: <Unlock className="w-5 h-5" /> },
          { label: 'Remaining Slots', value: Math.max(0, 500 - validPins.length), color: 'bg-indigo-50 text-indigo-700', icon: <Shield className="w-5 h-5" /> },
        ].map(item => (
          <div key={item.label} className={`${item.color} rounded-2xl p-4 border border-slate-200`}>
            <div className="flex items-center gap-2 mb-1 opacity-70">{item.icon}</div>
            <p className="text-2xl font-black">{item.value}</p>
            <p className="text-xs font-semibold opacity-70 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Generate controls */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Number to Generate</label>
            <input
              type="number" min={1} max={100} value={genCount}
              onChange={e => setGenCount(Math.min(100, Math.max(1, Number(e.target.value))))}
              className="w-28 px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <button onClick={handleGenerate} disabled={generating || validPins.length >= 500}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50 text-sm">
            {generating
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Plus className="w-4 h-4" />}
            Generate PINs
          </button>
          <button onClick={() => setShowCodes(prev => !prev)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
            {showCodes ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showCodes ? 'Hide' : 'Show'} Codes
          </button>
          {usedPins.length > 0 && (
            <button onClick={() => setDeleteUsedOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 border border-rose-200 font-bold rounded-xl hover:bg-rose-100 transition-all text-sm ml-auto">
              <Trash2 className="w-4 h-4" /> Delete Used ({usedPins.length})
            </button>
          )}
        </div>
      </div>

      {/* PIN list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex gap-2">
          <button onClick={() => setShowUsed(false)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${!showUsed ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
            Valid ({validPins.length})
          </button>
          <button onClick={() => setShowUsed(true)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${showUsed ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
            Used ({usedPins.length})
          </button>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <span className="w-6 h-6 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : displayPins.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Key className="w-10 h-10 mx-auto opacity-20 mb-2" />
            <p className="text-sm">{showUsed ? 'No used PINs.' : 'No PINs generated yet. Click "Generate PINs" above.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3">PIN Code</th>
                  <th className="text-center px-4 py-3">Uses</th>
                  <th className="text-left px-4 py-3">Assigned To</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-center px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayPins.map(pin => (
                  <tr key={pin.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono font-bold text-slate-800 tracking-wider">
                      {showCodes ? pin.code : '••••-••••-••••'}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {pin.timesUsed} / {pin.maxUses}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {pin.studentName || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {pin.isUsed
                        ? <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">Used</span>
                        : <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">Valid</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleDeleteSingle(pin)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteUsedOpen}
        onCancel={() => setDeleteUsedOpen(false)}
        onConfirm={handleDeleteUsed}
        title="Delete Used PINs"
        message={`This will permanently delete all ${usedPins.length} used PIN records. This cannot be undone.`}
        confirmLabel="Delete All Used"
        danger
      />
    </div>
  );
}
