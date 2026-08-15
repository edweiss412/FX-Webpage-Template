import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import { TAP_TARGET_CENSUS } from "./tapTargetCensus";
import { scanTapTargets } from "./tapTargetScan";

/** Every entry id the live ledger defines, open or archived. */
const ledgerIds = (() => {
  let cache: Set<string> | null = null;
  return (): Set<string> => {
    if (cache) return cache;
    const ids = new Set<string>();
    for (const file of ["BACKLOG.md", "BACKLOG-archive.md", "DEFERRED.md", "DEFERRED-archive.md"]) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const m of text.matchAll(/^#{2,4}\s+((?:BL|DEF)-[A-Z0-9]+(?:-[A-Z0-9]+)*)/gm)) {
        ids.add(m[1]!);
      }
    }
    return (cache = ids);
  };
})();

const verdicts = scanTapTargets(process.cwd());
const key = (x: { file: string; line: number }) => `${x.file}:${x.line}`;
const census = new Map(TAP_TARGET_CENSUS.map((r) => [key(r), r]));
const unclassified = verdicts.filter((v) => v.state === "unclassified");

describe("repo-wide tap-height floor (spec §5)", () => {
  it("premise: the corpus is non-trivial and something clears", () => {
    premiseHolds("corpus >=300", verdicts.length >= 300);
    premiseHolds(
      "a SECONDARY_ACTION_CLASS consumer clears via rule 6",
      verdicts.some((v) => v.file.endsWith("RescanSheetButton.tsx") && v.state === "clear"),
    );
  });
  it("every UNCLASSIFIED element has a census row (fail names the element)", () => {
    expect(
      unclassified.filter((v) => !census.has(key(v))).map((v) => `${key(v)} <${v.tag}>`),
    ).toEqual([]);
  });
  it("no stale census row (every row still a live unclassified site)", () => {
    const live = new Set(unclassified.map(key));
    expect(TAP_TARGET_CENSUS.filter((r) => !live.has(key(r))).map(key)).toEqual([]);
  });
  it("reasons are never blank; filed rows carry a resolvable backlog ref", () => {
    for (const r of TAP_TARGET_CENSUS) {
      expect(r.reason.trim().length).toBeGreaterThan(0);
      if (r.category === "under-floor-filed") {
        // The plan pinned this to BL-TAP-TARGET-INLINE-TEXT-CONTROLS, the entry
        // spec §1.1 R8 hands bucket-A residue to. That entry GRADUATED on
        // 2026-08-11 (3 exempt / 5 repaired), so the residue it owned no longer
        // exists and the scan found none: every under-floor row here belongs to
        // a different family. The pin becomes the ledger-id SHAPE plus an
        // existence check against the live ledger, which is a stronger claim
        // than a hardcoded id — a row cannot name an entry nobody filed.
        expect(r.backlogRef, `${r.file}:${r.line} is filed but names no entry`).toMatch(
          /^(BL|DEF)-[A-Z0-9]+(-[A-Z0-9]+)*$/,
        );
        expect(
          ledgerIds(),
          `${r.file}:${r.line} names ${r.backlogRef}, absent from the ledger`,
        ).toContain(r.backlogRef);
      }
    }
  });
});
