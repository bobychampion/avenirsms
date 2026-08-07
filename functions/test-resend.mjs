/**
 * Quick Resend API connectivity test.
 * Run from the functions/ directory:
 *   node test-resend.mjs
 */
import { Resend } from 'resend';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency needed for a one-shot test)
let apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  try {
    const env = readFileSync(join(__dir, '.env'), 'utf8');
    const match = env.match(/^RESEND_API_KEY=(.+)$/m);
    if (match) apiKey = match[1].trim();
  } catch {}
}

if (!apiKey) {
  console.error('❌  RESEND_API_KEY not found in environment or .env');
  process.exit(1);
}

const resend = new Resend(apiKey);

console.log('Sending test email via Resend…');

const { data, error } = await resend.emails.send({
  // onboarding@resend.dev works without domain verification — perfect for API key testing
  from: 'Avenir SIS <onboarding@resend.dev>',
  to: ['avenirsms87@gmail.com'],   // must be the Resend account email while domain unverified
  subject: '✅ Avenir SIS — Resend integration test',
  html: `
    <!DOCTYPE html>
    <html><body style="font-family:Inter,Arial,sans-serif;background:#f1f5f9;padding:40px 0;margin:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08);">
            <tr><td style="background:#4f46e5;padding:28px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">Avenir SIS</p>
            </td></tr>
            <tr><td style="padding:36px 40px;color:#1e293b;font-size:15px;line-height:1.7;">
              <h2 style="margin:0 0 16px;color:#4f46e5;">✅ Resend is working!</h2>
              <p>This confirms that your Resend API key is valid and the email integration is correctly set up for Avenir SIS.</p>
              <p>Once Cloud Functions are deployed (Blaze plan), transactional emails — admission approvals, fee reminders, staff welcome — will go live automatically.</p>
            </td></tr>
            <tr><td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">Automated test from Avenir SIS · ${new Date().toISOString()}</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>
  `,
});

if (error) {
  console.error('❌  FAILED:', JSON.stringify(error, null, 2));
  process.exit(1);
}

console.log('✅  SUCCESS — email delivered!');
console.log('   Resend message ID:', data.id);
console.log('   Check your inbox at Champion@oscardiagnostics.com');
