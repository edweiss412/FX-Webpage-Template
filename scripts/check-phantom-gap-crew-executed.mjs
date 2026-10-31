#!/usr/bin/env node
// scripts/check-phantom-gap-crew-executed.mjs
//
// The phantom-gap job's CREW probe step, the same check as
// scripts/check-phantom-gap-executed.mjs over the crew step's own report and
// its own pair table (whole-diff review round 2, second pass, 2C-R2-1). Every
// decision lives in scripts/lib/phantomGapExecuted.mjs, which the referring
// suite imports and the source-mutation registry enrolls; this file holds only
// process I/O, as its sibling does.
//
//   node scripts/check-phantom-gap-crew-executed.mjs [--report <path>]
//
// Zero-args reads test-results/phantom-gap-crew-report.json. Exit 0 = every
// required crew pair really executed; exit 1 = one did not, or no report at all.
import { existsSync, readFileSync } from "node:fs";

import {
  CREW_REPORT_RELATIVE,
  CREW_REQUIRED_PAIRS,
  resolveReportPath,
  runCheck,
} from "./lib/phantomGapExecuted.mjs";

const reportPath = resolveReportPath(process.argv.slice(2), process.cwd(), CREW_REPORT_RELATIVE);

if (reportPath === undefined || !existsSync(reportPath)) {
  console.error(`check-phantom-gap-crew-executed: no report at ${reportPath}`);
  console.error("The run must emit one (--reporter=list,json + PLAYWRIGHT_JSON_OUTPUT_NAME).");
  process.exit(1);
}

const { ok, message } = runCheck(JSON.parse(readFileSync(reportPath, "utf8")), CREW_REQUIRED_PAIRS);

if (!ok) {
  console.error(`crew probe step: ${message}`);
  process.exit(1);
}

console.log(`crew probe step: ${message}`);
