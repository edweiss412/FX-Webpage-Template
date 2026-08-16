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
