/**
 * `--check`: is any of these rows already claimed by somebody else?
 *
 * NO SUBPROCESS SPAWNING — everything arrives through the injected `GitSurface`.
 */
import { type GitSurface, resolveClaims } from "./ledger-claims-core";
import { ledgerFiles, ledgerItems } from "./ledger-fields";

export type CheckResult = {
  /** 0 no collision · 1 declared collision, identity resolved · 2 untrusted */
  code: 0 | 1 | 2;
  collisions: { id: string; branch: string }[];
  warnings: string[];
  notes: string[];
  reasons: string[];
};

export type Universe = { ok: boolean; reasons: string[] };

/**
 * Compare the resolved head map against what the remote advertises, as MAPS, in
 * BOTH directions.
 *
 * Names alone are insufficient: a fast-forward, a force-push, and a
 * delete-and-recreate all change the tip under an unchanged name. Counts are
 * insufficient too: churn that deletes two branches and creates one leaves the
 * count equal or larger while hiding the branch that matters.
 *
 * `origin/HEAD` is excluded before comparison — it exists locally as a symref
 * and `git ls-remote --heads` never advertises it, so a literal comparison makes
 * every healthy repository look like it has an extra cached head.
 */
export function verifyUniverse(local: Map<string, string>, remote: Map<string, string>): Universe {
  const reasons: string[] = [];
  const localNames = [...local.keys()].filter((n) => n !== "HEAD");

  for (const name of localNames) {
    if (!remote.has(name)) {
      reasons.push(`extra local ref not advertised by origin: ${name}`);
      continue;
    }
    if (remote.get(name) !== local.get(name)) {
      reasons.push(`tip changed under an unchanged name: ${name}`);
    }
  }
  for (const name of remote.keys()) {
    if (!localNames.includes(name))
      reasons.push(`origin advertises a ref we did not resolve: ${name}`);
  }

  return { ok: reasons.length === 0, reasons };
}

const normalizeId = (raw: string) => raw.replace(/`/g, "").trim().toUpperCase();

export function runCheck(
  git: GitSurface,
  rawIds: string[],
  opts: { now?: number; fetch?: boolean; verify?: boolean } = {},
): CheckResult {
  const warnings: string[] = [];
  const notes: string[] = [];
  const reasons: string[] = [];

  const ids = [...new Set(rawIds.map(normalizeId))].filter((s) => s.length > 0);
  if (ids.length === 0) {
    reasons.push("no ids given");
    return { code: 2, collisions: [], warnings, notes, reasons };
  }

  const fetchOpt = opts.fetch ?? true;
  const now = opts.now;

  // Fetch FIRST, then snapshot. Taking the snapshot before the fetch resolves a
  // pre-fetch view while verifying against the post-fetch remote, so a branch
  // this very run just fetched is advertised but unresolved — exit 2 with
  // "origin advertises a ref we did not resolve", until someone reruns.
  let fetchFailed: string | null = null;
  if (fetchOpt) {
    try {
      git.fetch();
    } catch (e) {
      fetchFailed = `fetch-failed: ${(e as Error).message}`;
    }
  }

  // ONE snapshot, reused for resolution, verification, and vacuity. Three
  // independent reads race with any other worktree fetching concurrently: a
  // branch appearing between reads is verified but not resolved (exit 0 on a
  // real collision), and one disappearing is resolved but not verified.
  let snapshot: Map<string, string>;
  try {
    snapshot = git.localRefs();
  } catch (e) {
    // Ref enumeration failing is an unknown universe, not an empty one.
    reasons.push(`could not enumerate refs: ${(e as Error).message}`);
    return { code: 2, collisions: [], warnings, notes, reasons };
  }
  const pinned: GitSurface = { ...git, localRefs: () => snapshot, fetch: () => {} };

  // A git fault during resolution is UNTRUSTED, never a collision. Letting it
  // propagate exits the process 1, which §3.3 defines as "another live branch
  // declares this row" — an infrastructure fault reported as somebody's work.
  let resolution;
  try {
    resolution = resolveClaims(
      pinned,
      now === undefined ? { fetch: false } : { fetch: false, now },
    );
  } catch (e) {
    reasons.push(`claim resolution failed: ${(e as Error).message}`);
    return { code: 2, collisions: [], warnings, notes, reasons };
  }
  if (fetchFailed !== null) resolution.degraded.push(fetchFailed);

  // --- universe verification -------------------------------------------------
  let untrusted = false;
  // `--no-fetch` means NO NETWORK, and `ls-remote` is a network call. Verifying
  // a cached read against the live remote would both violate that contract and
  // fail offline, which is exactly when the cached read is wanted.
  if (opts.verify && fetchOpt) {
    let remote: Map<string, string> | null = null;
    try {
      remote = git.lsRemote();
    } catch (e) {
      // An uncaught throw would exit 1, which means "another branch declares
      // this row" — an environment fault reported as somebody else's claim.
      reasons.push(`ls-remote failed: ${(e as Error).message}`);
      untrusted = true;
    }
    if (remote !== null) {
      const local = snapshot;
      if (local.size === 0 && remote.size === 0) {
        reasons.push("no origin refs resolvable");
        untrusted = true;
      }
      const v = verifyUniverse(local, remote);
      if (!v.ok) {
        reasons.push(...v.reasons);
        untrusted = true;
      }
    }

    // Per-file vacuity: a ledger that is non-empty on disk but yields zero
    // entries means a whole ledger vanished, which is the same false-all-clear
    // class as an unverified universe.
    //
    // Scans main PLUS the same candidate set claims resolve over — not a
    // different one. Excluding main missed a parser regression confined to it
    // (a main-only repository returned a trusted exit 0), and including merged
    // branches failed on legacy content that resolution never reads.
    const merged = new Set(git.isShallow() ? [] : git.mergedIntoMain());
    const scanRefs = [
      "origin/main",
      ...[...snapshot.keys()]
        .filter((n) => n !== "main" && n !== "HEAD")
        .map((n) => `origin/${n}`)
        .filter((r) => !merged.has(r)),
    ];
    for (const ref of scanRefs) {
      for (const file of ledgerFiles()) {
        const text = git.showFile(ref, file);
        if (text === null || text.trim().length === 0) continue;
        if (ledgerItems(file, text).length === 0) {
          reasons.push(`${file} is non-empty at ${ref} but parsed zero entries`);
          untrusted = true;
        }
      }
    }
  }

  // --- collisions ------------------------------------------------------------
  const wanted = new Set(ids);
  const mine = resolution.selfBranch;
  const relevant = resolution.claims.filter((c) => wanted.has(normalizeId(c.id)));

  const declared = relevant.filter((c) => c.kind === "declared" && c.branch !== mine);
  const inferred = relevant.filter((c) => c.kind === "inferred" && c.branch !== mine);

  for (const c of inferred) {
    warnings.push(`WARN: ${c.id} may be in flight on ${c.branch} (inferred from its ledger diff)`);
  }
  for (const id of ids) {
    if (!resolution.claims.some((c) => normalizeId(c.id) === id)) {
      // Every ledger on main, not just BACKLOG.md: a DEF- row or an archived id
      // would otherwise be reported as defined nowhere.
      const known = ledgerFiles().flatMap((f) =>
        ledgerItems(f, git.showFile("origin/main", f) ?? ""),
      );
      if (!known.some((k) => normalizeId(k.id) === id)) {
        notes.push(`note: ${id} is not yet defined anywhere`);
      }
    }
  }

  // Identity unresolved makes a declared claim unattributable, not decided.
  if (resolution.identity === "ci-unknown" && declared.length > 0) {
    reasons.push("identity unresolved; not excluding any branch as self");
    untrusted = true;
  }

  // A degraded resolution is an untrusted one, whatever else is true. A failed
  // fetch means the claims came from cached refs that may predate the very push
  // being checked for.
  for (const d of resolution.degraded) {
    if (d.startsWith("fetch-failed")) {
      reasons.push(d);
      untrusted = true;
    }
  }

  // UNTRUSTED DOMINATES. Exit 1 asserts "another live branch declares this row",
  // which is a positive claim about the world; it may only be made from a
  // universe that was actually verified. Returning 1 from an unverifiable
  // universe is the same error as returning 0 from one — both answer a question
  // the reader was not in a position to answer.
  const found = declared.map((c) => ({ id: c.id, branch: c.branch }));
  if (untrusted) return { code: 2, collisions: found, warnings, notes, reasons };
  if (declared.length > 0) return { code: 1, collisions: found, warnings, notes, reasons };
  return { code: 0, collisions: [], warnings, notes, reasons };
}
