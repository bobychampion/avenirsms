import { Timestamp } from 'firebase/firestore';

/**
 * Google Workspace Integration Document
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
 * OAuth State Object
 * Used to maintain state during OAuth flow
 */
export interface OAuthState {
  schoolId: string;
  nonce: string;      // UUID v4
  timestamp: number;  // Unix timestamp
}

/**
 * Google Audit Log Entry
 * Extends the base AuditEntry type
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

/**
 * Service interface for Google Authentication
 */
export interface GoogleAuthService {
  /**
   * Generate OAuth authorization URL with state parameter
   */
  getAuthorizationUrl(schoolId: string, scopes: string[]): Promise<string>;
  
  /**
   * Exchange authorization code for tokens
   */
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    scopes: string[];
  }>;
  
  /**
   * Revoke tokens with Google
   */
  revokeTokens(accessToken: string): Promise<void>;
  
  /**
   * Serialize OAuth state to base64
   */
  serializeState(state: OAuthState): string;
  
  /**
   * Parse OAuth state from base64
   */
  parseState(encoded: string): OAuthState;
  
  /**
   * Validate OAuth state (timestamp, nonce format)
   */
  validateState(state: OAuthState): boolean;
}

/**
 * Service interface for Google Token Management
 */
export interface GoogleTokenService {
  /**
   * Get a valid access token for a school (refreshes if expired)
   */
  getValidAccessToken(schoolId: string): Promise<string>;
  
  /**
   * Refresh an expired access token
   */
  refreshAccessToken(schoolId: string): Promise<{
    accessToken: string;
    expiresAt: Timestamp;
  }>;
  
  /**
   * Store tokens in Firestore
   */
  storeTokens(schoolId: string, tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Timestamp;
    scopes: string[];
  }): Promise<void>;
  
  /**
   * Clear tokens from Firestore
   */
  clearTokens(schoolId: string): Promise<void>;
  
  /**
   * Check if access token is expired or expiring soon
   */
  isTokenExpired(expiresAt: Timestamp): boolean;
}

/**
 * Verification result for a single service
 */
export interface ServiceVerificationResult {
  success: boolean;
  error?: string;
}

/**
 * Verification results for all services
 */
export interface VerificationResults {
  drive?: ServiceVerificationResult;
  calendar?: ServiceVerificationResult;
  classroom?: ServiceVerificationResult;
  gmail?: ServiceVerificationResult;
}

/**
 * Service interface for Google Connection Verification
 */
export interface GoogleVerificationService {
  /**
   * Verify all enabled services for a school
   */
  verifyConnection(schoolId: string): Promise<VerificationResults>;
  
  /**
   * Test Drive API access
   */
  verifyDrive(accessToken: string): Promise<ServiceVerificationResult>;
  
  /**
   * Test Calendar API access
   */
  verifyCalendar(accessToken: string): Promise<ServiceVerificationResult>;
  
  /**
   * Test Classroom API access
   */
  verifyClassroom(accessToken: string): Promise<ServiceVerificationResult>;
  
  /**
   * Test Gmail API access
   */
  verifyGmail(accessToken: string): Promise<ServiceVerificationResult>;
  
  /**
   * Update service status in Firestore
   */
  updateServiceStatus(schoolId: string, service: string, status: {
    connected: boolean;
    error?: string;
  }): Promise<void>;
}

/**
 * HTTP Client configuration for Google API calls
 */
export interface GoogleApiClient {
  /**
   * Make authenticated GET request to Google API
   */
  get<T>(url: string, accessToken: string): Promise<T>;
  
  /**
   * Make authenticated POST request to Google API
   */
  post<T>(url: string, accessToken: string, body: any): Promise<T>;
  
  /**
   * Retry configuration
   */
  retryConfig: {
    maxAttempts: number;
    backoffMs: number;
    backoffMultiplier: number;
  };
}
