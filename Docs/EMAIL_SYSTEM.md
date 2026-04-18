# Email System — Current State & Implementation Plan

## Current State

The app **does not have a real email system**. The existing `NotificationComposer` page:
- Writes notification documents to Firestore (`notifications` and `notification_broadcasts` collections)
- Notifications are only visible **inside the app** (in-app notifications)
- **No actual emails are sent** — there is no email delivery mechanism in place

---

## Does Firebase Offer Email?

**Not natively.** Firebase does not have a built-in email sending service.

What Firebase *does* provide:
- **Firebase Auth emails** — password reset, email verification, sign-in links (automatic, limited templates)
- **Firebase Extensions** — a "Trigger Email" extension that sends emails via a third-party SMTP provider

For a full transactional email system, you need a **third-party email provider** combined with **Firebase Cloud Functions**.

---

## Recommended Email Architecture

```
App / Firestore trigger
        ↓
Firebase Cloud Function
        ↓
Email Provider API (Resend / SendGrid / Mailgun)
        ↓
Parent / Teacher / Student inbox
```

---

## Recommended Email Provider: Resend

[Resend](https://resend.com) is the recommended provider because:
- Modern REST API, very easy to integrate
- Generous free tier (3,000 emails/month, 100/day)
- Supports custom sender domains (e.g. `no-reply@avenirsms.com`)
- Works perfectly with Firebase Cloud Functions
- React Email support for beautiful HTML templates

Alternatives:
| Provider | Free Tier | Notes |
|---|---|---|
| **Resend** | 3,000/month | Recommended — simplest setup |
| **SendGrid** | 100/day | Popular, more complex |
| **Mailgun** | 1,000/month (trial) | Good for scale |
| **Brevo (Sendinblue)** | 300/day | Good EU option |

---

## What Emails the App Should Send

### Transactional (Triggered by events)
| Trigger | Recipient | Email |
|---|---|---|
| New user invited | Staff / Teacher | "You've been invited to join {School Name}" |
| Application received | Parent / Applicant | "Your application has been received" |
| Application approved/rejected | Parent / Applicant | "Your application status has been updated" |
| Fee payment reminder | Parent | "Fee payment due for {Student Name}" |
| Fee payment confirmed | Parent | "Payment received — receipt attached" |
| Exam results published | Parent | "Exam results are now available" |
| Attendance alert | Parent | "{Student Name} was marked absent today" |
| Password reset | Any user | Firebase Auth (already handled) |

### Broadcast (Sent manually via NotificationComposer)
| Trigger | Recipient | Email |
|---|---|---|
| Admin sends notification | All parents / class / student | Notification content as email |

---

## Implementation Plan

### Step 1 — Set Up Firebase Cloud Functions
```
npm install -g firebase-tools
firebase init functions
```
Choose TypeScript. This creates a `functions/` directory.

### Step 2 — Install Resend SDK in Functions
```
cd functions
npm install resend
```

### Step 3 — Create Email Sending Function
In `functions/src/index.ts`:

```ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Trigger when a notification doc is created
export const sendEmailNotification = onDocumentCreated(
  'notifications/{notifId}',
  async (event) => {
    const data = event.data?.data();
    if (!data || !data.recipientEmail) return;

    await resend.emails.send({
      from: 'Avenir SIS <no-reply@avenirsms.com>',
      to: data.recipientEmail,
      subject: data.title,
      html: `<p>${data.body}</p>`,
    });
  }
);
```

### Step 4 — Store Environment Variable
```
firebase functions:secrets:set RESEND_API_KEY
```

### Step 5 — Add `recipientEmail` to Notification Docs
Update `NotificationComposer.tsx` to include the recipient's email when writing notification docs to Firestore — the Cloud Function will pick it up and send the email.

### Step 6 — Custom Sender Domain (Optional but recommended)
In Resend dashboard, verify `avenirsms.com` as a sending domain.
Add the required DNS records (SPF, DKIM) — Resend provides these.
This allows sending from `no-reply@avenirsms.com` instead of a shared domain.

---

## Firebase Extension Alternative (Simpler but Less Flexible)

Firebase offers a **"Trigger Email from Firestore"** extension that:
- Watches a `mail` collection in Firestore
- Sends emails via any SMTP provider (Gmail, SendGrid, etc.)
- No Cloud Functions code needed

**How it works:**
```ts
// Just write a doc to the `mail` collection
await addDoc(collection(db, 'mail'), {
  to: 'parent@example.com',
  message: {
    subject: 'Fee reminder',
    html: '<p>Your fee is due.</p>',
  },
});
```

**Limitation**: Less control over templates, harder to scale, requires SMTP credentials.

---

## Per-School Email Branding (Future)

Each school should eventually be able to send from their own domain:
```
no-reply@happylandacademy.com
```

This requires:
- School to verify their domain in Resend (or platform does it on their behalf)
- `fromEmail` field stored in `school_settings`
- Cloud Function reads `fromEmail` per school before sending

---

## Priority Order

1. **Phase 1** — Set up Firebase Cloud Functions + Resend
2. **Phase 2** — Trigger emails on key events (invites, applications, attendance alerts)
3. **Phase 3** — Connect `NotificationComposer` to also send real emails
4. **Phase 4** — Per-school sender domain branding

---

*Last updated: April 2026*
