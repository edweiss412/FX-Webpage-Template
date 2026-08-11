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
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
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
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("FX_HEAVY_")) delete env[key];
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
    // Synchronize on the waiter's OWN first-wait line rather than a wall-clock
    // sleep: interpreter boot varies by an order of magnitude between a quiet
    // dev box and a 2-core CI runner, and a sleep-based barrier silently
    // degrades into measuring that boot instead of the release.
    await waitForStderr(waiter, "waiting for a heavy slot", 20_000);
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

// --- Task 3 shared oracles ------------------------------------------------

/** `python3 scripts/with-heavy-slot.py --recreate --slots N` — no `--`, no command. */
function runRecreate(env: Record<string, string>, args: string[]): Run {
  return spawnRun("python3", [WRAPPER, "--recreate", ...args], env);
}

function slotFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => /^slot-\d+$/.test(name))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
}

function tmpResidue(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.startsWith("config.tmp."));
}

/** Byte-level dir identity — the oracle for "a rejected management command changed nothing". */
function dirSnapshot(dir: string): string {
  return readdirSync(dir)
    .sort()
    .map((name) => `${name}:${readFileSync(join(dir, name)).toString("hex")}`)
    .join("\n");
}

/** The `swap begin/end <monotonic-ns>` pair the recreator brackets its swap with. */
function swapWindow(stderr: string): { begin: bigint; end: bigint } | null {
  const begin = /^swap begin (\d+)$/m.exec(stderr);
  const end = /^swap end (\d+)$/m.exec(stderr);
  if (!begin || !end) return null;
  return { begin: BigInt(begin[1]!), end: BigInt(end[1]!) };
}

/** Bootstrap a dir + config at N with a trivial wrapped run. */
async function bootstrapDir(dir: string, slots: number): Promise<void> {
  const run = runWrapped({ FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: String(slots) }, [
    process.execPath,
    "-e",
    "process.exit(0)",
  ]);
  const { code } = await run.exited;
  if (code !== 0) throw new Error(`bootstrap failed (${code}): ${run.stderr()}`);
}

describe("spec §7 case 9 — slot-count consistency", () => {
  it("adopts the dir-recorded count over its own preference (sequential arm)", async () => {
    const dir = slotDir();
    await bootstrapDir(dir, 3);
    expect(configSlots(dir)).toBe(3);

    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: "100" };
    const h0 = await holdSlot(env);
    const h1 = await holdSlot(env);
    try {
      // Observable adoption: an implementation that honoured its own
      // FX_HEAVY_SLOTS=1 would block behind the two live holders forever.
      const third = runWrapped(env, [process.execPath, "-e", "process.exit(0)"]);
      await waitForStderr(third, "acquired slot-2", 15_000);
      expect((await third.exited).code).toBe(0);
      expect(third.stderr()).toContain("config adopted (slots=3)");
    } finally {
      for (const holder of [h0, h1]) {
        holder.child.kill("SIGKILL");
        await holder.exited;
      }
    }
  }, 60_000);

  it("elects EXACTLY ONE config creator under a simultaneous first-boot race", async () => {
    const dir = slotDir();
    rmSync(dir, { recursive: true, force: true }); // no pre-existing dir: every racer is a candidate creator

    const desired = ["1", "2", "3", "4", "5", "6"];
    const runs = desired.map((slots) =>
      runWrapped({ FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: slots, FX_HEAVY_POLL_MS: "100" }, [
        process.execPath,
        "-e",
        "process.exit(0)",
      ]),
    );
    const results = await Promise.all(runs.map((run) => run.exited));
    for (const result of results) expect(result.code).toBe(0);

    const created = runs
      .map((run) => /^config created \(slots=(\d+)\)$/m.exec(run.stderr()))
      .filter((match): match is RegExpExecArray => match !== null);
    const adopted = runs
      .map((run) => /^config adopted \(slots=(\d+)\)$/m.exec(run.stderr()))
      .filter((match): match is RegExpExecArray => match !== null);

    // A last-writer-wins overwrite fails both of these: several processes would
    // report themselves the creator, and adopters would disagree about X.
    expect(created).toHaveLength(1);
    const electedSlots = Number(created[0]![1]);
    expect(adopted).toHaveLength(desired.length - 1);
    for (const match of adopted) expect(Number(match[1])).toBe(electedSlots);

    expect(configSlots(dir)).toBe(electedSlots);
    expect(tmpResidue(dir)).toEqual([]);
  }, 90_000);
});

describe("spec §7 case 11 — resize-race containment", () => {
  it("rejects a lock won on an orphaned inode when the swap keeps the same size", async () => {
    const dir = slotDir();
    await bootstrapDir(dir, 1);
    const base = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: "100" };
    const log = join(dir, "case11-identity.log");

    const waiter = runWrapped(
      { ...base, FX_HEAVY_TEST_HOLD_OPEN_MS: "1500" },
      logWindowArgs("waiter", log, 300),
    );
    // `config adopted` is emitted immediately before the acquire scan, so it
    // pins the moment the waiter is about to open slot-0. Swapping on a bare
    // wall-clock sleep instead would race interpreter boot: land the swap first
    // and the waiter opens the NEW inode, leaving nothing orphaned to reject.
    await waitForStderr(waiter, "config adopted", 20_000);
    await sleep(150);
    premiseHolds(
      "the waiter is still inside the injected open->flock window",
      !waiter.stderr().includes("acquired slot-"),
    );

    // Same name, same size, NEW inode: the index check (0 < 1) cannot see this.
    rmSync(join(dir, "slot-0"));
    closeSync(openSync(join(dir, "slot-0"), "w"));
    const holder = runWrapped(base, logWindowArgs("holder", log, 2500));
    let holderDone = false;
    void holder.exited.then(() => {
      holderDone = true;
    });
    await waitForStderr(holder, "acquired slot-", 15_000);

    await waitForStderr(waiter, "topology restart:", 20_000);
    premiseHolds(
      "the new-generation holder is still running when the orphan lock is rejected — " +
        "an already-finished holder could not overlap regardless of the rejection",
      !holderDone,
    );
    expect(waiter.stderr()).toContain("stale generation");

    await Promise.all([waiter.exited, holder.exited]);
    const got = windows(log);
    expect(got.get("holder")).toBeDefined();
    expect(got.get("waiter")).toBeDefined();
    expect(overlaps(got.get("waiter"), got.get("holder"))).toBe(false);
  }, 90_000);

  it("rejects a lock won on a slot the shrink removed", async () => {
    const dir = slotDir();
    await bootstrapDir(dir, 3);
    const base = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "3", FX_HEAVY_POLL_MS: "100" };
    const log = join(dir, "case11-shrink.log");

    const holder0 = runWrapped(base, logWindowArgs("holder", log, 4000));
    await waitForStderr(holder0, "acquired slot-0", 15_000);
    const holder1 = await holdSlot(base);
    let holder0Done = false;
    void holder0.exited.then(() => {
      holder0Done = true;
    });

    const waiter = runWrapped(
      { ...base, FX_HEAVY_TEST_HOLD_OPEN_MS: "1200" },
      logWindowArgs("waiter", log, 300),
    );
    // Scan order is slot-0, slot-1, slot-2 with a 1200 ms injected sleep before
    // each flock, so from `config adopted` the third window is [2400, 3600].
    // Anchoring on that line rather than on spawn keeps interpreter boot out of
    // the arithmetic; 2800 sits mid-window with ~400 ms of slack each way.
    await waitForStderr(waiter, "config adopted", 20_000);
    await sleep(2800);
    premiseHolds(
      "the waiter has not acquired before the shrink",
      !waiter.stderr().includes("acquired slot-"),
    );
    writeFileSync(join(dir, "config"), JSON.stringify({ slots: 1 }) + "\n");
    rmSync(join(dir, "slot-1"));
    rmSync(join(dir, "slot-2"));

    await waitForStderr(waiter, "topology restart:", 20_000);
    premiseHolds(
      "slot-0's holder is still running when the removed-slot lock is rejected",
      !holder0Done,
    );

    await Promise.all([waiter.exited, holder0.exited]);
    holder1.child.kill("SIGKILL");
    await holder1.exited;

    const got = windows(log);
    expect(got.get("holder")).toBeDefined();
    expect(got.get("waiter")).toBeDefined();
    expect(overlaps(got.get("waiter"), got.get("holder"))).toBe(false);
  }, 90_000);
});

describe("spec §7 case 13 — recreate discipline", () => {
  it("blocks on a live holder, surfaces it by name, and swaps only after it exits", async () => {
    const dir = slotDir();
    await bootstrapDir(dir, 1);
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: "100" };
    const log = join(dir, "case13-holder.log");

    const holder = runWrapped(env, logWindowArgs("holder", log, 2500));
    await waitForStderr(holder, "acquired slot-", 15_000);

    const recreate = runRecreate(env, ["--slots", "2"]);
    let recreateDone = false;
    void recreate.exited.then(() => {
      recreateDone = true;
    });
    await waitForStderr(recreate, "waiting: slot-0 held by", 15_000);
    expect(recreate.stderr()).toContain(`pid=${holder.pid}`);
    premiseHolds("the recreation is still blocked while the holder runs", !recreateDone);

    expect((await holder.exited).code).toBe(0);
    expect((await recreate.exited).code).toBe(0);

    expect(slotFiles(dir)).toEqual(["slot-0", "slot-1"]);
    expect(configSlots(dir)).toBe(2);
    expect(tmpResidue(dir)).toEqual([]);
  }, 90_000);

  it("serializes two recreators against each other, each holding the swap for its full delay", async () => {
    const dir = slotDir();
    await bootstrapDir(dir, 1);
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_POLL_MS: "100" };

    // Premise: an UNDELAYED recreation's swap is far shorter than the injected
    // delay, so two unserialized delayed swaps would necessarily overlap.
    const warmup = runRecreate(env, ["--slots", "1"]);
    expect((await warmup.exited).code).toBe(0);
    const warmupWindow = swapWindow(warmup.stderr());
    premiseHolds("the warm-up recreation emitted a swap window", warmupWindow !== null);
    const delayMs = 2000;
    premiseHolds(
      "an undelayed recreation completes its swap in well under the injected delay — " +
        "otherwise 'each window spans >= D' would hold without any serialization",
      Number(warmupWindow!.end - warmupWindow!.begin) < delayMs * 1_000_000,
    );

    const delayed = { ...env, FX_HEAVY_TEST_HOLD_OPEN_MS: String(delayMs) };
    const first = runRecreate(delayed, ["--slots", "2"]);
    const second = runRecreate(delayed, ["--slots", "3"]);
    const [r1, r2] = await Promise.all([first.exited, second.exited]);
    expect(r1.code).toBe(0);
    expect(r2.code).toBe(0);

    const w1 = swapWindow(first.stderr());
    const w2 = swapWindow(second.stderr());
    expect(w1).not.toBeNull();
    expect(w2).not.toBeNull();
    for (const window of [w1!, w2!]) {
      expect(Number(window.end - window.begin)).toBeGreaterThanOrEqual(delayMs * 1_000_000);
    }
    const disjoint = w1!.end <= w2!.begin || w2!.end <= w1!.begin;
    expect(disjoint).toBe(true);

    // The waiting line is the recreator-behind-recreator site's own oracle: a
    // blocking-flock mutant produces disjoint windows but never emits it.
    const later = w1!.begin < w2!.begin ? second : first;
    expect(later.stderr()).toContain("waiting: recreate.lock held");

    const lastTarget = w1!.end > w2!.end ? 2 : 3;
    expect(configSlots(dir)).toBe(lastTarget);
    expect(slotFiles(dir)).toEqual(Array.from({ length: lastTarget }, (_, i) => `slot-${i}`));
    expect(tmpResidue(dir)).toEqual([]);
  }, 120_000);

  it("excludes ordinary acquisition for the whole swap window, then admits it under the NEW generation", async () => {
    const dir = slotDir();
    await bootstrapDir(dir, 1);
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_POLL_MS: "100" };

    const recreate = runRecreate({ ...env, FX_HEAVY_TEST_HOLD_OPEN_MS: "3000" }, ["--slots", "4"]);
    await waitForStderr(recreate, "swap begin ", 15_000);

    const command = runWrapped(env, [process.execPath, "-e", "process.exit(0)"]);
    await waitForStderr(command, "waiting: recreation in progress", 15_000);

    // Ordering assertion in the test's own timeline — no cross-process clocks.
    while (!recreate.stderr().includes("swap end ")) {
      expect(command.stderr()).not.toContain("acquired slot-");
      await sleep(20);
    }

    expect((await recreate.exited).code).toBe(0);
    expect((await command.exited).code).toBe(0);
    expect(command.stderr()).toMatch(/^acquired slot-\d+ \(slots=4\)$/m);
  }, 90_000);

  it("survives a recreator killed mid-swap, and a later recreation converges on the exact slot set", async () => {
    const dir = slotDir();
    await bootstrapDir(dir, 5);
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_POLL_MS: "100" };
    // Materialize the full 0..4 generation: the acquire scan only ever creates
    // the slot it wins, and the residue this arm converges on must EXIST first.
    expect((await runRecreate(env, ["--slots", "5"]).exited).code).toBe(0);
    premiseHolds(
      "slot-0..slot-4 are present before the crash — an index-range enumeration " +
        "has no residue to leave behind otherwise",
      slotFiles(dir).join(",") === "slot-0,slot-1,slot-2,slot-3,slot-4",
    );

    const doomed = runRecreate({ ...env, FX_HEAVY_TEST_HOLD_OPEN_MS: "5000" }, ["--slots", "2"]);
    await waitForStderr(doomed, "swap begin ", 15_000);
    // `swap begin` precedes the config replace; the kill must land strictly
    // INSIDE the injected delay, which is exactly the state where the config
    // already reads the new count and the old slot files are all still present.
    await waitUntil("the swap to have replaced config", () => configSlots(dir) === 2, 15_000);
    doomed.child.kill("SIGKILL");
    await doomed.exited;

    // The swap replaced config BEFORE the delay, so a valid count is always
    // present — an absent config would let the next wrapper reseed the dir with
    // its own FX_HEAVY_SLOTS, silently losing the recorded capacity.
    expect(configSlots(dir)).toBe(2);

    const after = runWrapped({ ...env, FX_HEAVY_SLOTS: "9" }, [
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);
    expect((await after.exited).code).toBe(0);
    expect(after.stderr()).toContain("config adopted (slots=2)");
    expect(after.stderr()).not.toContain("config created");

    // 3 sits strictly between the recorded 2 and the old 5: an index-range
    // enumeration would leave slot-3 and slot-4 behind forever.
    const converge = runRecreate(env, ["--slots", "3"]);
    expect((await converge.exited).code).toBe(0);
    expect(slotFiles(dir)).toEqual(["slot-0", "slot-1", "slot-2"]);
    expect(configSlots(dir)).toBe(3);
    expect(tmpResidue(dir)).toEqual([]);
  }, 120_000);

  it.each([[[]], [["--slots", "0"]], [["--slots", "65"]], [["--slots", "banana"]]])(
    "rejects `--recreate %j` with exit 2 and a byte-identical dir",
    async (args: string[]) => {
      const dir = slotDir();
      await bootstrapDir(dir, 2);
      const before = dirSnapshot(dir);

      const run = runRecreate({ FX_HEAVY_SLOT_DIR: dir }, args);
      const { code } = await run.exited;
      expect(code).toBe(2);
      expect(run.stderr()).toContain("--slots");
      expect(dirSnapshot(dir)).toBe(before);
    },
    60_000,
  );

  it("accepts the boundary `--recreate --slots 64`", async () => {
    const dir = slotDir();
    await bootstrapDir(dir, 2);
    const run = runRecreate({ FX_HEAVY_SLOT_DIR: dir }, ["--slots", "64"]);
    expect((await run.exited).code).toBe(0);
    expect(slotFiles(dir)).toEqual(Array.from({ length: 64 }, (_, i) => `slot-${i}`));
    expect(configSlots(dir)).toBe(64);
    expect(tmpResidue(dir)).toEqual([]);
  }, 60_000);
});

// --- Task 4 shared fixtures --------------------------------------------------

/** Runs its argv as a command and merges the child's stderr into its own. */
const NESTED_JS = `
const { spawnSync } = require("node:child_process");
const argv = process.argv.slice(1);
const result = spawnSync(argv[0], argv.slice(1), { stdio: "inherit" });
process.exit(result.status ?? 1);
`;

/** Spawns its argv detached and exits, leaving an orphan that outlives it. */
const SPAWN_DETACHED_JS = `
const { spawn } = require("node:child_process");
const child = spawn(process.execPath, process.argv.slice(1), {
  detached: true,
  stdio: "ignore",
});
child.unref();
`;

const ORPHAN_CJS = `
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const [wrapper, innerScript, log, outDir] = process.argv.slice(2);
// Outlive the wrapped parent: the env marker is inherited, the slot fd is not.
// The delay must also outlast the test's own competing holder reaching its
// slot, which is a spawn the orphan cannot observe.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
const result = spawnSync("python3", [wrapper, "--", process.execPath, innerScript, log, outDir], {
  encoding: "utf8",
});
fs.writeFileSync(outDir + "/orphan.stderr", result.stderr || "");
fs.writeFileSync(outDir + "/orphan.status", String(result.status));
`;

const ORPHAN_INNER_CJS = `
const fs = require("node:fs");
const [log, outDir] = process.argv.slice(2);
fs.writeFileSync(outDir + "/orphan.marker", String(process.env.FX_HEAVY_SLOT_HELD));
fs.appendFileSync(log, "start:orphan:" + Date.now() + "\\n");
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
fs.appendFileSync(log, "end:orphan:" + Date.now() + "\\n");
`;

function priorityMarkers(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.startsWith("prio-wait-"));
}

describe("spec §7 case 5 — priority bias (marker mechanism)", () => {
  it(
    "hands the freed slot to the priority waiter, and the normal waiter says it yielded",
    // The ordering arm alone tolerates scheduler noise; the notice arm inside it
    // is timing-independent and would fail identically on every retry.
    { timeout: 90_000, retry: 2 },
    async () => {
      const dir = slotDir();
      const pollMs = 500;
      // EQUAL polls with jitter DISABLED: independent jitter could hand priority
      // the win with the marker logic deleted.
      const env = {
        FX_HEAVY_SLOT_DIR: dir,
        FX_HEAVY_SLOTS: "1",
        FX_HEAVY_POLL_MS: String(pollMs),
        FX_HEAVY_JITTER_PCT: "0",
      };
      const log = join(dir, "case5-order.log");
      const holder = await holdSlot(env);

      // Barrier premise: both waiters are established BEFORE the release, so the
      // ordering measures the bias rather than the start times.
      const normal = runWrapped(env, logWindowArgs("normal", log, 300));
      await waitForStderr(normal, "waiting for a heavy slot", 15_000);
      const priority = runWrapped(
        { ...env, FX_HEAVY_PRIORITY: "1" },
        logWindowArgs("prio", log, 300),
      );
      await waitForStderr(priority, "waiting for a heavy slot", 15_000);

      holder.child.kill("SIGKILL");
      await holder.exited;
      await Promise.all([normal.exited, priority.exited]);

      const got = windows(log);
      expect(got.get("prio")).toBeDefined();
      expect(got.get("normal")).toBeDefined();
      expect(got.get("prio")!.start).toBeLessThan(got.get("normal")!.start);
      // Timing-independent: the notice exists only if the marker mechanism ran,
      // so a marker-deletion implementation fails here whatever the schedule did.
      expect(normal.stderr()).toContain("yielding to priority waiter");
    },
  );

  it("refreshes the priority marker's mtime on every poll, not just at creation", async () => {
    const dir = slotDir();
    const pollMs = 400;
    const env = {
      FX_HEAVY_SLOT_DIR: dir,
      FX_HEAVY_SLOTS: "1",
      FX_HEAVY_POLL_MS: String(pollMs),
      FX_HEAVY_JITTER_PCT: "0",
    };
    const holder = await holdSlot(env);
    const priority = runWrapped({ ...env, FX_HEAVY_PRIORITY: "1" }, [
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);
    try {
      await waitForStderr(priority, "waiting for a heavy slot", 15_000);
      const markers = priorityMarkers(dir);
      expect(markers).toHaveLength(1);
      const marker = join(dir, markers[0]!);

      const first = statSync(marker).mtimeMs;
      await sleep(pollMs * 3);
      const second = statSync(marker).mtimeMs;
      // A create-once implementation lets an active waiter's marker age out of
      // the freshness window while it is still polling.
      expect(second).toBeGreaterThan(first);
    } finally {
      priority.child.kill("SIGKILL");
      await priority.exited;
      holder.child.kill("SIGKILL");
      await holder.exited;
    }
  }, 60_000);

  /**
   * Both halves plant a marker backdated 700 s and differ ONLY in the cadence the
   * marker declares. Freshness computed from the OBSERVER's own interval gives
   * the same answer to both, so the first half fails on such an implementation.
   */
  async function stderrOfWaiterBesideMarker(declaredPollMs: number): Promise<string> {
    const dir = slotDir();
    const env = {
      FX_HEAVY_SLOT_DIR: dir,
      FX_HEAVY_SLOTS: "1",
      FX_HEAVY_POLL_MS: "300",
      FX_HEAVY_JITTER_PCT: "0",
    };
    const holder = await holdSlot(env);
    const marker = join(dir, "prio-wait-999999");
    writeFileSync(marker, JSON.stringify({ pid: 999999, poll_ms: declaredPollMs }) + "\n");
    const backdated = Date.now() / 1000 - 700;
    utimesSync(marker, backdated, backdated);

    const waiter = runWrapped(env, [process.execPath, "-e", "process.exit(0)"]);
    try {
      await waitForStderr(waiter, "waiting for a heavy slot", 15_000);
      await sleep(1200);
      return waiter.stderr();
    } finally {
      waiter.child.kill("SIGKILL");
      await waiter.exited;
      holder.child.kill("SIGKILL");
      await holder.exited;
    }
  }

  it("treats a 400000 ms-cadence marker backdated 700 s as FRESH (window 800 s)", async () => {
    expect(await stderrOfWaiterBesideMarker(400_000)).toContain("yielding to priority waiter");
  }, 60_000);

  it("treats a 3000 ms-cadence marker backdated 700 s as STALE (600 s floor)", async () => {
    const stderr = await stderrOfWaiterBesideMarker(3000);
    premiseHolds(
      "the waiter genuinely waited beside the planted marker",
      stderr.includes("waiting for a heavy slot"),
    );
    expect(stderr).not.toContain("yielding to priority waiter");
  }, 60_000);
});

describe("spec §7 case 12 — nested pass-through and stale marker", () => {
  it("passes a nested invocation through under a LIVE holder, keeping one holder throughout", async () => {
    const dir = slotDir();
    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: "200" };
    const log = join(dir, "case12-live.log");

    const outer = runWrapped(env, [
      process.execPath,
      "-e",
      NESTED_JS,
      "python3",
      WRAPPER,
      "--",
      process.execPath,
      "-e",
      LOG_WINDOW_JS,
      "inner",
      log,
      "1500",
    ]);
    await waitForStderr(outer, "acquired slot-", 15_000);

    const other = runWrapped(env, logWindowArgs("other", log, 500));
    const [ro, rt] = await Promise.all([outer.exited, other.exited]);
    expect(ro.code).toBe(0);
    expect(rt.code).toBe(0);

    expect(outer.stderr()).toContain("nested under held slot");
    // Exactly one acquisition across outer + inner (stderr is merged).
    expect(outer.stderr().match(/acquired slot-/g) ?? []).toHaveLength(1);

    const got = windows(log);
    expect(got.get("inner")).toBeDefined();
    expect(got.get("other")).toBeDefined();
    expect(overlaps(got.get("inner"), got.get("other"))).toBe(false);
  }, 90_000);

  it("acquires normally when the marker's holder is dead, and re-marks with the NEW slot and pid", async () => {
    const dir = slotDir();
    const orphanScript = join(dir, "orphan.cjs");
    const innerScript = join(dir, "orphan-inner.cjs");
    writeFileSync(orphanScript, ORPHAN_CJS);
    writeFileSync(innerScript, ORPHAN_INNER_CJS);

    const env = { FX_HEAVY_SLOT_DIR: dir, FX_HEAVY_SLOTS: "1", FX_HEAVY_POLL_MS: "200" };
    const log = join(dir, "case12-stale.log");

    const parent = runWrapped(env, [
      process.execPath,
      "-e",
      SPAWN_DETACHED_JS,
      orphanScript,
      WRAPPER,
      innerScript,
      log,
      dir,
    ]);
    await waitForStderr(parent, "acquired slot-", 15_000);
    expect((await parent.exited).code).toBe(0);

    // Occupy the slot ACROSS the orphan's attempt, so "it acquired" is a claim
    // about admission rather than about an empty dir. The window must outlast
    // the orphan's own 3000 ms wait-for-the-parent-to-die delay, measured from
    // the parent's start rather than from this holder's — hence the margin.
    const other = runWrapped(env, logWindowArgs("other", log, 4000));
    await waitForStderr(other, "acquired slot-", 15_000);

    await waitUntil(
      "the orphan's wrapped run to finish",
      () => existsSync(join(dir, "orphan.status")),
      60_000,
    );
    await other.exited;

    const orphanStderr = readFileSync(join(dir, "orphan.stderr"), "utf8");
    expect(orphanStderr).toContain("stale slot-held marker");
    premiseHolds(
      "the orphan was genuinely excluded while the other holder ran",
      orphanStderr.includes("waiting for a heavy slot"),
    );
    expect(orphanStderr).toMatch(/^acquired slot-\d+ \(slots=1\)$/m);
    expect(readFileSync(join(dir, "orphan.status"), "utf8")).toBe("0");

    const got = windows(log);
    expect(got.get("orphan")).toBeDefined();
    expect(got.get("other")).toBeDefined();
    expect(overlaps(got.get("orphan"), got.get("other"))).toBe(false);

    const remarked = readFileSync(join(dir, "orphan.marker"), "utf8").trim();
    expect(remarked.startsWith(`${join(dir, "slot-0")}:`)).toBe(true);
    const remarkedPid = Number(remarked.slice(remarked.lastIndexOf(":") + 1));
    expect(Number.isInteger(remarkedPid)).toBe(true);
    expect(remarkedPid).not.toBe(parent.pid);
  }, 120_000);
});

describe("spec §7 case 10 — pnpm forwarding", () => {
  it("`pnpm heavy -- <cmd>` reaches the wrapper with the command intact", async () => {
    const dir = slotDir();
    const run = spawnRun("pnpm", ["heavy", "--", process.execPath, "-e", "process.exit(0)"], {
      FX_HEAVY_SLOT_DIR: dir,
      FX_HEAVY_SLOTS: "1",
    });
    const { code } = await run.exited;
    expect(code).toBe(0);
    // The acquisition line proves the wrapper actually ran rather than pnpm
    // shrugging the command through.
    expect(run.stderr()).toContain("acquired slot-0 (slots=1)");
  }, 60_000);

  it("forwards the bare `pnpm heavy <cmd>` form the AGENTS.md rule documents", async () => {
    const dir = slotDir();
    const run = spawnRun("pnpm", ["heavy", process.execPath, "-e", "process.exit(0)"], {
      FX_HEAVY_SLOT_DIR: dir,
      FX_HEAVY_SLOTS: "1",
    });
    expect((await run.exited).code).toBe(0);
    expect(run.stderr()).toContain("acquired slot-0 (slots=1)");
  }, 60_000);
});
