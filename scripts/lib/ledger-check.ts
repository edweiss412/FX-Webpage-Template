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
    if (!localNames.includes(name)) reasons.push(`origin advertises a ref we did not resolve: ${name}`);
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
  const resolution = resolveClaims(git, now === undefined ? { fetch: fetchOpt } : { fetch: fetchOpt, now });

  // --- universe verification -------------------------------------------------
  let untrusted = false;
  if (opts.verify) {
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
      const local = git.localRefs();
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
    for (const ref of [...git.localRefs().keys()].filter((n) => n !== "main" && n !== "HEAD")) {
      for (const file of ledgerFiles()) {
        const text = git.showFile(`origin/${ref}`, file);
        if (text === null || text.trim().length === 0) continue;
        if (ledgerItems(file, text).length === 0) {
          reasons.push(`${file} is non-empty at origin/${ref} but parsed zero entries`);
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
      const known = ledgerItems("BACKLOG.md", git.showFile("origin/main", "BACKLOG.md") ?? "");
      if (!known.some((k) => normalizeId(k.id) === id)) {
        notes.push(`note: ${id} is not yet defined anywhere`);
      }
    }
  }

  // Identity unresolved makes a declared claim unattributable, not decided.
  if (declared.length > 0 && resolution.identity === "ci-unknown") {
    reasons.push("identity unresolved; not excluding any branch as self");
    return { code: 2, collisions: declared.map((c) => ({ id: c.id, branch: c.branch })), warnings, notes, reasons };
  }

  // A collision is a collision even past the display cap, so this precedes the
  // untrusted check only in the sense that both are reported; 1 wins because it
  // is actionable and specific.
  if (declared.length > 0) {
    return { code: 1, collisions: declared.map((c) => ({ id: c.id, branch: c.branch })), warnings, notes, reasons };
  }
  if (untrusted) return { code: 2, collisions: [], warnings, notes, reasons };
  return { code: 0, collisions: [], warnings, notes, reasons };
}
