/**
 * PROBE 3 (run THROUGH the instrument, per bl-orch): N repetitions of the ONE
 * known-flaky site inside a SINGLE process. Varies exactly one thing: run index.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateMutants } from "../../../../../../tests/mutation/source/generate";
import { classify } from "../../../../../../tests/mutation/source/oracle";
import { enumerateSites, siteId } from "../../../../../../tests/mutation/source/operators";
import { GUARD_SURFACES } from "../../../../../../tests/mutation/source/registry";
import { type ChildRecord, runSuiteRecorded, selfCheck } from "./instrument";

const root = process.cwd();
const N = Number(process.env.PROBE_N ?? "6");
const TARGET_SITE = "relational-boundary:3578:35:<><=";

const stamp = (label: string) => {
  const out = execFileSync(
    "git",
    ["rev-parse", "HEAD:tests/cross-cutting/psqlStartupFiles/scan.ts", "HEAD:tests/cross-cutting/psqlStartupFileSuppression.test.ts"],
    { cwd: root, encoding: "utf8" },
  ).trim().split("\n");
  console.log(`STAMP ${label}: scan.ts=${out[0]?.slice(0, 8)} suite=${out[1]?.slice(0, 8)}`);
  return out.join(",");
};

const before = stamp("BEFORE");

// --- CONTROL A: the instrument agrees with the shipped runner (rule 84).
const control = GUARD_SURFACES.find((s) => s.id === "spawnBounded");
if (!control) throw new Error("control surface spawnBounded not found in registry");
const agrees = selfCheck(root, control);
if (!agrees) {
  console.log("ABORT: instrument disagrees with the shipped runner; nothing below is trustworthy.");
  process.exit(1);
}

const surface = GUARD_SURFACES.find((s) => s.id === "psqlStartupScan");
if (!surface) throw new Error("psqlStartupScan not found in registry");

const target = resolve(root, surface.sourcePath);
const text = readFileSync(target, "utf8");
const sites = enumerateSites(target, text, surface.operators);
const { mutants } = generateMutants(target, text, surface.operators, sites);

// --- CONTROL B: the site id RESOLVES in the generated set (rule 89).
const chosen = mutants.find((m) => siteId(m.site) === TARGET_SITE);
console.log(`\nCONTROL B: target site resolves in the generated set: ${Boolean(chosen)} (${mutants.length} mutants generated)`);
if (!chosen) {
  console.log("ABORT: the runner does not generate this site id; the probe cannot see its subject.");
  process.exit(1);
}
console.log(`  site: ${TARGET_SITE}  ->  "${chosen.site.from}" becomes "${chosen.site.to}"`);

const scratch = mkdtempSync(join(tmpdir(), "fx-probe3-"));
const mutantFile = join(scratch, "mutant.ts");
const records: ChildRecord[] = [];

try {
  // --- CONTROL C: UNMUTATED baseline is GREEN (else every mutant scores KILLED).
  writeFileSync(mutantFile, text);
  const baseSink: ChildRecord[] = [];
  const baseCode = runSuiteRecorded(root, target, mutantFile, surface.suitePaths[0]!, "BASELINE", baseSink);
  console.log(`\nCONTROL C: unmutated baseline exit=${baseCode} (${(baseSink[0]!.durationMs / 1000).toFixed(1)}s) — green required: ${baseCode === 0}`);
  if (baseCode !== 0) {
    console.log("ABORT: baseline is red; every mutant would score KILLED.");
    process.exit(1);
  }

  console.log(`\n=== ${N} repetitions of ${TARGET_SITE}, one process, serial ===`);
  writeFileSync(mutantFile, chosen.text);
  for (let i = 1; i <= N; i++) {
    const code = runSuiteRecorded(root, target, mutantFile, surface.suitePaths[0]!, TARGET_SITE, records);
    const r = records[records.length - 1]!;
    console.log(
      `  run ${i}/${N}: kind=${r.kind} exit=${String(r.code)} verdict=${classify(code)} ${(r.durationMs / 1000).toFixed(1)}s`,
    );
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const after = stamp("AFTER");
console.log(`STAMP pair identical (no input moved during the run): ${before === after}`);

const verdicts = records.map((r) => (r.kind === "exit" && r.code === 0 ? "SURVIVED" : "KILLED"));
const distinct = [...new Set(verdicts)];
const kinds = [...new Set(records.map((r) => r.kind))];
const durations = records.map((r) => r.durationMs).sort((a, b) => a - b);

console.log("\n================ PRE-REGISTERED READING ================");
console.log(`verdicts: ${JSON.stringify(verdicts)}`);
console.log(`distinct verdicts: ${distinct.length} -> ${distinct.join(", ")}`);
console.log(`outcome kinds observed: ${kinds.join(", ")}`);
console.log(`durations (s): ${durations.map((d) => (d / 1000).toFixed(1)).join(", ")}`);
console.log(`max duration ${(durations[durations.length - 1]! / 1000).toFixed(1)}s against the 180.0s ceiling`);
console.log(
  distinct.length > 1
    ? "RESULT: FLIP INSIDE ONE LEG — H-runner supported; the mechanism is localized to the runner."
    : "RESULT: NO FLIP inside one leg — the NEGATIVE branch. Mechanism localized OUTSIDE a single leg (machine/environment/across-leg). Progress, NOT an explanation, and NOT a re-test of co-tenancy.",
);
console.log(`timeouts among these runs: ${records.filter((r) => r.kind === "timeout").length}`);
