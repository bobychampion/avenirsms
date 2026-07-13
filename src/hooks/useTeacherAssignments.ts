/**
 * useTeacherAssignments — single source of truth for "what can this teacher access".
 *
 * Reads the existing `class_subjects` join collection (teacher <-> class <-> subject)
 * plus `classes.formTutorId` (form-tutor blanket access), and merges them into a
 * simple className -> subjects map. This replaces near-identical assignment-loading
 * logic that used to be duplicated in TeacherPortal.tsx and TeacherMobileAttendance.tsx.
 *
 * '__all__' in a class's subject list means the teacher is that class's form tutor and
 * has blanket access (grading, attendance, etc.) regardless of subject assignment.
 *
 * class_subjects.status is optional for backward compatibility — pre-existing docs
 * (written before session/term/status were added) are treated as active.
 */
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useSchoolId } from './useSchoolId';
import { useEffectiveUid } from './useEffectiveUid';
import { ClassSubject } from '../types';

export interface TeacherAssignments {
  loading: boolean;
  /** Sorted class names this teacher can access (as subject teacher and/or form tutor). */
  assignedClassNames: string[];
  /** className -> subject names this teacher teaches there. ['__all__'] = form tutor. */
  subjectsByClass: Record<string, string[]>;
  /** classId -> class name, for callers that need to resolve ids from class_subjects docs. */
  classIdToName: Record<string, string>;
  /** class name -> classId (inverse of classIdToName), for callers writing records that need a classId FK. */
  classNameToId: Record<string, string>;
  isFormTutor: (className: string) => boolean;
  /** True if the teacher can mark attendance/grades for this class (any subject, or form tutor). */
  canAccessClass: (className: string) => boolean;
  /** True if the teacher teaches this specific subject in this class (or is form tutor). */
  canTeachSubject: (className: string, subjectName: string) => boolean;
  reload: () => void;
}

export function useTeacherAssignments(): TeacherAssignments {
  const uid = useEffectiveUid();
  const schoolId = useSchoolId();
  const [loading, setLoading] = useState(true);
  const [assignedClassNames, setAssignedClassNames] = useState<string[]>([]);
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, string[]>>({});
  const [classIdToName, setClassIdToName] = useState<Record<string, string>>({});
  const [classNameToId, setClassNameToId] = useState<Record<string, string>>({});
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!uid || !schoolId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [subjectSnap, tutorSnap, classSnap] = await Promise.all([
          getDocs(query(collection(db, 'class_subjects'), where('schoolId', '==', schoolId), where('teacherId', '==', uid))),
          getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId), where('formTutorId', '==', uid))),
          getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId))),
        ]);
        if (cancelled) return;

        const idToName: Record<string, string> = {};
        const nameToId: Record<string, string> = {};
        classSnap.docs.forEach(d => {
          const name = (d.data().name as string) || '';
          idToName[d.id] = name;
          if (name) nameToId[name] = d.id;
        });

        const finalByName: Record<string, string[]> = {};

        subjectSnap.docs.forEach(d => {
          const sa = d.data() as ClassSubject;
          if (sa.status === 'inactive') return; // explicit opt-out; missing status = active
          const name = idToName[sa.classId];
          if (!name) return;
          if (!finalByName[name]) finalByName[name] = [];
          if (sa.subjectName && !finalByName[name].includes(sa.subjectName)) {
            finalByName[name].push(sa.subjectName);
          }
        });

        tutorSnap.docs.forEach(d => {
          const name = (d.data().name as string) || '';
          if (name) finalByName[name] = ['__all__'];
        });

        setClassIdToName(idToName);
        setClassNameToId(nameToId);
        setSubjectsByClass(finalByName);
        setAssignedClassNames(Object.keys(finalByName).sort());
      } catch (e) {
        console.warn('useTeacherAssignments: failed to load assignments:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [uid, schoolId, reloadToken]);

  const isFormTutor = (className: string) => (subjectsByClass[className] || []).includes('__all__');
  const canAccessClass = (className: string) => !!subjectsByClass[className]?.length;
  const canTeachSubject = (className: string, subjectName: string) => {
    const subs = subjectsByClass[className] || [];
    return subs.includes('__all__') || subs.includes(subjectName);
  };

  return {
    loading,
    assignedClassNames,
    subjectsByClass,
    classIdToName,
    classNameToId,
    isFormTutor,
    canAccessClass,
    canTeachSubject,
    reload: () => setReloadToken(t => t + 1),
  };
}
