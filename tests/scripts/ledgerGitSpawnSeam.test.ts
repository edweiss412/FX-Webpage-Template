/**
 * The spawn seam is what makes ledger-git's four spawn-bound constants
 * observable. Before it, `FETCH_MS`, `LS_REMOTE_MS`, `GH_MS`, and
 * `MAX_GIT_STDOUT` were reachable only by a child process running long enough
 * or printing more than the bound — so a 30000-to-30001 mutant separated no
 * behavior any suite could see, and all six sat in the mutation ledger as
 * accepted gaps (BL-LEDGER-GIT-TIMEOUT-CONSTANTS).
 *
 * Each case's failure mode is "the constant changed at source": the expected
 * literal lives here, so a mutated source value diverges from the recorded
 * spawn option and the case goes red. Canned stdout per reader is derived from
 * what that reader actually parses — a fixture the parser ignores would leave
 * the reader unexercised while the option assertion stayed green.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { spawnSync } from "node:child_process";

import { realGitSurface } from "@/scripts/lib/ledger-git";
import { premise } from "@/tests/_shared/premise";

type SpawnArgs = { cmd: string; args: string[]; opts: Record<string, unknown> };

function recordingSpawn(stdout = "") {
  const calls: SpawnArgs[] = [];
  const fake = ((cmd: string, args: string[], opts: Record<string, unknown>) => {
    calls.push({ cmd, args, opts });
    return { status: 0, stdout, stderr: "", error: undefined, signal: null };
  }) as unknown as typeof spawnSync;
  return { calls, fake };
}

const MAX = 64 * 1024 * 1024;
const OID = "a".repeat(40);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ledger-git spawn seam pins the timeout and maxBuffer constants", () => {
  it("fetch passes FETCH_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn();
    realGitSurface({ spawn: fake }).fetch();
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("lsRemote passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn(`${OID}\trefs/heads/main`);
    expect(realGitSurface({ spawn: fake }).lsRemote().get("main")).toBe(OID);
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("localRefs passes LS_REMOTE_MS=30000 and now MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn(`${OID} refs/remotes/origin/feat/x`);
    expect(realGitSurface({ spawn: fake }).localRefs().get("feat/x")).toBe(OID);
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("prList passes GH_MS=10000 and now MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn("[]");
    expect(realGitSurface({ spawn: fake }).prList()).toEqual([]);
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(10_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("mergedIntoMain passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn(`origin/feat/x ${OID}`);
    expect(realGitSurface({ spawn: fake }).mergedIntoMain(OID).get("origin/feat/x")).toBe(OID);
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("fileOids passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    // The ls-tree row shape the parser splits on: `<mode> blob <oid>\t<path>`.
    const { calls, fake } = recordingSpawn(`100644 blob ${OID}\tBACKLOG.md`);
    const oids = realGitSurface({ spawn: fake }).fileOids("origin/main", ["BACKLOG.md"]);
    expect(oids.get("BACKLOG.md")).toBe(OID);
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("readBlob passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn("ledger text");
    expect(realGitSurface({ spawn: fake }).readBlob(OID)).toBe("ledger text");
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("showFile passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn("ledger text");
    expect(realGitSurface({ spawn: fake }).showFile("origin/main", "BACKLOG.md")).toBe(
      "ledger text",
    );
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("mergeBase passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn(`${OID}\n`);
    expect(realGitSurface({ spawn: fake }).mergeBase("origin/feat/x", OID)).toBe(OID);
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("diffHunks passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn("+++ b/BACKLOG.md\n@@ -1,0 +4,2 @@");
    expect(realGitSurface({ spawn: fake }).diffHunks(OID, "origin/feat/x", ["BACKLOG.md"])).toEqual(
      [{ file: "BACKLOG.md", start: 4, count: 2 }],
    );
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("tipEpoch passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    // A finite positive epoch: the reader throws on anything else, so an empty
    // fixture would fail for a reason unrelated to the spawn options.
    const { calls, fake } = recordingSpawn("1755000000\n");
    expect(realGitSurface({ spawn: fake }).tipEpoch("origin/feat/x")).toBe(1_755_000_000);
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("isShallow passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    // Parsed as the literal string git prints; anything else throws.
    const { calls, fake } = recordingSpawn("false\n");
    expect(realGitSurface({ spawn: fake }).isShallow()).toBe(false);
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("currentBranch passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    // Environment premise: with GitHub Actions variables set the reader returns
    // GITHUB_HEAD_REF WITHOUT spawning (scripts/lib/ledger-git.ts:313-316), and
    // the PR unit workflow sets them (.github/workflows/unit-suite.yml:90-92) —
    // so without these stubs `calls` is empty in CI while green locally.
    vi.stubEnv("GITHUB_ACTIONS", "");
    vi.stubEnv("GITHUB_HEAD_REF", "");
    // Deliberately NOT this worktree's branch: an identical name would let the
    // value assertion pass off the real checkout rather than off the fake.
    const { calls, fake } = recordingSpawn("feat/seam-fixture-branch\n");
    expect(realGitSurface({ spawn: fake }).currentBranch()).toBe("feat/seam-fixture-branch");
    premise("the reader routed a spawn through the injected seam", calls.length, 0);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });
});

function faultSpawn(result: Partial<ReturnType<typeof spawnSync>>) {
  return ((..._a: unknown[]) => ({
    status: 0,
    stdout: "",
    stderr: "",
    error: undefined,
    signal: null,
    ...result,
  })) as unknown as typeof spawnSync;
}

/**
 * A spawn-level fault used to read as an EMPTY open-PR universe: `prList`
 * returned `[]` for a non-zero exit and never looked at `r.error` at all, so
 * ENOBUFS, a gh timeout, or a missing gh binary silently shrank the claim
 * universe into a false "no collision" — the exact defect invariant 12 exists
 * to stop. The row cases are DERIVED, not enumerated: one missing and one
 * wrong-type case per field `PrRow` actually consumes, so a new consumed field
 * without its pair is visible in review as a hole in the matrix.
 */
describe("prList fault + malformed-output contract (spec §3.4)", () => {
  // [label, spawn result, expected message]. The MESSAGE is asserted, not merely that
  // something threw: a TypeError from dereferencing a shape the validator was supposed to
  // reject also "throws", and three mutants survived this matrix while it said only
  // `toThrow()` — the fallback that turns an empty stderr into `status <n>`, the
  // null-row coercion, and the non-object owner branch.
  const cases: Array<[string, Partial<ReturnType<typeof spawnSync>>, RegExp]> = [
    [
      "spawn error object",
      { error: Object.assign(new Error("ENOBUFS"), { code: "ENOBUFS" }), status: null },
      /ENOBUFS/,
    ],
    [
      "non-zero exit with stderr",
      { status: 1, stdout: "[]", stderr: "gh: not logged in" },
      /gh pr list failed: gh: not logged in/,
    ],
    ["non-zero exit with NO stderr", { status: 1, stdout: "[]" }, /gh pr list failed: status 1/],
    ["empty stdout", { status: 0, stdout: "" }, /empty stdout on exit 0/],
    ["invalid JSON", { status: 0, stdout: "not-json" }, /invalid JSON on exit 0/],
    ["non-array JSON", { status: 0, stdout: "{}" }, /non-array payload/],
    ["a null row", { status: 0, stdout: "[null]" }, /row 0: number is not numeric/],
    [
      "row missing number",
      { status: 0, stdout: JSON.stringify([{ headRefName: "b", isCrossRepository: false }]) },
      /row 0: number is not numeric/,
    ],
    [
      "row non-numeric number",
      {
        status: 0,
        stdout: JSON.stringify([{ number: "7", headRefName: "b", isCrossRepository: false }]),
      },
      /row 0: number is not numeric/,
    ],
    [
      "row missing headRefName",
      { status: 0, stdout: JSON.stringify([{ number: 7, isCrossRepository: false }]) },
      /headRefName is not a non-empty string/,
    ],
    [
      "row empty headRefName",
      {
        status: 0,
        stdout: JSON.stringify([{ number: 7, headRefName: "", isCrossRepository: false }]),
      },
      /headRefName is not a non-empty string/,
    ],
    [
      "row non-string headRefName",
      {
        status: 0,
        stdout: JSON.stringify([{ number: 7, headRefName: 42, isCrossRepository: false }]),
      },
      /headRefName is not a non-empty string/,
    ],
    [
      "row missing isCrossRepository",
      { status: 0, stdout: JSON.stringify([{ number: 7, headRefName: "b" }]) },
      /isCrossRepository is not boolean/,
    ],
    [
      "row non-boolean isCrossRepository",
      {
        status: 0,
        stdout: JSON.stringify([{ number: 7, headRefName: "b", isCrossRepository: "no" }]),
      },
      /isCrossRepository is not boolean/,
    ],
    [
      "owner with non-string login",
      {
        status: 0,
        stdout: JSON.stringify([
          {
            number: 7,
            headRefName: "b",
            isCrossRepository: false,
            headRepositoryOwner: { login: 9 },
          },
        ]),
      },
      /headRepositoryOwner\.login is not a string/,
    ],
    [
      "owner as string",
      {
        status: 0,
        stdout: JSON.stringify([
          { number: 7, headRefName: "b", isCrossRepository: false, headRepositoryOwner: "owner" },
        ]),
      },
      /headRepositoryOwner is not an object/,
    ],
    [
      "owner as number",
      {
        status: 0,
        stdout: JSON.stringify([
          { number: 7, headRefName: "b", isCrossRepository: false, headRepositoryOwner: 7 },
        ]),
      },
      /headRepositoryOwner is not an object/,
    ],
    [
      "owner as boolean",
      {
        status: 0,
        stdout: JSON.stringify([
          { number: 7, headRefName: "b", isCrossRepository: false, headRepositoryOwner: true },
        ]),
      },
      /headRepositoryOwner is not an object/,
    ],
    [
      "owner as array",
      {
        status: 0,
        stdout: JSON.stringify([
          { number: 7, headRefName: "b", isCrossRepository: false, headRepositoryOwner: [] },
        ]),
      },
      /headRepositoryOwner is not an object/,
    ],
    [
      "owner as empty object (login absent)",
      {
        status: 0,
        stdout: JSON.stringify([
          { number: 7, headRefName: "b", isCrossRepository: false, headRepositoryOwner: {} },
        ]),
      },
      /headRepositoryOwner\.login is not a string/,
    ],
  ];

  it.each(cases)("throws on %s", (_label, result, message) => {
    // no-premise: the spawn result is CONSTRUCTED by the case and injected through the seam, so no environment condition gates this assertion — the fault is the fixture.
    expect(() => realGitSurface({ spawn: faultSpawn(result) }).prList()).toThrow(message);
  });

  it("returns rows for a clean well-formed payload, and [] for a clean empty one", () => {
    // no-premise: the spawn result is CONSTRUCTED by the case and injected through the seam, so no environment condition gates this assertion — the fault is the fixture.
    const good = JSON.stringify([
      {
        number: 7,
        headRefName: "b",
        headRepositoryOwner: { login: "x" },
        isCrossRepository: false,
      },
    ]);
    expect(realGitSurface({ spawn: faultSpawn({ status: 0, stdout: good }) }).prList()).toEqual([
      { number: 7, headRefName: "b", headRepositoryOwner: "x", isCrossRepository: false },
    ]);
    expect(realGitSurface({ spawn: faultSpawn({ status: 0, stdout: "[]" }) }).prList()).toEqual([]);
  });

  it("accepts an absent or null owner, which gh omits for a deleted account", () => {
    // no-premise: the spawn result is CONSTRUCTED by the case and injected through the seam, so no environment condition gates this assertion — the fault is the fixture.
    const rows = (owner: unknown) =>
      realGitSurface({
        spawn: faultSpawn({
          status: 0,
          stdout: JSON.stringify([
            owner === undefined
              ? { number: 7, headRefName: "b", isCrossRepository: false }
              : {
                  number: 7,
                  headRefName: "b",
                  isCrossRepository: false,
                  headRepositoryOwner: owner,
                },
          ]),
        }),
      }).prList();
    expect(rows(undefined)[0]?.headRepositoryOwner).toBeNull();
    expect(rows(null)[0]?.headRepositoryOwner).toBeNull();
  });
});
