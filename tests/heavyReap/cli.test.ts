import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_MIN_AGE_SECONDS, type Decision } from "../../lib/heavyReap/classify";
import {
  type IdentityRead,
  type TargetIdentity,
  readIdentity,
  type KillOutcome,
  executeKills,
  exitStatus,
  parseFlags,
  planTargets,
  readCeiling,
  selfAncestry,
  shouldPrintOutcome,
  stillAlive,
} from "../../scripts/heavy-reap";

const reap = (pid: number): Decision => ({
  pid,
  reap: true,
  shape: "forks.js",
  ageSeconds: 99_999,
});
const ident = (pid: number) => ({ pid, startedAt: "Sun Aug 16 09:35:23 2026", command: "node x" });
const read = (pid: number): IdentityRead => ({ state: "read", identity: ident(pid) });
const planned = (pid: number) => new Map<number, IdentityRead>([[pid, read(pid)]]);

describe("parseFlags: AC-6", () => {
  it.each([
    [[], { kill: false, all: false, quiet: false }],
    [["--all"], { kill: false, all: true, quiet: false }],
    [["--kill"], { kill: true, all: false, quiet: false }],
    [["--kill", "--quiet"], { kill: true, all: false, quiet: true }],
  ])("%j", (argv, expected) => {
    expect(parseFlags(argv)).toMatchObject(expected);
  });

  it("--all never widens what is killed", () => {
    expect(parseFlags(["--all"]).kill).toBe(false);
  });
});

describe("readCeiling: C3 and C4", () => {
  it("C3: unset uses 14400 with no rejection", () => {
    expect(readCeiling(undefined)).toEqual({ seconds: 14400, source: "default" });
    expect(DEFAULT_MIN_AGE_SECONDS).toBe(14400);
  });

  it.each([["abc"], ["-5"], ["0"], [""], ["1.5"]])("C4: rejects %s", (raw) => {
    expect(readCeiling(raw).rejected).toBe(raw);
  });

  it("accepts a valid override", () => {
    expect(readCeiling("60")).toMatchObject({ seconds: 60, source: "env" });
  });
});

describe("planTargets: AC-5", () => {
  it("plans the root FIRST, then its recorded descendants", () => {
    const rows = [
      { pid: 10, ppid: 1 },
      { pid: 11, ppid: 10 },
      { pid: 12, ppid: 11 },
      { pid: 20, ppid: 1 },
    ];
    expect(planTargets([reap(10)], rows)).toEqual([10, 11, 12]);
  });

  it("plans nothing when no decision reaps", () => {
    expect(planTargets([{ pid: 10, reap: false, because: "too-young" }], [])).toEqual([]);
  });

  it("does not loop on a parent cycle", () => {
    expect(
      planTargets(
        [reap(10)],
        [
          { pid: 10, ppid: 11 },
          { pid: 11, ppid: 10 },
        ],
      ),
    ).toEqual([10, 11]);
  });

  it("K5: a descendant absent from the SNAPSHOT is not in this run's plan", () => {
    const snapshot = [{ pid: 10, ppid: 1 }];
    expect(planTargets([reap(10)], snapshot)).toEqual([10]);
    // and once it appears in a later snapshot, the next run picks it up
    expect(planTargets([reap(10)], [...snapshot, { pid: 11, ppid: 10 }])).toEqual([10, 11]);
  });
});

describe("selfAncestry: AC-4", () => {
  it("walks up to init and stops", () => {
    const rows = [
      { pid: 5, ppid: 4 },
      { pid: 4, ppid: 3 },
      { pid: 3, ppid: 1 },
    ];
    expect(selfAncestry(5, rows)).toEqual([4, 3]);
  });

  it("terminates on a cycle", () => {
    expect(
      selfAncestry(5, [
        { pid: 5, ppid: 6 },
        { pid: 6, ppid: 5 },
      ]),
    ).toEqual([6]);
  });
});

describe("executeKills: AC-5, AC-5b", () => {
  it("K2: a changed identity is NOT signalled", () => {
    const signalled: number[] = [];
    const out = executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: () => ({
        state: "read",
        identity: { pid: 10, startedAt: "Sun Aug 16 10:00:00 2026", command: "node x" },
      }),
      kill: (pid) => {
        signalled.push(pid);
      },
      stillAlive: () => false,
    });
    expect(signalled).toEqual([]);
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "identity-changed" }]);
  });

  it("AC-5b: an advanced etime and a changed ppid do NOT block the signal", () => {
    // Both identities carry ppid/etime that DIFFER. If an implementation ever adds either to the
    // comparison, this fails; asserting on two identical objects could not detect that.
    const before = { ...ident(10), ppid: 1, etimeSeconds: 100 } as unknown as TargetIdentity;
    const current = { ...ident(10), ppid: 99, etimeSeconds: 5_000 } as unknown as TargetIdentity;
    const signalled: number[] = [];
    const out = executeKills([10], {
      identityAtPlan: new Map<number, IdentityRead>([[10, { state: "read", identity: before }]]),
      readIdentity: () => ({ state: "read", identity: current }),
      kill: (pid) => {
        signalled.push(pid);
      },
      stillAlive: () => false,
    });
    expect(signalled).toEqual([10]);
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "killed" }]);
  });

  it("AC-5b: readIdentity's own output carries exactly the triple, and nothing else", () => {
    const r = readIdentity(process.pid);
    expect(r.state).toBe("read");
    if (r.state === "read")
      expect(Object.keys(r.identity).sort()).toEqual(["command", "pid", "startedAt"]);
  });

  it("K2: an identity differing ONLY in command is not signalled", () => {
    // startedAt is identical here, so deleting the command comparison makes this the only failing
    // case - every other K2 case varies startedAt (plan round 13).
    const signalled: number[] = [];
    const out = executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: (pid) => ({
        state: "read",
        identity: { ...ident(pid), command: "node SOMETHING-ELSE" },
      }),
      kill: (pid) => {
        signalled.push(pid);
      },
      stillAlive: () => false,
    });
    expect(signalled).toEqual([]);
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "identity-changed" }]);
  });

  it("K1: a pid gone BEFORE the identity read is already-gone", () => {
    const out = executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: () => ({ state: "gone" }),
      kill: () => undefined,
      stillAlive: () => false,
    });
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "already-gone" }]);
  });

  it("K1: a pid gone AFTER the identity read (kill throws ESRCH) is also already-gone", () => {
    const out = executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: read,
      kill: () => {
        throw Object.assign(new Error("no such process"), { code: "ESRCH" });
      },
      stillAlive: () => false,
    });
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "already-gone" }]);
  });

  it("an UNREADABLE identity is never conflated with a gone process", () => {
    const signalled: number[] = [];
    const out = executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: () => ({ state: "unreadable", detail: "EPERM" }),
      kill: (pid) => {
        signalled.push(pid);
      },
      stillAlive: () => false,
    });
    expect(signalled).toEqual([]);
    expect(out[0]).toMatchObject({ pid: 10, result: "identity-unreadable" });
  });

  it.each([
    ["a later successful read", { state: "read", identity: ident(10) } as IdentityRead],
    ["a later gone", { state: "gone" } as IdentityRead],
  ])(
    "K6: a PLAN-TIME unreadable stays unreadable, and is NOT re-read, despite %s",
    (_label, second) => {
      const signalled: number[] = [];
      const reads: number[] = [];
      const out = executeKills([10], {
        identityAtPlan: new Map<number, IdentityRead>([
          [10, { state: "unreadable", detail: "EPERM" }],
        ]),
        readIdentity: (pid) => {
          reads.push(pid);
          return second;
        },
        kill: (pid) => {
          signalled.push(pid);
        },
        stillAlive: () => false,
      });
      expect(signalled).toEqual([]);
      // Spec §6.1: a target whose classification read failed is K6 on that evidence alone, so the
      // second read is not taken. Counting the reads is what makes this case non-vacuous - the
      // injected `second` value is deliberately one that WOULD change the outcome if it were read.
      expect(reads).toEqual([]);
      expect(out[0]).toMatchObject({ pid: 10, result: "identity-unreadable" });
    },
  );

  it("K1: a PLAN-TIME gone stays already-gone, and is NOT re-read", () => {
    const reads: number[] = [];
    const out = executeKills([10], {
      identityAtPlan: new Map<number, IdentityRead>([[10, { state: "gone" }]]),
      readIdentity: (pid) => {
        reads.push(pid);
        return read(pid);
      },
      kill: () => undefined,
      stillAlive: () => false,
    });
    expect(reads).toEqual([]);
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "already-gone" }]);
  });

  it("a target WITH a usable plan-time identity IS read a second time", () => {
    const reads: number[] = [];
    executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: (pid) => {
        reads.push(pid);
        return read(pid);
      },
      kill: () => undefined,
      stillAlive: () => false,
    });
    expect(reads).toEqual([10]); // exactly one SECOND read, per spec §6.1's "at most two"
  });

  it("AC-5: the ROOT is signalled first, then its descendants, in plan order", () => {
    const order: number[] = [];
    executeKills([10, 11, 12], {
      identityAtPlan: new Map<number, IdentityRead>([
        [10, read(10)],
        [11, read(11)],
        [12, read(12)],
      ]),
      readIdentity: read,
      kill: (pid) => {
        order.push(pid);
      },
      stillAlive: () => false,
    });
    // Observed on the KILLER's call sequence. The outcomes are sorted back into target order
    // before they are returned, so asserting on them cannot see a reversed loop (round 6 F1).
    expect(order).toEqual([10, 11, 12]);
  });

  it("K3: a failing kill is reported per pid and does not stop the run", () => {
    const out = executeKills([10, 11], {
      identityAtPlan: new Map<number, IdentityRead>([
        [10, read(10)],
        [11, read(11)],
      ]),
      readIdentity: read,
      kill: (pid) => {
        if (pid === 10) throw Object.assign(new Error("nope"), { code: "EPERM" });
      },
      stillAlive: () => false,
    });
    expect(out.map((o) => o.result)).toEqual(["failed", "killed"]);
  });

  it("K4: a recorded target alive after the re-scan is partial", () => {
    const out = executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: read,
      kill: () => undefined,
      stillAlive: (pid) => pid === 10,
    });
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "partial" }]);
  });
});

describe("stillAlive: K4's settle, on the production function", () => {
  it("a process that exits DURING the window is reported gone, and without the settle is not", () => {
    const pid = Number(
      execFileSync(
        "sh",
        ["-c", `${process.execPath} -e 'setTimeout(() => {}, 150)' >/dev/null 2>&1 & echo $!`],
        { encoding: "utf8" },
      ).trim(),
    );
    // One attempt is the no-settle implementation: it sees the process still up.
    expect(stillAlive(pid, 1, 0)).toBe(true);
    // Four 50 ms attempts outlast the exit, which is exactly what K4 requires. Deleting the retry
    // makes this fail, which no injected-stub case could detect.
    expect(stillAlive(pid, 8, 50)).toBe(false);
  }, 30_000);
});

describe("shouldPrintOutcome: §6.2's reporting matrix, every cell", () => {
  const ALL = [
    "killed",
    "already-gone",
    "failed",
    "partial",
    "identity-changed",
    "identity-unreadable",
  ] as const;

  it.each(ALL)("without --quiet, %s prints", (result) => {
    expect(shouldPrintOutcome(result, false)).toBe(true);
  });

  it.each([
    ["killed", false],
    ["already-gone", false],
    ["failed", true],
    ["partial", true],
    ["identity-changed", true],
    ["identity-unreadable", true],
  ] as const)("with --quiet, %s prints: %s", (result, printed) => {
    expect(shouldPrintOutcome(result, true)).toBe(printed);
  });

  it("suppresses exactly the two plain successes and nothing else", () => {
    const suppressed = ALL.filter((r) => !shouldPrintOutcome(r, true));
    expect([...suppressed].sort()).toEqual(["already-gone", "killed"]);
  });
});

describe("exitStatus: §6.2", () => {
  it("is non-zero when ANY outcome is non-success, wherever it sits in the list", () => {
    const ok = { pid: 1, result: "killed" as const };
    const gone = { pid: 2, result: "already-gone" as const };
    const bad = { pid: 3, result: "failed" as const };
    const base = { collectFailed: false, ceilingRejected: false };
    // First, middle and last, because reading only one end of the list is the natural bug.
    expect(exitStatus({ ...base, outcomes: [bad, ok, gone] })).toBe(1);
    expect(exitStatus({ ...base, outcomes: [ok, bad, gone] })).toBe(1);
    expect(exitStatus({ ...base, outcomes: [ok, gone, bad] })).toBe(1);
    expect(exitStatus({ ...base, outcomes: [ok, gone, ok] })).toBe(0);
  });

  const base = { collectFailed: false, ceilingRejected: false };
  it.each([
    ["C1", { collectFailed: true, outcomes: [] }, 1],
    ["C4", { ceilingRejected: true, outcomes: [] }, 1],
    ["K2", { outcomes: [{ pid: 1, result: "identity-changed" as const }] }, 1],
    ["identity-unreadable", { outcomes: [{ pid: 1, result: "identity-unreadable" as const }] }, 1],
    ["K3", { outcomes: [{ pid: 1, result: "failed" as const }] }, 1],
    ["K4", { outcomes: [{ pid: 1, result: "partial" as const }] }, 1],
    ["K1", { outcomes: [{ pid: 1, result: "already-gone" as const }] }, 0],
    ["clean kill", { outcomes: [{ pid: 1, result: "killed" as const }] }, 0],
    ["C2/C3", { outcomes: [] }, 0],
  ])("%s", (_id, state, code) => {
    expect(exitStatus({ ...base, ...state })).toBe(code);
  });
});

// ---------------------------------------------------------------------------
// readIdentity at its REAL boundary. Everything above injects IdentityRead
// states into executeKills; without these, deleting readIdentity's timeout or
// collapsing its errors back into "gone" would leave every case green
// (plan round 2 finding 4).
// ---------------------------------------------------------------------------
const FAKE_PS = new URL("./fixtures/fake-ps.mjs", import.meta.url).pathname;

describe("readIdentity: the K1 / K6 boundary, executed", () => {
  it("reads a live identity into the triple", () => {
    const r = readIdentity(4242, FAKE_PS);
    expect(r.state).toBe("read");
    if (r.state === "read") expect(r.identity.command).toContain("worker-4242");
  });

  it("pins LC_ALL=C on the REAL ps, so a localized lstart cannot shift its token offsets", () => {
    // Against the real `ps`, not the fixture, because the fixture ignores locale entirely and
    // would keep this green with the env pin deleted. zh_CN renders lstart in FOUR tokens on this
    // machine; the C-locale shape is five, and the identity parse depends on that.
    process.env.LC_ALL = "zh_CN.UTF-8";
    process.env.LANG = "zh_CN.UTF-8";
    try {
      const r = readIdentity(process.pid);
      expect(r.state).toBe("read");
      if (r.state === "read") {
        expect(r.identity.startedAt).toMatch(
          /^[A-Z][a-z]{2} [A-Z][a-z]{2} +\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/,
        );
        expect(r.identity.command).not.toBe("");
      }
    } finally {
      delete process.env.LC_ALL;
      delete process.env.LANG;
    }
  }, 20_000);

  it("K1: ps exiting 1 with NO output means gone", () => {
    process.env.FAKE_PS_IDENTITY_GONE = "4242";
    try {
      expect(readIdentity(4242, FAKE_PS).state).toBe("gone");
    } finally {
      delete process.env.FAKE_PS_IDENTITY_GONE;
    }
  });

  it("K6: ps exiting 1 WITH output is a ps error, never gone", () => {
    process.env.FAKE_PS_MODE = "identity-noisy-fail";
    try {
      expect(readIdentity(4242, FAKE_PS).state).toBe("unreadable");
    } finally {
      delete process.env.FAKE_PS_MODE;
    }
  });

  it("K6: ps exiting 1 with a STDERR-only diagnostic is a ps error, never gone", () => {
    process.env.FAKE_PS_MODE = "identity-stderr-fail";
    try {
      expect(readIdentity(4242, FAKE_PS).state).toBe("unreadable");
    } finally {
      delete process.env.FAKE_PS_MODE;
    }
  });

  it("K6: any other ps failure is unreadable", () => {
    process.env.FAKE_PS_MODE = "identity-fail";
    try {
      expect(readIdentity(4242, FAKE_PS).state).toBe("unreadable");
    } finally {
      delete process.env.FAKE_PS_MODE;
    }
  });

  it("K6: a missing ps binary is unreadable, never gone", () => {
    expect(readIdentity(4242, "/definitely/not/a/real/ps").state).toBe("unreadable");
  });

  it("AC-8: a hanging identity read is bounded and reported unreadable", () => {
    process.env.FAKE_PS_MODE = "identity-hang";
    const started = Date.now();
    try {
      expect(readIdentity(4242, FAKE_PS).state).toBe("unreadable");
    } finally {
      delete process.env.FAKE_PS_MODE;
    }
    expect(Date.now() - started).toBeLessThan(20_000);
  }, 40_000);
});

// ---------------------------------------------------------------------------
// The CLI ITSELF, executed. `ps` is replaced via FX_REAP_PS_BIN, and every table
// these cases feed it is built from pids the TEST SPAWNED, so --kill can only
// ever signal a process this suite owns (plan round 3 finding 1). Fixed literal
// pids would be recyclable and could name someone else's process.
// ---------------------------------------------------------------------------
const CLI = new URL("../../scripts/heavy-reap.ts", import.meta.url).pathname;
const KILL_LINE =
  /heavy-reap: (killed|already-gone|failed|partial|identity-changed|identity-unreadable) pid=/;
const WORKER_CMD = "/usr/bin/node /x/node_modules/vitest/dist/workers/forks.js";
const OLD = "1-05:29:53";

type Row = { pid: number; ppid: number; etime: string; command: string } | string;

function runCli(
  args: string[],
  table: Row[],
  env: Record<string, string> = {},
): { out: string; code: number } {
  try {
    const out = execFileSync("pnpm", ["exec", "tsx", CLI, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        FX_REAP_PS_BIN: FAKE_PS,
        FAKE_PS_TABLE: JSON.stringify(table),
        ...env,
      },
      timeout: 120_000,
    });
    return { out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { out: err.stdout ?? "", code: err.status ?? -1 };
  }
}

/**
 * A real process this suite created, spawned so that it REPARENTS TO INIT.
 *
 * Two reasons it is a grandchild rather than a direct child. It matches what the reaper actually
 * targets, `ppid == 1`, so the fake table's claim is true rather than a fiction. And a direct
 * child that is SIGKILLed becomes a ZOMBIE until this process reaps it, while `kill(pid, 0)`
 * succeeds on a zombie, so the reaper's verification re-scan would report `partial` for a process
 * it had just killed. Init reaps an orphan immediately, so a real orphan never has that problem.
 */
function spawnOrphan(): { pid: number; alive: () => boolean; kill: () => void } {
  const pid = Number(
    execFileSync(
      "sh",
      [
        "-c",
        // stdio to /dev/null, or execFileSync waits on the inherited pipe until the orphan exits.
        `${process.execPath} -e 'setTimeout(() => {}, 60000)' >/dev/null 2>&1 & echo $!`,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  return {
    pid,
    alive: () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
    kill: () => {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    },
  };
}

describe("the CLI, executed end to end", () => {
  it("AC-6: the default reports candidates with reasons and kills NOTHING", () => {
    const owned = spawnOrphan();
    try {
      const table: Row[] = [
        { pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
        { pid: 777001, ppid: 1, etime: OLD, command: "/usr/bin/pnpm exec vitest run" },
        { pid: 777002, ppid: 777001, etime: OLD, command: WORKER_CMD },
      ];
      const { out, code } = runCli([], table);
      expect(out).toContain(`REAPABLE pid=${owned.pid}`);
      expect(out).toContain("1 candidate(s)");
      expect(out).toContain("skip 777001 (not-a-worker)"); // orphan-shaped decline, WITH its reason
      expect(out).not.toContain("skip 777002"); // ppid != 1, so not orphan-shaped
      expect(out).not.toMatch(KILL_LINE);
      expect(code).toBe(0);
      expect(owned.alive()).toBe(true); // the default is non-destructive, observed on a real process
    } finally {
      owned.kill();
    }
  }, 180_000);

  it("§6.2: EVERY candidate is reported, not just the first", () => {
    const a = spawnOrphan();
    const b = spawnOrphan();
    try {
      const table: Row[] = [
        { pid: a.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
        { pid: b.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
      ];
      const { out } = runCli([], table);
      expect(out).toContain(`REAPABLE pid=${a.pid}`);
      expect(out).toContain(`REAPABLE pid=${b.pid}`);
      expect(out).toContain("2 candidate(s)");
    } finally {
      a.kill();
      b.kill();
    }
  }, 180_000);

  it("§6.2: EVERY orphan-shaped decline reason reaches the default report", () => {
    const LS = "Sun Aug 16 09:35:23 2026";
    const table: Row[] = [
      { pid: 777010, ppid: 1, etime: "00:10", command: WORKER_CMD }, // too-young
      { pid: 777011, ppid: 1, etime: OLD, command: "/usr/bin/pnpm exec vitest run" }, // not-a-worker
      // R3: an unparsable etime on an orphan-shaped worker row, which declines as undecidable.
      `777012 1 zzzz ${LS} /usr/bin/node /x/node_modules/vitest/dist/workers/forks.js`,
    ];
    const { out } = runCli([], table);
    expect(out).toContain("skip 777010 (too-young)");
    expect(out).toContain("skip 777011 (not-a-worker)");
    expect(out).toContain("skip 777012 (undecidable)");
  }, 180_000);

  it("AC-4: the reaper reports ITSELF as a decline rather than reaping it", () => {
    // The fixture injects a worker-shaped row for its own parent, which IS the CLI process.
    const { out, code } = runCli(["--kill"], [], { FAKE_PS_INCLUDE_SELF: "1" });
    expect(out).toMatch(/skip \d+ \(self\)/);
    expect(out).toContain("0 candidate(s)");
    expect(code).toBe(0);
  }, 180_000);

  it("§6.2: the default counts EVERY row, including one it does not print", () => {
    const table: Row[] = [
      { pid: 777001, ppid: 1, etime: OLD, command: "/usr/bin/pnpm exec vitest run" },
      "garbage-line-with-no-pid",
    ];
    const { out } = runCli([], table);
    // Two rows read though the unparsable one is not printed by default: a constant zero, or a
    // count of only the printable rows, both fail here.
    expect(out).toContain("2 rows read");
    expect(out).not.toContain("skip unparsable");
  }, 180_000);

  it("§6.2: an `undecidable` decline is reported WITH its reason under --all", () => {
    const LS = "Sun Aug 16 09:35:23 2026";
    const table: Row[] = [
      // A raw line whose ppid will not parse: R2, which declines as `undecidable`.
      `777002 xx 1-05:29:53 ${LS} /usr/bin/node /x/node_modules/vitest/dist/workers/forks.js`,
    ];
    const { out } = runCli(["--all"], table);
    expect(out).toContain("skip 777002 (undecidable)");
  }, 180_000);

  it("AC-6: --all combined with --kill widens the REPORT and NOT the kill set", () => {
    // The BYSTANDER is the load-bearing row: reported only under `--all`, declined, and NOT a
    // descendant of the reaped root, so it is not already a target. An implementation that added
    // every `--all`-visible row to the kill set would signal it, which the previous version of
    // this case could not detect because its only extra row was already a target (round 12).
    const run = (flags: string[]) => {
      const root = spawnOrphan();
      const kid = spawnOrphan();
      const bystanderParent = spawnOrphan();
      const bystander = spawnOrphan();
      try {
        const table: Row[] = [
          { pid: root.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
          { pid: kid.pid, ppid: root.pid, etime: OLD, command: WORKER_CMD },
          {
            pid: bystanderParent.pid,
            ppid: 1,
            etime: OLD,
            command: "/usr/bin/pnpm exec vitest run",
          },
          { pid: bystander.pid, ppid: bystanderParent.pid, etime: OLD, command: WORKER_CMD },
        ];
        const { out } = runCli(flags, table);
        const killed = (out.match(/killed pid=(\d+)/g) ?? [])
          .map((m) =>
            m
              .replace(`${root.pid}`, "ROOT")
              .replace(`${kid.pid}`, "KID")
              .replace(`${bystander.pid}`, "BYSTANDER"),
          )
          .sort();
        return { killed, out, bystanderAlive: bystander.alive(), bystander: bystander.pid };
      } finally {
        root.kill();
        kid.kill();
        bystanderParent.kill();
        bystander.kill();
      }
    };

    const plain = run(["--kill"]);
    const withAll = run(["--kill", "--all"]);
    expect(plain.killed).toEqual(["killed pid=KID", "killed pid=ROOT"]);
    expect(withAll.killed).toEqual(plain.killed);
    expect(withAll.out).toContain(`skip ${withAll.bystander} (has-live-parent)`);
    expect(plain.out).not.toContain(`skip ${plain.bystander}`);
    expect(withAll.bystanderAlive).toBe(true); // observed on the process, not only in the report
  }, 240_000);

  it("AC-6: --all ALONE is non-destructive even with a candidate present", () => {
    // The `--all`-only case must contain a REAPABLE row, or `shouldKill = flags.kill || flags.all`
    // has nothing to signal and passes vacuously (round 12).
    const owned = spawnOrphan();
    try {
      const table: Row[] = [
        { pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
        "garbage-line-with-no-pid",
      ];
      const { out, code } = runCli(["--all"], table);
      expect(out).toContain(`REAPABLE pid=${owned.pid}`);
      expect(out).toContain("skip unparsable");
      expect(out).not.toMatch(KILL_LINE);
      expect(owned.alive()).toBe(true);
      expect(code).toBe(0);
    } finally {
      owned.kill();
    }
  }, 180_000);

  it("AC-6: --all adds the non-orphan and the unparsable row, each with its reason", () => {
    const table: Row[] = [
      { pid: 777001, ppid: 777002, etime: OLD, command: WORKER_CMD },
      { pid: 777002, ppid: 1, etime: OLD, command: "/usr/bin/pnpm exec vitest run" },
      "garbage-line-with-no-pid",
    ];
    const { out } = runCli(["--all"], table);
    expect(out).toContain("skip 777001 (has-live-parent)");
    expect(out).toContain("skip unparsable");
    expect(out).toMatch(/skip unparsable \(.+\)/); // WITH its reason, which is what the row promises
    expect(out).not.toMatch(KILL_LINE);
  }, 180_000);

  it("§6.2: --kill prints one KillOutcome line per target, and keeps the default report", () => {
    const root = spawnOrphan();
    const kid = spawnOrphan();
    try {
      const table: Row[] = [
        { pid: root.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
        { pid: kid.pid, ppid: root.pid, etime: OLD, command: WORKER_CMD },
        { pid: 777003, ppid: 1, etime: OLD, command: "/usr/bin/pnpm exec vitest run" },
      ];
      const { out } = runCli(["--kill"], table);
      expect(out).toContain(`REAPABLE pid=${root.pid}`); // the default report is retained
      expect(out).toContain(`killed pid=${root.pid}`);
      expect(out).toContain(`killed pid=${kid.pid}`); // per TARGET, not just the first
      expect(out).toContain("skip 777003 (not-a-worker)"); // declines stay visible under --kill
      expect(root.alive()).toBe(false);
      expect(kid.alive()).toBe(false); // the recorded subtree, really killed
    } finally {
      root.kill();
      kid.kill();
    }
  }, 180_000);

  it("C4: a rejected ceiling reaps NOTHING even with a live candidate and --kill", () => {
    const owned = spawnOrphan();
    try {
      const table: Row[] = [{ pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD }];
      const { out, code } = runCli(["--kill"], table, { FX_REAP_MIN_AGE_S: "-5" });
      expect(out).toContain("rejected: -5");
      expect(out).not.toMatch(KILL_LINE);
      // Observed on the PROCESS: C4's guarantee is safety, not reporting flow.
      expect(owned.alive()).toBe(true);
      expect(code).toBe(1);
    } finally {
      owned.kill();
    }
  }, 180_000);

  it("C4: a rejected ceiling stops the run BEFORE the table is read, exit non-zero", () => {
    const { out, code } = runCli([], [], { FX_REAP_MIN_AGE_S: "-5" });
    expect(out).toContain("rejected: -5");
    expect(out).not.toContain("rows read");
    expect(code).toBe(1);
  }, 180_000);

  it("C1: an unreadable table names the failure and exits non-zero", () => {
    const { out, code } = runCli([], [], { FX_REAP_PS_BIN: "/definitely/not/a/real/ps" });
    expect(out).toContain("ps-unavailable"); // the problem is NAMED, not just 'cannot read'
    expect(out).not.toContain("candidate(s)");
    expect(code).toBe(1);
  }, 180_000);

  it("C2: an EMPTY table reports zero rows rather than saying nothing", () => {
    const { out, code } = runCli([], []);
    expect(out).toContain("0 rows read");
    expect(out).toContain("0 candidate(s)");
    expect(code).toBe(0);
  }, 180_000);

  it("K2: a target whose identity changed SINCE CLASSIFICATION is never signalled", () => {
    const owned = spawnOrphan();
    try {
      const table: Row[] = [{ pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD }];
      // DRIFT makes the pre-signal read disagree with the start time the BULK row carried. That
      // window is only observable because the classification-time identity comes from the row
      // itself; capturing it in a later read would compare two post-classification values and
      // report `killed` here (plan round 9).
      const { out, code } = runCli(["--kill"], table, { FAKE_PS_IDENTITY_DRIFT: "1" });
      expect(out).toContain(`identity-changed pid=${owned.pid}`);
      expect(out).not.toContain(`killed pid=${owned.pid}`);
      expect(owned.alive()).toBe(true);
      expect(code).toBe(1);
    } finally {
      owned.kill();
    }
  }, 180_000);

  it("--quiet suppresses declines and plain successes, never a non-success outcome (K2)", () => {
    const owned = spawnOrphan();
    try {
      const table: Row[] = [
        { pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
        { pid: 777001, ppid: 1, etime: OLD, command: "/usr/bin/pnpm exec vitest run" },
      ];
      const { out, code } = runCli(["--kill", "--quiet"], table, { FAKE_PS_IDENTITY_DRIFT: "1" });
      expect(out).not.toContain("skip "); // declines suppressed
      expect(out).toContain(`identity-changed pid=${owned.pid}`); // K2 always visible
      expect(out).toContain("REAPABLE"); // candidates are NOT declines, so they stay
      expect(code).toBe(1);
      expect(owned.alive()).toBe(true); // K2 means no signal was sent
    } finally {
      owned.kill();
    }
  }, 180_000);

  it("--quiet suppresses a successful `killed` line too", () => {
    const owned = spawnOrphan();
    try {
      const table: Row[] = [{ pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD }];
      const { out } = runCli(["--kill", "--quiet"], table);
      expect(out).not.toContain("killed pid=");
      expect(owned.alive()).toBe(false); // suppressed in the REPORT, still performed
    } finally {
      owned.kill();
    }
  }, 180_000);

  it("--quiet suppresses K1 already-gone too, since it is a plain success", () => {
    const owned = spawnOrphan();
    owned.kill(); // gone BEFORE the reaper runs, so the target reads as already-gone
    const table: Row[] = [{ pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD }];
    const { out } = runCli(["--kill", "--quiet"], table, {
      FAKE_PS_IDENTITY_GONE: String(owned.pid),
    });
    expect(out).not.toContain("already-gone");
  }, 180_000);

  it("--quiet suppresses EVERY decline kind, and --all does not re-enable them", () => {
    const owned = spawnOrphan();
    const LS = "Sun Aug 16 09:35:23 2026";
    try {
      const table: Row[] = [
        { pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
        { pid: 777020, ppid: 1, etime: "00:10", command: WORKER_CMD }, // too-young
        { pid: 777021, ppid: 1, etime: OLD, command: "/usr/bin/pnpm exec vitest run" }, // not-a-worker
        { pid: 777022, ppid: 777021, etime: OLD, command: WORKER_CMD }, // has-live-parent
        `777023 1 zzzz ${LS} /usr/bin/node /x/vitest/dist/workers/forks.js`, // undecidable
        "garbage-line-with-no-pid", // unparsable
      ];
      // --all is the widest report there is, so if quiet is ever ignored this is where it shows.
      const { out } = runCli(["--kill", "--all", "--quiet"], table);
      expect(out).not.toContain("skip ");
      expect(out).toContain("6 rows read"); // summaries survive
      expect(out).toContain("1 candidate(s)");
    } finally {
      owned.kill();
    }
  }, 180_000);

  it("--quiet keeps C1 visible", () => {
    const { out, code } = runCli(["--kill", "--quiet"], [], {
      FX_REAP_PS_BIN: "/definitely/not/a/real/ps",
    });
    expect(out).toContain("ps-unavailable");
    expect(code).toBe(1);
  }, 180_000);

  it("--quiet keeps the row and candidate SUMMARIES, since they are not declines", () => {
    const owned = spawnOrphan();
    try {
      const table: Row[] = [
        { pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
        { pid: 777001, ppid: 1, etime: OLD, command: "/usr/bin/pnpm exec vitest run" },
      ];
      const { out } = runCli(["--kill", "--quiet"], table);
      expect(out).toContain("2 rows read");
      expect(out).toContain("1 candidate(s)");
      expect(out).not.toContain("skip ");
    } finally {
      owned.kill();
    }
  }, 180_000);

  it("--quiet keeps C4 visible", () => {
    const { out, code } = runCli(["--kill", "--quiet"], [], { FX_REAP_MIN_AGE_S: "abc" });
    expect(out).toContain("rejected: abc");
    expect(code).toBe(1);
  }, 180_000);
});

describe("package wiring", () => {
  it("exposes heavy:reap so the tool is reachable by name", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["heavy:reap"]).toBe("tsx scripts/heavy-reap.ts");
  });
});
