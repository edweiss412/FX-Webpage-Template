/**
 * Corpus regression for the three prose-count parity arms (plan Task 1 step 6).
 *
 * It drives the REAL spec:lint entry point (`runCli` from `scripts/spec-lint.ts`)
 * once per corpus document and CAPTURES each report, rather than trusting exit
 * codes: forcing `--kind spec` on a document that was never section-clean enables
 * that kind's section HARDs, so a non-zero exit says nothing about this arc (plan
 * R5 F1 — `docs/vision.md` fails SECTION_MISSING_RESOLVED_SCOPE under spec kind).
 *
 * The wrapper's OWN assertions are the gate, and they are scoped to the three new
 * codes:
 *   1. every finding carrying one of the three codes is `advisory` severity;
 *   2. no such finding is ever `fail`;
 *   3. the scan actually examined documents and the arms actually ran (premise:
 *      a wrapper that silently linted nothing would satisfy 1 and 2 vacuously).
 *
 * Pre-existing findings of OTHER checks on never-clean documents are outside its
 * scope and do not fail it.
 *
 * Run: pnpm exec tsx docs/superpowers/specs/probes/2026-08-11-speclint-corpus-scan.ts
 * Writes the survivor records beside itself as `<this-file>.survivors.txt`.
 */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli, type CliDeps } from "../../../../scripts/spec-lint";
import type { Finding, LintResult } from "../../../../lib/specLint/types";

const ARM_CODES = ["SCRIPT_CONSTANT_PARITY", "SIBLING_LIST_CARDINALITY", "TEMPLATE_QUANTITY_DRIFT"];

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

const tracked = execFileSync("git", ["ls-files", "-z", "--full-name", "--", ":/"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split("\0")
  .filter((p) => p.length > 0);

const deps: CliDeps = {
  cwd: () => root,
  repoRoot: () => root,
  listTrackedFiles: () => tracked,
  lstatKind: (p) => {
    const st = lstatSync(p, { throwIfNoEntry: false });
    if (!st) return "missing";
    if (st.isSymbolicLink()) return "symlink";
    if (st.isDirectory()) return "dir";
    return st.isFile() ? "file" : "missing";
  },
  readFileBytes: (p) => readFileSync(p),
  realpath: (p) => realpathSync(p),
  // The fixture arm's splice seam, which this scan never enables for the same
  // reason as the executor below: the lifecycle runs only under `--exec-red`.
  // Refusing loudly is the honest stub -- a silent no-op would let a future
  // change reach it and read as a clean corpus scan.
  exists: () => {
    throw new Error("corpus scan does not splice fixtures");
  },
  mkdir: () => {
    throw new Error("corpus scan does not splice fixtures");
  },
  write: () => {
    throw new Error("corpus scan does not splice fixtures");
  },
  readFile: () => {
    throw new Error("corpus scan does not splice fixtures");
  },
  rm: () => {
    throw new Error("corpus scan does not splice fixtures");
  },
  // The red-contract arm's executor, which this scan never enables: it lints without
  // `--exec`, so nothing reaches this seam. Refusing loudly is the honest stub — a
  // silent success would let a future `--exec` corpus run report green on no execution.
  spawn: () => {
    throw new Error("corpus scan does not execute declared commands");
  },
};

/** The corpus enumeration (plan R4 F2: top-level ledgers included). */
const corpus = execFileSync(
  "git",
  ["ls-files", "-z", "--", "docs/*.md", "docs/**/*.md", "BACKLOG.md", "DEFERRED.md"],
  { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)
  .split("\0")
  .filter((p) => p.length > 0)
  .sort();

interface Row {
  doc: string;
  finding: Finding;
}

const rows: Row[] = [];
const problems: string[] = [];
/** Documents the CLI refuses BY DESIGN (tracked symlinks, spec §7). Named, never
 *  silently dropped — a cap the record does not state reads as full coverage. */
const skippedByDesign: string[] = [];
let linted = 0;
let forcedKind = 0;
const started = Date.now();

for (const doc of corpus) {
  let out = runCli([doc, "--json"], deps);
  if (out.exitCode === 2) {
    // Kind is not inferable from this path; force one so the numerics arms run.
    out = runCli([doc, "--json", "--kind", "spec"], deps);
    forcedKind++;
  }
  if (out.exitCode === 2 || out.stdout === "") {
    if (out.stderr.includes("not a regular file")) {
      skippedByDesign.push(`${doc} — ${out.stderr.slice(0, 120)}`);
    } else {
      problems.push(`${doc}: no report captured (${out.stderr.slice(0, 160)})`);
    }
    continue;
  }
  const result = JSON.parse(out.stdout) as LintResult;
  linted++;
  for (const finding of result.findings) {
    if (!ARM_CODES.includes(finding.code)) continue;
    rows.push({ doc, finding });
    if (finding.severity !== "advisory") {
      problems.push(
        `${doc}:${finding.docLine} ${finding.code} is ${finding.severity}, not advisory`,
      );
    }
  }
}

const byCode = new Map<string, Row[]>();
for (const code of ARM_CODES) byCode.set(code, []);
for (const row of rows) byCode.get(row.finding.code)!.push(row);

// Premise: a run that linted nothing, or in which no arm ever fired, cannot be
// read as "the corpus is clean" (guard-premise rule).
if (linted === 0) problems.push("premise: no document was linted");
if (rows.length === 0) problems.push("premise: no arm fired anywhere in the corpus");

const lines: string[] = [];
lines.push("spec:lint prose-count parity arms — corpus survivor records");
lines.push(`measured ${new Date(started).toISOString()} on branch feat/speclint-prose-count-parity`);
lines.push(
  `documents linted: ${linted} of ${corpus.length} (kind forced on ${forcedKind}; ${skippedByDesign.length} refused by the CLI by design)`,
);
lines.push(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
lines.push("");
if (skippedByDesign.length > 0) {
  lines.push("== refused by the CLI by design (NOT covered by this scan) ==");
  for (const s of skippedByDesign) lines.push(s);
  lines.push("");
}
for (const code of ARM_CODES) {
  const found = byCode.get(code)!;
  lines.push(`== ${code}: ${found.length} advisories ==`);
  for (const { doc, finding } of found) {
    lines.push(`${doc}:${finding.docLine}:${finding.column} ${finding.message}`);
    if (finding.detail !== undefined) lines.push(`    ${finding.detail}`);
  }
  lines.push("");
}
lines.push(`TOTAL advisories across the three arms: ${rows.length}`);
lines.push(`HARD findings from the three arms: 0 (asserted)`);

const outPath = join(root, "docs/superpowers/specs/probes/2026-08-11-speclint-corpus-scan.survivors.txt");
writeFileSync(outPath, lines.join("\n") + "\n");

for (const code of ARM_CODES) {
  console.log(`${code}: ${byCode.get(code)!.length}`);
}
console.log(
  `linted ${linted}/${corpus.length} docs (kind forced on ${forcedKind}), ${rows.length} arm advisories, ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
console.log(`wrote ${outPath.slice(root.length + 1)}`);

if (problems.length > 0) {
  console.error(`\nGATE FAILED (${problems.length}):`);
  for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
  process.exitCode = 1;
} else {
  console.log("GATE PASSED: every arm finding is advisory; no hard findings from the new codes.");
}
