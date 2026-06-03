"use strict";
/**
 * Google Calendar Service
 *
 * Implements event synchronisation between Avenir SMS and Google Calendar.
 * Uses the school's connected Google Workspace access token via googleTokenService.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvent = createEvent;
exports.updateEvent = updateEvent;
exports.deleteEvent = deleteEvent;
const googleTokenService_1 = require("./googleTokenService");
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
// ─── helpers ──────────────────────────────────────────────────────────────────
async function authHeaders(schoolId) {
    const token = await (0, googleTokenService_1.getValidAccessToken)(schoolId);
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}
/** All-day event end date is the calendar day AFTER the start date */
function nextDay(dateStr) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().split('T')[0];
}
function buildGoogleEvent(event) {
    return {
        summary: event.title,
        description: event.description
            ? `${event.description}\n\n[Synced from Avenir SMS — ${event.type}]`
            : `[Synced from Avenir SMS — ${event.type}]`,
        start: { date: event.date },
        end: { date: nextDay(event.date) },
        // Colour coding by event type
        colorId: event.type === 'holiday' ? '11' // red
            : event.type === 'sports' ? '2' // sage
                : event.type === 'academic' ? '9' // blueberry
                    : '8', // graphite
    };
}
// ─── public API ───────────────────────────────────────────────────────────────
/**
 * Create a new all-day event in the school's primary Google Calendar.
 * Returns the Google Calendar event ID to be stored in Firestore.
 */
async function createEvent(schoolId, event) {
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
    const data = (await res.json());
    return data.id;
}
/**
 * Update an existing Google Calendar event.
 */
async function updateEvent(schoolId, googleEventId, event) {
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
async function deleteEvent(schoolId, googleEventId) {
    const url = `${CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(googleEventId)}`;
    const headers = await authHeaders(schoolId);
    const res = await fetch(url, { method: 'DELETE', headers });
    // 204 = deleted, 410 = already gone — both are fine
    if (!res.ok && res.status !== 410) {
        const err = await res.text();
        throw new Error(`Calendar deleteEvent failed (${res.status}): ${err}`);
    }
}
//# sourceMappingURL=googleCalendarService.js.map