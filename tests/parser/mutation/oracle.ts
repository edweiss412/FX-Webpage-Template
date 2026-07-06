// tests/parser/mutation/oracle.ts
import { createHash } from "node:crypto";
import { parseSheet } from "@/lib/parser";
import type { ParsedSheet, ParseWarning, ParseError } from "@/lib/parser/types";

export type Verdict = "ABSORBED" | "SIGNALED" | "SILENT_WRONG" | "SILENT_SIGNAL_LOSS";

export const capture = (md: string, filename: string): ParsedSheet => parseSheet(md, filename);

/** The data payload = ParsedSheet minus the three signal channels. */
export function payloadOf(p: ParsedSheet) {
  const { warnings, hardErrors, raw_unrecognized, ...payload } = p;
  return payload;
}
type SignalChannels = { warnings: ParseWarning[]; hardErrors: ParseError[]; raw_unrecognized: ParsedSheet["raw_unrecognized"] };
export const signalOf = (p: ParsedSheet): SignalChannels => ({
  warnings: p.warnings, hardErrors: p.hardErrors, raw_unrecognized: p.raw_unrecognized,
});

const deepEq = (a: unknown, b: unknown): boolean => canon(a) === canon(b);
/**
 * Canonical, key-sorted string matching Vitest `toEqual` semantics (plan-R5):
 * - `undefined` and `null` are DISTINCT tokens (toEqual: undefined ≠ null at a leaf).
 * - object keys whose value is `undefined` are OMITTED (toEqual: {a:undefined} == {}).
 * - object key order never affects the result.
 */
function canon(v: unknown): string {
  if (v === undefined) return "__undef__";
  if (v === null) return "__null__";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
}

export const payloadChanged = (b: ParsedSheet, m: ParsedSheet): boolean => !deepEq(payloadOf(b), payloadOf(m));
export const signalEq = (b: ParsedSheet, m: ParsedSheet): boolean => deepEq(signalOf(b), signalOf(m));

/** Reduced signal-key multiset for newSignalFired (spec §3.2). */
export function signalKeys(p: ParsedSheet): Map<string, number> {
  const map = new Map<string, number>();
  const bump = (k: string) => map.set(k, (map.get(k) ?? 0) + 1);
  for (const h of p.hardErrors) bump(`H:${h.code}`);
  for (const w of p.warnings) bump(`W:${w.code}`);
  for (const r of p.raw_unrecognized) bump(`R:${r.block}|${r.key}`);
  return map;
}
export function newSignalFired(b: ParsedSheet, m: ParsedSheet): boolean {
  const bk = signalKeys(b), mk = signalKeys(m);
  for (const [k, n] of mk) if (n > (bk.get(k) ?? 0)) return true;
  return false;
}

/** Corrupting-bucket verdict (spec §3.4, top-down). */
export function verdict(b: ParsedSheet, m: ParsedSheet): Verdict {
  const pEq = !payloadChanged(b, m), sEq = signalEq(b, m), stronger = newSignalFired(b, m);
  if (pEq && sEq) return "ABSORBED";
  if (pEq && !sEq && stronger) return "SIGNALED";
  if (pEq && !sEq && !stronger) return "SILENT_SIGNAL_LOSS";
  if (!pEq && stronger) return "SIGNALED";
  return "SILENT_WRONG";
}

/** Short redacted digest of any value — PII never stored raw (spec §5). */
export const digest = (v: unknown): string =>
  createHash("sha256").update(canon(typeof v === "string" ? v.normalize("NFC") : v)).digest("hex").slice(0, 12);

/**
 * Flatten to sorted [path, value] pairs. Every CONTAINER node also emits a shape
 * token (`#arr:<len>` / `#obj:<sortedKeys>`) so an empty-container change like
 * `[] -> [{}]` or `{} -> []` moves the fingerprint (plan-R4). Leaf scalars emit
 * their value; arrays use indexed paths.
 */
function leaves(v: unknown, prefix = ""): Array<[string, unknown]> {
  if (v === null || typeof v !== "object") return [[prefix, v]];
  if (Array.isArray(v)) {
    const out: Array<[string, unknown]> = [[prefix, `#arr:${v.length}`]];
    v.forEach((e, i) => out.push(...leaves(e, `${prefix}[${i}]`)));
    return out;
  }
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort(); // omit undefined keys (toEqual parity)
  const out: Array<[string, unknown]> = [[prefix, `#obj:${keys.join(",")}`]];
  for (const k of keys) out.push(...leaves(o[k], `${prefix}.${k}`));
  return out;
}

/**
 * Behavior fingerprint (spec §5): payload-path diff (type + redacted value digests)
 * PLUS order-sensitive full-signal-object diff. Deterministic per static fixture.
 */
export function fingerprint(b: ParsedSheet, m: ParsedSheet): string {
  const bl = new Map(leaves(payloadOf(b)).map(([p, v]) => [p, v]));
  const ml = new Map(leaves(payloadOf(m)).map(([p, v]) => [p, v]));
  const paths = [...new Set([...bl.keys(), ...ml.keys()])].sort();
  const payloadDiff: string[] = [];
  for (const p of paths) {
    const bv = bl.get(p), mv = ml.get(p);
    if (canon(bv) === canon(mv)) continue;
    payloadDiff.push(`${p}:${typeof bv}->${typeof mv}:${digest(bv)}->${digest(mv)}`);
  }
  // Order-sensitive signal component: index-keyed, per-field REDACTED canonical entries (spec §5,
  // R15/R16, R26). Structural fields (severity, code, blockRef.kind/index/iso/name, block, key) are
  // kept VERBATIM so a reviewer can see WHY a ledger row moved (code vs anchor vs message vs raw
  // value); PII/free-text (message, rawSnippet, sourceCell, value) is digest()-ed so the committed
  // ledger never carries raw PII. `signalRows` is exported so the redaction boundary is testable.
  const signalDiff = `B[${signalRows(b).join(",")}]|M[${signalRows(m).join(",")}]`;
  return createHash("sha256").update(`${payloadDiff.join(";")}||${signalDiff}`).digest("hex").slice(0, 16);
}

/** Per-entry redaction (spec §5.179): structural fields VERBATIM, PII/free-text digest()-ed, then
 *  canonicalized order-stably. Exported so a test can inspect the pre-hash field boundary. */
// `nullish3` preserves the absent-vs-null-vs-value distinction that `signalEq` (a toEqual)
// makes — collapsing `undefined` and `null` to one token would let a SILENT_SIGNAL_LOSS that only
// gains/loses a null anchor keep the same fingerprint while signalEq sees the change (Codex R28).
const nullish3 = <T>(v: T | null | undefined, present: (x: T) => string): string =>
  v === undefined ? "__undef__" : v === null ? "__null__" : present(v);
const redactWarning = (w: ParseWarning) => ({
  severity: w.severity,
  code: w.code,
  message: digest(w.message ?? ""),
  blockRef: w.blockRef
    ? { kind: w.blockRef.kind, index: w.blockRef.index ?? null, iso: w.blockRef.iso ?? null, name: w.blockRef.name ?? null }
    : null,
  rawSnippet: nullish3(w.rawSnippet, (s) => digest(s)), // rawSnippet?: string (never null, but absent≠"")
  sourceCell: nullish3(w.sourceCell, (s) => digest(JSON.stringify(s))), // SourceAnchor | null | undefined — 3-state
});
const redactError = (h: ParseError) => ({ code: h.code, message: digest(h.message ?? ""), blockRef: h.blockRef ? { kind: h.blockRef.kind } : null });
const redactRaw = (r: { block?: string; key?: string; value?: unknown }) => ({
  block: r.block ?? null,
  key: r.key ?? null,
  value: nullish3(r.value, (v) => digest(typeof v === "string" ? v : JSON.stringify(v))), // preserve undefined≠null
});

/** The index-keyed, redacted signal-entry list used by `fingerprint` (exported for the redaction-
 *  boundary test). Order-preserving: swapping two entries changes which content sits at which index. */
export function signalRows(p: ParsedSheet): string[] {
  const rows: string[] = [];
  p.warnings.forEach((w, i) => rows.push(`W#${i}:${canon(redactWarning(w))}`));
  p.hardErrors.forEach((h, i) => rows.push(`H#${i}:${canon(redactError(h))}`));
  (p.raw_unrecognized as Array<{ block?: string; key?: string; value?: unknown }>).forEach((r, i) => rows.push(`R#${i}:${canon(redactRaw(r))}`));
  return rows;
}
