import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_MIN_AGE_SECONDS, type Decision, classify } from "../lib/heavyReap/classify";
import { PS_TIMEOUT_MS, collect, psBinFromEnv } from "../lib/heavyReap/collect";

export type Flags = { kill: boolean; all: boolean; quiet: boolean };

export function parseFlags(argv: readonly string[]): Flags {
  return {
    kill: argv.includes("--kill"),
    all: argv.includes("--all"),
    quiet: argv.includes("--quiet"),
  };
}

export type Ceiling = { seconds: number; source: "default" | "env"; rejected?: string };

export function readCeiling(raw: string | undefined): Ceiling {
  if (raw === undefined) return { seconds: DEFAULT_MIN_AGE_SECONDS, source: "default" };
  const n = Number(raw);
  if (raw.trim().length === 0 || !Number.isInteger(n) || n <= 0) {
    return { seconds: DEFAULT_MIN_AGE_SECONDS, source: "default", rejected: raw };
  }
  return { seconds: n, source: "env" };
}

/** Root first, then its recorded descendants (spec §4.4, the kill-order note under K2). */
export function planTargets(
  decisions: readonly Decision[],
  rows: readonly { pid: number; ppid: number | null }[],
): number[] {
  const children = new Map<number, number[]>();
  for (const r of rows) {
    if (r.ppid === null) continue;
    const list = children.get(r.ppid);
    if (list) list.push(r.pid);
    else children.set(r.ppid, [r.pid]);
  }
  const out: number[] = [];
  const seen = new Set<number>();
  for (const d of decisions) {
    if (!("pid" in d) || d.reap !== true) continue;
    const queue = [d.pid];
    while (queue.length > 0) {
      const pid = queue.shift();
      if (pid === undefined || seen.has(pid)) continue;
      seen.add(pid);
      out.push(pid);
      queue.push(...(children.get(pid) ?? []));
    }
  }
  return out;
}

export type TargetIdentity = { pid: number; startedAt: string; command: string };

/**
 * Tri-state on purpose: "gone" and "unreadable" must never collapse. K1 is an ordinary outcome,
 * while an identity read that FAILED is a reason not to signal at all.
 */
export type IdentityRead =
  | { state: "read"; identity: TargetIdentity }
  | { state: "gone" }
  | { state: "unreadable"; detail: string };

export type KillOutcome = {
  pid: number;
  result: "killed" | "already-gone" | "failed" | "partial" | "identity-changed" | "identity-unreadable";
  detail?: string;
};

export type KillDeps = {
  /**
   * The PLAN-TIME read, kept as the full IdentityRead rather than a bare identity.
   *
   * Storing only the successful reads loses the difference between "we never read it" and "we read
   * it and it was gone/unreadable", and the outcome would then be decided by the SECOND read
   * alone: an initial K6 followed by a successful read would report `identity-changed`, and one
   * followed by a gone would report `already-gone` with exit 0. K6 must survive.
   */
  identityAtPlan: ReadonlyMap<number, IdentityRead>;
  readIdentity: (pid: number) => IdentityRead;
  kill: (pid: number) => void;
  stillAlive: (pid: number) => boolean;
};

const isEsrch = (e: unknown): boolean => (e as { code?: string }).code === "ESRCH";

export function executeKills(targets: readonly number[], deps: KillDeps): KillOutcome[] {
  const outcomes: KillOutcome[] = [];
  const signalled: number[] = [];
  for (const pid of targets) {
    const planned = deps.identityAtPlan.get(pid);
    // A plan-time read that FAILED is K6 on its own terms; the second read cannot rehabilitate it.
    if (planned !== undefined && planned.state === "unreadable") {
      outcomes.push({ pid, result: "identity-unreadable", detail: planned.detail });
      continue;
    }
    if (planned !== undefined && planned.state === "gone") {
      outcomes.push({ pid, result: "already-gone" });
      continue;
    }
    const now = deps.readIdentity(pid);
    if (now.state === "gone") {
      outcomes.push({ pid, result: "already-gone" });
      continue;
    }
    if (now.state === "unreadable") {
      outcomes.push({ pid, result: "identity-unreadable", detail: now.detail });
      continue;
    }
    if (
      planned === undefined ||
      planned.state !== "read" ||
      planned.identity.startedAt !== now.identity.startedAt ||
      planned.identity.command !== now.identity.command
    ) {
      outcomes.push({ pid, result: "identity-changed" });
      continue;
    }
    try {
      deps.kill(pid);
      signalled.push(pid);
    } catch (e) {
      // K1: the target can exit between the identity read and the signal; ESRCH is that race,
      // and it is an ordinary outcome rather than a failure.
      if (isEsrch(e)) outcomes.push({ pid, result: "already-gone" });
      else outcomes.push({ pid, result: "failed", detail: String((e as { code?: string }).code ?? e) });
    }
  }
  for (const pid of signalled) {
    outcomes.push(deps.stillAlive(pid) ? { pid, result: "partial" } : { pid, result: "killed" });
  }
  return outcomes.sort((a, b) => targets.indexOf(a.pid) - targets.indexOf(b.pid));
}

/**
 * §6.2's reporting rule for one kill outcome, as a function so the whole matrix is observable.
 *
 * Inline in `main` it was reachable only through cases that could FORCE each outcome end to end,
 * and K3, K4 and K6 cannot be forced without breaking a real `kill` - so an implementation that
 * suppressed one of them passed every case (plan round 13). `--quiet` drops the two plain
 * successes and nothing else.
 */
export function shouldPrintOutcome(result: KillOutcome["result"], quiet: boolean): boolean {
  if (!quiet) return true;
  return result !== "killed" && result !== "already-gone";
}

export function exitStatus(state: {
  collectFailed: boolean;
  ceilingRejected: boolean;
  outcomes: readonly KillOutcome[];
}): number {
  if (state.collectFailed || state.ceilingRejected) return 1;
  return state.outcomes.some((o) => o.result !== "killed" && o.result !== "already-gone") ? 1 : 0;
}

/** `ps -o lstart=,command= -p <pid>`: one bounded read per target, never for the whole table. */
export function readIdentity(pid: number, psBin: string = psBinFromEnv()): IdentityRead {
  let out: string;
  try {
    out = execFileSync(psBin, ["-o", "lstart=,command=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: PS_TIMEOUT_MS,
      // Same locale pin as the bulk read: `lstart` is `%c`, so its token count is locale-dependent
      // and the comparison would otherwise be against a differently-formatted string.
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
    }).trim();
  } catch (e) {
    const err = e as { status?: number; code?: string; message?: string };
    // ps exits 1 with NO OUTPUT for a pid that does not exist. Status 1 WITH output is a ps
    // error, and anything else is a read failure; both are K6 and must never be reported as a
    // gone process, which would signal nothing while claiming an ordinary success.
    // `gone` requires ps's exact "no such pid" shape: status 1 and NOTHING on either stream.
    // A diagnostic on EITHER channel is a ps error, so checking only stdout would classify a
    // stderr-only failure as gone and report an ordinary success having signalled nothing.
    const out = String((e as { stdout?: unknown }).stdout ?? "").trim();
    const errOut = String((e as { stderr?: unknown }).stderr ?? "").trim();
    if (err.status === 1 && out.length === 0 && errOut.length === 0) return { state: "gone" };
    return { state: "unreadable", detail: err.code ?? err.message ?? "ps failed" };
  }
  if (out.length === 0) return { state: "gone" };
  const tokens = out.split(/\s+/);
  return {
    state: "read",
    identity: { pid, startedAt: tokens.slice(0, 5).join(" "), command: tokens.slice(5).join(" ") },
  };
}

/** Sleep synchronously, so the verification re-scan can settle without going async. */
function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const exists = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means the process EXISTS but belongs to another user. Counting it dead would report a
    // kill that never happened.
    return (e as { code?: string }).code === "EPERM";
  }
};

/**
 * K4's verification, with a bounded settle.
 *
 * SIGKILL is asynchronous: the kernel tears the process down after `kill` returns, and a check
 * issued immediately can still see it. Without the retry the reaper reports `partial` for a target
 * it killed correctly, which is a false alarm and a false non-zero exit. Four 50 ms attempts cost
 * nothing when the process is already gone, because the first check returns.
 */
export function stillAlive(pid: number, attempts = 4, waitMs = 50): boolean {
  for (let i = 0; i < attempts; i += 1) {
    if (!exists(pid)) return false;
    if (i < attempts - 1) sleepMs(waitMs);
  }
  return true;
}

/** Ancestry of this process, so AC-4 can exempt it and everything above it. */
export function selfAncestry(
  selfPid: number,
  rows: readonly { pid: number; ppid: number | null }[],
): number[] {
  const byPid = new Map(rows.map((r) => [r.pid, r.ppid]));
  const out: number[] = [];
  const seen = new Set<number>([selfPid]);
  let cursor = byPid.get(selfPid) ?? null;
  while (cursor !== null && cursor > 1 && !seen.has(cursor)) {
    out.push(cursor);
    seen.add(cursor);
    cursor = byPid.get(cursor) ?? null;
  }
  return out;
}

export function main(argv: readonly string[], env: NodeJS.ProcessEnv): number {
  const flags = parseFlags(argv);
  const ceiling = readCeiling(env.FX_REAP_MIN_AGE_S);
  const say = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  // C4 short-circuits BEFORE collection: a rejected ceiling means the run was never configured,
  // so it must not read the table or signal anything.
  if (ceiling.rejected !== undefined) {
    say(`heavy-reap: FX_REAP_MIN_AGE_S rejected: ${ceiling.rejected}; nothing reaped`);
    return exitStatus({ collectFailed: false, ceilingRejected: true, outcomes: [] });
  }

  const world = collect();
  if (!world.ok) {
    say(`heavy-reap: cannot read the process table (${world.problem}: ${world.detail})`);
    return exitStatus({ collectFailed: true, ceilingRejected: false, outcomes: [] });
  }

  const parsed = world.rows.filter(
    (r): r is Extract<typeof r, { kind: "parsed" }> => r.kind === "parsed",
  );
  const result = classify(world.rows, {
    minAgeSeconds: ceiling.seconds,
    minAgeSource: ceiling.source,
    selfPid: process.pid,
    selfAncestry: selfAncestry(process.pid, parsed),
  });
  for (const note of result.configNotes) say(`heavy-reap: ${note}`);
  say(`heavy-reap: ${world.rows.length} rows read`);

  const candidates = result.decisions.filter((d) => d.reap === true);
  // §6.2: the DEFAULT reports every candidate and every declined process that is ORPHAN-SHAPED
  // (`ppid == 1`); `--all` adds the rest. Orphan-ness is a property of the row, not of the
  // decision, so it is looked up here rather than inferred from `because`.
  const ppidOf = new Map(parsed.map((r) => [r.pid, r.ppid]));
  for (const d of result.decisions) {
    if (d.reap === true) {
      say(`heavy-reap: REAPABLE pid=${d.pid} shape=${d.shape} age=${d.ageSeconds}s`);
      continue;
    }
    if (flags.quiet) continue; // --quiet suppresses DECLINES only
    if (!("pid" in d)) {
      if (flags.all) say(`heavy-reap: skip unparsable (${d.detail})`);
      continue;
    }
    if (flags.all || ppidOf.get(d.pid) === 1) say(`heavy-reap: skip ${d.pid} (${d.because})`);
  }
  say(`heavy-reap: ${candidates.length} candidate(s)`);

  if (!flags.kill) return exitStatus({ collectFailed: false, ceilingRejected: false, outcomes: [] });

  const targets = planTargets(result.decisions, parsed);
  // K2's classification-time identity comes from the ROW that was classified, not from a read
  // taken afterwards: a post-classification read binds to whatever owns the pid THEN, which is
  // exactly the window a recycled pid would slip through (plan round 9).
  const rowById = new Map(parsed.map((r) => [r.pid, r]));
  const identityAtPlan = new Map<number, IdentityRead>();
  for (const pid of targets) {
    const row = rowById.get(pid);
    identityAtPlan.set(
      pid,
      row === undefined || row.startedAt === null
        ? { state: "unreadable", detail: "no classification-time identity for this pid" }
        : { state: "read", identity: { pid, startedAt: row.startedAt, command: row.command } },
    );
  }
  const outcomes = executeKills(targets, {
    identityAtPlan,
    readIdentity: (pid) => readIdentity(pid),
    kill: (pid) => process.kill(pid, "SIGKILL"),
    stillAlive,
  });
  // §6.2: `--kill` reports one KillOutcome line per target. `--quiet` keeps only what an operator
  // must act on - K2, K3, K4, K6 - and drops BOTH plain successes, `killed` and `already-gone`.
  for (const o of outcomes) {
    if (!shouldPrintOutcome(o.result, flags.quiet)) continue;
    say(`heavy-reap: ${o.result} pid=${o.pid}${o.detail ? ` (${o.detail})` : ""}`);
  }
  return exitStatus({ collectFailed: false, ceilingRejected: false, outcomes });
}

if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), process.env);
}
