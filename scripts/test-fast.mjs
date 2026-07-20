#!/usr/bin/env node
// scripts/test-fast.mjs — local full-suite overlap runner (spec §4.1).
// Phase 1: serial project streams live while the parallel project runs
// concurrently (buffered + teed to a crash-safe log). Phase 2 (epilogue):
// TEST_FAST_DEFERRED files re-run with default config. Coverage is identical to
// `pnpm test`; only phase timing changes. Exit code: serial's, else parallel's,
// else the epilogue's.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

// Mirror of vitest.projects.ts TEST_FAST_DEFERRED (node cannot import TS).
// tests/cross-cutting/test-fast-deferred.test.ts pins the two lists equal.
const TEST_FAST_DEFERRED = ["tests/components/admin/settings/DevToolsRow.absent.test.tsx"];

if (process.env.RUN_BUILD_ARTIFACT_GATE_TEST === "1") {
  console.error(
    "[test:fast] RUN_BUILD_ARTIFACT_GATE_TEST=1 is not supported: the build-artifact " +
      "gate's `pnpm build` child rewrites lib/admin/__generated__/devPanelPresent.ts " +
      "mid-run, which the serial/parallel overlap cannot tolerate. Use `pnpm test`.",
  );
  process.exit(1);
}

const LOG_DIR = "node_modules/.cache/fxav-test-fast";
mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = `${LOG_DIR}/parallel.log`;
writeFileSync(LOG_PATH, "");

const children = new Set();
let interrupted = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    interrupted = true;
    for (const child of children) child.kill(sig);
  });
}

function vitest(args, opts) {
  const child = spawn("pnpm", ["exec", "vitest", "run", ...args], opts);
  children.add(child);
  // A spawn failure (pnpm missing, EAGAIN) must surface as a non-zero phase,
  // not an unhandled 'error' event that orphans the sibling child.
  child.on("error", (err) => {
    console.error(`[test:fast] failed to spawn vitest (${args.join(" ")}): ${err.message}`);
  });
  return child;
}

function done(child) {
  return new Promise((resolve) => {
    child.on("close", (code) => {
      children.delete(child);
      resolve(code ?? 1);
    });
    child.on("error", () => {
      children.delete(child);
      resolve(1);
    });
  });
}

// Parallel phase: VITEST_TEST_FAST=1 (deferred excluded, cacheDir moved aside).
const parallelChunks = [];
const parallel = vitest(["--project", "parallel"], {
  env: { ...process.env, VITEST_TEST_FAST: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [parallel.stdout, parallel.stderr]) {
  stream.on("data", (chunk) => {
    // Collect Buffers and decode ONCE at the end: string-concatenating chunks
    // can split a multi-byte UTF-8 sequence across a chunk boundary.
    parallelChunks.push(chunk);
    try {
      appendFileSync(LOG_PATH, chunk);
    } catch {
      // The tee is a convenience; losing it must never kill the run.
    }
  });
  stream.on("error", (err) => {
    console.error(`[test:fast] parallel stream error: ${err.message}`);
  });
}
const parallelDone = done(parallel).then((code) => {
  if (code !== 0) {
    console.error(
      `\n[test:fast] parallel project FAILED (exit ${code}) — full output after the serial phase (also teed to ${LOG_PATH})\n`,
    );
  }
  return code;
});

// Serial phase: streams live (the long pole).
const serialDone = done(vitest(["--project", "serial"], { stdio: "inherit" }));

const [serialCode, parallelCode] = await Promise.all([serialDone, parallelDone]);

console.log("\n[test:fast] ── parallel project output ──\n");
process.stdout.write(Buffer.concat(parallelChunks).toString("utf8"));

// A Ctrl-C during phase 1 must NOT spawn the epilogue (it would need a second
// interrupt to stop). Interrupted runs exit non-zero without the epilogue.
if (interrupted) {
  console.error("\n[test:fast] interrupted — skipping epilogue\n");
  process.exit(serialCode !== 0 ? serialCode : parallelCode !== 0 ? parallelCode : 130);
}

// Epilogue: deferred files under DEFAULT config (no VITEST_TEST_FAST) — the
// serial writer has restored devPanelPresent.ts by now.
console.log("\n[test:fast] ── epilogue (deferred files) ──\n");
const epilogueCode = await done(
  vitest([...TEST_FAST_DEFERRED, "--project", "parallel"], { stdio: "inherit" }),
);

process.exit(serialCode !== 0 ? serialCode : parallelCode !== 0 ? parallelCode : epilogueCode);
