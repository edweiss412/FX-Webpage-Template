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

// ---- B. every fenced probe command in the spec resolves ----------------------
const cmds = [...spec.matchAll(/^\$ .*?(docs\/superpowers\/specs\/ci\/probes\/\S+\.mts)/gm)].map((m) => m[1]!);
const uniq = [...new Set(cmds)];
console.log(`\nB. ${uniq.length} distinct probe scripts referenced by fenced commands in the spec`);
if (uniq.length === 0) {
  console.error("   claims-check: the command selector matched nothing — it no longer matches the spec's fences");
  process.exit(2);
}
for (const c of uniq) {
  const ok = existsSync(join(ROOT, c));
  console.log(`   ${ok ? "PASS" : "FAIL"} ${c}`);
  if (!ok) failed = true;
}

console.log(`\n${failed ? "FAILED" : "PASSED"} — population derived from the spec, not enumerated here`);
process.exit(failed ? 1 : 0);
