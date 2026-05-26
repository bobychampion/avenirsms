"use strict";
/**
 * Unit tests for Google Connection Verification Service
 *
 * Tests verification orchestration, service status updates, and individual service verification.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const googleVerificationService_1 = require("./googleVerificationService");
const googleTokenService = __importStar(require("./googleTokenService"));
// Mock Firestore
const mockSet = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn();
const mockIntegrationDoc = jest.fn(() => ({
    set: mockSet,
    get: mockGet,
}));
const mockIntegrationCollection = jest.fn(() => ({
    doc: mockIntegrationDoc,
}));
const mockSchoolDoc = jest.fn(() => ({
    collection: mockIntegrationCollection,
}));
const mockSchoolCollection = jest.fn(() => ({
    doc: mockSchoolDoc,
}));
jest.mock('firebase-admin/firestore', () => ({
    getFirestore: jest.fn(() => ({
        collection: mockSchoolCollection,
    })),
    Timestamp: {
        now: jest.fn(() => ({ toMillis: () => Date.now() })),
        fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
    },
}));
// Mock googleTokenService
jest.mock('./googleTokenService');
// Mock fetch for API calls
global.fetch = jest.fn();
describe('googleVerificationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset fetch mock
        global.fetch.mockReset();
        // Mock getValidAccessToken to return a test token
        googleTokenService.getValidAccessToken.mockResolvedValue('ya29.test-access-token');
    });
    describe('updateServiceStatus', () => {
        it('should update status to connected on success', async () => {
            const schoolId = 'school123';
            const service = 'drive';
            const result = { success: true };
            await (0, googleVerificationService_1.updateServiceStatus)(schoolId, service, result);
            // Verify correct Firestore path
            expect(mockSchoolCollection).toHaveBeenCalledWith('schools');
            expect(mockSchoolDoc).toHaveBeenCalledWith(schoolId);
            expect(mockIntegrationCollection).toHaveBeenCalledWith('integrations');
            expect(mockIntegrationDoc).toHaveBeenCalledWith('google');
            // Verify status update
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
                'status.drive': 'connected',
                'errors.drive': null,
                updatedAt: expect.anything(),
            }), { merge: true });
        });
        it('should update status to error on failure', async () => {
            const schoolId = 'school123';
            const service = 'calendar';
            const result = {
                success: false,
                error: 'Calendar API call failed: 403 Forbidden',
            };
            await (0, googleVerificationService_1.updateServiceStatus)(schoolId, service, result);
            // Verify status update
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
                'status.calendar': 'error',
                'errors.calendar': 'Calendar API call failed: 403 Forbidden',
                updatedAt: expect.anything(),
            }), { merge: true });
        });
        it('should clear error message on success', async () => {
            const schoolId = 'school123';
            const service = 'classroom';
            const result = { success: true };
            await (0, googleVerificationService_1.updateServiceStatus)(schoolId, service, result);
            // Verify error is cleared
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
                'status.classroom': 'connected',
                'errors.classroom': null,
            }), { merge: true });
        });
        it('should handle different services independently', async () => {
            const schoolId = 'school123';
            await (0, googleVerificationService_1.updateServiceStatus)(schoolId, 'drive', { success: true });
            await (0, googleVerificationService_1.updateServiceStatus)(schoolId, 'calendar', { success: false, error: 'Error' });
            expect(mockSet).toHaveBeenCalledTimes(2);
            expect(mockSet).toHaveBeenNthCalledWith(1, expect.objectContaining({ 'status.drive': 'connected' }), { merge: true });
            expect(mockSet).toHaveBeenNthCalledWith(2, expect.objectContaining({ 'status.calendar': 'error' }), { merge: true });
        });
        it('should use merge mode to preserve other fields', async () => {
            const schoolId = 'school123';
            const service = 'gmail';
            const result = { success: true };
            await (0, googleVerificationService_1.updateServiceStatus)(schoolId, service, result);
            // Verify merge mode is used
            expect(mockSet).toHaveBeenCalledWith(expect.anything(), { merge: true });
        });
    });
    describe('verifyConnection', () => {
        it('should verify all enabled services', async () => {
            const schoolId = 'school123';
            // Mock integration document with all services enabled
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    enabledServices: {
                        drive: true,
                        calendar: true,
                        classroom: true,
                        gmail: true,
                    },
                }),
            });
            // Mock successful API responses
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({}),
            });
            const result = await (0, googleVerificationService_1.verifyConnection)(schoolId);
            // Verify all services were tested
            expect(result.success).toBe(true);
            expect(result.results.drive).toEqual({ success: true });
            expect(result.results.calendar).toEqual({ success: true });
            expect(result.results.classroom).toEqual({ success: true });
            expect(result.results.gmail).toEqual({ success: true });
            // Verify status updates were called for each service
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ 'status.drive': 'connected' }), { merge: true });
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ 'status.calendar': 'connected' }), { merge: true });
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ 'status.classroom': 'connected' }), { merge: true });
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ 'status.gmail': 'connected' }), { merge: true });
            // Verify lastVerifiedAt was updated
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
                lastVerifiedAt: expect.anything(),
                updatedAt: expect.anything(),
            }), { merge: true });
        });
        it('should skip disabled services', async () => {
            const schoolId = 'school123';
            // Mock integration document with only drive enabled
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    enabledServices: {
                        drive: true,
                        calendar: false,
                        classroom: false,
                        gmail: false,
                    },
                }),
            });
            // Mock successful API response
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({}),
            });
            const result = await (0, googleVerificationService_1.verifyConnection)(schoolId);
            // Verify only drive was tested
            expect(result.results.drive).toBeDefined();
            expect(result.results.calendar).toBeUndefined();
            expect(result.results.classroom).toBeUndefined();
            expect(result.results.gmail).toBeUndefined();
            // Verify fetch was only called once (for drive)
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
        it('should return success false if any service fails', async () => {
            const schoolId = 'school123';
            // Mock integration document with two services enabled
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    enabledServices: {
                        drive: true,
                        calendar: true,
                        classroom: false,
                        gmail: false,
                    },
                }),
            });
            // Mock drive success, calendar failure
            global.fetch
                .mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            })
                .mockResolvedValueOnce({
                ok: false,
                status: 403,
                text: async () => 'Forbidden',
            });
            const result = await (0, googleVerificationService_1.verifyConnection)(schoolId);
            // Verify overall success is false
            expect(result.success).toBe(false);
            expect(result.results.drive?.success).toBe(true);
            expect(result.results.calendar?.success).toBe(false);
        });
        it('should update lastVerifiedAt timestamp', async () => {
            const schoolId = 'school123';
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    enabledServices: {
                        drive: true,
                    },
                }),
            });
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({}),
            });
            await (0, googleVerificationService_1.verifyConnection)(schoolId);
            // Verify lastVerifiedAt was updated
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
                lastVerifiedAt: expect.anything(),
                updatedAt: expect.anything(),
            }), { merge: true });
        });
        it('should throw error if integration does not exist', async () => {
            const schoolId = 'nonexistent-school';
            mockGet.mockResolvedValue({
                exists: false,
            });
            await expect((0, googleVerificationService_1.verifyConnection)(schoolId)).rejects.toThrow('No Google integration found for school nonexistent-school');
        });
        it('should handle empty enabledServices object', async () => {
            const schoolId = 'school123';
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    enabledServices: {},
                }),
            });
            const result = await (0, googleVerificationService_1.verifyConnection)(schoolId);
            // Verify no services were tested
            expect(result.results).toEqual({});
            expect(result.success).toBe(true); // No services to fail
            // Verify lastVerifiedAt was still updated
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
                lastVerifiedAt: expect.anything(),
            }), { merge: true });
        });
        it('should handle missing enabledServices field', async () => {
            const schoolId = 'school123';
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({}),
            });
            const result = await (0, googleVerificationService_1.verifyConnection)(schoolId);
            // Verify no services were tested
            expect(result.results).toEqual({});
            expect(result.success).toBe(true);
        });
    });
    describe('verifyDrive', () => {
        it('should return success when API call succeeds', async () => {
            const schoolId = 'school123';
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({ files: [] }),
            });
            const result = await (0, googleVerificationService_1.verifyDrive)(schoolId);
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            // Verify correct API endpoint was called
            expect(global.fetch).toHaveBeenCalledWith('https://www.googleapis.com/drive/v3/files?pageSize=1', expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer ya29.test-access-token',
                }),
            }));
        });
        it('should return error when API call fails', async () => {
            const schoolId = 'school123';
            global.fetch.mockResolvedValue({
                ok: false,
                status: 403,
                text: async () => 'Insufficient permissions',
            });
            const result = await (0, googleVerificationService_1.verifyDrive)(schoolId);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Drive API call failed: 403');
        });
        it('should handle network errors', async () => {
            const schoolId = 'school123';
            global.fetch.mockRejectedValue(new Error('Network error'));
            const result = await (0, googleVerificationService_1.verifyDrive)(schoolId);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Network error');
        });
    });
    describe('verifyCalendar', () => {
        it('should return success when API call succeeds', async () => {
            const schoolId = 'school123';
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({ items: [] }),
            });
            const result = await (0, googleVerificationService_1.verifyCalendar)(schoolId);
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            // Verify correct API endpoint was called
            expect(global.fetch).toHaveBeenCalledWith('https://www.googleapis.com/calendar/v3/users/me/calendarList', expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer ya29.test-access-token',
                }),
            }));
        });
        it('should return error when API call fails', async () => {
            const schoolId = 'school123';
            global.fetch.mockResolvedValue({
                ok: false,
                status: 401,
                text: async () => 'Unauthorized',
            });
            const result = await (0, googleVerificationService_1.verifyCalendar)(schoolId);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Calendar API call failed: 401');
        });
    });
    describe('verifyClassroom', () => {
        it('should return success when API call succeeds', async () => {
            const schoolId = 'school123';
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({ courses: [] }),
            });
            const result = await (0, googleVerificationService_1.verifyClassroom)(schoolId);
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            // Verify correct API endpoint was called
            expect(global.fetch).toHaveBeenCalledWith('https://classroom.googleapis.com/v1/courses?pageSize=1', expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer ya29.test-access-token',
                }),
            }));
        });
        it('should return error when API call fails', async () => {
            const schoolId = 'school123';
            global.fetch.mockResolvedValue({
                ok: false,
                status: 404,
                text: async () => 'Not found',
            });
            const result = await (0, googleVerificationService_1.verifyClassroom)(schoolId);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Classroom API call failed: 404');
        });
    });
    describe('verifyGmail', () => {
        it('should return success when API call succeeds', async () => {
            const schoolId = 'school123';
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({ emailAddress: 'test@example.com' }),
            });
            const result = await (0, googleVerificationService_1.verifyGmail)(schoolId);
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            // Verify correct API endpoint was called
            expect(global.fetch).toHaveBeenCalledWith('https://gmail.googleapis.com/gmail/v1/users/me/profile', expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer ya29.test-access-token',
                }),
            }));
        });
        it('should return error when API call fails', async () => {
            const schoolId = 'school123';
            global.fetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'Internal server error',
            });
            const result = await (0, googleVerificationService_1.verifyGmail)(schoolId);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Gmail API call failed: 500');
        });
    });
});
//# sourceMappingURL=googleVerificationService.test.js.map