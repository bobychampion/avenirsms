"use strict";
/**
 * Unit tests for Google OAuth Authentication Service
 *
 * Tests OAuth state serialization, parsing, validation, and URL generation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const googleAuthService_1 = require("./googleAuthService");
describe('googleAuthService', () => {
    describe('serializeState', () => {
        it('should serialize a valid state object to base64', () => {
            const state = {
                schoolId: 'school123',
                nonce: '550e8400-e29b-41d4-a716-446655440000',
                timestamp: 1234567890000,
            };
            const serialized = (0, googleAuthService_1.serializeState)(state);
            // Should be a base64 string
            expect(typeof serialized).toBe('string');
            expect(serialized.length).toBeGreaterThan(0);
            // Should be valid base64
            expect(() => Buffer.from(serialized, 'base64')).not.toThrow();
        });
        it('should produce different outputs for different states', () => {
            const state1 = {
                schoolId: 'school123',
                nonce: '550e8400-e29b-41d4-a716-446655440000',
                timestamp: 1234567890000,
            };
            const state2 = {
                schoolId: 'school456',
                nonce: '550e8400-e29b-41d4-a716-446655440000',
                timestamp: 1234567890000,
            };
            const serialized1 = (0, googleAuthService_1.serializeState)(state1);
            const serialized2 = (0, googleAuthService_1.serializeState)(state2);
            expect(serialized1).not.toBe(serialized2);
        });
    });
    describe('parseState', () => {
        it('should parse a valid serialized state', () => {
            const original = {
                schoolId: 'school123',
                nonce: '550e8400-e29b-41d4-a716-446655440000',
                timestamp: 1234567890000,
            };
            const serialized = (0, googleAuthService_1.serializeState)(original);
            const parsed = (0, googleAuthService_1.parseState)(serialized);
            expect(parsed.schoolId).toBe(original.schoolId);
            expect(parsed.nonce).toBe(original.nonce);
            expect(parsed.timestamp).toBe(original.timestamp);
        });
        it('should throw error for invalid base64', () => {
            expect(() => (0, googleAuthService_1.parseState)('not-valid-base64!!!')).toThrow('Failed to parse OAuth state');
        });
        it('should throw error for invalid JSON', () => {
            const invalidJson = Buffer.from('not json', 'utf-8').toString('base64');
            expect(() => (0, googleAuthService_1.parseState)(invalidJson)).toThrow('Failed to parse OAuth state');
        });
        it('should throw error for missing schoolId', () => {
            const invalidState = {
                nonce: '550e8400-e29b-41d4-a716-446655440000',
                timestamp: 1234567890000,
            };
            const serialized = Buffer.from(JSON.stringify(invalidState), 'utf-8').toString('base64');
            expect(() => (0, googleAuthService_1.parseState)(serialized)).toThrow('missing required fields');
        });
        it('should throw error for missing nonce', () => {
            const invalidState = {
                schoolId: 'school123',
                timestamp: 1234567890000,
            };
            const serialized = Buffer.from(JSON.stringify(invalidState), 'utf-8').toString('base64');
            expect(() => (0, googleAuthService_1.parseState)(serialized)).toThrow('missing required fields');
        });
        it('should throw error for missing timestamp', () => {
            const invalidState = {
                schoolId: 'school123',
                nonce: '550e8400-e29b-41d4-a716-446655440000',
            };
            const serialized = Buffer.from(JSON.stringify(invalidState), 'utf-8').toString('base64');
            expect(() => (0, googleAuthService_1.parseState)(serialized)).toThrow('missing required fields');
        });
    });
    describe('validateState', () => {
        it('should accept a valid state with recent timestamp', () => {
            const state = {
                schoolId: 'school123',
                nonce: '550e8400-e29b-41d4-a716-446655440000',
                timestamp: Date.now(),
            };
            expect((0, googleAuthService_1.validateState)(state)).toBe(true);
        });
        it('should accept a state within 10-minute window', () => {
            const state = {
                schoolId: 'school123',
                nonce: '550e8400-e29b-41d4-a716-446655440000',
                timestamp: Date.now() - 9 * 60 * 1000, // 9 minutes ago
            };
            expect((0, googleAuthService_1.validateState)(state)).toBe(true);
        });
        it('should reject a state with expired timestamp (>10 minutes)', () => {
            const state = {
                schoolId: 'school123',
                nonce: '550e8400-e29b-41d4-a716-446655440000',
                timestamp: Date.now() - 11 * 60 * 1000, // 11 minutes ago
            };
            expect((0, googleAuthService_1.validateState)(state)).toBe(false);
        });
        it('should reject a state with future timestamp', () => {
            const state = {
                schoolId: 'school123',
                nonce: '550e8400-e29b-41d4-a716-446655440000',
                timestamp: Date.now() + 1000, // 1 second in the future
            };
            expect((0, googleAuthService_1.validateState)(state)).toBe(false);
        });
        it('should reject a state with invalid nonce format', () => {
            const state = {
                schoolId: 'school123',
                nonce: 'not-a-uuid',
                timestamp: Date.now(),
            };
            expect((0, googleAuthService_1.validateState)(state)).toBe(false);
        });
        it('should reject a state with UUID v1 format', () => {
            const state = {
                schoolId: 'school123',
                nonce: '550e8400-e29b-11d4-a716-446655440000', // UUID v1
                timestamp: Date.now(),
            };
            expect((0, googleAuthService_1.validateState)(state)).toBe(false);
        });
        it('should accept various valid UUID v4 formats', () => {
            const validUuids = [
                '550e8400-e29b-41d4-a716-446655440000',
                'f47ac10b-58cc-4372-a567-0e02b2c3d479',
                '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
                '00000000-0000-4000-8000-000000000000',
            ];
            validUuids.forEach(uuid => {
                const state = {
                    schoolId: 'school123',
                    nonce: uuid,
                    timestamp: Date.now(),
                };
                expect((0, googleAuthService_1.validateState)(state)).toBe(true);
            });
        });
    });
    describe('getAuthorizationUrl', () => {
        const originalEnv = process.env;
        beforeEach(() => {
            process.env = { ...originalEnv };
            process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
        });
        afterEach(() => {
            process.env = originalEnv;
        });
        it('should generate a valid OAuth URL', () => {
            const schoolId = 'school123';
            const scopes = ['openid', 'email', 'profile'];
            const redirectUri = 'https://example.com/callback';
            const url = (0, googleAuthService_1.getAuthorizationUrl)(schoolId, scopes, redirectUri);
            expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
            expect(url).toContain('client_id=test-client-id.apps.googleusercontent.com');
            expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fcallback');
            expect(url).toContain('response_type=code');
            expect(url).toContain('scope=openid+email+profile');
            expect(url).toContain('access_type=offline');
            expect(url).toContain('prompt=consent');
            expect(url).toContain('state=');
        });
        it('should include a valid state parameter', () => {
            const schoolId = 'school123';
            const scopes = ['openid'];
            const redirectUri = 'https://example.com/callback';
            const url = (0, googleAuthService_1.getAuthorizationUrl)(schoolId, scopes, redirectUri);
            // Extract state parameter
            const urlObj = new URL(url);
            const stateParam = urlObj.searchParams.get('state');
            expect(stateParam).toBeTruthy();
            // Should be able to parse the state
            const state = (0, googleAuthService_1.parseState)(stateParam);
            expect(state.schoolId).toBe(schoolId);
            expect(state.nonce).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
            expect(state.timestamp).toBeGreaterThan(Date.now() - 1000);
            expect(state.timestamp).toBeLessThanOrEqual(Date.now());
        });
        it('should throw error if GOOGLE_CLIENT_ID is not set', () => {
            delete process.env.GOOGLE_CLIENT_ID;
            expect(() => {
                (0, googleAuthService_1.getAuthorizationUrl)('school123', ['openid'], 'https://example.com/callback');
            }).toThrow('GOOGLE_CLIENT_ID environment variable is not set');
        });
        it('should handle multiple scopes correctly', () => {
            const scopes = [
                'openid',
                'email',
                'profile',
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/calendar',
            ];
            const url = (0, googleAuthService_1.getAuthorizationUrl)('school123', scopes, 'https://example.com/callback');
            expect(url).toContain('scope=openid+email+profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar');
        });
    });
    describe('Round-trip property', () => {
        it('should preserve state through serialize/parse cycle', () => {
            const state = {
                schoolId: 'school123',
                nonce: '550e8400-e29b-41d4-a716-446655440000',
                timestamp: Date.now(),
            };
            const serialized = (0, googleAuthService_1.serializeState)(state);
            const parsed = (0, googleAuthService_1.parseState)(serialized);
            expect(parsed.schoolId).toBe(state.schoolId);
            expect(parsed.nonce).toBe(state.nonce);
            expect(parsed.timestamp).toBe(state.timestamp);
        });
        it('should preserve state with special characters in schoolId', () => {
            const state = {
                schoolId: 'school-123_test.example',
                nonce: '550e8400-e29b-41d4-a716-446655440000',
                timestamp: Date.now(),
            };
            const serialized = (0, googleAuthService_1.serializeState)(state);
            const parsed = (0, googleAuthService_1.parseState)(serialized);
            expect(parsed.schoolId).toBe(state.schoolId);
            expect(parsed.nonce).toBe(state.nonce);
            expect(parsed.timestamp).toBe(state.timestamp);
        });
    });
});
//# sourceMappingURL=googleAuthService.test.js.map