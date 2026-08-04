/**
 * The ONLY module that spawns. Every git and gh call the reader makes lives
 * here, behind `GitSurface`, which is what makes non-invocation assertable at a
 * single seam.
 *
 * Bounds are the spec's: 30 s fetch, 30 s ls-remote, 10 s gh. `gh` honours no
 * timeout of its own, so an unresponsive call would otherwise hang inside
 * preflight's 15 s budget and cost the whole table rather than one column.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { GitSurface, Hunk, PrRow } from "./ledger-claims-core";

const ROOT = join(__dirname, "..", "..");

const FETCH_MS = 30_000;
const LS_REMOTE_MS = 30_000;
const GH_MS = 10_000;

function git(args: string[], timeout: number, quiet = false): string | null {
  const r = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout,
    // stderr discarded on the quiet path: `git show ref:missing-file` writes a
    // `fatal:` line that means nothing, and preflight must not print one per
    // ledger per branch on every healthy run.
    stdio: ["ignore", "pipe", quiet ? "ignore" : "pipe"],
  });
  if (r.status !== 0) return null;
  return r.stdout ?? "";
}

function gitOrThrow(args: string[], timeout: number): string {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr ?? "").trim() || "unknown"}`);
  return r.stdout ?? "";
}

const parseRefLine = (line: string): [string, string] | null => {
  const [oid, ref] = line.split(/\s+/);
  if (!oid || !ref) return null;
  const name = ref.replace(/^refs\/heads\//, "");
  return [name, oid];
};

export function realGitSurface(): GitSurface {
  return {
    fetch() {
      // Explicit refspec, never the configured one: a clone with a narrow
      // `remote.origin.fetch` resolves only main and still exits 0, silently
      // shrinking the branch universe while every command reports success.
      gitOrThrow(["fetch", "--no-tags", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"], FETCH_MS);
    },

    lsRemote() {
      const out = gitOrThrow(["ls-remote", "--heads", "origin"], LS_REMOTE_MS);
      const map = new Map<string, string>();
      for (const line of out.split("\n")) {
        const pair = parseRefLine(line.trim());
        if (pair && pair[0] !== "HEAD") map.set(pair[0], pair[1]);
      }
      return map;
    },

    localRefs() {
      const out = git(["for-each-ref", "--format=%(objectname) %(refname)", "refs/remotes/origin"], LS_REMOTE_MS) ?? "";
      const map = new Map<string, string>();
      for (const line of out.split("\n")) {
        const [oid, ref] = line.trim().split(/\s+/);
        if (!oid || !ref) continue;
        const name = ref.replace(/^refs\/remotes\/origin\//, "");
        // origin/HEAD is a symref to main and ls-remote never advertises it.
        if (name === "HEAD") continue;
        map.set(name, oid);
      }
      return map;
    },

    prList(): PrRow[] {
      const r = spawnSync(
        "gh",
        ["pr", "list", "--state", "open", "--json", "number,headRefName,headRepositoryOwner,isCrossRepository", "--limit", "100"],
        { cwd: ROOT, encoding: "utf8", timeout: GH_MS },
      );
      if (r.status !== 0 || !r.stdout) return [];
      try {
        const rows = JSON.parse(r.stdout) as Array<{
          number: number;
          headRefName: string;
          headRepositoryOwner?: { login?: string } | null;
          isCrossRepository?: boolean;
        }>;
        return rows.map((x) => ({
          number: x.number,
          headRefName: x.headRefName,
          headRepositoryOwner: x.headRepositoryOwner?.login ?? null,
          isCrossRepository: x.isCrossRepository === true,
        }));
      } catch {
        return [];
      }
    },

    mergedIntoMain() {
      const out = git(["branch", "-r", "--merged", "origin/main", "--format=%(refname:short)"], LS_REMOTE_MS) ?? "";
      return out.split("\n").map((s) => s.trim()).filter((s) => s.length > 0 && s !== "origin/main");
    },

    showFile(ref, file) {
      return git(["show", `${ref}:${file}`], LS_REMOTE_MS, true);
    },

    mergeBase(ref) {
      const out = git(["merge-base", "origin/main", ref], LS_REMOTE_MS, true);
      return out === null ? null : out.trim() || null;
    },

    diffHunks(base, ref, files): Hunk[] {
      const out = git(["diff", "--unified=0", base, ref, "--", ...files], LS_REMOTE_MS, true);
      if (out === null) return [];
      const hunks: Hunk[] = [];
      let file: string | null = null;
      for (const line of out.split("\n")) {
        const fm = /^\+\+\+ b\/(.+)$/.exec(line);
        if (fm?.[1]) {
          file = fm[1];
          continue;
        }
        const hm = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (!hm?.[1] || file === null) continue;
        hunks.push({ file, start: Number(hm[1]), count: hm[2] === undefined ? 1 : Number(hm[2]) });
      }
      return hunks;
    },

    tipEpoch(ref) {
      const out = git(["log", "-1", "--format=%ct", ref], LS_REMOTE_MS, true);
      return out === null ? 0 : Number(out.trim()) || 0;
    },

    isShallow() {
      // Parsed as a STRING: git prints the literal `false`, and Boolean("false")
      // is true, which would classify every full clone as shallow and disable the
      // merged-exclusion permanently.
      return (git(["rev-parse", "--is-shallow-repository"], LS_REMOTE_MS, true) ?? "").trim() === "true";
    },

    currentBranch() {
      const fromCI = process.env.GITHUB_HEAD_REF;
      if (fromCI) return fromCI;
      const out = git(["rev-parse", "--abbrev-ref", "HEAD"], LS_REMOTE_MS, true);
      const name = (out ?? "").trim();
      return name && name !== "HEAD" ? name : null;
    },

    headRepo() {
      // From the event payload, which is the only place the head REPOSITORY is
      // available. Absent or unparseable means identity is genuinely unknown.
      const p = process.env.GITHUB_EVENT_PATH;
      if (!p || !existsSync(p)) return null;
      try {
        const ev = JSON.parse(readFileSync(p, "utf8")) as {
          pull_request?: { head?: { repo?: { full_name?: string } } };
        };
        return ev.pull_request?.head?.repo?.full_name ?? null;
      } catch {
        return null;
      }
    },

    repo() {
      return process.env.GITHUB_REPOSITORY ?? null;
    },

    inCI() {
      return process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";
    },
  };
}
