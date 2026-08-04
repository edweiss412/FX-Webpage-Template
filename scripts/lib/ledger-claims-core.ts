/**
 * Claim resolution: which ledger rows are claimed in flight, by which branch.
 *
 * NO SUBPROCESS SPAWNING. Every git and gh operation arrives through the
 * injected `GitSurface`, which is what makes non-invocation assertable at one
 * seam — a recorder wrapping this interface would be blind to a direct
 * `node:child_process` call made here, so a structural guard bans that import
 * outright.
 */
import { isInProgress, ledgerFiles, ledgerItems } from "./ledger-fields";

export type Hunk = { file: string; start: number; count: number };

export type PrRow = {
  number: number;
  headRefName: string;
  headRepositoryOwner: string | null;
  isCrossRepository: boolean;
};

/** The complete subprocess seam. Nothing outside this may spawn. */
export type GitSurface = {
  fetch(): void;
  /** name -> OID, as advertised by the remote. `HEAD` is never included. */
  lsRemote(): Map<string, string>;
  /** name -> OID for `refs/remotes/origin/*`, with the `origin/HEAD` symref excluded. */
  localRefs(): Map<string, string>;
  prList(): PrRow[];
  mergedIntoMain(): string[];
  /** File content at a ref, or null when absent. Never throws on a missing path. */
  showFile(ref: string, file: string): string | null;
  mergeBase(ref: string): string | null;
  diffHunks(base: string, ref: string, files: string[]): Hunk[];
  tipEpoch(ref: string): number;
  isShallow(): boolean;
  currentBranch(): string | null;
  /** Head repository from the CI event payload; null when it cannot be read. */
  headRepo(): string | null;
  repo(): string | null;
  inCI(): boolean;
};

export type Claim = {
  id: string;
  branch: string;
  kind: "declared" | "inferred";
  pr: number | null;
  tipAgeDays: number;
  stale: boolean;
};

export type Identity = "local" | "ci-resolved" | "ci-unknown";

export type Resolution = {
  claims: Claim[];
  degraded: string[];
  identity: Identity;
  /** The branch that is "me", or null when nothing may be excluded as self. */
  selfBranch: string | null;
};

/** Tip older than this reads as abandoned. Display label only; never drops a claim. */
const STALE_DAYS = 14;

const shortName = (ref: string) => ref.replace(/^origin\//, "");

/**
 * Identity resolves in three cases, and collapsing any two breaks one of them.
 *
 * Outside CI the event payload is ALWAYS absent, so treating "no payload" as
 * unknown would disable self-exclusion on every local `--check` — the Stage 0
 * pre-flight path — and report the session's own claims as collisions.
 *
 * A local worktree's branch pushes to `origin`, so it IS a base-repo branch and
 * name-based exclusion is sound there; fork ambiguity cannot arise.
 */
function resolveIdentity(git: GitSurface): { identity: Identity; selfBranch: string | null } {
  if (!git.inCI()) return { identity: "local", selfBranch: git.currentBranch() };

  const head = git.headRepo();
  if (head === null) return { identity: "ci-unknown", selfBranch: null };

  const base = git.repo();
  // A bare branch name is not an identity across repositories: a fork branch and
  // a base branch can share a name, and the base branch's claims are not ours.
  if (base !== null && head !== base) return { identity: "ci-resolved", selfBranch: null };
  return { identity: "ci-resolved", selfBranch: git.currentBranch() };
}

export function resolveClaims(
  git: GitSurface,
  opts: { fetch: boolean; now?: number },
): Resolution {
  const degraded: string[] = [];
  const now = opts.now ?? Math.floor(Date.now() / 1000);

  if (opts.fetch) {
    try {
      git.fetch();
    } catch (e) {
      degraded.push(`fetch-failed: ${(e as Error).message}`);
    }
  } else {
    degraded.push("no-fetch-cached-refs");
  }

  const { identity, selfBranch } = resolveIdentity(git);
  if (identity === "ci-unknown") degraded.push("identity-unresolved");

  const shallow = git.isShallow();
  const merged = shallow ? new Set<string>() : new Set(git.mergedIntoMain());
  if (shallow) degraded.push("merged-exclusion-skipped");

  const candidates = [...git.localRefs().keys()]
    .filter((name) => name !== "main" && name !== "HEAD")
    .map((name) => `origin/${name}`)
    .filter((ref) => !merged.has(ref));

  const prByBranch = new Map<string, PrRow>();
  for (const row of git.prList()) {
    // Base-repo PRs only: a fork PR sharing a head name must not attach its
    // number to the base branch's claim.
    if (!row.isCrossRepository) prByBranch.set(row.headRefName, row);
  }

  const files = ledgerFiles();
  const claims: Claim[] = [];

  for (const ref of candidates) {
    const branch = shortName(ref);
    const ageDays = Math.floor((now - git.tipEpoch(ref)) / 86_400);

    for (const file of files) {
      const text = git.showFile(ref, file);
      if (text === null) continue;
      for (const item of ledgerItems(file, text)) {
        if (!isInProgress(item)) continue;
        claims.push({
          id: item.id,
          branch,
          kind: "declared",
          pr: prByBranch.get(branch)?.number ?? null,
          tipAgeDays: ageDays,
          stale: ageDays > STALE_DAYS,
        });
      }
    }
  }

  return { claims, degraded, identity, selfBranch };
}
