/**
 * Formats a Date object to "YYYY-MM-DD" using local date getters (getFullYear, getMonth, getDate).
 * Never uses toISOString per SPEC §12.1 and A22.
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
