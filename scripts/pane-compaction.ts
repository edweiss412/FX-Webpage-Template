#!/usr/bin/env tsx
/**
 * Which panes want compacting, and what it would take.
 *
 *   pnpm panes:compact                             # the report
 *   pnpm panes:compact --json                      # {status, degraded, panes}
 *   pnpm panes:compact --check --as <id>           # 0 clear · 1 actionable · 2 untrusted
 *   pnpm panes:compact --checkpoint <t> --as <id>  # mint a nonce, send the prompt, return
 *   pnpm panes:compact --compact    <t> --as <id>  # require the nonce back, then send /compact
 *   pnpm panes:compact --resume     <t> --as <id>  # send the resume prompt
 *   ... any sending mode with --dry-run            # print the bytes, send nothing
 *
 * A thin adapter. Every DECISION lives in the importable core, which is what
 * lets the classifier be enrolled in the source-mutation registry — a terminal
 * script cannot be. What lives here is the part the core deliberately refuses:
 * argv, the subprocess reads, and the exit code.
 *
 * `main(argv, surface)` is exported and takes its whole world as a parameter, so
 * the suite drives every mode without a live herdr, git or gh. The bottom of the
 * file is the only place that builds the real surface, and it runs only when
 * this file is the process entry point.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  type CorpusRow,
  type GhInvocation,
  type ObservedPane,
  type PaneReport,
  type PurviewFile,
  checkExitCode,
  classify,
  classifyGh,
  mintNonce,
  newestVerdictTie,
  corpusHasUnparsableVerdict,
  corpusHasMalformedRow,
  MALFORMED_CORPUS_STATUS,
  GH_BUCKETS,
  type SendMode,
  NonceMintExhausted,
  authorizeSend,
  planSends,
  readOnce,
  positionFor,
  refuse,
  renderRow,
  reportEnvelope,
  resolveOwnership,
  parseGauge,
  runCompact,
} from "./lib/pane-compaction-core";

export const USAGE =
  "pnpm panes:compact [--json] [--check --as <sessionId>] " +
  "[--checkpoint|--compact|--resume <target> --as <sessionId> [--dry-run]]";

/** One roster entry, already reduced to the fields §4.3 admits. */
export type RosterPane = {
  paneId: string;
  /** The agent name — the arc. null when the pane carries none. */
  agentName: string | null;
  cwd: string;
  status: string;
  /**
   * The pane's OWN live session id (`agent_session.value`), or null.
   *
   * §4.3 makes it optional and §3.9 makes absence a valid observation rather
   * than a parse failure. Rule 5 compares it against the MARKER's `sessionId`:
   * the question is whether the session that wrote that marker is still the one
   * living in the pane, which is the supersession case a takeover creates.
   */
  agentSession: string | null;
};

/**
 * Every read and write the adapter performs, as one injected object.
 *
 * This is the seam the purity guard protects: `scripts/lib/` may not import
 * `node:child_process`, so the spawning lives here and the core stays a pure
 * function of observations.
 */
export type Surface = {
  roster(): RosterPane[];
  /**
   * Every branch that currently has a worktree, as `git worktree list` reports.
   *
   * AC-16: a pane whose agent name resolves to no worktree branch is
   * `NOT-AN-ARC`. Without this the adapter took the label's mere EXISTENCE as
   * proof of an arc, so the orchestrator panes -- which carry labels precisely
   * because they dispatch arcs rather than being one -- read as drivable. Spec
   * §3.6 names the two live examples outright (`smalls-batch-orchestrator`,
   * `bl-mediums-orchestrator`) and diff round 1 probed a checkpoint being SENT
   * to one of them.
   */
  branches(): Set<string>;
  screen(paneId: string): string;
  send(target: string, text: string): void;
  purview(): PurviewFile[];
  marker(cwd: string): Record<string, unknown> | null;
  git(cwd: string): { clean: boolean; lastCommitAt: number | null };
  gh(cwd: string): GhInvocation;
  corpus(branch: string | null): CorpusRow[];
  now(): number;
  random(): string;
  out(line: string): void;
  /**
   * Bytes, EXACTLY as given -- no trailing newline, no reformatting.
   *
   * AC-6 says `--dry-run` prints that command's §5.2 bytes. Routing them through
   * the line-oriented `out` produced `/compact\n\r\n`
   * (`2f636f6d706163740a0d0a`) where the real send emits `/compact\r`
   * (`2f636f6d706163740d`), so the dry run showed something the live path would
   * never send (diff round 3, finding 4). A dry run whose bytes differ from the
   * real ones is not a preview of anything.
   */
  outRaw(bytes: string): void;
  nonceRead(sessionId: string, paneId: string): string | null;
  nonceWrite(sessionId: string, paneId: string, nonce: string): void;
  /**
   * Spend the grant `expected`, and ONLY that one. Answers whether it did.
   *
   * Diff round 2, core finding 1 (P1). This took `(sessionId, paneId)` and
   * deleted whatever the record held, so the effect was never tied to the value
   * that authorized it: a `--compact` whose grant was replaced between the
   * decision and the spend exited 0 having destroyed a NEWER one-shot grant
   * that nobody authorized and nobody used. Identity alone cannot express
   * "the one I was authorized for", so the VALUE is a parameter.
   */
  nonceConsume(sessionId: string, paneId: string, expected: string): boolean;
  /**
   * `<target>` to a pane id, through herdr rather than through our own guess.
   *
   * Spec §5.3: resolution goes through `herdr agent get` and an `agent_not_found`
   * CODE — not message text, and not a lookup we invent. Matching the roster
   * ourselves would accept only pane ids and labels, while herdr also resolves
   * terminal ids and agent names, so a legitimate target would have been told it
   * does not exist.
   *
   * Three outcomes, because the exit code does not carry enough to pick among
   * them. A missing target exits 1 (probed 2026-08-16; see `parseAgentGet` for
   * the full stream behaviour), but so does a herdr that is broken or absent —
   * so exit 1 alone cannot tell "no such pane" from "no answer". The structured
   * `error.code` is what discriminates, and keeping the two apart matters
   * because collapsing a fault into "not found" reports a broken herdr as a typo.
   */
  resolveTarget(target: string): { paneId: string } | { notFound: true } | { fault: string };
};

/** §4.3's marker shape, plus the optional `checkpointNonce` §5.2 adds. */
/**
 * §4.3's marker shape, as field -> EXPECTED TYPE rather than a set of names.
 *
 * A name set validates that no unknown key is present and nothing else, so
 * `sessionId: 123` passed the accept-set and then failed to match any live
 * session id -- silently, because rule 5's comparison is `!==` against a string
 * (diff round 2, finding 1). Checking the key and not the value is the same
 * shape as round 1's finding 2, which is why this is a TYPE table now: the
 * validator cannot be written without deciding what each field is.
 */
const MARKER_FIELDS: Record<string, "string" | "number"> = {
  branch: "string",
  stage: "string",
  tasksRemaining: "number",
  next: "string",
  blockedOn: "string",
  cronJobId: "string",
  sessionId: "string",
  checkpointNonce: "string",
};

/**
 * The seven §4.3 requires of a PRESENT marker. `checkpointNonce` is the only
 * optional one (§5.2 -- written by a target answering CHECKPOINT_TEXT).
 *
 * Absence had to be checked separately from type, because a key walk only ever
 * sees the keys that ARE there: `{branch: "feat/x"}` walked clean and drove.
 * Spec §9's round-1 precedence case says exactly this -- a below-band pane with
 * a missing marker field is UNDETERMINED, not HOLD (diff round 3, finding 2).
 *
 * An ABSENT marker is still a supported observation (AC-20); this fires only on
 * a marker that exists and is incomplete, which is what a partial write looks
 * like -- and `--checkpoint` asks targets to rewrite this file, so partial
 * writes are ordinary here.
 */
const MARKER_REQUIRED = [
  "branch",
  "stage",
  "tasksRemaining",
  "next",
  "blockedOn",
  "cronJobId",
  "sessionId",
] as const;

const STATUSES = new Set(["idle", "working", "blocked", "done", "unknown"]);

/**
 * The §4.3 accept-set, as a function that NAMES what it rejected.
 *
 * Returns the offending field, or null when every observation is admissible.
 * "Anything else yields UNDETERMINED naming the offending field" is the whole
 * clause, so a rejection that could not say which field would not satisfy it.
 *
 * It lives HERE rather than in the core, and that is the observation/decision
 * boundary rather than an exception to it: admitting an input requires knowing
 * the raw shapes the surface produces — herdr's status strings, the marker's
 * JSON keys — which is surface knowledge. The core takes the VERDICT as an
 * observation (`ObservedPane.rejectedField`) and decides what it means, which
 * is rule 4. Moving this inward would drag those shapes into a module whose
 * whole property is that it is pure over them.
 */
export function rejectedFieldOf(opts: {
  status: string;
  tenths: number | null;
  marker: Record<string, unknown> | null;
  /**
   * Two or more corpus verdict rows tie for newest, so "the newest verdict" has
   * no answer. Spec §3.5 and the §9 table both require UNDETERMINED; without it
   * the winner was whichever row was read first, and position feeds the band, so
   * the arbitrary pick chose between holding a pane and compacting it.
   */
  corpusTie?: boolean;
  /** A `status: verdict` row whose `endedAt` does not parse (spec §3.5). */
  corpusUnparsable?: boolean;
  /** Ingestion could not read at least one corpus line. */
  corpusMalformed?: boolean;
  /** An unrecognized `gh pr checks` bucket value, or null when all are known. */
  ghBucket?: string | null;
}): string | null {
  if (!STATUSES.has(opts.status)) return `agent_status=${opts.status}`;
  if (opts.tenths === null) return "ctx gauge";
  // Identity, not shape: a real marker cannot imitate the sentinel. Checked
  // BEFORE the key walk, because the sentinel's own key would otherwise be
  // reported as though the file had named it.
  if (opts.marker === MALFORMED_MARKER) return "marker (unparseable JSON)";
  if (opts.corpusTie === true) return "corpus.endedAt (tie for newest verdict)";
  if (opts.corpusUnparsable === true) return "corpus.endedAt (unparsable on a verdict row)";
  if (opts.corpusMalformed === true) return "corpus (a row could not be read)";
  if (opts.ghBucket !== undefined && opts.ghBucket !== null) {
    return `gh bucket=${opts.ghBucket}`;
  }
  if (opts.marker !== null) {
    for (const key of MARKER_REQUIRED) {
      if (!(key in opts.marker)) return `marker.${key} (missing)`;
    }
    for (const [key, value] of Object.entries(opts.marker)) {
      const expected = MARKER_FIELDS[key];
      // Unknown KEY, as before.
      if (expected === undefined) return `marker.${key}`;
      // Known key, wrong VALUE TYPE. The half that was missing: a marker is
      // JSON someone else writes, so its values are as untrusted as its keys.
      if (typeof value !== expected) return `marker.${key} (expected ${expected})`;
    }
  }
  return null;
}

/**
 * The first `gh pr checks` bucket value we do not recognize, or null.
 *
 * `anyFailed` and `anyPending` are `some(...)` tests, so an unknown bucket reads
 * as NEITHER: the pane falls through to the cheap fallback position and drives.
 * A `gh` upgrade emitting a new bucket is ordinary drift, so it surfaces as a
 * named accept-set rejection rather than being absorbed (diff round 2, finding 2).
 */
export function unknownBucketOf(run: GhInvocation): string | null {
  if (classifyGh(run).kind !== "checks") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    return null; // classifyGh already faults on this
  }
  if (!Array.isArray(parsed)) return null;
  for (const r of parsed) {
    // JSON `null` is an object to `typeof`, so property access on it THROWS.
    // A null row is malformed input, not a crash (diff round 3, finding 2).
    if (typeof r !== "object" || r === null) return "(missing)";
    const b = (r as { bucket?: unknown }).bucket;
    // A row with no `bucket` at all is as unusable as an unrecognized one.
    if (typeof b !== "string") return "(missing)";
    if (!GH_BUCKETS.has(b)) return b;
  }
  return null;
}

/**
 * A round-corpus row, validated as a WHOLE row (spec §4.3 line 213: `stage`,
 * `round`, `status`, `verdict`, `findingCount`, `endedAt`).
 *
 * Ingestion checked `status` alone, so a row whose `stage` was a number reached
 * position inference, which then read `verdict` and `endedAt` off a row nothing
 * had validated (diff round 5, finding 2). Validating the field you happen to
 * branch on is not validating the input -- the same partial-check shape as the
 * marker key walk two rounds earlier.
 *
 * Exported so the boundary is assertable directly rather than only through a
 * filesystem read.
 */
export function corpusRowIsWellFormed(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
  const row = parsed as Record<string, unknown>;
  // The three nullable fields are legitimately null on a real row -- a
  // `no_verdict` row carries all three -- so nullable is accepted and a wrong
  // TYPE is not.
  return (
    typeof row["stage"] === "string" &&
    typeof row["round"] === "number" &&
    typeof row["status"] === "string" &&
    (row["verdict"] === null || typeof row["verdict"] === "string") &&
    (row["findingCount"] === null || typeof row["findingCount"] === "number") &&
    (row["endedAt"] === null || typeof row["endedAt"] === "string")
  );
}

/** `gh pr checks --json bucket` rows, reduced to the four flags §4.4 reads. */
function prFrom(
  run: GhInvocation,
): { open: boolean; allGreen: boolean; anyFailed: boolean; anyPending: boolean } | null {
  const outcome = classifyGh(run);
  if (outcome.kind !== "checks") return null; // no-pr and fault are not PR states
  let buckets: string[] = [];
  try {
    const parsed: unknown = JSON.parse(run.stdout);
    buckets = Array.isArray(parsed)
      ? parsed.map((r) => String((r as { bucket?: unknown }).bucket ?? ""))
      : [];
  } catch {
    // An unparseable table is not a check state. Reported as a fault by the
    // caller's ghFault path rather than guessed at.
    return null;
  }
  const anyFailed = buckets.some((b) => b === "fail" || b === "cancel");
  const anyPending = buckets.some((b) => b === "pending");
  return {
    open: true,
    allGreen: buckets.length > 0 && buckets.every((b) => b === "pass" || b === "skipping"),
    anyFailed,
    anyPending,
  };
}

/**
 * The reads that do not vary per pane, done once.
 *
 * `gh pr checks` is a NETWORK call and the roster is a dozen panes, so calling
 * it per pane spends a dozen API requests on one report — on the same budget a
 * whole batch of arcs shares, which is exactly how that budget got exhausted
 * once already. Panes in one worktree have one PR and one git state, so both
 * memoize on cwd; the purview directory is a single answer for the whole run.
 */
function memoize<T>(read: (key: string) => T): (key: string) => T {
  const seen = new Map<string, T>();
  return (key) => {
    const hit = seen.get(key);
    if (hit !== undefined) return hit;
    const value = read(key);
    seen.set(key, value);
    return value;
  };
}

type Cached = {
  purview: PurviewFile[];
  gh: (cwd: string) => GhInvocation;
  git: (cwd: string) => { clean: boolean; lastCommitAt: number | null };
  corpus: (branch: string) => CorpusRow[];
  branches: Set<string>;
};

function cacheOf(s: Surface): Cached {
  return {
    purview: s.purview(),
    // One `git worktree list` for the whole run, like purview: it is a single
    // answer for every pane, and a dozen panes was a dozen spawns.
    branches: s.branches(),
    gh: memoize((cwd) => s.gh(cwd)),
    git: memoize((cwd) => s.git(cwd)),
    corpus: memoize((branch) => s.corpus(branch)),
  };
}

/** One pane, observed through the surface and classified by the core. */
function observe(
  pane: RosterPane,
  roster: RosterPane[],
  asSessionId: string | null,
  s: Surface,
  cache: Cached,
): PaneReport {
  const marker = s.marker(pane.cwd);
  const tenths = parseGauge(s.screen(pane.paneId));
  // Read ONCE and reused below: `cache.corpus` memoizes per branch, but taking
  // the value here keeps the tie check and the position inference provably over
  // the same rows.
  const corpusRows = pane.agentName === null ? [] : cache.corpus(pane.agentName);
  const ghRunForAccept = cache.gh(pane.cwd);
  const rejectedField = rejectedFieldOf({
    status: pane.status,
    tenths,
    marker,
    corpusTie: newestVerdictTie(corpusRows),
    corpusUnparsable: corpusHasUnparsableVerdict(corpusRows),
    corpusMalformed: corpusHasMalformedRow(corpusRows),
    ghBucket: unknownBucketOf(ghRunForAccept),
  });

  const ghRun = cache.gh(pane.cwd);
  const ghOutcome = classifyGh(ghRun);
  const git = cache.git(pane.cwd);
  const position = positionFor({
    now: s.now(),
    clean: git.clean,
    lastCommitAt: git.lastCommitAt,
    pr: prFrom(ghRun),
    corpus: corpusRows,
  });

  const ownership = resolveOwnership(pane.paneId, pane.agentName, cache.purview, asSessionId ?? "");
  const markerSession = typeof marker?.["sessionId"] === "string" ? marker["sessionId"] : null;
  const blockedOn = typeof marker?.["blockedOn"] === "string" ? marker["blockedOn"] : "";

  // AC-16. A label is a CLAIM to be an arc; a worktree branch is what makes it
  // one. Taking the label's existence as proof classified the orchestrator panes
  // -- labelled precisely because they dispatch arcs rather than being one -- as
  // drivable, and diff round 1 probed a checkpoint actually being sent to one.
  // Unresolved becomes null, which is exactly what rule 1 reads, so the pane
  // reports NOT-AN-ARC and is never driven.
  const resolvedBranch =
    pane.agentName !== null && cache.branches.has(pane.agentName) ? pane.agentName : null;

  const observed: ObservedPane = {
    paneId: pane.paneId,
    branch: resolvedBranch,
    duplicateName:
      resolvedBranch !== null && roster.filter((r) => r.agentName === pane.agentName).length > 1,
    status: (STATUSES.has(pane.status) ? pane.status : "unknown") as ObservedPane["status"],
    // CLAIMED, not owned-by-me. Rule 3's question is spec §4.2's UNOWNED --
    // "not in any purview registry, or in more than one" -- and the report has
    // no caller to compare against, so answering "owned by you?" there labelled
    // every singly-claimed pane UNOWNED (diff round 1, finding 5). Whether THIS
    // caller may drive is asked at the drive gate instead.
    claimed: ownership.kind === "owned" || ownership.kind === "owned-by-other",
    contested: ownership.kind === "contested",
    rejectedField,
    // Rule 5 asks whether the session that WROTE the marker is still the one in
    // the pane — the supersession a takeover creates. So it compares the
    // marker's `sessionId` against the pane's own live `agent_session.value`,
    // NOT against `--as`: the orchestrator is a different session from every
    // pane it watches, so comparing against `--as` would fire rule 5 on
    // essentially every arc pane that carries a marker (spec §4.5 rule 5,
    // AC-17). An ABSENT live session with a marker that names one IS a
    // mismatch, which is the measured case in §3.9's probe table; an absent
    // MARKER cannot mismatch and rule 5 no-ops (AC-20).
    sessionMismatch:
      markerSession !== null && (pane.agentSession === null || pane.agentSession !== markerSession),
    ghFault: ghOutcome.kind === "fault",
    blockedOn,
    tenths,
    position: position.cost,
  };

  const c = classify(observed);
  return {
    paneId: pane.paneId,
    rejectedField,
    // The RAW label, deliberately, while the classifier above used the RESOLVED
    // one. An operator scanning the report needs to see which pane a row is,
    // and `(unlabeled)` against a NOT-AN-ARC verdict would hide exactly the
    // label that explains the verdict.
    branch: pane.agentName,
    tenths,
    verdict: c.verdict,
    rule: c.rule,
    position,
    inPurview: ownership.kind === "owned",
  };
}

type Parsed = {
  mode: "report" | "check" | "checkpoint" | "compact" | "resume";
  json: boolean;
  dryRun: boolean;
  all: boolean;
  as: string | null;
  target: string | null;
  /** Positional arguments beyond the first; a non-empty list is a usage error. */
  extraTargets: string[];
  /** Sending-mode flags beyond the first; a non-empty list is a usage error. */
  extraModes: string[];
};

/** argv, with no defaulting that could stand in for a missing `--as`. */
export function parseArgv(argv: string[]): Parsed {
  const out: Parsed = {
    mode: "report",
    json: false,
    dryRun: false,
    all: false,
    as: null,
    target: null,
    extraTargets: [],
    extraModes: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--all") out.all = true;
    else if (a === "--check") {
      // `--check` IS a mode, so a second one collides exactly like a second
      // sending flag. Tracking only the three sending modes meant
      // `--checkpoint wM:p1 --check` silently became a report-mode `--check`
      // and exited 0, while the reverse order refused -- the grammar disagreed
      // with itself depending on argument order (diff round 5, finding 3).
      if (out.mode !== "report") out.extraModes.push(a);
      out.mode = "check";
    } else if (a === "--as") {
      // A flag is never a session id. `--as --dry-run` is a MISSING `--as`, and
      // swallowing the flag would both invent an orchestrator identity and drop
      // the option that followed — the one thing this parser must not do, since
      // §6 turns on `--as` being explicit and never inferred.
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out.as = next;
        i += 1;
      }
    } else if (a === "--checkpoint" || a === "--compact" || a === "--resume") {
      // A SECOND sending mode is a usage error, not a re-aim. This branch used
      // to overwrite both `mode` and `target`, so `--checkpoint p1 --compact p2`
      // parsed as compacting p2, exited 0, and SENT -- the operator asked to
      // checkpoint p1 and the tool typed `/compact` into p2 instead (diff round
      // 3, finding 3, AC-7). Recorded through the same channel as a second
      // positional, so one refusal covers both spellings of "which pane did you
      // mean".
      if (out.mode !== "report") {
        out.extraModes.push(a);
      }
      out.mode = a.slice(2) as Parsed["mode"];
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        if (out.target !== null) out.extraTargets.push(next);
        else out.target = next;
        i += 1;
      }
    } else if (a !== undefined && !a.startsWith("--")) {
      // EXTRAS ARE RECORDED, not dropped. `out.target === null` used to guard
      // this branch, so `--checkpoint pane-a pane-b` silently drove pane-a and
      // exited 0 -- AC-7 specifies a single-target grammar, and an orchestrator
      // typo that drives the WRONG PANE while reporting success is exactly the
      // failure this tool must not have (diff round 2, finding 5).
      if (out.target === null) out.target = a;
      else out.extraTargets.push(a);
    }
  }
  return out;
}

const SENDING = new Set(["checkpoint", "compact", "resume"]);

/**
 * The `Surface` members that are NOT reads: the sink, the effects, and the
 * ambient generators.
 *
 * Stated as the EXCLUSION rather than as a list of reads, so the core's
 * `readOnce` is total over the surface: a member added to `Surface` is
 * memoized by default, and only a deliberate edit here can take it out of the
 * pass. A hand-list of reads would fail the other way, leaving the new member
 * outside the pass silently.
 *
 * It mirrors the enrolled send-auth row's `sinks` + `effects` + `ambient`
 * (`tests/paneCompaction/sendAuthScan.ts`), and the adapter suite asserts the
 * two agree, so the runtime pass and the static scanner cannot disagree about
 * what counts as a read.
 */
export const NON_READ_MEMBERS: ReadonlySet<string> = new Set([
  "send",
  "out",
  "outRaw",
  "nonceWrite",
  "nonceConsume",
  "now",
  "random",
]);

/**
 * The whole program, as a function of argv and its world.
 *
 * Returns the exit code rather than calling `process.exit`, so every mode is
 * assertable — including the refusals, whose entire contract is that they NAME
 * the condition that fired (§6's third guarantee).
 */
export function main(argv: string[], s: Surface): number {
  const opts = parseArgv(argv);

  if (opts.all) {
    s.out(refuse({ kind: "all-rejected" }).message);
    return 1;
  }
  if (opts.extraModes.length > 0) {
    s.out(`refusing: name a single command; also given ${opts.extraModes.join(", ")} (AC-7)`);
    return 1;
  }
  if (opts.extraTargets.length > 0) {
    // Refused BEFORE `--as` and before any observation: naming a second target
    // means the operator's intent is not knowable, and guessing which one they
    // meant is the one thing worse than refusing.
    s.out(`refusing: name a single target; also given ${opts.extraTargets.join(", ")} (AC-7)`);
    return 1;
  }
  if ((opts.mode === "check" || SENDING.has(opts.mode)) && opts.as === null) {
    s.out(refuse({ kind: "missing-as" }).message);
    return 1;
  }

  // An unreadable roster is a DEGRADED report, not a stack trace and not an
  // SENDING MODES LEAVE HERE, BEFORE ANY READ.
  //
  // This return is the round-1 repair and its POSITION is the whole content of
  // it. `main` used to read the roster and resolve the target on the RAW
  // surface and hand both to `drive()`, which only then opened the pass -- so
  // the roster feeding rules 1, 2, 5 and 7 PREDATED the pass, which spec §1.2
  // forbids outright. A takeover landing during `resolveTarget()` was therefore
  // invisible: the stale roster still carried the old `agent_session`, rule 5
  // compared it against the marker naming that same old session, matched, and
  // `/compact` went to the pane the successor now held. Probed, exit 0, two
  // bytes sent, `rosterReads: 1`.
  //
  // It is NOT the §7 limit-1 residual, which is scoped from the pass's FIRST
  // read to the send. This was earlier than that, and the structural cover
  // could not see it: set equality and at-most-one-call are both satisfied by a
  // read taken at the wrong TIME.
  //
  // The disjunction rather than `SENDING.has`, because it NARROWS: the pass
  // function takes a `SendMode`, and a Set membership test tells the compiler
  // nothing.
  if (opts.mode !== "report" && opts.mode !== "check") {
    // A refused send is a FAULT (exit 2), not a refusal (exit 1): the command
    // was authorized and the tool underneath failed, which is a different thing
    // for an operator to do something about. Caught here so it cannot escape
    // `main` as an unhandled throw, which is what the round-1 probe observed.
    try {
      return driveSend(opts, opts.mode, s);
    } catch (e) {
      if (e instanceof NonceMintExhausted) {
        // A TOOL fault (2), never a refusal (1). Nothing is wrong with the
        // pane: the generator is. Routing this through exit 1 would tell an
        // operator "asked and answered: not now" about a condition that no
        // amount of waiting or re-checkpointing fixes, and an UNCAUGHT throw
        // would exit with whatever code the runtime picks -- which the taxonomy
        // reads as a refusal.
        s.out(`refusing: the random source is broken -- ${e.message}`);
        return 2;
      }
      if (e instanceof SendFailed) {
        s.out(`refusing: ${e.message}`);
        // Said explicitly, because the retry is NOT obvious: --compact consumes
        // the nonce before sending, so re-running it will refuse. The target
        // needs a fresh --checkpoint first.
        if (opts.mode === "compact") {
          s.out("the checkpoint was already consumed; re-run --checkpoint before --compact");
        }
        return 2;
      }
      // Diff round 3, core finding 3 (P1). Everything else used to RETHROW, and
      // the comment three blocks up already named the hazard -- "an UNCAUGHT
      // throw would exit with whatever code the runtime picks, which the
      // taxonomy reads as a refusal" -- while closing it for two classes only.
      // This completes that reasoning over the rest.
      //
      // Reachable without a test double: `realSurface().branches()` throws when
      // `git worktree list` fails, and every read member can fail the same way.
      //
      // NOT a silent catch-all: the message carries the original fault, so a
      // programming error surfaces as a named exit 2 rather than being swallowed
      // into a clean-looking refusal. The two classes above stay separate
      // because their REMEDIES differ, which is the only reason to name a fault
      // specially.
      const detail = e instanceof Error ? e.message : String(e);
      s.out(`refusing: the tool could not complete -- ${detail}`);
      return 2;
    }
  }

  // The REPORT path's roster read. An unreadable roster is a DEGRADED report,
  // not a stack trace and not an empty one: a report of no panes and a report
  // of no ANSWER look identical to a reader, and `--check` would say 0, meaning
  // "nothing needs you". The envelope carries a `degraded` channel for exactly
  // this, and untrusted is exit 2.
  let roster: RosterPane[];
  try {
    roster = s.roster();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const reason = `herdr roster unreadable: ${detail}`;
    if (opts.json) s.out(JSON.stringify(reportEnvelope([], [reason]), null, 2));
    else s.out(`refusing: ${reason}`);
    return 2;
  }

  const cache = cacheOf(s);
  const panes = roster.map((p) => observe(p, roster, opts.as, s, cache));
  if (opts.json) {
    s.out(JSON.stringify(reportEnvelope(panes, []), null, 2));
  } else {
    for (const p of panes) s.out(renderRow(p));
  }
  return opts.mode === "check" ? checkExitCode(panes) : 0;
}

/**
 * The three one-shot commands, each authorized from ONE read-once pass (§3.1).
 *
 * There is no preliminary observation, no stale-versus-fresh comparison and no
 * second revalidation inside the send. Those were the four incremental repairs
 * of one class -- r1 froze the nonce, r2 compared only the verdict, r3 froze the
 * roster, r4 read the marker twice -- and each was a decision assembled across
 * instants. The FIRST act here is `readOnce`, so every value below comes from
 * this invocation's own pass, `s` is not consulted again after that line, and
 * nothing is read between the decision and the send.
 */
// send-auth: pass
function driveSend(opts: Parsed, mode: SendMode, s: Surface): number {
  // NOT `opts.as ?? ""`. Every sending mode is refused with `missing-as` before
  // drive() is reachable (the guard above, on mode), so the null branch is dead
  // — and defaulting it to empty would be the wrong death: an empty `as` yields
  // an EMPTY PURVIEW, which silently disarms rule 3's collision check rather
  // than failing. Narrow on the established guarantee, so a future edit that
  // breaks it fails here instead of quietly driving an unowned pane.
  const as = opts.as!;
  // THE PASS, established as the FIRST ACT and before every read it decides on.
  // `s` is not touched again after this line -- roster and target resolution
  // included, which is what round 1 found missing.
  const pass = readOnce(s, NON_READ_MEMBERS);

  // TARGET RESOLUTION FIRST, ROSTER SECOND, and the order is load-bearing.
  //
  // Resolution picks WHICH pane; it feeds no rule. The roster feeds rules 1, 2,
  // 5 and 7 -- `agent_session` above all -- so it is read as LATE as the
  // decision allows, which puts the freshest possible value under rule 5. The
  // reverse order let a takeover landing during `resolveTarget()` sit
  // unobserved behind an already-captured roster.
  //
  // This NARROWS the window; it does not close it, and nothing can. A takeover
  // landing after the roster read is still unobserved by this invocation --
  // that is spec §7 limit 1, the declared intra-pass residual, priced there per
  // decay class rather than claimed away. For `/compact` specifically the
  // priced worst case is a compaction the operator no longer wanted, which is
  // what auto-compaction does on its own schedule anyway.
  const target = opts.target;
  if (target === null) {
    // ABSENT is not UNRESOLVABLE, and neither is a missing `--as`. Routing this
    // through either of those causes would print a message naming the wrong
    // condition -- the absent-versus-mismatched conflation the repo has been
    // bitten by before -- so the adapter states its own, and the core's catalog
    // keeps covering only the causes the core can observe.
    s.out("refusing: name a single target; none was given");
    return 1;
  }
  const resolved = pass.resolveTarget(target);
  if ("fault" in resolved) {
    // A broken herdr is not a typo. Reporting it as "not found" would send an
    // operator to check their spelling while the tool is what is wrong.
    s.out(`refusing: could not resolve target ${target}: ${resolved.fault}`);
    return 2;
  }
  if ("notFound" in resolved) {
    s.out(refuse({ kind: "unresolvable-target", target }).message);
    return 1;
  }
  // An unreadable roster is a FAULT here rather than a degraded report: a
  // sending mode has no envelope to carry a `degraded` channel, and driving on
  // a roster we could not read is the one thing this arc exists to prevent.
  let roster: RosterPane[];
  try {
    roster = pass.roster();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    s.out(`refusing: herdr roster unreadable: ${detail}`);
    return 2;
  }

  const pane = roster.find((r) => r.paneId === resolved.paneId);
  if (pane === undefined) {
    // herdr knows the target but the pass's roster does not carry it -- a race
    // with a closing pane. Not drivable, and said as its own condition.
    s.out(`refusing: target ${target} resolved to ${resolved.paneId}, which is not on the roster`);
    return 1;
  }

  const cache = cacheOf(pass);
  const report = observe(pane, roster, as, pass, cache);

  // OWNERSHIP BY THIS CALLER, which rule 3 deliberately does not answer.
  //
  // Rule 3 answers spec §4.2's question -- is the pane claimed AT ALL -- because
  // the report has no caller and must not label other people's panes unclaimed.
  // That correction would otherwise open a hole in the other direction: a pane
  // validly claimed by ANOTHER orchestrator passes rule 3. The predicate refuses
  // it by its own name.
  const ownership = resolveOwnership(
    pane.paneId,
    pane.agentName !== null && cache.branches.has(pane.agentName) ? pane.agentName : null,
    cache.purview,
    as,
  );

  const marker = pass.marker(pane.cwd);
  const markerNonce =
    typeof marker?.["checkpointNonce"] === "string" ? marker["checkpointNonce"] : null;
  // The addressee, when the marker names one. A marker-less or session-less
  // target is addressed by BRANCH alone (spec §3.6) -- rule 5 already governs
  // the mismatch cases the id would catch, so branch-alone is a narrower
  // address rather than an absent one.
  const markerSessionId = typeof marker?.["sessionId"] === "string" ? marker["sessionId"] : null;

  // Read for `--compact` alone, because only `--compact` compares it. Reading
  // it for every mode would put a member in the pass that no decision uses.
  // HELD IN A NAME rather than read inline, because the consume below must
  // spend THIS value and not whatever the record holds by then (diff round 2,
  // core finding 1). Its position is unchanged -- still immediately before the
  // decision -- so the read ORDER round 1 fixed is untouched.
  const recorded = mode === "compact" ? pass.nonceRead(as, pane.paneId) : null;
  const decision = authorizeSend({
    mode,
    paneId: pane.paneId,
    as,
    ownership,
    report,
    ...(mode === "compact" ? { nonce: { recorded, marker: markerNonce } } : {}),
  });
  if (!decision.authorized) {
    pass.out(decision.message);
    return 1;
  }

  // Rule 1 stopped every pane whose label resolves to no worktree branch, so
  // the label is a string from here down. NARROWED on that guarantee rather
  // than defaulted to the empty string: an empty address addresses nobody while
  // looking addressed, which is the one thing §3.6's address line exists to
  // prevent -- and a future edit that breaks the guarantee fails here instead.
  const branch = pane.agentName;
  if (branch === null) throw new Error("unreachable: rule 1 stops a pane with no agent label");

  // The effects, with NOTHING read between the decision and the send.
  if (mode === "checkpoint") {
    const nonce = mintNonce({ markerNonce, random: pass.random });
    const sends = planSends({
      command: "checkpoint",
      nonce,
      branch,
      session: markerSessionId,
    }).sends;
    if (opts.dryRun) {
      for (const line of sends) pass.outRaw(line);
      return 0;
    }
    pass.nonceWrite(as, pane.paneId, nonce);
    for (const line of sends) pass.send(pane.paneId, line);
    return 0;
  }

  if (mode === "resume") {
    const sends = planSends({ command: "resume", branch, session: markerSessionId }).sends;
    for (const line of sends) {
      if (opts.dryRun) pass.outRaw(line);
      else pass.send(pane.paneId, line);
    }
    return 0;
  }

  // `--dry-run` went through the SAME gate above rather than around it, so it
  // shows the refusal the real command would hit. What it must not do is SPEND:
  // reading and comparing the record is the gate, consuming it is the side
  // effect, so the dry run gets a no-op consume and a send that prints.
  // The gate above proved `recorded` equals the marker copy and that both are
  // non-null, so this is the authorized grant, narrowed on that guarantee.
  if (recorded === null) throw new Error("unreachable: the nonce gate admits no null recorded");
  const spent = runCompact({
    consume: opts.dryRun
      ? (): boolean => true
      : (): boolean => pass.nonceConsume(as, pane.paneId, recorded),
    send: (text) => {
      if (opts.dryRun) pass.outRaw(text);
      else pass.send(pane.paneId, text);
    },
  });
  if (!spent) {
    // Diff round 3, core finding 2 (P1). Round 2 reused `nonce-mismatch` here on
    // the reasoning that it was "the same condition". It is not. The gate's
    // condition is that the marker and the record DISAGREED when we decided;
    // this one is that the RECORD moved between deciding and spending, while
    // the marker still holds exactly what we authorized -- so the mismatch
    // message was false about both halves. Naming the condition that fired
    // outranks keeping the catalog short.
    pass.out(refuse({ kind: "nonce-record-changed" }).message);
    return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// The real surface. Only this half spawns anything.
// ---------------------------------------------------------------------------

const PURVIEW_DIR = join(homedir(), ".claude", "pane-purview");
const NONCE_DIR = join(homedir(), ".claude", "pane-nonces");

/**
 * A send that herdr refused, kept distinct from every other throw.
 *
 * Diff round 1, finding 4 (P1). `send` discarded `sh`'s exit code and the
 * command returned 0 regardless, so a refused send reported success. The prompt
 * text and the submitting `\r` are SEPARATE subprocesses, so a failure between
 * them leaves a typed-but-unsubmitted prompt sitting in the target's box -- and
 * for `--compact` the nonce has already been consumed, so the obvious retry
 * refuses too.
 */
export class SendFailed extends Error {
  constructor(
    readonly target: string,
    detail: string,
  ) {
    super(`herdr agent send to ${target} failed: ${detail}`);
    this.name = "SendFailed";
  }
}

function sh(cmd: string, args: string[], cwd?: string): GhInvocation {
  try {
    const stdout = execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { exitCode: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

/**
 * `herdr agent get`'s answer, as the three-way §5.3 asks for.
 *
 * PROBED 2026-08-16, and not what it looks like: a missing target exits **1**
 * and writes its JSON to **stderr**, while a hit exits 0 and writes to stdout.
 * So the structured body is the whole answer and it can arrive on either
 * stream. Reading stdout alone turns every not-found into a parse failure,
 * which is a fault, which is exit 2 — a real answer misreported as a broken
 * tool. Only running it against live herdr showed that; the first version had
 * the streams the other way round from a probe whose exit code was `head`'s.
 *
 * Split out from the surface so both streams are pinned by a test rather than
 * by this comment.
 */
export function parseAgentGet(
  run: GhInvocation,
): { paneId: string } | { notFound: true } | { fault: string } {
  const raw = run.stdout.trim() === "" ? run.stderr : run.stdout;
  let body: {
    result?: { agent?: { pane_id?: unknown } };
    error?: { code?: unknown; message?: unknown };
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return { fault: `herdr agent get did not return JSON (exit ${run.exitCode})` };
  }
  // `JSON.parse("null")` succeeds and yields null, which `typeof` calls an
  // object -- so the property reads below would THROW rather than fault. A
  // literal `null` reply is malformed output from the tool, and a malformed
  // reply is a named fault, never a crash (diff round 3, finding 2).
  if (typeof body !== "object" || body === null) {
    return { fault: `herdr agent get returned a non-object body (exit ${run.exitCode})` };
  }
  const code = body.error?.code;
  if (code === "agent_not_found") return { notFound: true };
  if (typeof code === "string") return { fault: code };
  const paneId = body.result?.agent?.pane_id;
  if (typeof paneId !== "string" || paneId === "") {
    return { fault: "herdr agent get returned no pane_id" };
  }
  return { paneId };
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * A file that EXISTS but cannot be read as a record.
 *
 * Diff round 4, core finding 2 (P1) -- and the same class round 1 finding 2 (P0)
 * already fixed for the MARKER, which is the point worth recording: that repair
 * built `readMarker` beside `readJson` and left every other consumer collapsing
 * ABSENT and MALFORMED into one `null`. The instance was closed and the class
 * was not.
 *
 * A record being written while we read it is ordinary operation here, exactly as
 * it is for the marker: this adapter's own `nonceWrite` rewrites the file, so
 * two invocations in one session interleave on it.
 *
 * The three consumers below each got the wrong answer from that collapse, and
 * only one was reported:
 *   - `nonceRead`   -> "this command holds no checkpoint record", naming a
 *                      condition that did not fire, at exit 1 (a refusal) where
 *                      an unreadable file is a FAULT (exit 2).
 *   - `nonceConsume`-> read as absent, so it declines to spend and refuses with
 *                      a record-changed reason that also did not fire.
 *   - `nonceWrite`  -> `?? {}` SILENTLY REPLACED the whole record, destroying
 *                      every other pane's outstanding grant in that session
 *                      file. Not reported by the round-4 reviewer; found by
 *                      sweeping the class rather than repairing the instance.
 */
class RecordUnreadable extends Error {
  constructor(path: string) {
    super(`the record at ${path} exists but could not be read`);
    this.name = "RecordUnreadable";
  }
}

/** `null` = genuinely absent. Throws when the file exists and will not parse. */
export function readRecord(path: string): Record<string, string> | null {
  if (!existsSync(path)) return null;
  let body: unknown;
  try {
    body = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new RecordUnreadable(path);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new RecordUnreadable(path);
  }
  return body as Record<string, string>;
}

/**
 * The marker a pane's worktree holds, with MALFORMED kept distinct from ABSENT.
 *
 * Diff round 1, finding 2 (P0). `readJson` returns null for both, and the two
 * mean opposite things here: an absent marker is a SUPPORTED observation (AC-20
 * -- it cannot mismatch, so rule 5 no-ops), while a corrupt one is input outside
 * the §4.3 accept-set and owes UNDETERMINED under AC-4. Collapsing them let a
 * half-written marker read as "no marker" and drive on.
 *
 * A marker being written while we read it is ordinary operation, not forgery:
 * `--checkpoint` ASKS the target to rewrite this exact file, so this adapter
 * creates the interleaving itself.
 *
 * The sentinel is compared by IDENTITY, so no real marker content can imitate it.
 */
export const MALFORMED_MARKER: Record<string, unknown> = Object.freeze({
  "unparseable JSON": true,
}) as Record<string, unknown>;

function readMarker(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const body: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof body !== "object" || body === null || Array.isArray(body)) return MALFORMED_MARKER;
    return body as Record<string, unknown>;
  } catch {
    return MALFORMED_MARKER;
  }
}

export function realSurface(): Surface {
  return {
    branches: () => {
      // `--porcelain` because the human format decorates the branch with
      // brackets and the detached-HEAD case prints something else entirely.
      // Refs arrive as `refs/heads/<name>`; the roster labels are bare names.
      const run = sh("git", ["worktree", "list", "--porcelain"]);
      if (run.exitCode !== 0) {
        throw new Error(`git worktree list exited ${run.exitCode}: ${run.stderr.trim()}`);
      }
      const names = new Set<string>();
      for (const line of run.stdout.split("\n")) {
        const m = /^branch\s+refs\/heads\/(.+)$/.exec(line.trim());
        const name = m?.[1];
        if (name !== undefined && name !== "") names.add(name);
      }
      return names;
    },
    roster: () => {
      // `herdr agent list` — the roster §3.6 names, and the only call that
      // carries `agent_session`, which rule 5 needs. An earlier version read
      // `herdr pane list` and took the arc from `label`; that call exposes no
      // `name` and no `agent_session` at all, so rule 5 had nothing to compare
      // and the roster included panes running no agent.
      const run = sh("herdr", ["agent", "list"]);
      // Named failures, because the caller turns these into the report's
      // `degraded` reason and a raw SyntaxError would tell an operator nothing
      // about which of the two actually happened.
      if (run.exitCode !== 0) {
        throw new Error(`herdr agent list exited ${run.exitCode}: ${run.stderr.trim()}`);
      }
      let parsed: { result?: { agents?: Array<Record<string, unknown>> } };
      try {
        parsed = JSON.parse(run.stdout) as typeof parsed;
      } catch {
        throw new Error("herdr agent list did not return JSON");
      }
      const agents = parsed.result?.agents ?? [];
      return agents.map((a) => {
        // An empty name is ABSENT, not the empty arc: null makes rule 1 fire and
        // the pane reports NOT-AN-ARC rather than being classified on a blank.
        const name = typeof a["name"] === "string" ? a["name"].trim() : "";
        const session = a["agent_session"];
        const value =
          typeof session === "object" && session !== null
            ? (session as { value?: unknown }).value
            : undefined;
        return {
          paneId: String(a["pane_id"] ?? ""),
          agentName: name === "" ? null : name,
          cwd: String(a["cwd"] ?? ""),
          status: String(a["agent_status"] ?? "unknown"),
          // Optional by §4.3, and absence is an observation rather than a fault.
          agentSession: typeof value === "string" && value !== "" ? value : null,
        };
      });
    },
    screen: (paneId) => sh("herdr", ["pane", "read", paneId, "--source", "visible"]).stdout,
    resolveTarget: (target) => parseAgentGet(sh("herdr", ["agent", "get", target])),
    send: (target, text) => {
      const run = sh("herdr", ["agent", "send", target, text]);
      if (run.exitCode !== 0) {
        throw new SendFailed(target, run.stderr.trim() || `exited ${run.exitCode}`);
      }
    },
    purview: () => {
      if (!existsSync(PURVIEW_DIR)) return [];
      const files: PurviewFile[] = [];
      for (const name of readdirSync(PURVIEW_DIR)) {
        if (!name.endsWith(".json")) continue;
        const body = readJson(join(PURVIEW_DIR, name)) as PurviewFile | null;
        if (body !== null) files.push(body);
      }
      return files;
    },
    marker: (cwd) => (cwd === "" ? null : readMarker(join(cwd, ".claude", "ship-state.json"))),
    // A roster entry can carry no cwd at all — a plain shell pane. Spawning with
    // an empty cwd would either throw or, worse, silently run in the
    // ORCHESTRATOR's directory and report that worktree's git and PR state as
    // the pane's. Answering "unknown" keeps the read honest: an unclean tree
    // with no commit time is the conservative side of every position predicate.
    git: (cwd) => {
      if (cwd === "") return { clean: false, lastCommitAt: null };
      const status = sh("git", ["status", "--porcelain"], cwd);
      const at = sh("git", ["log", "-1", "--format=%ct"], cwd);
      const secs = Number(at.stdout.trim());
      return {
        clean: status.exitCode === 0 && status.stdout.trim() === "",
        lastCommitAt: Number.isFinite(secs) && secs > 0 ? secs * 1000 : null,
      };
    },
    gh: (cwd) =>
      cwd === ""
        ? { exitCode: 1, stdout: "", stderr: "no cwd on this pane" }
        : sh("gh", ["pr", "checks", "--json", "bucket"], cwd),
    corpus: (branch) => {
      if (branch === null) return [];
      const dir = join(process.cwd(), "docs", "review-rounds", branch);
      if (!existsSync(dir)) return [];
      const rows: CorpusRow[] = [];
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".jsonl")) continue;
        for (const line of readFileSync(join(dir, name), "utf8").split("\n")) {
          if (line.trim() === "") continue;
          try {
            const parsed: unknown = JSON.parse(line);
            // SHAPE-checked, not just parsed. A row missing `status` used to
            // survive the cast and then fail every `status === "verdict"` test,
            // so it vanished instead of being reported.
            // The COMPLETE declared row, not just `status`. Spec §4.3 line 213
            // names six fields, and validating one of them let a row whose
            // `stage` was a number through: it reached position inference,
            // which then read `verdict` and `endedAt` off a row nothing had
            // checked (diff round 5, finding 2). Validating the field you
            // happen to branch on is the same partial-check shape as the marker
            // key walk two rounds ago.
            if (!corpusRowIsWellFormed(parsed)) {
              rows.push({ status: MALFORMED_CORPUS_STATUS, verdict: null, endedAt: null });
            } else {
              rows.push(parsed as CorpusRow);
            }
          } catch {
            // Stamped, never skipped: a line we cannot read is a fact about the
            // corpus, and silently dropping it infers position from a corpus we
            // know is incomplete.
            rows.push({ status: MALFORMED_CORPUS_STATUS, verdict: null, endedAt: null });
          }
        }
      }
      return rows;
    },
    now: () => Date.now(),
    // 128 bits, as spec §5.2 says twice -- not `Math.random`, which carries at
    // most ~53 bits of entropy and was being truncated to ten base-36 characters
    // on top of that (diff round 1, finding 8). The nonce is what proves a
    // target executed THIS checkpoint rather than a previous one, so its
    // strength is the whole basis of that proof; shipping a weaker generator
    // than the spec claims makes the guarantee unverifiable rather than merely
    // smaller.
    random: () => randomBytes(16).toString("hex"),
    out: (line) => process.stdout.write(`${line}\n`),
    outRaw: (bytes) => process.stdout.write(bytes),
    nonceRead: (sessionId, paneId) => {
      const body = readRecord(join(NONCE_DIR, `${sessionId}.json`));
      return body?.[paneId] ?? null;
    },
    nonceWrite: (sessionId, paneId, nonce) => {
      mkdirSync(NONCE_DIR, { recursive: true });
      const path = join(NONCE_DIR, `${sessionId}.json`);
      // NOT `?? {}`: that turned an unreadable record into an empty one and
      // wrote it back, destroying every other pane's grant in this session.
      const body = readRecord(path) ?? {};
      body[paneId] = nonce;
      writeFileSync(path, JSON.stringify(body, null, 2));
    },
    nonceConsume: (sessionId, paneId, expected) => {
      const path = join(NONCE_DIR, `${sessionId}.json`);
      const body = readRecord(path);
      if (body === null) return false;
      // A grant that is not the one we authorized is not ours to destroy.
      if (body[paneId] !== expected) return false;
      delete body[paneId];
      if (Object.keys(body).length === 0) rmSync(path, { force: true });
      else writeFileSync(path, JSON.stringify(body, null, 2));
      return true;
    },
  };
}

/* c8 ignore start — the entry guard runs only as a process, never under vitest */
if (process.argv[1]?.endsWith("pane-compaction.ts") === true) {
  process.exitCode = main(process.argv.slice(2), realSurface());
}
/* c8 ignore stop */
