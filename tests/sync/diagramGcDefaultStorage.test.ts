// tests/sync/diagramGcDefaultStorage.test.ts
//
// Drives the REAL diagram-gc defaultStorage.listChildren with a fake Supabase
// transport (the promoteSnapshotDefaultStorage.test.ts pattern): the GC-stage
// tests inject an in-memory port, so without this file a wrong bucket-prefix
// strip, broken pagination, or inverted folder classification ships silently
// and the production _pending stage goes inert.
import { describe, expect, test, vi } from "vitest";

import { defaultStorage } from "@/lib/sync/diagramGc";

type Entry = { name: string; id?: string };

function fakeSupabase(pages: Entry[][]) {
  const listArgs: Array<{ key: string; offset: number }> = [];
  const bucket = {
    list: vi.fn(async (key: string, options: { limit: number; offset: number }) => {
      listArgs.push({ key, offset: options.offset });
      return { data: pages[Math.floor(options.offset / options.limit)] ?? [], error: null };
    }),
    remove: vi.fn(async () => ({ error: null })),
  };
  const from = vi.fn(() => bucket);
  return { supabase: { storage: { from } }, listArgs, from };
}

describe("defaultStorage().listChildren (real adapter, fake transport)", () => {
  test("strips the bucket prefix and classifies folders (no id) vs files (id)", async () => {
    const { supabase, listArgs, from } = fakeSupabase([
      [{ name: "show-dir-1" }, { name: "stray.txt", id: "id-1" }],
    ]);
    const storage = defaultStorage(supabase as never);

    const children = await storage.listChildren?.("diagram-snapshots/shows/");

    expect(from).toHaveBeenCalledWith("diagram-snapshots");
    expect(listArgs.map((call) => call.key)).toEqual(["shows/"]);
    expect(children).toEqual([
      { name: "show-dir-1", isFolder: true },
      { name: "stray.txt", isFolder: false },
    ]);
  });

  test("paginates past a full page", async () => {
    const fullPage: Entry[] = Array.from({ length: 100 }, (_, index) => ({
      name: `dir-${index}`,
    }));
    const { supabase, listArgs } = fakeSupabase([fullPage, [{ name: "dir-last" }]]);
    const storage = defaultStorage(supabase as never);
    const children = await storage.listChildren?.("diagram-snapshots/shows/");
    expect(listArgs.map((call) => call.offset)).toEqual([0, 100]);
    expect(children).toHaveLength(101);
  });
});
