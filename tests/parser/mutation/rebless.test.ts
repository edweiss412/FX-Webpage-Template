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
  const f = (index: number, shard: unknown, runId: unknown) => ({
    path: `p${index}`,
    index,
    shard,
    runId,
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
