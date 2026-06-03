"use strict";
/**
 * Google Connection Verification Service
 *
 * Tests API access to enabled Google services by making minimal API calls.
 * These verification calls confirm that OAuth tokens have the correct permissions.
 *
 * @module functions/google/googleVerificationService
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyDrive = verifyDrive;
exports.verifyCalendar = verifyCalendar;
exports.verifyClassroom = verifyClassroom;
exports.verifyGmail = verifyGmail;
exports.updateServiceStatus = updateServiceStatus;
exports.verifyConnection = verifyConnection;
const firestore_1 = require("firebase-admin/firestore");
const googleTokenService_1 = require("./googleTokenService");
/**
 * Verify Google Drive API access
 *
 * Makes a minimal API call to Google Drive API (files.list with pageSize=1)
 * to confirm that the OAuth token has the required Drive permissions.
 *
 * **Validates: Requirements 6.1, 6.2**
 *
 * @param schoolId - The school ID for which to verify Drive access
 * @returns Verification result indicating success or error
 */
async function verifyDrive(schoolId) {
    try {
        const accessToken = await (0, googleTokenService_1.getValidAccessToken)(schoolId);
        const response = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                error: `Drive API call failed: ${response.status} ${errorText}`,
            };
        }
        // Successfully called Drive API
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Verify Google Calendar API access
 *
 * Makes a minimal API call to Google Calendar API (calendarList.list)
 * to confirm that the OAuth token has the required Calendar permissions.
 *
 * **Validates: Requirements 6.1, 6.3**
 *
 * @param schoolId - The school ID for which to verify Calendar access
 * @returns Verification result indicating success or error
 */
async function verifyCalendar(schoolId) {
    try {
        const accessToken = await (0, googleTokenService_1.getValidAccessToken)(schoolId);
        const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                error: `Calendar API call failed: ${response.status} ${errorText}`,
            };
        }
        // Successfully called Calendar API
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Verify Google Classroom API access
 *
 * Makes a minimal API call to Google Classroom API (courses.list with pageSize=1)
 * to confirm that the OAuth token has the required Classroom permissions.
 *
 * **Validates: Requirements 6.1, 6.4**
 *
 * @param schoolId - The school ID for which to verify Classroom access
 * @returns Verification result indicating success or error
 */
async function verifyClassroom(schoolId) {
    try {
        const accessToken = await (0, googleTokenService_1.getValidAccessToken)(schoolId);
        const response = await fetch('https://classroom.googleapis.com/v1/courses?pageSize=1', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                error: `Classroom API call failed: ${response.status} ${errorText}`,
            };
        }
        // Confirm the token has WRITE scope, not just read-only.
        // A readonly token passes the GET above but fails when creating/updating courses.
        const db = (0, firestore_1.getFirestore)();
        const integrationSnap = await db
            .doc(`schools/${schoolId}/integrations/google`)
            .get();
        const storedScopes = integrationSnap.data()?.tokens?.scopes ?? [];
        const hasWriteScope = storedScopes.some((s) => s.includes('classroom.courses') && !s.includes('readonly'));
        if (!hasWriteScope) {
            return {
                success: false,
                error: 'Token only has read-only Classroom access. Please click Reconnect in Integration Settings to grant write permissions.',
            };
        }
        // Successfully called Classroom API with write-capable token
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Verify Gmail API access
 *
 * Makes a minimal API call to Gmail API (users.getProfile)
 * to confirm that the OAuth token has the required Gmail permissions.
 *
 * **Validates: Requirements 6.1, 6.5**
 *
 * @param schoolId - The school ID for which to verify Gmail access
 * @returns Verification result indicating success or error
 */
async function verifyGmail(schoolId) {
    try {
        const accessToken = await (0, googleTokenService_1.getValidAccessToken)(schoolId);
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                error: `Gmail API call failed: ${response.status} ${errorText}`,
            };
        }
        // Successfully called Gmail API
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Update service status in Firestore
 *
 * Updates the status and error fields for a specific Google service in the
 * school's integration document. Sets status to 'connected' on success or
 * 'error' on failure, and stores any error messages.
 *
 * **Validates: Requirements 6.6, 6.7**
 *
 * @param schoolId - The school ID for which to update service status
 * @param service - The service name (drive, calendar, classroom, gmail, meet)
 * @param result - Verification result containing success flag and optional error
 * @returns Promise that resolves when status is updated
 */
async function updateServiceStatus(schoolId, service, result) {
    const db = (0, firestore_1.getFirestore)();
    const integrationRef = db
        .collection('schools')
        .doc(schoolId)
        .collection('integrations')
        .doc('google');
    const updateData = {
        [`status.${service}`]: result.success ? 'connected' : 'error',
        updatedAt: firestore_1.Timestamp.now(),
    };
    // Store error message if verification failed
    if (!result.success && result.error) {
        updateData[`errors.${service}`] = result.error;
    }
    else if (result.success) {
        // Clear error message on success
        updateData[`errors.${service}`] = null;
    }
    await integrationRef.set(updateData, { merge: true });
}
/**
 * Verify connection to all enabled Google services
 *
 * Orchestrates verification of all enabled services by:
 * 1. Reading the integration document to determine which services are enabled
 * 2. Testing API access for each enabled service
 * 3. Updating service status in Firestore
 * 4. Updating lastVerifiedAt timestamp
 *
 * Services that are not enabled are skipped and their status remains 'not_enabled'.
 *
 * **Validates: Requirements 6.1, 6.6, 6.7, 6.8**
 *
 * @param schoolId - The school ID for which to verify connection
 * @returns Verification results for all tested services
 * @throws Error if integration document does not exist
 */
async function verifyConnection(schoolId) {
    const db = (0, firestore_1.getFirestore)();
    const integrationRef = db
        .collection('schools')
        .doc(schoolId)
        .collection('integrations')
        .doc('google');
    // Get integration document to check which services are enabled
    const integrationDoc = await integrationRef.get();
    if (!integrationDoc.exists) {
        throw new Error(`No Google integration found for school ${schoolId}`);
    }
    const integration = integrationDoc.data();
    const enabledServices = integration?.enabledServices || {};
    const results = {};
    // Test Drive if enabled
    if (enabledServices.drive) {
        const driveResult = await verifyDrive(schoolId);
        results.drive = driveResult;
        await updateServiceStatus(schoolId, 'drive', driveResult);
    }
    // Test Calendar if enabled
    if (enabledServices.calendar) {
        const calendarResult = await verifyCalendar(schoolId);
        results.calendar = calendarResult;
        await updateServiceStatus(schoolId, 'calendar', calendarResult);
    }
    // Test Classroom if enabled
    if (enabledServices.classroom) {
        const classroomResult = await verifyClassroom(schoolId);
        results.classroom = classroomResult;
        await updateServiceStatus(schoolId, 'classroom', classroomResult);
    }
    // Test Gmail if enabled
    if (enabledServices.gmail) {
        const gmailResult = await verifyGmail(schoolId);
        results.gmail = gmailResult;
        await updateServiceStatus(schoolId, 'gmail', gmailResult);
    }
    // Update lastVerifiedAt timestamp
    await integrationRef.set({
        lastVerifiedAt: firestore_1.Timestamp.now(),
        updatedAt: firestore_1.Timestamp.now(),
    }, { merge: true });
    // Determine overall success (all tested services succeeded)
    const allSuccess = Object.values(results).every(result => result.success);
    return {
        success: allSuccess,
        results,
    };
}
//# sourceMappingURL=googleVerificationService.js.map