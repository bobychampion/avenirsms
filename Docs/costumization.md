Let me first understand the current school settings structure before designing the customization system.
Now I have a complete picture of what exists. Let me give you a thorough design discussion.

---

## School Customization — Full Design Exploration

### What Already Exists (Foundation to Build On)

The system already has:
- `primaryColor` (hex) stored in `school_settings` — used by `SchoolLandingPage` hero gradient
- `logoUrl` + `faviconUrl` fields on `SchoolSettings`
- `SchoolContext` already exposes `primaryColor`, `logoUrl`, `faviconUrl`, `schoolName` to the whole app
- Public URL pattern already works: `/s/:schoolId` → landing page, `/s/:schoolId/apply` → application form
- `SchoolLandingPage.tsx` already renders a branded hero using `primaryColor`

---

### All Possible Customization Options — By Category

#### 🎨 Category 1: Branding & Identity
| Option | How It Works | Storage |
|---|---|---|
| School logo | Already exists — upload via Cloudinary | `school_settings.logoUrl` |
| Favicon | Already exists — tab icon | `school_settings.faviconUrl` |
| **Primary color** | Already exists — one accent color | `school_settings.primaryColor` |
| **Secondary / accent color** | Pairs with primary for buttons, highlights | `school_settings.secondaryColor` |
| **Sidebar style** | `default` (dark) / `light` / `brand` (uses primaryColor) / `minimal` | `school_settings.sidebarStyle` |
| **Sidebar background image** | School building, pattern, or custom image behind nav | `school_settings.sidebarBgImageUrl` |
| **School watermark / stamp image** | Used on report cards and printed documents | `school_settings.stampImageUrl` |
| **Color theme preset** | Pick from 8 preset palettes (e.g. "Royal Blue", "Forest Green", "Crimson & Gold") | `school_settings.colorPreset` |

#### 🖥️ Category 2: Login Page Personalization
| Option | How It Works |
|---|---|
| **School-branded login URL** | `/s/:schoolId/login` — already enabled by routing pattern |
| **Login page hero image** | Full background image or split-panel with school photo | `school_settings.loginBgImageUrl` |
| **Login welcome message** | Custom headline text (e.g. "Welcome to Excel Academy Portal") | `school_settings.loginWelcomeText` |
| **Login tagline** | Sub-text under headline | `school_settings.loginTagline` |
| **Show logo on login** | Toggle — show school logo prominently on login page | already `logoUrl` |
| **Login page color scheme** | Inherits `primaryColor` or custom override | |

#### 📄 Category 3: Application / Public Pages
| Option | How It Works |
|---|---|
| **Landing page hero image** | Banner photo (school building, campus, students) | `school_settings.heroBannerImageUrl` |
| **About/description text** | School description paragraph shown on landing page | `school_settings.schoolDescription` |
| **Social media links** | Facebook, Twitter/X, Instagram, website URL | `school_settings.socialLinks: { facebook, twitter, instagram, website }` |
| **Application form intro text** | Custom message at the top of the apply form | `school_settings.applicationIntroText` |
| **Application form fields** | Toggle which optional fields to show (NIN, WAEC number, etc.) | `school_settings.applicationFields: { showNin, showWaec, showPreviousSchool }` |
| **Application deadline banner** | Show a countdown or deadline message | `school_settings.applicationDeadline` |

#### 🏫 Category 4: Portal UI Personalization (Inside the App)
| Option | How It Works |
|---|---|
| **Dashboard welcome banner** | Custom message/image shown on admin dashboard | `school_settings.dashboardBannerText` / `school_settings.dashboardBannerImageUrl` |
| **App display name** | "Excellence Academy Portal" instead of "AvenirSMS" in nav header | `school_settings.appDisplayName` |
| **Sidebar nav accent color** | Active nav item highlight uses `primaryColor` | already wired via `SchoolContext.primaryColor` |
| **Custom CSS variables** | Inject `--color-primary`, `--color-secondary` into `:root` via `useEffect` on settings load | computed from stored colors |
| **Font preference** | Serif / Sans-serif / Custom Google Font (Inter, Poppins, Lato, etc.) | `school_settings.fontFamily` |
| **Report card header layout** | Logo left / Logo centered / Full header with crest | `school_settings.reportHeaderLayout` |

#### 🌐 Category 5: School Website Module (Optional Add-on)
| Option | How It Works |
|---|---|
| **Enable school website** | Toggle that activates `/s/:schoolId` as a mini public website | `school_settings.websiteEnabled` |
| **Home page sections** | Choose which sections to show: About, Gallery, Admissions, Contact | `school_settings.websiteSections: string[]` |
| **Photo gallery** | Upload up to 12 images for public gallery | `school_settings.galleryImages: string[]` |
| **Testimonials** | Add 2–4 parent/student quote cards | `school_settings.testimonials: { name, quote, role }[]` |
| **Announcement banner** | Rolling banner at top of landing page | `school_settings.announcementBanner` |

---

### How the Sidebar Theming Would Work (Technical)

The cleanest approach is **CSS custom properties injected at runtime**:

```typescript
// In SchoolContext or Layout — runs when settings load
useEffect(() => {
  if (!primaryColor) return;
  document.documentElement.style.setProperty('--color-brand', primaryColor);
  document.documentElement.style.setProperty('--color-brand-dark', darken(primaryColor, 15));
  document.documentElement.style.setProperty('--color-brand-light', lighten(primaryColor, 40));
}, [primaryColor]);
```

Then `Layout.tsx` sidebar uses `bg-[var(--color-brand)]` for the "brand" style, or remains `bg-slate-900` for "dark" default.

---

### The "Customization" Tab — Where It Lives

Add it as a new tab inside `SchoolSettings.tsx`. The existing tabs are already organized (General, Academic, Finance, etc.). A new **"Customization"** tab would contain:

```
Customization Tab
├── 🎨 Branding
│     Logo, Favicon, School Stamp/Seal image
├── 🖌️ Colors & Theme
│     Color preset picker (8 swatches)
│     Primary color (hex input + color picker)
│     Secondary color
│     Sidebar style: Dark | Light | Brand | Minimal
├── 🖥️ Login Page
│     Welcome heading text
│     Tagline text
│     Login background image upload
├── 🌐 Public Landing Page
│     Hero banner image
│     School description
│     Social links (Facebook, Instagram, Website)
│     Enable/disable public website
├── 📄 Application Form
│     Intro text
│     Toggle optional fields (NIN, WAEC, etc.)
│     Application deadline date
└── 🏠 Portal Dashboard
      App display name
      Dashboard welcome banner
      Font family selector
```

---

### URL Scheme per School

| URL | What It Shows |
|---|---|
| `/s/greenfield-academy` | Public landing page (branded) |
| `/s/greenfield-academy/apply` | Online application form |
| `/s/greenfield-academy/login` | **New** — school-branded login page |
| `app.avenirsms.com/admin` | Standard internal portal (branded to logged-in user's school) |

The `schoolId` in the URL slug could be the document ID (e.g. `abc123`) or a **custom slug** (e.g. `greenfield-academy`) stored as `school_settings.urlSlug` — with a lookup table mapping slug → schoolId.

---

### Recommended Build Order

1. **Customization tab + data fields** — extend `SchoolSettings` interface, add the tab UI (no visual impact yet)
2. **CSS variable injection** — wire `primaryColor` + `secondaryColor` into `:root` via `SchoolContext` (immediate visible impact on sidebar, buttons)
3. **Sidebar style selector** — `dark` / `light` / `brand` modes in `Layout.tsx`
4. **Login page branding** — new route `/s/:schoolId/login` with hero image + welcome text
5. **Landing page enhancements** — hero banner, description, gallery, social links
6. **Font selector** — load Google Font dynamically based on `fontFamily` setting

---

**Would you like me to start building this?** If so, which phase first — the Customization tab UI + data model, or the sidebar theming / CSS variable injection?