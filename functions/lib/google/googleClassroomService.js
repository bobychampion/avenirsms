"use strict";
/**
 * Google Classroom Service
 *
 * Implements course synchronisation between Avenir SMS and Google Classroom.
 * Maps AVENIR SchoolClass records to Google Classroom courses via the
 * school's connected Google Workspace access token.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCourse = createCourse;
exports.updateCourse = updateCourse;
exports.archiveCourse = archiveCourse;
exports.listCourses = listCourses;
const googleTokenService_1 = require("./googleTokenService");
const CLASSROOM_BASE = 'https://classroom.googleapis.com/v1';
// ─── helpers ──────────────────────────────────────────────────────────────────
async function authHeaders(schoolId) {
    const token = await (0, googleTokenService_1.getValidAccessToken)(schoolId);
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}
function buildCourseBody(cls, includeState = true) {
    return {
        name: cls.name,
        section: cls.section,
        description: cls.description
            ? `${cls.description}\n\n[Synced from Avenir SMS]`
            : '[Synced from Avenir SMS]',
        ...(cls.room ? { room: cls.room } : {}),
        ...(includeState ? { courseState: 'ACTIVE' } : {}),
    };
}
// ─── public API ───────────────────────────────────────────────────────────────
/**
 * Create a new active course in Google Classroom.
 * Returns the Google Classroom course ID to be stored in Firestore.
 */
async function createCourse(schoolId, cls) {
    const url = `${CLASSROOM_BASE}/courses`;
    const headers = await authHeaders(schoolId);
    const body = {
        ...buildCourseBody(cls, true),
        ownerId: 'me',
    };
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Classroom createCourse failed (${res.status}): ${err}`);
    }
    const data = (await res.json());
    return data.id;
}
/**
 * Update an existing Google Classroom course's name, section, and description.
 */
async function updateCourse(schoolId, courseId, cls) {
    const updateMask = 'name,section,description';
    const url = `${CLASSROOM_BASE}/courses/${encodeURIComponent(courseId)}?updateMask=${updateMask}`;
    const headers = await authHeaders(schoolId);
    const body = buildCourseBody(cls, false);
    const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Classroom updateCourse failed (${res.status}): ${err}`);
    }
}
/**
 * Archive a Google Classroom course (safe alternative to deletion).
 * Silently succeeds if the course is already archived or gone (404 / 410).
 */
async function archiveCourse(schoolId, courseId) {
    const url = `${CLASSROOM_BASE}/courses/${encodeURIComponent(courseId)}?updateMask=courseState`;
    const headers = await authHeaders(schoolId);
    const body = { courseState: 'ARCHIVED' };
    const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
    });
    // 404 = already gone, 410 = permanently removed — both are fine
    if (!res.ok && res.status !== 404 && res.status !== 410) {
        const err = await res.text();
        throw new Error(`Classroom archiveCourse failed (${res.status}): ${err}`);
    }
}
/**
 * List active courses accessible to the school's Workspace account.
 */
async function listCourses(schoolId, pageSize = 100) {
    const url = `${CLASSROOM_BASE}/courses?courseStates=ACTIVE&pageSize=${pageSize}`;
    const headers = await authHeaders(schoolId);
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Classroom listCourses failed (${res.status}): ${err}`);
    }
    const data = (await res.json());
    return data.courses ?? [];
}
//# sourceMappingURL=googleClassroomService.js.map