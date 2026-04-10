# Avenir SIS — Product Guide

**Avenir SIS** (School Information System) is a web-based platform for running Nigerian primary and secondary schools day to day. It is built around the **6-3-3-4** structure, **NERDC**-aligned expectations, and **WAEC-style** grading (A1–F9), so heads of school, admins, teachers, parents, and applicants can work from one place.

The product is offered by **Jabpatech** under the **Avenir SIS** brand. A public marketing site explains plans and demos; the live app is where real school work happens after sign-in.

---

## Who the app is for

| Role | Typical users | What they do in the app |
|------|----------------|-------------------------|
| **School admin / owner** | Principals, registrars, bursars, IT staff | Full configuration, admissions, finance, staff, reports, and system settings |
| **Teacher** | Class teachers, subject teachers | Attendance, grades, assignments, skills, messages, and teaching helpers |
| **Parent / guardian** | Anyone linked to a student record | See progress, attendance, assignments, fees, pay online, messages, and report cards |
| **Applicant** | Prospective families | Submit and track an admission application |
| **Visitor** | Anyone not logged in | Read the promotional landing page, request a demo, or open **Login** to sign in |

---

## Getting started

1. **Open the school’s Avenir SIS web address** (your school or provider will share the link).
2. **Marketing home (`/`)** — Overview of features, modules, pricing, FAQs, and a **Request Demo** form. If you are already signed in, you are usually taken straight to the right dashboard.
3. **Login (`/login`)** — Sign in with **email and password**, or use **Google** if your school has turned it on. New users can **register** from the same screen when allowed.
4. After login, the app sends you to the right area:
   - **Administrators** → Admin dashboard and sidebar modules  
   - **Teachers** → Teacher portal  
   - **Parents** → Parent portal  
   - **Applicants** → Application flow  

**School calendar** (`/calendar`) is available to signed-in users so everyone sees the same term dates and events.

---

## Admin & school management (full system)

Admins use the **sidebar** to move between modules. Below is what each area is for and how to use it in practice.

### Dashboard
- First screen after login: summary of what matters today (counts, shortcuts, and entry points into other modules).

### Admissions
- **Pipeline** — See applications by status (pending, reviewing, approved, rejected), search and filter, export lists, and open any application for detail.
- **Direct admission** — Admit a student in steps: student details, guardians (including optional link to an existing parent account), class assignment and siblings, then review and confirm. The system can create the student record, guardian record, and audit trail in one go.
- **Application detail** — Review one applicant, add notes, verify details, assign class and guardians, link siblings, and **approve** or change status so a student record is created when appropriate.

### Students
- **Student list** — Browse all students, search, and filter by class. Open any student for their full profile.
- **Student profile** — View and edit biodata, class, guardians, medical notes, academics, fees context, ID card preview/print, and optional **AI-generated insights** to support conversations with parents (where enabled).
- **Bulk import** — Upload many students from a spreadsheet using the school’s template (useful at the start of term or after migration).

### Attendance
- Choose **class** and **date**, mark each learner **present**, **absent**, or **late**, and save. Supports daily operational reporting and parent visibility where the school links data to the portal.

### Classes
- Define **classes** (names, levels, sessions, form tutors) so timetables, gradebooks, and attendance stay aligned with how the school actually runs.

### Timetable
- Build **weekly schedules** per class and term, assign subjects and teachers, and use **conflict detection** so the same teacher is not double-booked.

### Gradebook (admin)
- Select **class**, **subject**, **term**, and **session**, enter **CA** and **exam** marks, see **totals** and **WAEC-style grades**, add teacher comments, optionally use **AI-suggested comments**, and **save all** for the class.

### Report cards
- Generate term report views per class, including rankings and skills where configured, and print or share with families.

### Exams
- Organise exam-related setup (e.g. seating or exam lists, depending on how the school uses the module) so admin and teachers stay coordinated.

### Curriculum mapping
- Map teaching to **curriculum / level** expectations (e.g. NERDC-style structure) so planning stays consistent across subjects and classes.

### Student promotion
- At year end, select a **source class**, review students, and mark decisions to **promote**, **repeat**, or **graduate** in bulk, with visibility of the **next class** or graduation path.

### Finance
- **Invoices** and **fee schedules**, record **payments** (cash, transfer, etc.), track **expenses**, see summaries and charts, print receipts, and optionally draft **fee reminder** wording with AI assistance where enabled.

### Payroll
- Maintain **staff salary** information, allowances, and bank details, and run payroll-style views suitable for the school’s pay cycle.

### Staff / HR
- Staff records, roles, and HR-related fields the school chooses to track (alongside teacher accounts used in the Teacher portal).

### Analytics
- Charts and summaries for **enrollment**, **grades**, **revenue vs expenses**, **attendance**, and similar KPIs so leadership can spot trends.

### User management
- Create or adjust **user accounts** and roles (admin, teacher, parent, applicant), and control who can sign in and what they can open.

### Notifications
- Compose and send **in-app notifications** to all parents, one class, or one student (e.g. general news, fee due, exam, attendance alerts).

### Result PINs
- Manage **PINs** used when parents or students access published results securely (e.g. per term or per child, depending on school policy).

### School settings
- School name, branding, session, term defaults, and other **organisation-wide** preferences.

### WhatsApp (where configured)
- Tools to help the school push **WhatsApp-friendly** messages or campaigns aligned with fees, exams, or announcements (depends on school setup).

### Seed demo data (optional)
- Fills sample data for **training or demos** — intended for test environments, not production.

---

## Teacher portal

Teachers work from a **single portal** with tabs (and quick cards) for:

- **My students** — Pick your **class**; see learners assigned to that class for attendance and grading workflows.
- **Attendance** — Mark the roll for the selected class and date; save when done.
- **Gradebook** — Enter CA/exam scores, see grades, add notes, optional AI comment suggestions, save.
- **Skills** — Record **affective / psychomotor** style ratings per learner and term (aligned with report card expectations).
- **Assignments** — Create, edit, or remove **assignments** (title, description, subject, class, due date); students and parents see them by class.
- **Messages** — Exchange **messages** with parents or admin (inbox-style).
- **AI teaching tools** — Where enabled, generate **lesson note** ideas or **exam-style questions** from topic and level to speed up preparation (always review before use in class).

**Calendar** is one click away from the portal header for school-wide events.

---

## Parent portal

Parents see children linked to their account (typically by **guardian email** on the student record). For each child they can switch tabs:

- **Progress** — Grades and performance overview by term.
- **Attendance** — History of present/absent/late.
- **Assignments** — What the class has been given and due dates.
- **Finance** — **Invoices** and payment status; **pay online** where the school has enabled it.
- **Messages** — Chat-style thread with teachers or school.
- **Notifications** — School broadcasts targeted to them or “all parents.”
- **Report card** — View a formatted **report card** for a chosen term and **print** a clean copy.

If no child appears, the school must link the parent’s email (or account) on the student’s guardian fields or through user linking after direct admission.

---

## Applicants (online admission)

Applicants sign in (or register), then complete a **step-by-step application**:

1. **Personal** — Name, date of birth, gender, NIN, with validation suited to Nigerian IDs and age rules.  
2. **Academic** — Class applying for, previous school, and extra requirements for senior secondary where applicable.  
3. **Contact** — Phone and related details.  
4. **Documents** — Placeholder step for birth certificate / transcripts (as implemented for your deployment).  
5. **Review** — Confirm and submit.

After submit, they see **status** (pending, reviewing, approved, rejected) and cannot submit twice from the same account. Admins process applications under **Admissions**.

---

## Public landing page (not logged in)

- Explains **features** and **modules** in plain language.  
- **Pricing** (Basic, Professional, College) with what each tier typically includes (student caps, AI features, enterprise options, and **Avenir Career Discovery** bundled on the highest tier — see below).  
- **Career Discovery** section — Describes the separate **Avenir Career Discovery** experience for JSS/SSS (assessments, traits, career clusters, student/parent/teacher/counselor access). Schools on the **College** plan get complimentary access for their community; the live product is linked from the page.  
- **FAQ**, **about Jabpatech**, **contact**, and **Request Demo** form.  
- **Login** to enter the app.

---

## Avenir Career Discovery (related product)

This is a **sister product** focused on **career exploration** for **JSS and SSS** students (adaptive questions, results framed as traits and career clusters). It has its own web app URL. On the **College** subscription tier, Avenir SIS positions this as **included for the school community** (students, parents, and guidance staff). It does not replace SIS; it complements it for guidance and counselling.

---

## Plans at a glance (from the public site)

- **Basic** — Smaller schools: core students, attendance, fees, report cards, timetable, classes, parent portal, messaging channels as listed.  
- **Professional** — Adds exams, curriculum mapping, promotion, result PINs, payroll, analytics, bulk import, and **AI-assisted** teaching and admin features.  
- **College** — Unlimited scale options, multi-campus, branding, advanced analytics, migration support, SLA-oriented support, extended AI features, and **Avenir Career Discovery** as described on the landing page.

Exact limits and prices are shown on the live **Pricing** section; schools **request a demo** to get onboarded.

---

## Tips for a smooth rollout

1. **Configure classes and sessions first** — Everything else (attendance, gradebook, assignments) keys off class names and terms.  
2. **Set guardian emails accurately** — Parents only see children that match their email (or linked accounts).  
3. **Train one admin and one teacher** — They can validate attendance → grades → report card → parent view.  
4. **Use direct admission or bulk import** for existing students** — Faster than only waiting for online applications.  
5. **Use the calendar** for parents’ evenings, exams, and holidays so all roles see the same dates.

---

## Support

- **Demo requests** and commercial questions: use the form on the marketing page or the contact details shown there (e.g. email and phone for Jabpatech).  
- **Day-to-day app issues**: your school’s admin or the organisation that manages your Avenir SIS deployment.

---

*This guide describes product behaviour and intent as reflected in the Avenir SIS application. Specific fields, toggles, or integrations may vary by school configuration and subscription.*
