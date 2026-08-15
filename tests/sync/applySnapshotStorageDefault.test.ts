// tests/sync/applySnapshotStorageDefault.test.ts
//
// Drives the REAL apply-path snapshot storage adapter with a fake Supabase
// transport -- the mocked-only blind spot documented in
// promoteSnapshotDefaultStorage.test.ts: snapshotAssets tests inject a mock
// storage port, so without this file a wrong bucket-prefix strip, broken
// pagination, or folder/file misclassification in removePrefix ships silently.
import { describe, expect, test, vi } from "vitest";

import { applySnapshotStorage } from "@/lib/sync/defaultSnapshotAssetsForApply";

type Entry = { name: string; id?: string };

function fakeSupabase(pages: Entry[][], removeError: { message: string } | null = null) {
  const listArgs: Array<{ key: string; options: unknown }> = [];
  const removeArgs: string[][] = [];
  const bucket = {
    upload: vi.fn(async () => ({ error: null })),
    list: vi.fn(async (key: string, options: { limit: number; offset: number }) => {
      listArgs.push({ key, options });
      const page = pages[Math.floor(options.offset / options.limit)] ?? [];
      return { data: page, error: null };
    }),
    remove: vi.fn(async (names: string[]) => {
      removeArgs.push(names);
      return { error: removeError };
    }),
  };
  const from = vi.fn(() => bucket);
  return { supabase: { storage: { from } }, listArgs, removeArgs, from, bucket };
}

describe("applySnapshotStorage.removePrefix (real adapter, fake transport)", () => {
  test("strips the bucket prefix, paginates, skips folder entries, removes file objects", async () => {
    const fullPage: Entry[] = Array.from({ length: 100 }, (_, index) => ({
      name: `file-${index}.png`,
      id: `id-${index}`,
    }));
    const lastPage: Entry[] = [{ name: "tail.png", id: "id-tail" }, { name: "a-folder" }];
    const { supabase, listArgs, removeArgs, from } = fakeSupabase([fullPage, lastPage]);
    const storage = applySnapshotStorage(supabase as never);

    await storage.removePrefix?.("diagram-snapshots/shows/S1/_pending/R1/");

    expect(from).toHaveBeenCalledWith("diagram-snapshots");
    // Stripped object key on every page; offsets advance.
    expect(listArgs.map((call) => call.key)).toEqual([
      "shows/S1/_pending/R1/",
      "shows/S1/_pending/R1/",
    ]);
    expect(listArgs.map((call) => (call.options as { offset: number }).offset)).toEqual([0, 100]);
    // Every FILE entry across both pages removed in one call; the folder entry skipped.
    expect(removeArgs).toHaveLength(1);
    expect(removeArgs[0]).toHaveLength(101);
    expect(removeArgs[0]).toContain("shows/S1/_pending/R1/file-0.png");
    expect(removeArgs[0]).toContain("shows/S1/_pending/R1/tail.png");
    expect(removeArgs[0]).not.toContain("shows/S1/_pending/R1/a-folder");
  });

  test("an empty listing performs no remove call", async () => {
    const { supabase, removeArgs } = fakeSupabase([[]]);
    const storage = applySnapshotStorage(supabase as never);
    await storage.removePrefix?.("diagram-snapshots/shows/S1/_pending/R1/");
    expect(removeArgs).toEqual([]);
  });

  test("a remove error is thrown, not swallowed (invariant 9)", async () => {
    const { supabase } = fakeSupabase([[{ name: "x.png", id: "id-x" }]], {
      message: "remove failed",
    });
    const storage = applySnapshotStorage(supabase as never);
    await expect(
      storage.removePrefix?.("diagram-snapshots/shows/S1/_pending/R1/"),
    ).rejects.toMatchObject({ message: "remove failed" });
  });
});
