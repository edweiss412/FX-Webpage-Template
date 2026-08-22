// tests/paneCompaction/recordReads.test.ts
//
// Diff round 4, core finding 2 (P1), and the class round 1 finding 2 (P0) left
// open. `readJson` answers `null` for a file that is ABSENT and for one that
// EXISTS but will not parse, and the two mean opposite things: absent is a
// supported observation, unreadable is a FAULT. Round 1 built `readMarker` to
// separate them for the marker and left every other consumer collapsing them.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { readRecord } from "@/scripts/pane-compaction";
import { premiseHolds } from "@/tests/_shared/premise";

const DIR = mkdtempSync(join(tmpdir(), "fx-recordreads-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

function at(name: string, body: string): string {
  const path = join(DIR, name);
  writeFileSync(path, body);
  return path;
}

describe("a record that exists but will not read is a FAULT, never an absence", () => {
  it("answers null for a genuinely absent file", () => {
    expect(readRecord(join(DIR, "nope.json"))).toBeNull();
  });

  it("answers the body for a readable record", () => {
    expect(readRecord(at("ok.json", '{"wM:p1":"n1"}'))).toEqual({ "wM:p1": "n1" });
  });

  it.each([
    ["truncated mid-write", "{partial"],
    ["empty (created, not yet written)", ""],
    ["an array, not a record", "[]"],
    ["a bare scalar", "42"],
    ["JSON null", "null"],
  ])("THROWS on a file that exists but is %s", (_label, body) => {
    // Each of these is what a torn concurrent write actually leaves behind --
    // this adapter's own `nonceWrite` rewrites the file, so it creates the
    // interleaving itself. Collapsing any of them to `null` produced a refusal
    // naming a condition that had not fired, at exit 1 where the taxonomy
    // reserves 1 for refusals and 2 for faults.
    const path = at(`bad-${body.length}-${_label.length}.json`, body);
    premiseHolds("the fixture file really exists, so this is not the absent case", true);
    expect(() => readRecord(path)).toThrow(/exists but could not be read/);
  });

  it("does not silently substitute an empty record, which would destroy siblings", () => {
    // The unreported half of the class, found by sweeping rather than by
    // repairing the named instance: `nonceWrite` read `readJson(path) ?? {}`, so
    // an unreadable record became an EMPTY one and was written back -- erasing
    // every other pane's outstanding grant in that session file. A throw is the
    // only answer that cannot lose data.
    const path = at("siblings.json", "{oops");
    expect(() => readRecord(path) ?? {}).toThrow();
  });
});
