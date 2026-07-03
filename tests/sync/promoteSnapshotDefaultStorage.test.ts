// tests/sync/promoteSnapshotDefaultStorage.test.ts
//
// Regression for the diagram-snapshot promote outage (2026-07-03): the REAL
// `defaultStorage().list()` passed the full `diagram-snapshots/…` prefix to a
// bucket client already scoped to `diagram-snapshots`, so it listed a doubled
// `diagram-snapshots/diagram-snapshots/…` prefix and returned ZERO objects.
// The promote manifest check (`paths.length !== expectedAssetCount`) then always
// failed and every diagram-bearing apply rolled back instead of promoting.
//
// The existing promoteSnapshot.test.ts injects a mock `storage`, so it never
// exercised defaultStorage — a mocked-only blind spot. This drives the real
// defaultStorage code with a fake Supabase transport that records the exact key
// passed to `bucket.list`.
import { describe, expect, test, vi } from "vitest";

import { defaultStorage } from "@/lib/sync/promoteSnapshot";

function fakeSupabase(entries: Array<{ name: string }>) {
  const listArgs: string[] = [];
  const bucket = {
    list: vi.fn(async (key: string) => {
      listArgs.push(key);
      return { data: entries, error: null };
    }),
    move: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
  };
  const from = vi.fn(() => bucket);
  return { supabase: { storage: { from } }, listArgs, from };
}

describe("defaultStorage().list strips the bucket prefix before listing", () => {
  test("lists by the stripped object key and returns caller-facing (bucket-prefixed) paths", async () => {
    const { supabase, listArgs, from } = fakeSupabase([{ name: "a.jpg" }, { name: "b.jpg" }]);
    const storage = defaultStorage(supabase as never);

    const prefix = "diagram-snapshots/shows/S1/_pending/R1/";
    const result = await storage.list(prefix);

    // The client is scoped to the bucket, so it must be called WITHOUT the
    // `diagram-snapshots/` prefix (the bug passed it through → doubled → []).
    expect(from).toHaveBeenCalledWith("diagram-snapshots");
    expect(listArgs).toEqual(["shows/S1/_pending/R1/"]);
    // Return shape is unchanged: full bucket-prefixed paths that `move` re-strips.
    expect(result).toEqual([
      "diagram-snapshots/shows/S1/_pending/R1/a.jpg",
      "diagram-snapshots/shows/S1/_pending/R1/b.jpg",
    ]);
  });

  test("a path without the bucket prefix is passed through unchanged", async () => {
    const { supabase, listArgs } = fakeSupabase([]);
    const storage = defaultStorage(supabase as never);
    await storage.list("shows/S1/only/");
    expect(listArgs).toEqual(["shows/S1/only/"]);
  });
});
