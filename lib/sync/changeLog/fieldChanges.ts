import type { TriggeredReviewItem } from "@/lib/parser/types";

export type FieldChangeEntry = {
  label: string;
  from: string | null;
  to: string | null;
  note: string | null;
};

export const VALUE_CAP = 120;
export const READ_FIELDS_ENTRY_CAP = 500;
export const FIELDCHANGES_INVALID_CODE = "AUTOAPPLIED_FIELDCHANGES_INVALID";

const FIELD_DISPLAY_NAMES: Record<string, string> = {
  po: "PO number",
  proposal: "Proposal",
  invoice: "Invoice",
  invoiceNotes: "Invoice notes",
};
// financialFields order (spec §3.1 ordering).
const FINANCIAL_ORDER = ["po", "proposal", "invoice", "invoiceNotes"] as const;

const MI8C_MODE_SENTENCES: Record<string, (n: number) => string> = {
  collapse: () => "lost all rows",
  ambiguous_format: () => "format became ambiguous",
  halved: () => "lost more than half its cases",
  case_dropped: (n) => `${n} case(s) removed`,
};
const MI8C_MODE_ORDER = ["collapse", "ambiguous_format", "halved", "case_dropped"] as const;
// Own-key membership set — NEVER validate a mode with `m in MI8C_MODE_SENTENCES`
// (that matches prototype keys like "toString", silently dropping a malformed item
// without counting it → no-silent-omission violation, Codex plan-review R3 F3).
const VALID_MI8C_MODES: ReadonlySet<string> = new Set(MI8C_MODE_ORDER);

/** Trim-aware, capped. Empty/whitespace/non-string → sentinel. */
function coerce(x: unknown, sentinel: string): string {
  const s = typeof x === "string" && x.trim() !== "" ? x.trim() : sentinel;
  return capValue(s);
}
export function capValue(s: string): string {
  return s.length > VALUE_CAP ? s.slice(0, VALUE_CAP - 1) + "…" : s;
}
/** Sorted, comma-joined flag tokens; "(none)" for empty (spec §3.4b).
 *  Caller guarantees `flags` is a string[] (isStrArr) — this only sorts/joins/caps. */
export function joinFlags(flags: string[]): string {
  const toks = flags.filter((f) => f.trim() !== "").map((f) => f.trim());
  if (toks.length === 0) return "(none)";
  return capValue([...toks].sort().join(", "));
}

/** MI-8b/MI-9 field type guards (spec §3.6: prior/next are `string | null`;
 *  prior_flags/new_flags are each an ARRAY OF STRINGS). A value failing these is
 *  MALFORMED → skip + omittedCount++, never coerced into a fake concrete entry. */
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

type Built = { entries: FieldChangeEntry[]; omitted: number; types: string[] };

function build(items: TriggeredReviewItem[]): Built {
  const entries: FieldChangeEntry[] = [];
  const types: string[] = [];
  let omitted = 0;

  // MI-8 financial, note-only. Collect valid fields (count out-of-enum as malformed),
  // then emit in FINANCIAL_ORDER (spec §3.1 ordering). Cast the tuple to readonly
  // string[] so `.includes(string)` type-checks (a literal tuple narrows the arg type).
  const financials = FINANCIAL_ORDER as readonly string[];
  const mi8Fields: string[] = [];
  for (const it of items) {
    if (it.invariant !== "MI-8") continue;
    const f = (it as { field?: unknown }).field;
    if (typeof f === "string" && financials.includes(f)) mi8Fields.push(f);
    else omitted++;
  }
  for (const field of FINANCIAL_ORDER) {
    for (const f of mi8Fields) {
      if (f !== field) continue;
      entries.push({ label: FIELD_DISPLAY_NAMES[field]!, from: null, to: null, note: "cleared on this sync" });
      if (!types.includes(FIELD_DISPLAY_NAMES[field]!)) types.push(FIELD_DISPLAY_NAMES[field]!);
    }
  }
  // MI-8b COI From→To. Skip if prior/next are not `string | null` (§3.6 guard),
  // or equal-after-normalize (mirrors the live fire condition priorCoi !== nextCoi).
  for (const it of items) {
    if (it.invariant !== "MI-8b") continue;
    const raw = it as { prior?: unknown; next?: unknown };
    if (!isStrOrNull(raw.prior) || !isStrOrNull(raw.next)) { omitted++; continue; }
    const from = coerce(raw.prior, "(none)");
    const to = coerce(raw.next, "(none)");
    if (from === to) { omitted++; continue; }
    entries.push({ label: "COI status", from, to, note: null });
    if (!types.includes("COI status")) types.push("COI status");
  }
  // MI-8c mode-aggregated.
  const mi8c = items.filter((i) => i.invariant === "MI-8c") as Array<{ mode?: unknown }>;
  const byMode = new Map<string, number>();
  for (const it of mi8c) {
    const m = it.mode;
    if (typeof m !== "string" || !VALID_MI8C_MODES.has(m)) { omitted++; continue; }
    byMode.set(m, (byMode.get(m) ?? 0) + 1);
  }
  for (const mode of MI8C_MODE_ORDER) {
    const n = byMode.get(mode);
    if (n == null) continue;
    entries.push({ label: "Pull sheet", from: null, to: null, note: capValue(MI8C_MODE_SENTENCES[mode]!(n)) });
    if (!types.includes("Pull sheet")) types.push("Pull sheet");
  }
  // MI-9 role (existing-crew items only ever arrive; one per crew). Skip if
  // crew_name is not a non-empty string, or prior_flags/new_flags are not each
  // an ARRAY OF STRINGS (§3.6 guard) — never coerce a corrupt item into a fake role entry.
  for (const it of items) {
    if (it.invariant !== "MI-9") continue;
    const raw = it as { crew_name?: unknown; prior_flags?: unknown; new_flags?: unknown };
    const name = typeof raw.crew_name === "string" && raw.crew_name.trim() !== "" ? raw.crew_name.trim() : null;
    if (name === null || !isStrArr(raw.prior_flags) || !isStrArr(raw.new_flags)) { omitted++; continue; }
    entries.push({
      label: capValue(`Role — ${name}`),
      from: joinFlags(raw.prior_flags),
      to: joinFlags(raw.new_flags),
      note: null,
    });
    if (!types.includes("Role")) types.push("Role");
  }
  return { entries, omitted, types };
}

function summarize(types: string[], overflow: number): string {
  const named = types.slice(0, 3);
  const more = (types.length - named.length) + overflow;
  const head = named.join(", ");
  return more > 0
    ? `${head} and ${more} more field change(s) changed on this sync`
    : `${head} changed on this sync`;
}

const HAS_FIELD_FAMILY = new Set(["MI-8", "MI-8b", "MI-8c", "MI-9"]);

export function buildFieldChangesRow(
  items: TriggeredReviewItem[],
): { summary: string; afterImage: { fieldChanges: FieldChangeEntry[] } } | null {
  if (!items.some((i) => HAS_FIELD_FAMILY.has(i.invariant))) return null;
  const { entries, omitted, types } = build(items);
  if (entries.length > 0) {
    if (omitted > 0) {
      entries.push({
        label: "Other changes", from: null, to: null,
        note: `${omitted} other field change(s) on this sync — details unavailable`,
      });
    }
    return { summary: summarize(types, omitted), afterImage: { fieldChanges: entries } };
  }
  // All-malformed → explicit visible Unavailable marker (never null after_image).
  const note = `${omitted} field change(s) on this sync — details unavailable`;
  return { summary: note, afterImage: { fieldChanges: [{ label: "Unavailable", from: null, to: null, note }] } };
}

// ── Reader-side re-validation (spec §5) ──────────────────────────────────────
// Self-contained union — NOT imported from the loader (avoids a circular import).
// Structurally assignable into the loader's AutoAppliedDiff.
export type FieldsDiff = { kind: "none" } | { kind: "fields"; entries: FieldChangeEntry[] };

function isValidEntry(e: unknown): e is FieldChangeEntry {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  const strOrNull = (v: unknown) => v == null || typeof v === "string";
  // ALL of label/from/to/note must be well-typed BEFORE boundEntry touches them —
  // otherwise a note-entry carrying a numeric `from` would pass the XOR check and
  // then crash capValue(42) at bound time (Codex plan-review R1 F2).
  if (typeof o.label !== "string" || o.label.trim() === "") return false;
  if (!strOrNull(o.from) || !strOrNull(o.to) || !strOrNull(o.note)) return false;
  // A from/to branch requires BOTH non-empty (no blank cell, spec §7); a note branch
  // requires a non-empty note. `{ from:"", to:"" }` is corrupt, not a valid entry.
  const hasNote = typeof o.note === "string" && o.note.trim() !== "";
  const hasFromTo =
    typeof o.from === "string" && o.from.trim() !== "" && typeof o.to === "string" && o.to.trim() !== "";
  return hasNote !== hasFromTo; // exactly one branch (note XOR from/to)
}
// Normalize to a canonical single-branch entry: exactly ONE of {note} / {from,to}
// is non-null. isValidEntry guarantees the XOR; here we NULL the inactive branch so
// a corrupt-but-XOR-valid entry (e.g. a from/to entry carrying `note: " "`) cannot
// leave a non-null blank that the component's `e.note != null` check renders as a
// blank line instead of the From→To (R4 F2). Trim active values before capping.
function boundEntry(e: FieldChangeEntry): FieldChangeEntry {
  const label = capValue(e.label);
  const hasNote = typeof e.note === "string" && e.note.trim() !== "";
  if (hasNote) {
    return { label, from: null, to: null, note: capValue((e.note as string).trim()) };
  }
  // isValidEntry guarantees from & to are non-empty strings when not the note branch.
  return { label, from: capValue((e.from as string).trim()), to: capValue((e.to as string).trim()), note: null };
}
function invalidMarker(note: string): { diff: FieldsDiff; invalid: true } {
  return { diff: { kind: "fields", entries: [{ label: "Unavailable", from: null, to: null, note }] }, invalid: true };
}

export function deriveFieldsDiff(
  after: Record<string, unknown> | null | undefined,
): { diff: FieldsDiff; invalid: boolean } {
  const fc = after == null ? undefined : (after as { fieldChanges?: unknown }).fieldChanges;
  if (fc == null) return { diff: { kind: "none" }, invalid: false }; // legacy/generic
  if (!Array.isArray(fc)) {
    return invalidMarker("This change record could not be displayed — review it in the change log");
  }
  if (fc.length === 0) return { diff: { kind: "none" }, invalid: false };
  if (fc.length > READ_FIELDS_ENTRY_CAP) {
    return invalidMarker(`This change record is too large to display safely (${fc.length} entries) — review it in the change log`);
  }
  const kept = fc.filter(isValidEntry).map(boundEntry);
  if (kept.length === 0) {
    return invalidMarker("This change record could not be displayed — review it in the change log");
  }
  if (kept.length < fc.length) {
    // A well-formed writer row never has a droppable entry, so a partial drop means
    // a corrupt/tampered stored payload → warn (invalid: true), not just a marker
    // (Codex plan-review R3 F1 — otherwise the partial corruption is telemetry-dark).
    kept.push({ label: "Other changes", from: null, to: null, note: "some changes could not be displayed" });
    return { diff: { kind: "fields", entries: kept }, invalid: true };
  }
  return { diff: { kind: "fields", entries: kept }, invalid: false };
}
