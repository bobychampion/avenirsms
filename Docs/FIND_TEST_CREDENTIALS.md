# Find Test Credentials - Quick Commands

> **⚠️ NOTICE: Student login functionality has been removed from this system.**
> 
> Students no longer have direct login access to the portal. Parents can access their children's academic information through the parent portal.
> 
> This document is retained for reference purposes only and describes functionality that is no longer available.

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

## Historical Information (No Longer Available)

The following sections describe the student login functionality that was previously available but has been removed:

### Step 1: Go to Student Directory

1. **Navigate to**: `http://localhost:3000/admin/students`
2. **Look at the top dashboard cards**

You'll see something like:
```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ Total Students: 10  │  │ Can Login: 5        │  │ Cannot Login: 5     │
│                     │  │ 50% of students     │  │ Need password setup │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

### Step 2: Filter by "Can Login"

1. **Click the "Login Status" dropdown** (third dropdown)
2. **Select "✓ Can Login"**
3. **See only students with portal access**

### Step 3: Pick Any Student

Look at the student cards. Students with green "Can Login" badge are ready to test.

**Example card**:
```
┌─────────────────────────────────────────┐
│  👤 Alice Johnson                       │
│     STU-2026-001                        │
│                                         │
│  📧 alice@example.com                   │
│  📱 +2348012345678                      │
│  📅 Born: 2010-01-01                    │
│                                         │
│  ✅ Can Login          Primary 1        │
│                                         │
│  [Reset Password]  [View Profile →]    │
└─────────────────────────────────────────┘
```

### Step 4: Reset Password

1. **Click "Reset Password"** button
2. **Enter**: `TestPass2026`
3. **Click "Set Password"**
4. **Copy credentials** from the success modal:
   ```
   Student ID: STU-2026-001
   Password: TestPass2026
   ```

### Step 5: Test Login

1. **Open incognito window** (Ctrl+Shift+N / Cmd+Shift+N)
2. **Go to**: `http://localhost:3000/s/main/login/student`
   - Replace `main` with your actual school ID if different
3. **Enter**:
   - Student ID: `STU-2026-001`
   - Password: `TestPass2026`
4. **Click "🎒 Sign In"**
5. **Should redirect to Student Portal**

---

## Method 2: Browser Console (If You Want to See All Students)

### Step 1: Open Browser Console

1. **Go to your app** (logged in as admin)
2. **Press F12** or **Right-click → Inspect**
3. **Click "Console" tab**

### Step 2: Run This Command

Copy and paste this into the console:

```javascript
// Quick check for students (works with Firebase v9+ modular SDK)
(async () => {
  try {
    // Import from your app's firebase module
    const { db } = await import('/src/firebase.ts');
    const { collection, getDocs, query, limit } = await import('firebase/firestore');
    
    const studentsSnap = await getDocs(query(collection(db, 'students'), limit(5)));
    
    if (studentsSnap.empty) {
      console.log('❌ No students found in database');
      console.log('💡 Create a test student via Admin Dashboard → Admissions → Direct Admission');
      return;
    }
    
    console.log('\n🎓 YOUR STUDENTS:\n');
    console.log('═══════════════════════════════════════════════════════\n');
    
    studentsSnap.forEach((doc, i) => {
      const s = doc.data();
      const canLogin = s.loginEmail ? '✅ YES' : '❌ NO';
      console.log(`${i+1}. ${s.studentName}`);
      console.log(`   Student ID: ${s.studentId}`);
      console.log(`   Can Login: ${canLogin}`);
      console.log(`   School ID: ${s.schoolId || 'main'}`);
      console.log(`   Class: ${s.currentClass || 'N/A'}`);
      
      if (s.loginEmail) {
        console.log(`\n   🎯 TEST THIS STUDENT:`);
        console.log(`      Login URL: http://localhost:3000/s/${s.schoolId || 'main'}/login/student`);
        console.log(`      Student ID: ${s.studentId}`);
        console.log(`      Password: Reset via Student Directory or calculate using formula`);
      } else {
        console.log(`   ⚠️  Action: Set password via Student Directory`);
      }
      console.log('\n───────────────────────────────────────────────────────\n');
    });
    
    const canLoginCount = studentsSnap.docs.filter(d => d.data().loginEmail).length;
    console.log(`\n📊 SUMMARY: ${canLoginCount}/${studentsSnap.size} students can login\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Alternative: Just go to /admin/students page');
    console.log('   The dashboard there shows all students and their login status');
  }
})();
```

### Step 3: Read the Output

The console will show:
- Student names
- Student IDs (use this to log in)
- Whether they can log in (✅ or ❌)
- Login URL for each student

---

## Method 2: Check Firebase Console

### Step 1: Open Firebase Console

1. Go to https://console.firebase.google.com/
2. Select your project
3. Click **Firestore Database**

### Step 2: Check Students Collection

1. Click on **`students`** collection
2. Click on any student document
3. Look for these fields:

```
studentId: "STU-2026-001"  ← Use this to log in
studentName: "Test Student"
loginEmail: "stu-2026-001@students.main.local"  ← If exists, can log in
schoolId: "main"  ← Use in login URL
```

### Step 3: Build Login Credentials

**If `loginEmail` exists**:
```
Student ID: STU-2026-001
Password: Calculate or reset
Login URL: http://localhost:3000/s/main/login/student
```

**If `loginEmail` is missing**:
- Go to Student Directory
- Find this student
- Click "Set Password"
- Set password: `TestPass2026`

---

## Method 3: Use Student Directory UI

### Step 1: Go to Student Directory

1. **Navigate to**: `/admin/students`
2. **Look at dashboard cards** at the top

### Step 2: Check Statistics

```
┌─────────────────────┐
│ Total Students: 10  │
└─────────────────────┘

┌─────────────────────┐
│ Can Login: 5        │  ← These students can log in
│ 50% of students     │
└─────────────────────┘

┌─────────────────────┐
│ Cannot Login: 5     │  ← These need password setup
│ Need password setup │
└─────────────────────┘
```

### Step 3: Filter by "Can Login"

1. **Click the "Login Status" dropdown**
2. **Select "✓ Can Login"**
3. **See only students with portal access**
4. **Pick any student** from the list

### Step 4: Get Credentials

**For students with green "Can Login" badge**:

1. **Note their Student ID** (e.g., `STU-2026-001`)
2. **Click "Reset Password"**
3. **Set new password**: `TestPass2026`
4. **Copy credentials** from success modal
5. **Use to test login**

---

## Method 4: Create Fresh Test Student

### Quick Create (2 minutes)

1. **Go to**: `/admin/admissions`
2. **Click**: "Direct Admission" button
3. **Fill minimum fields**:
   ```
   Student Name: Test Student
   Date of Birth: 2010-01-01
   Gender: Male
   Class: Primary 1
   Guardian Name: Test Parent
   Guardian Phone: +2348012345678
   ```
4. **Submit** → Note the generated Student ID
5. **Go to**: `/admin/students`
6. **Find**: "Test Student"
7. **Click**: "Set Password"
8. **Enter**: `TestPass2026`
9. **Copy credentials** from modal

**Result**:
```
Student ID: STU-2026-XXX (whatever was generated)
Password: TestPass2026
Login URL: http://localhost:3000/s/main/login/student
```

---

## Password Calculation Formula

### If Student Was Bulk Provisioned

**Formula**: `Student@{last4digits}{year}`

**Examples**:

| Student ID | Extract Digits | Pad to 4 | Add Year | Final Password |
|------------|----------------|----------|----------|----------------|
| STU-2026-001 | 001 | 0001 | 2026 | `Student@00012026` |
| STU-2026-123 | 123 | 0123 | 2026 | `Student@01232026` |
| ABC-999 | 999 | 0999 | 2026 | `Student@09992026` |
| XYZ-1 | 1 | 0001 | 2026 | `Student@00012026` |

### JavaScript Calculator

Paste this in console to calculate password for any Student ID:

```javascript
function calculatePassword(studentId) {
  const year = new Date().getFullYear();
  const digits = (studentId.match(/\d+/g)?.join('') ?? '').slice(-4).padStart(4, '0');
  const password = `Student@${digits}${year}`;
  console.log(`Student ID: ${studentId}`);
  console.log(`Password: ${password}`);
  return password;
}

// Usage:
calculatePassword('STU-2026-001');  // Student@00012026
calculatePassword('STU-2026-123');  // Student@01232026
```

---

## Common Test Credentials

### If Your School ID is "main"

**Test Student 1**:
```
Student ID: STU-2026-001
Password: Student@00012026 (if bulk provisioned)
         OR TestPass2026 (if manually set)
Login URL: http://localhost:3000/s/main/login/student
```

**Test Student 2**:
```
Student ID: STU-2026-002
Password: Student@00022026 (if bulk provisioned)
         OR TestPass2026 (if manually set)
Login URL: http://localhost:3000/s/main/login/student
```

---

## Quick Verification Steps

### 1. Check if Student Exists
```
✓ Go to /admin/students
✓ See students in the list
✓ Note any Student ID
```

### 2. Check Login Status
```
✓ Look for badge on student card
✓ Green "Can Login" = Ready to test
✓ Amber "No Access" = Need to set password
```

### 3. Set/Reset Password
```
✓ Click "Set Password" or "Reset Password"
✓ Enter: TestPass2026
✓ Copy credentials from modal
```

### 4. Test Login
```
✓ Open incognito window
✓ Go to: /s/{school-id}/login/student
✓ Enter Student ID and password
✓ Should redirect to Student Portal
```

---

## Still Can't Find Credentials?

### Share This Information:

1. **Your school ID** (from School Settings or URL)
2. **Any student ID** from your database
3. **Screenshot** of Student Directory page
4. **Screenshot** of Firebase Console → students collection

I can then calculate the exact credentials for you!

---

## Expected Login Flow

```
1. Open: http://localhost:3000/s/main/login/student
   ↓
2. See: Kid-friendly login page with school branding
   ↓
3. Enter: Student ID (e.g., STU-2026-001)
   ↓
4. Enter: Password (e.g., TestPass2026)
   ↓
5. Click: "🎒 Sign In" button
   ↓
6. Redirect: /student (Student Portal)
   ↓
7. See: Student dashboard with name and menu
```

---

**Last Updated**: 2026-05-20 (Updated to reflect student login removal)

---

## Note on Removed Functionality

All methods described below for student login are no longer functional. The system has been updated to remove student authentication capabilities. Student records are still maintained in the system for academic tracking, but students cannot log in directly. Parents should use the parent portal to access their children's information.
