# Custom Domain Support — Implementation Plan

## Overview

This document outlines how Avenir SIS will support custom domains and subdomains for schools in a future release. The goal is to allow each school to access the platform via their own branded URL instead of the default `/s/{slug}` path.

---

## Two Tiers of Domain Support

### Tier 1 — Avenir Subdomains (Easier, Phase 1)
Schools get a subdomain on the Avenir platform domain:
```
hlia.avenirsms.com         → HappyLand International Academy
koper.avenirsms.com        → Koper International School
```

### Tier 2 — Fully Custom Domains (Advanced, Phase 2)
Schools bring their own domain:
```
app.happylandacademy.com   → HappyLand International Academy
portal.koperschool.com     → Koper International School
```

---

## Phase 1 — Avenir Subdomains

### DNS Setup (One-time, platform level)
Add a wildcard DNS record on the Avenir domain:
```
*.avenirsms.com  →  CNAME  →  avenirsms.web.app
```

### Firebase Hosting
Add a single wildcard custom domain in Firebase Hosting console:
```
*.avenirsms.com
```
Firebase will auto-provision SSL for all subdomains.

### Firestore Changes
No extra field needed — the subdomain maps directly to the school's `urlSlug`.

Example: `hlia.avenirsms.com` → slug = `hlia` → query `school_slugs/hlia` to get `schoolId`.

### App Code Changes
In the app boot sequence, detect if the hostname is a subdomain of `avenirsms.com`:

```ts
const hostname = window.location.hostname;
// e.g. "hlia.avenirsms.com"

const platformDomain = 'avenirsms.com';
if (hostname.endsWith(`.${platformDomain}`)) {
  const slug = hostname.replace(`.${platformDomain}`, '');
  // query school_slugs/{slug} → get schoolId → set school context
}
```

---

## Phase 2 — Fully Custom Domains

### Firestore Changes
Add `customDomain` field to the `schools` collection:
```
schools/{schoolId} {
  ...
  customDomain: "app.happylandacademy.com"   // optional
}
```

Also store it in `school_settings/{schoolId}` for the settings UI.

Add a lookup collection for fast reverse resolution:
```
school_domains/{domain} {
  schoolId: "abc123"
  schoolName: "HappyLand International Academy"
  verified: true
}
```

### Firebase Hosting
Each custom domain must be manually added in Firebase Hosting console.
Firebase will verify ownership via DNS TXT record and provision SSL automatically.

> **Limitation**: This step cannot be fully automated via Firebase SDK — it requires Firebase Console or Firebase Management REST API.

### SchoolSettings UI Changes (Super Admin only)
- Add a "Custom Domain" input field in the School Settings page (super admin section)
- Show DNS instructions after the domain is saved:
  - CNAME record to add
  - TXT verification record
  - SSL status indicator

### App Code Changes
On app boot, check `window.location.hostname` against the `school_domains` collection:

```ts
const hostname = window.location.hostname;

// Check custom domain lookup
const snap = await getDoc(doc(db, 'school_domains', hostname));
if (snap.exists()) {
  const { schoolId } = snap.data();
  // set school context to schoolId
}
```

---

## School's Responsibility (Both Phases)

| Phase | DNS Record Type | Value |
|---|---|---|
| Subdomain (Phase 1) | Automatic — no action needed | — |
| Custom Domain (Phase 2) | CNAME | `avenirsms.web.app` |
| Custom Domain (Phase 2) | TXT (verification) | Provided by Firebase |

---

## Routing Logic (Priority Order)

When the app loads, resolve the school context in this order:

1. **Custom domain** — check `school_domains/{hostname}`
2. **Avenir subdomain** — check if hostname ends with `.avenirsms.com`, extract slug
3. **URL path slug** — check if URL starts with `/s/{slug}`
4. **No school context** — show platform landing page

---

## SSL / Security
- Firebase Hosting handles SSL automatically for all domains (free via Let's Encrypt)
- Custom domains must be verified via DNS TXT record before going live
- All traffic is HTTPS-only

---

## Future Considerations
- **Automated domain provisioning** via Firebase Management REST API (removes need for manual Console steps)
- **Domain verification status** displayed in super admin dashboard
- **Email notifications** to school admin when domain is verified and live
- **Wildcard subdomains per school** (e.g. `*.hlia.avenirsms.com`) for multi-campus setups

---

*Last updated: April 2026*
