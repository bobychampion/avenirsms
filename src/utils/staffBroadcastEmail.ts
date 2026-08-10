/**
 * Builds a per-recipient branded HTML email for the super-admin "Staff Broadcast" tool.
 * Each recipient gets their own school's logo/color — same shell used for the
 * summer-break blast, generalized to an arbitrary subject/message.
 */

export interface StaffBroadcastRecipient {
  displayName?: string;
  email: string;
}

export interface SchoolBrandingLite {
  schoolName?: string;
  primaryColor?: string;
  logoUrl?: string;
}

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function buildStaffBroadcastEmail(
  recipient: StaffBroadcastRecipient,
  branding: SchoolBrandingLite,
  content: { subject: string; message: string },
): { subject: string; html: string } {
  const first = esc((recipient.displayName || recipient.email.split('@')[0]).split(' ')[0]);
  const schoolName = esc(branding.schoolName || 'Your School');
  const color = /^#[0-9a-f]{3,8}$/i.test(branding.primaryColor || '') ? branding.primaryColor! : '#4f46e5';
  // data: URIs are stripped by every major email client — only an https logo will render.
  const logoUrl = /^https:\/\//i.test(branding.logoUrl || '') ? branding.logoUrl! : '';
  const logoBlock = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${schoolName}" style="height:56px;max-width:200px;object-fit:contain;display:block;" />`
    : `<span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${schoolName}</span>`;

  const bodyHtml = esc(content.message).replace(/\n/g, '<br/>');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:Inter,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;padding:36px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(79,70,229,0.10);max-width:600px;">
  <tr><td style="background:${color};padding:24px 40px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>${logoBlock}</td>
      <td align="right" style="vertical-align:middle;"><span style="font-size:11px;color:rgba(255,255,255,0.75);font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Avenir SIS</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:36px 40px 28px;color:#1e293b;font-size:15px;line-height:1.75;">
    <p style="margin:0 0 18px;">Dear <strong>${first}</strong>,</p>
    <div style="margin:0 0 8px;">${bodyHtml}</div>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">Sent to staff at <strong>${schoolName}</strong> via Avenir SIS.<br/>&copy; ${new Date().getFullYear()} Avenir SIS &middot; School Information System for Nigerian Schools</p>
  </td></tr>
</table></td></tr></table></body></html>`;

  return { subject: content.subject, html };
}
