import { describe, it, expect } from "vitest";
import { runCli, runFixtureSplice } from "@/scripts/spec-lint";

const PREMISE_MSG = "Error: premise not met: the header opens a block. ...";

/**
 * The LANDED seam, not a parallel one: `spawn(command, cwd, timeoutMs, mode)`
 * (scripts/spec-lint.ts:53) plus the filesystem calls, and the report is READ
 * FROM A FILE the way the real adapter reads it. A harness inventing its own
 * `run(cmd)` that returns JSON directly can be greened by a helper that never
 * touches the real seam, leaving the CLI unwired (plan review r4).
 *
 * `reportFor` is keyed BY MARKER LINE and the fake runner writes one report
 * entry per spliced file it actually saw, so a mapper that assigns every entry
 * to the first block cannot produce the per-line expectations below.
 */
const harness = (
  opts: {
    dirExists?: boolean;
    throwOnWrite?: boolean;
    spawnOutcome?: "throw" | "timeout" | "signal" | "badjson";
    reportFor?: Record<number, string | null>;
  } = {},
) => {
  const calls: string[] = [];
  const files = new Map<string, string>();
  const dirs = new Set<string>(opts.dirExists ? ["tests/.spec-lint-fixtures-1-1"] : []);
  return {
    calls,
    dirs,
    deps: {
      repoRoot: () => "/repo",
      // Injected, not read from `process`: with the real pid the splice
      // directory name differs on every run and the collision refusal below
      // could never be seeded, so the case that proves the fence would be
      // unreachable.
      pid: () => 1,
      exists: (d: string) => dirs.has(d),
      mkdir: (d: string) => {
        dirs.add(d);
        calls.push(`mkdir:${d}`);
      },
      write: (path: string, body: string) => {
        calls.push(`write:${path}`);
        if (opts.throwOnWrite) throw new Error("ENOSPC");
        files.set(path, body);
      },
      readFile: (path: string) => {
        const body = files.get(path);
        if (body === undefined) throw new Error(`ENOENT ${path}`);
        return body;
      },
      rm: (d: string) => {
        dirs.delete(d);
        calls.push(`rm:${d}`);
      },
      spawn: (command: string, cwd: string, timeoutMs: number, mode: string) => {
        calls.push(`spawn:${mode}:${cwd}:${timeoutMs}:${command}`);
        if (opts.spawnOutcome === "throw") throw new Error("boom");
        // The landed seam returns a SpawnResult -- {status, signal, error,
        // stderr} -- which classifySpawnResult turns into an ExecOutcome. A
        // harness returning the ExecOutcome directly invents a seam the shipped
        // deps do not have: an adapter written against it reads `.kind`, the
        // real spawnSync result has none, and every real timeout and signal
        // would silently classify as "no exit status".
        if (opts.spawnOutcome === "timeout")
          return {
            status: null,
            signal: null,
            error: { code: "ETIMEDOUT", message: "timed out" },
            stderr: "",
          };
        if (opts.spawnOutcome === "signal") return { status: null, signal: "SIGKILL", stderr: "" };
        // One report entry per file the adapter actually wrote, named by that
        // file, so the mapping under test is filename -> marker line.
        const testResults = [...files.keys()].map((path) => {
          const line = Number(/(\d+)/.exec(path.split("/").pop() ?? "")?.[1] ?? -1);
          const msg = opts.reportFor?.[line] ?? null;
          return {
            name: path,
            status: msg === null ? "passed" : "failed",
            message: "",
            assertionResults: [
              {
                status: msg === null ? "passed" : "failed",
                title: "t0",
                failureMessages: msg === null ? [] : [msg],
              },
            ],
          };
        });
        const body =
          opts.spawnOutcome === "badjson" ? "{not json" : JSON.stringify({ testResults });
        files.set(`${[...dirs][0]}/report.json`, body);
        return { status: msgAny(opts.reportFor) ? 1 : 0, signal: null, stderr: "" };
      },
    },
  };
};
const msgAny = (r?: Record<number, string | null>) =>
  Object.values(r ?? {}).some((v) => v !== null);
const plan = [{ line: 3, block: "// b" }];

describe("splice lifecycle (spec section 4.2)", () => {
  it("a pre-existing directory spawns NOTHING, writes NOTHING, and REMOVES nothing", () => {
    const h = harness({ dirExists: true });
    const out = runFixtureSplice(plan, h.deps as never);
    expect(h.calls.filter((c) => c.startsWith("spawn:"))).toEqual([]);
    expect(h.calls.filter((c) => c.startsWith("write:"))).toEqual([]);
    // A broad finally that deletes the directory would destroy ANOTHER live
    // invocation's splice -- the collision is a refusal, not a takeover.
    expect(h.calls.filter((c) => c.startsWith("rm:"))).toEqual([]);
    expect([...h.dirs]).toEqual(["tests/.spec-lint-fixtures-1-1"]);
    expect(out.findings.map((f) => f.code)).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
  });

  it("uses the LANDED spawn seam: repo root, the ceiling, and exec mode", () => {
    const h = harness();
    runFixtureSplice(plan, h.deps as never);
    const spawns = h.calls.filter((c) => c.startsWith("spawn:"));
    expect(spawns).toHaveLength(1);
    const [, mode, cwd, timeoutMs, ...rest] = spawns[0]!.split(":");
    expect(mode).toBe("exec");
    expect(cwd).toBe("/repo");
    expect(Number(timeoutMs)).toBeGreaterThan(0);
    expect(rest.join(":")).toContain("--reporter=json");
  });

  it("exactly ONE spawn per doc, whatever the block count", () => {
    const h = harness();
    runFixtureSplice(
      [1, 2, 3].map((line) => ({ line, block: "// b" })),
      h.deps as never,
    );
    expect(h.calls.filter((c) => c.startsWith("spawn:"))).toHaveLength(1);
    expect(h.calls.filter((c) => c.startsWith("write:"))).toHaveLength(3);
  });

  it("each spliced filename carries its marker line AND a collectable suffix", () => {
    const h = harness();
    runFixtureSplice(
      [7, 42].map((line) => ({ line, block: "// b" })),
      h.deps as never,
    );
    const written = h.calls
      .filter((c) => c.startsWith("write:"))
      .map((c) => c.slice("write:".length));
    expect(written).toHaveLength(2);
    expect(written[0]).toMatch(/(^|\D)7\D[^/]*\.test\.ts$/);
    expect(written[1]).toMatch(/(^|\D)42\D[^/]*\.test\.ts$/);
  });

  it("report entries map back to the RIGHT marker line, proved with two blocks", () => {
    // The report carries a sentinel for line 42 ONLY. A mapper that assigns the
    // first entry to the first block puts the verdict on 7 and fails here.
    const h = harness({ reportFor: { 7: null, 42: PREMISE_MSG } });
    const out = runFixtureSplice(
      [7, 42].map((line) => ({ line, block: "// b" })),
      h.deps as never,
    );
    expect(out.findings.map((f) => `${f.docLine}:${f.code}`)).toEqual(["42:FIXTURE_UNSATISFIABLE"]);
  });

  it("the ASSERTION channel is forwarded: a failure message reaches the core verbatim", () => {
    const h = harness({ reportFor: { 3: PREMISE_MSG } });
    const out = runFixtureSplice(plan, h.deps as never);
    expect(out.results.files.get(3)!.failureMessages.join(" ")).toContain(
      "premise not met: the header opens a block",
    );
    expect(out.findings.map((f) => f.code)).toEqual(["FIXTURE_UNSATISFIABLE"]);
  });

  it("the directory is removed on EVERY failure path, and each still DECLINES", () => {
    for (const spawnOutcome of ["throw", "timeout", "signal", "badjson"] as const) {
      const h = harness({ spawnOutcome });
      const out = runFixtureSplice(plan, h.deps as never);
      expect(
        h.calls.some((c) => c.startsWith("rm:")),
        `spawn outcome ${spawnOutcome}`,
      ).toBe(true);
      expect([...h.dirs]).toEqual([]);
      expect(
        out.findings.map((f) => f.code),
        `spawn outcome ${spawnOutcome}`,
      ).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
    }
    // The failure BEFORE the runner. Cleanup scoped to the spawn alone leaks the
    // directory, and swallowing the error returns no finding at all -- both are
    // ordinary implementations, and the closed claim set forbids the second.
    const w = harness({ throwOnWrite: true });
    const out = runFixtureSplice(plan, w.deps as never);
    expect(w.calls.some((c) => c.startsWith("rm:"))).toBe(true);
    expect([...w.dirs]).toEqual([]);
    expect(w.calls.filter((c) => c.startsWith("spawn:"))).toEqual([]);
    expect(out.findings.map((f) => f.code)).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
  });

  it("runCli --exec-red actually INVOKES the splice and passes its results on", () => {
    // Without this, a correct helper can sit beside a CLI that never calls it:
    // every case above would pass and the shipped tool would do nothing.
    const h = harness({ reportFor: { 3: PREMISE_MSG } });
    // The blank line is load-bearing: it puts the marker on line 3, which is
    // the line the shared `plan` and this harness's `reportFor` are both keyed
    // to. Authored without it, the marker sat on line 2, the report carried an
    // entry for line 3 alone, and NO correct implementation could produce a
    // finding -- only one that assigns every report entry to the first block,
    // which the "map back to the RIGHT marker line" case above forbids.
    const doc = ["# P", "", "<!-- fixture: why=`w` -->", "```ts", "// b", "```"].join("\n");
    const res = runCli(["--exec-red", "docs/superpowers/plans/x.md"], {
      ...h.deps,
      // The five CliDeps members runCli needs beyond the splice seam. The
      // authored version passed a `readDoc` the shipped CLI does not have and
      // omitted these: runCli would have thrown into its own outer catch and
      // returned exit 2 with empty stdout, so the case could only ever have
      // failed -- and had it been "repaired" by adding readDoc to the CLI, it
      // would have proved a seam that exists for the test alone.
      cwd: () => "/repo",
      listTrackedFiles: () => [] as string[],
      lstatKind: (p: string) => (p === "/repo/docs/superpowers/plans/x.md" ? "file" : "missing"),
      realpath: (p: string) => p,
      readFileBytes: () => Buffer.from(doc, "utf8"),
    } as never);
    expect(h.calls.filter((c) => c.startsWith("spawn:"))).toHaveLength(1);
    expect(res.stdout).toContain("FIXTURE_UNSATISFIABLE");
    expect(res.exitCode).toBe(1);
  });
});
describe("splice lifecycle — shapes the authored block leaves unpinned", () => {
  it("an empty plan touches nothing at all: no directory, no write, no spawn", () => {
    // Every plan-kind --exec-red invocation reaches this call, and today no
    // tracked plan carries a marker (spec §2.2). An implementation that mkdirs
    // first and asks questions later would boot vitest on every lint.
    const h = harness();
    const out = runFixtureSplice([], h.deps as never);
    expect(h.calls).toEqual([]);
    expect([...h.dirs]).toEqual([]);
    expect(out.findings).toEqual([]);
    expect([...out.results.files.keys()]).toEqual([]);
  });

  it("a report entry whose filename is not a spliced block is ignored", () => {
    // The report is keyed by filename, and a mapper that pulls any digit run
    // out of any name would attribute a foreign file's failure to a block.
    const h = harness();
    const strayed = {
      ...h.deps,
      spawn: (command: string, cwd: string, timeoutMs: number, mode: string) => {
        h.calls.push(`spawn:${mode}:${cwd}:${timeoutMs}:${command}`);
        const dir = [...h.dirs][0];
        h.deps.write(
          `${dir}/report.json`,
          JSON.stringify({
            testResults: [
              {
                name: `${dir}/some-other-3.test.ts`,
                status: "failed",
                message: "",
                assertionResults: [
                  { status: "failed", title: "t", failureMessages: [PREMISE_MSG] },
                ],
              },
            ],
          }),
        );
        return { status: 1, signal: null, stderr: "" };
      },
    };
    const out = runFixtureSplice(plan, strayed as never);
    // No result for line 3, so the block draws the advisory rather than a
    // verdict borrowed from a file it does not own.
    expect(out.findings.map((f) => f.code)).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
  });

  it("the advisory reason DISTINGUISHES the failure paths from one another", () => {
    // "not observed" with no reason leaves the author guessing between a stale
    // directory, a timeout, a kill, and unreadable JSON -- four different
    // repairs.
    const reasons = new Set<string>();
    for (const spawnOutcome of ["throw", "timeout", "signal", "badjson"] as const) {
      const h = harness({ spawnOutcome });
      reasons.add(runFixtureSplice(plan, h.deps as never).findings[0]!.detail ?? "");
    }
    reasons.add(
      runFixtureSplice(plan, harness({ dirExists: true }).deps as never).findings[0]!.detail ?? "",
    );
    expect(reasons.size).toBe(5);
    expect([...reasons].every((r) => r.length > 0)).toBe(true);
  });
});
