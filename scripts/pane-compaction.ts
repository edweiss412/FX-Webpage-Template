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
  planSends,
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
  nonceRead(sessionId: string, paneId: string): string | null;
  nonceWrite(sessionId: string, paneId: string, nonce: string): void;
  nonceConsume(sessionId: string, paneId: string): void;
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
const MARKER_FIELDS = new Set([
  "branch",
  "stage",
  "tasksRemaining",
  "next",
  "blockedOn",
  "cronJobId",
  "sessionId",
  "checkpointNonce",
]);

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
}): string | null {
  if (!STATUSES.has(opts.status)) return `agent_status=${opts.status}`;
  if (opts.tenths === null) return "ctx gauge";
  // Identity, not shape: a real marker cannot imitate the sentinel. Checked
  // BEFORE the key walk, because the sentinel's own key would otherwise be
  // reported as though the file had named it.
  if (opts.marker === MALFORMED_MARKER) return "marker (unparseable JSON)";
  if (opts.corpusTie === true) return "corpus.endedAt (tie for newest verdict)";
  if (opts.marker !== null) {
    for (const key of Object.keys(opts.marker)) {
      if (!MARKER_FIELDS.has(key)) return `marker.${key}`;
    }
  }
  return null;
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
  const rejectedField = rejectedFieldOf({
    status: pane.status,
    tenths,
    marker,
    corpusTie: newestVerdictTie(corpusRows),
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
    owned: ownership.kind === "owned",
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
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--all") out.all = true;
    else if (a === "--check") out.mode = "check";
    else if (a === "--as") {
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
      out.mode = a.slice(2) as Parsed["mode"];
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out.target = next;
        i += 1;
      }
    } else if (a !== undefined && !a.startsWith("--") && out.target === null) {
      out.target = a;
    }
  }
  return out;
}

const SENDING = new Set(["checkpoint", "compact", "resume"]);

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
  if ((opts.mode === "check" || SENDING.has(opts.mode)) && opts.as === null) {
    s.out(refuse({ kind: "missing-as" }).message);
    return 1;
  }

  // An unreadable roster is a DEGRADED report, not a stack trace and not an
  // empty one. Letting the read throw would end the process on whatever `herdr`
  // printed; returning an empty roster silently would be worse still, since a
  // report of no panes and a report of no ANSWER look identical to a reader and
  // `--check` would say 0, meaning "nothing needs you". The envelope carries a
  // `degraded` channel for exactly this, and untrusted is exit 2.
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

  if (SENDING.has(opts.mode)) {
    const target = opts.target;
    if (target === null) {
      // ABSENT is not UNRESOLVABLE, and neither is a missing `--as`. Routing
      // this through either of those causes would print a message naming the
      // wrong condition — the absent-versus-mismatched conflation the repo has
      // been bitten by before — so the adapter states its own, and the core's
      // catalog keeps covering only the causes the core can observe.
      s.out("refusing: name a single target; none was given");
      return 1;
    }
    const resolved = s.resolveTarget(target);
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
    const pane = roster.find((r) => r.paneId === resolved.paneId);
    if (pane === undefined) {
      // herdr knows the target but it is absent from the roster we classified —
      // a race with a closing pane. Not drivable, and said as its own condition.
      s.out(
        `refusing: target ${target} resolved to ${resolved.paneId}, which is not on the roster`,
      );
      return 1;
    }
    return drive(opts, pane, roster, s);
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

/** The three one-shot commands, each revalidating on its own predicate (§5.2). */
function drive(opts: Parsed, pane: RosterPane, roster: RosterPane[], s: Surface): number {
  // NOT `opts.as ?? ""`. Every sending mode is refused with `missing-as` before
  // drive() is reachable (the guard above, on mode), so the null branch is dead
  // — and defaulting it to empty would be the wrong death: an empty `as` yields
  // an EMPTY PURVIEW, which silently disarms rule 3's collision check rather
  // than failing. Narrow on the established guarantee, so a future edit that
  // breaks it fails here instead of quietly driving an unowned pane.
  const as = opts.as!;
  const cache = cacheOf(s);
  const report = observe(pane, roster, as, s, cache);
  const marker = s.marker(pane.cwd);
  const markerNonce =
    typeof marker?.["checkpointNonce"] === "string" ? marker["checkpointNonce"] : null;

  // "An observation says stop" is RULES 1-8, and it has to be read off the rule
  // number rather than the verdict. `WAIT` is produced by rule 7 (blocked or
  // unknown status) and rule 8 (a HardWait position) — both observations — AND
  // by rules 11 and 12, which are banding. Testing the verdict cannot tell those
  // apart, so a verdict-based gate would let `--resume` drive a pane that rule 7
  // had stopped. §6's first guarantee is that no pane is driven, `--resume`
  // included, while any rule 1-8 condition holds.
  const OBSERVATION_RULES = 8;
  if (report.rule <= OBSERVATION_RULES) {
    s.out(refuse({ kind: "not-drivable", verdict: report.verdict }).message);
    return 1;
  }
  // `--resume` stops there, deliberately: a successful compaction makes
  // COMPACT/FORCE false exactly when resuming is the correct next act, so
  // requiring them would refuse in precisely the case the command exists for.
  if (opts.mode !== "resume" && report.verdict !== "COMPACT" && report.verdict !== "FORCE") {
    s.out(refuse({ kind: "not-drivable", verdict: report.verdict }).message);
    return 1;
  }

  if (opts.mode === "checkpoint") {
    const nonce = mintNonce({ markerNonce, random: s.random });
    const sends = planSends({ command: "checkpoint", nonce }).sends;
    if (opts.dryRun) {
      for (const line of sends) s.out(line);
      return 0;
    }
    s.nonceWrite(as, pane.paneId, nonce);
    for (const line of sends) s.send(pane.paneId, line);
    return 0;
  }

  if (opts.mode === "resume") {
    const sends = planSends({ command: "resume" }).sends;
    for (const line of sends) {
      if (opts.dryRun) s.out(line);
      else s.send(pane.paneId, line);
    }
    return 0;
  }

  // `--dry-run` goes through the SAME gate rather than around it. Printing
  // `/compact` unconditionally would tell an operator the command is ready when
  // the real one would refuse — an absent or mismatched nonce exits 1 and sends
  // nothing (AC-19), and a dry run that cannot show that refusal is worse than
  // no dry run at all. What it must not do is CONSUME: reading and comparing
  // the record is the gate, spending it is the side effect, so the dry run gets
  // a no-op consume and a send that prints.
  const result = runCompact({
    store: {
      read: () => s.nonceRead(as, pane.paneId),
      consume: opts.dryRun ? (): void => {} : (): void => s.nonceConsume(as, pane.paneId),
    },
    // Re-READ at authorization time, not the value captured at line 426. The
    // captured one is still correct for `--checkpoint`'s collision check, but
    // authorizing `/compact` against it lets a marker that changed during the
    // command through (AC-19, diff round 1 finding 3).
    markerNonce: () => {
      const now = s.marker(pane.cwd);
      return typeof now?.["checkpointNonce"] === "string" ? now["checkpointNonce"] : null;
    },
    send: (text) => {
      if (opts.dryRun) s.out(text);
      else s.send(pane.paneId, text);
    },
    // Revalidated a second time at the moment of the send, per §5.2.
    revalidate: () => {
      // Revalidation must OBSERVE AGAIN, so it takes a fresh cache rather than
      // the one the first classification filled.
      const fresh = observe(pane, roster, as, s, cacheOf(s));
      return fresh.verdict === report.verdict
        ? { ok: true }
        : {
            ok: false,
            message: refuse({ kind: "stale-verdict", was: report.verdict, now: fresh.verdict })
              .message,
          };
    },
  });
  if (result.message !== "") s.out(result.message);
  return result.exitCode;
}

// ---------------------------------------------------------------------------
// The real surface. Only this half spawns anything.
// ---------------------------------------------------------------------------

const PURVIEW_DIR = join(homedir(), ".claude", "pane-purview");
const NONCE_DIR = join(homedir(), ".claude", "pane-nonces");

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
      sh("herdr", ["agent", "send", target, text]);
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
            const r = JSON.parse(line) as CorpusRow;
            rows.push(r);
          } catch {
            // A malformed corpus line is skipped, not guessed at.
          }
        }
      }
      return rows;
    },
    now: () => Date.now(),
    random: () => Math.random().toString(36).slice(2, 12),
    out: (line) => process.stdout.write(`${line}\n`),
    nonceRead: (sessionId, paneId) => {
      const body = readJson(join(NONCE_DIR, `${sessionId}.json`)) as Record<string, string> | null;
      return body?.[paneId] ?? null;
    },
    nonceWrite: (sessionId, paneId, nonce) => {
      mkdirSync(NONCE_DIR, { recursive: true });
      const path = join(NONCE_DIR, `${sessionId}.json`);
      const body = (readJson(path) as Record<string, string> | null) ?? {};
      body[paneId] = nonce;
      writeFileSync(path, JSON.stringify(body, null, 2));
    },
    nonceConsume: (sessionId, paneId) => {
      const path = join(NONCE_DIR, `${sessionId}.json`);
      const body = readJson(path) as Record<string, string> | null;
      if (body === null) return;
      delete body[paneId];
      if (Object.keys(body).length === 0) rmSync(path, { force: true });
      else writeFileSync(path, JSON.stringify(body, null, 2));
    },
  };
}

/* c8 ignore start — the entry guard runs only as a process, never under vitest */
if (process.argv[1]?.endsWith("pane-compaction.ts") === true) {
  process.exitCode = main(process.argv.slice(2), realSurface());
}
/* c8 ignore stop */
