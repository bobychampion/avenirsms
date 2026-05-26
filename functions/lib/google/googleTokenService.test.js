"use strict";
/**
 * Unit tests for Google Token Management Service
 *
 * Tests token storage, clearing, expiration checking, refresh logic, and caching.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const firestore_1 = require("firebase-admin/firestore");
const googleTokenService_1 = require("./googleTokenService");
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
// Mock fetch for token refresh
global.fetch = jest.fn();
describe('googleTokenService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Clear token cache between tests
        (0, googleTokenService_1.clearTokenCache)();
        // Set environment variables
        process.env.GOOGLE_CLIENT_ID = 'test-client-id';
        process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
        // Reset fetch mock
        global.fetch.mockReset();
    });
    describe('storeTokens', () => {
        it('should store tokens at the correct Firestore path', async () => {
            const schoolId = 'school123';
            const tokens = {
                accessToken: 'ya29.test-access-token',
                refreshToken: '1//test-refresh-token',
                expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 3600000),
                scopes: ['openid', 'email', 'profile'],
            };
            await (0, googleTokenService_1.storeTokens)(schoolId, tokens);
            // Verify correct Firestore path
            expect(mockSchoolCollection).toHaveBeenCalledWith('schools');
            expect(mockSchoolDoc).toHaveBeenCalledWith(schoolId);
            expect(mockIntegrationCollection).toHaveBeenCalledWith('integrations');
            expect(mockIntegrationDoc).toHaveBeenCalledWith('google');
            // Verify data structure
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
                tokens: {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresAt: tokens.expiresAt,
                    scopes: tokens.scopes,
                },
                updatedAt: expect.anything(),
            }), { merge: true });
        });
        it('should use merge mode to preserve other fields', async () => {
            const schoolId = 'school456';
            const tokens = {
                accessToken: 'ya29.new-token',
                refreshToken: '1//new-refresh',
                expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 3600000),
                scopes: ['openid'],
            };
            await (0, googleTokenService_1.storeTokens)(schoolId, tokens);
            // Verify merge mode is used
            expect(mockSet).toHaveBeenCalledWith(expect.anything(), { merge: true });
        });
        it('should handle different school IDs independently', async () => {
            const tokens = {
                accessToken: 'ya29.token',
                refreshToken: '1//refresh',
                expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 3600000),
                scopes: ['openid'],
            };
            await (0, googleTokenService_1.storeTokens)('school1', tokens);
            await (0, googleTokenService_1.storeTokens)('school2', tokens);
            // Verify different school IDs were used
            expect(mockSchoolDoc).toHaveBeenCalledWith('school1');
            expect(mockSchoolDoc).toHaveBeenCalledWith('school2');
            expect(mockSet).toHaveBeenCalledTimes(2);
        });
        it('should store all provided scopes', async () => {
            const schoolId = 'school123';
            const tokens = {
                accessToken: 'ya29.token',
                refreshToken: '1//refresh',
                expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 3600000),
                scopes: [
                    'openid',
                    'email',
                    'profile',
                    'https://www.googleapis.com/auth/drive.file',
                    'https://www.googleapis.com/auth/calendar',
                ],
            };
            await (0, googleTokenService_1.storeTokens)(schoolId, tokens);
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
                tokens: expect.objectContaining({
                    scopes: tokens.scopes,
                }),
            }), { merge: true });
        });
    });
    describe('clearTokens', () => {
        it('should clear tokens at the correct Firestore path', async () => {
            const schoolId = 'school123';
            await (0, googleTokenService_1.clearTokens)(schoolId);
            // Verify correct Firestore path
            expect(mockSchoolCollection).toHaveBeenCalledWith('schools');
            expect(mockSchoolDoc).toHaveBeenCalledWith(schoolId);
            expect(mockIntegrationCollection).toHaveBeenCalledWith('integrations');
            expect(mockIntegrationDoc).toHaveBeenCalledWith('google');
            // Verify tokens are cleared
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
                tokens: {
                    accessToken: '',
                    refreshToken: '',
                    expiresAt: expect.anything(),
                    scopes: [],
                },
                updatedAt: expect.anything(),
            }), { merge: true });
        });
        it('should set expiresAt to epoch zero', async () => {
            const schoolId = 'school123';
            await (0, googleTokenService_1.clearTokens)(schoolId);
            const callArgs = mockSet.mock.calls[0][0];
            expect(callArgs.tokens.expiresAt.toMillis()).toBe(0);
        });
        it('should use merge mode to preserve other fields', async () => {
            const schoolId = 'school456';
            await (0, googleTokenService_1.clearTokens)(schoolId);
            // Verify merge mode is used
            expect(mockSet).toHaveBeenCalledWith(expect.anything(), { merge: true });
        });
        it('should handle different school IDs independently', async () => {
            await (0, googleTokenService_1.clearTokens)('school1');
            await (0, googleTokenService_1.clearTokens)('school2');
            // Verify different school IDs were used
            expect(mockSchoolDoc).toHaveBeenCalledWith('school1');
            expect(mockSchoolDoc).toHaveBeenCalledWith('school2');
            expect(mockSet).toHaveBeenCalledTimes(2);
        });
    });
    describe('isTokenExpired', () => {
        it('should return true for expired token', () => {
            const expiredTime = Date.now() - 1000; // 1 second ago
            const expiresAt = firestore_1.Timestamp.fromMillis(expiredTime);
            expect((0, googleTokenService_1.isTokenExpired)(expiresAt)).toBe(true);
        });
        it('should return true for token expiring within 5 minutes', () => {
            const expiringTime = Date.now() + 4 * 60 * 1000; // 4 minutes from now
            const expiresAt = firestore_1.Timestamp.fromMillis(expiringTime);
            expect((0, googleTokenService_1.isTokenExpired)(expiresAt)).toBe(true);
        });
        it('should return true for token expiring exactly at 5 minutes', () => {
            const expiringTime = Date.now() + 5 * 60 * 1000; // Exactly 5 minutes
            const expiresAt = firestore_1.Timestamp.fromMillis(expiringTime);
            expect((0, googleTokenService_1.isTokenExpired)(expiresAt)).toBe(true);
        });
        it('should return false for token expiring after 5 minutes', () => {
            const validTime = Date.now() + 6 * 60 * 1000; // 6 minutes from now
            const expiresAt = firestore_1.Timestamp.fromMillis(validTime);
            expect((0, googleTokenService_1.isTokenExpired)(expiresAt)).toBe(false);
        });
        it('should return false for token expiring in 1 hour', () => {
            const validTime = Date.now() + 60 * 60 * 1000; // 1 hour from now
            const expiresAt = firestore_1.Timestamp.fromMillis(validTime);
            expect((0, googleTokenService_1.isTokenExpired)(expiresAt)).toBe(false);
        });
        it('should handle edge case at exactly 5 minute boundary', () => {
            const boundaryTime = Date.now() + 5 * 60 * 1000; // Exactly 5 minutes
            const expiresAt = firestore_1.Timestamp.fromMillis(boundaryTime);
            // Should be considered expired (within buffer)
            expect((0, googleTokenService_1.isTokenExpired)(expiresAt)).toBe(true);
        });
        it('should handle edge case just after 5 minute boundary', () => {
            const justAfterBoundary = Date.now() + 5 * 60 * 1000 + 1; // 5 minutes + 1ms
            const expiresAt = firestore_1.Timestamp.fromMillis(justAfterBoundary);
            // Should NOT be considered expired (outside buffer)
            expect((0, googleTokenService_1.isTokenExpired)(expiresAt)).toBe(false);
        });
        it('should handle very old expired tokens', () => {
            const veryOldTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
            const expiresAt = firestore_1.Timestamp.fromMillis(veryOldTime);
            expect((0, googleTokenService_1.isTokenExpired)(expiresAt)).toBe(true);
        });
    });
    describe('Token expiration buffer property', () => {
        it('should consistently apply 5-minute buffer', () => {
            const testCases = [
                { offset: 6 * 60 * 1000, expected: false }, // 6 minutes
                { offset: 5 * 60 * 1000 + 1, expected: false }, // 5 min + 1ms
                { offset: 5 * 60 * 1000, expected: true }, // Exactly 5 minutes
                { offset: 4 * 60 * 1000, expected: true }, // 4 minutes
                { offset: 1 * 60 * 1000, expected: true }, // 1 minute
                { offset: 0, expected: true }, // Expired now
                { offset: -1000, expected: true }, // Already expired
            ];
            testCases.forEach(({ offset, expected }) => {
                const expiresAt = firestore_1.Timestamp.fromMillis(Date.now() + offset);
                expect((0, googleTokenService_1.isTokenExpired)(expiresAt)).toBe(expected);
            });
        });
    });
    describe('refreshAccessToken', () => {
        it('should refresh token and update Firestore', async () => {
            const schoolId = 'school123';
            const refreshToken = '1//test-refresh-token';
            const newAccessToken = 'ya29.new-access-token';
            const expiresIn = 3600;
            // Mock Firestore get
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    tokens: {
                        refreshToken,
                    },
                }),
            });
            // Mock fetch response
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    access_token: newAccessToken,
                    expires_in: expiresIn,
                }),
            });
            const result = await (0, googleTokenService_1.refreshAccessToken)(schoolId);
            expect(result.accessToken).toBe(newAccessToken);
            expect(result.expiresAt.toMillis()).toBeGreaterThan(Date.now());
            // Verify fetch was called with correct parameters
            expect(global.fetch).toHaveBeenCalledWith('https://oauth2.googleapis.com/token', expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }));
            // Verify Firestore was updated
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
                tokens: {
                    accessToken: newAccessToken,
                    expiresAt: expect.anything(),
                },
            }), { merge: true });
        });
        it('should throw error if integration does not exist', async () => {
            const schoolId = 'nonexistent-school';
            mockGet.mockResolvedValue({
                exists: false,
            });
            await expect((0, googleTokenService_1.refreshAccessToken)(schoolId)).rejects.toThrow('No Google integration found for school nonexistent-school');
        });
        it('should throw error if refresh token is missing', async () => {
            const schoolId = 'school123';
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    tokens: {},
                }),
            });
            await expect((0, googleTokenService_1.refreshAccessToken)(schoolId)).rejects.toThrow('No refresh token found for school school123');
        });
        it('should retry on failure with exponential backoff', async () => {
            const schoolId = 'school123';
            const refreshToken = '1//test-refresh-token';
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    tokens: {
                        refreshToken,
                    },
                }),
            });
            // Mock fetch to fail twice, then succeed
            global.fetch
                .mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            })
                .mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            })
                .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: 'ya29.new-token',
                    expires_in: 3600,
                }),
            });
            const result = await (0, googleTokenService_1.refreshAccessToken)(schoolId);
            expect(result.accessToken).toBe('ya29.new-token');
            expect(global.fetch).toHaveBeenCalledTimes(3);
        });
        it('should throw error after max retries', async () => {
            const schoolId = 'school123';
            const refreshToken = '1//test-refresh-token';
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    tokens: {
                        refreshToken,
                    },
                }),
            });
            // Mock fetch to always fail
            global.fetch.mockResolvedValue({
                ok: false,
                status: 401,
                text: async () => 'Invalid refresh token',
            });
            await expect((0, googleTokenService_1.refreshAccessToken)(schoolId)).rejects.toThrow('Token refresh failed after 3 attempts');
            expect(global.fetch).toHaveBeenCalledTimes(3);
        });
        it('should throw error if environment variables are missing', async () => {
            const schoolId = 'school123';
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    tokens: {
                        refreshToken: '1//test-refresh-token',
                    },
                }),
            });
            delete process.env.GOOGLE_CLIENT_ID;
            await expect((0, googleTokenService_1.refreshAccessToken)(schoolId)).rejects.toThrow('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variable is not set');
        });
    });
    describe('getValidAccessToken', () => {
        it('should return cached token if valid', async () => {
            const schoolId = 'school123';
            const accessToken = 'ya29.cached-token';
            const expiresAt = firestore_1.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000); // 1 hour from now
            // First call to populate cache
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    tokens: {
                        accessToken,
                        expiresAt,
                        refreshToken: '1//refresh',
                    },
                }),
            });
            const result1 = await (0, googleTokenService_1.getValidAccessToken)(schoolId);
            expect(result1).toBe(accessToken);
            // Second call should use cache
            const result2 = await (0, googleTokenService_1.getValidAccessToken)(schoolId);
            expect(result2).toBe(accessToken);
            // Firestore should only be called once
            expect(mockGet).toHaveBeenCalledTimes(1);
        });
        it('should refresh token if expired', async () => {
            const schoolId = 'school123';
            const oldAccessToken = 'ya29.old-token';
            const newAccessToken = 'ya29.new-token';
            const expiredAt = firestore_1.Timestamp.fromMillis(Date.now() - 1000); // Expired
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    tokens: {
                        accessToken: oldAccessToken,
                        expiresAt: expiredAt,
                        refreshToken: '1//refresh',
                    },
                }),
            });
            // Mock fetch for refresh
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    access_token: newAccessToken,
                    expires_in: 3600,
                }),
            });
            const result = await (0, googleTokenService_1.getValidAccessToken)(schoolId);
            expect(result).toBe(newAccessToken);
            expect(global.fetch).toHaveBeenCalled();
        });
        it('should refresh token if expiring within 5 minutes', async () => {
            const schoolId = 'school123';
            const oldAccessToken = 'ya29.old-token';
            const newAccessToken = 'ya29.new-token';
            const expiringAt = firestore_1.Timestamp.fromMillis(Date.now() + 4 * 60 * 1000); // 4 minutes
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    tokens: {
                        accessToken: oldAccessToken,
                        expiresAt: expiringAt,
                        refreshToken: '1//refresh',
                    },
                }),
            });
            // Mock fetch for refresh
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    access_token: newAccessToken,
                    expires_in: 3600,
                }),
            });
            const result = await (0, googleTokenService_1.getValidAccessToken)(schoolId);
            expect(result).toBe(newAccessToken);
            expect(global.fetch).toHaveBeenCalled();
        });
        it('should prevent concurrent refresh requests with mutex', async () => {
            const schoolId = 'school123';
            const accessToken = 'ya29.new-token';
            const expiredAt = firestore_1.Timestamp.fromMillis(Date.now() - 1000); // Expired
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    tokens: {
                        accessToken: 'ya29.old-token',
                        expiresAt: expiredAt,
                        refreshToken: '1//refresh',
                    },
                }),
            });
            // Mock fetch with delay to simulate slow refresh
            global.fetch.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({
                ok: true,
                json: async () => ({
                    access_token: accessToken,
                    expires_in: 3600,
                }),
            }), 100)));
            // Make multiple concurrent calls
            const promises = [
                (0, googleTokenService_1.getValidAccessToken)(schoolId),
                (0, googleTokenService_1.getValidAccessToken)(schoolId),
                (0, googleTokenService_1.getValidAccessToken)(schoolId),
            ];
            const results = await Promise.all(promises);
            // All should return the same token
            expect(results).toEqual([accessToken, accessToken, accessToken]);
            // Fetch should only be called once (mutex prevents concurrent refreshes)
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
        it('should throw error if integration does not exist', async () => {
            const schoolId = 'nonexistent-school';
            mockGet.mockResolvedValue({
                exists: false,
            });
            await expect((0, googleTokenService_1.getValidAccessToken)(schoolId)).rejects.toThrow('No Google integration found for school nonexistent-school');
        });
        it('should throw error if access token is missing', async () => {
            const schoolId = 'school123';
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    tokens: {},
                }),
            });
            await expect((0, googleTokenService_1.getValidAccessToken)(schoolId)).rejects.toThrow('No access token found for school school123');
        });
        it('should handle different schools independently', async () => {
            const school1 = 'school1';
            const school2 = 'school2';
            const token1 = 'ya29.token1';
            const token2 = 'ya29.token2';
            mockGet
                .mockResolvedValueOnce({
                exists: true,
                data: () => ({
                    tokens: {
                        accessToken: token1,
                        expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
                        refreshToken: '1//refresh1',
                    },
                }),
            })
                .mockResolvedValueOnce({
                exists: true,
                data: () => ({
                    tokens: {
                        accessToken: token2,
                        expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
                        refreshToken: '1//refresh2',
                    },
                }),
            });
            const result1 = await (0, googleTokenService_1.getValidAccessToken)(school1);
            const result2 = await (0, googleTokenService_1.getValidAccessToken)(school2);
            expect(result1).toBe(token1);
            expect(result2).toBe(token2);
        });
    });
});
//# sourceMappingURL=googleTokenService.test.js.map