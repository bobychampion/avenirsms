import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { getFirestore, getMessaging } from './_lib/admin.js';
import { requireAuth, AppError, errorResponse, isSuperAdmin } from './_lib/auth.js';
import { buildStaffBroadcastEmail } from '../src/utils/staffBroadcastEmail.js';

const resend = new Resend(process.env.RESEND_API_KEY);

// Communications Hub — Vercel's function-count budget means the audience-
// resolution and send helpers below live in this file (not api/_lib/) so
// api/cron/send-scheduled.ts can import them without adding another file
// under api/. Handles: preview-audience / send / schedule / cancel.

export interface AudienceFilter {
  roles?: string[]; // defaults to admin + School_admin + teacher
  schoolStatus?: string[]; // School['status'][]
  planTier?: string[]; // School['subscriptionPlan'][]
  trialExpiringWithinDays?: number;
  inactiveForDays?: number; // users.lastLoginAt older than this (or never logged in)
}

export interface ResolvedRecipient {
  uid: string;
  email: string;
  name: string;
  role: string;
  schoolId: string | null;
  school: string;
  hasLogo: boolean;
}

const DEFAULT_ROLES = ['admin', 'School_admin', 'teacher'];

export async function resolveAudience(
  db: FirebaseFirestore.Firestore,
  filter: AudienceFilter,
): Promise<ResolvedRecipient[]> {
  const roles = filter.roles?.length ? filter.roles : DEFAULT_ROLES;
  const usersSnap = await db.collection('users').where('role', 'in', roles).get();

  const seen = new Set<string>();
  let users = usersSnap.docs
    .map(d => ({ uid: d.id, ...d.data() } as any))
    .filter(u => u.email && !u.disabled && !u.deletedAt)
    .filter(u => {
      const key = String(u.email).toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (filter.inactiveForDays != null) {
    const cutoff = Date.now() - filter.inactiveForDays * 86400000;
    users = users.filter(u => {
      const last = u.lastLoginAt?.toMillis?.() ?? null;
      return last === null || last <= cutoff;
    });
  }

  const schoolIds = [...new Set(users.map(u => u.schoolId).filter(Boolean))] as string[];
  const schools: Record<string, any> = {};
  const schoolSettings: Record<string, any> = {};
  await Promise.all(schoolIds.map(async sid => {
    const [schoolSnap, settingsSnap] = await Promise.all([
      db.doc(`schools/${sid}`).get(),
      db.doc(`school_settings/${sid}`).get(),
    ]);
    schools[sid] = schoolSnap.exists ? schoolSnap.data() : {};
    schoolSettings[sid] = settingsSnap.exists ? settingsSnap.data() : {};
  }));

  if (filter.schoolStatus?.length) {
    users = users.filter(u => u.schoolId && filter.schoolStatus!.includes(schools[u.schoolId]?.status));
  }
  if (filter.planTier?.length) {
    users = users.filter(u => u.schoolId && filter.planTier!.includes(schools[u.schoolId]?.subscriptionPlan));
  }
  if (filter.trialExpiringWithinDays != null) {
    const cutoff = Date.now() + filter.trialExpiringWithinDays * 86400000;
    users = users.filter(u => {
      if (!u.schoolId) return false;
      const s = schools[u.schoolId];
      if (!s || !['trial', 'demo'].includes(s.status)) return false;
      const expiresAt = s.subscriptionExpiresAt?.toMillis?.() ?? null;
      return expiresAt !== null && expiresAt <= cutoff;
    });
  }

  return users.map(u => {
    const settings = (u.schoolId && schoolSettings[u.schoolId]) || {};
    return {
      uid: u.uid,
      email: u.email,
      name: u.displayName || u.email,
      role: u.role,
      schoolId: u.schoolId ?? null,
      school: settings.schoolName || schools[u.schoolId]?.name || '(no school)',
      hasLogo: /^https:\/\//i.test(settings.logoUrl || ''),
    };
  });
}

export interface SendResult {
  status: 'sent' | 'partial' | 'failed';
  sentCount: number;
  failedCount: number;
  failures: { email: string; channel: string; error: string }[];
}

/**
 * Sends subject/message to every recipient over each requested channel.
 * Re-fetches each recipient's school branding fresh at send time (not frozen
 * with the recipient list), so a scheduled message still carries a current logo.
 */
export async function sendToRecipients(
  db: FirebaseFirestore.Firestore,
  recipients: { uid: string; email: string; name: string; schoolId: string | null }[],
  channels: string[],
  subject: string,
  message: string,
): Promise<SendResult> {
  const schoolIds = [...new Set(recipients.map(r => r.schoolId).filter(Boolean))] as string[];
  const branding: Record<string, any> = {};
  await Promise.all(schoolIds.map(async sid => {
    const snap = await db.doc(`school_settings/${sid}`).get();
    branding[sid] = snap.exists ? snap.data() : {};
  }));

  const messaging = channels.includes('push') ? getMessaging() : null;
  let sentCount = 0;
  const failures: { email: string; channel: string; error: string }[] = [];

  for (const r of recipients) {
    const b = (r.schoolId && branding[r.schoolId]) || {};

    if (channels.includes('email')) {
      try {
        const { subject: s, html } = buildStaffBroadcastEmail({ displayName: r.name, email: r.email }, b, { subject, message });
        const { error } = await resend.emails.send({
          from: 'Avenir SIS <noreply@avenirsms.com.ng>',
          to: [r.email],
          subject: s,
          html,
        });
        if (error) throw new Error(error.message);
        sentCount++;
      } catch (e: any) {
        failures.push({ email: r.email, channel: 'email', error: e?.message ?? 'send failed' });
      }
    }

    if (channels.includes('push') && messaging) {
      try {
        const tokenSnap = await db.doc(`fcm_tokens/${r.uid}`).get();
        const token = tokenSnap.data()?.token;
        if (token) {
          await messaging.send({ token, notification: { title: subject, body: message.slice(0, 150) } });
        }
        await db.collection('notifications').add({
          recipientId: r.uid, title: subject, body: message, type: 'platform_announcement',
          read: false, schoolId: r.schoolId ?? null, createdAt: Timestamp.now(),
        });
      } catch (e: any) {
        failures.push({ email: r.email, channel: 'push', error: e?.message ?? 'push failed' });
      }
    }

    // Stay under Resend's rate limit.
    await new Promise(res => setTimeout(res, 250));
  }

  const failedCount = failures.length;
  const status: SendResult['status'] = failedCount === 0 ? 'sent' : sentCount === 0 ? 'failed' : 'partial';
  return { status, sentCount, failedCount, failures };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = req.query.action as string;
  const body = req.body ?? {};

  try {
    const caller = await requireAuth(req);
    if (!isSuperAdmin(caller)) throw new AppError('permission-denied', 'Super admin only.');
    const db = getFirestore();

    if (action === 'preview-audience') {
      const filter: AudienceFilter = body.filter ?? {};
      const recipients = await resolveAudience(db, filter);
      const bySchool: Record<string, { count: number; hasLogo: boolean }> = {};
      for (const r of recipients) {
        bySchool[r.school] ??= { count: 0, hasLogo: r.hasLogo };
        bySchool[r.school].count++;
      }
      return res.status(200).json({ recipients, count: recipients.length, bySchool });
    }

    if (action === 'send') {
      const { channels, subject, message, filter } = body as { channels: string[]; subject: string; message: string; filter: AudienceFilter };
      if (!channels?.length || !subject?.trim() || !message?.trim()) {
        throw new AppError('invalid-argument', 'channels, subject and message are required.');
      }
      const recipients = await resolveAudience(db, filter ?? {});
      if (recipients.length === 0) throw new AppError('invalid-argument', 'No recipients match this audience.');

      const result = await sendToRecipients(db, recipients, channels, subject, message);

      const msgRef = db.collection('comms_messages').doc();
      await msgRef.set({
        channels, subject, body: message, audienceFilter: filter ?? {},
        recipients: recipients.map(r => ({ email: r.email, schoolId: r.schoolId })),
        recipientCount: recipients.length,
        status: result.status,
        failures: result.failures,
        sentAt: Timestamp.now(),
        createdBy: caller.email, createdAt: Timestamp.now(),
      });
      await db.collection('audit_log').add({
        actorId: caller.uid, actorEmail: caller.email, actorRole: caller.role,
        action: 'comms.sent', details: { channels, subject, recipientCount: recipients.length, status: result.status },
        createdAt: new Date(),
      });

      return res.status(200).json({ ok: true, messageId: msgRef.id, ...result });
    }

    if (action === 'schedule') {
      const { channels, subject, message, filter, scheduledFor } = body as { channels: string[]; subject: string; message: string; filter: AudienceFilter; scheduledFor: string };
      if (!channels?.length || !subject?.trim() || !message?.trim() || !scheduledFor) {
        throw new AppError('invalid-argument', 'channels, subject, message and scheduledFor are required.');
      }
      const when = new Date(scheduledFor);
      if (isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        throw new AppError('invalid-argument', 'scheduledFor must be a valid future date.');
      }
      const recipients = await resolveAudience(db, filter ?? {});
      if (recipients.length === 0) throw new AppError('invalid-argument', 'No recipients match this audience.');

      const msgRef = db.collection('comms_messages').doc();
      await msgRef.set({
        channels, subject, body: message, audienceFilter: filter ?? {},
        recipients: recipients.map(r => ({ uid: r.uid, email: r.email, name: r.name, schoolId: r.schoolId })),
        recipientCount: recipients.length,
        status: 'scheduled',
        scheduledFor: Timestamp.fromDate(when),
        createdBy: caller.email, createdAt: Timestamp.now(),
      });

      return res.status(200).json({ ok: true, messageId: msgRef.id, recipientCount: recipients.length, scheduledFor: when.toISOString() });
    }

    if (action === 'cancel') {
      const { messageId } = body as { messageId: string };
      if (!messageId) throw new AppError('invalid-argument', 'messageId is required.');
      const ref = db.doc(`comms_messages/${messageId}`);
      const snap = await ref.get();
      if (!snap.exists) throw new AppError('not-found', 'Message not found.');
      if (snap.data()?.status !== 'scheduled') throw new AppError('failed-precondition', 'Only a scheduled message can be cancelled.');
      await ref.update({ status: 'cancelled' });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    return errorResponse(res, err);
  }
}
