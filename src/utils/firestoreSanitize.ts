/** Firestore rejects `undefined` field values — remove those keys before set/update. */
export function stripUndefined<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data };
  for (const key of Object.keys(out) as (keyof T)[]) {
    if (out[key] === undefined) {
      delete out[key];
    }
  }
  return out;
}
