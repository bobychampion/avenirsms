/**
 * useLinkedChildren — single source of truth for "which students is the
 * signed-in guardian linked to?".
 *
 * Before this hook there were three separate implementations (ParentPortal,
 * ParentMobileHome, ParentCheckInWidget) that each matched on a different
 * subset of the four link fields and handled query failures differently, so
 * the same parent could legitimately see 2 children on one screen and 0 on
 * another. Everything parent-facing should use this hook instead.
 *
 * A student is linked to a guardian by any of four fields, and PRIMARY and
 * SECONDARY guardians are treated identically:
 *   guardianEmail  / guardianUserId   (primary)
 *   guardian2Email / guardian2UserId  (secondary)
 *
 * Each field gets its own realtime listener and its own error handler: a
 * single denied/failed query must never wipe out results the others found.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { useSchoolId } from './useSchoolId';
import { Student } from '../types';

export type LinkedChild = Student & { id: string };

export interface UseLinkedChildrenResult {
  children: LinkedChild[];
  loading: boolean;
  /** True when every underlying listener errored — lets callers tell "no children" apart from "couldn't load". */
  failed: boolean;
}

export function useLinkedChildren(): UseLinkedChildrenResult {
  const { user } = useAuth();
  const schoolId = useSchoolId();
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const email = user?.email ?? null;
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!schoolId || !uid) {
      setChildren([]);
      setLoading(false);
      return;
    }

    // Stored guardian emails aren't guaranteed to be lowercased (admission
    // normalises them, but a later manual edit on the student profile may not),
    // and Firestore equality is case-sensitive — so match both spellings when
    // they differ.
    const emails = email
      ? Array.from(new Set([email, email.toLowerCase()]))
      : [];

    const matchers: { field: string; value: string }[] = [
      { field: 'guardianUserId', value: uid },
      { field: 'guardian2UserId', value: uid },
      ...emails.flatMap(e => ([
        { field: 'guardianEmail', value: e },
        { field: 'guardian2Email', value: e },
      ])),
    ];

    // Per-matcher result buckets, merged and de-duplicated by document id.
    const buckets: Record<number, LinkedChild[]> = {};
    let settled = 0;
    let errored = 0;

    const publish = () => {
      const map = new Map<string, LinkedChild>();
      Object.values(buckets).forEach(list => list.forEach(s => map.set(s.id, s)));
      setChildren(Array.from(map.values()));
      setFailed(errored === matchers.length);
      setLoading(false);
    };

    const unsubs = matchers.map((m, i) => {
      buckets[i] = [];
      return onSnapshot(
        query(collection(db, 'students'), where('schoolId', '==', schoolId), where(m.field, '==', m.value)),
        snap => {
          buckets[i] = snap.docs.map(d => ({ id: d.id, ...d.data() } as LinkedChild));
          settled++;
          publish();
        },
        err => {
          // Non-fatal by design — another matcher may still find the children.
          console.warn(`[useLinkedChildren] ${m.field} listener failed:`, err.code);
          buckets[i] = [];
          settled++;
          errored++;
          publish();
        },
      );
    });

    return () => unsubs.forEach(u => u());
  }, [schoolId, uid, email]);

  return { children, loading, failed };
}
