import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from './_lib/admin.js';
import { requireAuth, AppError, errorResponse } from './_lib/auth.js';
import { Resend } from 'resend';
import * as templates from '../functions/src/email/emailTemplates.js';
import { applyCors } from './_lib/cors.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const ALLOWED_ROLES = ['super_admin', 'admin', 'School_admin', 'teacher', 'accountant', 'hr'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const caller = await requireAuth(req);
    if (!ALLOWED_ROLES.includes(caller.role)) {
      throw new AppError('permission-denied', 'Insufficient role to send email.');
    }

    const { template, data: templateData, to } = req.body ?? {};
    if (!template || !to) throw new AppError('invalid-argument', 'template and to are required.');

    let subject: string;
    let html: string;

    if (template === 'raw') {
      subject = templateData.subject;
      html = templateData.html;
      if (!subject || !html) throw new AppError('invalid-argument', 'Raw email requires subject and html.');
    } else {
      const branding: templates.SchoolBranding = {
        schoolName: templateData.schoolName ?? 'Avenir SIS',
        primaryColor: templateData.primaryColor,
        appUrl: templateData.appUrl,
      };
      const d = { ...templateData, branding };

      const tpl = (templates as any)[template];
      if (typeof tpl !== 'function') throw new AppError('invalid-argument', `Unknown template: ${template}`);
      ({ subject, html } = tpl(d));
    }

    const { data, error } = await resend.emails.send({
      from: 'Avenir SIS <noreply@avenirsms.com.ng>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      tags: [{ name: 'template', value: template }],
    });

    if (error) throw new AppError('internal', `Resend error: ${error.message}`);

    // Audit log
    const db = getFirestore();
    await db.collection('audit_log').add({
      schoolId: caller.schoolId ?? null,
      actorId: caller.uid,
      actorEmail: caller.email,
      actorRole: caller.role,
      action: 'email.sent',
      details: { template, to, subject, resendId: data?.id },
      createdAt: new Date(),
    });

    return res.status(200).json({ id: data?.id });
  } catch (err) {
    return errorResponse(res, err);
  }
}
