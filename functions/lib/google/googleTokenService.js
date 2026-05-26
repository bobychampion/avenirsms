"use strict";
/**
 * Google Token Management Service
 *
 * Handles secure storage, retrieval, and lifecycle management of Google OAuth tokens.
 * Implements school-level isolation and automatic token refresh logic.
 *
 * @module functions/google/googleTokenService
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeTokens = storeTokens;
exports.clearTokens = clearTokens;
exports.isTokenExpired = isTokenExpired;
exports.clearTokenCache = clearTokenCache;
exports.refreshAccessToken = refreshAccessToken;
exports.getValidAccessToken = getValidAccessToken;
const firestore_1 = require("firebase-admin/firestore");
/**
 * Token expiration buffer in milliseconds (5 minutes)
 * Tokens are considered expired if they expire within this window
 */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
/**
 * Store OAuth tokens in Firestore
 *
 * Stores access token, refresh token, expiration timestamp, and granted scopes
 * in the school's integration document at schools/{schoolId}/integrations/google.
 *
 * This function enforces multi-tenant isolation by storing tokens under the
 * school-specific path. Firestore security rules provide additional protection.
 *
 * **Validates: Requirements 3.1, 3.2, 8.1**
 *
 * @param schoolId - The school ID for which to store tokens
 * @param tokens - Token data including access token, refresh token, expiry, and scopes
 * @returns Promise that resolves when tokens are stored
 * @throws Error if Firestore write fails
 */
async function storeTokens(schoolId, tokens) {
    const db = (0, firestore_1.getFirestore)();
    const integrationRef = db
        .collection('schools')
        .doc(schoolId)
        .collection('integrations')
        .doc('google');
    await integrationRef.set({
        tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
            scopes: tokens.scopes,
        },
        updatedAt: firestore_1.Timestamp.now(),
    }, { merge: true });
}
/**
 * Clear OAuth tokens from Firestore
 *
 * Removes all token data from the school's integration document.
 * This is called when disconnecting a Google Workspace integration.
 *
 * Note: This function does NOT revoke tokens with Google. Call revokeTokens()
 * from googleAuthService before calling this function to ensure tokens are
 * properly revoked with Google's API.
 *
 * **Validates: Requirements 1.7, 3.2, 7.5**
 *
 * @param schoolId - The school ID for which to clear tokens
 * @returns Promise that resolves when tokens are cleared
 * @throws Error if Firestore write fails
 */
async function clearTokens(schoolId) {
    const db = (0, firestore_1.getFirestore)();
    const integrationRef = db
        .collection('schools')
        .doc(schoolId)
        .collection('integrations')
        .doc('google');
    await integrationRef.set({
        tokens: {
            accessToken: '',
            refreshToken: '',
            expiresAt: firestore_1.Timestamp.fromMillis(0),
            scopes: [],
        },
        updatedAt: firestore_1.Timestamp.now(),
    }, { merge: true });
}
/**
 * Check if an access token is expired or expiring soon
 *
 * Determines whether a token should be refreshed by checking if it expires
 * within the next 5 minutes. This proactive approach prevents API calls from
 * failing due to token expiration.
 *
 * **Validates: Requirements 4.5**
 *
 * @param expiresAt - The token expiration timestamp
 * @returns true if the token is expired or expires within 5 minutes, false otherwise
 */
function isTokenExpired(expiresAt) {
    const now = Date.now();
    const expiryTime = expiresAt.toMillis();
    // Token is expired if it expires within the next 5 minutes
    return expiryTime - now <= TOKEN_EXPIRY_BUFFER_MS;
}
const tokenCache = new Map();
/**
 * Token cache TTL in milliseconds (50 minutes)
 * Tokens are cached for 50 minutes to reduce Firestore reads
 */
const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000;
/**
 * Mutex map to prevent concurrent refresh requests for the same school
 *
 * Stores promises for in-flight refresh operations keyed by schoolId.
 * This prevents multiple concurrent refresh requests from racing.
 */
const refreshMutexes = new Map();
/**
 * Clear the token cache (for testing purposes)
 *
 * @internal This function is exported for testing only
 */
function clearTokenCache() {
    tokenCache.clear();
    refreshMutexes.clear();
}
/**
 * Refresh an expired access token using the refresh token
 *
 * Calls Google's token endpoint with the refresh token to obtain a new
 * access token. Updates Firestore with the new token and expiration time.
 *
 * This function implements exponential backoff retry logic with a maximum
 * of 3 attempts when token refresh fails.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 7.1**
 *
 * @param schoolId - The school ID for which to refresh the token
 * @returns Object containing the new access token and expiration timestamp
 * @throws Error if refresh token is missing, invalid, or refresh fails after retries
 */
async function refreshAccessToken(schoolId) {
    const db = (0, firestore_1.getFirestore)();
    const integrationRef = db
        .collection('schools')
        .doc(schoolId)
        .collection('integrations')
        .doc('google');
    // Get the integration document to retrieve refresh token
    const integrationDoc = await integrationRef.get();
    if (!integrationDoc.exists) {
        throw new Error(`No Google integration found for school ${schoolId}`);
    }
    const integration = integrationDoc.data();
    const refreshToken = integration?.tokens?.refreshToken;
    if (!refreshToken) {
        throw new Error(`No refresh token found for school ${schoolId}`);
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variable is not set');
    }
    // Implement exponential backoff retry logic (max 3 attempts)
    const maxAttempts = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const params = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            });
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
            }
            const data = await response.json();
            // Calculate expiration timestamp
            const expiresAt = firestore_1.Timestamp.fromMillis(Date.now() + data.expires_in * 1000);
            // Update Firestore with new token
            await integrationRef.set({
                tokens: {
                    accessToken: data.access_token,
                    expiresAt: expiresAt,
                },
                updatedAt: firestore_1.Timestamp.now(),
            }, { merge: true });
            // Update cache
            tokenCache.set(schoolId, {
                accessToken: data.access_token,
                expiresAt: expiresAt,
            });
            return {
                accessToken: data.access_token,
                expiresAt: expiresAt,
            };
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // If this is the last attempt, don't wait
            if (attempt < maxAttempts) {
                // Exponential backoff: 1s, 2s, 4s
                const backoffMs = Math.pow(2, attempt - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }
    }
    // All retries failed
    throw new Error(`Token refresh failed after ${maxAttempts} attempts: ${lastError?.message}`);
}
/**
 * Get a valid access token for a school
 *
 * Returns a valid access token for the specified school. If the cached token
 * is expired or expiring soon, automatically refreshes it before returning.
 *
 * This function implements a mutex to prevent concurrent refresh requests
 * for the same school, ensuring only one refresh operation happens at a time.
 *
 * **Validates: Requirements 4.1, 4.2, 4.5, 7.1, 7.2, 7.3, 7.4**
 *
 * @param schoolId - The school ID for which to get a valid access token
 * @returns A valid access token
 * @throws Error if no integration exists, refresh fails, or token is invalid
 */
async function getValidAccessToken(schoolId) {
    // Check cache first
    const cached = tokenCache.get(schoolId);
    if (cached && !isTokenExpired(cached.expiresAt)) {
        // Cache hit with valid token
        return cached.accessToken;
    }
    // Check if there's already a refresh in progress for this school
    const existingRefresh = refreshMutexes.get(schoolId);
    if (existingRefresh) {
        // Wait for the existing refresh to complete
        const result = await existingRefresh;
        return result.accessToken;
    }
    // Start a new refresh operation
    const refreshPromise = (async () => {
        try {
            // Get token from Firestore
            const db = (0, firestore_1.getFirestore)();
            const integrationRef = db
                .collection('schools')
                .doc(schoolId)
                .collection('integrations')
                .doc('google');
            const integrationDoc = await integrationRef.get();
            if (!integrationDoc.exists) {
                throw new Error(`No Google integration found for school ${schoolId}`);
            }
            const integration = integrationDoc.data();
            const accessToken = integration?.tokens?.accessToken;
            const expiresAt = integration?.tokens?.expiresAt;
            if (!accessToken || !expiresAt) {
                throw new Error(`No access token found for school ${schoolId}`);
            }
            // Check if token needs refresh
            if (isTokenExpired(expiresAt)) {
                // Token is expired or expiring soon, refresh it
                const refreshed = await refreshAccessToken(schoolId);
                return refreshed;
            }
            // Token is still valid, cache it
            tokenCache.set(schoolId, {
                accessToken,
                expiresAt,
            });
            return { accessToken, expiresAt };
        }
        finally {
            // Remove mutex after operation completes
            refreshMutexes.delete(schoolId);
        }
    })();
    // Store the refresh promise in the mutex map
    refreshMutexes.set(schoolId, refreshPromise);
    const result = await refreshPromise;
    return result.accessToken;
}
//# sourceMappingURL=googleTokenService.js.map