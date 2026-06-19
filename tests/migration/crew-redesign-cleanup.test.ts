import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { test, expect } from "vitest";

const DELETED = [
  ...[
    "AudioScope",
    "VideoScope",
    "LightingScope",
    "Contacts",
    "Crew",
    "Diagrams",
    "Financials",
    "Lodging",
    "Notes",
    "OpeningReel",
    "PackList",
    "Schedule",
    "ShowStatus",
    "Transport",
    "Venue",
  ].map((t) => `components/tiles/${t}Tile.tsx`),
  "app/show/[slug]/[shareToken]/_ShowBody.tsx",
  "lib/show/selectTodayTiles.ts",
];

const RETAINED = [
  "components/tiles/OpeningReelVideo.tsx",
  "components/crew/DiagramsBlock.tsx", // relocated DiagramsTile
  "components/shared/WrappedTile.tsx",
  "components/shared/TileServerFallback.tsx",
];

test("obsolete tile shells / _ShowBody / selectTodayTiles are deleted", () => {
  expect(DELETED.filter((p) => existsSync(p))).toEqual([]);
});

test("retained modules survive the migration (no over-deletion)", () => {
  for (const p of RETAINED) expect(existsSync(p)).toBe(true);
});

test("no source/test file imports a deleted module", () => {
  // `git grep` is used (not `rg`) because ripgrep is not on PATH inside the
  // vitest `/bin/sh` — an `rg`-based scan would silently catch ENOENT and pass
  // vacuously. `git grep -l` exits 1 (no matches → throws → caught → "") = PASS;
  // exits 0 with a file list = FAIL. EXCLUDE this test's own file (it lists the
  // module names) via a `:!` pathspec.
  const shells = [
    "AudioScope",
    "VideoScope",
    "LightingScope",
    "Contacts",
    "Crew",
    "Diagrams",
    "Financials",
    "Lodging",
    "Notes",
    "OpeningReel",
    "PackList",
    "Schedule",
    "ShowStatus",
    "Transport",
    "Venue",
  ].join("|");
  const pattern =
    `(from ['\\"]|import\\(['\\"])(@/)?` +
    `(lib/show/selectTodayTiles|app/show/\\[slug\\]/\\[shareToken\\]/_ShowBody|` +
    `components/tiles/(${shells})Tile)`;
  let out = "";
  try {
    out = execSync(
      `git grep -l -E "${pattern}" -- ` +
        `app components lib tests ':!tests/migration/crew-redesign-cleanup.test.ts'`,
      { encoding: "utf8" },
    );
  } catch {
    // git grep exits 1 when there are no matches → execSync throws → clean.
    out = "";
  }
  expect(out.trim()).toBe("");
});
