#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_TRIAL_DEPS,
  type TrialDeps,
  type TrialPlan,
  runTrial,
  resolveTarget,
} from "../tests/mutation/source/processProbe";

/**
 * The CHILD entry: one trial plan in, one JSON report out.
 *
 * Thin by contract. Every decision lives in the core, which is an importable
 * module with in-process assertions; a branch that lives here is a branch no
 * in-process suite can reach and no source-mutation run can overlay.
 *
 * The report goes to a FILE in the trial's own scratch directory, never to
 * stdout prose: a parent parsing prose reads whatever else the toolchain
 * decided to print that day.
 */
export type ChildInvocation = {
  plan: TrialPlan;
  root: string;
  surfaceId: string;
  siteId: string;
  reportPath: string;
};

export type ChildDeps = {
  readInvocation: (path: string) => ChildInvocation;
  writeReport: (path: string, text: string) => void;
  trial: TrialDeps;
};

export const DEFAULT_CHILD_DEPS: ChildDeps = {
  readInvocation: (path) => JSON.parse(readFileSync(path, "utf8")) as ChildInvocation,
  writeReport: (path, text) => writeFileSync(path, text, "utf8"),
  trial: DEFAULT_TRIAL_DEPS,
};

export const EXIT_OK = 0;
export const EXIT_REFUSED = 2;

export function main(argv: readonly string[], deps: ChildDeps = DEFAULT_CHILD_DEPS): number {
  const i = argv.indexOf("--invocation");
  const path = i === -1 ? undefined : argv[i + 1];
  if (path === undefined || path.startsWith("--")) {
    process.stderr.write("REFUSED (invocation): --invocation <file> is required\n");
    return EXIT_REFUSED;
  }

  const invocation = deps.readInvocation(path);
  const resolved = resolveTarget({
    root: invocation.root,
    surfaceId: invocation.surfaceId,
    site: invocation.siteId,
  });
  if (resolved.kind === "refusal") {
    deps.writeReport(invocation.reportPath, `${JSON.stringify(resolved, null, 2)}\n`);
    return EXIT_REFUSED;
  }

  const outcome = runTrial(invocation.plan, resolved.target, deps.trial);
  deps.writeReport(
    invocation.reportPath,
    `${JSON.stringify(outcome.kind === "refusal" ? outcome : outcome.report, null, 2)}\n`,
  );
  return outcome.kind === "refusal" ? EXIT_REFUSED : EXIT_OK;
}

/* c8 ignore start — the process entry, exercised by spawning the command itself */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1] as string).href;
if (invokedDirectly) {
  // `process.exitCode`, never `process.exit`: on a pipe, stdout is asynchronous
  // and exiting drops queued bytes.
  process.exitCode = main(process.argv.slice(2));
}
/* c8 ignore stop */
