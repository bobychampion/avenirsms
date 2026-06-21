/**
 * Firestore batch writer with progress callbacks for import operations.
 */
import {
  writeBatch, doc, collection, getDoc, setDoc, deleteDoc,
  getDocs, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { ImportMode } from './exportManifest';

const BATCH_SIZE = 490;

export interface WriteProgress {
  collection: string;
  written: number;
  total: number;
  skipped: number;
}

export interface BatchWriteResult {
  written: number;
  skipped: number;
  errors: string[];
}

export async function batchWriteDocs(
  collectionName: string,
  records: { id: string; data: Record<string, unknown> }[],
  mode: ImportMode,
  onProgress?: (p: WriteProgress) => void
): Promise<BatchWriteResult> {
  let written = 0;
  let skipped = 0;
  const errors: string[] = [];
  const total = records.length;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    let pendingOps = 0;

    for (const { id, data } of chunk) {
      const ref = doc(collection(db, collectionName), id);
      if (mode === 'merge') {
        const existing = await getDoc(ref);
        if (existing.exists()) {
          skipped++;
          continue;
        }
        batch.set(ref, data);
        written++;
        pendingOps++;
      } else {
        batch.set(ref, data, { merge: mode === 'upsert' });
        written++;
        pendingOps++;
      }
    }

    if (pendingOps > 0) {
      try {
        await batch.commit();
      } catch (err) {
        errors.push(`${collectionName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    onProgress?.({ collection: collectionName, written, total, skipped });
  }

  return { written, skipped, errors };
}

export async function writeSettingsDoc(
  docId: string,
  data: Record<string, unknown>,
  mode: ImportMode
): Promise<boolean> {
  const ref = doc(db, 'school_settings', docId);
  if (mode === 'merge') {
    const existing = await getDoc(ref);
    if (existing.exists()) return false;
  }
  await setDoc(ref, data, mode === 'upsert' ? { merge: true } : undefined);
  return true;
}

export async function writeGeofenceDoc(
  docId: string,
  data: Record<string, unknown>,
  mode: ImportMode
): Promise<boolean> {
  const ref = doc(db, 'geofences', docId);
  if (mode === 'merge') {
    const existing = await getDoc(ref);
    if (existing.exists()) return false;
  }
  await setDoc(ref, data, mode === 'upsert' ? { merge: true } : undefined);
  return true;
}

export async function deleteCollectionForSchool(
  collectionName: string,
  schoolId: string
): Promise<number> {
  const snap = await getDocs(
    query(collection(db, collectionName), where('schoolId', '==', schoolId))
  );
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = snap.docs.slice(i, i + BATCH_SIZE);
    for (const d of chunk) {
      batch.delete(d.ref);
      deleted++;
    }
    await batch.commit();
  }
  return deleted;
}

export async function deleteDocById(collectionName: string, docId: string): Promise<void> {
  await deleteDoc(doc(db, collectionName, docId));
}
