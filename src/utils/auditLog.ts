/**
 * Append-only audit trail for sensitive RBAC changes.
 * Reads/writes the `audit_log/{entryId}` collection (see firestore.rules).
 *
 * Use this whenever an admin changes a user's role or grants/revokes
 * permissions — the audit log is the only durable record of who promoted
 * whom and when. Failures are logged to console but never thrown, so a
 * broken audit write cannot block the underlying RBAC change.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserProfile } from '../types';
import type { Permission } from './permissions';

export type AuditAction =
  | 'role.change'
  | 'permission.grant'
  | 'permission.revoke'
  | 'user.disable'
  | 'user.enable'
  | 'user.delete'
  | 'school.suspend'
  | 'password.reset';

export interface AuditEntry {
  schoolId?: string;
  actorId: string;
  actorEmail?: string;
  actorRole?: UserProfile['role'];
  action: AuditAction;
  targetUserId?: string;
  targetUserEmail?: string;
  /** Free-form payload — for role changes: { from, to }. For permission changes: { permission }. */
  details?: Record<string, unknown>;
  createdAt?: unknown;
}

export async function writeAuditLog(actor: UserProfile, entry: Omit<AuditEntry, 'actorId' | 'actorRole' | 'actorEmail' | 'createdAt'>): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_log'), {
      ...entry,
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      schoolId: entry.schoolId ?? actor.schoolId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}

/** Convenience wrapper for the most common case: role change. */
export function logRoleChange(actor: UserProfile, target: { uid: string; email?: string; schoolId?: string }, from: UserProfile['role'], to: UserProfile['role']) {
  return writeAuditLog(actor, {
    action: 'role.change',
    targetUserId: target.uid,
    targetUserEmail: target.email,
    schoolId: target.schoolId,
    details: { from, to },
  });
}

/** Convenience wrapper for permission grant/revoke. */
export function logPermissionChange(actor: UserProfile, target: { uid: string; email?: string; schoolId?: string }, permission: Permission, granted: boolean) {
  return writeAuditLog(actor, {
    action: granted ? 'permission.grant' : 'permission.revoke',
    targetUserId: target.uid,
    targetUserEmail: target.email,
    schoolId: target.schoolId,
    details: { permission },
  });
}
