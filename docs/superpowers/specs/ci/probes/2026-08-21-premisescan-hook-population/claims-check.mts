/**
 * DERIVED cover over the spec's own claims.
 *
 * Two earlier sweeps on this arc reported clean over the wrong population: one
 * enumerated §5.2's table rows, and the re-analysis that replaced it still left
 * two of the five defect sites uncovered. A clean result over the wrong
 * population is indistinguishable from a clean result over the right one, so the
 * population here is READ OUT OF THE SPEC rather than typed in.
 *
 * Two checks, each closing a class that has already produced a finding:
 *
 *   A. Every limit row declared in §4 has a probe in limits-check.mts, and
 *      limits-check probes nothing that §4 does not declare. A new limit row
 *      with no probe REDS instead of being silently uncovered.
 *   B. Every fenced `$ …` command in the spec that names a probe script resolves
 *      to a file that exists. That is spec review r2 finding 3's class made
 *      mechanical; checking it by hand is the method that produced the clean
 *      sweeps above.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SPEC = join(ROOT, "docs/superpowers/specs/2026-08-21-premisescan-hook-attachment.md");
const LIMITS = join(ROOT, "docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/limits-check.mts");

const spec = readFileSync(SPEC, "utf8");
const limits = readFileSync(LIMITS, "utf8");
if (spec.length === 0 || limits.length === 0) {
  console.error("claims-check: an empty read is a broken check, not a clean result");
  process.exit(2);
}

let failed = false;

// ---- A. §4's declared limit rows vs limits-check's probes --------------------
const declared = [...spec.matchAll(/^\| \*\*(L\d+)\*\*/gm)].map((m) => m[1]!);
const probed = [...limits.matchAll(/say\("(L\d+)"/g)].map((m) => m[1]!);
if (declared.length === 0) {
  console.error("claims-check: no limit rows found in §4 — the selector no longer matches the table");
  process.exit(2);
}
const missing = declared.filter((l) => !probed.includes(l));
const extra = probed.filter((l) => !declared.includes(l));
console.log(`A. §4 declares ${declared.length} limit rows: ${declared.join(" ")}`);
console.log(`   limits-check probes ${probed.length}: ${probed.join(" ")}`);
if (missing.length) {
  console.log(`   FAIL declared but not probed: ${missing.join(" ")}`);
  failed = true;
}
if (extra.length) {
  console.log(`   FAIL probed but not declared: ${extra.join(" ")}`);
  failed = true;
}
if (!missing.length && !extra.length) console.log("   PASS every declared limit has a probe, and no probe is orphaned");

// ---- B. every probe script named by ANY of the arc's documents resolves -------
//
// The document population is DERIVED, not listed: every tracked markdown file
// under docs/ that mentions this probe directory. That is the spec, its probe
// record and the plan today, and any later arc document by default. Scanning the
// spec alone missed `probe-decompose.mts`, which the probe record runs as a fenced
// command and the spec names only in AC-9's prose — so a misspelled or deleted
// script passed the check while the AC it serves went unproved (plan review r1
// finding 2).
//
// Both citation FORMS are extracted, because the earlier version keyed on the
// fenced-command form alone and a prose citation is equally a claim that the file
// exists.
const PROBE_DIR = "docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population";
const docs = execFileSync("git", ["ls-files", "docs"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f: string) => f.endsWith(".md"))
  .filter((f: string) => {
    try {
      return readFileSync(join(ROOT, f), "utf8").includes(PROBE_DIR);
    } catch {
      return false;
    }
  });
if (docs.length === 0) {
  console.error("claims-check: no document mentions the probe directory — the document selector is broken");
  process.exit(2);
}
const cmds: string[] = [];
for (const d of docs) {
  const text = readFileSync(join(ROOT, d), "utf8");
  for (const m of text.matchAll(/^\$ .*?(docs\/superpowers\/specs\/ci\/probes\/\S+\.mts)/gm)) cmds.push(m[1]!);
  for (const m of text.matchAll(/`([a-z0-9-]+\.mts)`/g)) cmds.push(`${PROBE_DIR}/${m[1]!}`);
}
const uniq = [...new Set(cmds)];
console.log(`\nB. ${docs.length} arc documents scanned (derived: tracked docs/**.md naming the probe directory)`);
for (const d of docs) console.log(`      ${d}`);
console.log(`   ${uniq.length} distinct probe scripts named across them`);
if (uniq.length === 0) {
  console.error("   claims-check: the citation selectors matched nothing — they no longer match these documents");
  process.exit(2);
}
for (const c of uniq) {
  const ok = existsSync(join(ROOT, c));
  console.log(`   ${ok ? "PASS" : "FAIL"} ${c}`);
  if (!ok) failed = true;
}

// ---- C. the spec's declared cell TOTAL equals the cells that actually run -----
//
// The risk is a UNITS one and it is invisible in prose: a distinct-count and a
// cell-count both render as a bare number, so a document can publish "5 inputs and
// 7 implementations" beside a total of 16 and read as arithmetic that does not
// add. Asserting the sum inside cell-check would be an identity; asserting the
// spec's stated total against the script's real cell count is a claim that can be
// wrong, and this is where it is checked.
{
  const declared = [...spec.matchAll(/(\d+) in total, pinned by `cell-check\.mts`/g)].map((m) => Number(m[1]));
  const script = readFileSync(join(ROOT, PROBE_DIR, "cell-check.mts"), "utf8");
  const pinned = [...script.matchAll(/results\.length !== (\d+)/g)].map((m) => Number(m[1]));
  console.log(`\nC. spec declares a cell total ${declared.length ? declared.join("/") : "(none found)"}; cell-check pins ${pinned.length ? pinned.join("/") : "(none found)"}`);
  if (declared.length !== 1 || pinned.length !== 1) {
    console.error("   claims-check: expected exactly one declared total and one pin — the selectors no longer match");
    process.exit(2);
  }
  if (declared[0] !== pinned[0]) {
    console.log(`   FAIL the spec says ${declared[0]} cells, cell-check pins ${pinned[0]}`);
    failed = true;
  } else {
    console.log(`   PASS both say ${declared[0]}`);
  }
}

console.log(`\n${failed ? "FAILED" : "PASSED"} — population derived from the spec, not enumerated here`);
process.exit(failed ? 1 : 0);
