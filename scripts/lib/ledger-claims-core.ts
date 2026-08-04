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
  /** All ledger blob OIDs at a ref in ONE spawn, so reads can be deduplicated. */
  fileOids(ref: string, files: string[]): Map<string, string>;
  /** A blob by OID, read once per distinct blob rather than once per branch. */
  readBlob(oid: string): string;
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
  if (!git.inCI()) {
    const branch = git.currentBranch();
    // A detached HEAD locally means self cannot be established, which is
    // UNRESOLVED — not "resolved, and nothing is me". The difference decides
    // whether a claim on your own branch exits 1 or 2.
    if (branch === null) return { identity: "ci-unknown", selfBranch: null };
    return { identity: "local", selfBranch: branch };
  }

  const head = git.headRepo();
  if (head === null) return { identity: "ci-unknown", selfBranch: null };

  const base = git.repo();
  // A missing base repository is UNRESOLVED, not same-repository. Defaulting to
  // same-repo would self-exclude a same-named fork claim, which is the exact
  // false all-clear the fork rule exists to prevent.
  if (base === null || base.length === 0) return { identity: "ci-unknown", selfBranch: null };
  // A bare branch name is not an identity across repositories: a fork branch and
  // a base branch can share a name, and the base branch's claims are not ours.
  // A fork PR is genuinely resolved with nothing as self: no base ref can be
  // "me". That is different from not knowing who I am.
  if (head !== base) return { identity: "ci-resolved", selfBranch: null };
  const branch = git.currentBranch();
  if (branch === null) return { identity: "ci-unknown", selfBranch: null };
  return { identity: "ci-resolved", selfBranch: branch };
}

export function resolveClaims(
  git: GitSurface,
  opts: { fetch: boolean; now?: number; declaredOnly?: boolean },
): Resolution {
  // `declaredOnly` exists for the CI backstop, which is declared-versus-declared
  // by spec. Without it that consumer pays for — and can FAIL on — four surfaces
  // it never reads: a `gh` call it is forbidden to make here, plus tip dates,
  // merge-bases and diffs that only feed the advisory `inferred` signal. An
  // inference fault must not turn a healthy declaration check red.
  const declaredOnly = opts.declaredOnly === true;
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

  // Tip epochs resolved ONCE per ref. Calling git.tipEpoch inside a comparator
  // would spawn O(n log n) subprocesses for a cosmetic ordering.
  const tipOf = new Map<string, number>(
    candidates.map((ref) => [ref, declaredOnly ? 0 : git.tipEpoch(ref)]),
  );
  // Newest tip first, so the table leads with what is most likely live rather
  // than with whatever order the ref map happened to yield.
  candidates.sort((a, b) => (tipOf.get(b) ?? 0) - (tipOf.get(a) ?? 0));

  const prByBranch = new Map<string, PrRow>();
  for (const row of declaredOnly ? [] : git.prList()) {
    // Base-repo PRs only: a fork PR sharing a head name must not attach its
    // number to the base branch's claim.
    if (!row.isCrossRepository) prByBranch.set(row.headRefName, row);
  }

  const files = ledgerFiles();
  const claims: Claim[] = [];
  // Distinct blobs, read once each: most branches share main's ledger blobs.
  const blobCache = new Map<string, string>();

  for (const ref of candidates) {
    const branch = shortName(ref);
    // Ceil, not floor: flooring leaves a 14.5-day tip reading 14 and therefore
    // fresh until day 15, which is a boundary that silently drifts a day.
    const ageDays = Math.ceil((now - (tipOf.get(ref) ?? 0)) / 86_400);

    const mk = (id: string, kind: Claim["kind"]): Claim => ({
      id,
      branch,
      kind,
      pr: prByBranch.get(branch)?.number ?? null,
      tipAgeDays: ageDays,
      stale: ageDays > STALE_DAYS,
    });

    const spansByFile = new Map<string, { id: string; line: number; endLine: number }[]>();
    const declaredHere = new Set<string>();

    // One ls-tree per ref, then one read per DISTINCT blob across all refs.
    const oids = git.fileOids(ref, [...files]);
    for (const file of files) {
      const oid = oids.get(file);
      if (oid === undefined) continue; // absent at this ref
      let text = blobCache.get(oid);
      if (text === undefined) {
        text = git.readBlob(oid);
        blobCache.set(oid, text);
      }
      const items = ledgerItems(file, text);
      spansByFile.set(
        file,
        items.map((i) => ({ id: i.id, line: i.line, endLine: i.endLine })),
      );
      for (const item of items) {
        if (!isInProgress(item)) continue;
        declaredHere.add(item.id);
        claims.push(mk(item.id, "declared"));
      }
    }

    // Inferred: a branch that edited an entry's span is working on it, marker or
    // not. Advisory only — it never fails anything, in any identity case.
    if (declaredOnly) continue;
    const base = git.mergeBase(ref);
    if (base === null) {
      if (!degraded.includes("merge-base-unavailable")) degraded.push("merge-base-unavailable");
      continue;
    }

    const touched = new Set<string>();
    for (const h of git.diffHunks(base, ref, files)) {
      // A pure deletion has no new-side line, so it maps to nothing.
      if (h.count === 0) continue;
      const last = h.start + h.count - 1;
      for (const span of spansByFile.get(h.file) ?? []) {
        // Attributes to EVERY overlapping entry, not just the first: a hunk
        // spanning a heading boundary genuinely touches both.
        if (last >= span.line && h.start <= span.endLine) touched.add(span.id);
      }
      // A hunk outside every span — the reconciliation preamble above the first
      // heading is the common one — maps to no entry and is dropped.
    }
    for (const id of touched) if (!declaredHere.has(id)) claims.push(mk(id, "inferred"));
  }

  return { claims, degraded, identity, selfBranch };
}
