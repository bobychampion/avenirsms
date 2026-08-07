/**
 * Resend email service for AvenirSMS.
 *
 * API key is injected via Firebase secret RESEND_API_KEY — never hardcoded.
 * Set the secret once with:
 *   firebase functions:secrets:set RESEND_API_KEY
 *
 * All callables that use this module must declare { secrets: [resendApiKey] }
 * in their function options so the runtime mounts the secret.
 */
import { defineSecret } from 'firebase-functions/params';
import { Resend } from 'resend';

export const resendApiKey = defineSecret('RESEND_API_KEY');

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text fallback — auto-stripped from html if omitted */
  text?: string;
  /** Override the default "from" address (must be a verified Resend domain) */
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  /** Resend tags for analytics grouping, e.g. [{ name: 'type', value: 'fee_reminder' }] */
  tags?: { name: string; value: string }[];
}

/**
 * Default from address.
 * Replace with your verified Resend domain:
 *   Resend dashboard → Domains → verify your domain → use noreply@yourdomain.com
 */
const DEFAULT_FROM = 'Avenir SIS <noreply@avenirsms.com>';

/**
 * Send a transactional email via Resend.
 * Must be called from a Cloud Function that has `secrets: [resendApiKey]` set.
 */
export async function sendEmail(payload: EmailPayload): Promise<{ id: string }> {
  const key = resendApiKey.value();
  if (!key) {
    throw new Error('RESEND_API_KEY secret is not set. Run: firebase functions:secrets:set RESEND_API_KEY');
  }

  const resend = new Resend(key);

  const { data, error } = await resend.emails.send({
    from: payload.from ?? DEFAULT_FROM,
    to: Array.isArray(payload.to) ? payload.to : [payload.to],
    subject: payload.subject,
    html: payload.html,
    ...(payload.text ? { text: payload.text } : {}),
    ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
    ...(payload.cc ? { cc: Array.isArray(payload.cc) ? payload.cc : [payload.cc] } : {}),
    ...(payload.bcc ? { bcc: Array.isArray(payload.bcc) ? payload.bcc : [payload.bcc] } : {}),
    ...(payload.tags ? { tags: payload.tags } : {}),
  });

  if (error || !data) {
    throw new Error(`Resend error: ${error?.message ?? 'unknown'}`);
  }

  return { id: data.id };
}
