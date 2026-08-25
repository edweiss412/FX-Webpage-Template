#!/usr/bin/env node
// Measures scratch-root and filesystem-mutating-call cost for one vitest
// invocation. This is the probe the scratch-storm spec's §1.3 figures and its
// AC-6 before/after comparison are produced by; it is committed so those numbers
// have a runnable command rather than living in a scratchpad.
//
//   node scripts/probes/scratch-fs-cost.mjs <vitest file> [<vitest file> ...]
//
// Counts are taken at CALL TIME through a raw fd: a vitest worker that is killed
// never runs an exit handler, and a logger built on appendFileSync recurses into
// the writeFileSync it also patches. Both are real defects this probe had.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/probes/scratch-fs-cost.mjs <vitest file> [...]");
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), "fx-fscost-"));
const log = join(work, "calls.log");
const preload = join(work, "preload.cjs");
writeFileSync(
  preload,
  `const fs = require("node:fs");
const log = process.env.FX_FSEV_LOG;
if (log) {
  const names = ["mkdtempSync","mkdirSync","writeFileSync","appendFileSync","rmSync",
    "rmdirSync","unlinkSync","renameSync","copyFileSync","cpSync","symlinkSync"];
  const rawWriteSync = fs.writeSync, rawOpenSync = fs.openSync;
  const fd = rawOpenSync(log, "a");
  let inProbe = false;
  const orig = {};
  for (const n of names) if (typeof fs[n] === "function") orig[n] = fs[n];
  for (const n of Object.keys(orig)) {
    fs[n] = function (...args) {
      if (!inProbe) { inProbe = true; try { rawWriteSync.call(fs, fd, n + "\\n"); } catch {} inProbe = false; }
      return orig[n].apply(this, args);
    };
  }
}
`,
  "utf8",
);
writeFileSync(log, "", "utf8");

const started = Date.now();
const run = spawnSync("pnpm", ["exec", "vitest", "run", ...files], {
  stdio: "ignore",
  env: { ...process.env, FX_FSEV_LOG: log, NODE_OPTIONS: `--require ${preload}` },
});
const secs = (Date.now() - started) / 1000;

const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
const roots = calls.filter((c) => c === "mkdtempSync").length;
const byName = {};
for (const c of calls) byName[c] = (byName[c] ?? 0) + 1;
rmSync(work, { recursive: true, force: true });

console.log(
  JSON.stringify(
    { files, roots, fsops: calls.length, secs, exitCode: run.status, byName },
    null,
    2,
  ),
);
if (run.status !== 0) {
  console.error(`note: vitest exited ${run.status}; counts still reported`);
}
