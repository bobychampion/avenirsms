/**
 * HTML email templates for AvenirSMS transactional emails.
 * All templates follow the school's NERDC-focused Nigerian context.
 */

/** Shared branded wrapper */
function layout(schoolName: string, primaryColor: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${schoolName}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:${primaryColor};padding:28px 40px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${schoolName}</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;color:#1e293b;font-size:15px;line-height:1.7;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              This is an automated message from ${schoolName} via Avenir SIS.
              Please do not reply directly to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(url: string, label: string, color: string): string {
  return `<p style="margin:24px 0 0;">
    <a href="${url}" style="display:inline-block;padding:12px 28px;background:${color};color:#fff;font-weight:600;font-size:15px;border-radius:8px;text-decoration:none;">${label}</a>
  </p>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export interface SchoolBranding {
  schoolName: string;
  primaryColor?: string;
  appUrl?: string;
}

const DEFAULT_COLOR = '#4f46e5';

/** Admission approved */
export function admissionApproved(opts: {
  branding: SchoolBranding;
  studentName: string;
  guardianName: string;
  classAdmittedTo: string;
  loginEmail?: string;
}): { subject: string; html: string } {
  const { branding, studentName, guardianName, classAdmittedTo, loginEmail } = opts;
  const color = branding.primaryColor ?? DEFAULT_COLOR;
  const subject = `Admission Approved — ${studentName} | ${branding.schoolName}`;
  const html = layout(branding.schoolName, color, `
    <p>Dear <strong>${guardianName}</strong>,</p>
    <p>We are pleased to inform you that <strong>${studentName}</strong>'s application
       for admission to <strong>${branding.schoolName}</strong> has been
       <span style="color:#16a34a;font-weight:600;">approved</span>.</p>
    <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;">
      <tr><td style="font-size:14px;">
        <p style="margin:0 0 6px;"><strong>Student:</strong> ${studentName}</p>
        <p style="margin:0 0 6px;"><strong>Class:</strong> ${classAdmittedTo}</p>
        ${loginEmail ? `<p style="margin:0;"><strong>Login email:</strong> ${loginEmail}</p>` : ''}
      </td></tr>
    </table>
    <p>Please visit the school office within 5 working days to complete the enrollment formalities
       and submit all required documents.</p>
    ${branding.appUrl ? button(branding.appUrl, 'View Student Portal', color) : ''}
    <p style="margin-top:28px;">Congratulations and welcome to the ${branding.schoolName} family!</p>
    <p>Regards,<br/><strong>${branding.schoolName} Admissions Office</strong></p>
  `);
  return { subject, html };
}

/** Admission rejected */
export function admissionRejected(opts: {
  branding: SchoolBranding;
  studentName: string;
  guardianName: string;
  reason?: string;
}): { subject: string; html: string } {
  const { branding, studentName, guardianName, reason } = opts;
  const color = branding.primaryColor ?? DEFAULT_COLOR;
  const subject = `Application Update — ${studentName} | ${branding.schoolName}`;
  const html = layout(branding.schoolName, color, `
    <p>Dear <strong>${guardianName}</strong>,</p>
    <p>Thank you for submitting an application for <strong>${studentName}</strong>
       to <strong>${branding.schoolName}</strong>.</p>
    <p>After careful review, we regret to inform you that we are unable to offer admission
       at this time${reason ? ` due to: <em>${reason}</em>` : ''}.</p>
    <p>We encourage you to reapply when the next admission window opens.
       For further enquiries, please contact the admissions office directly.</p>
    <p>Thank you for your interest in our school.</p>
    <p>Regards,<br/><strong>${branding.schoolName} Admissions Office</strong></p>
  `);
  return { subject, html };
}

/** Fee payment reminder */
export function feeReminder(opts: {
  branding: SchoolBranding;
  guardianName: string;
  studentName: string;
  feeDescription: string;
  amountNaira: number;
  dueDate: string;
  daysOverdue?: number;
  portalUrl?: string;
}): { subject: string; html: string } {
  const { branding, guardianName, studentName, feeDescription, amountNaira, dueDate, daysOverdue, portalUrl } = opts;
  const color = branding.primaryColor ?? DEFAULT_COLOR;
  const isOverdue = (daysOverdue ?? 0) > 0;
  const subject = isOverdue
    ? `OVERDUE: ${feeDescription} for ${studentName} | ${branding.schoolName}`
    : `Fee Reminder: ${feeDescription} for ${studentName} | ${branding.schoolName}`;

  const html = layout(branding.schoolName, color, `
    <p>Dear <strong>${guardianName}</strong>,</p>
    <p>This is a ${isOverdue ? '<strong style="color:#dc2626;">overdue payment notice</strong>' : 'friendly reminder'} regarding outstanding school fees for
       <strong>${studentName}</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;">
      <tr><td style="font-size:14px;">
        <p style="margin:0 0 6px;"><strong>Fee:</strong> ${feeDescription}</p>
        <p style="margin:0 0 6px;"><strong>Amount:</strong> ₦${amountNaira.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</p>
        <p style="margin:0 0 6px;"><strong>Due date:</strong> ${dueDate}</p>
        ${isOverdue ? `<p style="margin:0;color:#dc2626;font-weight:600;">Overdue by ${daysOverdue} day(s)</p>` : ''}
      </td></tr>
    </table>
    <p>Please make payment as soon as possible to avoid disruption to your child's schooling.
       You may pay via the parent portal (card), bank transfer, or at the school bursar's office.</p>
    ${portalUrl ? button(portalUrl, 'Pay Now via Portal', color) : ''}
    <p style="margin-top:24px;">If you have already made payment, please disregard this notice.</p>
    <p>Regards,<br/><strong>${branding.schoolName} Bursary</strong></p>
  `);
  return { subject, html };
}

/** New staff / user welcome email with temporary password */
export function staffWelcome(opts: {
  branding: SchoolBranding;
  displayName: string;
  role: string;
  loginEmail: string;
  temporaryPassword: string;
  loginUrl?: string;
}): { subject: string; html: string } {
  const { branding, displayName, role, loginEmail, temporaryPassword, loginUrl } = opts;
  const color = branding.primaryColor ?? DEFAULT_COLOR;
  const subject = `Welcome to ${branding.schoolName} — Your Portal Access`;
  const html = layout(branding.schoolName, color, `
    <p>Dear <strong>${displayName}</strong>,</p>
    <p>Welcome to <strong>${branding.schoolName}</strong>! Your staff portal account
       has been created with the following details:</p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;">
      <tr><td style="font-size:14px;">
        <p style="margin:0 0 6px;"><strong>Role:</strong> ${role}</p>
        <p style="margin:0 0 6px;"><strong>Email:</strong> ${loginEmail}</p>
        <p style="margin:0;"><strong>Temporary password:</strong>
          <code style="background:#1e293b;color:#f8fafc;padding:2px 8px;border-radius:4px;font-size:14px;">${temporaryPassword}</code>
        </p>
      </td></tr>
    </table>
    <p style="color:#dc2626;font-weight:600;">You will be required to change your password on first login.</p>
    ${loginUrl ? button(loginUrl, 'Sign In to Your Portal', color) : ''}
    <p style="margin-top:24px;">If you have any questions, please contact your school administrator.</p>
    <p>Regards,<br/><strong>${branding.schoolName} Administration</strong></p>
  `);
  return { subject, html };
}

/** Parent notification — general purpose */
export function parentNotification(opts: {
  branding: SchoolBranding;
  guardianName: string;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): { subject: string; html: string } {
  const { branding, guardianName, title, message, ctaLabel, ctaUrl } = opts;
  const color = branding.primaryColor ?? DEFAULT_COLOR;
  const subject = `${title} | ${branding.schoolName}`;
  const html = layout(branding.schoolName, color, `
    <p>Dear <strong>${guardianName}</strong>,</p>
    <p>${message.replace(/\n/g, '<br/>')}</p>
    ${ctaUrl && ctaLabel ? button(ctaUrl, ctaLabel, color) : ''}
    <p style="margin-top:28px;">Regards,<br/><strong>${branding.schoolName}</strong></p>
  `);
  return { subject, html };
}

/** Attendance alert — low attendance warning to parent */
export function attendanceAlert(opts: {
  branding: SchoolBranding;
  guardianName: string;
  studentName: string;
  attendanceRate: number;
  totalAbsent: number;
  portalUrl?: string;
}): { subject: string; html: string } {
  const { branding, guardianName, studentName, attendanceRate, totalAbsent, portalUrl } = opts;
  const color = branding.primaryColor ?? DEFAULT_COLOR;
  const subject = `Attendance Alert: ${studentName} | ${branding.schoolName}`;
  const html = layout(branding.schoolName, color, `
    <p>Dear <strong>${guardianName}</strong>,</p>
    <p>We would like to draw your attention to the attendance record of your ward,
       <strong>${studentName}</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;">
      <tr><td style="font-size:14px;">
        <p style="margin:0 0 6px;"><strong>Current attendance rate:</strong>
           <span style="color:#dc2626;font-weight:700;">${attendanceRate}%</span></p>
        <p style="margin:0;"><strong>Total absences:</strong> ${totalAbsent} day(s)</p>
      </td></tr>
    </table>
    <p>Regular attendance is crucial for academic success. We kindly request that you ensure
       your ward attends school regularly. If there is an underlying reason for the absences,
       please contact the school office so we can provide appropriate support.</p>
    ${portalUrl ? button(portalUrl, 'View Attendance Details', color) : ''}
    <p style="margin-top:24px;">Regards,<br/><strong>${branding.schoolName}</strong></p>
  `);
  return { subject, html };
}

/** School suspended — sent to school admin when their school is suspended */
export function schoolSuspended(opts: {
  branding: SchoolBranding;
  adminName: string;
  reason?: string;
  contactEmail?: string;
}): { subject: string; html: string } {
  const { branding, adminName, reason, contactEmail } = opts;
  const color = '#dc2626';
  const subject = `Important: Your Avenir SIS Account Has Been Suspended`;
  const html = layout(branding.schoolName, color, `
    <p>Dear <strong>${adminName}</strong>,</p>
    <p>We are writing to inform you that the Avenir SIS account for
       <strong>${branding.schoolName}</strong> has been <strong style="color:#dc2626;">suspended</strong>.</p>
    ${reason ? `<table cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;"><tr><td style="font-size:14px;"><p style="margin:0;"><strong>Reason:</strong> ${reason}</p></td></tr></table>` : ''}
    <p>All users in your school will no longer be able to log in to the portal.
       Your data is securely retained and will remain available upon reactivation.</p>
    <p>To appeal this decision or request reactivation, please contact us at
       <a href="mailto:${contactEmail ?? 'support@avenirsms.com'}">${contactEmail ?? 'support@avenirsms.com'}</a>.</p>
    <p style="margin-top:28px;">Regards,<br/><strong>Avenir SIS Platform Team</strong></p>
  `);
  return { subject, html };
}

/** Demo provisioned — sent to demo school admin with login credentials */
export function demoProvisioned(opts: {
  branding: SchoolBranding;
  adminName: string;
  loginEmail: string;
  temporaryPassword: string;
  loginUrl?: string;
  expiresInDays?: number;
}): { subject: string; html: string } {
  const { branding, adminName, loginEmail, temporaryPassword, loginUrl, expiresInDays } = opts;
  const color = branding.primaryColor ?? DEFAULT_COLOR;
  const subject = `Your Avenir SIS Demo is Ready — ${branding.schoolName}`;
  const html = layout(branding.schoolName, color, `
    <p>Dear <strong>${adminName}</strong>,</p>
    <p>Great news! Your demo account for <strong>${branding.schoolName}</strong> on Avenir SIS
       has been set up and is ready to use.</p>
    <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;">
      <tr><td style="font-size:14px;">
        <p style="margin:0 0 8px;"><strong>Login Email:</strong> ${loginEmail}</p>
        <p style="margin:0;"><strong>Temporary Password:</strong>
          <code style="background:#1e293b;color:#f8fafc;padding:2px 8px;border-radius:4px;font-size:14px;">${temporaryPassword}</code>
        </p>
      </td></tr>
    </table>
    <p style="color:#dc2626;font-weight:600;">Please change your password after your first login.</p>
    ${expiresInDays ? `<p>Your demo access is valid for <strong>${expiresInDays} days</strong>. Contact us to upgrade to a full subscription before it expires.</p>` : ''}
    ${loginUrl ? button(loginUrl, 'Access Your Demo Portal', color) : ''}
    <p style="margin-top:24px;">We look forward to showing you what Avenir SIS can do for your school!</p>
    <p>Regards,<br/><strong>Avenir SIS Team</strong></p>
  `);
  return { subject, html };
}

/** Platform invoice — sent to school admin with invoice details */
export function platformInvoice(opts: {
  branding: SchoolBranding;
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
}): { subject: string; html: string } {
  const { branding, adminName, invoiceNumber, issueDate, dueDate, lineItems, subtotal, discount, tax, total, currency, currencySymbol, notes, payUrl } = opts;
  const color = branding.primaryColor ?? DEFAULT_COLOR;
  const fmt = (n: number) => `${currencySymbol}${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const subject = `Invoice ${invoiceNumber} — ${branding.schoolName} | Avenir SIS`;
  const lineRows = lineItems.map(li => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#334155;">${li.description}</td>
      <td style="padding:6px 0;font-size:13px;text-align:right;color:#334155;">${li.quantity > 1 ? li.quantity + ' ×' : ''} ${fmt(li.unitPrice)}</td>
    </tr>
  `).join('');
  const html = layout(branding.schoolName, color, `
    <p>Dear <strong>${adminName}</strong>,</p>
    <p>Please find below your invoice from Avenir SIS for <strong>${branding.schoolName}</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;">
      <tr><td style="font-size:13px;">
        <p style="margin:0 0 4px;"><strong>Invoice #:</strong> ${invoiceNumber}</p>
        <p style="margin:0 0 4px;"><strong>Issue date:</strong> ${issueDate}</p>
        <p style="margin:0;"><strong>Due date:</strong> <span style="color:#dc2626;font-weight:600;">${dueDate}</span></p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;margin:16px 0 8px;">
      ${lineRows}
      ${subtotal !== total ? `
      <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:8px;"></td></tr>
      <tr><td style="font-size:13px;color:#64748b;">Subtotal</td><td style="font-size:13px;text-align:right;color:#64748b;">${fmt(subtotal)}</td></tr>
      ${discount ? `<tr><td style="font-size:13px;color:#16a34a;">Discount</td><td style="font-size:13px;text-align:right;color:#16a34a;">−${fmt(discount)}</td></tr>` : ''}
      ${tax ? `<tr><td style="font-size:13px;color:#64748b;">Tax/VAT</td><td style="font-size:13px;text-align:right;color:#64748b;">+${fmt(tax)}</td></tr>` : ''}
      ` : ''}
      <tr>
        <td style="font-size:15px;font-weight:700;color:#1e293b;border-top:2px solid #e2e8f0;padding-top:8px;">Total Due (${currency})</td>
        <td style="font-size:15px;font-weight:700;color:#4f46e5;text-align:right;border-top:2px solid #e2e8f0;padding-top:8px;">${fmt(total)}</td>
      </tr>
    </table>
    ${notes ? `<p style="font-size:13px;color:#64748b;font-style:italic;">${notes}</p>` : ''}
    ${payUrl ? button(payUrl, 'Pay Now', color) : ''}
    <p style="margin-top:24px;">Thank you for choosing Avenir SIS. If you have any questions about this invoice, please contact us.</p>
    <p>Regards,<br/><strong>Avenir SIS Billing Team</strong></p>
  `);
  return { subject, html };
}

/** Result / report card notification */
export function reportCardReady(opts: {
  branding: SchoolBranding;
  guardianName: string;
  studentName: string;
  term: string;
  session: string;
  portalUrl?: string;
}): { subject: string; html: string } {
  const { branding, guardianName, studentName, term, session, portalUrl } = opts;
  const color = branding.primaryColor ?? DEFAULT_COLOR;
  const subject = `${term} Report Card Ready — ${studentName} | ${branding.schoolName}`;
  const html = layout(branding.schoolName, color, `
    <p>Dear <strong>${guardianName}</strong>,</p>
    <p>The <strong>${term}</strong> (${session}) report card for <strong>${studentName}</strong>
       is now available on the parent portal.</p>
    <p>Please log in to view your child's academic performance, attendance summary,
       and teacher remarks for the term.</p>
    ${portalUrl ? button(portalUrl, 'View Report Card', color) : ''}
    <p style="margin-top:24px;">Regards,<br/><strong>${branding.schoolName} Academic Office</strong></p>
  `);
  return { subject, html };
}
