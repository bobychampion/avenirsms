/**
 * Import school data from a versioned JSON ZIP bundle.
 */
import JSZip from 'jszip';
import {
  EXPORT_FOLDER, SETTINGS_DOC, GEOFENCE_DOC,
  getImportOrder, validateManifest,
  type ImportMode, type ExportManifest,
} from './exportManifest';
import { deserializeDoc, type SerializedDoc } from './serializers';
import {
  batchWriteDocs, writeSettingsDoc, writeGeofenceDoc,
  deleteCollectionForSchool,
} from './batchWriter';

export interface ImportProgress {
  collection: string;
  written: number;
  total: number;
  skipped: number;
  phase: 'parsing' | 'wiping' | 'importing' | 'done' | 'error';
  error?: string;
}

export interface ImportOptions {
  file: File;
  targetSchoolId: string;
  mode: ImportMode;
  /** Super-admin migration: rewrite schoolId on all imported docs */
  migrateSchoolId?: boolean;
  sourceSchoolId?: string;
  onProgress?: (p: ImportProgress) => void;
}

export interface ImportResult {
  manifest: ExportManifest;
  collections: Record<string, { written: number; skipped: number; errors: string[] }>;
  success: boolean;
}

const WIPE_ORDER = [...getImportOrder([
  'assignment_submissions', 'trip_registrations', 'library_circulation',
  'cbt_sessions', 'grades', 'attendance', 'student_skills', 'assignments',
  'guardians', 'students', 'staff', 'class_subjects', 'classes', 'subjects',
  'invoices', 'fee_payments', 'expenses', 'payroll', 'leave_requests',
  'leave_entitlements', 'applications', 'promotions', 'lifecycle_events',
  'timetables', 'events', 'exams', 'exam_seating', 'question_bank',
  'cbt_exams', 'pins', 'library_books', 'absence_requests', 'cover_assignments',
  'school_trips', 'hr_policies', 'onboarding_records', 'curriculum_documents',
  'curriculum_items', 'behavioral_records', 'alumni_profiles',
])].reverse();

async function parseZip(file: File): Promise<{ manifest: ExportManifest; files: Map<string, SerializedDoc[] | SerializedDoc> }> {
  const zip = await JSZip.loadAsync(file);
  const folder = zip.folder(EXPORT_FOLDER);
  if (!folder) throw new Error(`Invalid export: missing ${EXPORT_FOLDER}/ folder`);

  const manifestFile = folder.file('manifest.json');
  if (!manifestFile) throw new Error('Invalid export: missing manifest.json');

  const manifestRaw = JSON.parse(await manifestFile.async('string'));
  const manifest = validateManifest(manifestRaw);
  if (!manifest) throw new Error('Invalid or unsupported manifest schema version');

  const files = new Map<string, SerializedDoc[] | SerializedDoc>();

  for (const [name, count] of Object.entries(manifest.collections)) {
    const jsonFile = folder.file(`${name}.json`);
    if (!jsonFile) continue;
    const raw = JSON.parse(await jsonFile.async('string'));
    if (name === SETTINGS_DOC || name === GEOFENCE_DOC) {
      files.set(name, raw as SerializedDoc);
    } else {
      files.set(name, raw as SerializedDoc[]);
    }
  }

  return { manifest, files };
}

function applySchoolId(
  data: Record<string, unknown>,
  targetSchoolId: string,
  migrate: boolean
): Record<string, unknown> {
  if (!migrate) return { ...data, schoolId: targetSchoolId };
  return { ...data, schoolId: targetSchoolId };
}

export async function importSchoolData(options: ImportOptions): Promise<ImportResult> {
  const { file, targetSchoolId, mode, migrateSchoolId, onProgress } = options;
  const sourceSchoolId = options.sourceSchoolId;

  onProgress?.({ collection: 'manifest', written: 0, total: 1, skipped: 0, phase: 'parsing' });
  const { manifest, files } = await parseZip(file);
  const effectiveSource = sourceSchoolId ?? manifest.schoolId;
  const shouldMigrate = migrateSchoolId ?? (effectiveSource !== targetSchoolId);

  const results: ImportResult['collections'] = {};

  if (mode === 'replace') {
    onProgress?.({ collection: 'wipe', written: 0, total: WIPE_ORDER.length, skipped: 0, phase: 'wiping' });
    for (const col of WIPE_ORDER) {
      if (files.has(col)) {
        await deleteCollectionForSchool(col, targetSchoolId);
      }
    }
  }

  const collectionNames = [...files.keys()].filter(
    n => n !== SETTINGS_DOC && n !== GEOFENCE_DOC
  );
  const ordered = getImportOrder(collectionNames);

  for (const colName of ordered) {
    const raw = files.get(colName);
    if (!raw || !Array.isArray(raw)) continue;

    const records = raw.map(d => {
      const { id, data } = deserializeDoc(d);
      return {
        id,
        data: applySchoolId(data, targetSchoolId, shouldMigrate),
      };
    });

    onProgress?.({
      collection: colName, written: 0, total: records.length, skipped: 0, phase: 'importing',
    });

    const result = await batchWriteDocs(colName, records, mode, (p) => {
      onProgress?.({ ...p, phase: 'importing' });
    });
    results[colName] = result;
  }

  // Settings doc
  const settingsRaw = files.get(SETTINGS_DOC);
  if (settingsRaw && !Array.isArray(settingsRaw)) {
    const { data } = deserializeDoc(settingsRaw);
    const settingsData = applySchoolId(
      { ...data, schoolName: data.schoolName ?? manifest.schoolName },
      targetSchoolId,
      shouldMigrate
    );
    await writeSettingsDoc(targetSchoolId, settingsData, mode);
    results[SETTINGS_DOC] = { written: 1, skipped: 0, errors: [] };
  }

  const geofenceRaw = files.get(GEOFENCE_DOC);
  if (geofenceRaw && !Array.isArray(geofenceRaw)) {
    const { data } = deserializeDoc(geofenceRaw);
    await writeGeofenceDoc(targetSchoolId, data, mode);
    results[GEOFENCE_DOC] = { written: 1, skipped: 0, errors: [] };
  }

  onProgress?.({ collection: 'done', written: 0, total: 0, skipped: 0, phase: 'done' });

  const hasErrors = Object.values(results).some(r => r.errors.length > 0);
  return { manifest, collections: results, success: !hasErrors };
}

export async function previewImport(file: File): Promise<ExportManifest> {
  const { manifest } = await parseZip(file);
  return manifest;
}
