# Quick Start: Test Login

> **⚠️ NOTICE: Student login functionality has been removed from this system.**
> 
> Students no longer have direct login access to the portal. Parents can access their children's academic information through the parent portal.
> 
> This document is retained for reference purposes only and describes functionality that is no longer available.

---

## Historical Information (No Longer Available)

The following information describes the student login functionality that was previously available but has been removed:

### Previous Student Login Process (REMOVED)

~~**Step 1: Open Student Directory (5 seconds)**~~
```
Go to: http://localhost:3000/admin/students
```

~~**Step 2: Check Dashboard (5 seconds)**~~
Look at the top cards:
- **Green card** shows "Can Login: X"
- If X > 0, you have students ready to test!

~~**Step 3: Filter Students (5 seconds)**~~
- Click **"Login Status"** dropdown (third dropdown)
- Select **"✓ Can Login"**
- See only students with portal access

~~**Step 4: Reset Password (10 seconds)**~~
- Pick any student with green **"Can Login"** badge
- Click **"Reset Password"** button
- Enter: `TestPass2026`
- Click **"Set Password"**
- **Copy the Student ID** from the modal

~~**Step 5: Test Login (5 seconds)**~~
- Open **incognito window** (Ctrl+Shift+N)
- Go to: `http://localhost:3000/s/main/login/student`
- Enter Student ID and password
- Click **"🎒 Sign In"**

~~**Done! You should be in the Student Portal.**~~

---

## Current System Behavior

### Parent Portal Access

Parents can access their children's academic information through the parent portal:

1. **Go to Parent Login**: `http://localhost:3000/s/{school-id}/login/parent`
2. **Enter parent credentials**:
   - Email: Parent's email address
   - Password: Parent's password
3. **View student information**: Access grades, attendance, invoices, and other academic data for linked children

### Testing Parent Access

To test parent portal functionality:

1. Go to: `/admin/admissions`
2. Create a student via **"Direct Admission"**
3. Fill in guardian information including email
4. The parent can then log in using their email and password
5. They will see their linked children's academic information

---

## Alternative: Test Other User Roles

You can test login functionality for other available roles:

### Parent Login
- URL: `http://localhost:3000/s/{school-id}/login/parent`
- Credentials: Parent email and password

### Teacher Login
- URL: `http://localhost:3000/s/{school-id}/login/teacher`
- Credentials: Teacher email and password

### Admin Login
- URL: `http://localhost:3000/s/{school-id}/login/admin`
- Credentials: Admin email and password

---

**Last Updated**: 2026-05-20 (Updated to reflect student login removal)
