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
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("lsRemote passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn(`${OID}\trefs/heads/main`);
    expect(realGitSurface({ spawn: fake }).lsRemote().get("main")).toBe(OID);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("localRefs passes LS_REMOTE_MS=30000 and now MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn(`${OID} refs/remotes/origin/feat/x`);
    expect(realGitSurface({ spawn: fake }).localRefs().get("feat/x")).toBe(OID);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("prList passes GH_MS=10000 and now MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn("[]");
    expect(realGitSurface({ spawn: fake }).prList()).toEqual([]);
    expect(calls[0]?.opts.timeout).toBe(10_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("mergedIntoMain passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn(`origin/feat/x ${OID}`);
    expect(realGitSurface({ spawn: fake }).mergedIntoMain(OID).get("origin/feat/x")).toBe(OID);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("fileOids passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    // The ls-tree row shape the parser splits on: `<mode> blob <oid>\t<path>`.
    const { calls, fake } = recordingSpawn(`100644 blob ${OID}\tBACKLOG.md`);
    const oids = realGitSurface({ spawn: fake }).fileOids("origin/main", ["BACKLOG.md"]);
    expect(oids.get("BACKLOG.md")).toBe(OID);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("readBlob passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn("ledger text");
    expect(realGitSurface({ spawn: fake }).readBlob(OID)).toBe("ledger text");
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("showFile passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn("ledger text");
    expect(realGitSurface({ spawn: fake }).showFile("origin/main", "BACKLOG.md")).toBe(
      "ledger text",
    );
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("mergeBase passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn(`${OID}\n`);
    expect(realGitSurface({ spawn: fake }).mergeBase("origin/feat/x", OID)).toBe(OID);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("diffHunks passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn("+++ b/BACKLOG.md\n@@ -1,0 +4,2 @@");
    expect(realGitSurface({ spawn: fake }).diffHunks(OID, "origin/feat/x", ["BACKLOG.md"])).toEqual(
      [{ file: "BACKLOG.md", start: 4, count: 2 }],
    );
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("tipEpoch passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    // A finite positive epoch: the reader throws on anything else, so an empty
    // fixture would fail for a reason unrelated to the spawn options.
    const { calls, fake } = recordingSpawn("1755000000\n");
    expect(realGitSurface({ spawn: fake }).tipEpoch("origin/feat/x")).toBe(1_755_000_000);
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("isShallow passes LS_REMOTE_MS=30000 and MAX_GIT_STDOUT", () => {
    // Parsed as the literal string git prints; anything else throws.
    const { calls, fake } = recordingSpawn("false\n");
    expect(realGitSurface({ spawn: fake }).isShallow()).toBe(false);
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
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });
});
