import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { premiseHolds } from "../../_shared/premise";
import { WATCHDOG_ARGV, spawnBounded } from "./spawnBounded";

/**
 * The LIVE half of spawnBounded's guard — real processes, real groups, real
 * signals.
 *
 * Deliberately NOT the enrolled suite (spec §8). The watchdog is a perl program
 * held in a string literal and none of the six declared operators rewrites
 * string content (`tests/mutation/source/operators.ts:17-24`), so the registry
 * can generate no semantic mutant of its behaviour: CANNOT-EXPRESS, and this
 * file is what guards it instead. Keeping it out of `suitePaths` also keeps the
 * per-mutant gate cost flat — every case here spawns processes.
 */

const scratch = mkdtempSync(join(tmpdir(), "fx-spawn-bounded-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Is this pid still alive? Signal 0 tests for existence without delivering one. */
const alive = (pid: number | undefined): boolean => {
  if (pid === undefined || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const reap = (pid: number | undefined): void => {
  if (alive(pid)) {
    try {
      process.kill(pid!, "SIGKILL");
    } catch {
      // already gone
    }
  }
};

/** Write-then-rename, so a poller never reads a half-written pid. */
const atomicWrite = (path: string, value: string): string =>
  [
    "{ const fs = require('node:fs');",
    `fs.writeFileSync(${JSON.stringify(`${path}.tmp`)}, ${value});`,
    `fs.renameSync(${JSON.stringify(`${path}.tmp`)}, ${JSON.stringify(path)}); }`,
  ].join(" ");

const readPids = async (path: string, timeoutMs: number): Promise<number[]> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const raw = readFileSync(path, "utf8").trim();
      if (raw.length > 0) return raw.split(/\s+/).map(Number);
    } catch {
      // not written yet
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  return [];
};

const waitUntilGone = async (pids: number[], timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (pids.some(alive) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
};

const parentOf = (pid: number): number => {
  const out = spawnSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" });
  return Number((out.stdout ?? "").trim());
};

const node = process.execPath;

describe("spawnBounded — exit-status transparency through the supervisor (AC-2)", () => {
  // The supervisor forks, waits, and propagates `$? >> 8`. If any of that
  // shifted, an ordinary mutant verdict would be silently wrong: `classify`
  // reads the number, and 0 versus non-zero IS the score.
  it.each([0, 1, 42, 127])(
    "a child that exits %i is reported as that exact code",
    (code) => {
      const { outcome, ownGroup } = spawnBounded([node, "-e", `process.exit(${code})`], {
        cwd: process.cwd(),
        env: process.env,
        timeoutMs: 30_000,
      });
      premiseHolds("perl is present, so the supervisor really ran", ownGroup);
      expect(outcome).toEqual({ kind: "exit", code });
    },
    40_000,
  );
});

describe("spawnBounded — signal transparency (AC-3)", () => {
  it("re-raises a SIGKILLed child's death as a signal death, not as an exit code", async () => {
    // The killer must be OUT OF PROCESS: `spawnSync` blocks this worker's event
    // loop for its whole duration, so an in-process `setTimeout` killer never
    // runs (it did not, on the first authoring attempt — `kill ESRCH`).
    const pidFile = join(scratch, "sigkill-child.pid");
    const killer = spawn(
      node,
      [
        "-e",
        [
          "const fs = require('node:fs');",
          `const f = ${JSON.stringify(pidFile)};`,
          "const deadline = Date.now() + 25000;",
          "(function poll() {",
          "  if (Date.now() > deadline) process.exit(0);",
          "  let pid = 0;",
          "  try { pid = Number(fs.readFileSync(f, 'utf8').trim()); } catch {}",
          "  if (pid > 0) { try { process.kill(pid, 'SIGKILL'); } catch {} process.exit(0); }",
          "  setTimeout(poll, 25);",
          "})();",
        ].join("\n"),
      ],
      { detached: true, stdio: "ignore" },
    );
    killer.unref();

    try {
      const { outcome } = spawnBounded(
        [node, "-e", `${atomicWrite(pidFile, "String(process.pid)")} setInterval(() => {}, 1000);`],
        { cwd: process.cwd(), env: process.env, timeoutMs: 25_000 },
      );
      expect(outcome).toEqual({ kind: "infra", signal: "SIGKILL", code: undefined });
    } finally {
      reap(killer.pid);
      const [pid] = await readPids(pidFile, 0);
      reap(pid);
    }
  }, 45_000);
});

describe("spawnBounded — wrapper-internal failure never aliases a child exit (AC-11)", () => {
  it("surfaces an exec failure as a SIGUSR2 death, with no numeric status at all", () => {
    // Exit codes 0-255 all belong to the child (AC-2). A wrapper that signalled
    // its own failure with a number would alias a legitimate child exit and be
    // scored KILLED — or, at `childRun`, forge a premise proof. The self-signal
    // arms in WATCHDOG_SCRIPT are what stop that; this runs the exec arm live,
    // and the fork arm is pinned by text in the mocked suite because fork
    // exhaustion is not constructible safely.
    const { outcome, ownGroup } = spawnBounded(
      [join(scratch, "fx-no-such-binary"), "--never-runs"],
      { cwd: process.cwd(), env: process.env, timeoutMs: 30_000 },
    );
    premiseHolds("perl is present, so the supervisor really ran", ownGroup);
    expect(outcome).toEqual({ kind: "infra", signal: "SIGUSR2", code: undefined });
  }, 40_000);
});

describe("spawnBounded — the parent-ALIVE hazard is unchanged (AC-4)", () => {
  it("times out a hung child and reaps the grandchild it left behind", async () => {
    const pidFile = join(scratch, "hung-grandchild.pid");
    const childScript = [
      "const { spawn } = require('node:child_process');",
      `const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });`,
      atomicWrite(pidFile, "String(g.pid)"),
      "setInterval(() => {}, 1000);",
    ].join("\n");

    const started = Date.now();
    const { outcome } = spawnBounded([node, "-e", childScript], {
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 3_000,
    });
    const elapsed = Date.now() - started;

    const [grandchild] = await readPids(pidFile, 2_000);
    try {
      expect(outcome).toEqual({ kind: "timeout" });
      expect(elapsed).toBeGreaterThanOrEqual(2_900);
      premiseHolds(
        "the grandchild really started, so there was something to reap",
        Number.isInteger(grandchild) && grandchild! > 0,
      );
      // `spawnSync` returns only AFTER killing the process it spawned, so by now
      // the grandchild has been reparented and no parent-based walk can find it.
      // Only the process GROUP still reaches it.
      await waitUntilGone([grandchild!], 10_000);
      expect(alive(grandchild)).toBe(false);
    } finally {
      reap(grandchild);
    }
  }, 45_000);
});

describe("spawnBounded — the parent-DEATH hazard, which is the whole point (AC-1)", () => {
  it("takes the whole group down within a poll interval of the harness dying", async () => {
    // A pretend harness stands in for this worker: it calls the real supervisor
    // argv and blocks, exactly as `runSuite` does. Killing THIS process instead
    // would kill the test.
    const pidFile = join(scratch, "parent-death.pid");
    const childScript = [
      "const { spawn } = require('node:child_process');",
      `const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });`,
      atomicWrite(pidFile, "process.pid + ' ' + g.pid"),
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const harnessScript = [
      "const { spawnSync } = require('node:child_process');",
      `spawnSync('perl', ${JSON.stringify([...WATCHDOG_ARGV])}.concat([process.execPath, '-e', ${JSON.stringify(childScript)}]), { stdio: 'ignore' });`,
    ].join("\n");

    const harness = spawn(node, ["-e", harnessScript], { detached: true, stdio: "ignore" });
    harness.unref();

    const [child, grandchild] = await readPids(pidFile, 20_000);
    let supervisor = 0;
    try {
      premiseHolds(
        "the child and grandchild both started",
        Number.isInteger(child) && child! > 0 && Number.isInteger(grandchild) && grandchild! > 0,
      );
      supervisor = parentOf(child!);
      premiseHolds(
        "a perl supervisor sits between the harness and the child",
        supervisor > 0 && supervisor !== harness.pid,
      );
      premiseHolds("the harness is alive", alive(harness.pid));
      premiseHolds(
        "all three of supervisor, child and grandchild are up before the kill",
        alive(supervisor) && alive(child) && alive(grandchild),
      );

      process.kill(harness.pid!, "SIGKILL");

      // 0.5s poll + kernel teardown (spec L-1, measured <=2s); 10s is budget,
      // not expectation.
      await waitUntilGone([supervisor, child!, grandchild!], 10_000);
      expect({
        supervisor: alive(supervisor),
        child: alive(child),
        grandchild: alive(grandchild),
      }).toEqual({ supervisor: false, child: false, grandchild: false });
    } finally {
      reap(harness.pid);
      reap(supervisor);
      reap(child);
      reap(grandchild);
    }
  }, 60_000);
});
