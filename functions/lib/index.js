"use strict";
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
exports.sendTransactionalEmail = exports.deleteSchool = exports.expireDemoSchools = exports.dailyReminders = exports.verifyStorageConnection = exports.deleteStorageFile = exports.getUploadSignature = exports.disconnectStorageProvider = exports.connectStorageProvider = exports.testStorageConnection = exports.archiveClassroomCourse = exports.syncClassroomCourse = exports.deleteCalendarEvent = exports.syncCalendarEvent = exports.verifyGoogleConnection = exports.disconnectGoogleWorkspace = exports.refreshGoogleToken = exports.connectGoogleWorkspace = exports.setStudentPassword = void 0;
exports.connectGoogleWorkspaceHandler = connectGoogleWorkspaceHandler;
exports.refreshGoogleTokenHandler = refreshGoogleTokenHandler;
exports.disconnectGoogleWorkspaceHandler = disconnectGoogleWorkspaceHandler;
exports.verifyGoogleConnectionHandler = verifyGoogleConnectionHandler;
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
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const resendService_1 = require("./email/resendService");
const templates = __importStar(require("./email/emailTemplates"));
const googleAuthService_1 = require("./google/googleAuthService");
const googleTokenService_1 = require("./google/googleTokenService");
const googleVerificationService_1 = require("./google/googleVerificationService");
const googleCalendarService_1 = require("./google/googleCalendarService");
const googleClassroomService_1 = require("./google/googleClassroomService");
const storageHandlers_1 = require("./storage/storageHandlers");
(0, app_1.initializeApp)();
exports.setStudentPassword = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    const { targetUid, newPassword } = data ?? {};
    if (!targetUid || !newPassword) {
        throw new https_1.HttpsError('invalid-argument', 'targetUid and newPassword are required.');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new https_1.HttpsError('invalid-argument', 'Password must be at least 8 characters.');
    }
    const db = (0, firestore_1.getFirestore)();
    const [actorSnap, targetSnap] = await Promise.all([
        db.doc(`users/${auth.uid}`).get(),
        db.doc(`users/${targetUid}`).get(),
    ]);
    const actor = actorSnap.data();
    const target = targetSnap.data();
    if (!actor || !target)
        throw new https_1.HttpsError('not-found', 'User profile missing.');
    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin = (actor.role === 'admin' || actor.role === 'School_admin') &&
        actor.schoolId && actor.schoolId === target.schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only admins in the target school may reset this password.');
    }
    await (0, auth_1.getAuth)().updateUser(targetUid, { password: newPassword });
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
// SPARK-PLAN-TODO: Super Admin "View As" impersonation does NOT use a Cloud
// Function — see firestore.rules (impersonation_logs match) and
// src/components/ImpersonationContext.tsx. This keeps the feature usable on
// the free Spark plan, which cannot deploy Cloud Functions at all. Once on
// Blaze, consider re-adding startImpersonation/endImpersonation here if the
// feature needs Admin SDK access (e.g. a real "Act As" custom token).
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
async function connectGoogleWorkspaceHandler(authUid, data) {
    const { code, state, redirectUri } = data;
    // Validate request data
    if (!code || !state || !redirectUri) {
        throw new https_1.HttpsError('invalid-argument', 'code, state, and redirectUri are required.');
    }
    // Parse and validate OAuth state
    let oauthState;
    try {
        oauthState = (0, googleAuthService_1.parseState)(state);
    }
    catch (error) {
        throw new https_1.HttpsError('invalid-argument', `Invalid OAuth state: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    // Validate state timestamp and nonce format
    if (!(0, googleAuthService_1.validateState)(oauthState)) {
        throw new https_1.HttpsError('invalid-argument', 'OAuth state is expired or invalid. Please try connecting again.');
    }
    const { schoolId } = oauthState;
    // Validate caller is School Admin for target schoolId
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${authUid}`).get();
    const actor = actorSnap.data();
    if (!actor) {
        throw new https_1.HttpsError('not-found', 'User profile not found.');
    }
    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin = (actor.role === 'admin' || actor.role === 'School_admin') &&
        actor.schoolId === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only School Admins can connect Google Workspace for their school.');
    }
    try {
        // Exchange authorization code for tokens
        const tokens = await (0, googleAuthService_1.exchangeCodeForTokens)(code, redirectUri);
        // Calculate token expiration timestamp
        const expiresAt = firestore_1.Timestamp.fromMillis(Date.now() + tokens.expiresIn * 1000);
        // Get admin email from ID token (if available) or use actor email
        const adminEmail = actor.email || '';
        // Extract workspace domain from admin email
        const workspaceDomain = adminEmail.includes('@')
            ? adminEmail.split('@')[1]
            : '';
        // Store tokens in Firestore
        await (0, googleTokenService_1.storeTokens)(schoolId, {
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
        const now = firestore_1.Timestamp.now();
        await integrationRef.set({
            connected: true,
            connectedAt: now,
            connectedBy: authUid,
            adminEmail,
            workspaceDomain,
            updatedAt: now,
        }, { merge: true });
        // Trigger initial verification (async, don't wait for completion)
        (0, googleVerificationService_1.verifyConnection)(schoolId).catch((error) => {
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
    }
    catch (error) {
        // Log error for debugging
        console.error('Error connecting Google Workspace:', error);
        // Return user-friendly error
        throw new https_1.HttpsError('internal', `Failed to connect Google Workspace: ${error instanceof Error ? error.message : 'unknown error'}`);
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
exports.connectGoogleWorkspace = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    // Validate authentication
    if (!auth) {
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    }
    return connectGoogleWorkspaceHandler(auth.uid, data ?? {});
});
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
async function refreshGoogleTokenHandler(authUid, data) {
    const { schoolId } = data;
    // Validate request data
    if (!schoolId) {
        throw new https_1.HttpsError('invalid-argument', 'schoolId is required.');
    }
    // Validate caller belongs to target schoolId
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${authUid}`).get();
    const actor = actorSnap.data();
    if (!actor) {
        throw new https_1.HttpsError('not-found', 'User profile not found.');
    }
    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin = (actor.role === 'admin' || actor.role === 'School_admin') &&
        actor.schoolId === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only School Admins can refresh Google tokens for their school.');
    }
    try {
        // Call getValidAccessToken() from googleTokenService
        // This will automatically refresh the token if it's expired
        await (0, googleTokenService_1.getValidAccessToken)(schoolId);
        // Get the updated integration document to retrieve the new expiration time
        const integrationRef = db
            .collection('schools')
            .doc(schoolId)
            .collection('integrations')
            .doc('google');
        const integrationDoc = await integrationRef.get();
        if (!integrationDoc.exists) {
            throw new https_1.HttpsError('not-found', `No Google integration found for school ${schoolId}`);
        }
        const integration = integrationDoc.data();
        const expiresAt = integration?.tokens?.expiresAt;
        if (!expiresAt) {
            throw new https_1.HttpsError('internal', 'Token expiration time not found after refresh');
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
            createdAt: firestore_1.Timestamp.now(),
        });
        // Return new expiration time
        return {
            success: true,
            expiresAt,
        };
    }
    catch (error) {
        // Log error for debugging
        console.error('Error refreshing Google token:', error);
        // Return user-friendly error
        throw new https_1.HttpsError('internal', `Failed to refresh Google token: ${error instanceof Error ? error.message : 'unknown error'}`);
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
exports.refreshGoogleToken = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    // Validate authentication
    if (!auth) {
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    }
    return refreshGoogleTokenHandler(auth.uid, data ?? {});
});
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
async function disconnectGoogleWorkspaceHandler(authUid, data) {
    const { schoolId } = data;
    // Validate request data
    if (!schoolId) {
        throw new https_1.HttpsError('invalid-argument', 'schoolId is required.');
    }
    // Validate caller belongs to target schoolId
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${authUid}`).get();
    const actor = actorSnap.data();
    if (!actor) {
        throw new https_1.HttpsError('not-found', 'User profile not found.');
    }
    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin = (actor.role === 'admin' || actor.role === 'School_admin') &&
        actor.schoolId === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only School Admins can disconnect Google Workspace for their school.');
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
            throw new https_1.HttpsError('not-found', `No Google integration found for school ${schoolId}`);
        }
        const integration = integrationDoc.data();
        const accessToken = integration?.tokens?.accessToken;
        // Revoke tokens with Google if access token exists
        if (accessToken) {
            try {
                await (0, googleAuthService_1.revokeTokens)(accessToken);
            }
            catch (error) {
                // Log revocation error but continue with disconnection
                console.error('Error revoking tokens with Google:', error);
            }
        }
        // Update Firestore: set connected: false, clear token fields
        await integrationRef.set({
            connected: false,
            updatedAt: firestore_1.Timestamp.now(),
        }, { merge: true });
        // Clear token fields
        await (0, googleTokenService_1.clearTokens)(schoolId);
        // Write audit log entry with action 'google.disconnected'
        await db.collection('audit_log').add({
            schoolId,
            actorId: authUid,
            actorEmail: actor.email ?? null,
            actorRole: actor.role ?? null,
            action: 'google.disconnected',
            details: {},
            createdAt: firestore_1.Timestamp.now(),
        });
        // Return success
        return {
            success: true,
        };
    }
    catch (error) {
        // Log error for debugging
        console.error('Error disconnecting Google Workspace:', error);
        // Return user-friendly error
        throw new https_1.HttpsError('internal', `Failed to disconnect Google Workspace: ${error instanceof Error ? error.message : 'unknown error'}`);
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
exports.disconnectGoogleWorkspace = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    // Validate authentication
    if (!auth) {
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    }
    return disconnectGoogleWorkspaceHandler(auth.uid, data ?? {});
});
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
async function verifyGoogleConnectionHandler(authUid, data) {
    const { schoolId } = data;
    // Validate request data
    if (!schoolId) {
        throw new https_1.HttpsError('invalid-argument', 'schoolId is required.');
    }
    // Validate caller belongs to target schoolId
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${authUid}`).get();
    const actor = actorSnap.data();
    if (!actor) {
        throw new https_1.HttpsError('not-found', 'User profile not found.');
    }
    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin = (actor.role === 'admin' || actor.role === 'School_admin') &&
        actor.schoolId === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only School Admins can verify Google connection for their school.');
    }
    try {
        // Call verifyConnection() from googleVerificationService
        const results = await (0, googleVerificationService_1.verifyConnection)(schoolId);
        // Return verification results for all enabled services
        return results;
    }
    catch (error) {
        // Log error for debugging
        console.error('Error verifying Google connection:', error);
        // Return user-friendly error
        throw new https_1.HttpsError('internal', `Failed to verify Google connection: ${error instanceof Error ? error.message : 'unknown error'}`);
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
exports.verifyGoogleConnection = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    // Validate authentication
    if (!auth) {
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    }
    return verifyGoogleConnectionHandler(auth.uid, data ?? {});
});
/**
 * syncCalendarEvent — Create or update a school event in Google Calendar.
 * Called from SchoolCalendar.tsx after saving an event to Firestore.
 */
exports.syncCalendarEvent = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    const { schoolId, event, googleEventId } = data ?? {};
    if (!schoolId || !event?.title || !event?.date) {
        throw new https_1.HttpsError('invalid-argument', 'schoolId, event.title and event.date are required.');
    }
    // Validate caller belongs to this school
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${auth.uid}`).get();
    const actor = actorSnap.data();
    if (!actor)
        throw new https_1.HttpsError('not-found', 'User profile not found.');
    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin = (actor.role === 'admin' || actor.role === 'School_admin') &&
        actor.schoolId === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only school admins can sync calendar events.');
    }
    // Check Google Calendar is connected and enabled
    const integrationSnap = await db
        .doc(`schools/${schoolId}/integrations/google`)
        .get();
    const integration = integrationSnap.data();
    if (!integration?.connected || !integration?.enabledServices?.calendar) {
        throw new https_1.HttpsError('failed-precondition', 'Google Calendar is not connected. Enable it in Integration Settings.');
    }
    try {
        let resultId;
        if (googleEventId) {
            await (0, googleCalendarService_1.updateEvent)(schoolId, googleEventId, event);
            resultId = googleEventId;
        }
        else {
            resultId = await (0, googleCalendarService_1.createEvent)(schoolId, event);
        }
        // Audit log
        await db.collection('audit_log').add({
            schoolId,
            actorId: auth.uid,
            actorRole: actor.role,
            action: googleEventId ? 'google.calendar.event_updated' : 'google.calendar.event_created',
            details: { title: event.title, date: event.date, googleEventId: resultId },
            createdAt: firestore_1.Timestamp.now(),
        });
        return { googleEventId: resultId };
    }
    catch (error) {
        console.error('syncCalendarEvent error:', error);
        throw new https_1.HttpsError('internal', `Failed to sync event to Google Calendar: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
});
/**
 * deleteCalendarEvent — Remove a school event from Google Calendar.
 * Called from SchoolCalendar.tsx after deleting an event from Firestore.
 */
exports.deleteCalendarEvent = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    const { schoolId, googleEventId } = data ?? {};
    if (!schoolId || !googleEventId) {
        throw new https_1.HttpsError('invalid-argument', 'schoolId and googleEventId are required.');
    }
    // Validate caller
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${auth.uid}`).get();
    const actor = actorSnap.data();
    if (!actor)
        throw new https_1.HttpsError('not-found', 'User profile not found.');
    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin = (actor.role === 'admin' || actor.role === 'School_admin') &&
        actor.schoolId === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only school admins can delete calendar events.');
    }
    try {
        await (0, googleCalendarService_1.deleteEvent)(schoolId, googleEventId);
        await db.collection('audit_log').add({
            schoolId,
            actorId: auth.uid,
            actorRole: actor.role,
            action: 'google.calendar.event_deleted',
            details: { googleEventId },
            createdAt: firestore_1.Timestamp.now(),
        });
        return { success: true };
    }
    catch (error) {
        console.error('deleteCalendarEvent error:', error);
        throw new https_1.HttpsError('internal', `Failed to delete event from Google Calendar: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
});
/**
 * syncClassroomCourse — Create or update an AVENIR class as a Google Classroom course.
 * Called from ClassManagement.tsx after saving a class to Firestore.
 */
exports.syncClassroomCourse = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    const { schoolId, cls, googleCourseId } = data ?? {};
    if (!schoolId || !cls?.name) {
        throw new https_1.HttpsError('invalid-argument', 'schoolId and cls.name are required.');
    }
    // Validate caller belongs to this school
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${auth.uid}`).get();
    const actor = actorSnap.data();
    if (!actor)
        throw new https_1.HttpsError('not-found', 'User profile not found.');
    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin = (actor.role === 'admin' || actor.role === 'School_admin') &&
        actor.schoolId === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only school admins can sync classroom courses.');
    }
    // Check Google Classroom is connected and enabled
    const integrationSnap = await db
        .doc(`schools/${schoolId}/integrations/google`)
        .get();
    const integration = integrationSnap.data();
    if (!integration?.connected || !integration?.enabledServices?.classroom) {
        throw new https_1.HttpsError('failed-precondition', 'Google Classroom is not connected. Enable it in Integration Settings.');
    }
    try {
        let resultId;
        if (googleCourseId) {
            await (0, googleClassroomService_1.updateCourse)(schoolId, googleCourseId, cls);
            resultId = googleCourseId;
        }
        else {
            resultId = await (0, googleClassroomService_1.createCourse)(schoolId, cls);
        }
        // Audit log
        await db.collection('audit_log').add({
            schoolId,
            actorId: auth.uid,
            actorRole: actor.role,
            action: googleCourseId ? 'google.classroom.course_updated' : 'google.classroom.course_created',
            details: { className: cls.name, section: cls.section, googleCourseId: resultId },
            createdAt: firestore_1.Timestamp.now(),
        });
        return { googleCourseId: resultId };
    }
    catch (error) {
        console.error('syncClassroomCourse error:', error);
        throw new https_1.HttpsError('internal', `Failed to sync class to Google Classroom: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
});
/**
 * archiveClassroomCourse — Archive a Google Classroom course when a class is deleted.
 * Called from ClassManagement.tsx before deleting a class from Firestore.
 */
exports.archiveClassroomCourse = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    const { schoolId, googleCourseId } = data ?? {};
    if (!schoolId || !googleCourseId) {
        throw new https_1.HttpsError('invalid-argument', 'schoolId and googleCourseId are required.');
    }
    // Validate caller
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${auth.uid}`).get();
    const actor = actorSnap.data();
    if (!actor)
        throw new https_1.HttpsError('not-found', 'User profile not found.');
    const isSuperAdmin = actor.role === 'super_admin';
    const isSchoolAdmin = (actor.role === 'admin' || actor.role === 'School_admin') &&
        actor.schoolId === schoolId;
    if (!isSuperAdmin && !isSchoolAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only school admins can archive classroom courses.');
    }
    try {
        await (0, googleClassroomService_1.archiveCourse)(schoolId, googleCourseId);
        await db.collection('audit_log').add({
            schoolId,
            actorId: auth.uid,
            actorRole: actor.role,
            action: 'google.classroom.course_archived',
            details: { googleCourseId },
            createdAt: firestore_1.Timestamp.now(),
        });
        return { success: true };
    }
    catch (error) {
        console.error('archiveClassroomCourse error:', error);
        throw new https_1.HttpsError('internal', `Failed to archive course in Google Classroom: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
});
// ─── Storage Provider Connection (Cloudinary, with future S3/Supabase/Firebase) ──
/** Validates credentials without persisting anything — backs the "Test Connection" button. */
exports.testStorageConnection = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    return (0, storageHandlers_1.testStorageConnectionHandler)(auth.uid, data ?? {});
});
/** Re-validates, then encrypts + persists the credentials. Backs the "Connect" button. */
exports.connectStorageProvider = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    return (0, storageHandlers_1.connectStorageProviderHandler)(auth.uid, data ?? {});
});
/** Disconnects the active provider for a school. */
exports.disconnectStorageProvider = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    return (0, storageHandlers_1.disconnectStorageProviderHandler)(auth.uid, data ?? {});
});
/**
 * Issues a short-lived signed-upload signature so the browser can upload
 * directly to Cloudinary without ever seeing the API secret. Any
 * authenticated member of the school may call this (not admin-only) —
 * uploading a student photo or assignment is a normal teacher/parent action.
 */
exports.getUploadSignature = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    return (0, storageHandlers_1.getUploadSignatureHandler)(auth.uid, data ?? {});
});
/** Deletes a previously-uploaded file from the connected provider. */
exports.deleteStorageFile = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    return (0, storageHandlers_1.deleteStorageFileHandler)(auth.uid, data ?? {});
});
/** Re-tests an already-connected provider's stored credentials. Backs the Settings → Storage "Test Connection" button. */
exports.verifyStorageConnection = (0, https_1.onCall)(async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    return (0, storageHandlers_1.verifyStorageConnectionHandler)(auth.uid, data ?? {});
});
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
async function sendFcmNotification(token, title, body, data) {
    try {
        await (0, messaging_1.getMessaging)().send({ token, notification: { title, body }, data: data ?? {} });
    }
    catch (err) {
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
 *     their FCM token stored in `fcm_tokens/{uid}.token` (written by
 *     notificationService.ts's initFCMForUser on the client).
 *  4. Send a push notification via FCM.
 *  5. Write a `notifications` Firestore doc so the in-app bell also reflects it.
 *
 * Consecutive-absence alert logic:
 *  1. Fetch today's attendance records where status = 'absent'.
 *  2. Compare with the previous 2 school days.
 *  3. If a student is absent all 3 days and has no approved absence_request
 *     covering today, send the parent a welfare check notification.
 *
 * SPARK-PLAN-TODO: this is a scheduled Cloud Function — it cannot run at all
 * on the free Spark plan (no Cloud Functions of any kind can be deployed).
 * The token lookup bug (reading the wrong field) is fixed below regardless,
 * so this works correctly the day this project is upgraded to Blaze.
 */
exports.dailyReminders = (0, scheduler_1.onSchedule)({ schedule: '0 6 * * *', timeZone: 'UTC', region: 'us-central1' }, async (_event) => {
    const db = (0, firestore_1.getFirestore)();
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
        if (!schoolId || !studentId)
            continue;
        try {
            // Look up student to find guardian UID
            const studentDoc = await db.doc(`students/${studentId}`).get();
            const student = studentDoc.data();
            if (!student?.guardianUserId)
                continue;
            // Get guardian's FCM token
            const tokenDoc = await db.doc(`fcm_tokens/${student.guardianUserId}`).get();
            const tokenData = tokenDoc.data();
            if (!tokenData?.token)
                continue;
            const overdueDays = Math.round((today.getTime() - new Date(dueDate).getTime()) / 86400000);
            const title = overdueDays > 0 ? '⚠️ Fee Overdue' : '💳 Fee Due Today';
            const body = `${studentName ?? 'Your child'}'s school fee of ₦${(amount ?? 0).toLocaleString()} is ${overdueDays > 0 ? `${overdueDays} day${overdueDays > 1 ? 's' : ''} overdue` : 'due today'}.`;
            await sendFcmNotification(tokenData.token, title, body, {
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
                createdAt: firestore_1.Timestamp.now(),
            });
            feeRemindersSent++;
        }
        catch (err) {
            console.error(`[dailyReminders] Error processing invoice ${invoiceDoc.id}:`, err.message);
        }
    }
    console.log(`[dailyReminders] Fee reminders sent: ${feeRemindersSent}`);
    // ── CONSECUTIVE ABSENCE ALERTS ────────────────────────────────────────────
    // Build the last 3 school days (Mon–Fri only, going backwards from today)
    const schoolDays = [];
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
    const absentByStudent = {};
    for (const d of attSnap.docs) {
        const { studentId, date } = d.data();
        if (!studentId || !date)
            continue;
        if (!absentByStudent[studentId])
            absentByStudent[studentId] = new Set();
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
            if (!absenceReqSnap.empty)
                continue; // authorised — skip
            // Get student and parent info
            const studentDoc = await db.doc(`students/${studentId}`).get();
            const student = studentDoc.data();
            if (!student?.guardianUserId)
                continue;
            const tokenDoc = await db.doc(`fcm_tokens/${student.guardianUserId}`).get();
            const tokenData = tokenDoc.data();
            if (!tokenData?.token)
                continue;
            const title = '📋 Absence Alert';
            const body = `${student.studentName ?? 'Your child'} has been absent for 3 consecutive school days. Please contact the school.`;
            await sendFcmNotification(tokenData.token, title, body, {
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
                createdAt: firestore_1.Timestamp.now(),
            });
            absenceAlertsSent++;
        }
        catch (err) {
            console.error(`[dailyReminders] Error processing absence for student ${studentId}:`, err.message);
        }
    }
    console.log(`[dailyReminders] Absence alerts sent: ${absenceAlertsSent}`);
    console.log(`[dailyReminders] Complete. Fee: ${feeRemindersSent}, Absence: ${absenceAlertsSent}`);
});
/**
 * Auto-suspends demo schools once their 7-day trial (`subscriptionExpiresAt`)
 * has passed. Runs every 6 hours — tight enough for a 7-day window without
 * being wasteful. Only touches `status === 'demo'` docs; schools a super admin
 * has manually put in 'trial'/'active'/'suspended' are never touched here.
 *
 * Once flipped to 'suspended', firestore.rules' schoolIsActive() check blocks
 * all further data access for that school's users immediately — no separate
 * enforcement step needed.
 *
 * SPARK-PLAN-TODO: same Blaze-plan requirement as dailyReminders above.
 */
exports.expireDemoSchools = (0, scheduler_1.onSchedule)({ schedule: '0 */6 * * *', timeZone: 'UTC', region: 'us-central1' }, async (_event) => {
    const db = (0, firestore_1.getFirestore)();
    const now = firestore_1.Timestamp.now();
    const expiredSnap = await db
        .collection('schools')
        .where('status', '==', 'demo')
        .where('subscriptionExpiresAt', '<=', now)
        .get();
    if (expiredSnap.empty) {
        console.log('[expireDemoSchools] No expired demo schools found.');
        return;
    }
    const batch = db.batch();
    for (const schoolDoc of expiredSnap.docs) {
        batch.update(schoolDoc.ref, {
            status: 'suspended',
            autoSuspendedAt: now,
            updatedAt: now,
        });
    }
    await batch.commit();
    console.log(`[expireDemoSchools] Auto-suspended ${expiredSnap.size} expired demo school(s).`);
});
// ─── School deletion ─────────────────────────────────────────────────────────
/**
 * School-scoped collections wiped when a school is deleted. Kept in sync by
 * hand with SCHOOL_SCOPED_COLLECTIONS in src/services/schoolDeletionService.ts
 * (that copy drives the pre-delete document-count estimate shown in the
 * confirmation modal; this copy is what actually gets deleted).
 */
const SCHOOL_SCOPED_COLLECTIONS = [
    'students', 'guardians', 'staff', 'users',
    'classes', 'subjects', 'class_subjects', 'grades', 'student_skills',
    'attendance', 'attendance_checkins', 'timetables',
    'assignments', 'assignment_submissions',
    'events', 'notifications', 'notification_broadcasts', 'messages',
    'invoices', 'fee_payments', 'payments', 'expenses',
    'exams', 'exam_seating', 'question_bank', 'cbt_exams', 'cbt_sessions',
    'curriculum_documents', 'curriculum_items',
    'leave_requests', 'payroll', 'hr_policies', 'onboarding_records', 'leave_entitlements',
    'pins', 'promotions', 'whatsapp_logs', 'applications',
    'library_books', 'library_circulation',
    'mail', 'lifecycle_events', 'behavioral_records', 'alumni_profiles',
    'cover_assignments', 'school_trips', 'trip_registrations', 'absence_requests',
];
/** Financial collections optionally preserved (marked deleted, not removed) for audit trails. */
const FINANCIAL_COLLECTIONS = ['invoices', 'fee_payments', 'payments', 'expenses', 'platform_invoices'];
/** Standalone documents keyed by schoolId (not collections of many docs). */
const DOCUMENT_COLLECTIONS = ['school_settings', 'geofences'];
/**
 * Permanently deletes a school: its Firestore data across 40+ collections,
 * its users' Firebase Auth accounts, and the school document itself.
 * Runs server-side (Admin SDK) because deleting other users' Auth accounts
 * and cascading across every school-scoped collection both require
 * privileges the client SDK cannot be granted safely.
 *
 * Guardrail: the school must already be 'suspended' (not 'active') before
 * it can be deleted — prevents accidentally deleting a live paying school.
 */
exports.deleteSchool = (0, https_1.onCall)({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${auth.uid}`).get();
    const actor = actorSnap.data();
    if (!actor || actor.role !== 'super_admin') {
        throw new https_1.HttpsError('permission-denied', 'Only super admins may delete a school.');
    }
    const { schoolId, preserveFinancial } = data ?? {};
    if (!schoolId || typeof schoolId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'schoolId is required.');
    }
    const schoolRef = db.doc(`schools/${schoolId}`);
    const schoolSnap = await schoolRef.get();
    if (!schoolSnap.exists) {
        throw new https_1.HttpsError('not-found', 'School not found.');
    }
    const school = schoolSnap.data();
    if (school.status === 'active') {
        throw new https_1.HttpsError('failed-precondition', 'Suspend the school before deleting it.');
    }
    console.log(`[deleteSchool] ${auth.uid} deleting school ${schoolId} (${school.name ?? 'unnamed'})`);
    // 1. Delete Firebase Auth accounts for this school's users (super_admin accounts,
    //    which never carry a schoolId, are naturally excluded from this query).
    const usersSnap = await db.collection('users').where('schoolId', '==', schoolId).get();
    const uids = usersSnap.docs.map(d => d.id);
    let authAccountsDeleted = 0;
    for (let i = 0; i < uids.length; i += 1000) {
        const chunk = uids.slice(i, i + 1000);
        if (chunk.length === 0)
            continue;
        try {
            const result = await (0, auth_1.getAuth)().deleteUsers(chunk);
            authAccountsDeleted += result.successCount;
            if (result.errors.length) {
                console.warn(`[deleteSchool] ${result.errors.length} Auth deletions failed:`, result.errors.map(e => e.error.message));
            }
        }
        catch (err) {
            console.error('[deleteSchool] Auth batch deletion failed:', err.message);
        }
    }
    // 2. Cascade-delete (or mark-preserved) every school-scoped collection.
    const deletionsByCollection = {};
    const collectionErrors = [];
    for (const col of SCHOOL_SCOPED_COLLECTIONS) {
        try {
            const snap = await db.collection(col).where('schoolId', '==', schoolId).get();
            if (snap.empty)
                continue;
            const preserve = !!preserveFinancial && FINANCIAL_COLLECTIONS.includes(col);
            const writer = db.bulkWriter();
            writer.onWriteError((err) => {
                console.error(`[deleteSchool] bulkWriter error in ${col}:`, err.message);
                return err.failedAttempts < 3;
            });
            for (const docSnap of snap.docs) {
                if (preserve) {
                    writer.update(docSnap.ref, {
                        schoolDeleted: true,
                        deletedAt: firestore_1.Timestamp.now(),
                        deletedBy: auth.uid,
                    });
                }
                else {
                    writer.delete(docSnap.ref);
                }
            }
            await writer.close();
            deletionsByCollection[col] = snap.size;
        }
        catch (err) {
            console.error(`[deleteSchool] Failed to process collection ${col}:`, err.message);
            collectionErrors.push({ collection: col, error: err.message ?? String(err) });
        }
    }
    // 2b. fcm_tokens are keyed by uid (not schoolId) — clean up per deleted user.
    try {
        await Promise.all(uids.map(uid => db.doc(`fcm_tokens/${uid}`).delete()));
    }
    catch (err) {
        collectionErrors.push({ collection: 'fcm_tokens', error: err.message ?? String(err) });
    }
    // 3. Standalone documents keyed by schoolId.
    for (const col of DOCUMENT_COLLECTIONS) {
        try {
            await db.doc(`${col}/${schoolId}`).delete();
        }
        catch (err) {
            collectionErrors.push({ collection: col, error: err.message ?? String(err) });
        }
    }
    // 4. Google Workspace integration subcollection doc.
    try {
        await db.doc(`schools/${schoolId}/integrations/google`).delete();
    }
    catch (err) {
        collectionErrors.push({ collection: 'integrations/google', error: err.message ?? String(err) });
    }
    // 5. school_slugs entries pointing at this schoolId (doc id is the slug, not the schoolId).
    try {
        const slugSnap = await db.collection('school_slugs').where('schoolId', '==', schoolId).get();
        await Promise.all(slugSnap.docs.map(d => d.ref.delete()));
    }
    catch (err) {
        collectionErrors.push({ collection: 'school_slugs', error: err.message ?? String(err) });
    }
    // 6. The school document itself, last.
    await schoolRef.delete();
    // 7. Audit log — the single authoritative record of this deletion.
    const auditLogRef = await db.collection('audit_log').add({
        schoolId,
        schoolName: school.name ?? null,
        actorId: auth.uid,
        actorEmail: actor.email ?? null,
        actorRole: actor.role ?? null,
        action: 'school.delete',
        schoolSnapshot: {
            status: school.status ?? null,
            subscriptionPlan: school.subscriptionPlan ?? null,
            adminEmail: school.adminEmail ?? null,
            createdAt: school.createdAt ?? null,
        },
        summary: {
            deletionsByCollection,
            totalDocumentsDeleted: Object.values(deletionsByCollection).reduce((a, b) => a + b, 0),
            authAccountsDeleted,
            preservedFinancial: !!preserveFinancial,
            errors: collectionErrors,
        },
        createdAt: firestore_1.Timestamp.now(),
    });
    console.log(`[deleteSchool] Complete. ${authAccountsDeleted} auth accounts, ` +
        `${Object.values(deletionsByCollection).reduce((a, b) => a + b, 0)} documents deleted.`);
    return {
        success: true,
        deletionsByCollection,
        authAccountsDeleted,
        errors: collectionErrors,
        auditLogId: auditLogRef.id,
    };
});
/**
 * sendTransactionalEmail — render a template and send it via Resend.
 *
 * Caller must be authenticated and belong to the same school as the
 * action being triggered (admin/School_admin/teacher for most templates;
 * accountant for fee reminders). Super admin may send to any school.
 *
 * API key: stored as Firebase secret RESEND_API_KEY.
 * Set it once with: firebase functions:secrets:set RESEND_API_KEY
 */
exports.sendTransactionalEmail = (0, https_1.onCall)({ secrets: [resendService_1.resendApiKey] }, async (request) => {
    const { auth, data } = request;
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Sign-in required.');
    const { template, data: templateData, to } = data ?? {};
    if (!template || !to) {
        throw new https_1.HttpsError('invalid-argument', 'template and to are required.');
    }
    // Load actor profile for auth check
    const db = (0, firestore_1.getFirestore)();
    const actorSnap = await db.doc(`users/${auth.uid}`).get();
    const actor = actorSnap.data();
    if (!actor)
        throw new https_1.HttpsError('not-found', 'Caller profile not found.');
    // Only staff roles (admin, teacher, hr, accountant, super_admin) may send email
    const ALLOWED_ROLES = ['super_admin', 'admin', 'School_admin', 'teacher', 'accountant', 'hr'];
    if (!ALLOWED_ROLES.includes(actor.role)) {
        throw new https_1.HttpsError('permission-denied', 'Insufficient role to send email.');
    }
    // Render template
    let subject;
    let html;
    if (template === 'raw') {
        subject = templateData.subject;
        html = templateData.html;
        if (!subject || !html) {
            throw new https_1.HttpsError('invalid-argument', 'Raw email requires subject and html.');
        }
    }
    else {
        const branding = {
            schoolName: templateData.schoolName ?? 'Avenir SIS',
            primaryColor: templateData.primaryColor,
            appUrl: templateData.appUrl,
        };
        const d = { ...templateData, branding };
        switch (template) {
            case 'admissionApproved':
                ({ subject, html } = templates.admissionApproved(d));
                break;
            case 'admissionRejected':
                ({ subject, html } = templates.admissionRejected(d));
                break;
            case 'feeReminder':
                ({ subject, html } = templates.feeReminder(d));
                break;
            case 'staffWelcome':
                ({ subject, html } = templates.staffWelcome(d));
                break;
            case 'parentNotification':
                ({ subject, html } = templates.parentNotification(d));
                break;
            case 'attendanceAlert':
                ({ subject, html } = templates.attendanceAlert(d));
                break;
            case 'reportCardReady':
                ({ subject, html } = templates.reportCardReady(d));
                break;
            case 'schoolSuspended':
                ({ subject, html } = templates.schoolSuspended(d));
                break;
            case 'demoProvisioned':
                ({ subject, html } = templates.demoProvisioned(d));
                break;
            case 'platformInvoice':
                ({ subject, html } = templates.platformInvoice(d));
                break;
            default:
                throw new https_1.HttpsError('invalid-argument', `Unknown template: ${template}`);
        }
    }
    try {
        const result = await (0, resendService_1.sendEmail)({ to, subject, html, tags: [{ name: 'template', value: template }] });
        // Audit log
        await db.collection('audit_log').add({
            schoolId: actor.schoolId ?? null,
            actorId: auth.uid,
            actorEmail: actor.email ?? null,
            actorRole: actor.role ?? null,
            action: 'email.sent',
            details: { template, to, subject, resendId: result.id },
            createdAt: firestore_1.Timestamp.now(),
        });
        return { id: result.id };
    }
    catch (error) {
        console.error('[sendTransactionalEmail]', error);
        throw new https_1.HttpsError('internal', `Email send failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
});
//# sourceMappingURL=index.js.map