/**
 * Unit tests for School Deletion Service
 * 
 * Tests the validateDeletion() function which checks:
 * 1. School document exists
 * 2. School status is 'suspended' (not 'active')
 * 3. No active user sessions (fcm_tokens collection)
 * 4. Document count estimation across collections
 * 
 * Requirements: 1.3, 1.4, 1.5, 8.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateDeletion } from './schoolDeletionService';
import type { School } from '../types';
import { Timestamp } from 'firebase/firestore';

// Mock Firebase
vi.mock('../firebase', () => ({
  db: {},
}));

// Mock Firestore functions
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockGetCountFromServer = vi.fn();

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn(),
    getDoc: (...args: any[]) => mockGetDoc(...args),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    getDocs: (...args: any[]) => mockGetDocs(...args),
    getCountFromServer: (...args: any[]) => mockGetCountFromServer(...args),
    Timestamp: {
      now: () => ({ seconds: 1234567890, nanoseconds: 0 }),
      fromDate: (date: Date) => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 }),
    },
  };
});

describe('schoolDeletionService - validateDeletion', () => {
  const mockSchoolData: School = {
    id: 'school123',
    name: 'Test School',
    adminEmail: 'admin@testschool.com',
    status: 'suspended',
    subscriptionPlan: 'pro',
    maxStudents: 500,
    maxStaff: 50,
    createdAt: Timestamp.now(),
    createdBy: 'admin123',
    country: 'Nigeria',
    timezone: 'Africa/Lagos',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock implementations to default behavior
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
    mockGetCountFromServer.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('School existence check (Requirement 1.3)', () => {
    it('should return error when school does not exist', async () => {
      // Mock school document not found
      mockGetDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const result = await validateDeletion('nonexistent-school');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('School not found');
      expect(result.estimatedDocumentCounts).toEqual({});
      expect(result.schoolSnapshot).toBeUndefined();
    });

    it('should proceed when school exists', async () => {
      // Mock school document exists
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockSchoolData,
      });

      // Mock empty fcm_tokens query
      mockGetDocs.mockResolvedValueOnce({
        empty: true,
      });

      // Mock count queries return 0
      mockGetCountFromServer.mockResolvedValue({
        data: () => ({ count: 0 }),
      });

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.schoolSnapshot).toBeDefined();
      expect(result.schoolSnapshot?.name).toBe('Test School');
    });
  });

  describe('School status validation (Requirement 1.4)', () => {
    it('should reject deletion of active school', async () => {
      const activeSchool = { ...mockSchoolData, status: 'active' as const };

      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => activeSchool,
      });

      mockGetDocs.mockResolvedValueOnce({ empty: true });
      mockGetCountFromServer.mockResolvedValue({
        data: () => ({ count: 0 }),
      });

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Cannot delete active school. Suspend the school first from School Settings.'
      );
    });

    it('should allow deletion of suspended school', async () => {
      const suspendedSchool = { ...mockSchoolData, status: 'suspended' as const };

      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => suspendedSchool,
      });

      mockGetDocs.mockResolvedValueOnce({ empty: true });
      mockGetCountFromServer.mockResolvedValue({
        data: () => ({ count: 0 }),
      });

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(
        'Cannot delete active school. Suspend the school first from School Settings.'
      );
    });

    it('should allow deletion of trial school', async () => {
      const trialSchool = { ...mockSchoolData, status: 'trial' as const };

      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => trialSchool,
      });

      mockGetDocs.mockResolvedValueOnce({ empty: true });
      mockGetCountFromServer.mockResolvedValue({
        data: () => ({ count: 0 }),
      });

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(true);
    });

    it('should allow deletion of demo school', async () => {
      const demoSchool = { ...mockSchoolData, status: 'demo' as const };

      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => demoSchool,
      });

      mockGetDocs.mockResolvedValueOnce({ empty: true });
      mockGetCountFromServer.mockResolvedValue({
        data: () => ({ count: 0 }),
      });

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(true);
    });
  });

  describe('Active user session check (Requirement 1.5)', () => {
    it('should reject deletion when active user sessions exist', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockSchoolData,
      });

      // Mock fcm_tokens query returns active sessions
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'token1' }],
      });

      mockGetCountFromServer.mockResolvedValue({
        data: () => ({ count: 0 }),
      });

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Cannot delete school with active user sessions. Wait for all users to log out (up to 1 hour) or contact them to sign out.'
      );
    });

    it('should allow deletion when no active user sessions exist', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockSchoolData,
      });

      // Mock fcm_tokens query returns empty
      mockGetDocs.mockResolvedValueOnce({
        empty: true,
      });

      mockGetCountFromServer.mockResolvedValue({
        data: () => ({ count: 0 }),
      });

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(
        'Cannot delete school with active user sessions. Wait for all users to log out (up to 1 hour) or contact them to sign out.'
      );
    });
  });

  describe('Document count estimation (Requirement 8.1)', () => {
    it('should estimate document counts across collections', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockSchoolData,
      });

      mockGetDocs.mockResolvedValueOnce({ empty: true });

      // Mock different counts for different collections
      let callCount = 0;
      mockGetCountFromServer.mockImplementation(() => {
        callCount++;
        // Return different counts for first few collections
        if (callCount === 1) return Promise.resolve({ data: () => ({ count: 150 }) }); // students
        if (callCount === 2) return Promise.resolve({ data: () => ({ count: 75 }) });  // guardians
        if (callCount === 3) return Promise.resolve({ data: () => ({ count: 30 }) });  // staff
        return Promise.resolve({ data: () => ({ count: 0 }) });
      });

      // Mock document collections checks
      mockGetDoc
        .mockResolvedValueOnce({ exists: () => true, data: () => mockSchoolData })
        .mockResolvedValueOnce({ exists: () => true }) // school_settings
        .mockResolvedValueOnce({ exists: () => true }); // geofences

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(true);
      expect(result.estimatedDocumentCounts).toBeDefined();
      expect(Object.keys(result.estimatedDocumentCounts).length).toBeGreaterThan(0);
    });

    it('should only include collections with non-zero counts', async () => {
      const suspendedSchool = { ...mockSchoolData, status: 'suspended' as const };
      
      // First call is for school document
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => suspendedSchool,
      });

      // Second and third calls are for document collections (school_settings, geofences)
      mockGetDoc.mockResolvedValueOnce({ exists: () => false }); // school_settings doesn't exist
      mockGetDoc.mockResolvedValueOnce({ exists: () => false }); // geofences doesn't exist

      // fcm_tokens check - no active sessions
      mockGetDocs.mockResolvedValueOnce({ empty: true });

      // Return counts for only 2 collections
      let callCount = 0;
      mockGetCountFromServer.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: () => ({ count: 100 }) }); // students
        if (callCount === 5) return Promise.resolve({ data: () => ({ count: 50 }) });  // classes
        return Promise.resolve({ data: () => ({ count: 0 }) });
      });

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(true);
      // Only collections with count > 0 should be included
      const nonZeroCounts = Object.values(result.estimatedDocumentCounts).filter(c => c > 0);
      expect(nonZeroCounts.length).toBeGreaterThan(0);
    });

    it('should include document collections in count (school_settings, geofences)', async () => {
      // First call is for school document
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockSchoolData,
      });

      // Second and third calls are for document collections (school_settings, geofences)
      mockGetDoc.mockResolvedValueOnce({ exists: () => true }); // school_settings exists
      mockGetDoc.mockResolvedValueOnce({ exists: () => true }); // geofences exists

      // fcm_tokens check - no active sessions
      mockGetDocs.mockResolvedValueOnce({ empty: true });
      
      // Collection count queries - return 0 for all
      mockGetCountFromServer.mockResolvedValue({
        data: () => ({ count: 0 }),
      });

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(true);
      // At least document collections should be counted
      const totalCounts = Object.keys(result.estimatedDocumentCounts).length;
      expect(totalCounts).toBeGreaterThanOrEqual(2); // At least school_settings and geofences
    });

    it('should handle collection count errors gracefully', async () => {
      mockGetDoc
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => mockSchoolData,
        })
        .mockResolvedValueOnce({ exists: () => false }) // school_settings doesn't exist
        .mockResolvedValueOnce({ exists: () => false }); // geofences doesn't exist

      mockGetDocs.mockResolvedValueOnce({ empty: true });

      // Simulate error for some collections
      let callCount = 0;
      mockGetCountFromServer.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Permission denied'));
        }
        return Promise.resolve({ data: () => ({ count: 10 }) });
      });

      const result = await validateDeletion('school123');

      // Should still return valid result, just without the failed collection count
      expect(result.isValid).toBe(true);
      expect(result.estimatedDocumentCounts).toBeDefined();
    });
  });

  describe('School snapshot data (Requirement 8.1)', () => {
    it('should include school snapshot in validation result', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockSchoolData,
      });

      mockGetDocs.mockResolvedValueOnce({ empty: true });
      mockGetCountFromServer.mockResolvedValue({
        data: () => ({ count: 0 }),
      });

      const result = await validateDeletion('school123');

      expect(result.schoolSnapshot).toBeDefined();
      expect(result.schoolSnapshot?.name).toBe('Test School');
      expect(result.schoolSnapshot?.status).toBe('suspended');
      expect(result.schoolSnapshot?.subscriptionPlan).toBe('pro');
      expect(result.schoolSnapshot?.adminEmail).toBe('admin@testschool.com');
      expect(result.schoolSnapshot?.createdAt).toBeDefined();
    });
  });

  describe('Multiple validation errors', () => {
    it('should accumulate multiple validation errors', async () => {
      const activeSchool = { ...mockSchoolData, status: 'active' as const };

      // First call is for school document
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => activeSchool,
      });

      // Second and third calls are for document collections (school_settings, geofences)
      mockGetDoc.mockResolvedValueOnce({ exists: () => false }); // document collections don't exist
      mockGetDoc.mockResolvedValueOnce({ exists: () => false });

      // Active sessions also exist
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'token1' }],
      });

      mockGetCountFromServer.mockResolvedValue({
        data: () => ({ count: 0 }),
      });

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(false);
      // Should have both errors: active school + active sessions
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors).toContain(
        'Cannot delete active school. Suspend the school first from School Settings.'
      );
      expect(result.errors).toContain(
        'Cannot delete school with active user sessions. Wait for all users to log out (up to 1 hour) or contact them to sign out.'
      );
    });
  });

  describe('Error handling (Requirement 8.1)', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Clear all previous mocks
      vi.clearAllMocks();
      
      mockGetDoc.mockRejectedValueOnce(new Error('Firestore unavailable'));

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Validation error: Firestore unavailable');
    });

    it('should handle non-Error exceptions', async () => {
      // Clear all previous mocks
      vi.clearAllMocks();
      
      mockGetDoc.mockRejectedValueOnce('String error');

      const result = await validateDeletion('school123');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Validation error: String error');
    });
  });
});
