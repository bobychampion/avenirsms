/**
 * Google Classroom Service
 *
 * Implements course synchronisation between Avenir SMS and Google Classroom.
 * Maps AVENIR SchoolClass records to Google Classroom courses via the
 * school's connected Google Workspace access token.
 */

import { getValidAccessToken } from './googleTokenService';

const CLASSROOM_BASE = 'https://classroom.googleapis.com/v1';

/** Minimal shape returned by the Classroom API for a course */
export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
  description?: string;
  room?: string;
  courseState: 'ACTIVE' | 'ARCHIVED' | 'PROVISIONED' | 'DECLINED' | 'SUSPENDED';
  alternateLink?: string;
}

/** Input shape for creating / updating a classroom course */
export interface SchoolClassInput {
  /** Class name, e.g. "JSS 2A" */
  name: string;
  /** Academic session, e.g. "2025/2026" */
  section?: string;
  /** Optional description */
  description?: string;
  /** Optional room/location */
  room?: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function authHeaders(schoolId: string): Promise<Record<string, string>> {
  const token = await getValidAccessToken(schoolId);
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function buildCourseBody(cls: SchoolClassInput) {
  return {
    name: cls.name,
    section: cls.section,
    description: cls.description
      ? `${cls.description}\n\n[Synced from Avenir SMS]`
      : '[Synced from Avenir SMS]',
    ...(cls.room ? { room: cls.room } : {}),
  };
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Create a new active course in Google Classroom.
 * Returns the Google Classroom course ID to be stored in Firestore.
 */
export async function createCourse(
  schoolId: string,
  cls: SchoolClassInput
): Promise<string> {
  const url = `${CLASSROOM_BASE}/courses`;
  const headers = await authHeaders(schoolId);

  // Do NOT include courseState on create — setting ACTIVE directly requires a
  // Google Workspace for Education teacher account and returns 403 for other
  // account types (@CourseStateDenied). Let Google create the course in its
  // default PROVISIONED state, then try to activate it as a separate step.
  const body = {
    ...buildCourseBody(cls),
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

  const data = (await res.json()) as ClassroomCourse;
  const courseId = data.id;

  // Attempt to activate the course. This may fail on personal Gmail accounts
  // or non-Education Workspace accounts — that's acceptable; the course still
  // exists in PROVISIONED state and is fully usable by teachers and students.
  try {
    const activateUrl = `${CLASSROOM_BASE}/courses/${encodeURIComponent(courseId)}?updateMask=courseState`;
    const activateRes = await fetch(activateUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ courseState: 'ACTIVE' }),
    });
    if (!activateRes.ok) {
      console.warn(`Classroom: course ${courseId} created but could not be activated (${activateRes.status}) — staying in PROVISIONED state.`);
    }
  } catch (e) {
    console.warn('Classroom: course activation attempt failed, course stays PROVISIONED:', e);
  }

  return courseId;
}

/**
 * Update an existing Google Classroom course's name, section, and description.
 */
export async function updateCourse(
  schoolId: string,
  courseId: string,
  cls: SchoolClassInput
): Promise<void> {
  const updateMask = 'name,section,description';
  const url = `${CLASSROOM_BASE}/courses/${encodeURIComponent(courseId)}?updateMask=${updateMask}`;
  const headers = await authHeaders(schoolId);
  const body = buildCourseBody(cls);

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
export async function archiveCourse(
  schoolId: string,
  courseId: string
): Promise<void> {
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
export async function listCourses(
  schoolId: string,
  pageSize = 100
): Promise<ClassroomCourse[]> {
  const url = `${CLASSROOM_BASE}/courses?courseStates=ACTIVE&pageSize=${pageSize}`;
  const headers = await authHeaders(schoolId);

  const res = await fetch(url, { method: 'GET', headers });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Classroom listCourses failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as { courses?: ClassroomCourse[] };
  return data.courses ?? [];
}
