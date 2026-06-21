/**
 * Export school data to a versioned JSON ZIP bundle.
 */
import JSZip from 'jszip';
import {
  collection, query, where, getDocs, doc, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  SCHEMA_VERSION, EXPORT_FOLDER, EXPORT_WARNINGS,
  getCollectionsForTiers, SETTINGS_DOC, GEOFENCE_DOC,
  type ExportTier, type ExportManifest,
} from './exportManifest';
import { serializeDoc, type SerializedDoc } from './serializers';

export interface ExportProgress {
  collection: string;
  count: number;
  phase: 'reading' | 'zipping' | 'done';
}

export interface ExportOptions {
  schoolId: string;
  schoolName: string;
  exportedBy: string;
  tiers: ExportTier[];
  includeGeofence?: boolean;
  onProgress?: (p: ExportProgress) => void;
}

async function fetchCollection(
  name: string,
  schoolId: string
): Promise<SerializedDoc[]> {
  const snap = await getDocs(
    query(collection(db, name), where('schoolId', '==', schoolId))
  );
  return snap.docs.map(d => serializeDoc(d.id, d.data() as Record<string, unknown>));
}

async function fetchSettingsDoc(schoolId: string): Promise<SerializedDoc | null> {
  const snap = await getDoc(doc(db, SETTINGS_DOC, schoolId));
  if (!snap.exists()) return null;
  return serializeDoc(schoolId, snap.data() as Record<string, unknown>);
}

async function fetchGeofenceDoc(schoolId: string): Promise<SerializedDoc | null> {
  const snap = await getDoc(doc(db, GEOFENCE_DOC, schoolId));
  if (!snap.exists()) return null;
  return serializeDoc(schoolId, snap.data() as Record<string, unknown>);
}

export async function exportSchoolData(options: ExportOptions): Promise<Blob> {
  const { schoolId, schoolName, exportedBy, tiers, includeGeofence, onProgress } = options;
  const collections = getCollectionsForTiers(tiers);
  const counts: Record<string, number> = {};
  const zip = new JSZip();
  const folder = zip.folder(EXPORT_FOLDER)!;

  for (const def of collections) {
    onProgress?.({ collection: def.name, count: 0, phase: 'reading' });
    const docs = await fetchCollection(def.name, schoolId);
    counts[def.name] = docs.length;
    folder.file(`${def.name}.json`, JSON.stringify(docs, null, 2));
    onProgress?.({ collection: def.name, count: docs.length, phase: 'reading' });
  }

  const settings = await fetchSettingsDoc(schoolId);
  if (settings) {
    counts[SETTINGS_DOC] = 1;
    folder.file(`${SETTINGS_DOC}.json`, JSON.stringify(settings, null, 2));
  }

  if (includeGeofence) {
    const geofence = await fetchGeofenceDoc(schoolId);
    if (geofence) {
      counts[GEOFENCE_DOC] = 1;
      folder.file(`${GEOFENCE_DOC}.json`, JSON.stringify(geofence, null, 2));
    }
  }

  const manifest: ExportManifest = {
    schemaVersion: SCHEMA_VERSION,
    schoolId,
    schoolName,
    exportedAt: new Date().toISOString(),
    exportedBy,
    tiers,
    collections: counts,
    warnings: EXPORT_WARNINGS,
  };

  folder.file('manifest.json', JSON.stringify(manifest, null, 2));

  onProgress?.({ collection: 'manifest', count: 1, phase: 'zipping' });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  onProgress?.({ collection: 'manifest', count: 1, phase: 'done' });
  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFilename(schoolId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `avenir-export-${schoolId}-${date}.zip`;
}
