import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  serializeValue, deserializeValue, serializeDoc, deserializeDoc, isTimestampSentinel,
} from './serializers';
import {
  SCHEMA_VERSION, validateManifest, getImportOrder, getCollectionsForTiers,
} from './exportManifest';
import { validateStudentRow } from './csvModules';

describe('serializers', () => {
  it('round-trips Firestore Timestamp', () => {
    const ts = Timestamp.fromDate(new Date('2026-01-15T10:00:00Z'));
    const serialized = serializeValue(ts);
    expect(isTimestampSentinel(serialized)).toBe(true);
    const restored = deserializeValue(serialized) as Timestamp;
    expect(restored.toDate().toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('serializes nested objects', () => {
    const data = { name: 'Test', nested: { count: 2, at: Timestamp.fromDate(new Date('2026-06-01')) } };
    const out = serializeValue(data) as Record<string, unknown>;
    expect(out.name).toBe('Test');
    expect(isTimestampSentinel((out.nested as Record<string, unknown>).at)).toBe(true);
  });

  it('serializeDoc preserves _id and strips doc id field', () => {
    const doc = serializeDoc('abc123', { id: 'ignored', schoolId: 'main', name: 'School' });
    expect(doc._id).toBe('abc123');
    expect(doc.id).toBeUndefined();
    expect(doc.schoolId).toBe('main');
  });

  it('deserializeDoc restores id and data', () => {
    const { id, data } = deserializeDoc({ _id: 'x1', schoolId: 'main', score: 90 });
    expect(id).toBe('x1');
    expect(data.schoolId).toBe('main');
    expect(data.score).toBe(90);
  });
});

describe('exportManifest', () => {
  it('validates a correct manifest', () => {
    const m = validateManifest({
      schemaVersion: SCHEMA_VERSION,
      schoolId: 'main',
      schoolName: 'Test School',
      exportedAt: new Date().toISOString(),
      exportedBy: 'admin@test.com',
      tiers: [1],
      collections: { students: 10 },
      warnings: [],
    });
    expect(m?.schoolId).toBe('main');
  });

  it('rejects wrong schema version', () => {
    expect(validateManifest({ schemaVersion: '0.1' })).toBeNull();
  });

  it('orders imports with classes before students', () => {
    const order = getImportOrder(['grades', 'students', 'classes', 'staff']);
    expect(order.indexOf('classes')).toBeLessThan(order.indexOf('students'));
    expect(order.indexOf('students')).toBeLessThan(order.indexOf('grades'));
  });

  it('includes tier 2 collections when tier 2 selected', () => {
    const cols = getCollectionsForTiers([2]);
    expect(cols.some(c => c.name === 'students')).toBe(true);
    expect(cols.some(c => c.name === 'invoices')).toBe(true);
    expect(cols.some(c => c.name === 'library_books')).toBe(false);
  });

  it('includes tier 3 when max tier is 3', () => {
    const cols = getCollectionsForTiers([3]);
    expect(cols.some(c => c.name === 'library_books')).toBe(true);
  });
});

describe('validateStudentRow', () => {
  it('requires student name and class', () => {
    expect(validateStudentRow({ studentName: '', gender: 'male', currentClass: 'JSS 1' } as never, 2)).toContain('name');
    expect(validateStudentRow({ studentName: 'Ada', gender: 'male', currentClass: '' } as never, 2)).toContain('Class');
  });
});
