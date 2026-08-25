/**
 * Harness for the scratch-root cleanup guard.
 *
 * Lives beside the suite rather than inside it because the guard runs vitest
 * CHILDREN, and a `*.test.ts` imported by anything executes that file's suite
 * inside the importer.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { GUARD_SURFACES } from "./source/registry";

/** Repo root: this file sits at <root>/tests/mutation/. */
export const REPO_ROOT = join(import.meta.dirname, "..", "..");

/**
 * The subject set, DERIVED: every distinct `suitePaths` set an enrolled surface
 * names. Keyed by the joined set because the harness runs a SET at a time --
 * that is what the mutation runner does, and two surfaces sharing a set share
 * its cost.
 *
 * Scoped by "creates scratch roots", never by "registers no removal": the
 * latter is the one predicate the repair falsifies for every member, so a guard
 * defined that way empties out as it succeeds and then passes over nothing.
 */
export function subjectFiles(): string[] {
  const files = new Set<string>();
  for (const set of decidingSuiteSets()) for (const f of set) if (callsMkdtemp(f)) files.add(f);
  return [...files].sort();
}

/** Family prefix of a recorded root, for attributing a survivor to its producer. */
export function familyOf(rootPath: string): string {
  const base = rootPath.slice(rootPath.lastIndexOf("/") + 1);
  return base.replace(/[A-Za-z0-9]{6}$/, "");
}

export function decidingSuiteSets(): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const surface of GUARD_SURFACES) {
    const key = [...surface.suitePaths].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([...surface.suitePaths]);
  }
  return out;
}

/** Suite files that call `mkdtempSync`, for the membership arm. */
export function callsMkdtemp(repoRelPath: string): boolean {
  const abs = join(REPO_ROOT, repoRelPath);
  if (!existsSync(abs)) return false;
  return /\bmkdtempSync\s*\(/.test(readFileSync(abs, "utf8"));
}

export type ChildRun = {
  /** Child's exit status. 0 for the success arm, non-zero for the failure arm. */
  readonly exitCode: number | null;
  /** Absolute scratch roots the child created, in creation order. */
  readonly created: readonly string[];
  /** Of those, the ones that still exist. This is the oracle. */
  readonly survivors: readonly string[];
};

/**
 * Run one suite-set in a child with an isolated TMPDIR and report what it made
 * and what it left.
 *
 * The oracle is SURVIVING RECORDED PATHS, never "the isolated dir is empty":
 * vitest creates a temp entry of its own, so the empty form stays false after
 * correct cleanup and no repair could ever satisfy it.
 *
 * `failAfter` injects a failure through the same preload that records the
 * roots -- the Nth mutating call throws -- so the failure is guaranteed to land
 * AFTER a root exists, without any of the subject suites carrying an injection
 * hook. A failure in a case that created no root proves nothing: the other
 * cases clean up after themselves and there is nothing left to leak.
 */
export function runSuiteSet(files: readonly string[], opts: { failAfter?: number } = {}): ChildRun {
  const iso = mkdtempSync(join(tmpdir(), "fx-cleanup-guard-"));
  const log = join(iso, "__created.log");
  const preload = join(iso, "__preload.cjs");
  writeFileSync(log, "", "utf8");
  writeFileSync(preload, PRELOAD, "utf8");

  const child = spawnSync("pnpm", ["exec", "vitest", "run", ...files], {
    cwd: REPO_ROOT,
    stdio: "ignore",
    env: {
      ...process.env,
      TMPDIR: iso,
      // Load-bearing: without this the preload file is written and never read,
      // and the harness reports "created 0 roots" for a suite that creates many.
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require ${preload}`].filter(Boolean).join(" "),
      FX_CLEANUP_GUARD_LOG: log,
      ...(opts.failAfter === undefined
        ? {}
        : { FX_CLEANUP_GUARD_FAIL_AFTER: String(opts.failAfter) }),
    },
  });

  const created = readFileSync(log, "utf8").split("\n").filter(Boolean);
  const survivors = created.filter((p) => existsSync(p));
  rmSync(iso, { recursive: true, force: true });
  return { exitCode: child.status, created, survivors };
}

/**
 * Records every `mkdtempSync` RESULT at call time through a raw fd.
 *
 * Both details are load-bearing and both were measured. An exit handler loses
 * every vitest WORKER's counts, because a killed worker never runs one. And a
 * logger built on `appendFileSync` recurses into the `writeFileSync` it also
 * patches -- a self-test showed 60,776 spurious calls for three real ones.
 */
const PRELOAD = `
const fs = require("node:fs");
const log = process.env.FX_CLEANUP_GUARD_LOG;
if (log) {
  const rawWriteSync = fs.writeSync;
  const fd = fs.openSync(log, "a");
  const origMkdtemp = fs.mkdtempSync;
  let inProbe = false;
  fs.mkdtempSync = function (...args) {
    const made = origMkdtemp.apply(this, args);
    if (!inProbe) {
      inProbe = true;
      try { rawWriteSync.call(fs, fd, made + "\\n"); } catch {}
      inProbe = false;
    }
    return made;
  };
  const failAfter = Number(process.env.FX_CLEANUP_GUARD_FAIL_AFTER ?? "");
  if (Number.isFinite(failAfter) && failAfter > 0) {
    let writes = 0;
    const origWrite = fs.writeFileSync;
    fs.writeFileSync = function (...args) {
      writes += 1;
      if (writes === failAfter) {
        throw new Error("FX_CLEANUP_GUARD injected failure after " + writes + " writes");
      }
      return origWrite.apply(this, args);
    };
  }
}
`;
