/**
 * Post-repair survivor verifier (plan R2 F1 / R3 F1-F2). Reads
 * survivor-expectations.json (generated pre-repair from the live tree + the spec
 * §2.1 direction column) and asserts, per row:
 *   - the survivor heading text exists as a HEADING (#{2,4}) exactly once;
 *   - the demoted heading text does NOT exist as a heading;
 *   - the demoted text exists as a bold paragraph line (`**<text>**`).
 * PRE-REPAIR the second and third assertions fail for every row (the demoted
 * headings are still headings) — that failing run is A1 step 6's red. A swapped
 * pair post-repair fails by id. Run from the repo root; exits 1 with per-id
 * failures on stderr.
 */
import { readFileSync } from "node:fs";

type Row = { id: string; file: string; survivorHeadingText: string; demotedHeadingText: string };
const rows: Row[] = JSON.parse(
  readFileSync("docs/superpowers/plans/2026-08-15-archive-duplicate-ids/survivor-expectations.json", "utf8"),
);
if (rows.length !== 43) throw new Error(`expected 43 rows, got ${rows.length}`);

const cache = new Map<string, string[]>();
const linesOf = (file: string): string[] => {
  if (!cache.has(file)) cache.set(file, readFileSync(file, "utf8").split("\n"));
  return cache.get(file)!;
};

const failures: string[] = [];
for (const r of rows) {
  const lines = linesOf(r.file);
  const asHeading = (text: string): number =>
    lines.filter((l) => /^#{2,4} /.test(l) && l.replace(/^#{2,4} /, "") === text).length;
  const survivorCount = asHeading(r.survivorHeadingText);
  const demotedHeadingCount = asHeading(r.demotedHeadingText);
  const demotedBold = lines.some((l) => l.trim() === `**${r.demotedHeadingText}**`);
  if (survivorCount !== 1)
    failures.push(`${r.id}: survivor heading count ${survivorCount} (want 1) in ${r.file}`);
  if (demotedHeadingCount !== 0)
    failures.push(`${r.id}: demoted text still a heading (${demotedHeadingCount}) in ${r.file}`);
  if (!demotedBold)
    failures.push(`${r.id}: demoted text not found as a bold line in ${r.file}`);
}
if (failures.length > 0) {
  for (const f of failures) console.error(f);
  console.error(`FAIL: ${failures.length} survivor-verification failures`);
  process.exit(1);
}
console.log(`OK: all ${rows.length} pairs verified`);
