import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, Users, Shield, ChevronDown, ChevronRight, ChevronLeft,
  CheckCircle2, AlertCircle, Info, Lightbulb, ArrowRight, GraduationCap,
  Settings, UserPlus, School, Clock, FileText, DollarSign, Bell,
  ClipboardList, Award, BarChart3, Key, MessageSquare, Calendar,
  UserCheck, RefreshCw, Star, Sparkles, Heart, Phone, Mail,
  Link2, Baby, Briefcase, CreditCard, Map, ArrowUpRight, LayoutDashboard
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

type RoleKey = 'admin' | 'teacher' | 'student' | 'parent';

interface Step {
  id: string;
  title: string;
  description: string;
  details: string[];
  tip?: string;
  warning?: string;
  path?: string;
  pathLabel?: string;
  substeps?: string[];
}

interface Section {
  id: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  title: string;
  subtitle: string;
  steps: Step[];
}

// ─── Role meta ──────────────────────────────────────────────────────────────

const ROLE_META: Record<RoleKey, {
  label: string; icon: React.ElementType;
  gradient: string; accent: string; badge: string; badgeText: string; description: string;
}> = {
  admin: {
    label: 'Administrator',
    icon: Shield,
    gradient: 'from-indigo-600 to-violet-600',
    accent: 'text-indigo-600',
    badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    badgeText: 'Full System Access',
    description: 'Set up the school, manage all users, configure settings, and oversee every module.',
  },
  teacher: {
    label: 'Teacher',
    icon: GraduationCap,
    gradient: 'from-emerald-600 to-teal-600',
    accent: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    badgeText: 'Classroom Access',
    description: 'Manage attendance, record grades, set assignments, and communicate with parents.',
  },
  student: {
    label: 'New Student',
    icon: BookOpen,
    gradient: 'from-amber-500 to-orange-500',
    accent: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    badgeText: 'Applicant Portal',
    description: 'Submit your application, track its status, and understand the admission process.',
  },
  parent: {
    label: 'Parent / Guardian',
    icon: Heart,
    gradient: 'from-rose-500 to-pink-600',
    accent: 'text-rose-600',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    badgeText: 'Parent Portal',
    description: 'Monitor your child\'s academic progress, fees, attendance, and communicate with teachers.',
  },
};

// ─── ADMIN SECTIONS ─────────────────────────────────────────────────────────

const ADMIN_SECTIONS: Section[] = [
  {
    id: 'initial-setup',
    icon: Settings,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    title: 'Initial School Setup',
    subtitle: 'Configure your school\'s identity and academic calendar before anything else.',
    steps: [
      {
        id: 'school-settings',
        title: 'Configure School Settings',
        description: 'Start by entering your school\'s core information so it appears correctly on all documents, report cards, and invoices.',
        path: '/admin/settings',
        pathLabel: 'Admin → School Settings',
        details: [
          'Navigate to School Settings from the left sidebar under HR & System.',
          'Enter your School Name, Address, Phone, and Email in the Basic Information section.',
          'Upload your School Logo using the provided logo upload field (recommended: 200×200px PNG).',
          'Set the Current Academic Session (e.g., "2025/2026") and the Active Term ("1st Term").',
          'Choose your Grading System — WAEC (A1–F9) is the Nigerian standard; you may also select Percentage, GPA (4.0), or IB.',
          'Set your Currency symbol (₦ for NGN is the default).',
          'Click Save School Settings to apply all changes.',
        ],
        tip: 'School settings affect ALL printed documents — report cards, invoices, ID cards. Set them up before admitting any student.',
      },
      {
        id: 'class-creation',
        title: 'Create School Classes',
        description: 'Classes must exist before you can enrol students, assign teachers, or record attendance. Create one class for each level in your school.',
        path: '/admin/classes',
        pathLabel: 'Admin → Classes',
        details: [
          'Go to Classes in the sidebar under Academic.',
          'Click the "+ New Class" button in the top right.',
          'Enter the Class Name (e.g., "JSS 1A", "Primary 3", "SSS 2 Science").',
          'Select the Level from the dropdown — Kindergarten, Nursery, Primary, JSS, or SSS.',
          'Assign a Form Tutor / Class Teacher by typing their name (this must match a registered staff member).',
          'Set the Academic Session this class belongs to (e.g., "2025/2026").',
          'Click Save Class. The class will now appear in all subject and enrolment dropdowns.',
          'Repeat for every class in your school.',
        ],
        tip: 'Name classes clearly — include both level and section (e.g., "SSS 3A"). You can\'t rename a class later without updating all linked records.',
        warning: 'You MUST create classes before admitting students. Students cannot be enrolled without a class assignment.',
        substeps: [
          'After creating a class, click on it to open the class detail view.',
          'Use the "Add Subject" panel to assign subjects to the class (e.g., Mathematics, English, Biology).',
          'Link each subject to the teacher who will teach it — this gives that teacher access to record grades for the class.',
        ],
      },
      {
        id: 'seed-data',
        title: 'Load Demo Data (Optional)',
        description: 'New to the system? Use Seed Data to instantly populate the school with realistic Nigerian sample data so you can explore all features without entering data manually.',
        path: '/admin/seed',
        pathLabel: 'Admin → Seed Demo Data',
        details: [
          'Go to Seed Demo Data from the sidebar (at the bottom of HR & System).',
          'Click "Seed All Demo Data" to create sample classes, students, staff, grades, invoices, and more.',
          'Use this ONLY on a fresh/test environment — it cannot be easily undone.',
          'After seeding, explore any module to see how real data flows through the system.',
        ],
        warning: 'Never seed demo data on a live production school — it will mix with real student records.',
      },
    ],
  },
  {
    id: 'user-management',
    icon: Users,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    title: 'User & Account Management',
    subtitle: 'Invite staff, manage teacher accounts, handle substitutes, and set up parent portals.',
    steps: [
      {
        id: 'invite-teachers',
        title: 'Add Teacher Accounts',
        description: 'Teachers must register themselves — you then approve and set their role in User Management.',
        path: '/admin/users',
        pathLabel: 'Admin → User Management',
        details: [
          'Share the login page link with new teachers: they visit the Login page and click "Register".',
          'They select "Teacher" as their role, enter their name, email, and password, then submit.',
          'Once registered, navigate to Admin → User Management.',
          'Find the new teacher in the list (use the role filter to show "teacher" accounts).',
          'Confirm their role is set to "teacher". If it shows "applicant", click the role dropdown next to their name and change it.',
          'The teacher can now log in and access the Teacher Portal immediately.',
        ],
        tip: 'Share a direct link to the registration page with new teachers. Their first login may take a few seconds as the system creates their profile.',
      },
      {
        id: 'substitute-teacher',
        title: 'Assign a Substitute Teacher',
        description: 'When a class teacher is absent, another teacher can be temporarily assigned to cover their class for attendance and grades.',
        path: '/admin/classes',
        pathLabel: 'Admin → Classes',
        details: [
          'Go to Admin → Classes and find the class that needs a cover teacher.',
          'Click Edit on the class card.',
          'In the Form Tutor field, type the substitute teacher\'s name and select them.',
          'Click Save Class — the substitute now has full access to that class\'s students, attendance, and gradebook.',
          'When the original teacher returns, edit the class again and restore the original form tutor.',
        ],
        tip: 'The substitute teacher will see the covered class in their Teacher Portal under "My Students" and "Attendance" tabs immediately after the class is saved.',
        warning: 'If a subject teacher (not form tutor) is absent, reassign the individual subject under the class\'s subject list to the substitute, then restore it when the teacher returns.',
      },
      {
        id: 'temp-accounts',
        title: 'Temporary / Contractor Accounts',
        description: 'For short-term staff such as exam invigilators, supply teachers, or contract workers, create a limited account and disable it when no longer needed.',
        path: '/admin/users',
        pathLabel: 'Admin → User Management',
        details: [
          'Have the temporary staff member register normally at the Login page with role "Teacher" or "Staff".',
          'Go to Admin → User Management and locate their account.',
          'Set their role to "teacher" if they need classroom access, or leave as "staff" for admin-only tasks.',
          'When their contract ends, click the "Disable" toggle next to their account — they will no longer be able to log in.',
          'Their historical records (grades entered, attendance marked) remain intact in the system.',
          'To restore access, click "Enable" at any time.',
        ],
        warning: 'Do NOT delete accounts — disabling is preferred so all historical data linked to the account (grades, notes) stays intact.',
      },
      {
        id: 'parent-accounts',
        title: 'Parent Account Management',
        description: 'Parents register themselves, then you link them to their child\'s student record. A parent can have multiple children all visible in one portal.',
        path: '/admin/admissions',
        pathLabel: 'Admin → Admissions',
        details: [
          'The parent visits the Login page and registers with role "Parent", using their real email address.',
          'To link them to a child, go to Admin → Admissions and open the student\'s application.',
          'Scroll to the "Guardian & Sibling Linking" section.',
          'Check "Link to existing parent portal account" and select the parent from the dropdown.',
          'Click "Approve & Enroll" (or just save if the student is already enrolled) — the parent is now linked.',
          'The parent will immediately see that child\'s data in their Parent Portal.',
          'For multiple children: repeat the linking step for each child under the same parent account. All children will appear as cards in the Parent Portal.',
        ],
        tip: 'If a parent\'s email matches the Guardian Email entered during enrolment exactly, they will be linked automatically — no manual step required.',
        warning: 'Parents MUST register with the same email you entered as the guardian email during student enrolment, or you must manually link them via the process above.',
      },
      {
        id: 'bulk-import',
        title: 'Bulk Student Import',
        description: 'For large intakes, import hundreds of students at once using a CSV file instead of entering them one by one.',
        path: '/admin/bulk-import',
        pathLabel: 'Admin → Bulk Import',
        details: [
          'Go to Admin → Bulk Import.',
          'Download the CSV template provided on the page.',
          'Fill in the template with student data — one student per row. Required fields: studentName, dob, gender, currentClass.',
          'Upload the completed CSV file using the file picker.',
          'The system will preview the data and highlight any rows with errors (missing required fields, invalid class names, etc.).',
          'Fix highlighted errors in the CSV and re-upload, or use the inline editor if available.',
          'Click "Import All Valid Rows" to create all student records in one action.',
        ],
        tip: 'The class names in your CSV must exactly match the class names already created in Class Management — including capitalisation.',
      },
    ],
  },
  {
    id: 'admissions',
    icon: UserCheck,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    title: 'Admissions & Enrolment',
    subtitle: 'Process applications, enrol students directly, and manage the full admission pipeline.',
    steps: [
      {
        id: 'review-application',
        title: 'Review and Approve Applications',
        description: 'Applications submitted online appear in the pipeline. Review them, add notes, and approve or reject.',
        path: '/admin/admissions',
        pathLabel: 'Admin → Admissions',
        details: [
          'Go to Admin → Admissions. You will see a list of applications with colour-coded status pills.',
          'Click on any application to open the detail view.',
          'Review all applicant information — personal details, documents uploaded, and guardian information.',
          'Add internal notes in the "Reviewer Notes" field (visible only to admins).',
          'Change the status to "Reviewing" while you process the application.',
          'Fill in the Guardian/Parent section — name, phone, email, relationship.',
          'Assign a Class in the "Class Assignment" field.',
          'Click "Approve & Enroll" — the system creates a Student record, assigns a Student ID, and links the guardian.',
          'To reject, click "Reject Application" and add a reason in the notes field.',
        ],
        tip: 'Approving an application is IRREVERSIBLE via a simple button — the student record is created in the database. Double-check the class assignment and guardian details before approving.',
      },
      {
        id: 'direct-admit',
        title: 'Direct Admission (Walk-in Students)',
        description: 'For students who were not admitted through the online portal, use Direct Admission to create a full record in one step.',
        path: '/admin/admissions',
        pathLabel: 'Admin → Admissions → "Admit Student" button',
        details: [
          'Go to Admin → Admissions and click the "Admit Student" button (top right).',
          'Step 1 — Student Information: Enter name, date of birth, gender, NIN (optional), nationality, blood group, medical conditions, and home address.',
          'Step 2 — Guardian / Parent: Enter the primary guardian\'s name, phone, email, and relationship. Optionally add a second guardian. Check "Link to existing parent portal account" if the parent is already registered.',
          'Step 3 — Siblings & Class: Search for any existing siblings in the school and link them. Select the class the student will be assigned to.',
          'Step 4 — Review & Submit: Verify all details are correct and click "Submit Admission".',
          'The system generates a unique Student ID, creates the student record, guardian record, and links any siblings — all in one transaction.',
        ],
        tip: 'You can skip NIN, blood group, and medical fields for now — these can be updated later in the Student Profile.',
      },
    ],
  },
  {
    id: 'academic',
    icon: Award,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    title: 'Academic Management',
    subtitle: 'Gradebooks, timetables, report cards, exams, and curriculum mapping.',
    steps: [
      {
        id: 'timetable',
        title: 'Build the School Timetable',
        description: 'Create weekly schedules for each class, assigning subjects to periods across Monday to Friday.',
        path: '/admin/timetable',
        pathLabel: 'Admin → Timetable',
        details: [
          'Go to Admin → Timetable and select a Class and Term from the dropdowns.',
          'Click "Add Period" for each day to add a time slot.',
          'Enter the Subject, Start Time, End Time, and optionally the Teacher\'s name.',
          'The system checks for conflicts — two classes cannot share the same teacher at the same time.',
          'Click "Save Timetable" when done. Teachers and parents can view the timetable from the School Calendar.',
        ],
      },
      {
        id: 'gradebook',
        title: 'Enter Grades (Admin Gradebook)',
        description: 'Admins can enter or edit grades for any class and subject, in addition to teachers entering their own.',
        path: '/admin/gradebook',
        pathLabel: 'Admin → Gradebook',
        details: [
          'Navigate to Admin → Gradebook. Select the Class, Subject, and Term.',
          'A list of enrolled students appears. For each student, enter the CA Score (out of 40) and Exam Score (out of 60).',
          'The Total and Grade are calculated automatically using the Nigerian WAEC grading scale.',
          'Optionally add Teacher Notes for individual students.',
          'Click "Save All Grades" to commit. Grades are immediately visible to parents and in report cards.',
        ],
        tip: 'Teachers enter their own grades in the Teacher Portal → Gradebook tab. Use the admin gradebook to review or correct entries.',
      },
      {
        id: 'report-cards',
        title: 'Generate & Print Report Cards',
        description: 'Generate official report cards for an entire class at the end of each term.',
        path: '/admin/report-cards',
        pathLabel: 'Admin → Report Cards',
        details: [
          'Go to Admin → Report Cards. Select the Class and Term.',
          'The system compiles grades, attendance, psychomotor skills, and class position for each student.',
          'Use the "Generate AI Principal\'s Comment" button to get an AI-drafted remark for each student.',
          'Click "Print All" to open the print dialog and print or save as PDF.',
          'Parents can also view and print their child\'s report card from the Parent Portal.',
        ],
      },
      {
        id: 'pin-management',
        title: 'Result PIN Management',
        description: 'Control access to result viewing with PIN codes — parents must enter a valid PIN before seeing grades.',
        path: '/admin/pins',
        pathLabel: 'Admin → Result PINs',
        details: [
          'Go to Admin → Result PINs.',
          'Click "Generate New PIN" to create a PIN code (format: XXXX-XXXX-XXXX).',
          'Set the maximum number of times the PIN can be used (e.g., 1 for single-use, 3 for a family with 3 children).',
          'Optionally bind the PIN to a specific student ID to restrict it to that student only.',
          'Share the PIN with the parent — they enter it once in the Parent Portal to unlock result viewing.',
          'Used PINs show their usage count. Expired PINs are automatically inactive.',
        ],
        tip: 'Generate PINs in bulk at the start of each term and distribute them along with fee invoices.',
      },
    ],
  },
  {
    id: 'finance-comms',
    icon: DollarSign,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    title: 'Finance & Communications',
    subtitle: 'Invoicing, payroll, notifications, and WhatsApp messaging.',
    steps: [
      {
        id: 'invoices',
        title: 'Create Student Fee Invoices',
        description: 'Generate school fee invoices per student, with online payment support via Paystack.',
        path: '/admin/finance',
        pathLabel: 'Admin → Finance',
        details: [
          'Go to Admin → Finance and click "New Invoice".',
          'Select the Student from the dropdown.',
          'Enter the Description (e.g., "First Term School Fees 2025/2026"), Amount, Due Date, and Term.',
          'Click Save Invoice — the invoice is immediately visible to the parent in their portal.',
          'The parent can pay online via the Paystack button in their Finance tab.',
          'Alternatively, record a manual cash/bank payment by clicking "Record Payment" next to any invoice.',
        ],
      },
      {
        id: 'notifications',
        title: 'Send School Notifications',
        description: 'Push notifications to all users, a specific class, or an individual — for fee reminders, exam schedules, and announcements.',
        path: '/admin/notifications',
        pathLabel: 'Admin → Notifications',
        details: [
          'Go to Admin → Notifications and click "New Notification".',
          'Select the Recipient Type: All Users, Specific Class, or Individual User.',
          'Choose the notification Type: General, Fee Due, Exam, or Attendance Alert.',
          'Enter a Title and Body text.',
          'Click "Send Notification". Recipients see the notification in their portal\'s Notifications tab with an unread badge.',
        ],
      },
      {
        id: 'whatsapp',
        title: 'WhatsApp Bulk Messages',
        description: 'Generate WhatsApp message templates for fee reminders, exam alerts, or attendance warnings, pre-filled with student data.',
        path: '/admin/whatsapp',
        pathLabel: 'Admin → WhatsApp',
        details: [
          'Go to Admin → WhatsApp Notifications.',
          'Select the Message Type (fee reminder, exam notice, attendance warning, general).',
          'Filter recipients by class or select individuals.',
          'The system pre-fills student names, amounts owed, or attendance rates into the message template.',
          'Click "Generate with AI" to have AI improve the message tone.',
          'Click the WhatsApp button next to each recipient to open WhatsApp Web with the pre-filled message.',
          'Sent messages are logged in the activity history.',
        ],
      },
    ],
  },
];

// ─── TEACHER SECTIONS ────────────────────────────────────────────────────────

const TEACHER_SECTIONS: Section[] = [
  {
    id: 'teacher-setup',
    icon: GraduationCap,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    title: 'Getting Started as a Teacher',
    subtitle: 'Register, get assigned to your class, and understand your portal.',
    steps: [
      {
        id: 'teacher-register',
        title: 'Register Your Account',
        description: 'Create your teacher account so the school administrator can assign you to your class.',
        path: '/login',
        pathLabel: 'Login Page → Register',
        details: [
          'Visit the Avenir SIS login page shared by your school administrator.',
          'Click "Register" and select "Teacher" as your role.',
          'Enter your full name, school email address, and a secure password.',
          'Click Create Account — your account is created instantly.',
          'Notify your school administrator that your account is ready so they can assign you to your class.',
          'Once assigned, log in and you will be directed to the Teacher Portal automatically.',
        ],
        tip: 'Use your official school email address. This is the address parents and administrators will use to message you.',
      },
      {
        id: 'teacher-portal-overview',
        title: 'Teacher Portal Overview',
        description: 'Your portal is divided into tabs. Each tab focuses on a specific classroom task.',
        path: '/teacher',
        pathLabel: 'Teacher Portal',
        details: [
          'Dashboard — See an overview: number of students, recent assignments, and upcoming tasks.',
          'My Students — View all students in your assigned class with their profiles and contact details.',
          'Attendance — Mark daily attendance: Present, Absent, or Late for each student.',
          'Gradebook — Enter CA and Exam scores for each subject you teach.',
          'Skills — Rate student psychomotor and affective skills (Punctuality, Neatness, Co-operation, etc.).',
          'Assignments — Create and manage homework assignments for your class.',
          'Messages — Communicate directly with parents or school administrators.',
          'AI Tools — Use AI to generate lesson plans, quiz questions, or student performance summaries.',
        ],
      },
    ],
  },
  {
    id: 'attendance-grades',
    icon: ClipboardList,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    title: 'Recording Attendance & Grades',
    subtitle: 'Daily attendance marking and end-of-term grade entry.',
    steps: [
      {
        id: 'take-attendance',
        title: 'Mark Daily Attendance',
        description: 'Record which students are present, absent, or late for each school day.',
        path: '/teacher?tab=attendance',
        pathLabel: 'Teacher Portal → Attendance tab',
        details: [
          'Click the Attendance tab in your sidebar.',
          'Select today\'s date from the date picker (defaults to today).',
          'Your class students are listed. For each student, click "Present", "Absent", or "Late".',
          'Use the "Mark All Present" button at the top to quickly mark everyone present, then change individual exceptions.',
          'Click "Save Attendance" to commit. Records are saved per student per date — you cannot enter the same date twice.',
          'To view or edit a previous day\'s attendance, select that date from the picker and the saved records will load.',
        ],
        tip: 'Mark attendance first thing every morning. The system timestamps each save so the school can see when attendance was recorded.',
      },
      {
        id: 'enter-grades',
        title: 'Enter Student Grades',
        description: 'Record CA (Continuous Assessment) and Exam scores at the end of each term for each subject you teach.',
        path: '/teacher?tab=grades',
        pathLabel: 'Teacher Portal → Gradebook tab',
        details: [
          'Click the Gradebook tab in the sidebar.',
          'Select the Subject (only subjects assigned to you appear) and Term.',
          'A list of your students appears. Enter the CA Score (0–40) and Exam Score (0–60) for each.',
          'The Total and Letter Grade (A1–F9 WAEC scale) are calculated automatically.',
          'Optionally add a Teacher Note per student (visible on the report card).',
          'Click "Save All Grades". Grades are immediately visible to parents in their portal.',
          'You can return and edit grades until the administrator locks the term.',
        ],
        warning: 'Double-check all scores before saving — parents can see grades in real-time. Contact your administrator if you need to correct a locked record.',
      },
      {
        id: 'skills-assessment',
        title: 'Rate Student Skills',
        description: 'Assess each student on non-academic qualities that appear on their report card.',
        path: '/teacher?tab=skills',
        pathLabel: 'Teacher Portal → Skills tab',
        details: [
          'Click the Skills tab.',
          'Select the Term for which you are assessing skills.',
          'For each student, rate 6 skills: Punctuality, Neatness, Co-operation, Honesty, Sports, and Creativity.',
          'Ratings are: E (Excellent), VG (Very Good), G (Good), F (Fair), P (Poor).',
          'Click "Save Skills" for each student.',
          'These ratings appear in the Psychomotor / Affective section of the report card.',
        ],
        tip: 'Complete skills assessments before the term ends — report cards are generated by the administrator and your input is needed.',
      },
      {
        id: 'assignments',
        title: 'Post Assignments',
        description: 'Create homework or classwork assignments visible to parents in the Parent Portal.',
        path: '/teacher?tab=assignments',
        pathLabel: 'Teacher Portal → Assignments tab',
        details: [
          'Click the Assignments tab.',
          'Click "+ New Assignment".',
          'Enter the Title, Subject, Description, and Due Date.',
          'Click Save. The assignment is immediately visible to parents in the Assignments section of their portal.',
          'To edit or delete, click the edit icon next to the assignment.',
        ],
      },
    ],
  },
  {
    id: 'ai-tools',
    icon: Sparkles,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    title: 'AI Teaching Tools',
    subtitle: 'Use built-in AI to save time on lesson planning, quizzes, and student analysis.',
    steps: [
      {
        id: 'ai-lesson-plan',
        title: 'Generate Lesson Plans',
        description: 'Let AI draft a structured lesson plan for any topic, aligned to Nigerian curriculum objectives.',
        path: '/teacher?tab=ai_tools',
        pathLabel: 'Teacher Portal → AI Tools tab',
        details: [
          'Click the AI Tools tab.',
          'Select "Lesson Plan Generator".',
          'Enter the Subject, Class Level, Topic, and Duration.',
          'Click "Generate". The AI produces a structured plan with Learning Objectives, Introduction, Main Activities, Assessment, and Conclusion.',
          'Copy the plan or use it directly — it is editable in the text area.',
        ],
        tip: 'The AI works best when you provide a specific topic (e.g., "Photosynthesis in Plants" rather than just "Biology").',
      },
      {
        id: 'ai-quiz',
        title: 'Generate Quiz Questions',
        description: 'Create multiple-choice or short-answer questions for any topic in seconds.',
        path: '/teacher?tab=ai_tools',
        pathLabel: 'Teacher Portal → AI Tools tab',
        details: [
          'In the AI Tools tab, select "Quiz / Question Generator".',
          'Enter the Subject, Topic, Number of Questions, and Difficulty (Easy / Medium / Hard).',
          'Click "Generate Questions". The AI outputs complete questions with answer options and correct answers marked.',
          'Use these directly in classroom tests or adapt them as needed.',
        ],
      },
    ],
  },
];

// ─── STUDENT SECTIONS ────────────────────────────────────────────────────────

const STUDENT_SECTIONS: Section[] = [
  {
    id: 'application',
    icon: FileText,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    title: 'Submitting Your Application',
    subtitle: 'Apply online in minutes. No paper forms required.',
    steps: [
      {
        id: 'create-account',
        title: 'Create an Applicant Account',
        description: 'You need an account before you can submit an application. Registration is free and takes under a minute.',
        path: '/login',
        pathLabel: 'Login Page → Register',
        details: [
          'Visit the school\'s Avenir SIS portal (the link provided by the school).',
          'Click "Register" on the login page.',
          'Select "Applicant" as your role.',
          'Enter your full name, email address, and a secure password.',
          'Click "Create Account". You are immediately logged in.',
          'You will be redirected to the Application form automatically.',
        ],
        tip: 'Use a personal email address you check regularly — the school will use this email for all correspondence about your application.',
      },
      {
        id: 'fill-application',
        title: 'Fill and Submit Your Application',
        description: 'The online application captures your personal details, academic history, and the class you are applying for.',
        path: '/apply',
        pathLabel: 'My Application (after login)',
        details: [
          'Step 1 — Personal Information: Enter your full name, date of birth, gender, phone number, and National Identification Number (NIN) if available.',
          'Step 2 — Academic Information: Select the Class you are applying for (e.g., JSS 1, SSS 2), enter your previous school\'s name, and upload your WAEC/NECO number if applicable.',
          'Step 3 — Review: Check all details are correct.',
          'Click "Submit Application". You will see a confirmation message with your Application Reference Number.',
          'The school will review your application and update its status. You can log back in at any time to check.',
        ],
        tip: 'You can only submit ONE application per email address. If you need to make changes after submitting, contact the school administration directly.',
        warning: 'Ensure all information matches your official documents exactly. Discrepancies may delay your admission.',
      },
      {
        id: 'track-application',
        title: 'Track Your Application Status',
        description: 'Log back in any time to check whether your application is pending, under review, approved, or rejected.',
        path: '/apply',
        pathLabel: 'My Application',
        details: [
          'Log in with the email and password you registered with.',
          'You are taken directly to your Application page, which shows the current status.',
          'Pending — The school has received your application but has not yet reviewed it.',
          'Reviewing — An admin is actively reviewing your application.',
          'Approved — Congratulations! You have been admitted. The school will contact you with next steps.',
          'Rejected — Your application was not successful this time. Contact the school for details.',
        ],
      },
    ],
  },
];

// ─── PARENT SECTIONS ─────────────────────────────────────────────────────────

const PARENT_SECTIONS: Section[] = [
  {
    id: 'parent-setup',
    icon: Heart,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    title: 'Setting Up Your Parent Account',
    subtitle: 'Register, get linked to your child, and access the Parent Portal.',
    steps: [
      {
        id: 'parent-register',
        title: 'Register as a Parent',
        description: 'Create your account using the same email address the school has on file for you.',
        path: '/login',
        pathLabel: 'Login Page → Register',
        details: [
          'Visit the school\'s Avenir SIS portal link.',
          'Click "Register" and select "Parent" as your role.',
          'Enter your full name, email address, and a password.',
          'IMPORTANT: Use the same email address you gave to the school when enrolling your child.',
          'Click "Create Account". You are logged in immediately.',
          'If your email matches the one on file, your child\'s records will appear automatically in your portal.',
          'If not, contact the school administrator to link your account manually.',
        ],
        tip: 'If you have multiple children at the school using the same guardian email, all of them will appear as cards at the top of your Parent Portal automatically.',
        warning: 'Using a different email from the one registered with the school means your child\'s records will NOT appear automatically. Contact the school to fix this.',
      },
      {
        id: 'navigate-portal',
        title: 'Navigating the Parent Portal',
        description: 'The Parent Portal is organised into tabs — each tab shows a different aspect of your child\'s school life.',
        path: '/parent',
        pathLabel: 'Parent Portal',
        details: [
          'If you have multiple children, you will see cards at the top — click any card to switch between children. All data below updates to show that child\'s records.',
          'Academic tab — View your child\'s grades for each subject, with CA and Exam scores broken down per term.',
          'Report Card tab — View and print the official report card. Select the term from the dropdown.',
          'Attendance tab — See daily attendance records with an overall attendance rate percentage.',
          'Assignments tab — View all homework and assignments posted by teachers for your child\'s class.',
          'Fees tab — See all invoices, amounts owed, and pay online using Paystack (card or bank transfer).',
          'Messages tab — Send and receive messages directly with teachers or the school office.',
          'Notifications tab — School-wide and personal announcements appear here.',
        ],
      },
    ],
  },
  {
    id: 'parent-features',
    icon: BookOpen,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    title: 'Using the Parent Portal',
    subtitle: 'Monitor progress, pay fees, and stay connected with the school.',
    steps: [
      {
        id: 'view-results',
        title: 'Viewing Your Child\'s Results',
        description: 'Academic results are visible in the portal once the teacher has entered them. Some schools require a PIN to unlock result viewing.',
        path: '/parent',
        pathLabel: 'Parent Portal → Academic tab',
        details: [
          'Click the Academic tab and select the Term from the dropdown.',
          'If the school uses Result PINs, you will be prompted to enter a PIN before grades are shown. Obtain the PIN from the school office.',
          'Grades show each subject with CA Score, Exam Score, Total, and Letter Grade (A1–F9).',
          'Switch terms to compare performance across 1st, 2nd, and 3rd Terms.',
          'Click "Report Card" tab for the formatted, printable version with class position and teacher remarks.',
        ],
        tip: 'Grades update in real-time as teachers enter them — there is no waiting for a printed sheet to be sent home.',
      },
      {
        id: 'pay-fees',
        title: 'Paying School Fees Online',
        description: 'Pay directly from the portal using a card or bank transfer via Paystack — no need to visit the school.',
        path: '/parent',
        pathLabel: 'Parent Portal → Fees tab',
        details: [
          'Click the Fees tab. You will see a list of all invoices, with the amount and due date.',
          'Outstanding invoices have a "Pay Now" button next to them.',
          'Click "Pay Now" — a Paystack payment modal opens.',
          'Enter your card details or choose bank transfer.',
          'Complete the payment. The invoice status updates to "Paid" immediately.',
          'For manual payments made at the school, the office will update the status on their end.',
        ],
        warning: 'Always screenshot or save the Paystack payment confirmation as proof of payment.',
      },
      {
        id: 'message-teacher',
        title: 'Messaging Teachers',
        description: 'Send a direct message to your child\'s teacher or the school office from within the portal.',
        path: '/parent',
        pathLabel: 'Parent Portal → Messages tab',
        details: [
          'Click the Messages tab.',
          'You will see existing conversations listed on the left.',
          'To start a new conversation, click "+ New Conversation" and enter the teacher\'s email address.',
          'Type your message in the text box at the bottom and click Send.',
          'Teachers receive and reply to messages from their own portal.',
          'Unread message counts appear as badges on the Messages tab.',
        ],
        tip: 'Use the school\'s official staff email directory for teacher email addresses. You can ask the school office for a teacher\'s email if you do not have it.',
      },
    ],
  },
];

const SECTIONS_BY_ROLE: Record<RoleKey, Section[]> = {
  admin: ADMIN_SECTIONS,
  teacher: TEACHER_SECTIONS,
  student: STUDENT_SECTIONS,
  parent: PARENT_SECTIONS,
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepCard({ step, index, isExpanded, onToggle }: {
  step: Step; index: number; isExpanded: boolean; onToggle: () => void;
}) {
  return (
    <motion.div
      layout
      className={`bg-white rounded-2xl border-2 transition-colors overflow-hidden ${isExpanded ? 'border-indigo-200 shadow-lg shadow-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-4 p-5 text-left"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 font-black text-sm ${isExpanded ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={`font-bold text-base ${isExpanded ? 'text-indigo-900' : 'text-slate-900'}`}>{step.title}</h4>
          <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{step.description}</p>
          {step.path && !isExpanded && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-500 mt-1">
              <ArrowRight className="w-3 h-3" />{step.pathLabel}
            </span>
          )}
        </div>
        <div className={`shrink-0 p-1 rounded-lg transition-colors ${isExpanded ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400'}`}>
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div className="px-5 pb-5 space-y-4 border-t border-slate-100">
              {/* Navigation path */}
              {step.path && (
                <div className="flex items-center gap-2 pt-4">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-100">
                    <ArrowRight className="w-3.5 h-3.5" />
                    {step.pathLabel}
                  </div>
                  <Link
                    to={step.path}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                  >
                    Open page <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}

              {/* Steps list */}
              <ol className="space-y-2.5 mt-3">
                {step.details.map((detail, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <span className="text-sm text-slate-700 leading-relaxed">{detail}</span>
                  </li>
                ))}
              </ol>

              {/* Substeps */}
              {step.substeps && step.substeps.length > 0 && (
                <div className="ml-8 pl-4 border-l-2 border-indigo-100 space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">After completing the steps above:</p>
                  {step.substeps.map((sub, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-600">{sub}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tip */}
              {step.tip && (
                <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 leading-relaxed"><span className="font-bold">Tip: </span>{step.tip}</p>
                </div>
              )}

              {/* Warning */}
              {step.warning && (
                <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-800 leading-relaxed"><span className="font-bold">Important: </span>{step.warning}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SectionPanel({ section }: { section: Section }) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedSteps(new Set(section.steps.map(s => s.id)));
  const collapseAll = () => setExpandedSteps(new Set());
  const allExpanded = section.steps.every(s => expandedSteps.has(s.id));

  return (
    <div className="mb-10">
      {/* Section header */}
      <div className={`flex items-start gap-4 p-5 rounded-2xl border-2 ${section.border} ${section.bg} mb-4`}>
        <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm`}>
          <section.icon className={`w-5 h-5 ${section.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-slate-900 text-lg">{section.title}</h3>
          <p className="text-slate-600 text-sm mt-0.5">{section.subtitle}</p>
        </div>
        <button
          onClick={allExpanded ? collapseAll : expandAll}
          className="shrink-0 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-white transition-all"
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {/* Steps */}
      <div className="space-y-3 pl-2">
        {section.steps.map((step, i) => (
          <StepCard
            key={step.id}
            step={step}
            index={i}
            isExpanded={expandedSteps.has(step.id)}
            onToggle={() => toggle(step.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Quick Reference Cards ────────────────────────────────────────────────────

const QUICK_REF: Record<RoleKey, { icon: React.ElementType; color: string; bg: string; items: { label: string; path: string; desc: string }[] }> = {
  admin: {
    icon: Shield,
    color: 'text-indigo-600',
    bg: 'bg-indigo-600',
    items: [
      { label: 'Dashboard', path: '/admin', desc: 'Overview & KPIs' },
      { label: 'School Settings', path: '/admin/settings', desc: 'Configure your school' },
      { label: 'Classes', path: '/admin/classes', desc: 'Create & manage classes' },
      { label: 'Admissions', path: '/admin/admissions', desc: 'Review & enrol students' },
      { label: 'User Management', path: '/admin/users', desc: 'Manage all accounts' },
      { label: 'Finance', path: '/admin/finance', desc: 'Invoices & payments' },
      { label: 'Report Cards', path: '/admin/report-cards', desc: 'Generate & print reports' },
      { label: 'Notifications', path: '/admin/notifications', desc: 'Send announcements' },
    ],
  },
  teacher: {
    icon: GraduationCap,
    color: 'text-emerald-600',
    bg: 'bg-emerald-600',
    items: [
      { label: 'My Students', path: '/teacher?tab=students', desc: 'Class roster' },
      { label: 'Attendance', path: '/teacher?tab=attendance', desc: 'Daily register' },
      { label: 'Gradebook', path: '/teacher?tab=grades', desc: 'Enter scores' },
      { label: 'Skills', path: '/teacher?tab=skills', desc: 'Psychomotor ratings' },
      { label: 'Assignments', path: '/teacher?tab=assignments', desc: 'Post homework' },
      { label: 'Messages', path: '/teacher?tab=messages', desc: 'Parent & admin chat' },
      { label: 'AI Tools', path: '/teacher?tab=ai_tools', desc: 'Lesson plans & quizzes' },
    ],
  },
  student: {
    icon: BookOpen,
    color: 'text-amber-600',
    bg: 'bg-amber-500',
    items: [
      { label: 'My Application', path: '/apply', desc: 'Track admission status' },
      { label: 'School Calendar', path: '/calendar', desc: 'View school events' },
    ],
  },
  parent: {
    icon: Heart,
    color: 'text-rose-600',
    bg: 'bg-rose-500',
    items: [
      { label: 'Academic', path: '/parent', desc: 'Grades & scores' },
      { label: 'Attendance', path: '/parent', desc: 'Daily attendance record' },
      { label: 'Fees', path: '/parent', desc: 'Invoices & online payment' },
      { label: 'Report Card', path: '/parent', desc: 'Print official report' },
      { label: 'Assignments', path: '/parent', desc: 'Homework tracker' },
      { label: 'Messages', path: '/parent', desc: 'Contact teachers' },
    ],
  },
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function OnboardingTutorial() {
  const [activeRole, setActiveRole] = useState<RoleKey>('admin');
  const meta = ROLE_META[activeRole];
  const sections = SECTIONS_BY_ROLE[activeRole];
  const qref = QUICK_REF[activeRole];

  const roles: RoleKey[] = ['admin', 'teacher', 'student', 'parent'];

  // Count total steps
  const totalSteps = sections.reduce((sum, s) => sum + s.steps.length, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* ── Page Header ── */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-full text-sm font-bold text-indigo-600 mb-5">
          <BookOpen className="w-4 h-4" />
          Getting Started Guide
        </div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-3">
          Avenir SIS<br />
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            Onboarding Tutorial
          </span>
        </h1>
        <p className="text-slate-500 text-lg max-w-2xl mx-auto">
          Step-by-step guides for every role in the system. Select your role below to see personalised instructions.
        </p>
      </div>

      {/* ── Role Selector ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        {roles.map(role => {
          const m = ROLE_META[role];
          const isActive = activeRole === role;
          return (
            <button
              key={role}
              onClick={() => setActiveRole(role)}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                isActive
                  ? 'border-transparent shadow-lg ring-2 ring-offset-2'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
              } ${isActive ? `bg-gradient-to-br ${m.gradient} ring-indigo-500` : ''}`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${isActive ? 'bg-white/20' : 'bg-slate-100'}`}>
                <m.icon className={`w-5 h-5 ${isActive ? 'text-white' : m.accent}`} />
              </div>
              <p className={`font-black text-sm ${isActive ? 'text-white' : 'text-slate-900'}`}>{m.label}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${isActive ? 'bg-white/20 text-white border-white/30' : m.badge}`}>
                {m.badgeText}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeRole}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {/* ── Role overview banner ── */}
          <div className={`bg-gradient-to-r ${meta.gradient} rounded-2xl p-6 mb-8 text-white relative overflow-hidden`}>
            <div className="absolute inset-0 opacity-10">
              <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white" />
              <div className="absolute -bottom-12 -left-4 w-32 h-32 rounded-full bg-white" />
            </div>
            <div className="relative flex items-start gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                <meta.icon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black mb-1">{meta.label} Guide</h2>
                <p className="text-white/80 text-sm leading-relaxed max-w-xl">{meta.description}</p>
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full">
                    {sections.length} section{sections.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full">
                    {totalSteps} guided step{totalSteps !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* ── Main tutorial content ── */}
            <div className="lg:col-span-2">
              {sections.map(section => (
                <SectionPanel key={section.id} section={section} />
              ))}

              {/* Info callout at bottom */}
              <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-slate-700">Need more help?</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Contact support at{' '}
                    <a href="mailto:support@avenir-sis.com" className="text-indigo-600 font-medium hover:underline">
                      support@avenir-sis.com
                    </a>
                    {' '}or ask your school administrator.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Quick Reference sidebar ── */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">

                {/* Quick nav card */}
                <div className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden mb-6">
                  <div className={`bg-gradient-to-r ${meta.gradient} px-5 py-4`}>
                    <h3 className="text-white font-black text-sm flex items-center gap-2">
                      <LayoutDashboard className="w-4 h-4" />
                      Quick Navigation
                    </h3>
                    <p className="text-white/70 text-xs mt-0.5">Jump directly to any page</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {qref.items.map(item => (
                      <Link
                        key={item.path + item.label}
                        to={item.path}
                        className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors group"
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{item.label}</p>
                          <p className="text-xs text-slate-400">{item.desc}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Sections index */}
                <div className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden mb-6">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-black text-slate-900">In This Guide</h3>
                  </div>
                  <div className="p-3 space-y-1">
                    {sections.map((section, i) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors group"
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${section.bg} ${section.border} border`}>
                          <section.icon className={`w-3.5 h-3.5 ${section.color}`} />
                        </div>
                        <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">{section.title}</span>
                      </a>
                    ))}
                  </div>
                </div>

                {/* Tips box */}
                <div className="bg-amber-50 rounded-2xl border-2 border-amber-200 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-black text-amber-900">Key Reminders</h3>
                  </div>
                  {activeRole === 'admin' && (
                    <ul className="space-y-2">
                      {[
                        'Set up School Settings before enrolling any student',
                        'Create Classes before admitting students',
                        'Disable (never delete) accounts to keep records intact',
                        'Parents auto-link if their email matches the guardian email on file',
                        'Generate PINs at the start of every term',
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-amber-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {activeRole === 'teacher' && (
                    <ul className="space-y-2">
                      {[
                        'Mark attendance every morning before 9 AM',
                        'Enter grades before the admin locks the term',
                        'Complete skill ratings before report card generation',
                        'Use AI tools to save time on lesson planning',
                        'Keep parents informed via the Messages tab',
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-amber-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {activeRole === 'student' && (
                    <ul className="space-y-2">
                      {[
                        'Use the same email for registration and communication',
                        'Submit your application in one session — you cannot reopen a submitted form',
                        'Keep your Application Reference Number safe',
                        'Check your application status by logging back in',
                        'Contact the school office if you need to make corrections',
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-amber-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {activeRole === 'parent' && (
                    <ul className="space-y-2">
                      {[
                        'Register with the same email you gave the school',
                        'Multiple children all appear in one parent account',
                        'Click a child\'s card to switch between their records',
                        'Save Paystack payment receipts as proof of payment',
                        'Contact the school if your child\'s records are not showing',
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-amber-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
