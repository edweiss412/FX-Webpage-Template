/**
 * Orchestrator pane compaction — classifier core.
 *
 * NO SUBPROCESS SPAWNING, and unlike the precedent that claims this, the claim
 * is guarded: `tests/paneCompaction/purity.test.ts` walks `scripts/lib/` and
 * bans `node:child_process` IMPORT SYNTAX (not the bare specifier, which would
 * match prose describing the rule). Every roster, git, gh, filesystem and clock
 * read arrives through an injected surface, which is what makes non-invocation
 * assertable at one seam.
 *
 * Design: `docs/superpowers/specs/2026-08-16-orchestrator-pane-compaction-design.md`
 */

/** Band names. Pressure is an INTEGER in tenths; see `parseGauge`. */
export type Band = "below" | "eligible" | "critical";

/**
 * Band thresholds, in tenths (spec §4.2).
 *
 * Integers deliberately: each is an `integer-literal` mutation site and each
 * comparison below is a `relational-boundary` site, both inside the declared
 * operator set (`tests/mutation/source/operators.ts:17`). A float fraction would
 * sit outside every declared operator, so the thresholds could not be attacked.
 */
export const ELIGIBLE_AT = 5;
export const CRITICAL_AT = 8;

/** Full, half and empty cells as the TUI renders them. */
const FULL = "█";
const HALF = "▓";
const EMPTY = "░";

/**
 * The gauge's anchor. It is located by this, NOT by scanning the screen for
 * block characters.
 *
 * Probed: the TUI renders a progress bar during compaction itself
 * (`███░░░░░░░░░░░░ 8%`), and a whole-screen filter reads THAT as the gauge —
 * 8 tenths, `critical` — where the real gauge beside it reads 2, `below`. The
 * pane would classify FORCE and be driven while it is already compacting, and
 * the bar exists only while a compaction runs, so the error is self-reinforcing.
 *
 * Five cells exactly: a looser count would re-admit the progress bar, which is
 * longer.
 */
const CELLS = `${FULL}${HALF}${EMPTY}`;
/** Built from the cell constants, so the glyphs have exactly one definition. */
const GAUGE = new RegExp(String.raw`ctx\s+([${CELLS}]{5})`);

/**
 * Pressure as an integer in 0..10: `2 * full + half`.
 *
 * Returns null when the screen carries no gauge — the caller demotes that to
 * UNDETERMINED rather than defaulting a band, because a default band is a
 * silent classification of something never observed.
 */
export function parseGauge(screen: string): number | null {
  const m = GAUGE.exec(screen);
  const cells = m?.[1];
  if (cells === undefined) return null;
  let tenths = 0;
  for (const c of cells) {
    if (c === FULL) tenths += 2;
    else if (c === HALF) tenths += 1;
  }
  return tenths;
}

/** Spec §4.2. Both comparisons are inclusive at the boundary. */
export function bandFor(tenths: number): Band {
  if (tenths >= CRITICAL_AT) return "critical";
  if (tenths >= ELIGIBLE_AT) return "eligible";
  return "below";
}

// ---------------------------------------------------------------------------
// §4.5 precedence
// ---------------------------------------------------------------------------

export type Verdict =
  | "NOT-AN-ARC"
  | "UNOWNED"
  | "UNDETERMINED"
  | "HOLD"
  | "WAIT"
  | "COMPACT"
  | "FORCE";

/** Position cost, §4.4. Ordered cheapest-last for readability, not compared ordinally. */
export type PositionCost = "HardWait" | "High" | "Low" | "Lowest";

/**
 * One pane, with every fact ALREADY RESOLVED by the injected surface.
 *
 * `classify` is pure over this. Resolving the facts — running `gh`, reading the
 * marker, walking the corpus — belongs to the surface (Tasks 3-5), which is what
 * keeps this function testable without a live herdr, git or network.
 */
export type ObservedPane = {
  paneId: string;
  /** null when the pane carries no agent label at all. */
  branch: string | null;
  /** true when another roster entry shares this pane's agent name. */
  duplicateName: boolean;
  status: "idle" | "working" | "blocked" | "done" | "unknown";
  owned: boolean;
  contested: boolean;
  /** null when the accept-set rejected an input; the string names the offending field. */
  rejectedField: string | null;
  sessionMismatch: boolean;
  ghFault: boolean;
  blockedOn: string;
  tenths: number | null;
  position: PositionCost;
};

export type Classification = {
  verdict: Verdict;
  /** Which of the twelve rules decided. Reported so a report can show its reasoning. */
  rule: number;
  /** Later rules that ALSO matched. Ordering cases assert against this. */
  alsoMatched: number[];
  /** What banding alone would have produced, ignoring rules 1-8. */
  wouldBandTo: Verdict;
};

function bandVerdict(tenths: number | null, position: PositionCost): Verdict {
  if (tenths === null) return "UNDETERMINED";
  if (tenths < ELIGIBLE_AT) return "HOLD";
  if (tenths >= CRITICAL_AT) return position === "High" ? "WAIT" : "FORCE";
  return position === "Low" || position === "Lowest" ? "COMPACT" : "WAIT";
}

/** Spec §4.5. Ordered; FIRST MATCH WINS. */
export function classify(pane: ObservedPane): Classification {
  const matched: number[] = [];
  const hit = (rule: number, cond: boolean): void => {
    if (cond) matched.push(rule);
  };

  hit(1, pane.branch === null);
  hit(2, pane.branch !== null && pane.duplicateName);
  hit(3, !pane.owned || pane.contested);
  hit(4, pane.rejectedField !== null);
  hit(5, pane.sessionMismatch);
  hit(6, pane.ghFault);
  hit(7, pane.status === "blocked" || pane.status === "unknown" || pane.blockedOn !== "");
  hit(8, pane.position === "HardWait");

  const wouldBandTo = bandVerdict(pane.tenths, pane.position);
  const verdictFor: Record<number, Verdict> = {
    1: "NOT-AN-ARC",
    2: "UNDETERMINED",
    3: "UNOWNED",
    4: "UNDETERMINED",
    5: "UNDETERMINED",
    6: "UNDETERMINED",
    7: "WAIT",
    8: "WAIT",
  };

  const first = matched[0];
  if (first !== undefined) {
    const verdict = verdictFor[first];
    if (verdict === undefined) throw new Error(`no verdict for rule ${first}`);
    return { verdict, rule: first, alsoMatched: matched.slice(1), wouldBandTo };
  }

  // Rules 9-12: banding. Reached only when every validation rule stayed quiet.
  if (pane.tenths === null) throw new Error("unreachable: a null gauge is rejected by rule 4");
  if (pane.tenths < ELIGIBLE_AT) return { verdict: "HOLD", rule: 9, alsoMatched: [], wouldBandTo };
  if (pane.tenths >= CRITICAL_AT) {
    return pane.position === "High"
      ? { verdict: "WAIT", rule: 11, alsoMatched: [], wouldBandTo }
      : { verdict: "FORCE", rule: 10, alsoMatched: [], wouldBandTo };
  }
  return {
    verdict: bandVerdict(pane.tenths, pane.position),
    rule: 12,
    alsoMatched: [],
    wouldBandTo,
  };
}

// ---------------------------------------------------------------------------
// §4.3 — the `gh` three-way
// ---------------------------------------------------------------------------

/**
 * A `gh` outcome, as a DISCRIMINATED UNION rather than a nullable.
 *
 * This shape is the point. `gh pr checks` exits 1 when there is no PR — and
 * also when the token expired, the network dropped, or the caller is
 * rate-limited. Typed as `Checks | null`, both collapse to `null`, a `gh`
 * outage reads as "every pane has no PR", that matches position row 8 (Low),
 * and the pane yields COMPACT — silently bypassing the hard WAIT on exactly the
 * panes most dangerous to compact. With three variants a fault cannot be
 * WRITTEN as a no-pr, and `strict` makes an unhandled variant a compile error.
 *
 * This is invariant 9's shape ("infra faults surface as discriminable typed
 * results, never as a benign signal") on a call site its auth-scoped registries
 * do not reach.
 */
export type GhOutcome =
  | { kind: "checks"; prOpen: boolean; allGreen: boolean; anyFailed: boolean; anyPending: boolean }
  | { kind: "no-pr" }
  | { kind: "fault"; detail: string };

export type GhInvocation = { exitCode: number; stdout: string; stderr: string };

/**
 * The no-PR signature is THREE conjuncts, not two.
 *
 * Spec §3.9 probed all three: no PR exits non-zero with EMPTY STDOUT and that
 * stderr phrase, while a real check run prints its table to stdout. The stdout
 * conjunct does most of the work — a bare substring test on the phrase is
 * unsafe alone, because a check name or PR title can contain it, and matching
 * anywhere would turn a real check failure into "no PR". That is the same
 * use-versus-mention error that cost the purity guard four review rounds.
 */
const NO_PR = /^\s*no pull requests found for branch\b/;

export function classifyGh(run: GhInvocation): GhOutcome {
  if (run.exitCode === 0) {
    // A zero exit means gh answered; parsing the table belongs to the surface.
    return { kind: "checks", prOpen: true, allGreen: false, anyFailed: false, anyPending: false };
  }
  const noPr = run.stdout.trim() === "" && NO_PR.test(run.stderr);
  if (noPr) return { kind: "no-pr" };
  return { kind: "fault", detail: run.stderr.trim() || `gh exited ${run.exitCode}` };
}

// ---------------------------------------------------------------------------
// §4.4 — the position gradient
// ---------------------------------------------------------------------------

/**
 * How recent a commit must be to count as a task boundary.
 *
 * Stated here rather than inlined so a change is a spec change, per §4.2's
 * precedent — spec round 3 caught this as an undefined phrase.
 */
export const RECENT_COMMIT_WINDOW_MS = 15 * 60_000;

export type CorpusRow = { status: string; verdict: string | null; endedAt: string | null };

export type PositionInputs = {
  now: number;
  clean: boolean;
  lastCommitAt: number | null;
  pr: { open: boolean; allGreen: boolean; anyFailed: boolean; anyPending: boolean } | null;
  corpus: CorpusRow[];
};

export type Position = { row: number; cost: PositionCost };

/**
 * The newest review verdict, or null.
 *
 * Filtered on `status === "verdict"`, NOT on whether a timestamp parses. The
 * live corpus holds a committed `no_verdict` row carrying a valid `endedAt`
 * (`docs/review-rounds/docs/parser-mutation-wave/0da9f84b1634.jsonl`), and
 * selecting it would let a wrapper failure supersede the real verdict — which
 * flips row 4 (triage pending, High) to row 6 (verdict recorded, Low) and
 * promotes the pane toward COMPACT.
 */
export function newestVerdictRow(rows: CorpusRow[]): CorpusRow | null {
  let best: CorpusRow | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (row.status !== "verdict") continue;
    const at = row.endedAt === null ? Number.NaN : Date.parse(row.endedAt);
    if (Number.isNaN(at)) continue; // excluded and nameable, never arbitrarily sorted
    if (at > bestAt) {
      bestAt = at;
      best = row;
    }
  }
  return best;
}

/** Spec §4.4. Ordered; FIRST MATCH WINS. Predicates may overlap; ordering decides. */
export function positionFor(input: PositionInputs): Position {
  const { pr } = input;
  if (pr?.open === true && pr.allGreen) return { row: 1, cost: "HardWait" };
  if (pr?.open === true && pr.anyFailed) return { row: 2, cost: "High" };
  if (!input.clean) return { row: 3, cost: "High" };

  const newest = newestVerdictRow(input.corpus);
  const newestAt =
    newest?.endedAt === undefined || newest?.endedAt === null ? null : Date.parse(newest.endedAt);
  const commitSince =
    newestAt !== null && input.lastCommitAt !== null && input.lastCommitAt > newestAt;

  if (newest !== null && newest.verdict !== "APPROVE" && !commitSince) {
    return { row: 4, cost: "High" };
  }
  if (pr?.open === true && pr.anyPending) return { row: 5, cost: "Low" };
  if (newest !== null && newest.verdict === "APPROVE") return { row: 6, cost: "Low" };
  if (input.lastCommitAt !== null && input.now - input.lastCommitAt <= RECENT_COMMIT_WINDOW_MS) {
    return { row: 7, cost: "Lowest" };
  }
  return { row: 8, cost: "Low" }; // the totality guarantee: no predicate, never falls through
}

// ---------------------------------------------------------------------------
// §5.4 — purview
// ---------------------------------------------------------------------------

export type PurviewRow = {
  paneId: string;
  agentName: string;
  branch: string;
  dispatchedAt: string;
};

export type PurviewFile = { sessionId: string; rows: PurviewRow[] };

export type Ownership =
  | { kind: "owned" }
  | { kind: "unowned"; reason: string }
  | { kind: "contested"; claimants: string[] };

/**
 * Who owns a pane, across EVERY registry rather than just this session's.
 *
 * Ownership is detected, not enforced: nothing stops two orchestrators writing
 * the same `paneId`, so a doubly-claimed pane is reported contested — to both —
 * rather than driven by either. That is a collision report, not a lock, and the
 * residual read-read race is a documented limit.
 */
export function resolveOwnership(
  paneId: string,
  currentBranch: string | null,
  all: PurviewFile[],
  asSessionId: string,
): Ownership {
  const claims = all.filter((f) => f.rows.some((r) => r.paneId === paneId));
  if (claims.length === 0) return { kind: "unowned", reason: "no registry claims this pane" };
  if (claims.length > 1) return { kind: "contested", claimants: claims.map((c) => c.sessionId) };

  const file = claims[0];
  if (file === undefined) return { kind: "unowned", reason: "no registry claims this pane" };
  const row = file.rows.find((r) => r.paneId === paneId);
  if (row === undefined) return { kind: "unowned", reason: "no registry claims this pane" };

  // A row is STALE once its pane runs a different branch. Without this, reusing
  // one terminal pane for another arc leaves the previous orchestrator owning —
  // and able to drive — work it never dispatched; and a fresh worktree has no
  // marker, so the session check no-ops and this is the only guard standing.
  if (currentBranch !== null && row.branch !== currentBranch) {
    return {
      kind: "unowned",
      reason: `stale row: claims ${row.branch}, pane runs ${currentBranch}`,
    };
  }
  if (file.sessionId !== asSessionId) {
    return { kind: "unowned", reason: `owned by ${file.sessionId}` };
  }
  return { kind: "owned" };
}

// ---------------------------------------------------------------------------
// §5.3 — report, envelope, and `--check` aggregation
// ---------------------------------------------------------------------------

export type PaneReport = {
  paneId: string;
  branch: string | null;
  tenths: number | null;
  verdict: Verdict;
  rule: number;
  position: Position;
  /** Whether this pane is in the invoking orchestrator's purview. */
  inPurview: boolean;
};

/**
 * The `--json` payload: an ENVELOPE, never a bare array.
 *
 * NEVER CAPPED, and exported so that is provable. A display cap belongs to the
 * human table alone; slicing here silently truncates a machine consumer's view.
 * It is exported because the live roster is ~12 panes, so an end-to-end
 * assertion could not fail against the mutant it names — the same reasoning as
 * `reportEnvelope` in `scripts/ledger-claims.ts`.
 */
export function reportEnvelope(
  panes: PaneReport[],
  degraded: string[],
): { status: number; degraded: string[]; panes: PaneReport[] } {
  return { status: 0, degraded, panes };
}

/**
 * `--check`'s exit code, over PURVIEW PANES ONLY.
 *
 * The report covers every roster pane; this does not. An orchestrator owning
 * part of a shared machine would otherwise never see 0 or 1, because someone
 * else's pane is permanently `UNOWNED` or `NOT-AN-ARC`.
 *
 * 2 outranks 1: trust is affected, and an unresolvable pane matters more than
 * an actionable one.
 */
export function checkExitCode(panes: PaneReport[]): 0 | 1 | 2 {
  const mine = panes.filter((p) => p.inPurview);
  if (mine.some((p) => p.verdict === "UNDETERMINED")) return 2;
  if (mine.some((p) => p.verdict === "COMPACT" || p.verdict === "FORCE")) return 1;
  return 0;
}

/**
 * One rendered report row.
 *
 * Carries the verdict AND the position evidence, which is what AC-1 requires:
 * the classifier can compute both while an adapter silently omits them, and
 * without the evidence an operator cannot overrule an inference — which is the
 * whole reason inferred position is acceptable (§4.4).
 */
export function renderRow(p: PaneReport): string {
  const gauge = p.tenths === null ? "?" : `${p.tenths}/10`;
  return [
    p.paneId.padEnd(8),
    (p.branch ?? "(unlabeled)").padEnd(34),
    gauge.padStart(5),
    p.verdict.padEnd(13),
    `row ${p.position.row} ${p.position.cost}`,
  ].join("  ");
}

// ---------------------------------------------------------------------------
// §5.2 — the three one-shot commands
// ---------------------------------------------------------------------------

/**
 * The checkpoint prompt. `<NONCE>` is the only substitution.
 *
 * It instructs against committing because invariant 1 permits a task commit
 * only after the implementation passes its test, and an interrupted target is
 * by construction mid-task. It writes the gitignored marker and leaves the tree.
 */
export const CHECKPOINT_TEXT = [
  "Checkpoint before compaction. Do not commit. Update .claude/ship-state.json in your worktree:",
  "set `stage` to where you actually are, set `next` to the literal command or action that resumes",
  "this work, and set `checkpointNonce` to exactly <NONCE>. Leave the working tree exactly as it",
  "is. Then stop.",
].join("\n");

export const RESUME_TEXT = [
  "Run `date` first; the shell clock is the only source of truth. Discard any stale blocked or",
  "standing-down framing. Re-read .claude/ship-state.json in your worktree and resume its `next`",
  "action immediately, in this turn. You were compacted by the orchestrator; approval already",
  "given, do not re-ask.",
].join("\n");

export type SendPlan = { sends: string[] };

/**
 * What a command would send. NO ESC, EVER.
 *
 * The driver does not interrupt. Two review rounds found four separate defects
 * on the interrupt's race surface — it could interrupt the checkpoint it had
 * just detonated, its window was unbounded, its mid-tool-call exclusion had no
 * accept-set, and its documented limit permitted truncating a file mid-write —
 * so it was removed rather than patched a third time. Queueing is sufficient:
 * input to a working pane queues, and a queued slash command executes when the
 * queue drains by natural turn completion.
 */
export function planSends(opts: {
  command: "checkpoint" | "compact" | "resume";
  target: string;
  nonce?: string;
}): SendPlan {
  switch (opts.command) {
    case "checkpoint": {
      const nonce = opts.nonce;
      if (nonce === undefined) throw new Error("--checkpoint requires a nonce");
      return { sends: [CHECKPOINT_TEXT.replace("<NONCE>", nonce), "\r"] };
    }
    case "compact":
      return { sends: ["/compact", "\r"] };
    case "resume":
      return { sends: [RESUME_TEXT, "\r"] };
  }
}

export type RefusalCause =
  | { kind: "missing-as" }
  | { kind: "all-rejected" }
  | { kind: "unresolvable-target"; target: string }
  | { kind: "not-drivable"; verdict: Verdict }
  | { kind: "nonce-absent" }
  | { kind: "nonce-mismatch" }
  | { kind: "stale-verdict"; was: Verdict; now: Verdict }
  | { kind: "contested" };

export type Refusal = { exitCode: 1; sends: never[]; message: string };

/**
 * A refusal, which always NAMES its reason.
 *
 * Exit 1 plus nothing-sent is not sufficient. A silent exit satisfies both and
 * leaves an operator with nothing to act on — on a surface whose entire
 * justification for accepting inferred position is that a human can see the
 * evidence and overrule it (§6, §4.4).
 */
export function refuse(cause: RefusalCause): Refusal {
  const message = ((): string => {
    switch (cause.kind) {
      case "missing-as":
        return "refusing: --as <sessionId> is required and is never inferred";
      case "all-rejected":
        return "refusing: --all is not accepted; name a single target";
      case "unresolvable-target":
        return `refusing: target ${cause.target} did not resolve (agent_not_found)`;
      case "not-drivable":
        return `refusing: verdict is ${cause.verdict}, which is not COMPACT or FORCE`;
      case "nonce-absent":
        return "refusing: the target's marker carries no checkpointNonce";
      case "nonce-mismatch":
        return "refusing: the target's checkpointNonce is not the one this command recorded";
      case "stale-verdict":
        return `refusing: verdict changed from ${cause.was} to ${cause.now} before sending`;
      case "contested":
        return "refusing: purview is contested; another orchestrator also claims this pane";
    }
  })();
  return { exitCode: 1, sends: [], message };
}
