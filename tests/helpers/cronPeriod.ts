/**
 * Period of a 5-field cron expression whose minute field is one of the shapes
 * this repo actually uses, in ms.
 *
 * Deliberately narrow: an unrecognized shape throws rather than guessing, so a
 * future schedule this cannot reason about fails loudly instead of silently
 * returning a wrong number.
 */
export function cronPeriodMs(expr: string): number {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`unsupported cron arity: "${expr}"`);
  const [minute, hour, dom, month, dow] = fields as [string, string, string, string, string];
  if (hour !== "*" || dom !== "*" || month !== "*" || dow !== "*") {
    throw new Error(`only minute-field schedules are supported here: "${expr}"`);
  }
  // "0" — once per hour
  if (/^\d+$/.test(minute)) return 3_600_000;
  // "*/N" — every N minutes
  const step = /^\*\/(\d+)$/.exec(minute);
  if (step) return Number(step[1]) * 60_000;
  // "a,b,c,d" — evenly spaced list; assert the spacing is actually even so an
  // uneven list cannot masquerade as a fixed period.
  if (/^\d+(,\d+)+$/.test(minute)) {
    const mins = minute
      .split(",")
      .map(Number)
      .sort((a, b) => a - b);
    const gaps = mins.map((m, i) => (i === 0 ? m + 60 - mins[mins.length - 1]! : m - mins[i - 1]!));
    const first = gaps[0]!;
    if (!gaps.every((g) => g === first)) {
      throw new Error(`minute list is not evenly spaced: "${expr}"`);
    }
    return first * 60_000;
  }
  throw new Error(`unrecognized minute field: "${expr}"`);
}
