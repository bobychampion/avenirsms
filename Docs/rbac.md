# Role-Based Access Control (RBAC)

This is the single source of truth for who can do what in AvenirSMS.
Firestore rules and `ProtectedRoute` configuration both derive from this matrix.

## Roles

| Role | Scope | Sidebar / Layout | Created By |
|------|-------|------------------|------------|
| `super_admin` | Platform | `Layout` (super-admin nav) | Bootstrap (manual Firestore) |
| `admin` / `School_admin` | School | `Layout` (admin nav) | Super admin during school onboarding |
| `teacher` | School | `Layout` (teacher nav) | Self-register (admin-approved) |
| `parent` | School | `Layout` (parent nav) | Auto-created on first child enrollment |
| `student` | School | `StudentLayout` (no sidebar, bottom tabs, kid-friendly) | Auto-promoted from `applicant` on admission approval |
| `applicant` | School | `Layout` (apply form) | Self-register via `/login/student` before admission |
| `accountant` | School | `StaffLayout` (finance nav) | Admin promotes from `staff` |
| `hr` | School | `StaffLayout` (HR nav) | Admin promotes from `staff` |
| `librarian` | School | `StaffLayout` (library nav) | Admin promotes from `staff` |
| `staff` | School | `Layout` (generic) | Self-register via `/login/staff` (admin-approved) |

## Login URLs

Generic and per-role login URLs are mounted in [src/App.tsx](../src/App.tsx):

```
/login                       → generic, role selector visible
/login/:role                 → locked-role login (e.g. /login/student)
/s/:slug/login               → school-branded generic login
/s/:slug/login/:role         → school-branded per-role login
```

The `:role` segment accepts: `student`, `applicant`, `parent`, `teacher`, `staff`, `admin`.

## Post-Login Redirect

Defined in [src/utils/postAuthRedirect.ts](../src/utils/postAuthRedirect.ts):

| Role | Redirects to |
|------|--------------|
| `super_admin` | `/super-admin` |
| `admin`, `School_admin` | `/admin` |
| `teacher` | `/teacher` |
| `parent` | `/parent` |
| `student` | `/student` |
| `accountant` | `/accountant` |
| `hr` | `/hr` |
| `librarian` | `/library` |
| `staff` | `/home` |
| `applicant` (default) | `/apply` |

## Resource × Role × Action Matrix

Read = `r`, Write = `w`, Conditional = `c` (e.g. own records only), Blank = no access.

| Resource | super_admin | admin | teacher | parent | student | applicant | accountant | hr | librarian |
|----------|-------------|-------|---------|--------|---------|-----------|------------|----|-----------|
| `schools/*` | rw | r (own) | | | | | | | |
| `school_settings/*` | rw | rw (own) | r | r | r | r | r | r | r |
| `users/*` | rw | rw (own school) | r (own school) | r (self) | r (self) | r (self) | r (self) | rw (staff in school) | r (self) |
| `applications/*` | rw | rw | r | | | rw (own) | | | |
| `students/*` | rw | rw | r | r (linked kids) | r (self) | | r | r | r |
| `guardians/*` | rw | rw | r | r (self) | | | | r | |
| `classes`, `subjects`, `class_subjects` | rw | rw | r | r | r | r | r | r | r |
| `grades/*` | rw | rw | rw (own classes) | r (linked kids) | r (self) | | | | |
| `attendance/*` | rw | rw | rw (own classes) | r (linked kids) | r (self) | | | | |
| `timetables/*` | rw | rw | r | r | r | | | | |
| `assignments/*` | rw | rw | rw (own classes) | r (kid's class) | r (own class) | | | | |
| `messages/*` | rw | r (sent/recv) | rw (sent/recv) | rw (sent/recv) | rw (sent/recv) | | rw | rw | rw |
| `events/*` | rw | rw | r | r | r | r | r | r | r |
| `invoices`, `fee_payments`, `payments` | rw | rw | | r (kid's) | r (self) | | rw | | |
| `expenses` | rw | rw | | | | | rw | | |
| `staff/*` | rw | rw | | | | | r | rw | |
| `leave_requests/*` | rw | rw | rw (own) | | | | | rw | |
| `payroll/*` | rw | rw | | | | | rw | rw | |
| `notifications/*` | rw | rw | r (own recv) | r (own recv) | r (own recv) | r (own recv) | r (own recv) | r (own recv) | r (own recv) |
| `exams/*`, `cbt_exams/*` | rw | rw | r | r | r | | | | |
| `cbt_sessions/*` | rw | rw | rw | | rw (own) | | | | |
| `library_books/*` | rw | rw | r | r | r | | | | rw |
| `library_circulation/*` | rw | rw | r | r (kid's) | r (self) | | | | rw |
| `audit_log/*` | rw | r (own school) | | | | | | | |
| `school_slugs/*` | rw | r | r | r | r | r | r | r | r |

## Permission Flag Conventions (Phase 4)

When per-user `permissions: string[]` overrides ship in Phase 4, use the format
`<resource>.<action>`. Examples:

- `finance.write` — record payments, issue invoices
- `admissions.review` — approve/reject applications
- `payroll.process` — run monthly payroll
- `staff.manage` — create/edit/disable staff records
- `library.circulate` — issue/return books
- `exams.create` — create CBT exams

A user inherits the default permission set from their `role`; admins can grant
extras via `users/{uid}.permissions` without changing the underlying role.

## Adding a New Role

1. Add to the union in [src/types.ts](../src/types.ts) `UserProfile.role`.
2. Add an `is<Role>()` helper in [firestore.rules](../firestore.rules).
3. Add the role to the user-create allow-list in [firestore.rules](../firestore.rules) `match /users/{userId}`.
4. Add the role's redirect to [src/utils/postAuthRedirect.ts](../src/utils/postAuthRedirect.ts).
5. Update this matrix.
6. Add per-resource permissions in [firestore.rules](../firestore.rules).
7. Build the role's portal page and wire a route in [src/App.tsx](../src/App.tsx).
8. (Optional) Register the role in `URL_ROLE_ALIASES` in [src/pages/Login.tsx](../src/pages/Login.tsx) so a per-role login URL works.
