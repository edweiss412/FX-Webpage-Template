/**
 * Minute-of-day for a clock string in EITHER the sheet (`normClock`,
 * lib/parser/blocks/scheduleTimes.ts) or agenda (`fmtClock`,
 * lib/agenda/extractAgendaSchedule.ts) format. For a range ("9:00 AM – 9:40 AM")
 * the START is used. Returns null on anything it cannot confidently place
 * (no meridiem, trailing content, or an impossible hour/minute).
 *
 * Mirrors the private `toMin` in extractAgendaSchedule.ts: 12 AM→0, 12 PM→720.
 * Range-validated because normalizeAgendaExtraction only requires a non-empty
 * `session.time` string, so corrupt JSONB ("13:75 AM") must not become a number.
 */
export function clockToMinutes(raw: string): number | null {
  const head = raw.split(/[–—-]/)[0]?.trim() ?? "";
  const m = head.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  const ap = m[3]!.toUpperCase();
  if (h < 1 || h > 12 || mm > 59) return null;
  return ((h % 12) + (ap === "PM" ? 12 : 0)) * 60 + mm;
}
