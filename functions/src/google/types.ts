import { Timestamp } from 'firebase-admin/firestore';

/**
 * Cloud Function Request/Response Types for Google Workspace Integration
 */

/**
 * Request payload for connectGoogleWorkspace Cloud Function
 */
export interface ConnectGoogleWorkspaceRequest {
  code: string;        // OAuth authorization code
  state: string;       // Base64-encoded OAuthState
  redirectUri: string;
}

/**
 * Response payload for connectGoogleWorkspace Cloud Function
 */
export interface ConnectGoogleWorkspaceResponse {
  success: boolean;
  integration?: {
    connected: boolean;
    connectedAt: Timestamp;
    adminEmail: string;
    workspaceDomain: string;
  };
  error?: string;
}

/**
 * Request payload for refreshGoogleToken Cloud Function
 */
export interface RefreshGoogleTokenRequest {
  schoolId: string;
}

/**
 * Response payload for refreshGoogleToken Cloud Function
 */
export interface RefreshGoogleTokenResponse {
  success: boolean;
  expiresAt?: Timestamp;
  error?: string;
}

/**
 * Request payload for disconnectGoogleWorkspace Cloud Function
 */
export interface DisconnectGoogleWorkspaceRequest {
  schoolId: string;
}

/**
 * Response payload for disconnectGoogleWorkspace Cloud Function
 */
export interface DisconnectGoogleWorkspaceResponse {
  success: boolean;
  error?: string;
}

/**
 * Request payload for verifyGoogleConnection Cloud Function
 */
export interface VerifyGoogleConnectionRequest {
  schoolId: string;
}

/**
 * Service verification result
 */
export interface ServiceVerificationResult {
  success: boolean;
  error?: string;
}

/**
 * Response payload for verifyGoogleConnection Cloud Function
 */
export interface VerifyGoogleConnectionResponse {
  success: boolean;
  results: {
    drive?: ServiceVerificationResult;
    calendar?: ServiceVerificationResult;
    classroom?: ServiceVerificationResult;
    gmail?: ServiceVerificationResult;
  };
}

/**
 * OAuth State Object
 * Used to maintain state during OAuth flow
 */
export interface OAuthState {
  schoolId: string;
  nonce: string;      // UUID v4
  timestamp: number;  // Unix timestamp
}

/**
 * Google Integration Document Schema
 * Stored at: schools/{schoolId}/integrations/google
 */
export interface GoogleIntegration {
  // Connection metadata
  connected: boolean;
  connectedAt: Timestamp;
  connectedBy: string;  // User ID
  adminEmail: string;   // Google account email
  workspaceDomain: string;
  
  // Token storage
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Timestamp;
    scopes: string[];
  };
  
  // Service enablement
  enabledServices: {
    drive: boolean;
    calendar: boolean;
    classroom: boolean;
    gmail: boolean;
    meet: boolean;
  };
  
  // Status tracking
  status: {
    drive: 'connected' | 'error' | 'not_enabled';
    calendar: 'connected' | 'error' | 'not_enabled';
    classroom: 'connected' | 'error' | 'not_enabled';
    gmail: 'connected' | 'error' | 'not_enabled';
    meet: 'connected' | 'error' | 'not_enabled';
  };
  
  // Error tracking
  errors: {
    drive?: string;
    calendar?: string;
    classroom?: string;
    gmail?: string;
    meet?: string;
  };
  
  // Verification
  lastVerifiedAt: Timestamp;
  
  // Metadata
  updatedAt: Timestamp;
}

/**
 * Google Audit Log Entry
 */
export interface GoogleAuditEntry {
  action: 'google.connected' 
        | 'google.disconnected' 
        | 'google.token_refreshed' 
        | 'google.verification_failed' 
        | 'google.service_updated';
  details: {
    service?: string;
    enabled?: boolean;
    error?: string;
  };
  // Additional fields from base AuditEntry
  schoolId: string;
  userId: string;
  timestamp: Timestamp;
}
