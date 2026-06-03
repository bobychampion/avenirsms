/**
 * Migration Script: Remove Student Login Functionality
 * 
 * This script safely removes all student authentication infrastructure while
 * preserving student academic data and parent portal functionality.
 * 
 * Requirements: 10.4, 10.5, 10.9
 * 
 * Usage:
 *   npx tsx scripts/migrate-remove-student-login.ts [--backup-only] [--validate-only] [--execute]
 * 
 * Options:
 *   --backup-only    Create backup and validation report only (no destructive operations)
 *   --validate-only  Run validation checks only (no backup or destructive operations)
 *   --execute        Execute the full migration (backup + data cleanup)
 * 
 * Safety Features:
 *   - Creates comprehensive backup before any destructive operations
 *   - Validates data integrity at each step
 *   - Logs all operations for audit trail
 *   - Provides rollback capability via backup files
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const BACKUP_DIR = path.join(process.cwd(), 'backups', `student-login-removal-${Date.now()}`);
const BATCH_SIZE = 500; // Firestore batch limit

// ============================================================================
// Types
// ============================================================================

interface ValidationReport {
  timestamp: string;
  studentRecordCount: number;
  studentAuthAccountCount: number;
  studentLoginsCount: number;
  studentsWithLoginEmail: number;
  parentStudentLinks: number;
}

interface MigrationResult {
  success: boolean;
  backupPath?: string;
  validationReport?: ValidationReport;
  authAccountsDeleted?: number;
  loginEmailsRemoved?: number;
  studentLoginsDeleted?: number;
  errors: string[];
}

// ============================================================================
// Logging Infrastructure
// ============================================================================

class MigrationLogger {
  private logFile: string;
  private logStream: fs.WriteStream | null = null;

  constructor(backupDir: string) {
    this.logFile = path.join(backupDir, 'migration.log');
  }

  initialize(): void {
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    this.log('Migration started', 'INFO');
  }

  log(message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    console.log(logMessage);
    
    if (this.logStream) {
      this.logStream.write(logMessage + '\n');
    }
  }

  close(): void {
    if (this.logStream) {
      this.log('Migration completed', 'INFO');
      this.logStream.end();
    }
  }
}

// ============================================================================
// Backup Functions
// ============================================================================

/**
 * Export a Firestore collection to a JSON file
 * Requirement: 10.4
 */
async function backupCollection(
  db: admin.firestore.Firestore,
  collectionName: string,
  outputPath: string,
  logger: MigrationLogger
): Promise<number> {
  logger.log(`Backing up collection: ${collectionName}`);
  
  try {
    const snapshot = await db.collection(collectionName).get();
    const documents = snapshot.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => ({
      id: doc.id,
      data: doc.data()
    }));

    fs.writeFileSync(outputPath, JSON.stringify(documents, null, 2));
    logger.log(`Backed up ${documents.length} documents from ${collectionName}`);
    
    return documents.length;
  } catch (error) {
    logger.log(`Error backing up ${collectionName}: ${error}`, 'ERROR');
    throw error;
  }
}

/**
 * Export Firebase Auth users with role 'student' to a JSON file
 * Requirement: 10.4
 */
async function backupStudentAuthAccounts(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  outputPath: string,
  logger: MigrationLogger
): Promise<number> {
  logger.log('Backing up student auth accounts');
  
  try {
    // Query Firestore users collection for student accounts
    const usersSnapshot = await db.collection('users')
      .where('role', '==', 'student')
      .get();

    const studentUsers = [];
    
    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      
      // Get corresponding Firebase Auth record
      try {
        const authUser = await auth.getUser(doc.id);
        studentUsers.push({
          uid: doc.id,
          firestoreData: userData,
          authData: {
            email: authUser.email,
            emailVerified: authUser.emailVerified,
            disabled: authUser.disabled,
            metadata: {
              creationTime: authUser.metadata.creationTime,
              lastSignInTime: authUser.metadata.lastSignInTime
            }
          }
        });
      } catch (authError) {
        logger.log(`Warning: Auth record not found for user ${doc.id}`, 'WARN');
        studentUsers.push({
          uid: doc.id,
          firestoreData: userData,
          authData: null
        });
      }
    }

    fs.writeFileSync(outputPath, JSON.stringify(studentUsers, null, 2));
    logger.log(`Backed up ${studentUsers.length} student auth accounts`);
    
    return studentUsers.length;
  } catch (error) {
    logger.log(`Error backing up student auth accounts: ${error}`, 'ERROR');
    throw error;
  }
}

/**
 * Create comprehensive backup of all relevant data
 * Requirement: 10.4
 */
async function createBackup(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  logger: MigrationLogger
): Promise<void> {
  logger.log('Creating backup...');
  
  // Create backup directory
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  
  // Backup collections
  await backupCollection(db, 'students', path.join(BACKUP_DIR, 'students.json'), logger);
  await backupCollection(db, 'student_logins', path.join(BACKUP_DIR, 'student_logins.json'), logger);
  await backupCollection(db, 'users', path.join(BACKUP_DIR, 'users.json'), logger);
  
  // Backup student auth accounts with details
  await backupStudentAuthAccounts(db, auth, path.join(BACKUP_DIR, 'student_auth_accounts.json'), logger);
  
  logger.log(`Backup completed: ${BACKUP_DIR}`);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Count student records in Firestore
 * Requirement: 10.5
 */
async function countStudentRecords(
  db: admin.firestore.Firestore,
  logger: MigrationLogger
): Promise<number> {
  const snapshot = await db.collection('students').count().get();
  const count = snapshot.data().count;
  logger.log(`Student records count: ${count}`);
  return count;
}

/**
 * Count student auth accounts
 * Requirement: 10.5
 */
async function countStudentAuthAccounts(
  db: admin.firestore.Firestore,
  logger: MigrationLogger
): Promise<number> {
  const snapshot = await db.collection('users')
    .where('role', '==', 'student')
    .count()
    .get();
  const count = snapshot.data().count;
  logger.log(`Student auth accounts count: ${count}`);
  return count;
}

/**
 * Count student_logins entries
 * Requirement: 10.5
 */
async function countStudentLogins(
  db: admin.firestore.Firestore,
  logger: MigrationLogger
): Promise<number> {
  const snapshot = await db.collection('student_logins').count().get();
  const count = snapshot.data().count;
  logger.log(`Student_logins entries count: ${count}`);
  return count;
}

/**
 * Count students with loginEmail field
 * Requirement: 10.5
 */
async function countStudentsWithLoginEmail(
  db: admin.firestore.Firestore,
  logger: MigrationLogger
): Promise<number> {
  const snapshot = await db.collection('students').get();
  const count = snapshot.docs.filter((doc: admin.firestore.QueryDocumentSnapshot) => doc.data().loginEmail).length;
  logger.log(`Students with loginEmail field: ${count}`);
  return count;
}

/**
 * Count parent-student linkages
 * Requirement: 10.8
 */
async function countParentStudentLinks(
  db: admin.firestore.Firestore,
  logger: MigrationLogger
): Promise<number> {
  const snapshot = await db.collection('students')
    .where('guardianUserId', '!=', null)
    .count()
    .get();
  const count = snapshot.data().count;
  logger.log(`Parent-student linkages count: ${count}`);
  return count;
}

/**
 * Generate comprehensive validation report
 * Requirements: 10.5, 10.9
 */
async function generateValidationReport(
  db: admin.firestore.Firestore,
  logger: MigrationLogger
): Promise<ValidationReport> {
  logger.log('Generating validation report...');
  
  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    studentRecordCount: await countStudentRecords(db, logger),
    studentAuthAccountCount: await countStudentAuthAccounts(db, logger),
    studentLoginsCount: await countStudentLogins(db, logger),
    studentsWithLoginEmail: await countStudentsWithLoginEmail(db, logger),
    parentStudentLinks: await countParentStudentLinks(db, logger)
  };
  
  // Save report to file
  const reportPath = path.join(BACKUP_DIR, 'validation_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  logger.log(`Validation report saved: ${reportPath}`);
  
  return report;
}

/**
 * Validate data integrity after migration
 * Requirements: 10.6, 10.7
 */
async function validatePostMigration(
  db: admin.firestore.Firestore,
  preMigrationReport: ValidationReport,
  logger: MigrationLogger
): Promise<boolean> {
  logger.log('Validating post-migration data integrity...');
  
  const postReport = await generateValidationReport(db, logger);
  
  let isValid = true;
  
  // Verify student record count unchanged
  if (postReport.studentRecordCount !== preMigrationReport.studentRecordCount) {
    logger.log(
      `VALIDATION FAILED: Student record count changed from ${preMigrationReport.studentRecordCount} to ${postReport.studentRecordCount}`,
      'ERROR'
    );
    isValid = false;
  } else {
    logger.log('✓ Student record count unchanged');
  }
  
  // Verify all loginEmail fields removed
  if (postReport.studentsWithLoginEmail !== 0) {
    logger.log(
      `VALIDATION FAILED: ${postReport.studentsWithLoginEmail} students still have loginEmail field`,
      'ERROR'
    );
    isValid = false;
  } else {
    logger.log('✓ All loginEmail fields removed');
  }
  
  // Verify student_logins collection empty
  if (postReport.studentLoginsCount !== 0) {
    logger.log(
      `VALIDATION FAILED: ${postReport.studentLoginsCount} entries remain in student_logins collection`,
      'ERROR'
    );
    isValid = false;
  } else {
    logger.log('✓ student_logins collection empty');
  }
  
  // Verify no student auth accounts remain
  if (postReport.studentAuthAccountCount !== 0) {
    logger.log(
      `VALIDATION FAILED: ${postReport.studentAuthAccountCount} student auth accounts remain`,
      'ERROR'
    );
    isValid = false;
  } else {
    logger.log('✓ No student auth accounts remain');
  }
  
  // Verify parent-student linkages preserved
  if (postReport.parentStudentLinks !== preMigrationReport.parentStudentLinks) {
    logger.log(
      `VALIDATION WARNING: Parent-student linkages changed from ${preMigrationReport.parentStudentLinks} to ${postReport.parentStudentLinks}`,
      'WARN'
    );
    // This is a warning, not a failure
  } else {
    logger.log('✓ Parent-student linkages preserved');
  }
  
  return isValid;
}

// ============================================================================
// Migration Functions
// ============================================================================

/**
 * Delete all student Firebase Auth accounts
 * Requirement: 1.1
 */
async function deleteStudentAuthAccounts(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  logger: MigrationLogger
): Promise<number> {
  logger.log('Deleting student auth accounts...');
  
  const usersSnapshot = await db.collection('users')
    .where('role', '==', 'student')
    .get();
  
  const uids = usersSnapshot.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => doc.id);
  logger.log(`Found ${uids.length} student accounts to delete`);
  
  let deleted = 0;
  const errors: string[] = [];
  
  for (const uid of uids) {
    try {
      // Delete Firebase Auth account
      await auth.deleteUser(uid);
      
      // Delete Firestore user document
      await db.collection('users').doc(uid).delete();
      
      deleted++;
      
      if (deleted % 10 === 0) {
        logger.log(`Deleted ${deleted}/${uids.length} student accounts`);
      }
    } catch (error) {
      const errorMsg = `Failed to delete account ${uid}: ${error}`;
      logger.log(errorMsg, 'ERROR');
      errors.push(errorMsg);
    }
  }
  
  logger.log(`Deleted ${deleted} of ${uids.length} student accounts`);
  
  if (errors.length > 0) {
    logger.log(`Encountered ${errors.length} errors during auth account deletion`, 'WARN');
  }
  
  return deleted;
}

/**
 * Remove loginEmail field from all student records
 * Requirement: 1.3, 10.2
 */
async function removeLoginEmailFields(
  db: admin.firestore.Firestore,
  logger: MigrationLogger
): Promise<number> {
  logger.log('Removing loginEmail fields from student records...');
  
  const studentsSnapshot = await db.collection('students').get();
  logger.log(`Processing ${studentsSnapshot.size} student records`);
  
  const batches: admin.firestore.WriteBatch[] = [];
  let currentBatch = db.batch();
  let batchCount = 0;
  let updateCount = 0;
  
  for (const docSnap of studentsSnapshot.docs) {
    const data = docSnap.data();
    
    if (data.loginEmail) {
      currentBatch.update(docSnap.ref, { loginEmail: admin.firestore.FieldValue.delete() });
      updateCount++;
      batchCount++;
      
      if (batchCount === BATCH_SIZE) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        batchCount = 0;
      }
    }
  }
  
  // Add remaining batch
  if (batchCount > 0) {
    batches.push(currentBatch);
  }
  
  // Commit all batches
  logger.log(`Committing ${batches.length} batches...`);
  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
    logger.log(`Committed batch ${i + 1}/${batches.length}`);
  }
  
  logger.log(`Removed loginEmail from ${updateCount} student records`);
  return updateCount;
}

/**
 * Delete all documents in student_logins collection
 * Requirement: 1.2
 */
async function deleteStudentLoginsCollection(
  db: admin.firestore.Firestore,
  logger: MigrationLogger
): Promise<number> {
  logger.log('Deleting student_logins collection...');
  
  const loginsSnapshot = await db.collection('student_logins').get();
  logger.log(`Found ${loginsSnapshot.size} entries to delete`);
  
  const batches: admin.firestore.WriteBatch[] = [];
  let currentBatch = db.batch();
  let batchCount = 0;
  
  for (const docSnap of loginsSnapshot.docs) {
    currentBatch.delete(docSnap.ref);
    batchCount++;
    
    if (batchCount === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      batchCount = 0;
    }
  }
  
  // Add remaining batch
  if (batchCount > 0) {
    batches.push(currentBatch);
  }
  
  // Commit all batches
  logger.log(`Committing ${batches.length} batches...`);
  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
    logger.log(`Committed batch ${i + 1}/${batches.length}`);
  }
  
  logger.log(`Deleted ${loginsSnapshot.size} student_logins entries`);
  return loginsSnapshot.size;
}

// ============================================================================
// Main Migration Function
// ============================================================================

async function runMigration(mode: 'backup-only' | 'validate-only' | 'execute'): Promise<MigrationResult> {
  const logger = new MigrationLogger(BACKUP_DIR);
  logger.initialize();
  
  const result: MigrationResult = {
    success: false,
    errors: []
  };
  
  try {
    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      try {
        admin.initializeApp();
      } catch (initError) {
        const errorMsg = `Failed to initialize Firebase Admin SDK: ${initError}\n\nPlease ensure:\n1. GOOGLE_APPLICATION_CREDENTIALS environment variable is set\n2. Service account key file exists and is valid\n3. Service account has required permissions`;
        logger.log(errorMsg, 'ERROR');
        result.errors.push(errorMsg);
        return result;
      }
    }
    
    const db = admin.firestore();
    const auth = admin.auth();
    
    logger.log(`Migration mode: ${mode}`);
    
    // Validate-only mode
    if (mode === 'validate-only') {
      const report = await generateValidationReport(db, logger);
      result.validationReport = report;
      result.success = true;
      logger.log('Validation completed successfully');
      return result;
    }
    
    // Create backup (for both backup-only and execute modes)
    await createBackup(db, auth, logger);
    result.backupPath = BACKUP_DIR;
    
    // Generate pre-migration validation report
    const preMigrationReport = await generateValidationReport(db, logger);
    result.validationReport = preMigrationReport;
    
    // Backup-only mode
    if (mode === 'backup-only') {
      result.success = true;
      logger.log('Backup completed successfully');
      return result;
    }
    
    // Execute mode - perform destructive operations
    logger.log('Starting destructive operations...');
    
    // Step 1: Delete student auth accounts
    result.authAccountsDeleted = await deleteStudentAuthAccounts(db, auth, logger);
    
    // Step 2: Remove loginEmail fields
    result.loginEmailsRemoved = await removeLoginEmailFields(db, logger);
    
    // Step 3: Delete student_logins collection
    result.studentLoginsDeleted = await deleteStudentLoginsCollection(db, logger);
    
    // Step 4: Validate post-migration data integrity
    const isValid = await validatePostMigration(db, preMigrationReport, logger);
    
    if (!isValid) {
      result.errors.push('Post-migration validation failed');
      logger.log('Migration completed with validation errors', 'ERROR');
      result.success = false;
    } else {
      logger.log('Migration completed successfully');
      result.success = true;
    }
    
  } catch (error) {
    const errorMsg = `Migration failed: ${error}`;
    logger.log(errorMsg, 'ERROR');
    result.errors.push(errorMsg);
    result.success = false;
  } finally {
    logger.close();
  }
  
  return result;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  let mode: 'backup-only' | 'validate-only' | 'execute' = 'backup-only';
  
  if (args.includes('--validate-only')) {
    mode = 'validate-only';
  } else if (args.includes('--execute')) {
    mode = 'execute';
  } else if (args.includes('--backup-only')) {
    mode = 'backup-only';
  }
  
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Migration: Remove Student Login Functionality                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  if (mode === 'execute') {
    console.log('⚠️  WARNING: This will perform DESTRUCTIVE operations!');
    console.log('');
    console.log('This migration will:');
    console.log('  • Delete all student Firebase Auth accounts');
    console.log('  • Remove loginEmail fields from student records');
    console.log('  • Delete the student_logins collection');
    console.log('');
    console.log('A backup will be created before any changes are made.');
    console.log('');
  }
  
  const result = await runMigration(mode);
  
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Migration Summary                                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Status: ${result.success ? '✓ SUCCESS' : '✗ FAILED'}`);
  
  if (result.backupPath) {
    console.log(`Backup: ${result.backupPath}`);
  }
  
  if (result.validationReport) {
    console.log('');
    console.log('Validation Report:');
    console.log(`  Student Records: ${result.validationReport.studentRecordCount}`);
    console.log(`  Student Auth Accounts: ${result.validationReport.studentAuthAccountCount}`);
    console.log(`  Student Logins Entries: ${result.validationReport.studentLoginsCount}`);
    console.log(`  Students with loginEmail: ${result.validationReport.studentsWithLoginEmail}`);
    console.log(`  Parent-Student Links: ${result.validationReport.parentStudentLinks}`);
  }
  
  if (mode === 'execute') {
    console.log('');
    console.log('Migration Results:');
    console.log(`  Auth Accounts Deleted: ${result.authAccountsDeleted ?? 0}`);
    console.log(`  loginEmail Fields Removed: ${result.loginEmailsRemoved ?? 0}`);
    console.log(`  student_logins Entries Deleted: ${result.studentLoginsDeleted ?? 0}`);
  }
  
  if (result.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    result.errors.forEach(error => console.log(`  • ${error}`));
  }
  
  console.log('');
  
  process.exit(result.success ? 0 : 1);
}

// Run if executed directly
const isMainModule = process.argv[1] && process.argv[1].endsWith('migrate-remove-student-login.ts');
if (isMainModule) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runMigration, createBackup, generateValidationReport };
