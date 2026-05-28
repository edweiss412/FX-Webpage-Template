import { describe, expect, test } from "vitest";

import {
  mapPendingSyncRowForApply,
  type PendingSyncForApplyRow,
} from "@/lib/sync/applyStaged";
import type { TriggeredReviewItem } from "@/lib/parser/types";

/**
 * Regression for the Apply-path half of the triggered_review_items crash class
 * (Codex adversarial R1, HIGH). The render fix coerced the value on the page
 * boundary, but the Apply READ boundary — defaultReadLivePendingSyncForApply /
 * defaultReadWizardPendingSyncForApply, which both now delegate to
 * mapPendingSyncRowForApply — returned the raw jsonb. A malformed
 * triggered_review_items would then reach validateReviewerChoices (`.map`) and
 * the asset-review `.find`/`.some` paths, throwing a TypeError and 500-ing the
 * Apply for the exact corrupted rows the render fix is meant to tolerate.
 *
 * Failure mode caught: a non-array (object / double-encoded string / scalar)
 * jsonb value reaching the Apply pipeline as a non-array. The mapper is the
 * production read mapping both default readers use, so coercing here closes the
 * server half of the class.
 */
function rowWith(triggered: unknown): PendingSyncForApplyRow {
  return {
    drive_file_id: "drive-1",
    staged_id: "11111111-1111-4111-8111-111111111111",
    source_kind: "onboarding_scan",
    wizard_session_id: null,
    base_modified_time: null,
    staged_modified_time: "2026-05-28T12:00:00Z",
    // A minimally-valid parse_result: the Apply read boundary now coerces it
    // (asParseResult) so a legacy double-encoded scalar decodes; it asserts
    // `.show` is present, so the fixture carries one.
    parse_result: { show: { title: "Fixture" } } as PendingSyncForApplyRow["parse_result"],
    triggered_review_items: triggered,
    prior_last_sync_status: null,
    prior_last_sync_error: null,
    warning_summary: "",
  };
}

const VALID: TriggeredReviewItem[] = [
  { id: "i1", invariant: "MI-8", field: "po" },
  { id: "i2", invariant: "FIRST_SEEN_REVIEW" },
];

describe("mapPendingSyncRowForApply — Apply read boundary (fail closed on corrupt)", () => {
  test("a non-array object jsonb value is flagged corrupt (Apply must refuse, not silently approve)", () => {
    const mapped = mapPendingSyncRowForApply(rowWith({ id: "x", invariant: "MI-8" }));
    // Array-safe (no .map/.find/.some crash) ...
    expect(Array.isArray(mapped.triggeredReviewItems)).toBe(true);
    expect(mapped.triggeredReviewItems).toEqual([]);
    expect(() => mapped.triggeredReviewItems.map((i) => i.id)).not.toThrow();
    // ... AND flagged corrupt so applyStaged returns review_items_corrupt
    // instead of fail-opening the review gate to an empty approval.
    expect(mapped.reviewItemsCorrupt).toBe(true);
  });

  test("a valid array passes through and is NOT corrupt", () => {
    const mapped = mapPendingSyncRowForApply(rowWith(VALID));
    expect(mapped.triggeredReviewItems).toEqual(VALID);
    expect(mapped.reviewItemsCorrupt).toBe(false);
  });

  test("a double-encoded JSON-string array is parsed and not corrupt", () => {
    const mapped = mapPendingSyncRowForApply(rowWith(JSON.stringify(VALID)));
    expect(mapped.triggeredReviewItems).toEqual(VALID);
    expect(mapped.reviewItemsCorrupt).toBe(false);
  });

  test("null jsonb is legitimately empty, not corrupt", () => {
    const mapped = mapPendingSyncRowForApply(rowWith(null));
    expect(mapped.triggeredReviewItems).toEqual([]);
    expect(mapped.reviewItemsCorrupt).toBe(false);
  });
});

/**
 * Codex R2 HIGH: the mapper now coerces parse_result (asParseResult). asParseResult
 * THROWS a typed JsonbCoercionError on genuinely-corrupt data; the live + wizard
 * Apply routes call applyStaged directly and map result codes — they do not catch a
 * thrown reader, so a corrupt row would still 500. The mapper must convert that
 * into a parseResultCorrupt FLAG (mirroring reviewItemsCorrupt), never throw.
 */
function rowWithParseResult(parseResult: unknown): PendingSyncForApplyRow {
  return { ...rowWith([]), parse_result: parseResult as PendingSyncForApplyRow["parse_result"] };
}

describe("mapPendingSyncRowForApply — parse_result coercion (flag, never throw)", () => {
  test("a valid parse_result object is not corrupt", () => {
    const mapped = mapPendingSyncRowForApply(rowWithParseResult({ show: { title: "T" } }));
    expect(mapped.parseResultCorrupt).toBe(false);
    expect(mapped.parseResult.show.title).toBe("T");
  });

  test("a legacy double-encoded JSON-string-of-object decodes and is NOT corrupt", () => {
    const mapped = mapPendingSyncRowForApply(
      rowWithParseResult(JSON.stringify({ show: { title: "T" } })),
    );
    expect(mapped.parseResultCorrupt).toBe(false);
    expect(mapped.parseResult.show.title).toBe("T");
  });

  test("a genuinely-corrupt parse_result FLAGS parseResultCorrupt and does NOT throw", () => {
    // Missing `.show` — exactly the shape that would have made `.show.title` a
    // TypeError. The mapper must flag, not throw (Apply returns a typed code).
    expect(() => mapPendingSyncRowForApply(rowWithParseResult({ diagrams: {} }))).not.toThrow();
    const mapped = mapPendingSyncRowForApply(rowWithParseResult({ diagrams: {} }));
    expect(mapped.parseResultCorrupt).toBe(true);
  });

  test("an unparseable / null parse_result also flags corrupt without throwing", () => {
    expect(mapPendingSyncRowForApply(rowWithParseResult("{not json")).parseResultCorrupt).toBe(true);
    expect(mapPendingSyncRowForApply(rowWithParseResult(null)).parseResultCorrupt).toBe(true);
  });
});

/**
 * Regression for the onboarding apply revision-race FALSE POSITIVE (M12 Phase
 * 0.F smoke 3 → 4th onboarding defect).
 *
 * The DB layer is postgres.js, which parses `timestamptz` columns into JS
 * `Date` objects (NOT ISO strings) — confirmed live: `instanceof Date === true`.
 * `staged_modified_time` is typed `string` on PendingSyncForApplyRow but is a
 * `Date` at runtime. The revision guard then did
 * `sameTimestamp(driveModifiedTime [ISO string ".040Z"], pending.stagedModifiedTime [Date])`,
 * and `timestampMs` ran `Date.parse(<Date object>)`, which coerces the Date via
 * `toString()` and DROPS the milliseconds (".040" -> ".000"). An unedited sheet
 * (whose live modifiedTime matches the staged value to the millisecond) then
 * tripped a false `revision_race` -> deterministic 409 STAGED_PARSE_REVISION_RACE
 * blocking finalize for every sheet whose modifiedTime has nonzero ms.
 *
 * The mapper is the single Apply read boundary; it must normalize the
 * timestamptz Date to a full-precision ISO string so the `string` type is
 * honest and the downstream millisecond-exact comparison is correct.
 */
function rowWithStagedModified(
  staged: unknown,
  base: unknown = null,
): PendingSyncForApplyRow {
  return {
    ...rowWith([]),
    // Cast through the row's declared types: production passes a Date here
    // (postgres.js), even though the row type says string.
    staged_modified_time: staged as string,
    base_modified_time: base as string | null,
  };
}

describe("mapPendingSyncRowForApply — timestamptz read boundary (postgres.js Date -> ISO string)", () => {
  // The exact failure mode: a Date-valued staged_modified_time (postgres.js)
  // must become a full-precision ISO STRING, not leak as a Date typed string.
  // A Date that survives to the guard loses its ms under Date.parse -> false race.
  test("a Date staged_modified_time (postgres.js) normalizes to a full-ms ISO string", () => {
    const instant = "2026-05-09T03:44:06.040Z";
    const mapped = mapPendingSyncRowForApply(rowWithStagedModified(new Date(instant)));
    expect(typeof mapped.stagedModifiedTime).toBe("string");
    // Full millisecond precision preserved (the .040 the bug dropped).
    expect(new Date(mapped.stagedModifiedTime).toISOString()).toBe(instant);
  });

  test("a Date base_modified_time normalizes to ISO string; null stays null", () => {
    const baseInstant = "2026-05-08T11:22:33.500Z";
    const mapped = mapPendingSyncRowForApply(
      rowWithStagedModified(new Date("2026-05-09T03:44:06.040Z"), new Date(baseInstant)),
    );
    expect(typeof mapped.baseModifiedTime).toBe("string");
    expect(new Date(mapped.baseModifiedTime as string).toISOString()).toBe(baseInstant);

    const nullBase = mapPendingSyncRowForApply(
      rowWithStagedModified(new Date("2026-05-09T03:44:06.040Z"), null),
    );
    expect(nullBase.baseModifiedTime).toBeNull();
  });

  test("an ISO-string staged_modified_time passes through unchanged", () => {
    const instant = "2026-05-28T12:00:00.123Z";
    const mapped = mapPendingSyncRowForApply(rowWithStagedModified(instant));
    expect(new Date(mapped.stagedModifiedTime).toISOString()).toBe(instant);
  });
});
