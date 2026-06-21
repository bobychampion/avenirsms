/**
 * Script to find and remove a user from a specific school
 * 
 * Usage:
 *   npx ts-node scripts/find-and-remove-user.ts <email> <schoolId>
 * 
 * Example:
 *   npx ts-node scripts/find-and-remove-user.ts tobakin1@gmail.com main-school-id
 */

import * as admin from 'firebase-admin';
import * as readline from 'readline';
import { readFileSync } from 'fs';

// Initialize Firebase Admin SDK
let serviceAccount: any;
try {
  const serviceAccountPath = './serviceAccountKey.json';
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (error) {
  console.error('\n❌ Error: serviceAccountKey.json not found in project root');
  console.log('\nPlease download your Firebase service account key:');
  console.log('1. Go to Firebase Console > Project Settings > Service Accounts');
  console.log('2. Click "Generate new private key"');
  console.log('3. Save as serviceAccountKey.json in project root\n');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
}

const db = admin.firestore();

interface UserSchoolAssignment {
  schoolId: string;
  schoolName: string;
  role: string;
  userId: string;
  userEmail: string;
  userDocPath: string;
}

/**
 * Find all schools a user is assigned to
 */
async function findUserSchools(email: string): Promise<UserSchoolAssignment[]> {
  console.log(`\n🔍 Searching for user: ${email}...\n`);
  
  const assignments: UserSchoolAssignment[] = [];
  
  // Get all schools
  const schoolsSnapshot = await db.collection('schools').get();
  
  for (const schoolDoc of schoolsSnapshot.docs) {
    const schoolId = schoolDoc.id;
    const schoolData = schoolDoc.data();
    const schoolName = schoolData.name || 'Unknown School';
    
    // Search in staff collection
    const staffQuery = await db
      .collection(`schools/${schoolId}/staff`)
      .where('email', '==', email)
      .get();
    
    if (!staffQuery.empty) {
      staffQuery.forEach((staffDoc) => {
        const staffData = staffDoc.data();
        assignments.push({
          schoolId,
          schoolName,
          role: staffData.role || 'staff',
          userId: staffDoc.id,
          userEmail: email,
          userDocPath: `schools/${schoolId}/staff/${staffDoc.id}`,
        });
      });
    }
    
    // Search in students collection (in case it's a student)
    const studentsQuery = await db
      .collection(`schools/${schoolId}/students`)
      .where('email', '==', email)
      .get();
    
    if (!studentsQuery.empty) {
      studentsQuery.forEach((studentDoc) => {
        const studentData = studentDoc.data();
        assignments.push({
          schoolId,
          schoolName,
          role: 'student',
          userId: studentDoc.id,
          userEmail: email,
          userDocPath: `schools/${schoolId}/students/${studentDoc.id}`,
        });
      });
    }
  }
  
  return assignments;
}

/**
 * Display user assignments
 */
function displayAssignments(assignments: UserSchoolAssignment[]): void {
  if (assignments.length === 0) {
    console.log('❌ No assignments found for this user.\n');
    return;
  }
  
  console.log(`✅ Found ${assignments.length} assignment(s):\n`);
  
  assignments.forEach((assignment, index) => {
    console.log(`${index + 1}. School: ${assignment.schoolName}`);
    console.log(`   School ID: ${assignment.schoolId}`);
    console.log(`   Role: ${assignment.role}`);
    console.log(`   User ID: ${assignment.userId}`);
    console.log(`   Document Path: ${assignment.userDocPath}`);
    console.log('');
  });
}

/**
 * Remove user from a specific school
 */
async function removeUserFromSchool(
  email: string,
  schoolId: string,
  assignments: UserSchoolAssignment[]
): Promise<void> {
  const assignmentsInSchool = assignments.filter((a) => a.schoolId === schoolId);
  
  if (assignmentsInSchool.length === 0) {
    console.log(`\n❌ User ${email} is not assigned to school ID: ${schoolId}\n`);
    return;
  }
  
  console.log(`\n⚠️  About to remove ${assignmentsInSchool.length} assignment(s) from school: ${schoolId}\n`);
  
  for (const assignment of assignmentsInSchool) {
    console.log(`Removing: ${assignment.userDocPath}`);
  }
  
  // Confirm deletion
  const confirmed = await confirmAction(
    `\nAre you sure you want to remove ${email} from school ${schoolId}? (yes/no): `
  );
  
  if (!confirmed) {
    console.log('\n❌ Operation cancelled.\n');
    return;
  }
  
  // Delete user documents
  const batch = db.batch();
  
  for (const assignment of assignmentsInSchool) {
    const docRef = db.doc(assignment.userDocPath);
    batch.delete(docRef);
  }
  
  await batch.commit();
  
  console.log(`\n✅ Successfully removed ${email} from school ${schoolId}!\n`);
  
  // Also check if user has a Firebase Auth account
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`\nℹ️  Firebase Auth user still exists:`);
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Email: ${userRecord.email}`);
    console.log(`   Disabled: ${userRecord.disabled}`);
    
    const deleteAuth = await confirmAction(
      `\nDo you also want to delete the Firebase Auth account? (yes/no): `
    );
    
    if (deleteAuth) {
      await admin.auth().deleteUser(userRecord.uid);
      console.log(`\n✅ Firebase Auth account deleted!\n`);
    }
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.log(`\nℹ️  No Firebase Auth account found for ${email}\n`);
    } else {
      console.error(`\n⚠️  Error checking Firebase Auth: ${error.message}\n`);
    }
  }
}

/**
 * Prompt user for confirmation
 */
function confirmAction(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'yes' || normalized === 'y');
    });
  });
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('\n❌ Error: Missing required argument\n');
    console.log('Usage: npx ts-node scripts/find-and-remove-user.ts <email> [schoolId]\n');
    console.log('Examples:');
    console.log('  npx ts-node scripts/find-and-remove-user.ts tobakin1@gmail.com');
    console.log('  npx ts-node scripts/find-and-remove-user.ts tobakin1@gmail.com main-school-id\n');
    process.exit(1);
  }
  
  const email = args[0];
  const schoolId = args[1];
  
  try {
    // Find all assignments
    const assignments = await findUserSchools(email);
    
    // Display assignments
    displayAssignments(assignments);
    
    if (assignments.length === 0) {
      process.exit(0);
    }
    
    // If schoolId provided, remove from that school
    if (schoolId) {
      await removeUserFromSchool(email, schoolId, assignments);
    } else {
      console.log('ℹ️  To remove this user from a specific school, run:');
      console.log(`   npx ts-node scripts/find-and-remove-user.ts ${email} <schoolId>\n`);
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

// Run the script
main();
