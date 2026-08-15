// tests/sync/promoteSnapshotExpectedCount.realdb.test.ts
//
// REAL-DB evaluation of promoteSnapshot's required-name SQL
// (spec docs/superpowers/specs/2026-08-10-promote-identity-validation.md §4.1).
//
// Why a real database: the unit suite's `showTx` mock returns canned rows for
// ANY SQL matching /jsonb_array_elements/ (tests/sync/promoteSnapshot.test.ts),
// so SQL SEMANTICS cannot fail through that seam — a query that ignored variants
// entirely would still pass there. This file runs the EXPORTED query text against
// Postgres, so the thing under test is the shipped string, not a copy of it.
//
// The query is exercised through the COMPOSED transaction path
// (withPromoteLock → withShowLock → tx.queryRows) — the same seam
// promoteSnapshotUpload reads it through — so a missing `queryRows`
// implementation on the promote-tx adapter fails here, not only in review.
//
// Failure modes caught: a variant-blind name list (promote would trip
// manifest_mismatch on every variant-bearing snapshot and no diagram would ever
// go live), emitting names for entries whose snapshotPath is null, collapsing
// duplicate manifest entries (AC-3 needs multiplicities to survive the query),
// mislabeling row provenance (an original row typed as variant bypasses path
// binding), and a malformed `variants` value throwing instead of contributing
// zero names.

import { afterAll, describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { EXPECTED_ASSET_NAMES_SQL } from "@/lib/sync/promoteSnapshot";
import { withPromoteLock } from "@/lib/sync/lockedPromoteTx";
import { withShowLock, type LockableSyncTx } from "@/lib/sync/lockedShowTx";
import { premise } from "@/tests/_shared/premise";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// not-subject-to-meta: test-only fixture connection against the local stack;
// faults fail the test directly rather than needing a typed infra result.
const sql: Sql = postgres(DB_URL, { max: 1, prepare: false });

const seededShowIds: string[] = [];

type Entry = {
  snapshotPath: string | null;
  variants?: unknown;
};

type ExpectedNameRow = { kind: "original" | "variant"; name: string };

async function seedShowWithPendingManifest(args: {
  embeddedImages: Entry[];
  linkedFolderItems: Entry[];
}): Promise<{ showId: string; driveFileId: string }> {
  const showId = randomUUID();
  const driveFileId = `variant-names-${showId.slice(0, 8)}`;
  await sql`
    insert into public.shows (id, drive_file_id, slug, title, client_label, template_version,
                              archived, published, requires_resync, picker_epoch, diagrams)
    values (${showId}::uuid, ${driveFileId}, ${`slug-${showId.slice(0, 8)}`}, 'Variant Names Fixture',
            'Client', 'v1', false, false, false, 1,
            ${sql.json({
              pending: {
                snapshot_revision_id: randomUUID(),
                snapshot_status: "complete",
                linkedFolder: null,
                embeddedImages: args.embeddedImages,
                linkedFolderItems: args.linkedFolderItems,
              },
            } as unknown as Parameters<typeof sql.json>[0])})`;
  seededShowIds.push(showId);
  return { showId, driveFileId };
}

/** Read the names SQL through the COMPOSED seam promoteSnapshotUpload uses:
 *  withPromoteLock builds the promote tx, withShowLock adopts it as-is
 *  (options.tx), and the query runs via `tx.queryRows`. */
async function expectedRows(showId: string, driveFileId: string): Promise<ExpectedNameRow[]> {
  const result = await withPromoteLock(showId, async (promoteTx) =>
    withShowLock(
      driveFileId,
      async (tx) => tx.queryRows<ExpectedNameRow>(EXPECTED_ASSET_NAMES_SQL, [showId]),
      { tx: promoteTx, assertInDev: false },
    ),
  );
  if (result !== null && typeof result === "object" && "skipped" in result) {
    throw new Error("show lock unexpectedly skipped in realdb fixture");
  }
  return result;
}

function sortRows(rows: ExpectedNameRow[]): ExpectedNameRow[] {
  return [...rows].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

function entry(path: string | null, variantKeys: string[]): Entry {
  const base: Entry = { snapshotPath: path };
  if (variantKeys.length > 0) {
    base.variants = variantKeys.map((key, index) => ({ width: 256 * (index + 1), key }));
  }
  return base;
}

afterAll(async () => {
  if (seededShowIds.length > 0) {
    await sql`delete from public.shows where id = any(${seededShowIds}::uuid[])`;
  }
  await sql.end({ timeout: 5 });
});

describe("EXPECTED_ASSET_NAMES_SQL against real Postgres (composed tx seam)", () => {
  test("emits an original row per non-null snapshotPath (full path) and a variant row per key, across both entry types", async () => {
    const prefix = "diagram-snapshots/shows/show-1/rev-1";
    const embedded = [
      entry(`${prefix}/embedded-a.png`, [
        "embedded-a.png@256.webp",
        "embedded-a.png@512.webp",
        "embedded-a.png@1024.webp",
      ]),
      entry(`${prefix}/embedded-b.png`, []),
    ];
    const linked = [
      entry(`${prefix}/folder-a.png`, ["folder-a.png@256.webp", "folder-a.png@512.webp"]),
      // The null-snapshotPath entry's variants must NOT emit rows — no original was uploaded.
      entry(null, ["ghost.png@256.webp", "ghost.png@512.webp", "ghost.png@1024.webp"]),
    ];
    const expected: ExpectedNameRow[] = [
      { kind: "original", name: `${prefix}/embedded-a.png` },
      { kind: "variant", name: "embedded-a.png@256.webp" },
      { kind: "variant", name: "embedded-a.png@512.webp" },
      { kind: "variant", name: "embedded-a.png@1024.webp" },
      { kind: "original", name: `${prefix}/embedded-b.png` },
      { kind: "original", name: `${prefix}/folder-a.png` },
      { kind: "variant", name: "folder-a.png@256.webp" },
      { kind: "variant", name: "folder-a.png@512.webp" },
    ];

    // Without variant rows in the fixture, a variant-blind query passes this test.
    premise(
      "the fixture carries variant rows to emit",
      expected.filter((r) => r.kind === "variant").length,
      0,
    );

    const { showId, driveFileId } = await seedShowWithPendingManifest({
      embeddedImages: embedded,
      linkedFolderItems: linked,
    });

    expect(sortRows(await expectedRows(showId, driveFileId))).toEqual(sortRows(expected));
  });

  test("a duplicate manifest entry yields the repeated row — multiplicities survive the query", async () => {
    // AC-3's `duplicated` class is computed in JS from the returned rows; a
    // DISTINCT/set-collapsing query would make two entries claiming one path
    // indistinguishable from one entry, so promotion could never flag it.
    const path = "diagram-snapshots/shows/show-2/rev-2/dup.png";
    const { showId, driveFileId } = await seedShowWithPendingManifest({
      embeddedImages: [entry(path, []), entry(path, [])],
      linkedFolderItems: [],
    });

    expect(sortRows(await expectedRows(showId, driveFileId))).toEqual([
      { kind: "original", name: path },
      { kind: "original", name: path },
    ]);
  });

  test("a malformed variants value contributes zero variant rows rather than throwing", async () => {
    // §4.1 keeps the count query's malformed-variants guard verbatim: a
    // non-array `variants` must not make promote explode before the typed
    // mismatch signal can be produced — it shrinks the expectation toward
    // originals-only.
    const prefix = "diagram-snapshots/shows/show-3/rev-3";
    const { showId, driveFileId } = await seedShowWithPendingManifest({
      embeddedImages: [
        { snapshotPath: `${prefix}/embedded-a.png`, variants: "not-an-array" },
        { snapshotPath: `${prefix}/embedded-b.png`, variants: null },
        { snapshotPath: `${prefix}/embedded-c.png`, variants: { width: 256 } },
      ],
      linkedFolderItems: [],
    });

    expect(sortRows(await expectedRows(showId, driveFileId))).toEqual([
      { kind: "original", name: `${prefix}/embedded-a.png` },
      { kind: "original", name: `${prefix}/embedded-b.png` },
      { kind: "original", name: `${prefix}/embedded-c.png` },
    ]);
  });

  test("an empty pending manifest emits zero rows", async () => {
    const { showId, driveFileId } = await seedShowWithPendingManifest({
      embeddedImages: [],
      linkedFolderItems: [],
    });
    expect(await expectedRows(showId, driveFileId)).toEqual([]);
  });
});

describe("single requirement source (AC-4 structural fences)", () => {
  test("EXPECTED_ASSET_COUNT_SQL no longer exists anywhere under lib/", () => {
    // Two sources of "what the manifest requires" is the drift this arc exists
    // to kill — the count SQL must be deleted, not kept alongside the names SQL.
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entryName of readdirSync(dir)) {
        const full = join(dir, entryName);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entryName)) {
          if (readFileSync(full, "utf8").includes("EXPECTED_ASSET_COUNT_SQL")) hits.push(full);
        }
      }
    };
    walk(join(process.cwd(), "lib"));
    expect(hits).toEqual([]);
  });

  test("LockableSyncTx does NOT declare queryRows — the shared seam stays narrow", () => {
    // Widening the shared interface would force `queryRows` onto every
    // production implementer (assetRecovery, runScheduledCronSync,
    // runOnboardingScan, lockedShowTx's adapter, unpublishShow). This fails
    // typecheck the moment someone widens it, instead of waiting for review.
    const t = { queryOne: async <T>() => ({}) as T } as LockableSyncTx;
    // @ts-expect-error — queryRows must exist only on LockablePromoteTx
    void t.queryRows;
    expect("queryRows" in t).toBe(false);
  });
});
