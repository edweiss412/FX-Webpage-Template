// ESM bridge: codex-guard.mjs runs under plain `node` with no build step, so it
// cannot import the TypeScript modules in lib/reviewRounds/. This file mirrors
// their contract for the two calls the wrapper needs. The TS modules stay the
// tested source of truth for the gate and the report; this bridge is tested
// end-to-end through the wrapper in tests/codexGuard/reviewRounds.test.ts, and
// pinned field-for-field against lib/reviewRounds/arc.ts by the differential
// suite at tests/reviewRounds/bridgeParity.test.ts.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

function git(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Mirror of lib/reviewRounds/arc.ts `resolveArc` (spec §5.2). */
export function resolveArc(cwd) {
  const repoRoot = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (repoRoot === null)
    return { ok: false, kind: "not_a_repo", problem: `not a git repository: ${cwd}` };

  // `symbolic-ref`, NOT `rev-parse --abbrev-ref`: on an UNBORN branch (a fresh
  // `git init` with no commits) `rev-parse` fails and the repo reads as a
  // detached HEAD, refusing a dispatch that should merely warn and skip.
  const branch = git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (branch === null || branch === "" || branch === "HEAD")
    return { ok: false, kind: "detached_head", problem: `HEAD is detached in ${repoRoot}` };
  if (branch === "main")
    return { ok: false, kind: "on_main", problem: "HEAD is main; there is no arc to record" };

  const base = git(cwd, ["merge-base", "origin/main", "HEAD"]);
  if (base === null || base.length < 12)
    return {
      ok: false,
      kind: "no_merge_base",
      problem: `no merge-base origin/main HEAD in ${repoRoot}`,
    };

  const baseSha = base.slice(0, 12);
  const corpusFile = join(
    repoRoot,
    "docs",
    "review-rounds",
    ...branch.split("/"),
    `${baseSha}.jsonl`,
  );
  return { ok: true, repoRoot, branch, baseSha, corpusFile };
}

/**
 * Appends one row. NEVER throws and NEVER changes the caller's exit code: the
 * row is telemetry attached to a review that already happened (spec §11.1).
 * Returns a problem string, or null on success.
 */
export function emitRow(cfg, body) {
  const arc = resolveArc(cfg.cwd);
  if (!arc.ok) return arc;

  const row = {
    stage: cfg.stage,
    round: cfg.round,
    branch: arc.branch,
    baseSha: arc.baseSha,
    label: body.label ?? null,
    status: body.status,
    verdict: body.verdict ?? null,
    failureReason: body.failureReason ?? null,
    findingCount: body.findingCount ?? null,
    startedAt: body.startedAt ?? null,
    endedAt: body.endedAt ?? null,
    briefPath: cfg.brief,
    outDir: cfg.out,
    guardVersion: body.guardVersion ?? null,
    // The wrapper_error site's body omits these two, so they DEFAULT here
    // rather than being read off an undefined key (spec §5.4).
    recoveredFrom: body.recoveredFrom ?? null,
  };

  try {
    mkdirSync(dirname(arc.corpusFile), { recursive: true });
    let prefix = "";
    try {
      if (statSync(arc.corpusFile).size > 0 && !readFileSync(arc.corpusFile, "utf8").endsWith("\n"))
        prefix = "\n";
    } catch {
      /* not created yet */
    }
    appendFileSync(arc.corpusFile, prefix + JSON.stringify(row) + "\n");
    return null;
  } catch (e) {
    return { ok: false, kind: "unwritable", problem: `could not append row: ${e.message}` };
  }
}
