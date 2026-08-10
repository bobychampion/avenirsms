import { callApi } from './api';

type EmailTemplateType =
  | 'admissionApproved'
  | 'admissionRejected'
  | 'feeReminder'
  | 'staffWelcome'
  | 'parentNotification'
  | 'attendanceAlert'
  | 'reportCardReady'
  | 'schoolSuspended'
  | 'demoProvisioned'
  | 'platformInvoice'
  | 'raw';

interface SendEmailRequest {
  template: EmailTemplateType;
  data: Record<string, any>;
  to: string | string[];
}

async function send(req: SendEmailRequest): Promise<string> {
  const result = await callApi<{ id: string }>('/api/send-email', req);
  return result.id;
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

interface BrandingData {
  schoolName: string;
  primaryColor?: string;
  appUrl?: string;
}

export async function sendAdmissionApproved(opts: {
  to: string;
  branding: BrandingData;
  studentName: string;
  guardianName: string;
  classAdmittedTo: string;
  loginEmail?: string;
}) {
  return send({ template: 'admissionApproved', to: opts.to, data: { ...opts, ...opts.branding } });
}

export async function sendAdmissionRejected(opts: {
  to: string;
  branding: BrandingData;
  studentName: string;
  guardianName: string;
  reason?: string;
}) {
  return send({ template: 'admissionRejected', to: opts.to, data: { ...opts, ...opts.branding } });
}

export async function sendFeeReminder(opts: {
  to: string;
  branding: BrandingData;
  guardianName: string;
  studentName: string;
  feeDescription: string;
  amountNaira: number;
  dueDate: string;
  daysOverdue?: number;
  portalUrl?: string;
}) {
  return send({ template: 'feeReminder', to: opts.to, data: { ...opts, ...opts.branding } });
}

export async function sendStaffWelcome(opts: {
  to: string;
  branding: BrandingData;
  displayName: string;
  role: string;
  loginEmail: string;
  temporaryPassword: string;
  loginUrl?: string;
}) {
  return send({ template: 'staffWelcome', to: opts.to, data: { ...opts, ...opts.branding } });
}

export async function sendParentNotification(opts: {
  to: string;
  branding: BrandingData;
  guardianName: string;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  return send({ template: 'parentNotification', to: opts.to, data: { ...opts, ...opts.branding } });
}

export async function sendAttendanceAlert(opts: {
  to: string;
  branding: BrandingData;
  guardianName: string;
  studentName: string;
  attendanceRate: number;
  totalAbsent: number;
  portalUrl?: string;
}) {
  return send({ template: 'attendanceAlert', to: opts.to, data: { ...opts, ...opts.branding } });
}

export async function sendReportCardReady(opts: {
  to: string;
  branding: BrandingData;
  guardianName: string;
  studentName: string;
  term: string;
  session: string;
  portalUrl?: string;
}) {
  return send({ template: 'reportCardReady', to: opts.to, data: { ...opts, ...opts.branding } });
}

export async function sendSchoolSuspended(opts: {
  to: string;
  branding: BrandingData;
  adminName: string;
  reason?: string;
  contactEmail?: string;
}) {
  return send({ template: 'schoolSuspended', to: opts.to, data: { ...opts, ...opts.branding } });
}

export async function sendDemoProvisioned(opts: {
  to: string;
  branding: BrandingData;
  adminName: string;
  loginEmail: string;
  temporaryPassword: string;
  loginUrl?: string;
  expiresInDays?: number;
}) {
  return send({ template: 'demoProvisioned', to: opts.to, data: { ...opts, ...opts.branding } });
}

export async function sendPlatformInvoice(opts: {
  to: string;
  branding: BrandingData;
  adminName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  currency: string;
  currencySymbol: string;
  notes?: string;
  payUrl?: string;
}) {
  return send({ template: 'platformInvoice', to: opts.to, data: { ...opts, ...opts.branding } });
}

/** Send a single pre-built HTML email — used by callers that build their own template (e.g. per-recipient branded broadcasts). */
export async function sendRaw(opts: { to: string; subject: string; html: string }) {
  return send({ template: 'raw', to: opts.to, data: { subject: opts.subject, html: opts.html } });
}

export async function sendPlatformBroadcast(opts: {
  to: string | string[];
  subject: string;
  message: string;
  platformName?: string;
}) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.08);"><tr><td style="background:#4f46e5;padding:28px 40px;"><p style="margin:0;font-size:22px;font-weight:700;color:#fff;">${opts.platformName ?? 'Avenir SIS'}</p></td></tr><tr><td style="padding:36px 40px;color:#1e293b;font-size:15px;line-height:1.7;">${esc(opts.message)}</td></tr><tr><td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#94a3b8;">This is an official announcement from Avenir SIS. Do not reply directly to this email.</p></td></tr></table></td></tr></table></body></html>`;
  return send({ template: 'raw', to: opts.to, data: { subject: opts.subject, html } });
}
