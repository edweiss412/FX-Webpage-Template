// scripts/print-infra-recoveries.mjs
//
// Prints every `infra-recovery` annotation in a Playwright JSON report.
//
//   node scripts/print-infra-recoveries.mjs --report <path>
//
// INFORMATIONAL, NEVER A GATE. It always exits 0 — a recovered run is a green run by design
// (parent spec §4.4), and this step runs under `if: always()` in every member workflow, so a
// non-zero exit here would convert a passing run red for a recovery the design expects.
// A missing or malformed report is surfaced on stderr and still exits 0: the Playwright step's own
// status is the job's verdict, not this printer's.
//
// Spec: docs/superpowers/specs/ci/2026-08-16-modal-wait-boundary-helper-adoption-design.md §4.3
import { existsSync, readFileSync } from "node:fs";

import { collectInfraRecoveries, printInfraRecoveries } from "./lib/infraRecoveryAnnotations.mjs";

const argv = process.argv.slice(2);
const reportFlag = argv.indexOf("--report");
const reportPath = reportFlag === -1 ? null : argv[reportFlag + 1];

if (!reportPath) {
  console.error("print-infra-recoveries: no --report <path> given; nothing to print.");
  process.exit(0);
}

if (!existsSync(reportPath)) {
  console.error(`print-infra-recoveries: no report at ${reportPath}; nothing to print.`);
  process.exit(0);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (err) {
  console.error(`print-infra-recoveries: could not parse ${reportPath}: ${String(err)}`);
  process.exit(0);
}

printInfraRecoveries(collectInfraRecoveries(report));
