import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from './_lib/admin.js';
import { requireAuth, AppError, errorResponse, isSuperAdmin } from './_lib/auth.js';
import { resolveAudience, sendToRecipients, AudienceFilter } from './_lib/comms.js';

// Communications Hub — Vercel Hobby route budget means this is one route with
// an ?action= discriminator rather than one route per verb (same pattern as
// google.ts). Handles: preview-audience / send / schedule / cancel.
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
