/**
 * Google Calendar Service
 *
 * Implements event synchronisation between Avenir SMS and Google Calendar.
 * Uses the school's connected Google Workspace access token via googleTokenService.
 */

import { getValidAccessToken } from './googleTokenService.js';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

/** Minimal shape returned by the Calendar API for an event */
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end:   { date?: string; dateTime?: string; timeZone?: string };
  htmlLink?: string;
}

/** Input shape for creating / updating a school event */
export interface SchoolEventInput {
  title: string;
  description?: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  type: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function authHeaders(schoolId: string): Promise<Record<string, string>> {
  const token = await getValidAccessToken(schoolId);
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** All-day event end date is the calendar day AFTER the start date */
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

function buildGoogleEvent(event: SchoolEventInput) {
  return {
    summary: event.title,
    description: event.description
      ? `${event.description}\n\n[Synced from Avenir SMS — ${event.type}]`
      : `[Synced from Avenir SMS — ${event.type}]`,
    start: { date: event.date },
    end:   { date: nextDay(event.date) },
    // Colour coding by event type
    colorId: event.type === 'holiday'  ? '11'  // red
            : event.type === 'sports'  ? '2'   // sage
            : event.type === 'academic'? '9'   // blueberry
            : '8',                             // graphite
  };
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Create a new all-day event in the school's primary Google Calendar.
 * Returns the Google Calendar event ID to be stored in Firestore.
 */
export async function createEvent(
  schoolId: string,
  event: SchoolEventInput
): Promise<string> {
  const url = `${CALENDAR_BASE}/calendars/primary/events`;
  const headers = await authHeaders(schoolId);
  const body = buildGoogleEvent(event);

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Calendar createEvent failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as GoogleCalendarEvent;
  return data.id;
}

/**
 * Update an existing Google Calendar event.
 */
export async function updateEvent(
  schoolId: string,
  googleEventId: string,
  event: SchoolEventInput
): Promise<void> {
  const url = `${CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(googleEventId)}`;
  const headers = await authHeaders(schoolId);
  const body = buildGoogleEvent(event);

  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Calendar updateEvent failed (${res.status}): ${err}`);
  }
}

/**
 * Delete a Google Calendar event.
 * Silently succeeds if the event is already gone (410 Gone).
 */
export async function deleteEvent(
  schoolId: string,
  googleEventId: string
): Promise<void> {
  const url = `${CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(googleEventId)}`;
  const headers = await authHeaders(schoolId);

  const res = await fetch(url, { method: 'DELETE', headers });

  // 204 = deleted, 410 = already gone — both are fine
  if (!res.ok && res.status !== 410) {
    const err = await res.text();
    throw new Error(`Calendar deleteEvent failed (${res.status}): ${err}`);
  }
}
