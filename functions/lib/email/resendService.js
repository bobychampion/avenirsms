"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resendApiKey = void 0;
exports.sendEmail = sendEmail;
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
const params_1 = require("firebase-functions/params");
const resend_1 = require("resend");
exports.resendApiKey = (0, params_1.defineSecret)('RESEND_API_KEY');
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
async function sendEmail(payload) {
    const key = exports.resendApiKey.value();
    if (!key) {
        throw new Error('RESEND_API_KEY secret is not set. Run: firebase functions:secrets:set RESEND_API_KEY');
    }
    const resend = new resend_1.Resend(key);
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
//# sourceMappingURL=resendService.js.map