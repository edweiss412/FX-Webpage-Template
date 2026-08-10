// tests/sync/promoteSnapshotExpectedCount.realdb.test.ts
//
// REAL-DB evaluation of promoteSnapshot's expected-object-count SQL (spec §3
// promotion change (a)).
//
// Why a real database: the unit suite's `showTx.queryOne` mock returns a canned
// count for ANY SQL matching /jsonb_array_elements/ (tests/sync/promoteSnapshot.test.ts),
// so SQL SEMANTICS cannot fail through that seam — a query that ignored variants
// entirely would still pass there. This file runs the EXPORTED query text against
// Postgres, so the thing under test is the shipped string, not a copy of it.
//
// Failure modes caught: a variant-blind count (promote would trip
// manifest_mismatch on every variant-bearing snapshot and no diagram would ever
// go live), counting variants on entries whose snapshotPath is null, and a
// malformed `variants` value throwing instead of counting as zero.

import { afterAll, describe, expect, test } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { EXPECTED_ASSET_COUNT_SQL } from "@/lib/sync/promoteSnapshot";
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

async function seedShowWithPendingManifest(args: {
  embeddedImages: Entry[];
  linkedFolderItems: Entry[];
}): Promise<string> {
  const showId = randomUUID();
  const driveFileId = `variant-count-${showId.slice(0, 8)}`;
  await sql`
    insert into public.shows (id, drive_file_id, slug, title, client_label, template_version,
                              archived, published, requires_resync, picker_epoch, diagrams)
    values (${showId}::uuid, ${driveFileId}, ${`slug-${showId.slice(0, 8)}`}, 'Variant Count Fixture',
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
  return showId;
}

async function expectedCount(showId: string): Promise<number> {
  const rows = await sql.unsafe<Array<{ count: number }>>(EXPECTED_ASSET_COUNT_SQL, [showId]);
  return rows[0]!.count;
}

function entry(path: string | null, variantCount: number): Entry {
  const base: Entry = { snapshotPath: path };
  if (variantCount > 0) {
    base.variants = Array.from({ length: variantCount }, (_, index) => ({
      width: 256 * (index + 1),
      key: `asset.png@${256 * (index + 1)}.webp`,
    }));
  }
  return base;
}

afterAll(async () => {
  if (seededShowIds.length > 0) {
    await sql`delete from public.shows where id = any(${seededShowIds}::uuid[])`;
  }
  await sql.end({ timeout: 5 });
});

describe("EXPECTED_ASSET_COUNT_SQL against real Postgres", () => {
  test("counts every non-null original PLUS its listed variants, across both entry types", async () => {
    const embedded = [entry("path/embedded-a.png", 3), entry("path/embedded-b.png", 0)];
    const linked = [entry("path/folder-a.png", 2), entry(null, 3)];
    const variantRows =
      3 +
      0 +
      2; /* the null-snapshotPath entry's 3 variants must NOT count — no original was uploaded */

    // Without variant rows in the fixture, a variant-blind query passes this test.
    premise("the fixture carries variant rows to count", variantRows, 0);

    const showId = await seedShowWithPendingManifest({
      embeddedImages: embedded,
      linkedFolderItems: linked,
    });

    // 3 uploaded originals (the null-path entry uploads nothing) + 5 variant objects.
    const originals = [...embedded, ...linked].filter((e) => e.snapshotPath !== null).length;
    expect(await expectedCount(showId)).toBe(originals + variantRows);
  });

  test("a manifest with no variants counts exactly its non-null originals (pre-migration parity)", async () => {
    const showId = await seedShowWithPendingManifest({
      embeddedImages: [entry("path/embedded-a.png", 0)],
      linkedFolderItems: [entry("path/folder-a.png", 0), entry(null, 0)],
    });

    expect(await expectedCount(showId)).toBe(2);
  });

  test("a malformed variants value counts as zero rather than throwing", async () => {
    // §4 guard conditions reach the count too: a non-array `variants` must not
    // make promote explode — it shrinks the expectation toward originals-only.
    const showId = await seedShowWithPendingManifest({
      embeddedImages: [
        { snapshotPath: "path/embedded-a.png", variants: "not-an-array" },
        { snapshotPath: "path/embedded-b.png", variants: null },
        { snapshotPath: "path/embedded-c.png", variants: { width: 256 } },
      ],
      linkedFolderItems: [],
    });

    expect(await expectedCount(showId)).toBe(3);
  });

  test("an empty pending manifest counts zero", async () => {
    const showId = await seedShowWithPendingManifest({ embeddedImages: [], linkedFolderItems: [] });
    expect(await expectedCount(showId)).toBe(0);
  });
});
