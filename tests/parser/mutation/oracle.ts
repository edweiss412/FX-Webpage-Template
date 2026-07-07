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
type SignalChannels = {
  warnings: ParseWarning[];
  hardErrors: ParseError[];
  raw_unrecognized: ParsedSheet["raw_unrecognized"];
};
export const signalOf = (p: ParsedSheet): SignalChannels => ({
  warnings: p.warnings,
  hardErrors: p.hardErrors,
  raw_unrecognized: p.raw_unrecognized,
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
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
}

export const payloadChanged = (b: ParsedSheet, m: ParsedSheet): boolean =>
  !deepEq(payloadOf(b), payloadOf(m));
export const signalEq = (b: ParsedSheet, m: ParsedSheet): boolean =>
  deepEq(signalOf(b), signalOf(m));

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
  const bk = signalKeys(b),
    mk = signalKeys(m);
  for (const [k, n] of mk) if (n > (bk.get(k) ?? 0)) return true;
  return false;
}

/** Corrupting-bucket verdict (spec §3.4, top-down). */
export function verdict(b: ParsedSheet, m: ParsedSheet): Verdict {
  const pEq = !payloadChanged(b, m),
    sEq = signalEq(b, m),
    stronger = newSignalFired(b, m);
  if (pEq && sEq) return "ABSORBED";
  if (pEq && !sEq && stronger) return "SIGNALED";
  if (pEq && !sEq && !stronger) return "SILENT_SIGNAL_LOSS";
  if (!pEq && stronger) return "SIGNALED";
  return "SILENT_WRONG";
}

/** Short redacted digest of any value — PII never stored raw (spec §5). */
export const digest = (v: unknown): string =>
  createHash("sha256")
    .update(canon(typeof v === "string" ? v.normalize("NFC") : v))
    .digest("hex")
    .slice(0, 12);

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
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort(); // omit undefined keys (toEqual parity)
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
    const bv = bl.get(p),
      mv = ml.get(p);
    if (canon(bv) === canon(mv)) continue;
    payloadDiff.push(`${p}:${typeof bv}->${typeof mv}:${digest(bv)}->${digest(mv)}`);
  }
  // Order-sensitive signal component: index-keyed, per-field REDACTED canonical entries (spec §5,
  // R15/R16, R26). Structural fields (severity, code, blockRef.kind/index/iso/name, block, key) are
  // kept VERBATIM so a reviewer can see WHY a ledger row moved (code vs anchor vs message vs raw
  // value); PII/free-text (message, rawSnippet, sourceCell, value) is digest()-ed so the committed
  // ledger never carries raw PII. `signalRows` is exported so the redaction boundary is testable.
  const signalDiff = `B[${signalRows(b).join(",")}]|M[${signalRows(m).join(",")}]`;
  return createHash("sha256")
    .update(`${payloadDiff.join(";")}||${signalDiff}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * EXHAUSTIVE-BY-TYPE signal redaction (Codex whole-diff R3 [medium]). The previous redactors
 * hand-whitelisted today's fields (severity/code/message/blockRef.{kind,index,iso,name}/rawSnippet/
 * sourceCell/block/key/value); a parser change that ADDED or populated ANOTHER enumerable signal
 * field would move `signalEq` (a full deep-equal over the whole object) while the fingerprint stayed
 * constant, because the new field was silently discarded — an in-ledger drift the ratchet is
 * supposed to catch. `redactNode` instead walks the ENTIRE object generically and keeps EVERY key,
 * so the fingerprint's signal view is a superset of `signalEq`'s: any field `signalEq` compares also
 * reaches the fingerprint. PII is still never stored raw — a value is digest()-ed when its KEY is a
 * known free-text/PII field (`PII_KEYS`) OR (defense-in-depth for a future PII-ish field) when a
 * string value LOOKS like PII (`looksPii`: contains '@', a phone-shaped run, or is long). Every
 * other scalar is kept verbatim so a reviewer can still see WHY a row moved. Absent-vs-null-vs-value
 * is preserved by `canon` (undefined→omitted key, null→"__null__"), matching signalEq's 3-state
 * (Codex R28). Changing the algorithm re-BASELINES all ledger fingerprints (day-1 re-pin; no fixture
 * data changed, so the alarm site set is unchanged — only the fingerprint values).
 */
const PII_KEYS: ReadonlySet<string> = new Set(["message", "rawSnippet", "sourceCell", "value"]);
const looksPii = (s: string): boolean =>
  s.includes("@") || /\d{3}\D?\d{3}\D?\d{4}/.test(s) || s.length > 40;
function redactNode(v: unknown, key?: string): unknown {
  const piiKey = key !== undefined && PII_KEYS.has(key);
  if (v === undefined) return undefined; // canon omits the key (absent) — preserves absent≠null
  if (v === null) return null; // canon → "__null__"
  if (typeof v === "string") return piiKey || looksPii(v) ? `#d:${digest(v)}` : v;
  if (typeof v !== "object") return v; // number / boolean — structural, verbatim
  if (piiKey) return `#d:${digest(canon(v))}`; // PII-keyed object (e.g. sourceCell) — digest whole
  if (Array.isArray(v)) return v.map((e) => redactNode(e));
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) out[k] = redactNode(o[k], k); // EVERY key kept (exhaustive)
  return out;
}

/** The index-keyed, exhaustively-redacted signal-entry list used by `fingerprint` (exported for the
 *  redaction-boundary test). Order-preserving: swapping two entries changes which content sits at
 *  which index. Every enumerable field of each entry reaches the digest (Codex R3), so the
 *  fingerprint moves whenever `signalEq` would. */
export function signalRows(p: ParsedSheet): string[] {
  const rows: string[] = [];
  p.warnings.forEach((w: ParseWarning, i) => rows.push(`W#${i}:${canon(redactNode(w))}`));
  p.hardErrors.forEach((h: ParseError, i) => rows.push(`H#${i}:${canon(redactNode(h))}`));
  p.raw_unrecognized.forEach((r, i) => rows.push(`R#${i}:${canon(redactNode(r))}`));
  return rows;
}
