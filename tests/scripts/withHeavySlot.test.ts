/**
 * tests/scripts/withHeavySlot.test.ts — executable proof for the heavy-phase
 * concurrency semaphore (scripts/with-heavy-slot.py).
 *
 * Spec: docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md — §7 is
 * CANONICAL for every case body; the `describe` titles carry the §7 case numbers.
 *
 * Scaffolding contract (plan "Shared test scaffolding"):
 *  - Every case builds its OWN `mkdtemp` slot dir and passes it as
 *    `FX_HEAVY_SLOT_DIR`; the real `/tmp/fx-heavy-slots` is never touched.
 *  - `runWrapped` spawns the wrapper with a SANITIZED environment: every ambient
 *    `FX_HEAVY_*` (including `FX_HEAVY_SLOT_HELD`) is stripped before the case's own
 *    vars are applied. The closeout gate dogfoods this suite under `pnpm heavy`, so
 *    without the strip a test-spawned wrapper would inherit a LIVE outer marker,
 *    validate it, and pass through — every mutual-exclusion fixture silently vacuous.
 *    Cases therefore behave identically wrapped or unwrapped.
 *  - Assertions read child-written artifact files and the SPEC-CONTRACTED stderr
 *    lines (§4.5 runtime stderr contract), never incidental output.
 *  - Timing bounds derive from the case's own `FX_HEAVY_POLL_MS`;
 *    `FX_HEAVY_JITTER_PCT=0` wherever determinism is asserted.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";

const REPO_ROOT = process.cwd();
const WRAPPER = join(REPO_ROOT, "scripts", "with-heavy-slot.py");

const createdDirs: string[] = [];

/** A per-case slot dir. Never the production `/tmp/fx-heavy-slots`. */
function slotDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "fx-heavy-slot-test-"));
  createdDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * The strip is load-bearing, not hygiene: see the file header. Ambient
 * `FX_HEAVY_*` from an outer `pnpm heavy` would otherwise silently rewrite every
 * case's topology and reentrancy posture.
 */
function sanitizedEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("FX_HEAVY_")) continue;
    env[key] = value;
  }
  return { ...env, ...extra };
}

type Run = {
  child: ChildProcess;
  pid: number;
  stdout: () => string;
  stderr: () => string;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

function spawnRun(command: string, args: string[], env: Record<string, string>): Run {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: sanitizedEnv(env),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    out += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    err += chunk;
  });
  // `close` (not `exit`) so the stdio pipes are fully drained before the promise
  // settles — an assertion on the last stderr line is otherwise a race.
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  return { child, pid: child.pid ?? -1, stdout: () => out, stderr: () => err, exited };
}

/** Spawn `python3 scripts/with-heavy-slot.py [wrapperArgs] -- <argv>`. */
function runWrapped(env: Record<string, string>, argv: string[], wrapperArgs: string[] = []): Run {
  return spawnRun("python3", [WRAPPER, ...wrapperArgs, "--", ...argv], env);
}

/** The same child, with no wrapper in the chain — the premise probe's arm. */
function runUnwrapped(argv: string[]): Run {
  return spawnRun(argv[0]!, argv.slice(1), {});
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForStderr(run: Run, needle: string, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (run.stderr().includes(needle)) return Date.now();
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for stderr ${JSON.stringify(needle)}.\n` +
          `stderr so far:\n${run.stderr()}`,
      );
    }
    await sleep(20);
  }
}

async function waitUntil(
  label: string,
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() >= deadline)
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
    await sleep(20);
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * The overlap oracle. Children append `start:<tag>:<ms>` / `end:<tag>:<ms>` to one
 * shared log; `O_APPEND` writes of this size are atomic, so line interleaving
 * cannot corrupt a record.
 */
const LOG_WINDOW_JS = `
const fs = require("node:fs");
const [tag, log, ms] = process.argv.slice(1);
fs.appendFileSync(log, "start:" + tag + ":" + Date.now() + "\\n");
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(ms));
fs.appendFileSync(log, "end:" + tag + ":" + Date.now() + "\\n");
`;

type Window = { start: number; end: number };

function windows(logPath: string): Map<string, Window> {
  const found = new Map<string, Window>();
  let raw = "";
  try {
    raw = readFileSync(logPath, "utf8");
  } catch {
    return found;
  }
  for (const line of raw.split("\n")) {
    const match = /^(start|end):([^:]+):(\d+)$/.exec(line.trim());
    if (!match) continue;
    const [, kind, tag, stamp] = match;
    const entry = found.get(tag!) ?? { start: Number.NaN, end: Number.NaN };
    if (kind === "start") entry.start = Number(stamp);
    else entry.end = Number(stamp);
    found.set(tag!, entry);
  }
  return found;
}

function overlaps(a: Window | undefined, b: Window | undefined): boolean {
  if (!a || !b) return false;
  if ([a.start, a.end, b.start, b.end].some((n) => !Number.isFinite(n))) return false;
  return a.start < b.end && b.start < a.end;
}

function logWindowArgs(tag: string, log: string, holdMs: number): string[] {
  return [process.execPath, "-e", LOG_WINDOW_JS, tag, log, String(holdMs)];
}

/** A node command that occupies its slot until killed. */
function sleeperArgs(ms: number, extra: string[] = []): string[] {
  return [
    process.execPath,
    "-e",
    `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${ms})`,
    ...extra,
  ];
}

/** Occupy a slot and return only once the wrapper says so. */
async function holdSlot(env: Record<string, string>, extra: string[] = []): Promise<Run> {
  const run = runWrapped(env, sleeperArgs(60_000, extra));
  await waitForStderr(run, "acquired slot-", 20_000);
  return run;
}

function configSlots(dir: string): number {
  return Number(JSON.parse(readFileSync(join(dir, "config"), "utf8")).slots);
}

// ---------------------------------------------------------------------------

describe("spec §7 case 1 — mutual exclusion (premise-carrying)", () => {
  it("serializes two wrapped commands at slots=1, and the fixture can see overlap", async () => {
    const dir = slotDir();
    const holdMs = 900;

    // Premise arm: the IDENTICAL two children, unwrapped, must overlap. If they do
    // not, the fixture cannot observe overlap at all and the wrapped assertion
    // below proves nothing.
    const premiseLog = join(dir, "premise.log");
    const pa = runUnwrapped(logWindowArgs("a", premiseLog, holdMs));
    const pb = runUnwrapped(logWindowArgs("b", premiseLog, holdMs));
    await Promise.all([pa.exited, pb.exited]);
    const premiseWindows = windows(premiseLog);
    premiseHolds(
      "unwrapped children overlap — the overlap oracle is blind otherwise",
      overlaps(premiseWindows.get("a"), premiseWindows.get("b")),
    );

    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: "100" };
    const log = join(dir, "wrapped.log");
    const wa = runWrapped(env, logWindowArgs("a", log, holdMs));
    const wb = runWrapped(env, logWindowArgs("b", log, holdMs));
    const [ra, rb] = await Promise.all([wa.exited, wb.exited]);
    expect(ra.code).toBe(0);
    expect(rb.code).toBe(0);

    const got = windows(log);
    expect(got.get("a")).toBeDefined();
    expect(got.get("b")).toBeDefined();
    expect(overlaps(got.get("a"), got.get("b"))).toBe(false);
  }, 60_000);
});

describe("spec §7 case 2 — crash release", () => {
  it("releases the slot on SIGKILL with no cleanup, inside the jitter-aware bound", async () => {
    const dir = slotDir();
    const pollMs = 500;
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: String(pollMs) };

    const holder = runWrapped(env, [
      process.execPath,
      "-e",
      "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000)",
    ]);
    await waitForStderr(holder, "acquired slot-", 20_000);

    const waiter = runWrapped(env, [process.execPath, "-e", "process.exit(0)"]);
    // The waiter must be genuinely blocked before the kill, else the measurement
    // times its own startup rather than the release.
    await sleep(pollMs);
    premiseHolds(
      "waiter is still blocked when the holder is killed",
      !waiter.stderr().includes("acquired slot-"),
    );

    const killedAt = Date.now();
    holder.child.kill("SIGKILL");
    const acquiredAt = await waitForStderr(waiter, "acquired slot-", 20_000);
    await waiter.exited;

    // §7 case 2: within poll × 1.2 (jitter) + 2000 ms (spawn latency).
    expect(acquiredAt - killedAt).toBeLessThanOrEqual(pollMs * 1.2 + 2000);
  }, 60_000);
});

describe("spec §7 case 3 — exit-code and argv transparency", () => {
  it("propagates the command's exit code", async () => {
    const dir = slotDir();
    const run = runWrapped({ FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1" }, [
      process.execPath,
      "-e",
      "process.exit(7)",
    ]);
    const { code } = await run.exited;
    expect(code).toBe(7);
  }, 30_000);

  it("passes argv through intact, including arguments containing spaces", async () => {
    const dir = slotDir();
    const run = runWrapped({ FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1" }, [
      process.execPath,
      "-e",
      "console.log(JSON.stringify(process.argv.slice(1)))",
      "hello world",
      "--flag=a b",
      "-- literal",
    ]);
    const { code } = await run.exited;
    expect(code).toBe(0);
    expect(JSON.parse(run.stdout().trim())).toEqual(["hello world", "--flag=a b", "-- literal"]);
  }, 30_000);
});

describe("spec §7 case 4 — descendant lock-lifetime pin (§4.0 P3 / §4.2)", () => {
  it("frees the slot when the wrapped parent exits, even with a detached child still alive", async () => {
    const dir = slotDir();
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: "100" };
    const pidFile = join(dir, "orphan.pid");
    const orphanJs =
      "const fs=require('node:fs');" +
      "fs.writeFileSync(process.argv[1],String(process.pid));" +
      "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,15000);";
    const parentJs =
      "const {spawn}=require('node:child_process');" +
      "const c=spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{detached:true,stdio:'ignore'});" +
      "c.unref();";

    const parent = runWrapped(env, [process.execPath, "-e", parentJs, orphanJs, pidFile]);
    expect((await parent.exited).code).toBe(0);

    await waitUntil(
      "the detached orphan to record its pid",
      () => {
        try {
          return readFileSync(pidFile, "utf8").trim().length > 0;
        } catch {
          return false;
        }
      },
      10_000,
    );
    const orphanPid = Number(readFileSync(pidFile, "utf8").trim());

    premiseHolds(
      "the detached child outlives its wrapped parent — otherwise nothing could have retained the lock",
      alive(orphanPid),
    );

    const next = runWrapped(env, [process.execPath, "-e", "process.exit(0)"]);
    const { code } = await next.exited;
    expect(next.stderr()).toContain("acquired slot-");
    expect(code).toBe(0);

    // Housekeeping: the orphan sleeps 15 s and would otherwise outlive the run.
    if (alive(orphanPid)) process.kill(orphanPid, "SIGKILL");
  }, 60_000);
});

describe("spec §7 case 6 — disable hatch", () => {
  it("FX_HEAVY_DISABLE=1 execs directly, so two slots=1 commands overlap", async () => {
    const dir = slotDir();
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_DISABLE: "1" };
    const log = join(dir, "disabled.log");
    const a = runWrapped(env, logWindowArgs("a", log, 900));
    const b = runWrapped(env, logWindowArgs("b", log, 900));
    const [ra, rb] = await Promise.all([a.exited, b.exited]);
    expect(ra.code).toBe(0);
    expect(rb.code).toBe(0);

    const got = windows(log);
    expect(overlaps(got.get("a"), got.get("b"))).toBe(true);
  }, 60_000);
});

describe("spec §7 case 7 — metadata surfacing and secret absence", () => {
  it("names the holder's pid in the first-wait warning when metadata is intact", async () => {
    const dir = slotDir();
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: "100" };
    const holder = await holdSlot(env);
    try {
      const waiter = runWrapped(env, [process.execPath, "-e", "process.exit(0)"]);
      await waitForStderr(waiter, `pid=${holder.pid}`, 15_000);
      expect(waiter.stderr()).toContain("waiting: slot-0 held by");
      waiter.child.kill("SIGKILL");
      await waiter.exited;
    } finally {
      holder.child.kill("SIGKILL");
      await holder.exited;
    }
  }, 60_000);

  it("reports `holder unknown (metadata unreadable)` for torn slot content, never silence", async () => {
    const dir = slotDir();
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: "100" };
    const holder = await holdSlot(env);
    try {
      // Advisory locks do not block writes: the test corrupts the metadata the
      // holder published, through its own fd, while the lock stays held.
      writeFileSync(join(dir, "slot-0"), "{{{ not json at all");

      const waiter = runWrapped(env, [process.execPath, "-e", "process.exit(0)"]);
      await waitForStderr(waiter, "holder unknown (metadata unreadable)", 15_000);
      waiter.child.kill("SIGKILL");
      await waiter.exited;
    } finally {
      holder.child.kill("SIGKILL");
      await holder.exited;
    }
  }, 60_000);

  it("records the basename and argc only — a token-shaped argument reaches neither the slot file nor stderr", async () => {
    const dir = slotDir();
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: "100" };
    const sentinel = "hunter2-sentinel";
    // `--` stops node's own option parsing, so the token reaches the child as a
    // plain argv entry rather than a rejected node flag.
    const holder = await holdSlot(env, ["--", `--token=${sentinel}`]);
    try {
      const slotRaw = readFileSync(join(dir, "slot-0"), "utf8");
      expect(slotRaw).not.toContain(sentinel);
      const metadata: unknown = JSON.parse(slotRaw);
      expect(metadata).toMatchObject({ pid: holder.pid, cmd: "node", argc: 5 });

      const waiter = runWrapped(env, [process.execPath, "-e", "process.exit(0)"]);
      await waitForStderr(waiter, "waiting: slot-0 held by", 15_000);
      expect(waiter.stderr()).not.toContain(sentinel);
      expect(waiter.stderr()).toContain("cmd=node");
      waiter.child.kill("SIGKILL");
      await waiter.exited;
    } finally {
      holder.child.kill("SIGKILL");
      await holder.exited;
    }
  }, 60_000);
});

describe("spec §7 case 8 — knob domains", () => {
  const OK = [process.execPath, "-e", "process.exit(0)"];

  it.each([
    ["banana", "a non-integer"],
    ["0", "below the domain — an empty acquire loop would wait forever"],
    ["65", "above the domain — an env-side cap defeat is the point of this arm"],
  ])(
    "FX_HEAVY_SLOTS=%s warns and falls back to 2 (%s)",
    async (value) => {
      const dir = slotDir();
      const run = runWrapped({ FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: value }, OK);
      expect((await run.exited).code).toBe(0);
      expect(run.stderr()).toContain("FX_HEAVY_SLOTS");
      expect(run.stderr()).toContain(value);
      expect(configSlots(dir)).toBe(2);
    },
    30_000,
  );

  it("FX_HEAVY_SLOTS=64 is accepted at the boundary with no warning", async () => {
    const dir = slotDir();
    const run = runWrapped({ FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "64" }, OK);
    expect((await run.exited).code).toBe(0);
    expect(run.stderr()).not.toContain("FX_HEAVY_SLOTS");
    expect(configSlots(dir)).toBe(64);
  }, 30_000);

  it("FX_HEAVY_DISABLE=true warns, names the expected value, and keeps locking ACTIVE", async () => {
    const dir = slotDir();
    const env = {
      FX_HEAVY_SLOT_DIR: dir,
      FX_HEAVY_SLOTS: "1",
      FX_HEAVY_POLL_MS: "100",
      FX_HEAVY_DISABLE: "true",
    };
    const log = join(dir, "typo-disable.log");
    const a = runWrapped(env, logWindowArgs("a", log, 900));
    const b = runWrapped(env, logWindowArgs("b", log, 900));
    await Promise.all([a.exited, b.exited]);

    expect(a.stderr()).toContain("FX_HEAVY_DISABLE");
    expect(a.stderr()).toContain("'1'");
    const got = windows(log);
    expect(overlaps(got.get("a"), got.get("b"))).toBe(false);
  }, 60_000);

  it("FX_HEAVY_WAIT_WARN_S=banana warns and falls back to 300", async () => {
    const dir = slotDir();
    const run = runWrapped({ FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_WAIT_WARN_S: "banana" }, OK);
    expect((await run.exited).code).toBe(0);
    expect(run.stderr()).toMatch(/FX_HEAVY_WAIT_WARN_S:.*banana.*300/);
  }, 30_000);

  it("FX_HEAVY_JITTER_PCT=99 warns and falls back to 20", async () => {
    const dir = slotDir();
    const run = runWrapped({ FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_JITTER_PCT: "99" }, OK);
    expect((await run.exited).code).toBe(0);
    expect(run.stderr()).toMatch(/FX_HEAVY_JITTER_PCT:.*99.*20/);
  }, 30_000);

  it("FX_HEAVY_POLL_MS=0 warns and falls back to 3000 rather than busy-spinning", async () => {
    const dir = slotDir();
    const run = runWrapped({ FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_POLL_MS: "0" }, OK);
    expect((await run.exited).code).toBe(0);
    expect(run.stderr()).toMatch(/FX_HEAVY_POLL_MS:.*3000/);
  }, 30_000);

  it("FX_HEAVY_PRIORITY=true warns, names the expected value, and takes NO priority behavior", async () => {
    const dir = slotDir();
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: "100" };
    const holder = await holdSlot(env);
    try {
      const waiter = runWrapped({ ...env, FX_HEAVY_PRIORITY: "true" }, OK);
      await waitForStderr(waiter, "waiting: slot-0 held by", 15_000);
      expect(waiter.stderr()).toContain("FX_HEAVY_PRIORITY");
      expect(waiter.stderr()).toContain("'1'");
      // The marker is the priority mechanism's only artifact; a typo must not
      // create one. Discriminating from Task 4 on, when markers begin to exist.
      expect(readdirSync(dir).filter((name) => name.startsWith("prio-wait-"))).toEqual([]);
      waiter.child.kill("SIGKILL");
      await waiter.exited;
    } finally {
      holder.child.kill("SIGKILL");
      await holder.exited;
    }
  }, 60_000);
});
