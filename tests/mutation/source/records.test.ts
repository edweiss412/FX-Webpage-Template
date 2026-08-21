import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";

import { premiseHolds } from "../../_shared/premise";
import {
  DEFAULT_RECORD_DIR,
  MIN_RETAINED_PER_SURFACE,
  type RunRecord,
  listRecords,
  newRunId,
  parseRecordFileName,
  prune,
  readRunRecord,
  recordDir,
  recordFileName,
  emitRunRecord,
  writeRunRecord,
} from "./records";

/**
 * The durable per-run sink (spec §5.2), AC-12 through AC-18.
 *
 * The load-bearing case here is AC-16: a latest-only writer — one file named for
 * the surface id alone — passes existence, the environment matrix, entry count
 * and whole-entry round-trip, because each of those exercises a SINGLE write.
 * Only running a surface twice and requiring BOTH records to survive can tell
 * the two apart, and that is exactly the sequence `BACKLOG.md:108` instructs an
 * operator to perform before acting on a stale-row report.
 */

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fx-records-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A partial env, cast deliberately: these cases exercise an EMPTY env too, so
 * spreading `process.env` would let an ambient MUTATION_RECORD_DIR decide the
 * outcome instead of the argument. */
const asEnv = (o: Record<string, string>): NodeJS.ProcessEnv => o as unknown as NodeJS.ProcessEnv;

const child = (suite: string, durationMs: number) =>
  ({ suite, kind: "exit", exitCode: 0, durationMs }) as const;

const record = (surfaceId: string, runId: string, over: Partial<RunRecord> = {}): RunRecord => ({
  surfaceId,
  runId,
  startedAt: "2026-08-21T00:00:00.000Z",
  passed: true,
  score: 1,
  outcomes: [
    { siteId: "op:1:1:a", verdict: "KILLED", children: [child("a.test.ts", 11)] },
    {
      siteId: "op:2:2:b",
      verdict: "SURVIVED",
      children: [child("a.test.ts", 22), child("b.test.ts", 33)],
    },
  ],
  ...over,
});

describe("records — the sink is addressed and isolated (AC-18)", () => {
  it("names a file by BOTH the surface id and the run discriminator, separately readable", () => {
    const name = recordFileName("ledgerGit", "20260821-021500-4242-0001");
    expect(name).toContain("ledgerGit");
    expect(name).toContain("20260821-021500-4242-0001");
    // Not an opaque token: the components round-trip, so a reader listing the
    // directory can attribute a file without opening it and `prune` can group by
    // surface from the name alone.
    expect(parseRecordFileName(name)).toEqual({
      surfaceId: "ledgerGit",
      runId: "20260821-021500-4242-0001",
    });
  });

  it("redirects the WHOLE SET through MUTATION_RECORD_DIR, not one file", () => {
    expect(recordDir(asEnv({}))).toBe(DEFAULT_RECORD_DIR);
    expect(recordDir(asEnv({ MUTATION_RECORD_DIR: "/elsewhere" }))).toBe("/elsewhere");
    // An empty value is NOT a redirect to the empty path — that would write into
    // the process cwd and read as configured.
    expect(recordDir(asEnv({ MUTATION_RECORD_DIR: "" }))).toBe(DEFAULT_RECORD_DIR);
  });

  it("writes into the override and NOT into the default directory", () => {
    // A UNIQUE surface id, so a pre-existing `.mutation-records/` from an
    // unrelated run cannot confound the negative half, and so the negative half
    // can genuinely FAIL: a sink that ignored the override would land a record
    // for THIS id in the default directory and the count below would be 1.
    const unique = `isolation-probe-${process.pid}-${Date.now()}`;
    premiseHolds(
      "the default directory holds no record for this id yet, or the negative half proves nothing",
      listRecords(DEFAULT_RECORD_DIR, unique).length === 0,
    );
    const written = writeRunRecord(record(unique, newRunId()), {
      env: asEnv({ MUTATION_RECORD_DIR: dir }),
    });
    expect(written.kind).toBe("written");
    expect(listRecords(dir, unique)).toHaveLength(1);
    // The negative half is the one that matters: a sink hard-coded to the default
    // satisfies every other record AC while a determinism run and a gate run mix
    // records in the very channel built for attribution.
    expect(listRecords(DEFAULT_RECORD_DIR, unique)).toEqual([]);
  });
});

describe("records — two consecutive runs both persist (AC-16)", () => {
  it("keeps BOTH records when the same surface is run twice", () => {
    const first = record("ledgerGit", newRunId());
    const w1 = writeRunRecord(first, { dir });
    premiseHolds("the first write landed", w1.kind === "written");

    const second = record("ledgerGit", newRunId(), { passed: false, score: 0.5 });
    premiseHolds(
      "the two runs carry DIFFERENT discriminators, or this case cannot discriminate",
      first.runId !== second.runId,
    );
    const w2 = writeRunRecord(second, { dir });
    expect(w2.kind).toBe("written");

    const files = listRecords(dir, "ledgerGit");
    expect(files).toHaveLength(2);

    // And the FIRST still holds its ORIGINAL entries — a writer that keeps two
    // files but rewrites the older one is the same defect wearing two filenames.
    const paths = files.map((f) => join(dir, f));
    const read = paths.map(readRunRecord);
    expect(read.map((r) => r.runId).sort()).toEqual([first.runId, second.runId].sort());
    const readFirst = read.find((r) => r.runId === first.runId);
    expect(readFirst?.outcomes).toEqual(first.outcomes);
    expect(readFirst?.passed).toBe(true);
    expect(readFirst?.score).toBe(1);
  });
});

describe("records — a record round-trips as WHOLE ENTRIES (AC-13)", () => {
  it("binds siteId, verdict and children together, with distinguishable children", () => {
    const r = record("s", newRunId());
    premiseHolds(
      "the fixture's children are DISTINGUISHABLE, or a writer shifting arrays between entries passes",
      JSON.stringify(r.outcomes[0]!.children) !== JSON.stringify(r.outcomes[1]!.children),
    );
    const w = writeRunRecord(r, { dir });
    premiseHolds("the write landed", w.kind === "written");
    const back = readRunRecord((w as { path: string }).path);
    // Deep equality on ALL THREE fields, as a set. Checking `children` alone, or
    // the entry COUNT alone, admits a writer that binds correct evidence to the
    // WRONG mutant — right children, stale or constant siteId — which is wrong
    // attribution, the direction the consequence bound forbids.
    expect(back.outcomes).toEqual(r.outcomes);
    expect(back.surfaceId).toBe(r.surfaceId);
    expect(back.runId).toBe(r.runId);
  });
});

describe("records — pruning never discards run N-1 (AC-17)", () => {
  it("EXCEEDS the cap, removes the OLDEST, and keeps the immediately-previous run", () => {
    const cap = 3;
    const ids: string[] = [];
    for (let i = 0; i < cap + 2; i += 1) {
      const id = newRunId(Date.UTC(2026, 7, 21, 0, 0, i));
      ids.push(id);
      writeRunRecord(record("s", id), { dir, cap });
    }
    premiseHolds(
      "the cap was genuinely EXCEEDED, or nothing is pruned and the case is vacuous",
      ids.length > cap,
    );

    const kept = listRecords(dir, "s").map((f) => parseRecordFileName(f)!.runId);
    expect(kept).toHaveLength(cap);
    // The pruned set is the OLDEST, and the immediately-previous run survives.
    const newest = ids[ids.length - 1] as string;
    const previous = ids[ids.length - 2] as string;
    expect(kept).toContain(newest);
    expect(kept).toContain(previous);
    expect(kept).not.toContain(ids[0] as string);
  });

  it("refuses a cap that could evict run N-1, whatever it is handed", () => {
    // A cap of one destroys the comparison the sink exists to support — the same
    // defect as overwriting, arriving later. The floor makes it unrepresentable
    // rather than merely discouraged.
    for (const id of [1, 2, 3].map((i) => newRunId(Date.UTC(2026, 7, 21, 0, 0, i)))) {
      writeRunRecord(record("s", id), { dir, cap: 1 });
    }
    expect(listRecords(dir, "s").length).toBeGreaterThanOrEqual(MIN_RETAINED_PER_SURFACE);
  });

  it("prunes PER SURFACE, so a noisy surface cannot evict a quiet one's history", () => {
    for (let i = 0; i < 6; i += 1) {
      writeRunRecord(record("noisy", newRunId(Date.UTC(2026, 7, 21, 0, 0, i))), { dir, cap: 2 });
    }
    writeRunRecord(record("quiet", newRunId(Date.UTC(2026, 7, 21, 1, 0, 0))), { dir, cap: 2 });
    writeRunRecord(record("quiet", newRunId(Date.UTC(2026, 7, 21, 1, 0, 1))), { dir, cap: 2 });
    // A pruner keyed on total directory size passes the cap assertions above and
    // fails here, which is why the AC names that implementation by shape.
    expect(listRecords(dir, "quiet")).toHaveLength(2);
    expect(listRecords(dir, "noisy")).toHaveLength(2);
  });

  it("ignores files it did not write rather than deleting a stranger's", () => {
    writeFileSync(join(dir, "not-a-record.txt"), "x");
    writeFileSync(join(dir, "README"), "x");
    prune(dir, 1);
    expect(readdirSync(dir).sort()).toEqual(["README", "not-a-record.txt"]);
  });
});

describe("records — a write failure is ADDITIVE (AC-14)", () => {
  it("reports on stderr, returns a typed failure, and NEVER throws", () => {
    const unwritable = mkdtempSync(join(tmpdir(), "fx-records-ro-"));
    chmodSync(unwritable, 0o500);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const target = join(unwritable, "nested");
      premiseHolds(
        "the directory really is unwritable, or this case proves nothing",
        !existsSync(target),
      );
      let result: ReturnType<typeof writeRunRecord> | undefined;
      // BOTH halves are required: a silent swallow rebuilds the blind spot, an
      // uncaught exception changes pass/fail.
      expect(() => {
        result = writeRunRecord(record("s", newRunId()), { dir: target });
      }).not.toThrow();
      expect(result?.kind).toBe("failed");
      const emitted = stderr.mock.calls.map((c) => String(c[0])).join("");
      expect(emitted).toContain("mutation record");
      expect(emitted).toContain("does not change the gate's verdict");
    } finally {
      stderr.mockRestore();
      chmodSync(unwritable, 0o700);
      rmSync(unwritable, { recursive: true, force: true });
    }
  });
});

describe("records — written for all four cells of {passing, failing} x {CI, local} (AC-12)", () => {
  it.each([
    ["passing local", true, {}],
    ["passing CI", true, { CI: "true" }],
    ["failing local", false, {}],
    ["failing CI", false, { CI: "true" }],
  ])("%s", (label, passed, envOver) => {
    const cell = mkdtempSync(join(tmpdir(), "fx-records-cell-"));
    try {
      const outcomes = record("s", "x").outcomes;
      const result = emitRunRecord({
        surfaceId: "s",
        passed,
        score: passed ? 1 : 0.5,
        outcomes,
        dir: cell,
        env: asEnv(envOver as Record<string, string>),
      });
      expect(result.kind, label).toBe("written");
      const files = listRecords(cell, "s");
      expect(files, label).toHaveLength(1);
      const back = readRunRecord(join(cell, files[0] as string));
      // The ENTRY COUNT, not merely existence: a writer that creates the file and
      // serializes nothing satisfies an existence check in all four cells.
      expect(back.outcomes, label).toHaveLength(outcomes.length);
      expect(back.passed, label).toBe(passed);
    } finally {
      rmSync(cell, { recursive: true, force: true });
    }
  });
});

describe("workflow — the source-shards JOB uploads the records directory (AC-11)", () => {
  it("resolves the step by JOB, not by searching the file", () => {
    const wf = parseYaml(readFileSync(".github/workflows/mutation-harness.yml", "utf8")) as {
      jobs: Record<
        string,
        { steps?: { uses?: string; if?: string; with?: Record<string, string> }[] }
      >;
    };
    const job = wf.jobs["source-shards"];
    premiseHolds("the source-shards job still exists", job !== undefined);
    const steps = job!.steps ?? [];
    premiseHolds("it has steps to search", steps.length > 0);

    const uploads = steps.filter(
      (s) => typeof s.uses === "string" && s.uses.startsWith("actions/upload-artifact"),
    );
    const records = uploads.filter((s) => String(s.with?.path ?? "").includes(DEFAULT_RECORD_DIR));
    // The surfaces run in the `source-shards` MATRIX, so a correct step under
    // `source-gates` uploads nothing and all four shard workspaces are still
    // discarded — which a file-scoped existence check cannot distinguish from a
    // correct one.
    expect(records).toHaveLength(1);
    const step = records[0]!;
    // `if: always()` is load-bearing: conditioned on success it reproduces the
    // failure-only defect, conditioned on failure it reproduces it inverted.
    expect(step.if).toBe("always()");
    expect(step.with?.path).toContain(DEFAULT_RECORD_DIR);
    // Shard-scoped, so four matrix jobs cannot collide on one constant name.
    expect(step.with?.name).toContain("${{ matrix.shard }}");
  });

  it("is NOT satisfied by the same step living under another job", () => {
    const wf = parseYaml(readFileSync(".github/workflows/mutation-harness.yml", "utf8")) as {
      jobs: Record<string, { steps?: { uses?: string; with?: Record<string, string> }[] }>;
    };
    const elsewhere = Object.entries(wf.jobs)
      .filter(([name]) => name !== "source-shards")
      .flatMap(([name, job]) =>
        (job.steps ?? [])
          .filter((s) => String(s.with?.path ?? "").includes(DEFAULT_RECORD_DIR))
          .map(() => name),
      );
    // A positive control that the traversal WORKS lives in the case above; this
    // one pins that the records upload is not ALSO somewhere it does nothing.
    expect(elsewhere).toEqual([]);
  });
});

describe("workflow — a step that uploads a HIDDEN directory must say so (diff R1 F1)", () => {
  it("declares include-hidden-files because the record dir is dot-prefixed", () => {
    const wf = parseYaml(readFileSync(".github/workflows/mutation-harness.yml", "utf8")) as {
      jobs: Record<string, { steps?: { uses?: string; with?: Record<string, string> }[] }>;
    };
    const step = (wf.jobs["source-shards"]?.steps ?? []).find(
      (s) =>
        typeof s.uses === "string" &&
        s.uses.startsWith("actions/upload-artifact") &&
        String(s.with?.path ?? "").includes(DEFAULT_RECORD_DIR),
    );
    premiseHolds("the records upload step still exists", step !== undefined);

    // DERIVED, not enumerated: the requirement exists BECAUSE the path is
    // hidden, so renaming the directory to a visible name retires it correctly
    // rather than leaving a rule pinned to a constant nobody re-reads.
    const first = String(step!.with?.path ?? "").split("/")[0] ?? "";
    const hidden = first.startsWith(".");
    premiseHolds("the record dir is dot-prefixed, which is why this rule applies", hidden);

    // upload-artifact@v4 EXCLUDES hidden files by default and counts anything
    // inside a dot-directory as hidden, so the step below was green on every
    // shard while uploading nothing at all.
    expect(String(step!.with?.["include-hidden-files"])).toBe("true");

    // ...and `ignore` is what made that silent: an upload that found no files
    // is the exact false certification this record exists to prevent, so the
    // empty case must SURFACE.
    expect(String(step!.with?.["if-no-files-found"] ?? "warn")).not.toBe("ignore");
  });
});

describe("record file names — a dotted surface id is not two surfaces (diff R1 F4)", () => {
  it("round-trips an id containing dots", () => {
    const name = recordFileName("pane.compaction", "20260821-064430-1-0001");
    const parsed = parseRecordFileName(name);
    expect(parsed).toEqual({ surfaceId: "pane.compaction", runId: "20260821-064430-1-0001" });
  });

  it("keeps two dot-sharing surfaces in separate prune buckets", () => {
    const dir = mkdtempSync(join(tmpdir(), "fx-records-dotted-"));
    try {
      // Two runs each, so a correct pruner at the floor removes NOTHING: the
      // failure this catches is four files collapsing into one `pane` bucket
      // and the older two being evicted as if they were superseded runs of one
      // surface. Evidence loss, by wrong attribution.
      const names = [
        recordFileName("pane.compaction", "20260821-060000-1-0001"),
        recordFileName("pane.compaction", "20260821-060100-1-0002"),
        recordFileName("pane.other", "20260821-060200-1-0003"),
        recordFileName("pane.other", "20260821-060300-1-0004"),
      ];
      for (const n of names) writeFileSync(join(dir, n), "{}");

      const removed = prune(dir, MIN_RETAINED_PER_SURFACE);
      expect(removed).toEqual([]);
      expect(readdirSync(dir).sort()).toEqual([...names].sort());

      const surfaces = new Set(
        readdirSync(dir).map((n) => parseRecordFileName(n)?.surfaceId ?? "UNPARSED"),
      );
      expect([...surfaces].sort()).toEqual(["pane.compaction", "pane.other"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
