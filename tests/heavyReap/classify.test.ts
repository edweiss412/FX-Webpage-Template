import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import {
  DEFAULT_MIN_AGE_SECONDS,
  type ParsedRow,
  type ProcRow,
  type ReapConfig,
  classify,
} from "../../lib/heavyReap/classify";

const NODE = "/Users/x/.nvm/versions/node/v20.20.1/bin/node";
const FORKS = "/Users/x/node_modules/.pnpm/vitest@4.1.5/node_modules/vitest/dist/workers/forks.js";

// LITERAL, never the imported constant. Deriving the fixtures from DEFAULT_MIN_AGE_SECONDS makes
// the suite adapt to a mutant that changes it, so the mutation control and the +1 integer mutant
// both survive. Plan round 1 finding 1.
const CEILING = 14400;

const CONFIG: ReapConfig = {
  minAgeSeconds: CEILING,
  minAgeSource: "default",
  selfPid: 999,
  selfAncestry: [998, 997],
};

function worker(over: Partial<ParsedRow> = {}): ParsedRow {
  return {
    kind: "parsed",
    pid: 100,
    ppid: 1,
    etimeSeconds: CEILING + 1,
    startedAt: "Sun Aug 16 09:35:23 2026",
    command: `${NODE} --experimental-import-meta-resolve ${FORKS}`,
    ...over,
  };
}
const only = (rows: ProcRow[], cfg: ReapConfig = CONFIG) => classify(rows, cfg).decisions[0];

describe("the ceiling constant is pinned, not merely referenced", () => {
  it("DEFAULT_MIN_AGE_SECONDS is exactly 14400 (4 h)", () => {
    expect(DEFAULT_MIN_AGE_SECONDS).toBe(14400);
  });
});

describe("classify: AC-1", () => {
  it("reaps a worker-shaped, orphaned row past the ceiling", () => {
    expect(only([worker()])).toMatchObject({ pid: 100, reap: true });
  });
});

describe("classify: AC-2, exempt at ANY age", () => {
  const ancient = { etimeSeconds: 10 * 365 * 86_400 };

  it("clause (b): a worker with a live parent is never reaped, however old", () => {
    const rows = [
      worker({ ...ancient, ppid: 4242 }),
      worker({ pid: 4242, ppid: 1, command: "sh" }),
    ];
    expect(only(rows)).toMatchObject({ reap: false, because: "has-live-parent" });
  });

  it("clause (a): the pnpm wrapper of a live phase is never reaped, however old", () => {
    expect(
      only([worker({ ...ancient, command: "node /x/bin/pnpm exec vitest run" })]),
    ).toMatchObject({
      reap: false,
      because: "not-a-worker",
    });
  });
});

describe("classify: clause (a) is structural, never containment", () => {
  it.each([
    ["tail", `tail -f ${FORKS}`],
    ["grep", `grep -n forks ${FORKS}`],
    ["cat", `/bin/cat ${FORKS}`],
    ["vim", `vim ${FORKS}`],
    ["shell wrapper", `/bin/zsh -c echo ${FORKS} && pwd`],
    ["non-node argv0", `/usr/bin/python3 ${FORKS}`],
  ])("declines %s, which only MENTIONS an entrypoint", (_label, command) => {
    expect(only([worker({ command })])).toMatchObject({ reap: false, because: "not-a-worker" });
  });

  it.each([
    ["a bare node", "node"],
    ["an absolute node path", NODE],
    ["a lone entrypoint with no interpreter", FORKS],
  ])("declines %s: one token can never satisfy both clauses", (_label, command) => {
    // These pin what the removed `tokens.length < 2` guard was believed to provide. A
    // one-token command has argv0 === last, and no string both has `node` as its basename
    // and ends with an entrypoint suffix, so the two real clauses already reject every
    // single-token command. The guard was dead code and an unkillable equivalent mutant.
    expect(only([worker({ command })])).toMatchObject({ reap: false, because: "not-a-worker" });
  });

  it("declines a node process whose entrypoint is not the last token", () => {
    expect(only([worker({ command: `${NODE} ${FORKS} --reporter=json` })])).toMatchObject({
      reap: false,
      because: "not-a-worker",
    });
  });

  it("accepts every declared entrypoint", () => {
    for (const entry of [
      "vitest/dist/workers/forks.js",
      "vitest/dist/workers/threads.js",
      "vitest/dist/workers/vmForks.js",
      "vitest/dist/workers/vmThreads.js",
      "vitest/dist/workers/runVmTests.js",
      "playwright/lib/worker/workerMain.js",
      "next/dist/compiled/jest-worker/processChild.js",
    ]) {
      expect(only([worker({ command: `${NODE} /x/node_modules/${entry}` })])).toMatchObject({
        reap: true,
      });
    }
  });
});

describe("classify: a QUEUED heavy-slot waiter is never reapable", () => {
  // Raised against this arc as a live defect: a sibling worktree's `pnpm heavy pnpm test`
  // died of SIGTERM while WAITING for a slot, and the reaper was suspected. It was refuted
  // four ways — the reaper only ever sends SIGKILL, it had reported `0 candidate(s)` on
  // every invocation it ever made, the victim's worktree does not wire trigger 1 at all,
  // and the classifier declines its command line at any age and orphaned or not. But the
  // underlying question is a fair one and deserves an executable answer rather than a
  // structural argument, because a waiter genuinely does resemble an orphan: no CPU, no
  // output, blocked indefinitely.
  //
  // These command lines are VERBATIM from this machine's live process table while five
  // waiters were queued, so they are drawn from the probe domain rather than constructed.
  // The discriminator is clause (a): a waiter is the WRAPPER — `python3`, `sh` or `pnpm` —
  // and a worker only ever exists AFTER admission, by which point the phase holds its slot.
  // So no reachable process is both worker-shaped and waiting.
  const WAITERS = [
    [
      "python3 wrapper, the shape that was reported",
      "/Library/Frameworks/Python.framework/Versions/3.12/Resources/Python.app/Contents/MacOS/Python scripts/with-heavy-slot.py -- pnpm test",
    ],
    [
      "python3 wrapper around a scoped vitest run",
      "/Library/Frameworks/Python.framework/Versions/3.12/Resources/Python.app/Contents/MacOS/Python scripts/with-heavy-slot.py -- pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gate.test.ts",
    ],
    [
      "the sh -c form trigger 1 produces",
      "sh -c tsx scripts/heavy-reap.ts --kill --quiet; python3 scripts/with-heavy-slot.py -- pnpm vitest run --project mutation tests/mutation/heavyReapScoped.scratch.test.ts",
    ],
    [
      "the outer node pnpm heavy, argv0 IS node",
      `${NODE} /Users/x/.nvm/versions/node/v20.20.1/bin/pnpm heavy pnpm test`,
    ],
    [
      "outer node pnpm heavy wrapping a vitest run",
      `${NODE} /Users/x/.nvm/versions/node/v20.20.1/bin/pnpm heavy pnpm mutation:guards`,
    ],
  ] as const;

  it.each(WAITERS)("declines %s, at the ceiling and orphaned", (_label, command) => {
    expect(only([worker({ command, ppid: 1, etimeSeconds: CEILING + 1 })])).toMatchObject({
      reap: false,
      because: "not-a-worker",
    });
  });

  it.each(WAITERS)(
    "declines %s at ANY age, so the ceiling is not what saves it",
    (_label, command) => {
      // The ceiling must not be the thing standing between a waiter and a kill: a waiter can
      // outlive it legitimately, since queue time is unbounded under contention and was
      // measured at over 65 minutes on this machine.
      const ancient = 10 * 365 * 86_400;
      expect(only([worker({ command, ppid: 1, etimeSeconds: ancient })])).toMatchObject({
        reap: false,
        because: "not-a-worker",
      });
    },
  );

  it("premise: this fixture would reap if the command were worker-shaped", () => {
    // Without this, every case above could pass because some OTHER clause declines them —
    // the ppid, the age, the self guard — and the suite would be pinning nothing about
    // clause (a). Same row, same ppid, same age, worker command: reaped.
    premiseHolds(
      "the waiter rows differ from a reapable row ONLY in their command",
      only([worker({ ppid: 1, etimeSeconds: CEILING + 1 })])?.reap === true,
    );
  });
});

describe("classify: the age clause boundary", () => {
  it.each([
    [CEILING - 1, false],
    [CEILING, true],
    [CEILING + 1, true],
  ])("age %i => reap %s", (etimeSeconds, reaped) => {
    expect(only([worker({ etimeSeconds })])).toMatchObject({ reap: reaped });
  });

  it("uses the configured ceiling, not the default", () => {
    const cfg: ReapConfig = { ...CONFIG, minAgeSeconds: 60, minAgeSource: "env" };
    expect(only([worker({ etimeSeconds: 61 })], cfg)).toMatchObject({ reap: true });
    expect(only([worker({ etimeSeconds: 59 })], cfg)).toMatchObject({ because: "too-young" });
  });
});

describe("classify: AC-4", () => {
  it.each([
    ["own pid", 999],
    ["an ancestor", 998],
  ])("declines %s", (_label, pid) => {
    expect(only([worker({ pid })])).toMatchObject({ reap: false, because: "self" });
  });
});

describe("classify: AC-3, row-level R1-R4", () => {
  it("R1: an unparsable row survives into decisions", () => {
    const rows: ProcRow[] = [{ kind: "unparsable", raw: "??? garbage", problem: "no pid" }];
    expect(classify(rows, CONFIG).decisions[0]).toMatchObject({
      reap: false,
      because: "unparsable",
    });
  });

  it.each([
    ["R2", { ppid: null }, "undecidable"],
    ["R3", { etimeSeconds: null }, "undecidable"],
    ["R4", { command: "" }, "not-a-worker"],
    ["R5", { startedAt: null }, "undecidable"],
  ] as const)("%s: an undecidable field declines the row", (_id, over, because) => {
    expect(only([worker(over)])).toMatchObject({ reap: false, because });
  });

  it("a ppid naming a process not in the table is undecidable, not an orphan", () => {
    expect(only([worker({ ppid: 31337 })])).toMatchObject({ reap: false, because: "undecidable" });
  });

  it("is TOTAL: one decision per input row", () => {
    const rows: ProcRow[] = [
      worker(),
      worker({ pid: 101, command: "sleep 9" }),
      { kind: "unparsable", raw: "x", problem: "no pid" },
    ];
    expect(classify(rows, CONFIG).decisions).toHaveLength(rows.length);
  });

  it("premise: this fixture DOES contain a reapable row", () => {
    premiseHolds(
      "the totality fixture is not vacuously all-declines",
      classify([worker()], CONFIG).decisions.some((d) => d.reap),
    );
  });
});

describe("classify: C4's rejected ceiling reaches the reporter", () => {
  it("carries the rejected raw value in configNotes", () => {
    const cfg: ReapConfig = { ...CONFIG, minAgeSource: "env", minAgeRejected: "-5" };
    expect(classify([worker()], cfg).configNotes.join(" ")).toContain("-5");
  });

  it("C3: an unset ceiling produces no note", () => {
    expect(classify([worker()], CONFIG).configNotes).toEqual([]);
  });
});
