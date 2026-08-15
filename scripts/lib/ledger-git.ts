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

/**
 * The checkout every command runs in. Overridable ONLY so the adapter can be
 * exercised against a controlled ref namespace: in CI this repository has no
 * `refs/remotes/origin/*` at all, so a test asserting against the live checkout
 * is satisfied by an adapter that returns nothing (whole-diff R13 F3). Nothing
 * in production ever sets it.
 */
const gitRoot = () =>
  // Gated on the test runner. Honoring it unconditionally means an inherited
  // LEDGER_GIT_ROOT redirects every production git and gh call in this module,
  // and an unrelated-but-valid repository yields a valid-LOOKING answer rather
  // than an obvious failure (whole-diff R14 F3).
  (process.env.VITEST === undefined ? undefined : process.env.LEDGER_GIT_ROOT) ?? ROOT;

const FETCH_MS = 30_000;
const LS_REMOTE_MS = 30_000;
const GH_MS = 10_000;

/**
 * Every read THROWS on failure. There is no fail-open path.
 *
 * This module previously had four readers that turned a git failure into a
 * valid-looking answer — `[]` for merged branches, `[]` for diff hunks, `0` for
 * a tip epoch, `false` for shallow. Each is consumed silently: a failed
 * merged-exclusion lets `--check` assert a collision from an already-merged
 * branch, a failed diff drops inferred warnings, a failed shallow probe
 * suppresses the degraded state that tells the caller the answer is narrowed.
 *
 * A caller that wants "absent" asks for it explicitly (`showFile`), and that is
 * the ONLY place absence is a legitimate answer.
 */
/**
 * Node's default `maxBuffer` is 1 MB and truncation is SILENT — `spawnSync`
 * returns status 0 with a short `stdout`. `git show <ref>:BACKLOG-archive.md`
 * already reads 620 KB and that file only grows, so the default is a deadline,
 * not a limit: the day it is crossed, a partial ledger parses cleanly, reports
 * fewer claims, and reads exactly like "nothing is in flight" — the one answer
 * this module must never give wrongly.
 *
 * Found from the other side: `tests/scripts/ledgerClaimsCheck.test.ts`'s
 * "uncapped" case started failing with `Unterminated string in JSON at position
 * 8192` once a branch declared enough claims, because the TEST capped its own
 * reader. Same defect, two layers.
 */
const MAX_GIT_STDOUT = 64 * 1024 * 1024;

const parseRefLine = (line: string): [string, string] | null => {
  const [oid, ref] = line.split(/\s+/);
  if (!oid || !ref) return null;
  const name = ref.replace(/^refs\/heads\//, "");
  return [name, oid];
};

/**
 * The spawn seam. `opts.spawn` defaults to this module's own `spawnSync`, so
 * every production caller (all arity-0) is unchanged and the spawn-ban guard's
 * anti-vacuity twin still sees the literal `node:child_process` import. The
 * seam exists so a test can OBSERVE the four spawn-bound constants, which are
 * otherwise separable only by a child that runs long enough or prints too much
 * (BL-LEDGER-GIT-TIMEOUT-CONSTANTS). The bounds stay module-private: nothing
 * needs them caller-configurable, and exposing them would change the contract.
 */
export function realGitSurface(opts?: { spawn?: typeof spawnSync }): GitSurface {
  const spawn = opts?.spawn ?? spawnSync;

  const git = (args: string[], timeout: number): string => {
    const r = spawn("git", args, {
      cwd: gitRoot(),
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: MAX_GIT_STDOUT,
    });
    if (r.error) throw r.error;
    if (r.status !== 0) {
      throw new Error(
        `git ${args.slice(0, 2).join(" ")} failed: ${(r.stderr ?? "").trim() || `status ${r.status}`}`,
      );
    }
    return r.stdout ?? "";
  };

  return {
    fetch() {
      // Explicit refspec, never the configured one: a clone with a narrow
      // `remote.origin.fetch` resolves only main and still exits 0, silently
      // shrinking the branch universe while every command reports success.
      git(
        ["fetch", "--no-tags", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"],
        FETCH_MS,
      );
    },

    lsRemote() {
      const out = git(["ls-remote", "--heads", "origin"], LS_REMOTE_MS);
      const map = new Map<string, string>();
      for (const line of out.split("\n")) {
        const pair = parseRefLine(line.trim());
        if (pair && pair[0] !== "HEAD") map.set(pair[0], pair[1]);
      }
      return map;
    },

    localRefs() {
      // Throws rather than yielding an empty map: an enumeration failure is an
      // UNKNOWN universe, and returning {} makes it look like an empty one,
      // which reads as "nothing is in flight".
      const raw = spawn(
        "git",
        ["for-each-ref", "--format=%(objectname) %(refname)", "refs/remotes/origin"],
        {
          cwd: gitRoot(),
          encoding: "utf8",
          timeout: LS_REMOTE_MS,
          maxBuffer: MAX_GIT_STDOUT,
        },
      );
      if (raw.error) throw raw.error;
      if (raw.status !== 0)
        throw new Error(`git for-each-ref failed: ${(raw.stderr ?? "").trim()}`);
      const out = raw.stdout ?? "";
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
      const r = spawn(
        "gh",
        [
          "pr",
          "list",
          "--state",
          "open",
          "--json",
          "number,headRefName,headRepositoryOwner,isCrossRepository",
          "--limit",
          "100",
        ],
        { cwd: gitRoot(), encoding: "utf8", timeout: GH_MS, maxBuffer: MAX_GIT_STDOUT },
      );
      // A fault is NOT an empty PR universe. This reader used to answer `[]` for
      // a spawn error, a non-zero exit, unparseable output, and every malformed
      // row shape alike, and `resolveClaims` consumed that as "no open PRs" with
      // no degraded marker — a silently shrunk claim universe reading as "no
      // collision". `[]` now means exactly one thing: gh exited 0 and printed a
      // well-formed, empty row array.
      if (r.error) throw r.error;
      if (r.status !== 0)
        throw new Error(`gh pr list failed: ${(r.stderr ?? "").trim() || `status ${r.status}`}`);
      if (!r.stdout) throw new Error("gh pr list: empty stdout on exit 0");
      let parsed: unknown;
      try {
        parsed = JSON.parse(r.stdout);
      } catch {
        throw new Error("gh pr list: invalid JSON on exit 0");
      }
      if (!Array.isArray(parsed)) throw new Error("gh pr list: non-array payload");
      return parsed.map((x, i): PrRow => {
        const row = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
        const number = row.number;
        const headRefName = row.headRefName;
        const isCrossRepository = row.isCrossRepository;
        const owner = row.headRepositoryOwner;
        if (typeof number !== "number")
          throw new Error(`gh pr list row ${i}: number is not numeric`);
        if (typeof headRefName !== "string" || headRefName === "")
          throw new Error(`gh pr list row ${i}: headRefName is not a non-empty string`);
        // Validated, not coerced: `=== true` read a MISSING flag as a
        // base-repository PR, which resolveClaims then attached to a claim.
        if (typeof isCrossRepository !== "boolean")
          throw new Error(`gh pr list row ${i}: isCrossRepository is not boolean`);
        let login: string | null = null;
        if (owner !== undefined && owner !== null) {
          // Absent and null are gh's own shapes for a deleted account. Anything
          // else must be an object whose login is a string; `?? null` used to
          // coerce "owner", 7, true, [], and {} all to null.
          if (typeof owner !== "object" || Array.isArray(owner))
            throw new Error(`gh pr list row ${i}: headRepositoryOwner is not an object`);
          const l = (owner as Record<string, unknown>).login;
          if (typeof l !== "string")
            throw new Error(`gh pr list row ${i}: headRepositoryOwner.login is not a string`);
          login = l;
        }
        return { number, headRefName, headRepositoryOwner: login, isCrossRepository };
      });
    },

    mergedIntoMain(mainOid) {
      // Name AND OID. The caller excludes a branch only when the OID git
      // reported it merged at still matches the pinned snapshot, so a merge
      // landing between the two reads cannot drop a candidate whose snapshot
      // tip is still unmerged (whole-diff R13 F1).
      // Ancestry asked against the PINNED main, never the movable name. With
      // `origin/main` the question is answered against whatever main points at
      // during the call: under M0 -> M1 -> M0, a branch merged only into the
      // transient M1 is reported merged, its own OID still matches the
      // snapshot, and the final universe check sees M0 at both endpoints and
      // trusts the result — a declared marker excluded from a code-0 report
      // (whole-diff R14 F1).
      const out = git(
        ["branch", "-r", "--merged", mainOid, "--format=%(refname:short) %(objectname)"],
        LS_REMOTE_MS,
      );
      const map = new Map<string, string>();
      for (const line of out.split("\n")) {
        const [name, oid] = line.trim().split(/\s+/);
        if (name === undefined || oid === undefined) continue;
        if (name.length === 0 || name === "origin/main") continue;
        map.set(name, oid);
      }
      return map;
    },

    // One spawn per ref for ALL ledger blob OIDs, plus one `cat-file` per
    // DISTINCT blob. Most branches never touch a ledger, so 15 refs x 4 files
    // was 60 `git show` spawns to read about four distinct blobs.
    fileOids(ref, files) {
      const out = new Map<string, string>();
      const r = spawn("git", ["ls-tree", ref, "--", ...files], {
        cwd: gitRoot(),
        encoding: "utf8",
        timeout: LS_REMOTE_MS,
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: MAX_GIT_STDOUT,
      });
      if (r.error) throw r.error;
      // A ref with no such paths exits 0 with empty output; a bad ref exits non-zero.
      if (r.status !== 0) {
        throw new Error(`git ls-tree ${ref} failed: ${(r.stderr ?? "").trim()}`);
      }
      for (const line of (r.stdout ?? "").split("\n")) {
        // <mode> blob <oid>\t<path>
        const m = /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(line.trim());
        if (m?.[1] && m[2]) out.set(m[2], m[1]);
      }
      return out;
    },

    readBlob(oid) {
      return git(["cat-file", "blob", oid], LS_REMOTE_MS);
    },

    showFile(ref, file) {
      // "Absent" and "failed" are different answers, and collapsing them loses
      // declared claims silently: an object-read failure or a timeout would read
      // as "this branch has no ledger" and drop every marker on it.
      const r = spawn("git", ["show", `${ref}:${file}`], {
        cwd: gitRoot(),
        encoding: "utf8",
        timeout: LS_REMOTE_MS,
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: MAX_GIT_STDOUT,
      });
      if (r.status === 0) return r.stdout ?? "";
      const stderr = `${r.stderr ?? ""}`;
      // git's own wording for a path that simply is not in that tree. Anything
      // else — a corrupt object, a timeout, a bad ref — is a fault, not absence.
      if (
        // ONLY a genuinely missing path is absent. `unknown revision` and
        // `invalid object` mean the REF is bad — a concurrent prune between
        // enumeration and read — and calling that "no ledger here" silently drops
        // every declaration on that branch.
        /does not exist in|exists on disk, but not in/i.test(stderr)
      ) {
        return null;
      }
      throw new Error(`git show ${ref}:${file} failed: ${stderr.trim() || `status ${r.status}`}`);
    },

    mergeBase(ref, mainOid) {
      // The ONE reader where failure is a legitimate answer: a shallow clone has
      // no merge-base, and the caller degrades `inferred` for that ref rather
      // than failing. Distinguished from a fault by asking git first.
      const r = spawn("git", ["merge-base", mainOid, ref], {
        cwd: gitRoot(),
        encoding: "utf8",
        timeout: LS_REMOTE_MS,
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: MAX_GIT_STDOUT,
      });
      if (r.status === 0) return (r.stdout ?? "").trim() || null;
      // Exit 1 is "no merge base"; anything else is a fault.
      if (r.status === 1) return null;
      throw new Error(`git merge-base failed: ${(r.stderr ?? "").trim() || `status ${r.status}`}`);
    },

    diffHunks(base, ref, files): Hunk[] {
      const out = git(["diff", "--unified=0", base, ref, "--", ...files], LS_REMOTE_MS);
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
      // Throws rather than returning 0, which would date every branch to 1970
      // and mark the whole report stale.
      const n = Number(git(["log", "-1", "--format=%ct", ref], LS_REMOTE_MS).trim());
      if (!Number.isFinite(n) || n <= 0) throw new Error(`git log gave no tip date for ${ref}`);
      return n;
    },

    isShallow() {
      // Parsed as a STRING: git prints the literal `false`, and Boolean("false")
      // is true, which would classify every full clone as shallow and disable the
      // merged-exclusion permanently.
      const out = git(["rev-parse", "--is-shallow-repository"], LS_REMOTE_MS).trim();
      if (out !== "true" && out !== "false") {
        throw new Error(`git rev-parse --is-shallow-repository gave ${JSON.stringify(out)}`);
      }
      return out === "true";
    },

    currentBranch() {
      // GITHUB_HEAD_REF is honoured ONLY in CI. Locally it is ambient state that
      // may be stale or spoofed, and trusting it self-excludes another branch's
      // real declaration — probed live: a spoofed value turned a genuine
      // collision into "no collision".
      const fromCI =
        process.env.GITHUB_ACTIONS === "true" ? process.env.GITHUB_HEAD_REF : undefined;
      if (fromCI) return fromCI;
      const out = git(["rev-parse", "--abbrev-ref", "HEAD"], LS_REMOTE_MS);
      const name = out.trim();
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
      // GITHUB_ACTIONS only. A bare CI=true is set by many local harnesses —
      // including this repo's own vitest serial project — and treating it as CI
      // sends a local run down the event-payload path, where the payload is
      // absent, identity reads unresolved, and the run blocks on its own
      // declaration.
      return process.env.GITHUB_ACTIONS === "true";
    },
  };
}
