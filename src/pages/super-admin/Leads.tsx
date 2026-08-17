/**
 * Leads — CRM view built directly on the existing demo_requests collection.
 * Does not touch the existing `status` field or any code that depends on it
 * (SuperAdminDashboard's Demo Requests pipeline, DemoConvertPage, Apply flow
 * all keep working exactly as before). `stage` below is a display-only
 * mapping computed from the existing status; new fields (source, assignee,
 * nextFollowUpAt, notes, conversionProbability) are optional additions that
 * are undefined on older records and only written by this page.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, query, orderBy, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../components/FirebaseProvider';
import toast from 'react-hot-toast';
import {
  Target, Search, X, Phone, Mail, Building2, Calendar, Loader2, Plus,
  ClipboardCheck, ChevronRight,
} from 'lucide-react';

type DemoStatus = 'pending' | 'provisioned' | 'contacted' | 'conversion_requested' | 'converted' | 'dismissed';
type LeadStage = 'New' | 'Contacted' | 'Qualified' | 'Demo Scheduled' | 'Demo Completed' | 'Trial' | 'Won' | 'Lost';

const STAGE_MAP: Record<DemoStatus, LeadStage> = {
  pending: 'New',
  contacted: 'Contacted',
  conversion_requested: 'Qualified',
  provisioned: 'Trial',
  converted: 'Won',
  dismissed: 'Lost',
};
// Always empty — no underlying signal exists yet for a separately-scheduled
// human demo call. Shown in the funnel for completeness, not fabricated.
const UNMAPPED_STAGES: LeadStage[] = ['Demo Scheduled', 'Demo Completed'];
const ALL_STAGES: LeadStage[] = ['New', 'Contacted', 'Qualified', 'Demo Scheduled', 'Demo Completed', 'Trial', 'Won', 'Lost'];

const STAGE_COLOR: Record<LeadStage, string> = {
  'New': 'bg-slate-100 text-slate-600', 'Contacted': 'bg-blue-100 text-blue-700',
  'Qualified': 'bg-violet-100 text-violet-700', 'Demo Scheduled': 'bg-amber-100 text-amber-700',
  'Demo Completed': 'bg-amber-100 text-amber-700', 'Trial': 'bg-indigo-100 text-indigo-700',
  'Won': 'bg-emerald-100 text-emerald-700', 'Lost': 'bg-red-100 text-red-700',
};

interface LeadNote { text: string; author: string; createdAt: any; }

interface Lead {
  id: string;
  schoolName: string;
  adminName?: string;
  contactName?: string;
  email: string;
  adminEmail?: string;
  phone: string;
  status: DemoStatus;
  createdAt: any;
  // CRM extensions — optional, undefined on older records
  source?: string;
  assignedStaffName?: string;
  nextFollowUpAt?: string;
  conversionProbability?: number;
  leadNotes?: LeadNote[];
}

const SOURCES = ['Website', 'Referral', 'WhatsApp', 'Facebook', 'Instagram', 'Google', 'Direct', 'Other'];

export default function Leads() {
  const { profile, user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<LeadStage | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingField, setSavingField] = useState(false);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'demo_requests'), orderBy('createdAt', 'desc')));
      setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeads(); }, []);

  const stageOf = (l: Lead): LeadStage => STAGE_MAP[l.status] ?? 'New';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (stageFilter !== 'all' && stageOf(l) !== stageFilter) return false;
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
      if (q && !l.schoolName?.toLowerCase().includes(q) && !l.email?.toLowerCase().includes(q) && !(l.contactName ?? l.adminName ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [leads, search, stageFilter, sourceFilter]);

  const funnelCounts = useMemo(() => {
    const counts: Record<LeadStage, number> = { 'New': 0, 'Contacted': 0, 'Qualified': 0, 'Demo Scheduled': 0, 'Demo Completed': 0, 'Trial': 0, 'Won': 0, 'Lost': 0 };
    for (const l of leads) counts[stageOf(l)]++;
    return counts;
  }, [leads]);

  const sources = useMemo(() => [...new Set(leads.map(l => l.source).filter(Boolean))] as string[], [leads]);

  const updateLeadField = async (field: string, value: any) => {
    if (!selected) return;
    setSavingField(true);
    try {
      await updateDoc(doc(db, 'demo_requests', selected.id), { [field]: value });
      setLeads(prev => prev.map(l => l.id === selected.id ? { ...l, [field]: value } : l));
      setSelected(prev => prev ? { ...prev, [field]: value } : prev);
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingField(false);
    }
  };

  const addNote = async () => {
    if (!selected || !noteDraft.trim()) return;
    const note: LeadNote = { text: noteDraft.trim(), author: profile?.displayName || user?.email || 'unknown', createdAt: Timestamp.now() };
    setSavingField(true);
    try {
      await updateDoc(doc(db, 'demo_requests', selected.id), { leadNotes: arrayUnion(note) });
      const updated = { ...selected, leadNotes: [...(selected.leadNotes ?? []), note] };
      setSelected(updated);
      setLeads(prev => prev.map(l => l.id === selected.id ? updated : l));
      setNoteDraft('');
    } catch {
      toast.error('Failed to add note');
    } finally {
      setSavingField(false);
    }
  };

  const createFollowUpTask = async () => {
    if (!selected) return;
    try {
      await addDoc(collection(db, 'tasks'), {
        title: `Follow up with ${selected.schoolName}`,
        category: 'Sales', priority: 'Medium', status: 'To Do',
        dueDate: selected.nextFollowUpAt || new Date().toISOString().slice(0, 10),
        relatedLeadId: selected.id, relatedLeadName: selected.schoolName,
        assigneeName: profile?.displayName || user?.email || '',
        createdBy: profile?.displayName || user?.email || 'unknown',
        createdAt: Timestamp.now(),
      });
      toast.success('Follow-up task created');
    } catch {
      toast.error('Failed to create task');
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Target className="w-6 h-6 text-indigo-600" /> Leads
        </h1>
        <p className="text-slate-500 text-sm mt-1">Every demo request, tracked as a sales pipeline.</p>
      </div>

      {/* Funnel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {ALL_STAGES.map((stage, i) => (
            <React.Fragment key={stage}>
              <button onClick={() => setStageFilter(stageFilter === stage ? 'all' : stage)}
                className={`px-3 py-2 rounded-xl text-center transition-colors ${stageFilter === stage ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50'} ${UNMAPPED_STAGES.includes(stage) ? 'opacity-50' : ''}`}
              >
                <p className="text-lg font-bold">{funnelCounts[stage]}</p>
                <p className={`text-[11px] font-medium whitespace-nowrap ${stageFilter === stage ? 'text-indigo-100' : 'text-slate-500'}`}>{stage}</p>
              </button>
              {i < ALL_STAGES.length - 1 && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" className={`pl-9 ${inputCls}`} />
        </div>
        {sources.length > 0 && (
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm">
            <option value="all">All sources</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {stageFilter !== 'all' && (
          <button onClick={() => setStageFilter('all')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-2">Clear stage filter</button>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
          <Target className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No leads match these filters</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
          {filtered.map(l => (
            <button key={l.id} onClick={() => setSelected(l)} className="w-full px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors text-left">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{l.schoolName}</p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{l.email}</span>
                  {l.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{l.phone}</span>}
                  {l.nextFollowUpAt && <span className="flex items-center gap-1 text-amber-600"><Calendar className="w-3 h-3" />Follow up {l.nextFollowUpAt}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {l.source && <span className="text-xs text-slate-400">{l.source}</span>}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_COLOR[stageOf(l)]}`}>{stageOf(l)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-900 text-lg">{selected.schoolName}</h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_COLOR[stageOf(selected)]}`}>{stageOf(selected)}</span>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-500" /></button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-slate-400">Contact</p><p className="font-medium text-slate-700">{selected.contactName ?? selected.adminName ?? '—'}</p></div>
                <div><p className="text-xs text-slate-400">Email</p><p className="font-medium text-slate-700 truncate">{selected.email}</p></div>
                <div><p className="text-xs text-slate-400">Phone</p><p className="font-medium text-slate-700">{selected.phone || '—'}</p></div>
                <div><p className="text-xs text-slate-400">Received</p><p className="font-medium text-slate-700">{selected.createdAt?.toDate?.()?.toLocaleDateString('en-GB') ?? '—'}</p></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Source</label>
                  <select className={inputCls} value={selected.source ?? ''} onChange={e => updateLeadField('source', e.target.value)}>
                    <option value="">—</option>
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Assigned to</label>
                  <input className={inputCls} value={selected.assignedStaffName ?? ''} onChange={e => setSelected({ ...selected, assignedStaffName: e.target.value })} onBlur={e => updateLeadField('assignedStaffName', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Next follow-up</label>
                  <input type="date" className={inputCls} value={selected.nextFollowUpAt ?? ''} onChange={e => updateLeadField('nextFollowUpAt', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Conversion probability</label>
                  <select className={inputCls} value={selected.conversionProbability ?? ''} onChange={e => updateLeadField('conversionProbability', Number(e.target.value))}>
                    <option value="">—</option>
                    {[10, 25, 50, 75, 90].map(p => <option key={p} value={p}>{p}%</option>)}
                  </select>
                </div>
              </div>

              <button onClick={createFollowUpTask} className="w-full flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm">
                <ClipboardCheck className="w-4 h-4" /> Create follow-up task
              </button>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2">Notes &amp; contact history</label>
                <div className="space-y-2 max-h-40 overflow-y-auto mb-2">
                  {(selected.leadNotes ?? []).length === 0 ? (
                    <p className="text-xs text-slate-400">No notes yet</p>
                  ) : (
                    [...(selected.leadNotes ?? [])].reverse().map((n, i) => (
                      <div key={i} className="bg-slate-50 rounded-lg px-3 py-2">
                        <p className="text-sm text-slate-700">{n.text}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{n.author} · {n.createdAt?.toDate?.()?.toLocaleString('en-GB') ?? ''}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input className={inputCls} placeholder="Add a note…" value={noteDraft} onChange={e => setNoteDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addNote(); }} />
                  <button onClick={addNote} disabled={savingField || !noteDraft.trim()} className="shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center gap-1">
                    {savingField ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
