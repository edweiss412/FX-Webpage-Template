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
const GAUGE = new RegExp(String.raw`ctx\s+([${CELLS}]{5})`, "g");

/**
 * Pressure as an integer in 0..10: `2 * full + half`.
 *
 * Returns null when the screen carries no gauge — the caller demotes that to
 * UNDETERMINED rather than defaulting a band, because a default band is a
 * silent classification of something never observed.
 */
export function parseGauge(screen: string): number | null {
  // The LAST occurrence, not the first.
  //
  // The gauge lives in the pane's FOOTER, which is the bottom of the screen.
  // Taking the first match let ordinary conversation text win: a transcript line
  // that merely mentions `ctx ████░` parsed as 8 while the real footer read
  // `ctx █░░░░` = 2, and the pane was driven on a pressure it never had (diff
  // round 4, finding 2). Nothing hostile is required -- an agent discussing this
  // very tool would produce it, and this file is full of such lines.
  //
  // Anchoring to the footer's POSITION rather than its content, because the
  // content is exactly what a transcript can imitate.
  // No `lastIndex` reset, deliberately. The loop below runs to EXHAUSTION, and
  // a `/g` regex resets `lastIndex` to 0 the moment `exec` returns null, so the
  // state cannot leak into the next call. Probed rather than reasoned: 4000
  // call sequences against a REUSED regex object, with and without an explicit
  // reset, produced identical results on every one.
  //
  // The reset was here and the mutation gate flagged its removal as a surviving
  // mutant. It was right -- the line could not affect behaviour, which makes it
  // dead code rather than a guard. Removed instead of ledgered as equivalent:
  // the invariant it was standing in for is "consecutive calls agree", and that
  // is pinned by a test, which keeps holding if this loop is ever rewritten.
  //
  // The one thing that WOULD break it is exiting the loop early. Do not add a
  // `break` here without restoring the reset.
  let cells: string | undefined;
  for (let m = GAUGE.exec(screen); m !== null; m = GAUGE.exec(screen)) cells = m[1];
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
  /**
   * A valid, uncontested registry row claims this pane -- by ANYONE.
   *
   * Rule 3 asks whether the pane is claimed at all, which is what spec §4.2's
   * UNOWNED means. Whether the CALLER may drive it is a separate question the
   * adapter asks at the drive gate, because the report has no caller to compare
   * against and must not answer it.
   */
  claimed: boolean;
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
  hit(3, !pane.claimed || pane.contested);
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
    // A zero exit means gh RAN. It does not mean gh produced a check table.
    //
    // This previously returned `checks` on any exit-zero and left parsing "to
    // the surface" -- and the surface's parse failure returned null, which no
    // path turned into a fault. So `stdout:"{"` became a benign observation,
    // `ghFault` stayed false, and a `--checkpoint` probe exited 0 having SENT
    // both bytes (diff round 1, finding 2). AC-4 requires UNDETERMINED for input
    // outside the accept-set, and a truncated or non-JSON payload is exactly
    // that: an interrupted pipe is ordinary operation, not a forged input.
    //
    // Validated HERE rather than at the caller because `kind: "checks"` is the
    // claim "these four flags mean something"; making that claim before the
    // payload parses is what let absent and malformed collapse into each other.
    let parsed: unknown;
    try {
      parsed = JSON.parse(run.stdout);
    } catch {
      return { kind: "fault", detail: "gh exited 0 with unparseable stdout" };
    }
    if (!Array.isArray(parsed)) {
      return { kind: "fault", detail: "gh exited 0 with a non-array check table" };
    }
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
/**
 * Whether two or more verdict rows tie for newest.
 *
 * Spec §3.5 and the §9 table both say a tie yields `UNDETERMINED`, and nothing
 * implemented it: `newestVerdictRow` silently kept whichever row it saw first,
 * so the answer depended on file-read order. Diff round 1, finding 6, probed
 * that directly -- same-time `APPROVE` and `NEEDS-ATTENTION` rows returned
 * `APPROVE`, and reversing the two rows changed the inferred position.
 *
 * Position feeds the band, so an arbitrary winner here is not cosmetic: it picks
 * between row 4 (triage pending, High) and row 6 (verdict recorded, Low), which
 * is the difference between holding a pane and compacting it.
 *
 * Separate from `newestVerdictRow` rather than folded into its return type: the
 * selection is still well defined and worth reading on its own, and callers that
 * only want the newest row should not have to destructure a tie they do not care
 * about.
 */
/**
 * A `status: verdict` row whose `endedAt` does not parse.
 *
 * Spec §3.5: such a row is "excluded and NAMED". `newestVerdictRow` excluded it
 * and nothing named it, so a corpus whose only verdict row had an unparsable
 * timestamp inferred a position from NO verdict at all and drove (diff round 2,
 * finding 3). Exclusion without naming is the silent half of the same clause.
 */
/**
 * The status a reader stamps on a corpus line it could not read.
 *
 * Ingestion used to SKIP an unparsable line and cast the rest without checking
 * the row shape, so a BLOCKING row missing only `status` disappeared: position
 * was then inferred from a corpus that silently omitted the row which would
 * have held the pane (diff round 4, finding 3). Dropping a row you cannot read
 * is the same silent-exclusion defect as round 3's unparsable timestamp, one
 * layer earlier.
 *
 * A sentinel rather than a boolean out-of-band, so it travels in the row list
 * itself and cannot be lost by a caller that forgets to thread a flag.
 */
export const MALFORMED_CORPUS_STATUS = "__malformed__";

/** Whether ingestion stamped any line it could not read. */
export function corpusHasMalformedRow(rows: CorpusRow[]): boolean {
  return rows.some((r) => r.status === MALFORMED_CORPUS_STATUS);
}

export function corpusHasUnparsableVerdict(rows: CorpusRow[]): boolean {
  return rows.some(
    (r) => r.status === "verdict" && (r.endedAt === null || Number.isNaN(Date.parse(r.endedAt))),
  );
}

/**
 * The bucket values `gh pr checks --json bucket` is known to emit.
 *
 * An UNKNOWN bucket is not a fourth flag to guess at: `anyFailed`/`anyPending`
 * are `some(...)` tests, so an unrecognized value silently reads as neither,
 * and the pane falls through to the cheap fallback position and drives (diff
 * round 2, finding 2). Payload drift from a `gh` upgrade is ordinary operation,
 * so it must surface rather than be absorbed.
 */
export const GH_BUCKETS = new Set(["pass", "fail", "pending", "skipping", "cancel"]);

export function newestVerdictTie(rows: CorpusRow[]): boolean {
  let bestAt = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const row of rows) {
    if (row.status !== "verdict") continue;
    const at = row.endedAt === null ? Number.NaN : Date.parse(row.endedAt);
    if (Number.isNaN(at)) continue;
    if (at > bestAt) {
      bestAt = at;
      count = 1;
    } else if (at === bestAt) {
      count += 1;
    }
  }
  return count > 1;
}

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
  /**
   * A VALID, uncontested claim held by a different session.
   *
   * Distinct from `unowned`, and the distinction is spec §4.2: UNOWNED means
   * "not in any purview registry, or in more than one", NOT "claimed by someone
   * other than you". Collapsing the two made the DEFAULT report -- which has no
   * `--as` and so compares against the empty string -- call every singly-claimed
   * pane UNOWNED (diff round 1, finding 5). Driving still requires `owned`; the
   * report just stops mislabelling other people's panes as unclaimed.
   */
  | { kind: "owned-by-other"; sessionId: string }
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
    return { kind: "owned-by-other", sessionId: file.sessionId };
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
  /**
   * The field the §4.3 accept-set rejected, when rule 4 decided; null otherwise.
   *
   * Carried on the report so a refusal can NAME it. AC-4's clause is
   * "UNDETERMINED naming the offending field", and a refusal that cannot say
   * which field does not satisfy it (diff round 1, finding 7).
   */
  rejectedField: string | null;
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
    // WHICH rule decided, not just what it decided. §6 promises the report shows
    // its reasoning, and the verdict alone cannot: UNDETERMINED is reachable
    // from rules 2, 4, 5 and 6, and WAIT from 7, 8, 11 and 12, so a reader
    // seeing only the verdict cannot tell an observation stop from a banding
    // one -- which is exactly the distinction that says whether the pane needs
    // attention or merely needs waiting for (diff round 1, finding 7).
    `r${p.rule}`.padStart(3),
    `row ${p.position.row} ${p.position.cost}`,
    // The offending field, when rule 4 decided. AC-4's clause is "UNDETERMINED
    // NAMING the offending field", and the plain report -- the one an operator
    // actually reads between protocol steps -- rendered only
    // `UNDETERMINED r4 row 8 Low`, which says a pane is untrusted without
    // saying why (diff round 4, finding 4).
    //
    // LAST, and variable-width, so the fixed columns before it keep the
    // absolute offsets their own case pins.
    ...(p.rejectedField === null ? [] : [p.rejectedField]),
  ].join("  ");
}

// ---------------------------------------------------------------------------
// §5.2 — the three one-shot commands
// ---------------------------------------------------------------------------

/**
 * The ADDRESS LINE both prose payloads open with (spec §3.6).
 *
 * The queue property alone does not price the pass-to-send window. A takeover
 * landing inside it swaps the session behind an authorization that was correct
 * when it was taken, and the prompts used to carry no addressee — so actionable
 * stop/resume instructions would have been delivered to a session they were
 * never authorized for. Naming the recipient makes the wrong-recipient delivery
 * SELF-NEUTRALIZING: a session can always answer "am I driving this branch"
 * from its own worktree, and per this repo's Stage 0 contract it knows its own
 * session id, so the ignore instruction is executable by whoever reads it.
 *
 * `--` and not an em dash: these bytes are typed into another agent's TUI.
 */
const ADDRESS_LINE =
  "For the session driving <BRANCH> (session <SESSION>) ONLY -- any other session must ignore";

/**
 * The parenthetical, as ONE definition.
 *
 * A marker-less or session-less target is addressed by branch alone, and the
 * omission is of the WHOLE parenthetical rather than of the token inside it —
 * `(session )` addresses nobody while looking like it addresses someone. Spelt
 * once here because `addressPayload` removes exactly this substring, so a
 * second copy in the removal would be free to drift out of the constant.
 */
const SESSION_PARENTHETICAL = " (session <SESSION>)";

/**
 * The checkpoint prompt.
 *
 * It instructs against committing because invariant 1 permits a task commit
 * only after the implementation passes its test, and an interrupted target is
 * by construction mid-task. It writes the gitignored marker and leaves the tree.
 *
 * Its ask is benign under every decay class the pass-to-send window admits — a
 * truthful self-record plus a stop at the recipient's own turn boundary — which
 * is why it needs no deference line of its own (spec §3.6, §7 limit 1).
 */
export const CHECKPOINT_TEXT = [
  ADDRESS_LINE,
  "this message entirely. Checkpoint before compaction. Do not commit. Update",
  ".claude/ship-state.json in your worktree: set `stage` to where you actually are, set `next`",
  "to the literal command or action that resumes this work, and set `checkpointNonce` to",
  "exactly <NONCE>. Leave the working tree exactly as it is. Then stop.",
].join("\n");

/**
 * The resume prompt, which DEFERS to the recipient's own marker.
 *
 * That deference is the round-3 repair, not a courtesy. The address line
 * neutralizes a WRONG-recipient delivery; it cannot neutralize a SAME-recipient
 * authorization decay — a `blockedOn` written concurrently after the pass read
 * it, with branch and session unchanged. An earlier text told exactly that
 * recipient to discard its blocked framing, overriding the one piece of state
 * that would have refused the send. Re-reading the marker FIRST makes the
 * recipient's own `blockedOn` the gate, at its own execution instant.
 *
 * It closes the `blockedOn` decay class and NO OTHER: a verdict or purview
 * change is invisible to the recipient by construction, and those classes are
 * priced as bounded consequences in spec §7 limit 1 rather than claimed closed.
 */
export const RESUME_TEXT = [
  ADDRESS_LINE,
  "this message entirely. Run `date` first; the shell clock is the only source of truth.",
  "Re-read .claude/ship-state.json in your worktree FIRST: if its blockedOn is non-empty, honor",
  "it and stop -- your marker outranks this message. Otherwise discard any stale blocked or",
  "standing-down framing from your conversation and resume the marker's `next` action",
  "immediately, in this turn. You were compacted by the orchestrator; approval already given,",
  "do not re-ask.",
].join("\n");

/**
 * Substitute the address line's targets into a prose payload.
 *
 * The session is omitted by removing the parenthetical WHOLE, so a target whose
 * marker carries no `sessionId` is addressed by branch alone rather than by an
 * empty id. Rule 5 already governs the mismatch cases the id would catch, so
 * branch-alone is a narrower address rather than an absent one.
 */
export function addressPayload(
  text: string,
  opts: { branch: string; session: string | null },
): string {
  const addressed =
    opts.session === null
      ? text.replace(SESSION_PARENTHETICAL, "")
      : text.replace("<SESSION>", opts.session);
  return addressed.replace("<BRANCH>", opts.branch);
}

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
/*
 * The plan is deliberately TARGET-INDEPENDENT: all three prompts are addressed
 * to whichever pane the caller is already driving, so none of them interpolates
 * a target and this signature does not accept one. An earlier revision declared
 * a `target` field that no branch below ever read — the driver passed the empty
 * string for it — which is the zombie-flag shape AGENTS.md's flag-lifecycle rule
 * exists to catch. Wiring a per-target message is a product change, not a
 * plumbing one; until that decision is made, the field stays absent so its
 * absence keeps type-checking.
 */
export function planSends(opts: {
  command: "checkpoint" | "compact" | "resume";
  nonce?: string;
  /**
   * The target's branch, and its marker's `sessionId` when the pass read one.
   *
   * OPTIONAL in the type and REQUIRED at runtime for the two prose commands,
   * the same shape `nonce` already uses. `/compact` is address-exempt by
   * construction (below), so a required field would force every compact caller
   * to supply an argument no branch reads — the zombie shape the comment above
   * `planSends` exists to refuse. An absent branch THROWS rather than
   * defaulting: an empty address addresses nobody while looking addressed.
   */
  branch?: string;
  session?: string | null;
}): SendPlan {
  const address = (text: string, command: string): string => {
    const branch = opts.branch;
    if (branch === undefined) throw new Error(`--${command} requires the target's branch`);
    return addressPayload(text, { branch, session: opts.session ?? null });
  };
  switch (opts.command) {
    case "checkpoint": {
      const nonce = opts.nonce;
      if (nonce === undefined) throw new Error("--checkpoint requires a nonce");
      return { sends: [address(CHECKPOINT_TEXT, "checkpoint").replace("<NONCE>", nonce), "\r"] };
    }
    case "compact":
      // NO address, and none is needed. `/compact` is a slash command -- a
      // prefix line would strip it of that status and deliver prose. Its worst
      // mis-delivery is a compaction, which is the same outcome auto-compaction
      // produces on its own schedule and a near no-op on an already-compacted
      // session (spec §3.6).
      return { sends: ["/compact", "\r"] };
    case "resume":
      return { sends: [address(RESUME_TEXT, "resume"), "\r"] };
  }
}

export type RefusalCause =
  | { kind: "missing-as" }
  | { kind: "all-rejected" }
  | { kind: "unresolvable-target"; target: string }
  | { kind: "not-drivable"; verdict: Verdict }
  /**
   * A rule 1-8 OBSERVATION stopped the pane, as distinct from the verdict gate.
   *
   * §6 promises every refusal names its reason, and `not-drivable` named the
   * wrong one: it always said "which is not COMPACT or FORCE", which is false
   * for an observation stop and flatly wrong for `--resume`, whose whole point
   * is that it requires neither verdict (diff round 1, finding 7).
   */
  | { kind: "observation-stop"; rule: number; verdict: Verdict; detail: string | null }
  | { kind: "nonce-absent" }
  | { kind: "nonce-mismatch" }
  /**
   * A VALID, uncontested claim held by a different session.
   *
   * Rule 3 asks whether the pane is claimed AT ALL, so a pane validly claimed
   * by another orchestrator passes it. Refusing that here, by its own name,
   * rather than folding it into `not-drivable` -- which would tell an operator
   * the verdict is wrong when the verdict is fine and the CALLER is wrong.
   */
  | { kind: "owned-by-other"; paneId: string; sessionId: string; as: string }
  | { kind: "not-in-purview"; paneId: string; reason: string }
  | { kind: "contested" };

/**
 * What each observation rule means, in the words an operator can act on.
 *
 * §6 requires a refusal to NAME its reason; a bare rule number is a reference to
 * a spec table the person reading a terminal does not have open.
 */
const RULE_REASON: Record<number, string> = {
  1: "the pane's label resolves to no worktree branch",
  2: "another pane on the roster shares this agent name",
  3: "no purview registry claims this pane, or more than one does",
  4: "an observation was outside the accept-set",
  5: "the marker's sessionId does not match the pane's live session",
  6: "gh could not be read for this worktree",
  7: "the pane is blocked, or its status could not be read",
  8: "the position is a hard wait",
};

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
      case "observation-stop": {
        const why = RULE_REASON[cause.rule] ?? "an observation rule stopped this pane";
        const extra = cause.detail === null ? "" : `: ${cause.detail}`;
        return `refusing: rule ${cause.rule} — ${why}${extra} (verdict ${cause.verdict})`;
      }
      case "nonce-absent":
        return "refusing: the target's marker carries no checkpointNonce";
      case "nonce-mismatch":
        return "refusing: the target's checkpointNonce is not the one this command recorded";
      case "owned-by-other":
        return `refusing: ${cause.paneId} is claimed by ${cause.sessionId}, not by ${cause.as}`;
      case "not-in-purview":
        return `refusing: ${cause.paneId} is not in your purview: ${cause.reason}`;
      case "contested":
        return "refusing: purview is contested; another orchestrator also claims this pane";
    }
  })();
  return { exitCode: 1, sends: [], message };
}

// ---------------------------------------------------------------------------
// §3.1 — the read-once pass
// ---------------------------------------------------------------------------

/**
 * ONE read-once pass over an injected surface.
 *
 * Every read member answers from its FIRST call for the remainder of the pass,
 * so "the same member read twice at two instants" stops being expressible.
 * That is the whole repair: six shipped defects were inter-pass skew, and four
 * incremental repairs narrowed the window by comparing MORE FIELDS rather than
 * by removing the second read. A comparison that exists can be incomplete; a
 * comparison that does not exist cannot.
 *
 * The read set is the COMPLEMENT of `nonRead`, never a list of reads, so the
 * wrapper is TOTAL over the surface: a member added later is memoized by
 * default and only a deliberate edit to the exclusion set can take it out of
 * the pass. A hand-list of reads would fail the other way -- the new member
 * would sit outside the pass silently, which is the shape this whole arc is
 * about.
 *
 * Keyed by member AND arguments, because `marker(cwd)` for two different
 * worktrees is two questions rather than one asked twice.
 *
 * It is NOT an instant, and nothing here claims it is: members are called
 * sequentially, so a change landing between two DIFFERENT calls is unobserved
 * by this pass. That residual is spec §7 limit 1, priced there by the queue
 * property and the addressed payloads rather than claimed closed.
 *
 * Generic over the surface's shape and free of I/O, so it lives here rather
 * than in the adapter: the mutation gate can attack it, and the send-auth
 * scanner -- which reasons about MEMBER ACCESSES on a surface binding -- cannot
 * classify a wrapper that iterates members reflectively. In the adapter it is a
 * declared derivation helper, which is exactly what it is.
 */
export function readOnce<T extends object>(surface: T, nonRead: ReadonlySet<string>): T {
  const memo = new Map<string, unknown>();
  const pass: Record<string, unknown> = { ...(surface as unknown as Record<string, unknown>) };
  for (const [member, value] of Object.entries(surface as unknown as Record<string, unknown>)) {
    if (nonRead.has(member) || typeof value !== "function") continue;
    const read = value as (...args: unknown[]) => unknown;
    pass[member] = (...args: unknown[]): unknown => {
      const key = `${member}(${JSON.stringify(args)})`;
      const hit = memo.get(key);
      if (hit !== undefined || memo.has(key)) return hit;
      const answer = read.apply(surface, args);
      memo.set(key, answer);
      return answer;
    };
  }
  return pass as unknown as T;
}

// ---------------------------------------------------------------------------
// §3.1 — the authorization predicate
// ---------------------------------------------------------------------------

/** The three modes that send bytes. The read-only surfaces never reach here. */
export type SendMode = "checkpoint" | "compact" | "resume";

/**
 * Everything the decision is allowed to consult, as ONE value.
 *
 * The type is the point. Every field is derived from the invocation's own
 * read-once pass, and there is nowhere to put a value taken at another instant
 * -- no thunk to be consulted later, no `was`/`now` pair to compare. Six
 * shipped defects were all inter-pass skew, and four incremental repairs
 * narrowed the window without closing it; the closure is structural rather than
 * another comparison, because a comparison that exists can be incomplete and a
 * second read that exists can skew (spec §1.2, §3.2).
 */
export type AuthorizationInput = {
  mode: SendMode;
  paneId: string;
  /** The `--as <sessionId>` the caller supplied. Explicit, never inferred. */
  as: string;
  /** Resolved from the pass's purview read. */
  ownership: Ownership;
  /** `observe()` over the pass. Carries the deciding rule, not merely the verdict. */
  report: PaneReport;
  /**
   * `--compact` only: the record this orchestrator wrote, and the `checkpointNonce`
   * the PASS's marker copy carries. Both from this invocation; there is no
   * earlier capture for them to disagree with.
   */
  nonce?: { recorded: string | null; marker: string | null };
};

export type AuthorizationDecision = { authorized: true } | { authorized: false; message: string };

/**
 * Whether this invocation may send, and if not, WHICH condition refused it.
 *
 * Pure over pass data, so the whole gate is assertable without a live herdr,
 * git or network -- and so the mutation gate can attack it, which a decision
 * spread across the adapter's I/O could not be.
 *
 * ORDER IS PART OF THE CONTRACT, and it is the ordering half of §6's
 * name-the-condition guarantee. A round-5 defect refused with "marker carries
 * no checkpointNonce" while a matching nonce sat in the marker, sending an
 * operator to re-checkpoint a pane that had already been stopped for another
 * reason. Checking the cheapest-to-explain condition first means the reason an
 * operator reads is the FIRST one that held, not whichever check happened to
 * run last.
 */
export function authorizeSend(input: AuthorizationInput): AuthorizationDecision {
  const no = (cause: RefusalCause): AuthorizationDecision => ({
    authorized: false,
    message: refuse(cause).message,
  });

  // 1. Ownership by THIS caller. A contested pane is deliberately NOT refused
  //    here: rule 3 already saw it, and naming it twice would give an operator
  //    two different sentences for one condition.
  if (input.ownership.kind === "owned-by-other") {
    return no({
      kind: "owned-by-other",
      paneId: input.paneId,
      sessionId: input.ownership.sessionId,
      as: input.as,
    });
  }
  if (input.ownership.kind === "unowned") {
    return no({ kind: "not-in-purview", paneId: input.paneId, reason: input.ownership.reason });
  }

  // 2. The rule 1-8 observation stop, for EVERY mode including `--resume`.
  //    Read off the rule number rather than the verdict: WAIT is produced by
  //    rules 7 and 8 (observations) AND by 11 and 12 (banding), so a
  //    verdict-based gate would let `--resume` drive a pane rule 7 had stopped.
  const OBSERVATION_RULES = 8;
  if (input.report.rule <= OBSERVATION_RULES) {
    return no({
      kind: "observation-stop",
      rule: input.report.rule,
      verdict: input.report.verdict,
      detail: input.report.rejectedField,
    });
  }

  // 3. The mode verdict gate. `--resume` deliberately does not require
  //    COMPACT/FORCE: a successful compaction makes both false exactly when
  //    resuming is the correct next act.
  if (
    input.mode !== "resume" &&
    input.report.verdict !== "COMPACT" &&
    input.report.verdict !== "FORCE"
  ) {
    return no({ kind: "not-drivable", verdict: input.report.verdict });
  }

  // 4. `--compact` only: the nonce proves this orchestrator's checkpoint was
  //    executed by the target before this orchestrator compacts it.
  if (input.mode === "compact") {
    const nonce = input.nonce;
    if (nonce === undefined) throw new Error("--compact requires the pass's nonce pair");
    if (nonce.recorded === null || nonce.marker === null) return no({ kind: "nonce-absent" });
    if (nonce.recorded !== nonce.marker) return no({ kind: "nonce-mismatch" });
  }

  return { authorized: true };
}

// ---------------------------------------------------------------------------
// §5.2 / §5.5 — the nonce, and per-command revalidation
// ---------------------------------------------------------------------------

/**
 * Mint a nonce that is not the one already in the target's marker.
 *
 * Randomness makes a repeat improbable, not impossible, and an unlucky repeat
 * would let `--compact` accept the PREVIOUS checkpoint before the new prompt
 * had executed. Spec round 7's finding: "128-bit random, therefore different"
 * is a probability argument, not a proof. One local comparison, not a return of
 * the cross-orchestrator machinery round 6 removed.
 *
 * `markerNonce` comes from the PASS's marker copy, not from an entry-time read
 * (spec §3.2): a collision compare against a stale copy could re-mint against a
 * nonce the target had already replaced.
 *
 * It THROWS when the budget is exhausted, which is reachable exactly when
 * `random()` is broken -- a tool fault, not a refusal. The adapter catches it
 * and exits 2 naming the condition (spec §3.7); letting it escape `main` would
 * exit with a code the taxonomy assigns to refusals.
 */
export class NonceMintExhausted extends Error {
  // No `this.name` assignment. Nothing reads it -- the adapter discriminates by
  // `instanceof` -- and `SendFailed`, the sibling fault class beside it, does
  // not set one either. The mutation gate caught its removal as a SURVIVOR,
  // which is the honest signal that the line has no differing case: deleted
  // rather than defended with an equivalence row or a test for a property no
  // caller consumes.
  constructor(readonly attempts: number) {
    super(`mintNonce: the random source returned the marker's nonce ${attempts} times running`);
  }
}

export function mintNonce(opts: { markerNonce: string | null; random: () => string }): string {
  const ATTEMPTS = 8;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const candidate = opts.random();
    if (candidate !== opts.markerNonce) return candidate;
  }
  // A CLASS, not a message the adapter greps. Matching on error text is the
  // shape this repo already carries as a documented limit (`gh`'s no-PR
  // signature demotes on a reword), and here the caller must distinguish a
  // broken generator from every other throw in order to pick an exit code.
  throw new NonceMintExhausted(ATTEMPTS);
}

/**
 * `--compact`: consume the outstanding record, then send.
 *
 * ORDER MATTERS AND IS ASSERTED FROM INSIDE THE SEND. Consuming before the send
 * means a crash costs a re-checkpoint; consuming after would leave a replayable
 * record on every failure path. `try { send() } finally { consume() }` produces
 * identical POST-HOC observations -- both end with the record gone -- so only an
 * observation taken while the send executes can tell them apart.
 *
 * It no longer GATES. Under the single-pass model the whole decision, nonce
 * equality included, is `authorizeSend`'s (spec §3.1 step 4), and this runs only
 * once that has authorized. The revalidation thunk, the record read and the
 * comparison are deleted rather than kept as belt-and-braces: two checks of one
 * condition means one of them is dead, and a dead check is exactly the survivor
 * class the mutation gate already caught once on this surface. The refusal rows
 * `nonce-absent` and `nonce-mismatch` are unchanged -- they are emitted from the
 * catalog by the predicate instead of from here.
 *
 * A refusal therefore cannot burn the checkpoint, and that is now structural
 * rather than an ordering to maintain: nothing reaches this function unless the
 * authorization already passed.
 */
export function runCompact(opts: { consume: () => void; send: (s: string) => void }): void {
  opts.consume(); // BEFORE the send, deliberately
  for (const s of planSends({ command: "compact" }).sends) opts.send(s);
}
