/**
 * Firestore ↔ JSON serialization for export/import bundles.
 */
import { Timestamp } from 'firebase/firestore';

const TIMESTAMP_SENTINEL = '__firestore_timestamp__';

export interface SerializedDoc {
  _id: string;
  [key: string]: unknown;
}

/** Recursively convert Firestore values to JSON-safe primitives. */
export function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Timestamp) {
    return { [TIMESTAMP_SENTINEL]: value.toDate().toISOString() };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return value;
}

/** Convert JSON export values back to Firestore-friendly shapes. */
export function deserializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deserializeValue);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (TIMESTAMP_SENTINEL in obj && typeof obj[TIMESTAMP_SENTINEL] === 'string') {
      return Timestamp.fromDate(new Date(obj[TIMESTAMP_SENTINEL] as string));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deserializeValue(v);
    }
    return out;
  }
  return value;
}

export function serializeDoc(id: string, data: Record<string, unknown>): SerializedDoc {
  const { id: _omit, ...rest } = data;
  return { _id: id, ...serializeValue(rest) as Record<string, unknown> };
}

export function deserializeDoc(doc: SerializedDoc): { id: string; data: Record<string, unknown> } {
  const { _id, ...rest } = doc;
  const data = deserializeValue(rest) as Record<string, unknown>;
  return { id: _id, data };
}

export function isTimestampSentinel(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    TIMESTAMP_SENTINEL in (value as object)
  );
}
