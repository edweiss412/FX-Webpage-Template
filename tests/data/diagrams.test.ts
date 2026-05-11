/**
 * Tests for `resolveCurrentDiagrams` (M7 Task 7.9 helper).
 *
 * The crew page reads `shows.diagrams` straight from the row but must NEVER
 * read the `pending` sub-payload (M7 §6 watchpoint 13). This helper mirrors
 * the private `currentDiagrams()` function inside the diagram asset route so
 * the gallery and the route can never drift on which sub-payload is live.
 */
import { describe, expect, test } from "vitest";

import { resolveCurrentDiagrams } from "@/lib/data/diagrams";
import type { PersistedDiagrams } from "@/lib/parser/types";

const persisted: PersistedDiagrams = {
  snapshot_revision_id: "11111111-1111-4111-8111-111111111111",
  snapshot_status: "complete",
  linkedFolder: null,
  embeddedImages: [],
  linkedFolderItems: [],
};

describe("resolveCurrentDiagrams", () => {
  test("null input returns null", () => {
    expect(resolveCurrentDiagrams(null)).toBeNull();
  });

  test("undefined input returns null", () => {
    expect(resolveCurrentDiagrams(undefined)).toBeNull();
  });

  test("legacy inner-only shape passes through verbatim", () => {
    expect(resolveCurrentDiagrams(persisted)).toEqual(persisted);
  });

  test("wrapped current/pending shape returns ONLY `current`", () => {
    const wrapped = {
      current: persisted,
      pending: { revision_id: "22222222-2222-4222-8222-222222222222" },
    };
    expect(resolveCurrentDiagrams(wrapped)).toEqual(persisted);
  });

  test("wrapped shape with null current returns null (pending is NEVER consulted)", () => {
    const wrapped = {
      current: null,
      pending: persisted,
    };
    expect(resolveCurrentDiagrams(wrapped)).toBeNull();
  });

  test("wrapped shape with missing current returns null", () => {
    expect(resolveCurrentDiagrams({ pending: persisted })).toBeNull();
  });

  test("malformed object without snapshot_revision_id and without current returns null", () => {
    expect(resolveCurrentDiagrams({ foo: "bar" })).toBeNull();
  });
});
