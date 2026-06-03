"use strict";
/**
 * Google API HTTP Client Abstraction
 *
 * Provides a reusable HTTP client for making authenticated requests to Google APIs
 * with automatic retry logic, exponential backoff, and rate limiting detection.
 *
 * @module functions/google/googleApiClient
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGoogleApiClient = getGoogleApiClient;
const googleTokenService_1 = require("./googleTokenService");
/**
 * Default retry configuration
 * - Max 3 attempts (initial + 2 retries)
 * - Exponential backoff: 1s, 2s, 4s
 * - Retry on rate limit (429) and server errors (500-599)
 */
const DEFAULT_RETRY_CONFIG = {
    maxAttempts: 3,
    initialBackoffMs: 1000,
    backoffMultiplier: 2,
    retryableStatusCodes: [429, 500, 502, 503, 504],
};
/**
 * Implementation of GoogleApiClient
 */
class GoogleApiClientImpl {
    constructor(schoolId, retryConfig = DEFAULT_RETRY_CONFIG) {
        this.requestInterceptors = [];
        this.responseInterceptors = [];
        this.schoolId = schoolId;
        this.retryConfig = retryConfig;
        // Add default token injection interceptor
        this.addRequestInterceptor(this.tokenInjectionInterceptor.bind(this));
        // Add default error handling interceptor
        this.addResponseInterceptor(this.errorHandlingInterceptor.bind(this));
    }
    /**
     * Add a request interceptor
     *
     * @param interceptor - Function to modify request before sending
     */
    addRequestInterceptor(interceptor) {
        this.requestInterceptors.push(interceptor);
    }
    /**
     * Add a response interceptor
     *
     * @param interceptor - Function to process response before returning
     */
    addResponseInterceptor(interceptor) {
        this.responseInterceptors.push(interceptor);
    }
    /**
     * Default request interceptor: inject access token
     *
     * Automatically retrieves a valid access token for the school
     * and adds it to the Authorization header.
     *
     * **Validates: Requirements 11.9**
     */
    async tokenInjectionInterceptor(url, options) {
        // Get valid access token for this school
        const accessToken = await (0, googleTokenService_1.getValidAccessToken)(this.schoolId);
        // Add Authorization header
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${accessToken}`);
        return {
            url,
            options: {
                ...options,
                headers,
            },
        };
    }
    /**
     * Default response interceptor: handle errors
     *
     * Checks response status and throws descriptive errors for failures.
     *
     * **Validates: Requirements 11.9**
     */
    async errorHandlingInterceptor(response) {
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return response;
    }
    /**
     * Execute HTTP request with retry logic and interceptors
     *
     * Implements exponential backoff retry logic with configurable attempts.
     * Retries on rate limit errors (429) and server errors (500-599).
     *
     * **Validates: Requirements 11.8, 11.9**
     *
     * @param url - Full URL to the API endpoint
     * @param options - Fetch options
     * @returns Parsed JSON response
     * @throws Error if request fails after all retries
     */
    async executeRequest(url, options) {
        let lastError = null;
        for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
            try {
                // Apply request interceptors
                let interceptedUrl = url;
                let interceptedOptions = options;
                for (const interceptor of this.requestInterceptors) {
                    const result = await interceptor(interceptedUrl, interceptedOptions);
                    interceptedUrl = result.url;
                    interceptedOptions = result.options;
                }
                // Make the request
                let response = await fetch(interceptedUrl, interceptedOptions);
                // Apply response interceptors
                for (const interceptor of this.responseInterceptors) {
                    response = await interceptor(response);
                }
                // Parse and return JSON response
                const data = await response.json();
                return data;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                // Check if error is retryable
                const isRetryable = this.isRetryableError(lastError);
                // If this is the last attempt or error is not retryable, don't retry
                if (attempt >= this.retryConfig.maxAttempts || !isRetryable) {
                    break;
                }
                // Calculate backoff delay: 1s, 2s, 4s, 8s, etc.
                const backoffMs = this.retryConfig.initialBackoffMs *
                    Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
                // Log retry attempt
                console.warn(`[GoogleApiClient] Request failed (attempt ${attempt}/${this.retryConfig.maxAttempts}), ` +
                    `retrying in ${backoffMs}ms: ${lastError.message}`);
                // Wait before retrying
                await this.sleep(backoffMs);
            }
        }
        // All retries failed
        throw new Error(`Google API request failed after ${this.retryConfig.maxAttempts} attempts: ${lastError?.message}`);
    }
    /**
     * Check if an error is retryable
     *
     * Determines whether a request should be retried based on the error.
     * Retries on rate limit errors (429) and server errors (500-599).
     *
     * **Validates: Requirements 11.8**
     *
     * @param error - The error to check
     * @returns true if the error is retryable, false otherwise
     */
    isRetryableError(error) {
        // Check if error message contains a retryable status code
        for (const statusCode of this.retryConfig.retryableStatusCodes) {
            if (error.message.includes(`${statusCode}`)) {
                return true;
            }
        }
        // Check for network errors
        if (error.message.includes('ECONNRESET') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('ENOTFOUND')) {
            return true;
        }
        return false;
    }
    /**
     * Sleep for a specified duration
     *
     * @param ms - Duration in milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Make authenticated GET request to Google API
     *
     * Automatically injects access token and handles retries.
     *
     * **Validates: Requirements 11.8, 11.9, 11.10**
     *
     * @param url - Full URL to the Google API endpoint
     * @returns Parsed JSON response
     * @throws Error if request fails after all retries
     */
    async get(url) {
        return this.executeRequest(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    /**
     * Make authenticated POST request to Google API
     *
     * Automatically injects access token and handles retries.
     *
     * **Validates: Requirements 11.8, 11.9, 11.10**
     *
     * @param url - Full URL to the Google API endpoint
     * @param body - Request body (will be JSON-stringified)
     * @returns Parsed JSON response
     * @throws Error if request fails after all retries
     */
    async post(url, body) {
        return this.executeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    }
}
/**
 * Factory function to get configured HTTP client for a school
 *
 * Creates a GoogleApiClient instance configured for the specified school.
 * The client automatically handles token injection, retries, and rate limiting.
 *
 * **Validates: Requirements 11.10**
 *
 * @param schoolId - The school ID for which to create the client
 * @param retryConfig - Optional custom retry configuration
 * @returns Configured GoogleApiClient instance
 *
 * @example
 * ```typescript
 * const client = getGoogleApiClient('school123');
 * const files = await client.get('https://www.googleapis.com/drive/v3/files');
 * ```
 */
function getGoogleApiClient(schoolId, retryConfig) {
    const config = {
        ...DEFAULT_RETRY_CONFIG,
        ...retryConfig,
    };
    return new GoogleApiClientImpl(schoolId, config);
}
//# sourceMappingURL=googleApiClient.js.map