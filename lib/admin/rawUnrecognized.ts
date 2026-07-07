/**
 * Pure sanitize + group + cap for the persisted `raw_unrecognized` jsonb
 * (spec 2026-07-07 §C). `raw_unrecognized` is arbitrary spreadsheet content
 * coerced from `pending_syncs.parse_result` jsonb, so every read fail-closes on
 * malformed shape — strict `typeof` checks, no string coercion (which would
 * render "null" / "[object Object]" / "undefined" noise).
 */
export const RAW_UNRECOGNIZED_CAP = 50;
/** Per-field character cap. Arbitrary sheet content can be arbitrarily long; a
 *  single huge cell must not freeze render or dwarf the modal. */
export const RAW_UNRECOGNIZED_FIELD_CAP = 200;
/** WORK caps (not just display caps) so pathological jsonb can't freeze the
 *  render: cap the raw characters fed to the per-field regex, and cap how many
 *  array entries are scanned at all. `total` is therefore bounded to
 *  RAW_UNRECOGNIZED_MAX_ENTRIES (far above any real sheet's unrecognized-row
 *  count, so it is exact in practice). */
export const RAW_UNRECOGNIZED_MAX_FIELD_INPUT = RAW_UNRECOGNIZED_FIELD_CAP * 8; // 1600
export const RAW_UNRECOGNIZED_MAX_ENTRIES = 1000;

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

// Characters unsafe to render from untrusted sheet content, even when
// React-escaped. Control chars (C0/C1) become a space to preserve word
// boundaries; invisible chars are removed. Bidi overrides (U+202A-202E,
// U+2066-2069) can visually reorder text (Trojan-source style) and zero-width
// chars (U+200B-200D, U+2060, U+FEFF) can hide/spoof content.
const CONTROL_CHARS = /[\x00-\x1F\x7F-\x9F]/g;
const INVISIBLE_CHARS = /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g;

function cleanField(input: string): string {
  // Bound the regex work FIRST: a multi-megabyte cell must not be scanned in
  // full just to render at most RAW_UNRECOGNIZED_FIELD_CAP chars.
  const bounded =
    input.length > RAW_UNRECOGNIZED_MAX_FIELD_INPUT
      ? input.slice(0, RAW_UNRECOGNIZED_MAX_FIELD_INPUT)
      : input;
  const cleaned = bounded
    .replace(CONTROL_CHARS, " ")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > RAW_UNRECOGNIZED_FIELD_CAP
    ? cleaned.slice(0, RAW_UNRECOGNIZED_FIELD_CAP) + "…"
    : cleaned;
}

export function sanitizeRawUnrecognized(raw: unknown): RawUnrecognizedEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RawUnrecognizedEntry[] = [];
  // Bound entries scanned so a pathologically long array can't freeze the walk.
  const scan =
    raw.length > RAW_UNRECOGNIZED_MAX_ENTRIES ? raw.slice(0, RAW_UNRECOGNIZED_MAX_ENTRIES) : raw;
  for (const el of scan) {
    if (el === null || typeof el !== "object" || Array.isArray(el)) continue;
    const r = el as Record<string, unknown>;
    const key = typeof r.key === "string" ? cleanField(r.key) : "";
    if (!key) continue; // a row with no label is unshowable
    const rawBlock = typeof r.block === "string" ? cleanField(r.block) : "";
    const block = rawBlock || "Other";
    const value = typeof r.value === "string" ? cleanField(r.value) : "";
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
