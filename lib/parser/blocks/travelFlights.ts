const DATE_RE = /^\d{1,2}\/\d{1,2}$/;

/**
 * A flattened TRAVEL FLIGHT DETAILS cell → flight_info, or null if it has no
 * M/D leg date (the exporter flattens the source cell to one space-separated
 * line, so the only leg boundary is the date token). The render splits the
 * result on " | "; a literal source pipe is normalized to "/" so it cannot
 * create a spurious leg.
 */
export function normalizeTravelCell(raw: string): string | null {
  const safe = raw.replace(/\|/g, "/");
  const tokens = safe.split(/\s+/).filter((t) => t.length > 0);
  const dateIdx = tokens.flatMap((t, i) => (DATE_RE.test(t) ? [i] : []));
  if (dateIdx.length === 0) return null;
  const conf = tokens.slice(0, dateIdx[0]!).join(" ");
  const legs: string[] = [];
  for (let k = 0; k < dateIdx.length; k += 1) {
    const start = dateIdx[k]!;
    const end = k + 1 < dateIdx.length ? dateIdx[k + 1]! : tokens.length;
    legs.push(tokens.slice(start, end).join(" "));
  }
  const joined = legs.join(" | ");
  return conf ? `${conf} ${joined}` : joined;
}
