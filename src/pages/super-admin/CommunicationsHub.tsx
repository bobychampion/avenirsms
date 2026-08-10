/**
 * CommunicationsHub — unified super-admin messaging: one composer for
 * email + push, audience segmentation, templates, scheduling, and history.
 * Replaces the old separate "Send Announcement to Schools" / "Staff Broadcast"
 * panels that used to live on the platform dashboard.
 */
import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, limit as fbLimit, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast';
import { callApi } from '../../services/api';
import { generateAnnouncementDraft } from '../../services/geminiService';
import {
  MessageSquare, Send, Loader2, Sparkles, Users, History, FileText as TemplateIcon,
  Image as ImageIcon, ChevronDown, Calendar, X, Trash2, Save,
} from 'lucide-react';

type Tab = 'compose' | 'templates' | 'history';

interface AudienceFilter {
  roles: string[];
  schoolStatus?: string[];
  planTier?: string[];
  trialExpiringWithinDays?: number;
  inactiveForDays?: number;
}

interface PreviewRecipient { uid: string; email: string; name: string; role: string; schoolId: string | null; school: string; hasLogo: boolean; }
interface PreviewResult { recipients: PreviewRecipient[]; count: number; bySchool: Record<string, { count: number; hasLogo: boolean }>; }

interface CommsTemplate { id: string; name: string; channels: string[]; subject: string; message: string; createdAt?: any; }

interface CommsMessage {
  id: string; channels: string[]; subject: string; body: string; recipientCount: number;
  status: 'scheduled' | 'sending' | 'sent' | 'partial' | 'failed' | 'cancelled';
  scheduledFor?: any; sentAt?: any; createdBy?: string; createdAt?: any;
  failures?: { email: string; channel: string; error: string }[];
}

export default function CommunicationsHub() {
  const [tab, setTab] = useState<Tab>('compose');

  // ── Compose: audience ────────────────────────────────────────────────────
  const [roleAdmins, setRoleAdmins] = useState(true);
  const [roleTeachers, setRoleTeachers] = useState(false);
  const [schoolStatus, setSchoolStatus] = useState<string[]>([]);
  const [planTier, setPlanTier] = useState<string[]>([]);
  const [trialFilterOn, setTrialFilterOn] = useState(false);
  const [trialDays, setTrialDays] = useState(7);
  const [inactiveFilterOn, setInactiveFilterOn] = useState(false);
  const [inactiveDays, setInactiveDays] = useState(30);
  const [channelPush, setChannelPush] = useState(false);

  // ── Compose: content ─────────────────────────────────────────────────────
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  // ── Compose: preview + send ──────────────────────────────────────────────
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [sending, setSending] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const buildFilter = (): AudienceFilter => {
    const roles: string[] = [];
    if (roleAdmins) roles.push('admin', 'School_admin');
    if (roleTeachers) roles.push('teacher');
    const filter: AudienceFilter = { roles };
    if (schoolStatus.length) filter.schoolStatus = schoolStatus;
    if (planTier.length) filter.planTier = planTier;
    if (trialFilterOn) filter.trialExpiringWithinDays = trialDays;
    if (inactiveFilterOn) filter.inactiveForDays = inactiveDays;
    return filter;
  };

  const channels = () => (channelPush ? ['email', 'push'] : ['email']);

  // Any change to who's targeted invalidates the last preview — Send/Schedule
  // stays locked until a fresh preview is pulled for the current selection.
  useEffect(() => { setPreview(null); }, [roleAdmins, roleTeachers, schoolStatus, planTier, trialFilterOn, trialDays, inactiveFilterOn, inactiveDays]);

  const fetchPreview = async () => {
    if (!roleAdmins && !roleTeachers) { toast.error('Select at least one audience (Admins or Teachers)'); return; }
    setPreviewLoading(true);
    try {
      const result = await callApi<PreviewResult>('/api/comms?action=preview-audience', { filter: buildFilter() });
      setPreview(result);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to load recipients');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) { toast.error('Describe what the message is about first'); return; }
    setGenerating(true);
    const tid = toast.loading('Drafting with AI…');
    try {
      const draft = await generateAnnouncementDraft(topic, 'staff');
      if (!draft.subject && !draft.message) throw new Error('empty draft');
      setSubject(draft.subject);
      setMessage(draft.message);
      toast.success('Draft ready — review before sending', { id: tid });
    } catch (err: any) {
      toast.error(`Failed to generate draft: ${err?.message ?? 'unknown error'}`, { id: tid });
    } finally {
      setGenerating(false);
    }
  };

  const resetCompose = () => {
    setTopic(''); setSubject(''); setMessage(''); setPreview(null); setScheduledFor(''); setSendMode('now');
  };

  const handleSendNow = async () => {
    if (!preview) return;
    if (!subject.trim() || !message.trim()) { toast.error('Subject and message are required'); return; }
    setSending(true);
    try {
      const result = await callApi<{ ok: boolean; sentCount: number; failedCount: number; status: string }>('/api/comms?action=send', {
        channels: channels(), subject, message, filter: buildFilter(),
      });
      if (result.status === 'sent') toast.success(`Sent to all ${result.sentCount} recipient${result.sentCount !== 1 ? 's' : ''}`);
      else if (result.status === 'partial') toast.error(`Sent ${result.sentCount}, failed ${result.failedCount} — check History for details`);
      else toast.error('Send failed — check History for details');
      resetCompose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleSchedule = async () => {
    if (!preview) return;
    if (!subject.trim() || !message.trim()) { toast.error('Subject and message are required'); return; }
    if (!scheduledFor) { toast.error('Pick a date and time to send'); return; }
    setSending(true);
    try {
      const iso = new Date(scheduledFor).toISOString();
      const result = await callApi<{ ok: boolean; recipientCount: number; scheduledFor: string }>('/api/comms?action=schedule', {
        channels: channels(), subject, message, filter: buildFilter(), scheduledFor: iso,
      });
      toast.success(`Scheduled for ${new Date(result.scheduledFor).toLocaleString()} — ${result.recipientCount} recipients`);
      resetCompose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to schedule');
    } finally {
      setSending(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) { toast.error('Name the template first'); return; }
    if (!subject.trim() || !message.trim()) { toast.error('Subject and message are required'); return; }
    setSavingTemplate(true);
    try {
      await addDoc(collection(db, 'comms_templates'), {
        name: templateName.trim(), channels: channels(), subject, message, createdAt: Timestamp.now(),
      });
      toast.success('Template saved');
      setSaveTemplateOpen(false);
      setTemplateName('');
    } catch {
      toast.error('Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  // ── Templates tab ─────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<CommsTemplate[] | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'comms_templates'), orderBy('createdAt', 'desc')));
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommsTemplate)));
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => { if (tab === 'templates' && templates === null) fetchTemplates(); }, [tab]);

  const loadTemplate = (t: CommsTemplate) => {
    setSubject(t.subject);
    setMessage(t.message);
    setChannelPush(t.channels.includes('push'));
    setTab('compose');
    toast.success(`Loaded "${t.name}" — pick an audience and preview before sending`);
  };

  const deleteTemplate = async (t: CommsTemplate) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'comms_templates', t.id));
      setTemplates(prev => prev?.filter(x => x.id !== t.id) ?? null);
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  // ── History tab ───────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<CommsMessage[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'comms_messages'), orderBy('createdAt', 'desc'), fbLimit(50)));
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommsMessage)));
    } catch {
      toast.error('Failed to load message history');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { if (tab === 'history' && messages === null) fetchHistory(); }, [tab]);

  const cancelScheduled = async (m: CommsMessage) => {
    try {
      await callApi('/api/comms?action=cancel', { messageId: m.id });
      setMessages(prev => prev?.map(x => x.id === m.id ? { ...x, status: 'cancelled' as const } : x) ?? null);
      toast.success('Scheduled message cancelled');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to cancel');
    }
  };

  const statusBadge = (status: CommsMessage['status']) => {
    const map: Record<string, string> = {
      sent: 'bg-emerald-100 text-emerald-700', partial: 'bg-amber-100 text-amber-700',
      failed: 'bg-red-100 text-red-700', scheduled: 'bg-indigo-100 text-indigo-700',
      cancelled: 'bg-slate-100 text-slate-500', sending: 'bg-blue-100 text-blue-700',
    };
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? map.sent}`}>{status}</span>;
  };

  const formatDateTime = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-indigo-600" /> Communications Hub
        </h1>
        <p className="text-slate-500 text-sm mt-1">Reach admins and teachers across the platform — email and push, one composer.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {([
          { id: 'compose' as Tab, label: 'Compose', icon: Send },
          { id: 'templates' as Tab, label: 'Templates', icon: TemplateIcon },
          { id: 'history' as Tab, label: 'History', icon: History },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'compose' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-indigo-600" /> Audience</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Role</label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setRoleAdmins(v => !v)} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${roleAdmins ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Admins</button>
                <button onClick={() => setRoleTeachers(v => !v)} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${roleTeachers ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Teachers</button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">School status <span className="font-normal normal-case text-slate-400">(none selected = all)</span></label>
              <div className="flex flex-wrap gap-2">
                {(['active', 'trial', 'demo', 'suspended'] as const).map(s => (
                  <button key={s} onClick={() => setSchoolStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${schoolStatus.includes(s) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Plan <span className="font-normal normal-case text-slate-400">(none selected = all)</span></label>
              <div className="flex flex-wrap gap-2">
                {(['free', 'starter', 'pro', 'enterprise'] as const).map(p => (
                  <button key={p} onClick={() => setPlanTier(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${planTier.includes(p) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={trialFilterOn} onChange={e => setTrialFilterOn(e.target.checked)} className="rounded" />
                Trial/demo expiring within
                <input type="number" min={1} value={trialDays} onChange={e => setTrialDays(Number(e.target.value) || 1)} disabled={!trialFilterOn}
                  className="w-14 px-1.5 py-0.5 border border-slate-200 rounded text-xs disabled:opacity-40" /> days
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={inactiveFilterOn} onChange={e => setInactiveFilterOn(e.target.checked)} className="rounded" />
                Inactive for
                <input type="number" min={1} value={inactiveDays} onChange={e => setInactiveDays(Number(e.target.value) || 1)} disabled={!inactiveFilterOn}
                  className="w-14 px-1.5 py-0.5 border border-slate-200 rounded text-xs disabled:opacity-40" /> days
              </label>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-semibold text-slate-800 text-sm mb-3">Channels</h2>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 text-white">Email</span>
              <button onClick={() => setChannelPush(v => !v)} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${channelPush ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Push / in-app</button>
              <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-50 text-slate-300 cursor-not-allowed" title="Coming later">WhatsApp — coming soon</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-600 inline -mt-0.5 mr-1" />
                Draft with AI <span className="font-normal text-slate-400">(optional — describe it, review before sending)</span>
              </label>
              <div className="flex gap-2">
                <input className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                  placeholder="e.g. new term resumption date, scheduled maintenance"
                  value={topic} onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }} />
                <button onClick={handleGenerate} disabled={generating || !topic.trim()}
                  className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm whitespace-nowrap">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Subject</label>
              <input className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. New Term Resumption Date" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Message</label>
              <textarea className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-28 resize-none"
                value={message} onChange={e => setMessage(e.target.value)} placeholder="Write your message here…" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={fetchPreview} disabled={previewLoading}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm">
                {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                {previewLoading ? 'Loading…' : preview ? 'Refresh recipients' : 'Preview recipients'}
              </button>

              <div className="flex rounded-xl overflow-hidden border border-slate-200 text-xs font-semibold">
                <button onClick={() => setSendMode('now')} className={`px-3 py-2 ${sendMode === 'now' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>Send now</button>
                <button onClick={() => setSendMode('schedule')} className={`px-3 py-2 flex items-center gap-1 ${sendMode === 'schedule' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}><Calendar className="w-3.5 h-3.5" /> Schedule</button>
              </div>

              {sendMode === 'schedule' && (
                <input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={sendMode === 'now' ? handleSendNow : handleSchedule}
                disabled={!preview || preview.recipients.length === 0 || sending || !subject.trim() || !message.trim() || (sendMode === 'schedule' && !scheduledFor)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending
                  ? (sendMode === 'now' ? 'Sending…' : 'Scheduling…')
                  : preview
                    ? `${sendMode === 'now' ? 'Send' : 'Schedule'} for ${preview.recipients.length} recipient${preview.recipients.length !== 1 ? 's' : ''}`
                    : 'Preview recipients first'}
              </button>

              <button onClick={() => setSaveTemplateOpen(true)} disabled={!subject.trim() || !message.trim()}
                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm">
                <Save className="w-4 h-4" /> Save as template
              </button>
            </div>

            {preview && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    {preview.recipients.length} recipient{preview.recipients.length !== 1 ? 's' : ''} across {Object.keys(preview.bySchool).length} school{Object.keys(preview.bySchool).length !== 1 ? 's' : ''}
                  </span>
                  {preview.recipients.some(r => !r.hasLogo) && (
                    <span className="flex items-center gap-1 text-amber-600 font-medium">
                      <ImageIcon className="w-3.5 h-3.5" /> {preview.recipients.filter(r => !r.hasLogo).length} without a renderable logo
                    </span>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                  {Object.entries(preview.bySchool).map(([school, info]: [string, { count: number; hasLogo: boolean }]) => (
                    <div key={school} className="px-4 py-2 flex items-center justify-between text-xs">
                      <span className="text-slate-700">{school}</span>
                      <span className="text-slate-500">{info.count} recipient{info.count !== 1 ? 's' : ''}{!info.hasLogo && <span className="text-amber-600 ml-2">no logo</span>}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {saveTemplateOpen && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setSaveTemplateOpen(false)}>
              <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
                <h3 className="font-semibold text-slate-800">Save as template</h3>
                <input autoFocus className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Template name" value={templateName} onChange={e => setTemplateName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveTemplate(); }} />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setSaveTemplateOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                  <button onClick={handleSaveTemplate} disabled={savingTemplate} className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl flex items-center gap-1.5">
                    {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'templates' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {templatesLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
          ) : !templates || templates.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No saved templates yet — save one from the Compose tab.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {templates.map(t => (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{t.name}</p>
                    <p className="text-xs text-slate-500 truncate">{t.subject}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => loadTemplate(t)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50">Load</button>
                    <button onClick={() => deleteTemplate(t)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">Last 50, most recent first</span>
            <button onClick={fetchHistory} disabled={historyLoading} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold px-3 py-1.5 rounded-lg transition-colors text-xs">
              {historyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />} Refresh
            </button>
          </div>
          {historyLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
          ) : !messages || messages.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No messages yet</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[32rem] overflow-y-auto">
              {messages.map(m => {
                const isExpanded = expandedId === m.id;
                return (
                  <div key={m.id} className="px-5 py-3">
                    <button onClick={() => setExpandedId(isExpanded ? null : m.id)} className="w-full flex items-start justify-between gap-4 text-left">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800 truncate">{m.subject}</p>
                          {statusBadge(m.status)}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {m.recipientCount} recipient{m.recipientCount !== 1 ? 's' : ''} · {m.channels?.join(' + ')} · by {m.createdBy ?? 'unknown'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-400 whitespace-nowrap">{formatDateTime(m.status === 'scheduled' ? m.scheduledFor : (m.sentAt ?? m.createdAt))}</span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="mt-2 pl-1 space-y-2">
                        {m.status === 'scheduled' && (
                          <button onClick={() => cancelScheduled(m)} className="text-xs font-semibold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg flex items-center gap-1">
                            <X className="w-3.5 h-3.5" /> Cancel scheduled send
                          </button>
                        )}
                        {m.failures && m.failures.length > 0 && (
                          <div className="text-xs">
                            <p className="font-semibold text-red-600 mb-1">{m.failures.length} failure{m.failures.length !== 1 ? 's' : ''}:</p>
                            {m.failures.slice(0, 10).map((f, i) => (
                              <p key={i} className="text-slate-500">{f.email} ({f.channel}) — {f.error}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
