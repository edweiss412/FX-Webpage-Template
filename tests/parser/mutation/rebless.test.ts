// tests/parser/mutation/rebless.test.ts
//
// Cases for the re-bless decisions. Each one names the failure it catches, because
// a case that only proves the function is called proves nothing.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";
import type { Alarm, KnownHole } from "./knownHoles";
import {
  cardinalityProblems,
  classify,
  findShardFiles,
  headBindingProblems,
  ledgerCardinalityProblems,
  provenanceProblems,
  readShardFiles,
  rewriteLedgerText,
} from "./rebless";

const scratches: string[] = [];
const scratch = (): string => {
  const d = mkdtempSync(join(tmpdir(), "rebless-"));
  scratches.push(d);
  return d;
};
afterEach(() => {
  for (const d of scratches.splice(0)) rmSync(d, { recursive: true, force: true });
});

const hole = (siteId: string, fingerprint: string): KnownHole => ({
  siteId,
  kind: "wrong",
  fingerprint,
  finding: "#10",
  note: "n",
});
const alarm = (siteId: string, fingerprint: string): Alarm => ({
  siteId,
  kind: "wrong",
  fingerprint,
});

const LEDGER_TEXT = [
  "const RAW_HOLES = `",
  "blank-row:inject:a:B1:L1:Xgap0|wrong|aaaa|#10|blank-row wrong @ a",
  "blank-row:inject:a:B1:L2:Xgap1|wrong|bbbb|#10|blank-row wrong @ a",
  "`;",
].join("\n");

describe("findShardFiles", () => {
  // CATCHES: a partial download silently reconciled against a whole ledger, which
  // reads every absent shard's rows as fixed holes and would delete them.
  it("reports the indices it could not find rather than returning what it has", () => {
    const root = scratch();
    writeFileSync(join(root, "alarms-shard0.json"), JSON.stringify({ alarms: [] }));
    const scan = findShardFiles(root, 3);
    premiseHolds("the scratch holds strictly fewer shards than asked for", scan.files.length < 3);
    expect(scan.missing).toEqual([1, 2]);
  });

  // CATCHES: a mistyped --alarms path reported as "every shard is missing", a refusal
  // that blames the artifacts for an error in the directory and sends the reader
  // looking in the wrong place.
  it("names an unreadable root as a usage error rather than an empty download", () => {
    expect(() => findShardFiles(join(scratch(), "no-such-dir"), 1)).toThrow(/not readable/);
  });

  // CATCHES: two files claiming the same shard, where `find` kept the first and
  // silently dropped the rest. "Present exactly once" is the licensing condition; a
  // flat copy beside a nested one -- or two nested artifact directories -- read as a
  // clean set while the tool re-blessed from whichever the directory order surfaced.
  it("refuses two files claiming the same shard rather than picking one", () => {
    const root = scratch();
    mkdirSync(join(root, "alarms-parser-shards-0"));
    writeFileSync(join(root, "alarms-shard0.json"), JSON.stringify({ alarms: [] }));
    writeFileSync(
      join(root, "alarms-parser-shards-0", "alarms-shard0.json"),
      JSON.stringify({ alarms: [] }),
    );
    const scan = findShardFiles(root, 1);
    expect(scan.missing).toEqual([]);
    expect(scan.files).toEqual([]);
    expect(scan.duplicated).toEqual([expect.stringContaining("shard 0")]);
  });

  // CATCHES: the per-artifact layout `gh run download` actually produces being
  // treated as "missing", which would refuse every real download.
  it("finds a shard laid down inside its own artifact directory", () => {
    const root = scratch();
    mkdirSync(join(root, "alarms-parser-shards-0"));
    writeFileSync(
      join(root, "alarms-parser-shards-0", "alarms-shard0.json"),
      JSON.stringify({ alarms: [] }),
    );
    expect(findShardFiles(root, 1)).toEqual({
      files: [join(root, "alarms-parser-shards-0", "alarms-shard0.json")],
      missing: [],
      duplicated: [],
    });
  });
});

describe("readShardFiles", () => {
  // CATCHES: a corrupt or truncated artifact read as zero alarms, which is the
  // same silent-deletion shape as a missing shard.
  it("throws on a file with no alarms array instead of contributing nothing", () => {
    const root = scratch();
    const f = join(root, "alarms-shard0.json");
    writeFileSync(f, JSON.stringify({ notAlarms: [] }));
    expect(() => readShardFiles([f])).toThrow(/alarms/);
  });
});

describe("classify", () => {
  // CATCHES: a coverage REGRESSION laundered into a baseline. This is the case
  // the tool exists for.
  it("refuses when a site with no ledger row at all is alarming", () => {
    const v = classify([alarm("x:1", "aaaa"), alarm("brand-new:9", "cccc")], [hole("x:1", "aaaa")]);
    expect(v.kind).toBe("refuse");
    expect(v.kind === "refuse" && v.newHoles.some((k) => k.startsWith("brand-new:9"))).toBe(true);
  });

  // CATCHES: a coverage WIN absorbed as a side effect. A shrink is a deliberate
  // commit with its own note, never a by-product of a fingerprint refresh.
  it("refuses when a ledgered site has stopped surviving", () => {
    const v = classify([alarm("x:1", "aaaa")], [hole("x:1", "aaaa"), hole("gone:2", "bbbb")]);
    expect(v.kind).toBe("refuse");
    expect(v.kind === "refuse" && v.fixedHoles.some((k) => k.startsWith("gone:2"))).toBe(true);
  });

  it("reports drift when the same (siteId, kind) carries a new fingerprint", () => {
    const v = classify([alarm("x:1", "zzzz")], [hole("x:1", "aaaa")]);
    expect(v).toEqual({ kind: "drifted", drifted: 1, rows: 1 });
  });

  it("reports current when nothing moved", () => {
    expect(classify([alarm("x:1", "aaaa")], [hole("x:1", "aaaa")])).toEqual({
      kind: "current",
      rows: 1,
    });
  });
});

describe("rewriteLedgerText", () => {
  // CATCHES: a re-bless diff that is not reviewable because rows moved or
  // disappeared alongside the fingerprints.
  it("changes only the fingerprint column, preserving order and count", () => {
    const { next, rewritten } = rewriteLedgerText(LEDGER_TEXT, [
      alarm("blank-row:inject:a:B1:L2:Xgap1", "dddd"),
    ]);
    expect(rewritten).toBe(1);
    const before = LEDGER_TEXT.split("\n");
    const after = next.split("\n");
    expect(after).toHaveLength(before.length);
    expect(after.map((l) => l.split("|").filter((_, i) => i !== 2))).toEqual(
      before.map((l) => l.split("|").filter((_, i) => i !== 2)),
    );
    expect(after[2]).toContain("|dddd|");
    expect(after[1]).toContain("|aaaa|");
  });

  // CATCHES: the finding ref and the note being dropped on rewrite, which would
  // make every row unresolvable to the fix that shrinks its class.
  it("keeps the finding and the note on a rewritten row", () => {
    const { next } = rewriteLedgerText(LEDGER_TEXT, [
      alarm("blank-row:inject:a:B1:L1:Xgap0", "eeee"),
    ]);
    expect(next).toContain("blank-row:inject:a:B1:L1:Xgap0|wrong|eeee|#10|blank-row wrong @ a");
  });
});

describe("provenanceProblems", () => {
  // ARITY, not a default value. `headSha: unknown = "deadbeef"` reads the same and
  // silently substitutes the default when a case passes `undefined` ON PURPOSE, which
  // made the "missing headSha" case below assert against a present one and pass
  // vacuously. The rest parameter distinguishes "not supplied" from "supplied as
  // undefined", which is exactly the distinction those cases are about.
  const f = (index: number, shard: unknown, runId: unknown, ...head: unknown[]) => ({
    path: `p${index}`,
    index,
    shard,
    runId,
    headSha: head.length > 0 ? head[0] : "deadbeef",
    alarms: [],
  });

  // CATCHES: a stale file from an earlier download sitting among fresh ones. It
  // satisfies every presence check, and re-blessing a mixed snapshot is exactly the
  // silent corruption the tool exists to refuse.
  it("refuses a set whose files declare different runs", () => {
    expect(provenanceProblems([f(0, 0, "111"), f(1, 1, "222")])).toEqual([
      expect.stringContaining("different runs"),
    ]);
  });

  // CATCHES: a file renamed onto an index it did not come from; the filename is
  // chosen by the reader, so it is not provenance.
  it("refuses a file whose declared shard disagrees with its position", () => {
    expect(provenanceProblems([f(0, 3, "111")])).toEqual([
      expect.stringContaining("declares shard 3"),
    ]);
  });

  it("accepts one run's consistent set", () => {
    expect(provenanceProblems([f(0, 0, "111"), f(1, 1, "111")])).toEqual([]);
  });

  // CATCHES: every value that `String(runId)` flattened into a comparable. Missing,
  // null, empty, object and array all compared equal to each other, so a set of files
  // declaring NOTHING passed as a set from one run -- which is not a weaker form of
  // provenance, it is the absence of any.
  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty string", ""],
    ["an object", {}],
    ["an array", []],
    ["a number", 7],
  ])("refuses a runId that is %s", (_label, bad) => {
    expect(provenanceProblems([f(0, 0, bad)])).toEqual([
      expect.stringContaining("no usable runId"),
    ]);
  });

  // CATCHES: `1` and `"1"` stringifying equal, so two genuinely different runs passed
  // as one. Both are now refused for not being usable strings, which is the same
  // repair seen from the other side.
  it("does not let a number and a string of the same digits pass as one run", () => {
    expect(provenanceProblems([f(0, 0, 1), f(1, 1, "1")]).length).toBeGreaterThan(0);
  });

  // CATCHES: the same absence class as the runId cases above, on the field that says
  // WHICH TREE. Held to the identical bar deliberately -- a headSha that is missing,
  // null or empty is not a weaker claim about the source, it is no claim at all, and
  // an unusable value must not reach headBindingProblems looking like agreement.
  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty string", ""],
    ["an object", {}],
    ["a number", 7],
  ])("refuses a headSha that is %s", (_label, bad) => {
    expect(provenanceProblems([f(0, 0, "111", bad)])).toEqual([
      expect.stringContaining("no usable headSha"),
    ]);
  });

  // CATCHES: two collect runs at different commits interleaved into one directory.
  // Both declare a real tree, so the absence check above cannot see it.
  it("refuses a set whose files describe different commits", () => {
    expect(provenanceProblems([f(0, 0, "111", "aaa"), f(1, 1, "111", "bbb")])).toEqual([
      expect.stringContaining("different commits"),
    ]);
  });
});

describe("headBindingProblems", () => {
  const f = (index: number, headSha: unknown) => ({
    path: `p${index}`,
    index,
    shard: index,
    runId: "111",
    headSha,
    alarms: [],
  });

  // CATCHES the sixth condition, and it is a measured input rather than a constructed
  // one: a review partitioned the BASE COMMIT's ledger rows through the live shard
  // assignment, and the resulting eight files passed provenance, both cardinality
  // checks, and the whole reconciliation -- 791 drifted, zero new holes, zero fixed
  // holes, `rewritten === drifted`, census unchanged. The ledger rolled backwards in
  // silence. Every one of the five conditions held; none of them asks which tree.
  it("refuses a complete, self-consistent run from a different commit", () => {
    expect(headBindingProblems([f(0, "old"), f(1, "old")], "new")).toEqual([
      expect.stringContaining("describes commit old"),
    ]);
  });

  it("accepts a run describing this very tree", () => {
    expect(headBindingProblems([f(0, "same"), f(1, "same")], "same")).toEqual([]);
  });

  // CATCHES: the licensing flag licensing nothing. `--allow-head` must name the commit
  // actually collected, or a typo in it reads as a blanket waiver.
  it("accepts a crossing only when --allow-head names the collected commit", () => {
    expect(headBindingProblems([f(0, "old")], "new", "old")).toEqual([]);
    expect(headBindingProblems([f(0, "old")], "new", "typo")).toEqual([
      expect.stringContaining("--allow-head names typo"),
    ]);
  });

  // CATCHES: a tree with no git identity silently reading as "matches". An empty
  // current head compares unequal to any real sha, but the message a reader needs is
  // that the TREE is unidentifiable, not that two shas differ.
  it("refuses when the tree being re-blessed cannot be identified", () => {
    expect(headBindingProblems([f(0, "aaa")], "")).toEqual([
      expect.stringContaining("could not be identified"),
    ]);
  });

  // CATCHES: this function issuing a second, worse-worded copy of a refusal
  // provenanceProblems has already made. Disagreement and absence are that
  // function's to report; asking the binding question of an unusable set would
  // produce two refusals for one defect and bury the one that names the cause.
  it("says nothing about a set whose commits disagree or are absent", () => {
    expect(headBindingProblems([f(0, "aaa"), f(1, "bbb")], "aaa")).toEqual([]);
    expect(headBindingProblems([f(0, undefined)], "aaa")).toEqual([]);
  });
});

describe("cardinalityProblems", () => {
  // CATCHES: the exact input that defeats reconcileLedger. Two fingerprints for one
  // (siteId, kind) leave BOTH refusal buckets empty, so the drift path accepts it and
  // the rewrite writes whichever the map saw last.
  it("refuses a (siteId, kind) carrying two fingerprints", () => {
    expect(cardinalityProblems([alarm("x:1", "aaaa"), alarm("x:1", "bbbb")])).toEqual([
      expect.stringContaining("carries 2 fingerprints"),
    ]);
  });

  it("says nothing when every pair carries exactly one", () => {
    expect(cardinalityProblems([alarm("x:1", "aaaa"), alarm("y:2", "bbbb")])).toEqual([]);
  });

  // CATCHES: the twin on the ledger side. Two rows for one pair plus one current
  // alarm leaves both refusal buckets empty, both rows get rewritten to the same
  // fingerprint, and the internal Set then deduplicates them so the NEXT
  // reconciliation reports clean. One ordinary edit away from today's ledger.
  it("refuses a ledger carrying two rows for one (siteId, kind)", () => {
    expect(ledgerCardinalityProblems([hole("x:1", "aaaa"), hole("x:1", "bbbb")])).toEqual([
      expect.stringContaining("2 rows for x:1|wrong"),
    ]);
  });

  it("says nothing about the ledger when every pair carries exactly one row", () => {
    expect(ledgerCardinalityProblems([hole("x:1", "aaaa"), hole("y:2", "bbbb")])).toEqual([]);
  });
});
