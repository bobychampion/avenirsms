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
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
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
import { createCourse, updateCourse, archiveCourse } from './google/googleClassroomService';
import {
  TestStorageConnectionRequest,
  TestStorageConnectionResponse,
  ConnectStorageProviderRequest,
  ConnectStorageProviderResponse,
  DisconnectStorageProviderRequest,
  GetUploadSignatureRequest,
  GetUploadSignatureResponse,
  DeleteStorageFileRequest,
  VerifyStorageConnectionRequest,
  testStorageConnectionHandler,
  connectStorageProviderHandler,
  disconnectStorageProviderHandler,
  getUploadSignatureHandler,
  deleteStorageFileHandler,
  verifyStorageConnectionHandler,
} from './storage/storageHandlers';

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

// ─── Google Classroom Sync ────────────────────────────────────────────────────

interface SyncClassroomCourseRequest {
  schoolId: string;
  cls: {
    name: string;
    section?: string;  // academic session
    description?: string;
    room?: string;
  };
  /** If provided, updates the existing Classroom course instead of creating */
  googleCourseId?: string;
}

interface SyncClassroomCourseResponse {
  googleCourseId: string;
}

/**
 * syncClassroomCourse — Create or update an AVENIR class as a Google Classroom course.
 * Called from ClassManagement.tsx after saving a class to Firestore.
 */
export const syncClassroomCourse = onCall<SyncClassroomCourseRequest>(
  async (request): Promise<SyncClassroomCourseResponse> => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');

    const { schoolId, cls, googleCourseId } = data ?? ({} as SyncClassroomCourseRequest);
    if (!schoolId || !cls?.name) {
      throw new HttpsError('invalid-argument', 'schoolId and cls.name are required.');
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
      throw new HttpsError('permission-denied', 'Only school admins can sync classroom courses.');
    }

    // Check Google Classroom is connected and enabled
    const integrationSnap = await db
      .doc(`schools/${schoolId}/integrations/google`)
      .get();
    const integration = integrationSnap.data();
    if (!integration?.connected || !integration?.enabledServices?.classroom) {
      throw new HttpsError(
        'failed-precondition',
        'Google Classroom is not connected. Enable it in Integration Settings.'
      );
    }

    try {
      let resultId: string;
      if (googleCourseId) {
        await updateCourse(schoolId, googleCourseId, cls);
        resultId = googleCourseId;
      } else {
        resultId = await createCourse(schoolId, cls);
      }

      // Audit log
      await db.collection('audit_log').add({
        schoolId,
        actorId: auth.uid,
        actorRole: actor.role,
        action: googleCourseId ? 'google.classroom.course_updated' : 'google.classroom.course_created',
        details: { className: cls.name, section: cls.section, googleCourseId: resultId },
        createdAt: Timestamp.now(),
      });

      return { googleCourseId: resultId };
    } catch (error) {
      console.error('syncClassroomCourse error:', error);
      throw new HttpsError(
        'internal',
        `Failed to sync class to Google Classroom: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }
);

interface ArchiveClassroomCourseRequest {
  schoolId: string;
  googleCourseId: string;
}

/**
 * archiveClassroomCourse — Archive a Google Classroom course when a class is deleted.
 * Called from ClassManagement.tsx before deleting a class from Firestore.
 */
export const archiveClassroomCourse = onCall<ArchiveClassroomCourseRequest>(
  async (request): Promise<{ success: boolean }> => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');

    const { schoolId, googleCourseId } = data ?? ({} as ArchiveClassroomCourseRequest);
    if (!schoolId || !googleCourseId) {
      throw new HttpsError('invalid-argument', 'schoolId and googleCourseId are required.');
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
      throw new HttpsError('permission-denied', 'Only school admins can archive classroom courses.');
    }

    try {
      await archiveCourse(schoolId, googleCourseId);

      await db.collection('audit_log').add({
        schoolId,
        actorId: auth.uid,
        actorRole: actor.role,
        action: 'google.classroom.course_archived',
        details: { googleCourseId },
        createdAt: Timestamp.now(),
      });

      return { success: true };
    } catch (error) {
      console.error('archiveClassroomCourse error:', error);
      throw new HttpsError(
        'internal',
        `Failed to archive course in Google Classroom: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }
);

// ─── Storage Provider Connection (Cloudinary, with future S3/Supabase/Firebase) ──

/** Validates credentials without persisting anything — backs the "Test Connection" button. */
export const testStorageConnection = onCall<TestStorageConnectionRequest>(
  async (request): Promise<TestStorageConnectionResponse> => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
    return testStorageConnectionHandler(auth.uid, data ?? ({} as TestStorageConnectionRequest));
  }
);

/** Re-validates, then encrypts + persists the credentials. Backs the "Connect" button. */
export const connectStorageProvider = onCall<ConnectStorageProviderRequest>(
  async (request): Promise<ConnectStorageProviderResponse> => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
    return connectStorageProviderHandler(auth.uid, data ?? ({} as ConnectStorageProviderRequest));
  }
);

/** Disconnects the active provider for a school. */
export const disconnectStorageProvider = onCall<DisconnectStorageProviderRequest>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
    return disconnectStorageProviderHandler(auth.uid, data ?? ({} as DisconnectStorageProviderRequest));
  }
);

/**
 * Issues a short-lived signed-upload signature so the browser can upload
 * directly to Cloudinary without ever seeing the API secret. Any
 * authenticated member of the school may call this (not admin-only) —
 * uploading a student photo or assignment is a normal teacher/parent action.
 */
export const getUploadSignature = onCall<GetUploadSignatureRequest>(
  async (request): Promise<GetUploadSignatureResponse> => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
    return getUploadSignatureHandler(auth.uid, data ?? ({} as GetUploadSignatureRequest));
  }
);

/** Deletes a previously-uploaded file from the connected provider. */
export const deleteStorageFile = onCall<DeleteStorageFileRequest>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
    return deleteStorageFileHandler(auth.uid, data ?? ({} as DeleteStorageFileRequest));
  }
);

/** Re-tests an already-connected provider's stored credentials. Backs the Settings → Storage "Test Connection" button. */
export const verifyStorageConnection = onCall<VerifyStorageConnectionRequest>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
    return verifyStorageConnectionHandler(auth.uid, data ?? ({} as VerifyStorageConnectionRequest));
  }
);

// ─── Scheduled Automated Reminders ───────────────────────────────────────────
//
// Runs daily at 07:00 WAT (06:00 UTC).
// Checks each school's active invoices and sends FCM push notifications to
// parents whose children have outstanding fee balances due today or overdue.
//
// Also sends absence reminders for students absent 3+ consecutive school days
// without an approved absence_request on file.

/**
 * Helper: send an FCM notification to a single FCM token.
 * Silently swallows failures so one bad token never blocks the batch.
 */
async function sendFcmNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  try {
    await getMessaging().send({ token, notification: { title, body }, data: data ?? {} });
  } catch (err: any) {
    // Token expired / unregistered — log but continue
    console.warn('FCM send failed for token', token.slice(-6), ':', err.code ?? err.message);
  }
}

/**
 * dailyReminders — fires every morning at 06:00 UTC (07:00 WAT).
 *
 * Fee reminder logic:
 *  1. Fetch all invoices where status ∈ ['unpaid','partial'] across all schools.
 *  2. Filter to those with dueDate ≤ today.
 *  3. For each invoice, look up the student → parent guardian's Firebase UID →
 *     their FCM token stored in `users/{uid}.fcmToken`.
 *  4. Send a push notification via FCM.
 *  5. Write a `notifications` Firestore doc so the in-app bell also reflects it.
 *
 * Consecutive-absence alert logic:
 *  1. Fetch today's attendance records where status = 'absent'.
 *  2. Compare with the previous 2 school days.
 *  3. If a student is absent all 3 days and has no approved absence_request
 *     covering today, send the parent a welfare check notification.
 */
export const dailyReminders = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'UTC', region: 'us-central1' },
  async (_event) => {
    const db = getFirestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    console.log(`[dailyReminders] Running for date: ${todayStr}`);

    // ── FEE REMINDERS ────────────────────────────────────────────────────────

    const invoiceSnap = await db
      .collection('invoices')
      .where('status', 'in', ['unpaid', 'partial'])
      .where('dueDate', '<=', todayStr)
      .get();

    console.log(`[dailyReminders] Found ${invoiceSnap.size} overdue invoices`);

    let feeRemindersSent = 0;

    for (const invoiceDoc of invoiceSnap.docs) {
      const invoice = invoiceDoc.data();
      const { schoolId, studentId, studentName, amount, dueDate } = invoice;
      if (!schoolId || !studentId) continue;

      try {
        // Look up student to find guardian UID
        const studentDoc = await db.doc(`students/${studentId}`).get();
        const student = studentDoc.data();
        if (!student?.guardianUserId) continue;

        // Get guardian's FCM token
        const userDoc = await db.doc(`users/${student.guardianUserId}`).get();
        const userData = userDoc.data();
        if (!userData?.fcmToken) continue;

        const overdueDays = Math.round((today.getTime() - new Date(dueDate).getTime()) / 86400000);
        const title = overdueDays > 0 ? '⚠️ Fee Overdue' : '💳 Fee Due Today';
        const body = `${studentName ?? 'Your child'}'s school fee of ₦${(amount ?? 0).toLocaleString()} is ${overdueDays > 0 ? `${overdueDays} day${overdueDays > 1 ? 's' : ''} overdue` : 'due today'}.`;

        await sendFcmNotification(userData.fcmToken, title, body, {
          type: 'fee_due',
          invoiceId: invoiceDoc.id,
          schoolId,
        });

        // Write in-app notification
        await db.collection('notifications').add({
          recipientId: student.guardianUserId,
          title,
          body,
          type: 'fee_due',
          read: false,
          schoolId,
          createdAt: Timestamp.now(),
        });

        feeRemindersSent++;
      } catch (err: any) {
        console.error(`[dailyReminders] Error processing invoice ${invoiceDoc.id}:`, err.message);
      }
    }

    console.log(`[dailyReminders] Fee reminders sent: ${feeRemindersSent}`);

    // ── CONSECUTIVE ABSENCE ALERTS ────────────────────────────────────────────

    // Build the last 3 school days (Mon–Fri only, going backwards from today)
    const schoolDays: string[] = [];
    const cursor = new Date(today);
    while (schoolDays.length < 3) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) {
        schoolDays.push(cursor.toISOString().split('T')[0]);
      }
      cursor.setDate(cursor.getDate() - 1);
    }

    // Fetch attendance for these 3 days in one query
    const attSnap = await db
      .collection('attendance')
      .where('date', 'in', schoolDays)
      .where('status', '==', 'absent')
      .get();

    // Group by studentId
    const absentByStudent: Record<string, Set<string>> = {};
    for (const d of attSnap.docs) {
      const { studentId, date } = d.data();
      if (!studentId || !date) continue;
      if (!absentByStudent[studentId]) absentByStudent[studentId] = new Set();
      absentByStudent[studentId].add(date);
    }

    // Find students absent all 3 days
    const consecutivelyAbsent = Object.entries(absentByStudent)
      .filter(([, dates]) => schoolDays.every(d => dates.has(d)))
      .map(([studentId]) => studentId);

    console.log(`[dailyReminders] Students absent 3+ consecutive days: ${consecutivelyAbsent.length}`);

    let absenceAlertsSent = 0;

    for (const studentId of consecutivelyAbsent) {
      try {
        // Check for approved absence request covering today
        const absenceReqSnap = await db
          .collection('absence_requests')
          .where('studentId', '==', studentId)
          .where('status', '==', 'approved')
          .where('startDate', '<=', todayStr)
          .where('endDate', '>=', todayStr)
          .limit(1)
          .get();

        if (!absenceReqSnap.empty) continue; // authorised — skip

        // Get student and parent info
        const studentDoc = await db.doc(`students/${studentId}`).get();
        const student = studentDoc.data();
        if (!student?.guardianUserId) continue;

        const userDoc = await db.doc(`users/${student.guardianUserId}`).get();
        const userData = userDoc.data();
        if (!userData?.fcmToken) continue;

        const title = '📋 Absence Alert';
        const body = `${student.studentName ?? 'Your child'} has been absent for 3 consecutive school days. Please contact the school.`;

        await sendFcmNotification(userData.fcmToken, title, body, {
          type: 'attendance',
          studentId,
          schoolId: student.schoolId ?? '',
        });

        await db.collection('notifications').add({
          recipientId: student.guardianUserId,
          title,
          body,
          type: 'attendance',
          read: false,
          schoolId: student.schoolId ?? '',
          createdAt: Timestamp.now(),
        });

        absenceAlertsSent++;
      } catch (err: any) {
        console.error(`[dailyReminders] Error processing absence for student ${studentId}:`, err.message);
      }
    }

    console.log(`[dailyReminders] Absence alerts sent: ${absenceAlertsSent}`);
    console.log(`[dailyReminders] Complete. Fee: ${feeRemindersSent}, Absence: ${absenceAlertsSent}`);
  }
);
