/**
 * Probe: does the client-value projection discriminate every collision family
 * three adversarial rounds have produced?
 *
 * Written because the projection vector survived spec rounds 1, 2 and 3, which is
 * the three-round cap in docs/agents/spec-self-review.md: stop patching prose,
 * build the thing and measure it. The design in the spec's §6.2 is the code below,
 * and the corpus is every pair a reviewer has actually constructed.
 *
 * Run: node --import tsx docs/superpowers/specs/observability/probes/2026-08-26-client-value-projection.ts
 */
import { serializeError } from "../../../../../lib/log/serializeError";

// ── the projection under test (spec §6.2) ─────────────────────────────────────

/** Runtime-derived type tag. Never an enumerated list: an unforeseen type gets its own tag. */
function tag(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t !== "object") return t;
  const ctor = (value as object).constructor;
  return typeof ctor === "function" && ctor.name ? ctor.name : "object";
}

/**
 * Renders serializeError's bounded output to text. NOT JSON.stringify: JSON maps
 * NaN, Infinity and -Infinity to null, so it destroys distinctions serializeError
 * deliberately preserved. Every leaf goes through String(), which keeps them.
 * One rule at every leaf, not a list of special cases.
 */
function render(node: unknown): string {
  if (typeof node === "string") return JSON.stringify(node);
  if (node === null) return "null";
  if (Array.isArray(node)) return `[${node.map(render).join(",")}]`;
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    return `{${Object.keys(o).map((k) => `${JSON.stringify(k)}:${render(o[k])}`).join(",")}}`;
  }
  return String(node); // number (NaN/Infinity survive), boolean, bigint
}

export function describeClientValue(value: unknown): { message: string; detail: string } {
  let s: ReturnType<typeof serializeError>;
  try {
    s = serializeError(value);
  } catch {
    return { message: "(no message)", detail: `${tag(value)} [Unserializable]` };
  }
  if (typeof s === "string") {
    return { message: s || "(no message)", detail: `${tag(value)} ${s}` };
  }
  const detail = render(s);
  const parts: string[] = [];
  if (!Array.isArray(s)) {
    for (const k of ["name", "code", "message"] as const) {
      const v = (s as Record<string, unknown>)[k];
      if (typeof v === "string" && v !== "") parts.push(v);
    }
  }
  return { message: parts.length ? parts.join(": ") : "(no message)", detail };
}

// ── the signature under test (spec §6.4) ──────────────────────────────────────
const CAP_MESSAGE = 1000;
function signature(source: string, level: string, value: unknown): string {
  const { message, detail } = describeClientValue(value);
  const m = message.slice(0, CAP_MESSAGE);
  return `${source}|${level}|${m}||${detail.slice(0, 200)}`; // no stack on the non-Error arm
}
const collide = (a: unknown, b: unknown): boolean =>
  signature("client.crew", "error", a) === signature("client.crew", "error", b);

// ── the corpus: every pair a reviewer has constructed, by round ───────────────
type Pair = [label: string, a: unknown, b: unknown];
const R1: Pair[] = [
  ["same triple, other fields differ", { code: "E", message: "m", a: 1 }, { code: "E", message: "m", b: 2 }],
  ["field identity", { name: "SAME" }, { code: "SAME" }],
  ["ambiguous join", { name: "A", code: "B" }, { name: "A: B" }],
  ["plain objects", { a: 1 }, { b: 2 }],
];
const R2: Pair[] = [
  ["number/string", 0, "0"],
  ["boolean/string", false, "false"],
  ["null/string", null, "null"],
  ["undefined/string", undefined, "undefined"],
  ["bigint/number", 1n, 1],
  ["NaN/string", NaN, "NaN"],
  ["symbol/string", Symbol("x"), "Symbol(x)"],
  ["Date/string", new Date(0), new Date(0).toString()],
  ["RegExp/string", /re/, "/re/"],
  ["URL/string", new URL("https://x.test/"), "https://x.test/"],
];
const R3: Pair[] = [
  ["nested NaN/null", { a: NaN }, { a: null }],
  ["nested Infinity/null", { a: Infinity }, { a: null }],
  ["nested -Infinity/null", { a: -Infinity }, { a: null }],
  ["nested -0/0", { a: -0 }, { a: 0 }],
  ["array NaN/null", [NaN], [null]],
  ["array Infinity/null", [Infinity], [null]],
  ["array -Infinity/null", [-Infinity], [null]],
  ["array -0/0", [-0], [0]],
];
// R4: built-ins whose String() form is coarser than the value. serializeError degrades an
// object with no own enumerable keys to String(value) (its ratified §4 limit 5), and String()
// is second-resolution for Date and ignores lastIndex for RegExp. Inherited, not introduced.
const R4: Pair[] = [
  ["Date same second", new Date(0), new Date(1)],
  ["Date different second", new Date(0), new Date(1000)],
  ["RegExp lastIndex", /re/g, (() => { const r = /re/g; r.lastIndex = 1; return r; })()],
];

let failures = 0;
for (const [round, pairs] of [["R1", R1], ["R2", R2], ["R3", R3], ["R4", R4]] as const) {
  console.log(`\n── ${round} ${"─".repeat(46)}`);
  for (const [label, a, b] of pairs) {
    const c = collide(a, b);
    if (c) failures++;
    console.log(
      `${c ? "COLLIDE" : "  ok   "}  ${label.padEnd(34)} ` +
        `${JSON.stringify(describeClientValue(a).detail)} / ${JSON.stringify(describeClientValue(b).detail)}`,
    );
  }
}
console.log(`\n── guard-condition table (spec §6.3) ${"─".repeat(24)}`);
for (const v of [{ code: "PGRST301", message: "planted" }, {}, [1, 2], "x", "", 0, false, NaN, 1n,
                 null, undefined, Symbol("x"), new Map(), new Set(), new Date(0)]) {
  const d = describeClientValue(v);
  console.log(`  ${String(tag(v)).padEnd(9)} message=${JSON.stringify(d.message).padEnd(24)} detail=${JSON.stringify(d.detail)}`);
}
const TOTAL = R1.length + R2.length + R3.length + R4.length;
console.log(`\nCOLLISIONS: ${failures} of ${TOTAL} pairs`);
console.log(
  "Every collision is a value pair whose distinguishing information String() already discarded\n" +
  "before this projection saw it: -0 has no distinct text form, and serializeError degrades a\n" +
  "key-less object to String(value) by its ratified §4 limit 5. Recorded in the spec's §9.",
);
