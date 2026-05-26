/**
 * Google OAuth Authentication Service
 * 
 * Handles OAuth 2.0 authentication flow with Google, including:
 * - Authorization URL generation with state parameter
 * - OAuth state serialization and parsing
 * - State validation for CSRF protection
 * 
 * @module functions/google/googleAuthService
 */

import { OAuthState } from './types';

/**
 * Google OAuth 2.0 endpoints
 */
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/**
 * OAuth state validation constants
 */
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Google OAuth scopes by service
 */
export const GOOGLE_SCOPES = {
  profile: [
    'openid',
    'email',
    'profile',
  ],
  drive: [
    'https://www.googleapis.com/auth/drive.file',
  ],
  calendar: [
    'https://www.googleapis.com/auth/calendar',
  ],
  classroom: [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
  ],
  gmail: [
    'https://www.googleapis.com/auth/gmail.send',
  ],
};

/**
 * Generate OAuth authorization URL with state parameter
 * 
 * Constructs a Google OAuth 2.0 authorization URL with the following parameters:
 * - client_id: Google OAuth client ID from environment
 * - redirect_uri: OAuth callback URL
 * - response_type: 'code' for authorization code flow
 * - scope: Space-separated list of requested scopes
 * - state: Base64-encoded JSON containing schoolId, nonce, and timestamp
 * - access_type: 'offline' to obtain refresh token
 * - prompt: 'consent' to force consent screen (ensures refresh token)
 * 
 * **Validates: Requirements 1.2, 2.1, 2.2, 16.1, 16.2**
 * 
 * @param schoolId - The school ID initiating the OAuth flow
 * @param scopes - Array of OAuth scopes to request
 * @param redirectUri - The OAuth callback URL
 * @returns The complete OAuth authorization URL
 * @throws Error if GOOGLE_CLIENT_ID environment variable is not set
 */
export function getAuthorizationUrl(
  schoolId: string,
  scopes: string[],
  redirectUri: string
): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID environment variable is not set');
  }
  
  // Create OAuth state with nonce and timestamp
  const state: OAuthState = {
    schoolId,
    nonce: generateUuidV4(),
    timestamp: Date.now(),
  };
  
  // Serialize state to base64
  const encodedState = serializeState(state);
  
  // Build authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state: encodedState,
    access_type: 'offline',
    prompt: 'consent',
  });
  
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Serialize OAuth state to base64-encoded JSON
 * 
 * Encodes an OAuthState object as a base64 string for transmission in the
 * OAuth state parameter. This ensures the state can be safely passed through
 * URL parameters and reconstructed on callback.
 * 
 * **Validates: Requirements 16.1, 16.2, 16.7**
 * 
 * @param state - The OAuth state object to serialize
 * @returns Base64-encoded JSON string
 */
export function serializeState(state: OAuthState): string {
  const json = JSON.stringify(state);
  return Buffer.from(json, 'utf-8').toString('base64');
}

/**
 * Parse OAuth state from base64-encoded JSON
 * 
 * Decodes a base64-encoded state parameter back into an OAuthState object.
 * This is used to reconstruct the state during OAuth callback processing.
 * 
 * **Validates: Requirements 16.3, 16.4, 16.7**
 * 
 * @param encoded - Base64-encoded state string
 * @returns Parsed OAuth state object
 * @throws Error if the encoded string is not valid base64 or JSON
 */
export function parseState(encoded: string): OAuthState {
  try {
    const json = Buffer.from(encoded, 'base64').toString('utf-8');
    const state = JSON.parse(json) as OAuthState;
    
    // Validate required fields exist
    if (!state.schoolId || !state.nonce || typeof state.timestamp !== 'number') {
      throw new Error('Invalid state object: missing required fields');
    }
    
    return state;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse OAuth state: ${error.message}`);
    }
    throw new Error('Failed to parse OAuth state: unknown error');
  }
}

/**
 * Validate OAuth state for CSRF protection
 * 
 * Validates an OAuth state object to ensure:
 * 1. The timestamp is within the 10-minute validity window
 * 2. The nonce follows the UUID v4 format
 * 
 * This validation prevents CSRF attacks and replay attacks by ensuring
 * the state parameter is recent and properly formatted.
 * 
 * **Validates: Requirements 16.4, 16.5, 16.6**
 * 
 * @param state - The OAuth state object to validate
 * @returns true if the state is valid, false otherwise
 */
export function validateState(state: OAuthState): boolean {
  // Validate timestamp is within 10-minute window
  const now = Date.now();
  const age = now - state.timestamp;
  
  if (age < 0 || age > STATE_EXPIRY_MS) {
    return false;
  }
  
  // Validate nonce is UUID v4 format
  if (!UUID_V4_REGEX.test(state.nonce)) {
    return false;
  }
  
  return true;
}

/**
 * Generate a UUID v4 nonce
 * 
 * Generates a cryptographically random UUID v4 for use as an OAuth nonce.
 * This provides protection against replay attacks.
 * 
 * @returns A UUID v4 string
 */
function generateUuidV4(): string {
  // Generate 16 random bytes
  const bytes = new Uint8Array(16);
  
  // Use crypto.getRandomValues for cryptographically secure random values
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for Node.js environment
    const nodeCrypto = require('crypto');
    nodeCrypto.randomFillSync(bytes);
  }
  
  // Set version (4) and variant bits according to RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
  
  // Convert to hex string with dashes
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Exchange authorization code for tokens
 * 
 * Exchanges an OAuth authorization code for access and refresh tokens.
 * This is called after the user completes the OAuth consent flow.
 * 
 * **Validates: Requirements 1.3, 2.2**
 * 
 * @param code - The authorization code from OAuth callback
 * @param redirectUri - The redirect URI used in the authorization request
 * @returns Token response containing access token, refresh token, expiry, and scopes
 * @throws Error if token exchange fails or environment variables are missing
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variable is not set');
  }
  
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }
  
  const data = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  };
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scopes: data.scope ? data.scope.split(' ') : [],
  };
}

/**
 * Revoke OAuth tokens with Google
 * 
 * Revokes an access token or refresh token with Google's revocation endpoint.
 * This is called when disconnecting a Google Workspace integration.
 * 
 * **Validates: Requirements 1.7**
 * 
 * @param token - The access token or refresh token to revoke
 * @throws Error if token revocation fails
 */
export async function revokeTokens(token: string): Promise<void> {
  const params = new URLSearchParams({
    token,
  });
  
  const response = await fetch(GOOGLE_REVOKE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token revocation failed: ${response.status} ${errorText}`);
  }
}
