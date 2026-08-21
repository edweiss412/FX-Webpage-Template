/**
 * Population probe for BL-SPECLINT-RED-REASON-VERIFICATION.
 *
 * Derives every red= marker on the LIVE tracked spec+plan corpus through the
 * SHIPPED parser (rule 84: compute through the shipped function, never a model
 * of it), and classifies each command by the shape the current arm's own
 * derivation assigns it. Prints raw counts and a population floor, so a broken
 * read reds instead of reporting a confident zero (rules 47, 119, 181).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseDoc } from "../lib/specLint/parse.ts";
import { MARKER_ANY, parseMarker } from "../lib/specLint/taskContract.ts";
import { deriveCollectionProbe } from "../lib/specLint/redContract.ts";

const files = execFileSync(
  "git",
  ["ls-files", "docs/superpowers/specs", "docs/superpowers/plans"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter((f) => f.endsWith(".md"));

if (files.length < 50)
  throw new Error(`population floor: only ${files.length} md files — broken read`);

type Row = {
  file: string;
  line: number;
  state: string | null;
  red: string;
  derivation: string;
};

const rows: Row[] = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const model = parseDoc(text);
  for (let i = 0; i < model.lines.length; i++) {
    if (model.fencedInfo[i] !== undefined) continue;
    const raw = model.lines[i]!;
    if (!MARKER_ANY.test(raw)) continue;
    const parsed = parseMarker(raw, i + 1);
    if (parsed === null || parsed === "malformed") continue;
    if (parsed.red.trim() === "") continue;
    const state = parsed.redState;
    const d =
      state === null
        ? "v1-no-state"
        : deriveCollectionProbe(parsed.red, state).kind === "none"
          ? "none"
          : deriveCollectionProbe(parsed.red, state).kind === "skipped"
            ? `skipped:${(deriveCollectionProbe(parsed.red, state) as { skipped: string }).skipped}`
            : "probe";
    rows.push({ file, line: i + 1, state, red: parsed.red, derivation: d });
  }
}

const tally = (f: (r: Row) => string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(f(r), (m.get(f(r)) ?? 0) + 1);
  return m;
};

console.log(`FILES SCANNED: ${files.length}`);
console.log(`RED MARKERS:   ${rows.length}`);
console.log("\n-- by red-state --");
for (const [k, v] of [...tally((r) => String(r.state))].sort()) console.log(`  ${k}: ${v}`);
console.log("\n-- by derivation (what the collection arm does with it) --");
for (const [k, v] of [...tally((r) => r.derivation)].sort()) console.log(`  ${k}: ${v}`);

const heavy = rows.filter((r) => /(^|\s)pnpm\s+heavy(\s|$)/.test(r.red));
console.log(`\n-- pnpm heavy-wrapped: ${heavy.length} --`);
for (const r of heavy) console.log(`  ${r.file}:${r.line} [${r.state}/${r.derivation}] ${r.red}`);

console.log("\n-- LIVE reds the exec arm actually runs --");
const live = rows.filter((r) => r.state === "live");
console.log(`  count: ${live.length}`);
for (const r of live.slice(0, 40)) console.log(`  ${r.file}:${r.line} ${r.red}`);
