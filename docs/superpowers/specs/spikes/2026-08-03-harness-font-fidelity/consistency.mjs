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

// 6. Coverage numbers must not contradict each other. Added after the harness
// instrument landed and made an earlier "not among the 30" caveat false --
// the same peer-staleness this file exists to catch, one level up.
check("stale coverage caveat", !/they are \*\*not\*\* among the 30/.test(t),
  "still discloses the harness rows as uncovered");
const rows = t.match(/\b22 rows and 38 mutants\b/);
check("coverage totals present", !!rows, "the 22-rows/38-mutants total is missing or was reworded");

// 7. Every count above should appear at least once (catches a rename losing a claim).
for (const [k, v] of Object.entries(counts))
  check(`count present: ${k}`, new RegExp(`\\b${v}\\b`).test(t), `no occurrence of ${v}`);

if (fail.length) { console.log("INCONSISTENT:"); for (const f of fail) console.log("  -", f); process.exit(1); }
console.log(`consistent — ${Object.keys(counts).length} counts, parser, probe filters, wait anchor, no scratch citations`);
