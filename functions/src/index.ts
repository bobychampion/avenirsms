/**
 * Admin-only Cloud Functions for AvenirSMS.
 *
 * Currently exposes a single callable: `setStudentPassword`. This exists
 * because synthetic student logins use non-deliverable emails
 * (e.g. `stu-001@students.slug.local`), so Firebase's self-service
 * password-reset email flow doesn't work for them. An admin in the same
 * school triggers this function to mint a new temp password, which the
 * student then changes on first sign-in via `mustChangePassword`.
 *
 * Deploy:
 *   cd functions && npm install && npm run deploy
 *
 * Security: caller must be authenticated and hold `admin`, `School_admin`,
 * or `super_admin` role in the target user's school. Enforced server-side.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  ConnectGoogleWorkspaceRequest,
  ConnectGoogleWorkspaceResponse,
  RefreshGoogleTokenRequest,
  RefreshGoogleTokenResponse,
  DisconnectGoogleWorkspaceRequest,
  DisconnectGoogleWorkspaceResponse,
  VerifyGoogleConnectionRequest,
  VerifyGoogleConnectionResponse,
} from './google/types';
import {
  parseState,
  validateState,
  exchangeCodeForTokens,
  revokeTokens,
} from './google/googleAuthService';
import { storeTokens, getValidAccessToken, clearTokens } from './google/googleTokenService';
import { verifyConnection } from './google/googleVerificationService';
import { createEvent, updateEvent, deleteEvent } from './google/googleCalendarService';

initializeApp();

interface SetStudentPasswordPayload {
  targetUid: string;
  newPassword: string;
}

export const setStudentPassword = onCall<SetStudentPasswordPayload>(async (request) => {
  const { auth, data } = request;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const { targetUid, newPassword } = data ?? ({} as SetStudentPasswordPayload);
  if (!targetUid || !newPassword) {
    throw new HttpsError('invalid-argument', 'targetUid and newPassword are required.');
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new HttpsError('invalid-argument', 'Password must be at least 8 characters.');
  }

  const db = getFirestore();
  const [actorSnap, targetSnap] = await Promise.all([
    db.doc(`users/${auth.uid}`).get(),
    db.doc(`users/${targetUid}`).get(),
  ]);
  const actor = actorSnap.data();
  const target = targetSnap.data();
  if (!actor || !target) throw new HttpsError('not-found', 'User profile missing.');

  const isSuperAdmin = actor.role === 'super_admin';
  const isSchoolAdmin =
    (actor.role === 'admin' || actor.role === 'School_admin') &&
    actor.schoolId && actor.schoolId === target.schoolId;
  if (!isSuperAdmin && !isSchoolAdmin) {
    throw new HttpsError('permission-denied', 'Only admins in the target school may reset this password.');
  }

  await getAuth().updateUser(targetUid, { password: newPassword });
  await db.doc(`users/${targetUid}`).update({ mustChangePassword: true });

  await db.collection('audit_log').add({
    schoolId: target.schoolId ?? null,
    actorId: auth.uid,
    actorEmail: actor.email ?? null,
    actorRole: actor.role ?? null,
    action: 'password.reset',
    targetUserId: targetUid,
    targetUserEmail: target.email ?? null,
    createdAt: new Date(),
  });

  return { ok: true };
});

/**
 * Core logic for connecting Google Workspace to a school
 * 
 * Extracted for testability. This function contains the business logic
 * for handling the OAuth callback after a school admin authorizes Google Workspace access.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 10.1, 10.5, 10.6, 10.7, 10.8, 13.1**
 * 
 * @internal Exported for testing purposes
 */
export async function connectGoogleWorkspaceHandler(
  authUid: string,
  data: ConnectGoogleWorkspaceRequest
): Promise<ConnectGoogleWorkspaceResponse> {
  const { code, state, redirectUri } = data;
  
  // Validate request data
  if (!code || !state || !redirectUri) {
    throw new HttpsError(
      'invalid-argument',
      'code, state, and redirectUri are required.'
    );
  }
  
  // Parse and validate OAuth state
  let oauthState;
  try {
    oauthState = parseState(state);
  } catch (error) {
    throw new HttpsError(
      'invalid-argument',
      `Invalid OAuth state: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
  
  // Validate state timestamp and nonce format
  if (!validateState(oauthState)) {
    throw new HttpsError(
      'invalid-argument',
      'OAuth state is expired or invalid. Please try connecting again.'
    );
  }
  
  const { schoolId } = oauthState;
  
  // Validate caller is School Admin for target schoolId
  const db = getFirestore();
  const actorSnap = await db.doc(`users/${authUid}`).get();
  const actor = actorSnap.data();
  
  if (!actor) {
    throw new HttpsError('not-found', 'User profile not found.');
  }
  
  const isSuperAdmin = actor.role === 'super_admin';
  const isSchoolAdmin =
    (actor.role === 'admin' || actor.role === 'School_admin') &&
    actor.schoolId === schoolId;
  
  if (!isSuperAdmin && !isSchoolAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only School Admins can connect Google Workspace for their school.'
    );
  }
  
  try {
    // Exchange authorization code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    
    // Calculate token expiration timestamp
    const expiresAt = Timestamp.fromMillis(Date.now() + tokens.expiresIn * 1000);
    
    // Get admin email from ID token (if available) or use actor email
    const adminEmail = actor.email || '';
    
    // Extract workspace domain from admin email
    const workspaceDomain = adminEmail.includes('@') 
      ? adminEmail.split('@')[1] 
      : '';
    
    // Store tokens in Firestore
    await storeTokens(schoolId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      scopes: tokens.scopes,
    });
    
    // Update integration document with connection metadata
    const integrationRef = db
      .collection('schools')
      .doc(schoolId)
      .collection('integrations')
      .doc('google');
    
    const now = Timestamp.now();
    
    await integrationRef.set(
      {
        connected: true,
        connectedAt: now,
        connectedBy: authUid,
        adminEmail,
        workspaceDomain,
        updatedAt: now,
      },
      { merge: true }
    );
    
    // Trigger initial verification (async, don't wait for completion)
    verifyConnection(schoolId).catch((error) => {
      console.error(`Initial verification failed for school ${schoolId}:`, error);
    });
    
    // Write audit log entry
    await db.collection('audit_log').add({
      schoolId,
      actorId: authUid,
      actorEmail: actor.email ?? null,
      actorRole: actor.role ?? null,
      action: 'google.connected',
      details: {
        adminEmail,
        workspaceDomain,
        scopes: tokens.scopes,
      },
      createdAt: now,
    });
    
    // Return integration document
    return {
      success: true,
      integration: {
        connected: true,
        connectedAt: now,
        adminEmail,
        workspaceDomain,
      },
    };
  } catch (error) {
    // Log error for debugging
    console.error('Error connecting Google Workspace:', error);
    
    // Return user-friendly error
    throw new HttpsError(
      'internal',
      `Failed to connect Google Workspace: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
  }
}

/**
 * Connect Google Workspace to a school
 * 
 * Handles the OAuth callback after a school admin authorizes Google Workspace access.
 * This function:
 * 1. Validates the caller is a School Admin for the target school
 * 2. Parses and validates the OAuth state parameter for CSRF protection
 * 3. Exchanges the authorization code for access and refresh tokens
 * 4. Stores tokens securely in Firestore
 * 5. Triggers initial connection verification
 * 6. Writes an audit log entry
 * 7. Returns the integration document
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 10.1, 10.5, 10.6, 10.7, 10.8, 13.1**
 * 
 * @param request - Contains OAuth code, state, and redirectUri
 * @returns Integration document with connection metadata
 * @throws HttpsError if authentication fails, state is invalid, or token exchange fails
 */
export const connectGoogleWorkspace = onCall<ConnectGoogleWorkspaceRequest>(
  async (request): Promise<ConnectGoogleWorkspaceResponse> => {
    const { auth, data } = request;
    
    // Validate authentication
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    }
    
    return connectGoogleWorkspaceHandler(auth.uid, data ?? ({} as ConnectGoogleWorkspaceRequest));
  }
);

/**
 * Core logic for refreshing Google access token
 * 
 * Extracted for testability. This function contains the business logic
 * for manually refreshing a Google access token for a school.
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 7.6, 7.7, 10.2, 10.5, 10.6, 10.7, 10.9, 13.3**
 * 
 * @internal Exported for testing purposes
 */
export async function refreshGoogleTokenHandler(
  authUid: string,
  data: RefreshGoogleTokenRequest
): Promise<RefreshGoogleTokenResponse> {
  const { schoolId } = data;
  
  // Validate request data
  if (!schoolId) {
    throw new HttpsError(
      'invalid-argument',
      'schoolId is required.'
    );
  }
  
  // Validate caller belongs to target schoolId
  const db = getFirestore();
  const actorSnap = await db.doc(`users/${authUid}`).get();
  const actor = actorSnap.data();
  
  if (!actor) {
    throw new HttpsError('not-found', 'User profile not found.');
  }
  
  const isSuperAdmin = actor.role === 'super_admin';
  const isSchoolAdmin =
    (actor.role === 'admin' || actor.role === 'School_admin') &&
    actor.schoolId === schoolId;
  
  if (!isSuperAdmin && !isSchoolAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only School Admins can refresh Google tokens for their school.'
    );
  }
  
  try {
    // Call getValidAccessToken() from googleTokenService
    // This will automatically refresh the token if it's expired
    await getValidAccessToken(schoolId);
    
    // Get the updated integration document to retrieve the new expiration time
    const integrationRef = db
      .collection('schools')
      .doc(schoolId)
      .collection('integrations')
      .doc('google');
    
    const integrationDoc = await integrationRef.get();
    
    if (!integrationDoc.exists) {
      throw new HttpsError(
        'not-found',
        `No Google integration found for school ${schoolId}`
      );
    }
    
    const integration = integrationDoc.data();
    const expiresAt = integration?.tokens?.expiresAt;
    
    if (!expiresAt) {
      throw new HttpsError(
        'internal',
        'Token expiration time not found after refresh'
      );
    }
    
    // Write audit log entry with action 'google.token_refreshed'
    await db.collection('audit_log').add({
      schoolId,
      actorId: authUid,
      actorEmail: actor.email ?? null,
      actorRole: actor.role ?? null,
      action: 'google.token_refreshed',
      details: {
        expiresAt: new Date(expiresAt.toMillis()).toISOString(),
      },
      createdAt: Timestamp.now(),
    });
    
    // Return new expiration time
    return {
      success: true,
      expiresAt,
    };
  } catch (error) {
    // Log error for debugging
    console.error('Error refreshing Google token:', error);
    
    // Return user-friendly error
    throw new HttpsError(
      'internal',
      `Failed to refresh Google token: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
  }
}

/**
 * Refresh Google access token for a school
 * 
 * Allows manual token refresh from the frontend. This function:
 * 1. Validates the caller is a School Admin for the target school
 * 2. Calls getValidAccessToken() which automatically refreshes if needed
 * 3. Writes an audit log entry with action 'google.token_refreshed'
 * 4. Returns the new expiration time
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 7.6, 7.7, 10.2, 10.5, 10.6, 10.7, 10.9, 13.3**
 * 
 * @param request - Contains schoolId
 * @returns New token expiration time
 * @throws HttpsError if authentication fails, authorization fails, or token refresh fails
 */
export const refreshGoogleToken = onCall<RefreshGoogleTokenRequest>(
  async (request): Promise<RefreshGoogleTokenResponse> => {
    const { auth, data } = request;
    
    // Validate authentication
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    }
    
    return refreshGoogleTokenHandler(auth.uid, data ?? ({} as RefreshGoogleTokenRequest));
  }
);

/**
 * Core logic for disconnecting Google Workspace
 * 
 * Extracted for testability. This function contains the business logic
 * for disconnecting a school's Google Workspace integration.
 * 
 * **Validates: Requirements 1.7, 7.5, 10.3, 10.5, 10.6, 10.7, 13.2**
 * 
 * @internal Exported for testing purposes
 */
export async function disconnectGoogleWorkspaceHandler(
  authUid: string,
  data: DisconnectGoogleWorkspaceRequest
): Promise<DisconnectGoogleWorkspaceResponse> {
  const { schoolId } = data;
  
  // Validate request data
  if (!schoolId) {
    throw new HttpsError(
      'invalid-argument',
      'schoolId is required.'
    );
  }
  
  // Validate caller belongs to target schoolId
  const db = getFirestore();
  const actorSnap = await db.doc(`users/${authUid}`).get();
  const actor = actorSnap.data();
  
  if (!actor) {
    throw new HttpsError('not-found', 'User profile not found.');
  }
  
  const isSuperAdmin = actor.role === 'super_admin';
  const isSchoolAdmin =
    (actor.role === 'admin' || actor.role === 'School_admin') &&
    actor.schoolId === schoolId;
  
  if (!isSuperAdmin && !isSchoolAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only School Admins can disconnect Google Workspace for their school.'
    );
  }
  
  try {
    // Retrieve tokens from Firestore
    const integrationRef = db
      .collection('schools')
      .doc(schoolId)
      .collection('integrations')
      .doc('google');
    
    const integrationDoc = await integrationRef.get();
    
    if (!integrationDoc.exists) {
      throw new HttpsError(
        'not-found',
        `No Google integration found for school ${schoolId}`
      );
    }
    
    const integration = integrationDoc.data();
    const accessToken = integration?.tokens?.accessToken;
    
    // Revoke tokens with Google if access token exists
    if (accessToken) {
      try {
        await revokeTokens(accessToken);
      } catch (error) {
        // Log revocation error but continue with disconnection
        console.error('Error revoking tokens with Google:', error);
      }
    }
    
    // Update Firestore: set connected: false, clear token fields
    await integrationRef.set(
      {
        connected: false,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    
    // Clear token fields
    await clearTokens(schoolId);
    
    // Write audit log entry with action 'google.disconnected'
    await db.collection('audit_log').add({
      schoolId,
      actorId: authUid,
      actorEmail: actor.email ?? null,
      actorRole: actor.role ?? null,
      action: 'google.disconnected',
      details: {},
      createdAt: Timestamp.now(),
    });
    
    // Return success
    return {
      success: true,
    };
  } catch (error) {
    // Log error for debugging
    console.error('Error disconnecting Google Workspace:', error);
    
    // Return user-friendly error
    throw new HttpsError(
      'internal',
      `Failed to disconnect Google Workspace: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
  }
}

/**
 * Disconnect Google Workspace from a school
 * 
 * Disconnects a school's Google Workspace integration by:
 * 1. Validating the caller is a School Admin for the target school
 * 2. Retrieving tokens from Firestore
 * 3. Revoking tokens with Google's revocation endpoint
 * 4. Updating Firestore to set connected: false
 * 5. Clearing token fields
 * 6. Writing an audit log entry
 * 7. Returning success
 * 
 * **Validates: Requirements 1.7, 7.5, 10.3, 10.5, 10.6, 10.7, 13.2**
 * 
 * @param request - Contains schoolId
 * @returns Success response
 * @throws HttpsError if authentication fails, authorization fails, or disconnection fails
 */
export const disconnectGoogleWorkspace = onCall<DisconnectGoogleWorkspaceRequest>(
  async (request): Promise<DisconnectGoogleWorkspaceResponse> => {
    const { auth, data } = request;
    
    // Validate authentication
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    }
    
    return disconnectGoogleWorkspaceHandler(auth.uid, data ?? ({} as DisconnectGoogleWorkspaceRequest));
  }
);

/**
 * Core logic for verifying Google connection
 * 
 * Extracted for testability. This function contains the business logic
 * for verifying a school's Google Workspace connection.
 * 
 * **Validates: Requirements 6.1, 6.9, 8.7, 10.4, 10.5, 10.6, 10.7**
 * 
 * @internal Exported for testing purposes
 */
export async function verifyGoogleConnectionHandler(
  authUid: string,
  data: VerifyGoogleConnectionRequest
): Promise<VerifyGoogleConnectionResponse> {
  const { schoolId } = data;
  
  // Validate request data
  if (!schoolId) {
    throw new HttpsError(
      'invalid-argument',
      'schoolId is required.'
    );
  }
  
  // Validate caller belongs to target schoolId
  const db = getFirestore();
  const actorSnap = await db.doc(`users/${authUid}`).get();
  const actor = actorSnap.data();
  
  if (!actor) {
    throw new HttpsError('not-found', 'User profile not found.');
  }
  
  const isSuperAdmin = actor.role === 'super_admin';
  const isSchoolAdmin =
    (actor.role === 'admin' || actor.role === 'School_admin') &&
    actor.schoolId === schoolId;
  
  if (!isSuperAdmin && !isSchoolAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only School Admins can verify Google connection for their school.'
    );
  }
  
  try {
    // Call verifyConnection() from googleVerificationService
    const results = await verifyConnection(schoolId);
    
    // Return verification results for all enabled services
    return results;
  } catch (error) {
    // Log error for debugging
    console.error('Error verifying Google connection:', error);
    
    // Return user-friendly error
    throw new HttpsError(
      'internal',
      `Failed to verify Google connection: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
  }
}

/**
 * Verify Google Workspace connection for a school
 * 
 * Verifies a school's Google Workspace connection by:
 * 1. Validating the caller is a School Admin for the target school
 * 2. Calling verifyConnection() from googleVerificationService
 * 3. Returning verification results for all enabled services
 * 
 * **Validates: Requirements 6.1, 6.9, 8.7, 10.4, 10.5, 10.6, 10.7**
 * 
 * @param request - Contains schoolId
 * @returns Verification results for all enabled services
 * @throws HttpsError if authentication fails, authorization fails, or verification fails
 */
export const verifyGoogleConnection = onCall<VerifyGoogleConnectionRequest>(
  async (request): Promise<VerifyGoogleConnectionResponse> => {
    const { auth, data } = request;
    
    // Validate authentication
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    }
    
    return verifyGoogleConnectionHandler(auth.uid, data ?? ({} as VerifyGoogleConnectionRequest));
  }
);

// ─── Google Calendar Sync ─────────────────────────────────────────────────────

interface SyncCalendarEventRequest {
  schoolId: string;
  event: {
    title: string;
    description?: string;
    date: string;
    type: string;
  };
  /** If provided, updates the existing Google Calendar event instead of creating */
  googleEventId?: string;
}

interface SyncCalendarEventResponse {
  googleEventId: string;
}

/**
 * syncCalendarEvent — Create or update a school event in Google Calendar.
 * Called from SchoolCalendar.tsx after saving an event to Firestore.
 */
export const syncCalendarEvent = onCall<SyncCalendarEventRequest>(
  async (request): Promise<SyncCalendarEventResponse> => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');

    const { schoolId, event, googleEventId } = data ?? ({} as SyncCalendarEventRequest);
    if (!schoolId || !event?.title || !event?.date) {
      throw new HttpsError('invalid-argument', 'schoolId, event.title and event.date are required.');
    }

    // Validate caller belongs to this school
    const db = getFirestore();
    const actorSnap = await db.doc(`users/${auth.uid}`).get();
    const actor = actorSnap.data();
    if (!actor) throw new HttpsError('not-found', 'User profile not found.');

    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin =
      (actor.role === 'admin' || actor.role === 'School_admin') &&
      actor.schoolId === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
      throw new HttpsError('permission-denied', 'Only school admins can sync calendar events.');
    }

    // Check Google Calendar is connected and enabled
    const integrationSnap = await db
      .doc(`schools/${schoolId}/integrations/google`)
      .get();
    const integration = integrationSnap.data();
    if (!integration?.connected || !integration?.enabledServices?.calendar) {
      throw new HttpsError(
        'failed-precondition',
        'Google Calendar is not connected. Enable it in Integration Settings.'
      );
    }

    try {
      let resultId: string;
      if (googleEventId) {
        await updateEvent(schoolId, googleEventId, event);
        resultId = googleEventId;
      } else {
        resultId = await createEvent(schoolId, event);
      }

      // Audit log
      await db.collection('audit_log').add({
        schoolId,
        actorId: auth.uid,
        actorRole: actor.role,
        action: googleEventId ? 'google.calendar.event_updated' : 'google.calendar.event_created',
        details: { title: event.title, date: event.date, googleEventId: resultId },
        createdAt: Timestamp.now(),
      });

      return { googleEventId: resultId };
    } catch (error) {
      console.error('syncCalendarEvent error:', error);
      throw new HttpsError(
        'internal',
        `Failed to sync event to Google Calendar: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }
);

interface DeleteCalendarEventRequest {
  schoolId: string;
  googleEventId: string;
}

/**
 * deleteCalendarEvent — Remove a school event from Google Calendar.
 * Called from SchoolCalendar.tsx after deleting an event from Firestore.
 */
export const deleteCalendarEvent = onCall<DeleteCalendarEventRequest>(
  async (request): Promise<{ success: boolean }> => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');

    const { schoolId, googleEventId } = data ?? ({} as DeleteCalendarEventRequest);
    if (!schoolId || !googleEventId) {
      throw new HttpsError('invalid-argument', 'schoolId and googleEventId are required.');
    }

    // Validate caller
    const db = getFirestore();
    const actorSnap = await db.doc(`users/${auth.uid}`).get();
    const actor = actorSnap.data();
    if (!actor) throw new HttpsError('not-found', 'User profile not found.');

    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin =
      (actor.role === 'admin' || actor.role === 'School_admin') &&
      actor.schoolId === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
      throw new HttpsError('permission-denied', 'Only school admins can delete calendar events.');
    }

    try {
      await deleteEvent(schoolId, googleEventId);

      await db.collection('audit_log').add({
        schoolId,
        actorId: auth.uid,
        actorRole: actor.role,
        action: 'google.calendar.event_deleted',
        details: { googleEventId },
        createdAt: Timestamp.now(),
      });

      return { success: true };
    } catch (error) {
      console.error('deleteCalendarEvent error:', error);
      throw new HttpsError(
        'internal',
        `Failed to delete event from Google Calendar: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }
);
