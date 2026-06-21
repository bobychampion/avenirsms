/**
 * Export manifest schema and collection registry for school data portability.
 */

export const SCHEMA_VERSION = '1.0';
export const EXPORT_FOLDER = 'avenir-export-v1';

export type ExportTier = 1 | 2 | 3;

export type CollectionKind = 'collection' | 'settings_doc' | 'geofence_doc';

export interface CollectionDef {
  name: string;
  tier: ExportTier;
  kind: CollectionKind;
  /** Import order — lower runs first */
  importOrder: number;
}

/** Single-document exports keyed by schoolId (not a collection query). */
export const SETTINGS_DOC = 'school_settings';
export const GEOFENCE_DOC = 'geofences';

export const COLLECTION_REGISTRY: CollectionDef[] = [
  // Tier 1 — core academic
  { name: 'classes', tier: 1, kind: 'collection', importOrder: 10 },
  { name: 'subjects', tier: 1, kind: 'collection', importOrder: 20 },
  { name: 'class_subjects', tier: 1, kind: 'collection', importOrder: 30 },
  { name: 'staff', tier: 1, kind: 'collection', importOrder: 40 },
  { name: 'students', tier: 1, kind: 'collection', importOrder: 50 },
  { name: 'guardians', tier: 1, kind: 'collection', importOrder: 60 },
  { name: 'grades', tier: 1, kind: 'collection', importOrder: 70 },
  { name: 'attendance', tier: 1, kind: 'collection', importOrder: 80 },
  { name: 'student_skills', tier: 1, kind: 'collection', importOrder: 90 },
  { name: 'assignments', tier: 1, kind: 'collection', importOrder: 100 },

  // Tier 2 — operations
  { name: 'applications', tier: 2, kind: 'collection', importOrder: 110 },
  { name: 'promotions', tier: 2, kind: 'collection', importOrder: 120 },
  { name: 'lifecycle_events', tier: 2, kind: 'collection', importOrder: 130 },
  { name: 'timetables', tier: 2, kind: 'collection', importOrder: 140 },
  { name: 'events', tier: 2, kind: 'collection', importOrder: 150 },
  { name: 'invoices', tier: 2, kind: 'collection', importOrder: 160 },
  { name: 'fee_payments', tier: 2, kind: 'collection', importOrder: 170 },
  { name: 'expenses', tier: 2, kind: 'collection', importOrder: 180 },
  { name: 'payroll', tier: 2, kind: 'collection', importOrder: 190 },
  { name: 'leave_requests', tier: 2, kind: 'collection', importOrder: 200 },
  { name: 'leave_entitlements', tier: 2, kind: 'collection', importOrder: 210 },

  // Tier 3 — extended
  { name: 'exams', tier: 3, kind: 'collection', importOrder: 220 },
  { name: 'exam_seating', tier: 3, kind: 'collection', importOrder: 230 },
  { name: 'question_bank', tier: 3, kind: 'collection', importOrder: 240 },
  { name: 'cbt_exams', tier: 3, kind: 'collection', importOrder: 250 },
  { name: 'cbt_sessions', tier: 3, kind: 'collection', importOrder: 260 },
  { name: 'pins', tier: 3, kind: 'collection', importOrder: 270 },
  { name: 'library_books', tier: 3, kind: 'collection', importOrder: 280 },
  { name: 'library_circulation', tier: 3, kind: 'collection', importOrder: 290 },
  { name: 'assignment_submissions', tier: 3, kind: 'collection', importOrder: 300 },
  { name: 'absence_requests', tier: 3, kind: 'collection', importOrder: 310 },
  { name: 'cover_assignments', tier: 3, kind: 'collection', importOrder: 320 },
  { name: 'school_trips', tier: 3, kind: 'collection', importOrder: 330 },
  { name: 'trip_registrations', tier: 3, kind: 'collection', importOrder: 340 },
  { name: 'hr_policies', tier: 3, kind: 'collection', importOrder: 350 },
  { name: 'onboarding_records', tier: 3, kind: 'collection', importOrder: 360 },
  { name: 'curriculum_documents', tier: 3, kind: 'collection', importOrder: 370 },
  { name: 'curriculum_items', tier: 3, kind: 'collection', importOrder: 380 },
  { name: 'behavioral_records', tier: 3, kind: 'collection', importOrder: 390 },
  { name: 'alumni_profiles', tier: 3, kind: 'collection', importOrder: 400 },
];

export const EXPORT_WARNINGS = [
  'users not included (Firebase Auth accounts cannot be exported)',
  'google integration tokens not included',
  'fcm_tokens, mail, platform_invoices, demo_requests not included',
];

export type ImportMode = 'merge' | 'upsert' | 'replace';

export interface ExportManifest {
  schemaVersion: string;
  schoolId: string;
  schoolName: string;
  exportedAt: string;
  exportedBy: string;
  tiers: ExportTier[];
  collections: Record<string, number>;
  warnings: string[];
}

export function getCollectionsForTiers(tiers: ExportTier[]): CollectionDef[] {
  const maxTier = Math.max(...tiers);
  return COLLECTION_REGISTRY.filter(c => c.tier <= maxTier);
}

export function getImportOrder(collections: string[]): string[] {
  const orderMap = new Map(COLLECTION_REGISTRY.map(c => [c.name, c.importOrder]));
  return [...collections].sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999));
}

export function validateManifest(data: unknown): ExportManifest | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.schemaVersion !== SCHEMA_VERSION) return null;
  if (typeof m.schoolId !== 'string' || typeof m.schoolName !== 'string') return null;
  if (typeof m.exportedAt !== 'string' || typeof m.exportedBy !== 'string') return null;
  if (!m.collections || typeof m.collections !== 'object') return null;
  return m as unknown as ExportManifest;
}

export function tierLabel(tier: ExportTier): string {
  switch (tier) {
    case 1: return 'Core Academic';
    case 2: return 'Operations';
    case 3: return 'Extended';
    default: return `Tier ${tier}`;
  }
}
