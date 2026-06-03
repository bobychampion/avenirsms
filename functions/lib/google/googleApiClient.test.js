"use strict";
/**
 * Unit tests for Google API HTTP Client
 *
 * Tests retry logic, exponential backoff, rate limiting detection,
 * token injection, and error handling.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const googleApiClient_1 = require("./googleApiClient");
const googleTokenService_1 = require("./googleTokenService");
// Mock dependencies
jest.mock('./googleTokenService');
const mockGetValidAccessToken = googleTokenService_1.getValidAccessToken;
// Mock global fetch
global.fetch = jest.fn();
const mockFetch = global.fetch;
describe('googleApiClient', () => {
    const testSchoolId = 'test-school-123';
    const testAccessToken = 'test-access-token';
    const testUrl = 'https://www.googleapis.com/drive/v3/files';
    // Suppress console.warn during tests to reduce noise
    const originalWarn = console.warn;
    beforeAll(() => {
        console.warn = jest.fn();
    });
    afterAll(() => {
        console.warn = originalWarn;
    });
    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock: return valid access token
        mockGetValidAccessToken.mockResolvedValue(testAccessToken);
    });
    describe('getGoogleApiClient', () => {
        it('should create a client instance', () => {
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            expect(client).toBeDefined();
            expect(client.get).toBeDefined();
            expect(client.post).toBeDefined();
            expect(client.retryConfig).toBeDefined();
        });
        it('should use default retry configuration', () => {
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            expect(client.retryConfig.maxAttempts).toBe(3);
            expect(client.retryConfig.initialBackoffMs).toBe(1000);
            expect(client.retryConfig.backoffMultiplier).toBe(2);
        });
        it('should allow custom retry configuration', () => {
            const customConfig = {
                maxAttempts: 5,
                initialBackoffMs: 500,
            };
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId, customConfig);
            expect(client.retryConfig.maxAttempts).toBe(5);
            expect(client.retryConfig.initialBackoffMs).toBe(500);
            expect(client.retryConfig.backoffMultiplier).toBe(2); // Default
        });
    });
    describe('GET requests', () => {
        it('should make successful GET request with token injection', async () => {
            const mockResponse = { files: [] };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            const result = await client.get(testUrl);
            expect(result).toEqual(mockResponse);
            expect(mockGetValidAccessToken).toHaveBeenCalledWith(testSchoolId);
            expect(mockFetch).toHaveBeenCalledWith(testUrl, expect.objectContaining({
                method: 'GET',
                headers: expect.any(Headers),
            }));
            // Verify Authorization header was set
            const callArgs = mockFetch.mock.calls[0];
            const headers = callArgs[1]?.headers;
            expect(headers.get('Authorization')).toBe(`Bearer ${testAccessToken}`);
        });
        it('should throw error on failed GET request', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: async () => 'File not found',
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            await expect(client.get(testUrl)).rejects.toThrow('Google API request failed after 3 attempts');
        });
    });
    describe('POST requests', () => {
        it('should make successful POST request with body', async () => {
            const mockRequestBody = { name: 'test.txt' };
            const mockResponse = { id: 'file123' };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            const result = await client.post(testUrl, mockRequestBody);
            expect(result).toEqual(mockResponse);
            expect(mockFetch).toHaveBeenCalledWith(testUrl, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(mockRequestBody),
            }));
        });
    });
    describe('Retry logic with exponential backoff', () => {
        beforeEach(() => {
            // Mock setTimeout to avoid actual delays in tests
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.useRealTimers();
        });
        it('should retry on 429 rate limit error with exponential backoff', async () => {
            const mockResponse = { files: [] };
            // First two attempts fail with 429, third succeeds
            mockFetch
                .mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                text: async () => 'Rate limit exceeded',
            })
                .mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                text: async () => 'Rate limit exceeded',
            })
                .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            const resultPromise = client.get(testUrl);
            // Fast-forward through backoff delays
            // First retry: 1000ms
            await jest.advanceTimersByTimeAsync(1000);
            // Second retry: 2000ms
            await jest.advanceTimersByTimeAsync(2000);
            const result = await resultPromise;
            expect(result).toEqual(mockResponse);
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });
        it('should retry on 503 server error', async () => {
            const mockResponse = { files: [] };
            // First attempt fails with 503, second succeeds
            mockFetch
                .mockResolvedValueOnce({
                ok: false,
                status: 503,
                statusText: 'Service Unavailable',
                text: async () => 'Service temporarily unavailable',
            })
                .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            const resultPromise = client.get(testUrl);
            // Fast-forward through backoff delay (1000ms)
            await jest.advanceTimersByTimeAsync(1000);
            const result = await resultPromise;
            expect(result).toEqual(mockResponse);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
        it('should fail after max retry attempts', async () => {
            // All attempts fail with 429
            mockFetch.mockResolvedValue({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                text: async () => 'Rate limit exceeded',
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            // Create the promise but catch the error to prevent unhandled rejection
            const resultPromise = client.get(testUrl).catch(e => e);
            // Advance timers to trigger retries
            for (let i = 0; i < 3; i++) {
                await jest.advanceTimersToNextTimerAsync();
            }
            // Now await the result
            const error = await resultPromise;
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain('Google API request failed after 3 attempts');
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });
        it('should use correct exponential backoff delays', async () => {
            const mockResponse = { files: [] };
            const delays = [];
            // Mock setTimeout to capture delays
            const originalSetTimeout = global.setTimeout;
            jest.spyOn(global, 'setTimeout').mockImplementation(((callback, ms) => {
                delays.push(ms);
                return originalSetTimeout(callback, 0);
            }));
            // First two attempts fail, third succeeds
            mockFetch
                .mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                text: async () => 'Rate limit exceeded',
            })
                .mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                text: async () => 'Rate limit exceeded',
            })
                .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            const resultPromise = client.get(testUrl);
            // Fast-forward through all delays
            await jest.advanceTimersByTimeAsync(10000);
            await resultPromise;
            // Verify exponential backoff: 1s, 2s
            expect(delays).toContain(1000); // First retry
            expect(delays).toContain(2000); // Second retry
        });
    });
    describe('Rate limiting detection', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.useRealTimers();
        });
        it('should detect and retry on 429 status code', async () => {
            const mockResponse = { files: [] };
            mockFetch
                .mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                text: async () => 'Rate limit exceeded',
            })
                .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            const resultPromise = client.get(testUrl);
            await jest.advanceTimersByTimeAsync(1000);
            const result = await resultPromise;
            expect(result).toEqual(mockResponse);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });
    describe('Token injection interceptor', () => {
        it('should inject access token in Authorization header', async () => {
            const mockResponse = { files: [] };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            await client.get(testUrl);
            // Verify token was retrieved
            expect(mockGetValidAccessToken).toHaveBeenCalledWith(testSchoolId);
            // Verify Authorization header was set
            const callArgs = mockFetch.mock.calls[0];
            const headers = callArgs[1]?.headers;
            expect(headers.get('Authorization')).toBe(`Bearer ${testAccessToken}`);
        });
        it('should refresh token if expired', async () => {
            const mockResponse = { files: [] };
            // First call returns expired token, second call returns fresh token
            mockGetValidAccessToken
                .mockResolvedValueOnce('expired-token')
                .mockResolvedValueOnce('fresh-token');
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            // Make two requests
            await client.get(testUrl);
            await client.get(testUrl);
            // Verify token was retrieved for each request
            expect(mockGetValidAccessToken).toHaveBeenCalledTimes(2);
        });
    });
    describe('Error handling interceptor', () => {
        it('should throw descriptive error on 404', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: async () => 'File not found',
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            await expect(client.get(testUrl)).rejects.toThrow('Google API request failed after 3 attempts');
        });
        it('should throw descriptive error on 403', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
                text: async () => 'Insufficient permissions',
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            await expect(client.get(testUrl)).rejects.toThrow('Google API request failed after 3 attempts');
        });
    });
    describe('Non-retryable errors', () => {
        it('should not retry on 404 error', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: async () => 'File not found',
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            await expect(client.get(testUrl)).rejects.toThrow();
            // Should only attempt once (no retries for 404)
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
        it('should not retry on 400 error', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 400,
                statusText: 'Bad Request',
                text: async () => 'Invalid request',
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId);
            await expect(client.get(testUrl)).rejects.toThrow();
            // Should only attempt once (no retries for 400)
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });
    describe('Custom retry configuration', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.useRealTimers();
        });
        it('should respect custom max attempts', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                text: async () => 'Rate limit exceeded',
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId, { maxAttempts: 5 });
            // Create the promise but catch the error to prevent unhandled rejection
            const resultPromise = client.get(testUrl).catch(e => e);
            // Advance timers to trigger all retries
            for (let i = 0; i < 5; i++) {
                await jest.advanceTimersToNextTimerAsync();
            }
            // Now await the result
            const error = await resultPromise;
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain('Google API request failed after 5 attempts');
            expect(mockFetch).toHaveBeenCalledTimes(5);
        });
        it('should respect custom initial backoff', async () => {
            const mockResponse = { files: [] };
            const delays = [];
            // Mock setTimeout to capture delays
            const originalSetTimeout = global.setTimeout;
            jest.spyOn(global, 'setTimeout').mockImplementation(((callback, ms) => {
                delays.push(ms);
                return originalSetTimeout(callback, 0);
            }));
            mockFetch
                .mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                text: async () => 'Rate limit exceeded',
            })
                .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            });
            const client = (0, googleApiClient_1.getGoogleApiClient)(testSchoolId, { initialBackoffMs: 500 });
            const resultPromise = client.get(testUrl);
            await jest.advanceTimersByTimeAsync(1000);
            await resultPromise;
            // Verify custom initial backoff (500ms)
            expect(delays).toContain(500);
        });
    });
});
//# sourceMappingURL=googleApiClient.test.js.map