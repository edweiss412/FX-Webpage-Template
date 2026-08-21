/**
 * Reach oracle for BL-SPECLINT-RED-REASON-VERIFICATION (design §1.3).
 *
 * `probe/population.mts` derives WHICH markers reach the `none` drop. This asks
 * the different and more useful question: what does the shipped CLI emit at
 * those lines TODAY, at the CLI boundary, with `--exec-red` active.
 *
 * Black-box on purpose. `ownedContractLines` and `wellFormedMarkers` are not
 * exported, so any in-process reconstruction of the guard sequence would be a
 * MODEL of `collectionProbePlan` rather than the function itself. Running the
 * CLI is the same surface the acceptance criteria assert against.
 *
 * The fifteen are listed rather than re-derived, deliberately: this probe's job
 * is to check a NAMED set from the design, so a drift between the design's list
 * and the corpus must surface here as a changed result instead of being
 * silently absorbed by a fresh derivation.
 */
import { execFileSync } from "node:child_process";

const FIFTEEN: [string, number][] = [
  // nine `pnpm heavy`-wrapped
  ["docs/superpowers/plans/2026-08-16-mutation-gate-sharding.md", 1237],
  ["docs/superpowers/plans/2026-08-16-premisescan-import-edge-fidelity.md", 2289],
  ["docs/superpowers/plans/2026-08-16-server-action-origin-sweep.md", 235],
  ["docs/superpowers/plans/2026-08-17-red-verdict-capability.md", 124],
  ["docs/superpowers/plans/2026-08-17-rowactions-submenu-reveal-scroll-clamp.md", 197],
  ["docs/superpowers/plans/2026-08-17-shell-binding-mixed-quoted-value.md", 926],
  ["docs/superpowers/plans/ci/2026-08-17-modal-wait-candidate-contract.md", 111],
  ["docs/superpowers/plans/ci/2026-08-17-modal-wait-skeleton-tolerant-sites.md", 118],
  ["docs/superpowers/plans/ci/2026-08-19-send-auth-single-read-lint.md", 639],
  // six other unprobeable commands
  ["docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md", 128],
  ["docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md", 169],
  ["docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md", 188],
  ["docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md", 206],
  ["docs/superpowers/plans/2026-08-17-red-verdict-capability.md", 135],
  ["docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md", 713],
];

if (FIFTEEN.length !== 15) throw new Error(`reach floor: ${FIFTEEN.length} markers, expected 15`);

type Finding = { docLine: number; code: string; severity: string };

const byDoc = new Map<string, number[]>();
for (const [f, l] of FIFTEEN) byDoc.set(f, [...(byDoc.get(f) ?? []), l]);

let silent = 0;
const carried: string[] = [];

for (const doc of [...byDoc.keys()].sort()) {
  // `spec:lint` exits non-zero whenever the doc carries a hard finding, which
  // several of these documents do for unrelated reasons, so a throw here is an
  // ORDINARY result and not an error. The stdout is still the report.
  let raw: string;
  try {
    raw = execFileSync(
      "pnpm",
      ["exec", "tsx", "scripts/spec-lint.ts", "--json", "--exec-red", doc],
      {
        encoding: "utf8",
      },
    );
  } catch (e) {
    const out = (e as { stdout?: string }).stdout;
    if (typeof out !== "string" || out.trim() === "")
      throw new Error(`no report for ${doc}: ${String(e)}`);
    raw = out;
  }
  const findings: Finding[] = JSON.parse(raw).findings ?? [];
  for (const line of byDoc.get(doc)!) {
    const hit = findings.filter((f) => f.docLine === line);
    if (hit.length === 0) {
      silent++;
      console.log(`SILENT${" ".repeat(24)}${doc}:${line}`);
    } else {
      const label = hit.map((f) => `${f.code}/${f.severity}`).join(",");
      carried.push(`${doc}:${line} ${label}`);
      console.log(`${label.padEnd(30)}${doc}:${line}`);
    }
  }
}

console.log(
  `\nmarkers: 15   silent today: ${silent}   already carrying a finding: ${carried.length}`,
);
if (silent + carried.length !== 15) throw new Error("accounting: produced != classified");
