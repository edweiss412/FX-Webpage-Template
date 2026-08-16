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
  type Verdict,
  checkExitCode,
  classify,
  classifyGh,
  mintNonce,
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
  /** The agent label — the arc name. null when the pane carries none. */
  agentName: string | null;
  cwd: string;
  status: string;
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
 */
export function rejectedFieldOf(opts: {
  status: string;
  tenths: number | null;
  marker: Record<string, unknown> | null;
}): string | null {
  if (!STATUSES.has(opts.status)) return `agent_status=${opts.status}`;
  if (opts.tenths === null) return "ctx gauge";
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

/** One pane, observed through the surface and classified by the core. */
function observe(
  pane: RosterPane,
  roster: RosterPane[],
  asSessionId: string | null,
  s: Surface,
): PaneReport {
  const marker = s.marker(pane.cwd);
  const tenths = parseGauge(s.screen(pane.paneId));
  const rejectedField = rejectedFieldOf({ status: pane.status, tenths, marker });

  const ghRun = s.gh(pane.cwd);
  const ghOutcome = classifyGh(ghRun);
  const git = s.git(pane.cwd);
  const position = positionFor({
    now: s.now(),
    clean: git.clean,
    lastCommitAt: git.lastCommitAt,
    pr: prFrom(ghRun),
    corpus: s.corpus(pane.agentName),
  });

  const ownership = resolveOwnership(pane.paneId, pane.agentName, s.purview(), asSessionId ?? "");
  const markerSession = typeof marker?.["sessionId"] === "string" ? marker["sessionId"] : null;
  const blockedOn = typeof marker?.["blockedOn"] === "string" ? marker["blockedOn"] : "";

  const observed: ObservedPane = {
    paneId: pane.paneId,
    branch: pane.agentName,
    duplicateName:
      pane.agentName !== null && roster.filter((r) => r.agentName === pane.agentName).length > 1,
    status: (STATUSES.has(pane.status) ? pane.status : "unknown") as ObservedPane["status"],
    owned: ownership.kind === "owned",
    contested: ownership.kind === "contested",
    rejectedField,
    // Absence is never read as mismatch (§4.5 rule 5 no-ops rather than firing).
    sessionMismatch:
      asSessionId !== null && markerSession !== null && markerSession !== asSessionId,
    ghFault: ghOutcome.kind === "fault",
    blockedOn,
    tenths,
    position: position.cost,
  };

  const c = classify(observed);
  return {
    paneId: pane.paneId,
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
      i += 1;
      out.as = argv[i] ?? null;
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

  const roster = s.roster();

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
    const pane = roster.find((r) => r.paneId === target || r.agentName === target);
    if (pane === undefined) {
      s.out(refuse({ kind: "unresolvable-target", target }).message);
      return 1;
    }
    return drive(opts, pane, roster, s);
  }

  const panes = roster.map((p) => observe(p, roster, opts.as, s));
  if (opts.json) {
    s.out(JSON.stringify(reportEnvelope(panes, []), null, 2));
  } else {
    for (const p of panes) s.out(renderRow(p));
  }
  return opts.mode === "check" ? checkExitCode(panes) : 0;
}

/** The three one-shot commands, each revalidating on its own predicate (§5.2). */
function drive(opts: Parsed, pane: RosterPane, roster: RosterPane[], s: Surface): number {
  const as = opts.as ?? "";
  const report = observe(pane, roster, as, s);
  const marker = s.marker(pane.cwd);
  const markerNonce =
    typeof marker?.["checkpointNonce"] === "string" ? marker["checkpointNonce"] : null;

  // `--resume` has its own predicate: a successful compaction makes
  // COMPACT/FORCE false exactly when resuming is correct, so it asks only that
  // no rule 1-8 observation says stop.
  const drivable: Verdict[] = ["COMPACT", "FORCE", "HOLD", "WAIT"];
  const blockedByObservation = !drivable.includes(report.verdict);
  if (blockedByObservation) {
    s.out(refuse({ kind: "not-drivable", verdict: report.verdict }).message);
    return 1;
  }
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

  if (opts.dryRun) {
    for (const line of planSends({ command: "compact" }).sends) s.out(line);
    return 0;
  }
  const result = runCompact({
    store: {
      read: () => s.nonceRead(as, pane.paneId),
      consume: () => s.nonceConsume(as, pane.paneId),
    },
    markerNonce,
    send: (text) => s.send(pane.paneId, text),
    // Revalidated a second time at the moment of the send, per §5.2.
    revalidate: () => {
      const fresh = observe(pane, roster, as, s);
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

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function realSurface(): Surface {
  return {
    roster: () => {
      const run = sh("herdr", ["pane", "list"]);
      const parsed = JSON.parse(run.stdout) as {
        result?: { panes?: Array<Record<string, unknown>> };
      };
      const panes = parsed.result?.panes ?? [];
      // The arc name is the pane's `label` — probed against `herdr pane list`,
      // whose entries carry no `name` key at all (that is `herdr agent list`).
      // AGENTS.md's Stage 0 sets the pane label and the agent name to the same
      // branch string, so the pane-oriented roster reads the pane-side one.
      // An empty label is ABSENT, not the empty arc: null makes rule 1 fire and
      // the pane report NOT-AN-ARC rather than being classified on a blank name.
      return panes.map((p) => {
        const label = typeof p["label"] === "string" ? p["label"].trim() : "";
        return {
          paneId: String(p["pane_id"] ?? ""),
          agentName: label === "" ? null : label,
          cwd: String(p["cwd"] ?? ""),
          status: String(p["agent_status"] ?? "unknown"),
        };
      });
    },
    screen: (paneId) => sh("herdr", ["pane", "read", paneId, "--source", "visible"]).stdout,
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
    marker: (cwd) =>
      readJson(join(cwd, ".claude", "ship-state.json")) as Record<string, unknown> | null,
    git: (cwd) => {
      const status = sh("git", ["status", "--porcelain"], cwd);
      const at = sh("git", ["log", "-1", "--format=%ct"], cwd);
      const secs = Number(at.stdout.trim());
      return {
        clean: status.exitCode === 0 && status.stdout.trim() === "",
        lastCommitAt: Number.isFinite(secs) && secs > 0 ? secs * 1000 : null,
      };
    },
    gh: (cwd) => sh("gh", ["pr", "checks", "--json", "bucket"], cwd),
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
