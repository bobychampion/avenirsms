/** Display labels saved by older settings forms are not valid Intl identifiers. */
export function supportedSchoolTimeZone(value?: string | null): string | null {
  const input = value?.trim() || 'UTC';
  const zone = ['central european summer time', 'central european standard time', 'central european time'].includes(input.toLowerCase())
    ? 'Europe/Ljubljana' : input;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
  } catch { return null; }
}

/** Keep activity dates usable even when a legacy school setting is malformed. */
export function schoolCalendarDate(timezone?: string | null, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: supportedSchoolTimeZone(timezone) || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
