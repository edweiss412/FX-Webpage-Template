#!/usr/bin/env node
// scripts/check-phantom-gap-executed.mjs
//
// Thin CLI wrapper. Every decision lives in scripts/lib/phantomGapExecuted.mjs,
// which the referring Vitest suite imports and the source-mutation registry
// enrolls; this file holds only process I/O, because that is the part a mutation
// harness cannot reach through an import (see that module's header for the
// measurement).
//
//   node scripts/check-phantom-gap-executed.mjs [--report <path>]
//
// Zero-args reads test-results/phantom-gap-diagrams-report.json so the workflow
// step literal stays fixed. Exit 0 = every required (case, project) pair really
// executed; exit 1 = one did not, or no report was produced at all.
import { existsSync, readFileSync } from "node:fs";

import { resolveReportPath, runCheck } from "./lib/phantomGapExecuted.mjs";

const reportPath = resolveReportPath(process.argv.slice(2), process.cwd());

if (reportPath === undefined || !existsSync(reportPath)) {
  console.error(`check-phantom-gap-executed: no report at ${reportPath}`);
  console.error("The run must emit one (--reporter=list,json + PLAYWRIGHT_JSON_OUTPUT_NAME).");
  process.exit(1);
}

const { ok, message } = runCheck(JSON.parse(readFileSync(reportPath, "utf8")));

if (!ok) {
  console.error(message);
  process.exit(1);
}

console.log(message);
