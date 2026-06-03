"use strict";
/**
 * Unit tests for Cloud Functions
 *
 * Tests the connectGoogleWorkspace callable function.
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
const firestore_1 = require("firebase-admin/firestore");
const index_1 = require("./index");
const googleAuthService = __importStar(require("./google/googleAuthService"));
const googleTokenService = __importStar(require("./google/googleTokenService"));
const googleVerificationService = __importStar(require("./google/googleVerificationService"));
// Mock Firebase Admin
jest.mock('firebase-admin/app', () => ({
    initializeApp: jest.fn(),
}));
jest.mock('firebase-admin/auth', () => ({
    getAuth: jest.fn(),
}));
jest.mock('firebase-admin/firestore', () => ({
    getFirestore: jest.fn(),
    Timestamp: {
        now: jest.fn(() => ({ toMillis: () => Date.now() })),
        fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
    },
}));
// Mock Google services
jest.mock('./google/googleAuthService');
jest.mock('./google/googleTokenService');
jest.mock('./google/googleVerificationService');
describe('connectGoogleWorkspaceHandler', () => {
    let mockDb;
    let mockAuthUid;
    let mockRequestData;
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        // Mock Firestore
        mockDb = {
            doc: jest.fn().mockReturnThis(),
            collection: jest.fn().mockReturnThis(),
            get: jest.fn(),
            set: jest.fn(),
            add: jest.fn(),
        };
        const { getFirestore } = require('firebase-admin/firestore');
        getFirestore.mockReturnValue(mockDb);
        // Mock Auth UID
        mockAuthUid = 'admin-user-123';
        // Mock request data
        mockRequestData = {
            code: 'test-auth-code',
            state: 'valid-base64-state',
            redirectUri: 'https://example.com/callback',
        };
        // Mock parseState
        googleAuthService.parseState.mockReturnValue({
            schoolId: 'school123',
            nonce: '550e8400-e29b-41d4-a716-446655440000',
            timestamp: Date.now(),
        });
        // Mock validateState
        googleAuthService.validateState.mockReturnValue(true);
        // Mock exchangeCodeForTokens
        googleAuthService.exchangeCodeForTokens.mockResolvedValue({
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
            expiresIn: 3600,
            scopes: ['openid', 'email', 'profile'],
        });
        // Mock storeTokens
        googleTokenService.storeTokens.mockResolvedValue(undefined);
        // Mock verifyConnection
        googleVerificationService.verifyConnection.mockResolvedValue({
            success: true,
            results: {},
        });
        // Mock user document
        mockDb.doc.mockImplementation((path) => {
            if (path === 'users/admin-user-123') {
                return {
                    get: jest.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({
                            role: 'School_admin',
                            schoolId: 'school123',
                            email: 'admin@school.com',
                        }),
                    }),
                };
            }
            return mockDb;
        });
        // Mock integration document set
        mockDb.set.mockResolvedValue(undefined);
        mockDb.add.mockResolvedValue({ id: 'audit-log-123' });
    });
    describe('Request Validation', () => {
        it('should require code parameter', async () => {
            const invalidData = {
                state: 'valid-state',
                redirectUri: 'https://example.com/callback',
            };
            await expect((0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, invalidData)).rejects.toThrow('code, state, and redirectUri are required');
        });
        it('should require state parameter', async () => {
            const invalidData = {
                code: 'test-code',
                redirectUri: 'https://example.com/callback',
            };
            await expect((0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, invalidData)).rejects.toThrow('code, state, and redirectUri are required');
        });
        it('should require redirectUri parameter', async () => {
            const invalidData = {
                code: 'test-code',
                state: 'valid-state',
            };
            await expect((0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, invalidData)).rejects.toThrow('code, state, and redirectUri are required');
        });
    });
    describe('OAuth State Validation', () => {
        it('should reject invalid OAuth state', async () => {
            googleAuthService.parseState.mockImplementation(() => {
                throw new Error('Invalid base64');
            });
            await expect((0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData)).rejects.toThrow('Invalid OAuth state');
        });
        it('should reject expired OAuth state', async () => {
            googleAuthService.validateState.mockReturnValue(false);
            await expect((0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData)).rejects.toThrow('OAuth state is expired or invalid');
        });
    });
    describe('Authorization', () => {
        it('should require School Admin role for target school', async () => {
            // Mock user with different schoolId
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                role: 'School_admin',
                                schoolId: 'different-school',
                                email: 'admin@school.com',
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            await expect((0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData)).rejects.toThrow('Only School Admins can connect Google Workspace for their school');
        });
        it('should allow super_admin to connect any school', async () => {
            // Mock super admin user
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                role: 'super_admin',
                                email: 'superadmin@avenir.com',
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            const result = await (0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData);
            expect(result.success).toBe(true);
        });
        it('should reject if user profile not found', async () => {
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: false,
                            data: () => undefined,
                        }),
                    };
                }
                return mockDb;
            });
            await expect((0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData)).rejects.toThrow('User profile not found');
        });
    });
    describe('Token Exchange and Storage', () => {
        it('should exchange code for tokens', async () => {
            await (0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData);
            expect(googleAuthService.exchangeCodeForTokens).toHaveBeenCalledWith('test-auth-code', 'https://example.com/callback');
        });
        it('should store tokens with correct expiration', async () => {
            await (0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData);
            expect(googleTokenService.storeTokens).toHaveBeenCalledWith('school123', expect.objectContaining({
                accessToken: 'test-access-token',
                refreshToken: 'test-refresh-token',
                scopes: ['openid', 'email', 'profile'],
            }));
        });
        it('should handle token exchange failure', async () => {
            googleAuthService.exchangeCodeForTokens.mockRejectedValue(new Error('Token exchange failed'));
            await expect((0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData)).rejects.toThrow('Failed to connect Google Workspace');
        });
    });
    describe('Integration Document', () => {
        it('should create integration document with correct metadata', async () => {
            await (0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData);
            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
                connected: true,
                connectedBy: 'admin-user-123',
                adminEmail: 'admin@school.com',
                workspaceDomain: 'school.com',
            }), { merge: true });
        });
        it('should extract workspace domain from admin email', async () => {
            const result = await (0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData);
            expect(result.integration?.workspaceDomain).toBe('school.com');
        });
        it('should handle missing admin email gracefully', async () => {
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                role: 'School_admin',
                                schoolId: 'school123',
                                // No email field
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            const result = await (0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData);
            expect(result.integration?.adminEmail).toBe('');
            expect(result.integration?.workspaceDomain).toBe('');
        });
    });
    describe('Verification and Audit', () => {
        it('should trigger initial verification', async () => {
            await (0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData);
            // Wait a bit for async verification call
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(googleVerificationService.verifyConnection).toHaveBeenCalledWith('school123');
        });
        it('should write audit log entry', async () => {
            await (0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData);
            expect(mockDb.add).toHaveBeenCalledWith(expect.objectContaining({
                schoolId: 'school123',
                actorId: 'admin-user-123',
                action: 'google.connected',
                details: expect.objectContaining({
                    adminEmail: 'admin@school.com',
                    workspaceDomain: 'school.com',
                    scopes: ['openid', 'email', 'profile'],
                }),
            }));
        });
        it('should not fail if verification fails', async () => {
            googleVerificationService.verifyConnection.mockRejectedValue(new Error('Verification failed'));
            // Should still succeed even if verification fails
            const result = await (0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData);
            expect(result.success).toBe(true);
        });
    });
    describe('Response', () => {
        it('should return success response with integration data', async () => {
            const result = await (0, index_1.connectGoogleWorkspaceHandler)(mockAuthUid, mockRequestData);
            expect(result).toEqual({
                success: true,
                integration: expect.objectContaining({
                    connected: true,
                    adminEmail: 'admin@school.com',
                    workspaceDomain: 'school.com',
                }),
            });
        });
    });
});
describe('refreshGoogleTokenHandler', () => {
    let mockDb;
    let mockAuthUid;
    let mockRequestData;
    // Import the handler
    const { refreshGoogleTokenHandler } = require('./index');
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        // Mock Firestore
        mockDb = {
            doc: jest.fn().mockReturnThis(),
            collection: jest.fn().mockReturnThis(),
            get: jest.fn(),
            set: jest.fn(),
            add: jest.fn(),
        };
        const { getFirestore } = require('firebase-admin/firestore');
        getFirestore.mockReturnValue(mockDb);
        // Mock Auth UID
        mockAuthUid = 'admin-user-123';
        // Mock request data
        mockRequestData = {
            schoolId: 'school123',
        };
        // Mock getValidAccessToken
        googleTokenService.getValidAccessToken.mockResolvedValue('new-access-token');
        // Mock user document
        mockDb.doc.mockImplementation((path) => {
            if (path === 'users/admin-user-123') {
                return {
                    get: jest.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({
                            role: 'School_admin',
                            schoolId: 'school123',
                            email: 'admin@school.com',
                        }),
                    }),
                };
            }
            return mockDb;
        });
        // Mock integration document
        mockDb.collection.mockImplementation((collectionPath) => {
            if (collectionPath === 'schools') {
                return {
                    doc: jest.fn().mockReturnValue({
                        collection: jest.fn().mockReturnValue({
                            doc: jest.fn().mockReturnValue({
                                get: jest.fn().mockResolvedValue({
                                    exists: true,
                                    data: () => ({
                                        tokens: {
                                            expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 3600000),
                                        },
                                    }),
                                }),
                            }),
                        }),
                    }),
                };
            }
            return mockDb;
        });
        // Mock audit log add
        mockDb.add.mockResolvedValue({ id: 'audit-log-123' });
    });
    describe('Request Validation', () => {
        it('should require schoolId parameter', async () => {
            const invalidData = {};
            await expect(refreshGoogleTokenHandler(mockAuthUid, invalidData)).rejects.toThrow('schoolId is required');
        });
    });
    describe('Authorization', () => {
        it('should require School Admin role for target school', async () => {
            // Mock user with different schoolId
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                role: 'School_admin',
                                schoolId: 'different-school',
                                email: 'admin@school.com',
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            await expect(refreshGoogleTokenHandler(mockAuthUid, mockRequestData)).rejects.toThrow('Only School Admins can refresh Google tokens for their school');
        });
        it('should allow super_admin to refresh any school token', async () => {
            // Mock super admin user
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                role: 'super_admin',
                                email: 'superadmin@avenir.com',
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            const result = await refreshGoogleTokenHandler(mockAuthUid, mockRequestData);
            expect(result.success).toBe(true);
        });
        it('should reject if user profile not found', async () => {
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: false,
                            data: () => undefined,
                        }),
                    };
                }
                return mockDb;
            });
            await expect(refreshGoogleTokenHandler(mockAuthUid, mockRequestData)).rejects.toThrow('User profile not found');
        });
    });
    describe('Token Refresh', () => {
        it('should call getValidAccessToken with correct schoolId', async () => {
            await refreshGoogleTokenHandler(mockAuthUid, mockRequestData);
            expect(googleTokenService.getValidAccessToken).toHaveBeenCalledWith('school123');
        });
        it('should retrieve updated expiration time from integration document', async () => {
            const result = await refreshGoogleTokenHandler(mockAuthUid, mockRequestData);
            expect(result.expiresAt).toBeDefined();
        });
        it('should handle missing integration document', async () => {
            mockDb.collection.mockImplementation((collectionPath) => {
                if (collectionPath === 'schools') {
                    return {
                        doc: jest.fn().mockReturnValue({
                            collection: jest.fn().mockReturnValue({
                                doc: jest.fn().mockReturnValue({
                                    get: jest.fn().mockResolvedValue({
                                        exists: false,
                                        data: () => undefined,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            await expect(refreshGoogleTokenHandler(mockAuthUid, mockRequestData)).rejects.toThrow('No Google integration found for school school123');
        });
        it('should handle missing expiration time', async () => {
            mockDb.collection.mockImplementation((collectionPath) => {
                if (collectionPath === 'schools') {
                    return {
                        doc: jest.fn().mockReturnValue({
                            collection: jest.fn().mockReturnValue({
                                doc: jest.fn().mockReturnValue({
                                    get: jest.fn().mockResolvedValue({
                                        exists: true,
                                        data: () => ({
                                            tokens: {
                                            // No expiresAt field
                                            },
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            await expect(refreshGoogleTokenHandler(mockAuthUid, mockRequestData)).rejects.toThrow('Token expiration time not found after refresh');
        });
        it('should handle token refresh failure', async () => {
            googleTokenService.getValidAccessToken.mockRejectedValue(new Error('Token refresh failed'));
            await expect(refreshGoogleTokenHandler(mockAuthUid, mockRequestData)).rejects.toThrow('Failed to refresh Google token');
        });
    });
    describe('Audit Log', () => {
        it('should write audit log entry with correct action', async () => {
            await refreshGoogleTokenHandler(mockAuthUid, mockRequestData);
            expect(mockDb.add).toHaveBeenCalledWith(expect.objectContaining({
                schoolId: 'school123',
                actorId: 'admin-user-123',
                actorEmail: 'admin@school.com',
                actorRole: 'School_admin',
                action: 'google.token_refreshed',
                details: expect.objectContaining({
                    expiresAt: expect.any(String),
                }),
            }));
        });
        it('should include expiration time in audit log details', async () => {
            await refreshGoogleTokenHandler(mockAuthUid, mockRequestData);
            const auditLogCall = mockDb.add.mock.calls[0][0];
            expect(auditLogCall.details.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601 format
        });
    });
    describe('Response', () => {
        it('should return success response with expiration time', async () => {
            const result = await refreshGoogleTokenHandler(mockAuthUid, mockRequestData);
            expect(result).toEqual({
                success: true,
                expiresAt: expect.any(Object),
            });
        });
        it('should return Timestamp object for expiresAt', async () => {
            const result = await refreshGoogleTokenHandler(mockAuthUid, mockRequestData);
            expect(result.expiresAt).toHaveProperty('toMillis');
        });
    });
});
describe('disconnectGoogleWorkspaceHandler', () => {
    let mockDb;
    let mockAuthUid;
    let mockRequestData;
    // Import the handler
    const { disconnectGoogleWorkspaceHandler } = require('./index');
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        // Mock Firestore
        mockDb = {
            doc: jest.fn().mockReturnThis(),
            collection: jest.fn().mockReturnThis(),
            get: jest.fn(),
            set: jest.fn(),
            add: jest.fn(),
        };
        const { getFirestore } = require('firebase-admin/firestore');
        getFirestore.mockReturnValue(mockDb);
        // Mock Auth UID
        mockAuthUid = 'admin-user-123';
        // Mock request data
        mockRequestData = {
            schoolId: 'school123',
        };
        // Mock revokeTokens
        googleAuthService.revokeTokens.mockResolvedValue(undefined);
        // Mock clearTokens
        googleTokenService.clearTokens.mockResolvedValue(undefined);
        // Mock user document
        mockDb.doc.mockImplementation((path) => {
            if (path === 'users/admin-user-123') {
                return {
                    get: jest.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({
                            role: 'School_admin',
                            schoolId: 'school123',
                            email: 'admin@school.com',
                        }),
                    }),
                };
            }
            return mockDb;
        });
        // Mock integration document
        mockDb.collection.mockImplementation((collectionPath) => {
            if (collectionPath === 'schools') {
                return {
                    doc: jest.fn().mockReturnValue({
                        collection: jest.fn().mockReturnValue({
                            doc: jest.fn().mockReturnValue({
                                get: jest.fn().mockResolvedValue({
                                    exists: true,
                                    data: () => ({
                                        connected: true,
                                        tokens: {
                                            accessToken: 'test-access-token',
                                            refreshToken: 'test-refresh-token',
                                        },
                                    }),
                                }),
                                set: jest.fn().mockResolvedValue(undefined),
                            }),
                        }),
                    }),
                };
            }
            return mockDb;
        });
        // Mock audit log add
        mockDb.add.mockResolvedValue({ id: 'audit-log-123' });
    });
    describe('Request Validation', () => {
        it('should require schoolId parameter', async () => {
            const invalidData = {};
            await expect(disconnectGoogleWorkspaceHandler(mockAuthUid, invalidData)).rejects.toThrow('schoolId is required');
        });
    });
    describe('Authorization', () => {
        it('should require School Admin role for target school', async () => {
            // Mock user with different schoolId
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                role: 'School_admin',
                                schoolId: 'different-school',
                                email: 'admin@school.com',
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            await expect(disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData)).rejects.toThrow('Only School Admins can disconnect Google Workspace for their school');
        });
        it('should allow super_admin to disconnect any school', async () => {
            // Mock super admin user
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                role: 'super_admin',
                                email: 'superadmin@avenir.com',
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            const result = await disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData);
            expect(result.success).toBe(true);
        });
        it('should reject if user profile not found', async () => {
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: false,
                            data: () => undefined,
                        }),
                    };
                }
                return mockDb;
            });
            await expect(disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData)).rejects.toThrow('User profile not found');
        });
    });
    describe('Token Revocation', () => {
        it('should retrieve tokens from Firestore', async () => {
            await disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData);
            // Verify that we attempted to get the integration document
            expect(mockDb.collection).toHaveBeenCalledWith('schools');
        });
        it('should call revokeTokens with access token', async () => {
            await disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData);
            expect(googleAuthService.revokeTokens).toHaveBeenCalledWith('test-access-token');
        });
        it('should handle missing integration document', async () => {
            mockDb.collection.mockImplementation((collectionPath) => {
                if (collectionPath === 'schools') {
                    return {
                        doc: jest.fn().mockReturnValue({
                            collection: jest.fn().mockReturnValue({
                                doc: jest.fn().mockReturnValue({
                                    get: jest.fn().mockResolvedValue({
                                        exists: false,
                                        data: () => undefined,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            await expect(disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData)).rejects.toThrow('No Google integration found for school school123');
        });
        it('should continue disconnection even if token revocation fails', async () => {
            googleAuthService.revokeTokens.mockRejectedValue(new Error('Revocation failed'));
            // Should still succeed
            const result = await disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData);
            expect(result.success).toBe(true);
        });
        it('should not call revokeTokens if access token is missing', async () => {
            mockDb.collection.mockImplementation((collectionPath) => {
                if (collectionPath === 'schools') {
                    return {
                        doc: jest.fn().mockReturnValue({
                            collection: jest.fn().mockReturnValue({
                                doc: jest.fn().mockReturnValue({
                                    get: jest.fn().mockResolvedValue({
                                        exists: true,
                                        data: () => ({
                                            connected: true,
                                            tokens: {
                                            // No accessToken
                                            },
                                        }),
                                    }),
                                    set: jest.fn().mockResolvedValue(undefined),
                                }),
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            await disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData);
            expect(googleAuthService.revokeTokens).not.toHaveBeenCalled();
        });
    });
    describe('Firestore Updates', () => {
        it('should set connected to false', async () => {
            let setCallArgs;
            mockDb.collection.mockImplementation((collectionPath) => {
                if (collectionPath === 'schools') {
                    return {
                        doc: jest.fn().mockReturnValue({
                            collection: jest.fn().mockReturnValue({
                                doc: jest.fn().mockReturnValue({
                                    get: jest.fn().mockResolvedValue({
                                        exists: true,
                                        data: () => ({
                                            connected: true,
                                            tokens: {
                                                accessToken: 'test-access-token',
                                            },
                                        }),
                                    }),
                                    set: jest.fn().mockImplementation((data, options) => {
                                        setCallArgs = { data, options };
                                        return Promise.resolve();
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            await disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData);
            expect(setCallArgs.data).toMatchObject({
                connected: false,
            });
            expect(setCallArgs.options).toEqual({ merge: true });
        });
        it('should call clearTokens to remove token fields', async () => {
            await disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData);
            expect(googleTokenService.clearTokens).toHaveBeenCalledWith('school123');
        });
    });
    describe('Audit Log', () => {
        it('should write audit log entry with correct action', async () => {
            await disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData);
            expect(mockDb.add).toHaveBeenCalledWith(expect.objectContaining({
                schoolId: 'school123',
                actorId: 'admin-user-123',
                actorEmail: 'admin@school.com',
                actorRole: 'School_admin',
                action: 'google.disconnected',
                details: {},
            }));
        });
    });
    describe('Response', () => {
        it('should return success response', async () => {
            const result = await disconnectGoogleWorkspaceHandler(mockAuthUid, mockRequestData);
            expect(result).toEqual({
                success: true,
            });
        });
    });
});
describe('verifyGoogleConnectionHandler', () => {
    let mockDb;
    let mockAuthUid;
    let mockRequestData;
    // Import the handler
    const { verifyGoogleConnectionHandler } = require('./index');
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        // Mock Firestore
        mockDb = {
            doc: jest.fn().mockReturnThis(),
            collection: jest.fn().mockReturnThis(),
            get: jest.fn(),
            set: jest.fn(),
            add: jest.fn(),
        };
        const { getFirestore } = require('firebase-admin/firestore');
        getFirestore.mockReturnValue(mockDb);
        // Mock Auth UID
        mockAuthUid = 'admin-user-123';
        // Mock request data
        mockRequestData = {
            schoolId: 'school123',
        };
        // Mock verifyConnection
        googleVerificationService.verifyConnection.mockResolvedValue({
            success: true,
            results: {
                drive: { success: true },
                calendar: { success: true },
                classroom: { success: true },
                gmail: { success: true },
            },
        });
        // Mock user document
        mockDb.doc.mockImplementation((path) => {
            if (path === 'users/admin-user-123') {
                return {
                    get: jest.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({
                            role: 'School_admin',
                            schoolId: 'school123',
                            email: 'admin@school.com',
                        }),
                    }),
                };
            }
            return mockDb;
        });
    });
    describe('Request Validation', () => {
        it('should require schoolId parameter', async () => {
            const invalidData = {};
            await expect(verifyGoogleConnectionHandler(mockAuthUid, invalidData)).rejects.toThrow('schoolId is required');
        });
    });
    describe('Authorization', () => {
        it('should require School Admin role for target school', async () => {
            // Mock user with different schoolId
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                role: 'School_admin',
                                schoolId: 'different-school',
                                email: 'admin@school.com',
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            await expect(verifyGoogleConnectionHandler(mockAuthUid, mockRequestData)).rejects.toThrow('Only School Admins can verify Google connection for their school');
        });
        it('should allow super_admin to verify any school connection', async () => {
            // Mock super admin user
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                role: 'super_admin',
                                email: 'superadmin@avenir.com',
                            }),
                        }),
                    };
                }
                return mockDb;
            });
            const result = await verifyGoogleConnectionHandler(mockAuthUid, mockRequestData);
            expect(result.success).toBe(true);
        });
        it('should reject if user profile not found', async () => {
            mockDb.doc.mockImplementation((path) => {
                if (path === 'users/admin-user-123') {
                    return {
                        get: jest.fn().mockResolvedValue({
                            exists: false,
                            data: () => undefined,
                        }),
                    };
                }
                return mockDb;
            });
            await expect(verifyGoogleConnectionHandler(mockAuthUid, mockRequestData)).rejects.toThrow('User profile not found');
        });
    });
    describe('Connection Verification', () => {
        it('should call verifyConnection with correct schoolId', async () => {
            await verifyGoogleConnectionHandler(mockAuthUid, mockRequestData);
            expect(googleVerificationService.verifyConnection).toHaveBeenCalledWith('school123');
        });
        it('should return verification results for all enabled services', async () => {
            const result = await verifyGoogleConnectionHandler(mockAuthUid, mockRequestData);
            expect(result).toEqual({
                success: true,
                results: {
                    drive: { success: true },
                    calendar: { success: true },
                    classroom: { success: true },
                    gmail: { success: true },
                },
            });
        });
        it('should handle verification failure', async () => {
            googleVerificationService.verifyConnection.mockRejectedValue(new Error('Verification failed'));
            await expect(verifyGoogleConnectionHandler(mockAuthUid, mockRequestData)).rejects.toThrow('Failed to verify Google connection');
        });
        it('should return partial success when some services fail', async () => {
            googleVerificationService.verifyConnection.mockResolvedValue({
                success: false,
                results: {
                    drive: { success: true },
                    calendar: { success: false, error: 'Calendar API disabled' },
                    classroom: { success: true },
                    gmail: { success: true },
                },
            });
            const result = await verifyGoogleConnectionHandler(mockAuthUid, mockRequestData);
            expect(result.success).toBe(false);
            expect(result.results.calendar).toEqual({
                success: false,
                error: 'Calendar API disabled',
            });
        });
    });
    describe('Response', () => {
        it('should return success response with verification results', async () => {
            const result = await verifyGoogleConnectionHandler(mockAuthUid, mockRequestData);
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('results');
        });
        it('should include all service results in response', async () => {
            const result = await verifyGoogleConnectionHandler(mockAuthUid, mockRequestData);
            expect(result.results).toHaveProperty('drive');
            expect(result.results).toHaveProperty('calendar');
            expect(result.results).toHaveProperty('classroom');
            expect(result.results).toHaveProperty('gmail');
        });
    });
});
//# sourceMappingURL=index.test.js.map