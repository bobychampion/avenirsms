import React from 'react';
import { useSchool, useClassSelectOptions } from './SchoolContext';
import { SCHOOL_DIVISIONS, SchoolDivision } from '../types';

interface ClassSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /**
   * Restrict the options to these names (already filtered/ordered by the caller,
   * e.g. a teacher's assigned classes). Accepts class names or bare year-level
   * names. Defaults to every class in the school.
   */
  options?: string[];
  /** First option, rendered with an empty value. Omit for no placeholder row. */
  placeholder?: string;
  /**
   * First option with an explicit value — for filter selects that use a sentinel
   * like `{ value: 'all', label: 'All Classes' }`. Takes precedence over `placeholder`.
   */
  firstOption?: { value: string; label: string };
  /** Decorate an option's visible label — e.g. append "(cover)". Value stays the name. */
  renderLabel?: (name: string) => string;
}

/**
 * A <select> of class / year-level names that groups options under "Primary" /
 * "Secondary" <optgroup>s when the school has configured a division split
 * (School Settings → Grade / Year Levels → "Secondary starts here"). Falls back
 * to a flat list otherwise, so it is a drop-in replacement for a plain <select>.
 *
 * Options that name a real class are placed by that class's level; anything else
 * (a bare level name, an unknown value) is placed by `divisionOfLevel`.
 */
export function ClassSelect({ options, placeholder, firstOption, renderLabel, ...selectProps }: ClassSelectProps) {
  const { classNames, classNamesByDivision, divisionOfLevel, hasDivisions } = useSchool();
  const label = (c: string) => (renderLabel ? renderLabel(c) : c);
  const pool: string[] = Array.from(new Set<string>(options ?? classNames));

  const firstRow = firstOption
    ? <option value={firstOption.value}>{firstOption.label}</option>
    : placeholder !== undefined ? <option value="">{placeholder}</option> : null;

  if (!hasDivisions) {
    return (
      <select {...selectProps}>
        {firstRow}
        {pool.map(c => <option key={c} value={c}>{label(c)}</option>)}
      </select>
    );
  }

  const primarySet = new Set(classNamesByDivision.Primary);
  const secondarySet = new Set(classNamesByDivision.Secondary);
  const divisionOf = (c: string): SchoolDivision =>
    primarySet.has(c) ? 'Primary' : secondarySet.has(c) ? 'Secondary' : divisionOfLevel(c);

  const buckets: Record<SchoolDivision, string[]> = { Primary: [], Secondary: [] };
  for (const c of pool) buckets[divisionOf(c)].push(c);

  return (
    <select {...selectProps}>
      {firstRow}
      {SCHOOL_DIVISIONS.map(div => (
        buckets[div].length === 0 ? null : (
          <optgroup key={div} label={div}>
            {buckets[div].map(c => <option key={c} value={c}>{label(c)}</option>)}
          </optgroup>
        )
      ))}
    </select>
  );
}

/** Alias for readability when the options are bare year-level names, not class instances. */
export const LevelSelect = ClassSelect;

/**
 * <optgroup>/<option> children for an existing class <select> that already drives
 * its own `value`/`onChange`. Uses `useClassSelectOptions()` (Firestore class docs,
 * duplicate-safe keys) and groups by Primary/Secondary when the school is split.
 * Drop it straight inside a <select>, replacing a `classSelectOptions.map(...)`.
 */
export function ClassOptions({ firstOption, placeholder, exclude }: {
  firstOption?: { value: string; label: string };
  placeholder?: string;
  /** Omit this class value from the list (e.g. "copy timetable to another class"). */
  exclude?: string;
}) {
  const { classNamesByDivision, divisionOfLevel, hasDivisions } = useSchool();
  const opts = useClassSelectOptions().filter(o => o.value !== exclude);

  const first = firstOption
    ? <option value={firstOption.value}>{firstOption.label}</option>
    : placeholder !== undefined ? <option value="">{placeholder}</option> : null;

  if (!hasDivisions) {
    return <>{first}{opts.map(o => <option key={o.key} value={o.value}>{o.label}</option>)}</>;
  }

  const primarySet = new Set(classNamesByDivision.Primary);
  const secondarySet = new Set(classNamesByDivision.Secondary);
  const divisionOf = (v: string): SchoolDivision =>
    primarySet.has(v) ? 'Primary' : secondarySet.has(v) ? 'Secondary' : divisionOfLevel(v);

  const buckets: Record<SchoolDivision, typeof opts> = { Primary: [], Secondary: [] };
  for (const o of opts) buckets[divisionOf(o.value)].push(o);

  return (
    <>
      {first}
      {SCHOOL_DIVISIONS.map(div => (
        buckets[div].length === 0 ? null : (
          <optgroup key={div} label={div}>
            {buckets[div].map(o => <option key={o.key} value={o.value}>{o.label}</option>)}
          </optgroup>
        )
      ))}
    </>
  );
}
