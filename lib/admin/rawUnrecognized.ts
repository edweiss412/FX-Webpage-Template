/**
 * Pure sanitize + group + cap for the persisted `raw_unrecognized` jsonb
 * (spec 2026-07-07 §C). `raw_unrecognized` is arbitrary spreadsheet content
 * coerced from `pending_syncs.parse_result` jsonb, so every read fail-closes on
 * malformed shape — strict `typeof` checks, no string coercion (which would
 * render "null" / "[object Object]" / "undefined" noise).
 */
export const RAW_UNRECOGNIZED_CAP = 50;

export type RawUnrecognizedEntry = { block: string; key: string; value: string };
export type RawUnrecognizedGroup = {
  block: string;
  rows: { key: string; value: string }[];
};
export type RawUnrecognizedView = {
  total: number;
  groups: RawUnrecognizedGroup[];
  hiddenCount: number;
};

export function sanitizeRawUnrecognized(raw: unknown): RawUnrecognizedEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RawUnrecognizedEntry[] = [];
  for (const el of raw) {
    if (el === null || typeof el !== "object" || Array.isArray(el)) continue;
    const r = el as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.trim() : "";
    if (!key) continue; // a row with no label is unshowable
    const block = typeof r.block === "string" && r.block.trim() ? r.block.trim() : "Other";
    const value = typeof r.value === "string" ? r.value : "";
    out.push({ block, key, value });
  }
  return out;
}

export function buildRawUnrecognizedView(raw: unknown): RawUnrecognizedView {
  const entries = sanitizeRawUnrecognized(raw);
  const total = entries.length;
  const shown = entries.slice(0, RAW_UNRECOGNIZED_CAP);
  const groups: RawUnrecognizedGroup[] = [];
  const index = new Map<string, RawUnrecognizedGroup>();
  for (const e of shown) {
    let g = index.get(e.block);
    if (!g) {
      g = { block: e.block, rows: [] };
      index.set(e.block, g);
      groups.push(g); // first-appearance order (stable, parser emission order)
    }
    g.rows.push({ key: e.key, value: e.value });
  }
  return { total, groups, hiddenCount: Math.max(0, total - shown.length) };
}
