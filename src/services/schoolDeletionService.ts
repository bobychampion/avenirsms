/**
 * School deletion service — complete removal of school data.
 * Handles multi-stage confirmation, batch processing, audit logging,
 * and comprehensive cleanup across 37+ Firestore collections.
 */

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Options for school deletion operation.
 */
export interface DeletionOptions {
  schoolId: string;
  preserveFinancial: boolean;
  performedBy: string; // super admin UID
}

/**
 * Result of a deletion operation.
 */
export interface DeletionResult {
  success: boolean;
  summary: {
    totalDocumentsDeleted: number;
    deletionsByCollection: Record<string, number>;
    preservedCollections: string[];
    authAccountsDeleted: number;
  };
  errors: Array<{ collection: string; error: string }>;
  auditLogId: string;
}

/**
 * Progress state during deletion operation.
 */
export interface DeletionProgress {
  stage: 'validating' | 'confirming' | 'deleting' | 'complete' | 'error';
  currentCollection: string | null;
  processedCollections: number;
  totalCollections: number;
  deletedDocuments: Record<string, number>;
  errors: Array<{ collection: string; message: string }>;
}

/**
 * Validation result before deletion.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  estimatedDocumentCounts: Record<string, number>;
  schoolSnapshot?: {
    name: string;
    status: string;
    subscriptionPlan: string;
    adminEmail: string;
    createdAt: any;
  };
}

// ─── Collection Constants ────────────────────────────────────────────────────

/**
 * All school-scoped collections that must be deleted when a school is removed.
 * These collections contain documents with a `schoolId` field referencing the school.
 * Total: 37+ collections covering academic, administrative, financial, and operational data.
 */
export const SCHOOL_SCOPED_COLLECTIONS = [
  // User & Identity
  'students',
  'guardians',
  'staff',
  'users',

  // Academic Structure
  'classes',
  'subjects',
  'class_subjects',
  'grades',
  'student_skills',

  // Attendance & Scheduling
  'attendance',
  'attendance_checkins',
  'timetables',

  // Assignments & Assessments
  'assignments',
  'assignment_submissions',

  // Events & Communications
  'events',
  'notifications',
  'notification_broadcasts',
  'messages',

  // Financial
  'invoices',
  'fee_payments',
  'payments',
  'expenses',

  // Examinations
  'exams',
  'exam_seating',
  'question_bank',
  'cbt_exams',
  'cbt_sessions',

  // Curriculum & Resources
  'curriculum_documents',
  'curriculum_items',

  // HR & Payroll
  'leave_requests',
  'payroll',
  'hr_policies',
  'onboarding_records',
  'leave_entitlements',

  // Administrative
  'pins',
  'promotions',
  'whatsapp_logs',
  'applications',

  // Library
  'library_books',
  'library_circulation',

  // Miscellaneous
  'mail',
  'lifecycle_events',
  'behavioral_records',
  'alumni_profiles',
  'cover_assignments',
  'school_trips',
  'trip_registrations',
  'absence_requests',
];

/**
 * Collections containing financial data that may be preserved for audit purposes.
 * When preserveFinancial option is enabled, these collections are marked
 * as deleted rather than permanently removed.
 */
export const FINANCIAL_COLLECTIONS = [
  'invoices',
  'fee_payments',
  'payments',
  'expenses',
  'platform_invoices',
];

/**
 * School-specific document paths that must be deleted.
 * These are not collections but individual documents tied to the school.
 */
export const DOCUMENT_COLLECTIONS = [
  'school_settings',
  'geofences',
];

// ─── Core Functions ──────────────────────────────────────────────────────────

import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, limit, getCountFromServer } from 'firebase/firestore';
import type { School } from '../types';

/**
 * Validates that a school can be safely deleted.
 * 
 * Checks:
 * 1. School document exists
 * 2. School status is 'suspended' (not 'active')
 * 3. No active user sessions (checks fcm_tokens collection)
 * 4. Estimates document counts across all collections
 * 
 * @param schoolId - The ID of the school to validate
 * @returns ValidationResult with success status, errors, and document estimates
 */
export async function validateDeletion(schoolId: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const estimatedDocumentCounts: Record<string, number> = {};

  try {
    // 1. Check school document exists
    const schoolRef = doc(db, 'schools', schoolId);
    const schoolSnap = await getDoc(schoolRef);

    if (!schoolSnap.exists()) {
      errors.push('School not found');
      return {
        isValid: false,
        errors,
        estimatedDocumentCounts: {},
      };
    }

    const schoolData = schoolSnap.data() as School;

    // 2. Verify school status is 'suspended'
    if (schoolData.status === 'active') {
      errors.push('Cannot delete active school. Suspend the school first from School Settings.');
    }

    // 3. Query fcm_tokens collection for active user sessions
    const fcmTokensRef = collection(db, 'fcm_tokens');
    const activeSessionsQuery = query(
      fcmTokensRef,
      where('schoolId', '==', schoolId),
      limit(1)
    );
    const activeSessionsSnap = await getDocs(activeSessionsQuery);

    if (!activeSessionsSnap.empty) {
      errors.push(
        'Cannot delete school with active user sessions. Wait for all users to log out (up to 1 hour) or contact them to sign out.'
      );
    }

    // 4. Estimate document counts across all school-scoped collections
    const estimationPromises = SCHOOL_SCOPED_COLLECTIONS.map(async (collectionName) => {
      try {
        const collectionRef = collection(db, collectionName);
        const q = query(collectionRef, where('schoolId', '==', schoolId));
        const snapshot = await getCountFromServer(q);
        const count = snapshot.data().count;
        
        if (count > 0) {
          estimatedDocumentCounts[collectionName] = count;
        }
        
        return count;
      } catch (error) {
        // If count fails for a collection, log but don't fail validation
        console.warn(`Failed to count documents in ${collectionName}:`, error);
        return 0;
      }
    });

    await Promise.all(estimationPromises);

    // Also check document collections (school_settings, geofences)
    for (const docCollection of DOCUMENT_COLLECTIONS) {
      try {
        const docRef = doc(db, docCollection, schoolId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          estimatedDocumentCounts[docCollection] = 1;
        }
      } catch (error) {
        console.warn(`Failed to check document in ${docCollection}:`, error);
      }
    }

    // Return validation result
    return {
      isValid: errors.length === 0,
      errors,
      estimatedDocumentCounts,
      schoolSnapshot: {
        name: schoolData.name,
        status: schoolData.status,
        subscriptionPlan: schoolData.subscriptionPlan,
        adminEmail: schoolData.adminEmail,
        createdAt: schoolData.createdAt,
      },
    };
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      isValid: false,
      errors,
      estimatedDocumentCounts: {},
    };
  }
}

/**
 * Permanently deletes a school via the Vercel `/api/delete-school` route.
 *
 * Deletion runs server-side (Admin SDK) because it also removes the
 * school's users' Firebase Auth accounts — something the client SDK can
 * never do — and cascades across 40+ Firestore collections.
 */
export async function deleteSchool(options: DeletionOptions): Promise<DeletionResult> {
  const { callApi } = await import('./api');
  const data = await callApi<{
    success: boolean;
    deletionsByCollection: Record<string, number>;
    authAccountsDeleted: number;
    errors?: Array<{ collection: string; error: string }>;
    auditLogId: string;
  }>('/api/delete-school', {
    schoolId: options.schoolId,
    preserveFinancial: options.preserveFinancial,
  });

  const { deletionsByCollection, authAccountsDeleted, errors = [], auditLogId } = data;

  return {
    success: data.success && errors.length === 0,
    summary: {
      totalDocumentsDeleted: Object.values(deletionsByCollection).reduce((sum, count) => sum + count, 0),
      deletionsByCollection,
      preservedCollections: options.preserveFinancial ? FINANCIAL_COLLECTIONS : [],
      authAccountsDeleted,
    },
    errors,
    auditLogId,
  };
}
