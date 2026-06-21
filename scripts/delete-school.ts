/**
 * Script to delete an entire school and all its data
 * 
 * ⚠️  WARNING: This is a DESTRUCTIVE operation that cannot be undone!
 * 
 * Usage:
 *   npx ts-node scripts/delete-school.ts <schoolId>
 * 
 * Example:
 *   npx ts-node scripts/delete-school.ts main-school-id
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

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

interface SchoolData {
  schoolId: string;
  schoolName: string;
  collections: {
    name: string;
    count: number;
  }[];
  totalDocuments: number;
}

/**
 * Get school information
 */
async function getSchoolInfo(schoolId: string): Promise<SchoolData | null> {
  console.log(`\n🔍 Fetching information for school: ${schoolId}...\n`);
  
  // Get school document
  const schoolDoc = await db.collection('schools').doc(schoolId).get();
  
  if (!schoolDoc.exists) {
    return null;
  }
  
  const schoolData = schoolDoc.data();
  const schoolName = schoolData?.name || 'Unknown School';
  
  // Count documents in all subcollections
  const subcollections = [
    'staff',
    'students',
    'classes',
    'subjects',
    'terms',
    'sessions',
    'fees',
    'payments',
    'attendance',
    'grades',
    'announcements',
    'audit_log',
    'integrations',
  ];
  
  const collections: { name: string; count: number }[] = [];
  let totalDocuments = 1; // School document itself
  
  for (const collectionName of subcollections) {
    const snapshot = await db
      .collection(`schools/${schoolId}/${collectionName}`)
      .count()
      .get();
    
    const count = snapshot.data().count;
    if (count > 0) {
      collections.push({ name: collectionName, count });
      totalDocuments += count;
    }
  }
  
  return {
    schoolId,
    schoolName,
    collections,
    totalDocuments,
  };
}

/**
 * Display school information
 */
function displaySchoolInfo(schoolData: SchoolData): void {
  console.log(`📋 School Information:\n`);
  console.log(`   Name: ${schoolData.schoolName}`);
  console.log(`   ID: ${schoolData.schoolId}`);
  console.log(`   Total Documents: ${schoolData.totalDocuments}\n`);
  
  if (schoolData.collections.length > 0) {
    console.log(`📦 Collections:\n`);
    schoolData.collections.forEach((collection) => {
      console.log(`   - ${collection.name}: ${collection.count} document(s)`);
    });
    console.log('');
  }
}

/**
 * Delete all documents in a collection (batched)
 */
async function deleteCollection(
  collectionPath: string,
  batchSize: number = 100
): Promise<number> {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);
  
  let deletedCount = 0;
  
  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve, reject, deletedCount);
  });
  
  async function deleteQueryBatch(
    query: admin.firestore.Query,
    resolve: (count: number) => void,
    reject: (error: Error) => void,
    deletedCount: number
  ) {
    try {
      const snapshot = await query.get();
      
      const batchSize = snapshot.size;
      if (batchSize === 0) {
        resolve(deletedCount);
        return;
      }
      
      // Delete documents in batch
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      deletedCount += batchSize;
      
      // Recurse on the next batch
      process.nextTick(() => {
        deleteQueryBatch(query, resolve, reject, deletedCount);
      });
    } catch (error) {
      reject(error as Error);
    }
  }
}

/**
 * Delete school and all its data
 */
async function deleteSchool(schoolId: string): Promise<void> {
  console.log(`\n🗑️  Starting deletion of school: ${schoolId}...\n`);
  
  // Get all subcollections
  const subcollections = [
    'staff',
    'students',
    'classes',
    'subjects',
    'terms',
    'sessions',
    'fees',
    'payments',
    'attendance',
    'grades',
    'announcements',
    'audit_log',
    'integrations',
  ];
  
  // Delete each subcollection
  for (const collectionName of subcollections) {
    const collectionPath = `schools/${schoolId}/${collectionName}`;
    process.stdout.write(`   Deleting ${collectionName}... `);
    
    try {
      const deletedCount = await deleteCollection(collectionPath);
      if (deletedCount > 0) {
        console.log(`✅ ${deletedCount} document(s) deleted`);
      } else {
        console.log(`⏭️  (empty)`);
      }
    } catch (error: any) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  // Delete the school document itself
  process.stdout.write(`\n   Deleting school document... `);
  await db.collection('schools').doc(schoolId).delete();
  console.log(`✅ Done\n`);
  
  console.log(`✅ School ${schoolId} has been completely deleted!\n`);
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
    console.log('Usage: npx ts-node scripts/delete-school.ts <schoolId>\n');
    console.log('Example:');
    console.log('  npx ts-node scripts/delete-school.ts main-school-id\n');
    console.log('⚠️  WARNING: This operation is IRREVERSIBLE!\n');
    process.exit(1);
  }
  
  const schoolId = args[0];
  
  try {
    // Get school information
    const schoolData = await getSchoolInfo(schoolId);
    
    if (!schoolData) {
      console.log(`\n❌ School not found: ${schoolId}\n`);
      process.exit(1);
    }
    
    // Display school information
    displaySchoolInfo(schoolData);
    
    // Warning
    console.log(`⚠️  WARNING: This operation is IRREVERSIBLE!`);
    console.log(`⚠️  All data for ${schoolData.schoolName} will be permanently deleted.\n`);
    
    // First confirmation
    const confirmed1 = await confirmAction(
      `Are you absolutely sure you want to delete school "${schoolData.schoolName}"? (yes/no): `
    );
    
    if (!confirmed1) {
      console.log('\n❌ Operation cancelled.\n');
      process.exit(0);
    }
    
    // Second confirmation (extra safety)
    const confirmed2 = await confirmAction(
      `\nType the school ID "${schoolId}" to confirm deletion: `
    );
    
    if (confirmed2 !== true) {
      // Check if they typed the school ID
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      const finalConfirmation = await new Promise<string>((resolve) => {
        rl.question('', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
      
      if (finalConfirmation !== schoolId) {
        console.log('\n❌ School ID mismatch. Operation cancelled.\n');
        process.exit(0);
      }
    }
    
    // Delete the school
    await deleteSchool(schoolId);
    
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

// Run the script
main();
