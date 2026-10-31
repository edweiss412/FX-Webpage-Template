/**
 * tests/lib/offline/statusLifecycle.test.ts
 *
 * The lifecycle half of the saved-copy status route (spec §4.5): the show row
 * exists and is archived, its picker epoch is exactly one past the saved epoch
 * (the archive's own bump), and it has not been unpublished since the copy was
 * saved (R15). Identity is checked separately.
 */
import { describe, expect, test } from "vitest";
import { lifecycleAllowsEnded, type LifecycleRow } from "@/lib/offline/statusLifecycle";

const SAVED_EPOCH = 7;
const SAVED_AT = "2026-10-21T12:00:00.000Z";
const SAVED_AT_MS = Date.parse(SAVED_AT);

function row(overrides: Partial<LifecycleRow> = {}): LifecycleRow {
  return { archived: true, picker_epoch: SAVED_EPOCH + 1, unpublished_at: null, ...overrides };
}

describe("lifecycleAllowsEnded", () => {
  test("an archived row one epoch past the save, never unpublished, allows ended", () => {
    expect(lifecycleAllowsEnded(row(), SAVED_EPOCH, SAVED_AT_MS)).toBe(true);
  });

  test("a missing row does not", () => {
    expect(lifecycleAllowsEnded(null, SAVED_EPOCH, SAVED_AT_MS)).toBe(false);
  });

  test("a row that is not archived does not", () => {
    expect(lifecycleAllowsEnded(row({ archived: false }), SAVED_EPOCH, SAVED_AT_MS)).toBe(false);
  });

  test.each([
    ["0 (no archive bump)", 0],
    ["2 (a reset as well as the archive)", 2],
    ["3", 3],
    ["-1 (an epoch behind the save)", -1],
  ])("an epoch gap of %s does not", (_label, gap) => {
    expect(
      lifecycleAllowsEnded(row({ picker_epoch: SAVED_EPOCH + gap }), SAVED_EPOCH, SAVED_AT_MS),
    ).toBe(false);
  });

  test("an unpublish before the save allows ended", () => {
    const before = new Date(SAVED_AT_MS - 1).toISOString();
    expect(lifecycleAllowsEnded(row({ unpublished_at: before }), SAVED_EPOCH, SAVED_AT_MS)).toBe(
      true,
    );
  });

  test("an unpublish at the instant of the save does not", () => {
    expect(lifecycleAllowsEnded(row({ unpublished_at: SAVED_AT }), SAVED_EPOCH, SAVED_AT_MS)).toBe(
      false,
    );
  });

  test("an unpublish after the save does not (R15)", () => {
    const after = new Date(SAVED_AT_MS + 1).toISOString();
    expect(lifecycleAllowsEnded(row({ unpublished_at: after }), SAVED_EPOCH, SAVED_AT_MS)).toBe(
      false,
    );
  });

  test("reads the database's own timestamp form, offset and microseconds included", () => {
    expect(
      lifecycleAllowsEnded(
        row({ unpublished_at: "2026-10-21T11:59:59.999999+00:00" }),
        SAVED_EPOCH,
        SAVED_AT_MS,
      ),
    ).toBe(true);
    expect(
      lifecycleAllowsEnded(
        row({ unpublished_at: "2026-10-21T07:00:00.001+00:00" }),
        SAVED_EPOCH,
        Date.parse("2026-10-21T07:00:00.000Z"),
      ),
    ).toBe(false);
  });

  test("an unpublish time that does not parse does not allow ended (fail closed)", () => {
    expect(
      lifecycleAllowsEnded(row({ unpublished_at: "not a time" }), SAVED_EPOCH, SAVED_AT_MS),
    ).toBe(false);
  });
});
