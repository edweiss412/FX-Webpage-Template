#!/usr/bin/env node
// Self-consistency checker for the harness-font-fidelity spec.
//
// Rounds 19, 20 and 21 each spent findings on the same defect: a statement was
// updated and its peers were not. That is mechanical to detect, so it is checked
// mechanically instead of promised.
import { readFileSync } from "node:fs";
const SPEC = process.argv[2] ?? "docs/superpowers/specs/2026-08-03-harness-font-fidelity-design.md";
const t = readFileSync(SPEC, "utf8");
const fail = [];
const check = (name, ok, detail = "") => { if (!ok) fail.push(`${name}${detail ? " — " + detail : ""}`); };

// 1. Counts that must agree wherever they appear.
const counts = { "harness callers": 31, "font-sensitive": 28, "unsynchronized": 25, "navigation sites": 88 };
check("stale caller count", !/\b24\b\s*(callers|files|unsynchronized|have zero)/.test(t),
  "found a `24` used as the unsynchronized-caller count");
check("synchronized count", !/four synchronize/.test(t), "`four synchronized` — it is three");

// 2. The guard's parser. CSSOM may appear ONLY describing a mutant or the retired draft.
for (const m of t.matchAll(/replaceSync/g)) {
  // A window, not a sentence: "document.fonts" splits a sentence on `.` and
  // hid the very context that makes the occurrence legitimate.
  const s = t.slice(Math.max(0, m.index - 320), m.index + 200);
  const aboutMutant = /mutant|Mutant|registers a face|rogue face|at runtime/.test(s);
  const aboutRetired = /retired|earlier draft|round 20|not with the browser/.test(s);
  check("guard parser", aboutMutant || aboutRetired, `replaceSync in a non-mutant context: "${s.trim().slice(0, 90)}…"`);
}

// 3. No claim may rest on an untracked scratch path.
check("scratch-path citation", !/\/tmp\/spike/.test(t), "spec cites a /tmp spike path");

// 4. Probe derivation must state the zero-advance filter wherever it enumerates filters.
const filterBlocks = [...t.matchAll(/glyphForCodePoint\(cp\)\.id === 0/g)];
check("probe filter", filterBlocks.length === 0 || /nonzero advance|zero-advance/.test(t),
  "probe filters enumerated without the zero-advance rule");
check("combining-mark feature", !/combining marks for cyrillic/.test(t),
  "still calls a combining-mark cyrillic probe a feature");

// 5. Wait placement must not be stated as the navigation site.
check("wait anchor", !/await is placed \*at the navigation site\*/.test(t),
  "placement stated as the navigation site, contradicting the content-present anchor");

// 5b. Round 22: this file reported "consistent" over a paragraph that said the
// guard parses with "the browser's own CSSOM" across "14 assertions". The parser
// check only looked for `replaceSync`, and the count checks only asked whether a
// numeral occurred SOMEWHERE. Both were weaker than the prose describing them --
// the same defect class the guard itself kept hitting.
check("guard parser (prose)", !/parses [^.]{0,40}with the browser's own CSSOM/.test(t),
  "prose still names CSSOM as the guard's parser");
// The assertion/mutant totals must agree with what the artifacts actually report,
// read from the artifacts rather than trusted.
import { readFileSync as rf } from "node:fs";
const here = new URL(".", import.meta.url).pathname;
const rows = (rf(here + "static-guard.mjs", "utf8").match(/^check\(/gm) || []).length;
const muts = (rf(here + "mutants.mjs", "utf8").match(/^  "[A-Z]/gm) || []).length;
const hRows = (rf(here + "harness-guard.mjs", "utf8").match(/add\("H/g) || []).length;
const hMuts = (rf(here + "harness-mutants.mjs", "utf8").match(/^  \["H-/gm) || []).length;
// Round 23: asserting the RIGHT phrase appears somewhere does not reject a WRONG
// one elsewhere -- the README and two spec lines still advertised 15/15 and
// 30/30 while this file reported consistent. So every count claim in the corpus
// is now enumerated and matched against the artifacts; a claim that matches
// nothing real is a failure.
const ok = new Set([`${rows}/${rows}`, `${hRows}/${hRows}`, `${muts}/${muts}`, `${hMuts}/${hMuts}`]);
const okCounts = new Set([rows, muts, hRows, hMuts, rows + hRows, muts + hMuts]);
for (const src of [["spec", t], ["README", rf(here + "README.md", "utf8")]]) {
  for (const m of src[1].matchAll(/\b(\d+)\/(\d+) (rows|mutants)\b/g))
    check("stale ratio claim", ok.has(`${m[1]}/${m[2]}`), `${src[0]}: "${m[0]}" matches no artifact`);
  for (const m of src[1].matchAll(/\b(\d+) (mutants|mutations|rows|assertions)\b/g))
    check("stale count claim", okCounts.has(Number(m[1])), `${src[0]}: "${m[0]}" matches no artifact`);
}
// A count claim must match the list it introduces.
// Sentence-splitting on "." fails here: the names themselves contain dots
// (appHealthIndicator.layout). Bound the window by the prose that follows it.
const decl = t.match(/because (\d+) of the 25 create more than one/);
if (decl) {
  const from = t.indexOf("Recomputed on this branch:");
  const stop = Math.min(...["is the sixteenth", "An earlier draft"]
    .map((k) => { const i = t.indexOf(k, from); return i === -1 ? Infinity : i; }));
  const listed = new Set((t.slice(from, stop).match(/`[^`\s]+`/g) || []).map((x) => x));
  check("multi-document count matches its list", Number(decl[1]) === listed.size,
    `says ${decl[1]}, lists ${listed.size}`);
}

// 5c. Round 24: every survivor was a number bound to the WRONG NOUN, or an
// inventory that had drifted from its peer. Both are checkable.
const NOUN = {
  "geometry harnesses": 28, "font-sensitive callers": 28, "font-sensitive harnesses": 28,
  "harness callers": 31, "harness documents": 31, "unsynchronized callers": 25,
};
for (const [noun, want] of Object.entries(NOUN))
  for (const m of t.matchAll(new RegExp(`\\b(\\d+) ${noun}\\b`, "g")))
    check("number bound to the wrong noun", Number(m[1]) === want,
      `"${m[0]}" — ${noun} is ${want}`);

// The §7 test inventory must cover every artifact §3.0 says the spec creates.
// Round 24 found three missing; the two sections drifted independently.
const created = (t.match(/\*\*Create \(new, untracked\):\*\*([\s\S]*?)\n\n/) || [])[1] || "";
const s7 = t.slice(t.indexOf("| Test | Shape |"));
for (const f of created.match(/`[^`]+\.(ts|tsx|css)`/g) || []) {
  const stem = f.replace(/`/g, "").split("/").pop().replace(/\.(spec|test)\.tsx?$/, "").replace(/\.tsx?$/, "");
  const words = stem.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  check("§7 omits a §3.0 artifact", words.some((w) => s7.toLowerCase().includes(w)),
    `${stem} appears in §3.0 but nothing in the §7 table mentions it`);
}

// 6. Coverage numbers must not contradict each other. Added after the harness
// instrument landed and made an earlier "not among the 30" caveat false --
// the same peer-staleness this file exists to catch, one level up.
check("stale coverage caveat", !/they are \*\*not\*\* among the 30/.test(t),
  "still discloses the harness rows as uncovered");

// 7. Every count above should appear at least once (catches a rename losing a claim).
for (const [k, v] of Object.entries(counts))
  check(`count present: ${k}`, new RegExp(`\\b${v}\\b`).test(t), `no occurrence of ${v}`);

if (fail.length) { console.log("INCONSISTENT:"); for (const f of fail) console.log("  -", f); process.exit(1); }
console.log(`consistent — ${Object.keys(counts).length} counts, parser, probe filters, wait anchor, no scratch citations`);
