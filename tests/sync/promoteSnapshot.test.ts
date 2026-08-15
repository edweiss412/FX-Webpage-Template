import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { setLogSink, resetLogSink, type LogRecord } from "@/lib/log";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const snapshotRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const showId = "11111111-1111-4111-8111-111111111111";
const ledgerId = "22222222-2222-4222-8222-222222222222";
const driveFileId = "drive-file-1";
const tempPrefix = `diagram-snapshots/shows/${showId}/_pending/run-1/`;
const canonicalPrefix = `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/`;

const promoteMock = vi.hoisted(() => {
  const hoistedSnapshotRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const hoistedShowId = "11111111-1111-4111-8111-111111111111";
  const hoistedLedgerId = "22222222-2222-4222-8222-222222222222";
  const hoistedDriveFileId = "drive-file-1";
  const hoistedTempPrefix = `diagram-snapshots/shows/${hoistedShowId}/_pending/run-1/`;
  const initialRow = {
    id: hoistedLedgerId,
    show_id: hoistedShowId,
    drive_file_id: hoistedDriveFileId,
    temp_prefix: hoistedTempPrefix,
    snapshot_revision_id: hoistedSnapshotRevisionId,
    asset_count: 2,
    expected_asset_count: 2,
  };
  // Mutable repair-row fixture: individual tests override promote_started_at/delete_started_at
  // via a one-off `postgres` mock implementation (see repairSnapshotRollback describe block).
  return {
    events: [] as string[],
    showLockSkipped: false,
    initialRow,
    promoteTx: {
      queryOne: vi.fn(async (sql: string) => {
        if (/set\s+claim_token\s*=\s*gen_random_uuid\(\)/i.test(sql)) {
          return { ...initialRow, promoted_at: null, claim_token: "claim-1" };
        }
        return { ok: true };
      }),
    },
    showTx: {
      queryOne: vi.fn(async (sql: string) => {
        if (/with\s+target/i.test(sql)) return { updated: true };
        if (/promoted_at::text/i.test(sql)) return { promoted_at: null };
        return { ok: true };
      }),
      // Required-name rows for the names SQL (kind/name shape per spec §4.1).
      // Canned for ANY jsonb_array_elements SQL — semantics are pinned against
      // real Postgres in promoteSnapshotExpectedCount.realdb.test.ts.
      queryRows: vi.fn(async (sql: string) => {
        if (/jsonb_array_elements/i.test(sql)) {
          const canonical = `diagram-snapshots/shows/${hoistedShowId}/${hoistedSnapshotRevisionId}/`;
          return [
            { kind: "original", name: `${canonical}a.png` },
            { kind: "original", name: `${canonical}b.png` },
          ];
        }
        return [];
      }),
    },
    postgres: vi.fn(() => {
      const tag = vi.fn(async () => [initialRow]);
      return Object.assign(tag, {
        end: vi.fn(async () => undefined),
        // emitRollbackStuckAlert (the "rollback itself failed" path) opens its own connection
        // and calls sql.json(...) inside a tagged template.
        json: vi.fn((value: unknown) => value),
      });
    }),
  };
});

vi.mock("postgres", () => ({
  default: promoteMock.postgres,
}));

vi.mock("@/lib/sync/lockedPromoteTx", () => ({
  withPromoteLock: async (lockedShowId: string, fn: (tx: unknown) => Promise<unknown>) => {
    promoteMock.events.push(`promote:${lockedShowId}`);
    const resolved = await fn(promoteMock.promoteTx);
    // Ordering probe for the post-commit emit: anything pushed AFTER this event
    // happened outside the promote-lock transaction (spec §4.3).
    promoteMock.events.push(`promote-resolved:${lockedShowId}`);
    return resolved;
  },
}));

vi.mock("@/lib/sync/lockedShowTx", () => ({
  withShowLock: async (lockedDriveFileId: string, fn: (tx: unknown) => Promise<unknown>) => {
    promoteMock.events.push(`show:${lockedDriveFileId}`);
    if (promoteMock.showLockSkipped) return { skipped: "CONCURRENT_SYNC_SKIPPED" };
    return await fn(promoteMock.showTx);
  },
}));

// Sink-spy for the SNAPSHOT_PROMOTE_MANIFEST_MISMATCH warn (spec §6 telemetry
// behavior). The default sink would also attempt best-effort persistence; the
// spy replaces it wholesale so unit runs never touch persist.
const mismatchWarns: LogRecord[] = [];
beforeAll(() => {
  setLogSink(async (record) => {
    if (record.code === "SNAPSHOT_PROMOTE_MANIFEST_MISMATCH") {
      mismatchWarns.push(record);
      promoteMock.events.push(`warn:${record.code}`);
    }
  });
});
afterAll(() => resetLogSink());

const { promoteSnapshotUpload, repairSnapshotRollback, defaultStorage } =
  await import("@/lib/sync/promoteSnapshot");

// The exact resolve UPDATE from the S4 spec (docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md#s4):
// `update public.admin_alerts set resolved_at = now() where show_id = $1::uuid and code =
// 'PENDING_SNAPSHOT_ROLLBACK_STUCK' and resolved_at is null`, issued via the same `promoteTx`
// clearRolledBack/repairSnapshotRollback already hold — never a fresh connection.
function rollbackStuckResolveCalls(): unknown[][] {
  return promoteMock.promoteTx.queryOne.mock.calls.filter(([sql]: [string]) =>
    /update\s+public\.admin_alerts[\s\S]*resolved_at\s*=\s*now\(\)[\s\S]*PENDING_SNAPSHOT_ROLLBACK_STUCK[\s\S]*resolved_at\s+is\s+null/i.test(
      sql,
    ),
  );
}

describe("promoteSnapshotUpload", () => {
  beforeEach(() => {
    promoteMock.events.length = 0;
    promoteMock.promoteTx.queryOne.mockClear();
    promoteMock.showTx.queryOne.mockClear();
    promoteMock.showTx.queryRows.mockClear();
    promoteMock.postgres.mockClear();
    promoteMock.showLockSkipped = false;
    mismatchWarns.length = 0;
  });

  test("promotes temp assets under promote lock then show lock and cuts over diagrams", async () => {
    const moves: Array<{ from: string; to: string }> = [];
    const storage = {
      list: vi.fn(async (prefix: string) => {
        if (prefix === tempPrefix) return [`${tempPrefix}a.png`, `${tempPrefix}b.png`];
        if (prefix === canonicalPrefix)
          return [`${canonicalPrefix}a.png`, `${canonicalPrefix}b.png`];
        return [];
      }),
      move: vi.fn(async (from: string, to: string) => void moves.push({ from, to })),
    };

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({ outcome: "promoted", snapshotRevisionId });
    expect(promoteMock.events).toEqual([
      `promote:${showId}`,
      `show:${driveFileId}`,
      `promote-resolved:${showId}`,
    ]);
    expect(moves).toEqual([
      { from: `${tempPrefix}a.png`, to: `${canonicalPrefix}a.png` },
      { from: `${tempPrefix}b.png`, to: `${canonicalPrefix}b.png` },
    ]);
    expect(promoteMock.showTx.queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/with\s+target[\s\S]*update_show[\s\S]*update_ledger/i),
      [snapshotRevisionId, "claim-1"],
    );
  });

  // S4 (docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md#s4): clearRolledBack is
  // the automatic-retry rollback-completion code point. A manifest-count mismatch on the
  // temp-prefix listing (asset_count=2 but storage only has 1 file) is the simplest trigger for
  // clearRolledBack — it fires BEFORE any move is attempted, so this proves the resolve fires on
  // successful ledger-reset completion, not tangled up with the move/rollback machinery.
  test("successful clearRolledBack resolves the ROLLBACK_STUCK alert via promoteTx", async () => {
    const storage = {
      list: vi.fn(async (prefix: string) => (prefix === tempPrefix ? [`${tempPrefix}a.png`] : [])),
      move: vi.fn(async () => undefined),
    };

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toMatchObject({ outcome: "manifest_mismatch", snapshotRevisionId });
    const calls = rollbackStuckResolveCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual([showId]);
  });

  // S4: when the rollback itself fails (the reverse move throws too), the code takes the
  // emitRollbackStuckAlert branch, NOT clearRolledBack — so the resolve UPDATE must never fire.
  // A failing-rollback path with zero resolves is the only "not resolved" case that's directly
  // reachable through promoteSnapshotUpload's public surface.
  test("failed rollback (reverse move throws) does not resolve the ROLLBACK_STUCK alert", async () => {
    let moveCall = 0;
    const storage = {
      list: vi.fn(async (prefix: string) => {
        if (prefix === tempPrefix) return [`${tempPrefix}a.png`, `${tempPrefix}b.png`];
        return [];
      }),
      move: vi.fn(async () => {
        moveCall += 1;
        // call 1: forward move of a.png -> canonical/a.png succeeds (renamed becomes non-empty).
        if (moveCall === 1) return undefined;
        // call 2: forward move of b.png throws -> enters the outer catch.
        if (moveCall === 2) throw new Error("forward move failed");
        // call 3: rollback's reverse move of canonical/a.png -> temp/a.png also throws, so the
        // rollback itself fails and clearRolledBack is never reached.
        throw new Error("rollback move failed");
      }),
    };

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({ outcome: "manifest_mismatch", snapshotRevisionId });
    expect(moveCall).toBe(3);
    expect(rollbackStuckResolveCalls()).toHaveLength(0);
    // Rollback-failure mismatches carry no deltas — no comparison produced them —
    // so the SNAPSHOT_PROMOTE_MANIFEST_MISMATCH warn must NOT fire (spec §4.3);
    // that branch keeps its own PENDING_SNAPSHOT_ROLLBACK_STUCK alert instead.
    expect(mismatchWarns).toHaveLength(0);
  });
});

describe("repairSnapshotRollback", () => {
  beforeEach(() => {
    promoteMock.events.length = 0;
    promoteMock.promoteTx.queryOne.mockClear();
    promoteMock.showTx.queryOne.mockClear();
    promoteMock.showTx.queryRows.mockClear();
    promoteMock.postgres.mockClear();
    promoteMock.showLockSkipped = false;
    mismatchWarns.length = 0;
  });

  function storage() {
    return {
      list: vi.fn(async (prefix: string) =>
        prefix === tempPrefix || prefix === canonicalPrefix
          ? [`${prefix}a.png`, `${prefix}b.png`]
          : [],
      ),
      move: vi.fn(async () => undefined),
      removePrefix: vi.fn(async () => undefined),
    };
  }

  // S4: repairSnapshotRollback's `repaired` branch is the catalog-prescribed manual-repair
  // rollback-completion code point (the second of exactly two hooks per the spec). A stuck
  // promote (promote_started_at >15min old, delete_started_at null) reaches the full
  // canonical-rewind repair, which performs the same ledger reset as clearRolledBack and must
  // resolve ROLLBACK_STUCK the same way, via the closure's promoteTx (not the inner show-lock tx).
  test("repaired branch (stuck promote rewind) resolves the ROLLBACK_STUCK alert via promoteTx", async () => {
    const stuck = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    promoteMock.postgres.mockImplementationOnce(() => {
      const tag = vi.fn(async () => [
        { ...promoteMock.initialRow, promote_started_at: stuck, delete_started_at: null },
      ]);
      return Object.assign(tag, {
        end: vi.fn(async () => undefined),
        json: vi.fn((value: unknown) => value),
      });
    });

    const result = await repairSnapshotRollback(ledgerId, { storage: storage() });

    expect(result).toEqual({ outcome: "repaired", snapshotRevisionId });
    const calls = rollbackStuckResolveCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual([showId]);
  });

  test("not_stuck ledger row does not resolve the ROLLBACK_STUCK alert", async () => {
    promoteMock.postgres.mockImplementationOnce(() => {
      const tag = vi.fn(async () => [
        { ...promoteMock.initialRow, promote_started_at: null, delete_started_at: null },
      ]);
      return Object.assign(tag, {
        end: vi.fn(async () => undefined),
        json: vi.fn((value: unknown) => value),
      });
    });

    const result = await repairSnapshotRollback(ledgerId, { storage: storage() });

    expect(result).toEqual({ outcome: "not_stuck", snapshotRevisionId });
    expect(rollbackStuckResolveCalls()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Variant-aware promotion (spec §3 promotion changes (a) and (b)).
//
// (a)'s SQL semantics are pinned against real Postgres in the sibling
// promoteSnapshotExpectedCount.realdb.test.ts — the `showTx.queryOne` mock above
// returns a canned count for ANY jsonb_array_elements query, so nothing about the
// SQL itself can fail here. These rows pin the FLOW around it, plus the storage
// adapter's pagination.
// ---------------------------------------------------------------------------

describe("promoteSnapshotUpload — variant objects", () => {
  beforeEach(() => {
    promoteMock.events.length = 0;
    promoteMock.promoteTx.queryOne.mockClear();
    promoteMock.showTx.queryOne.mockClear();
    promoteMock.showTx.queryRows.mockClear();
    promoteMock.postgres.mockClear();
    promoteMock.showLockSkipped = false;
    mismatchWarns.length = 0;
  });

  function variantAwareShowTx(rows: Array<{ kind: string; name: string }>) {
    promoteMock.showTx.queryRows.mockImplementation(async (sql: string) =>
      /jsonb_array_elements/i.test(sql) ? rows : [],
    );
  }

  test("a variant-bearing listing promotes when every listed object is present", async () => {
    // 2 originals + 3 variants: the expectation the widened SQL produces.
    const objects = [
      `${tempPrefix}embedded-a.png`,
      `${tempPrefix}embedded-a.png@256.webp`,
      `${tempPrefix}embedded-a.png@512.webp`,
      `${tempPrefix}folder-b.png`,
      `${tempPrefix}folder-b.png@256.webp`,
    ];
    variantAwareShowTx([
      { kind: "original", name: `${canonicalPrefix}embedded-a.png` },
      { kind: "variant", name: "embedded-a.png@256.webp" },
      { kind: "variant", name: "embedded-a.png@512.webp" },
      { kind: "original", name: `${canonicalPrefix}folder-b.png` },
      { kind: "variant", name: "folder-b.png@256.webp" },
    ]);
    const moved: Array<{ from: string; to: string }> = [];
    const storage = {
      list: vi.fn(async (prefix: string) =>
        prefix === tempPrefix
          ? objects
          : objects.map((path) => `${canonicalPrefix}${path.slice(tempPrefix.length)}`),
      ),
      move: vi.fn(async (from: string, to: string) => void moved.push({ from, to })),
      removePrefix: vi.fn(async () => undefined),
    };

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({ outcome: "promoted", snapshotRevisionId });
    // Every variant crosses to canonical alongside its original — a promote that
    // moved only originals would leave the manifest pointing at temp-prefix bytes.
    expect(moved.map((entry) => entry.to)).toEqual(
      objects.map((path) => `${canonicalPrefix}${path.slice(tempPrefix.length)}`),
    );
  });

  test("one missing variant object trips manifest_mismatch", async () => {
    const required = [
      { kind: "original", name: `${canonicalPrefix}embedded-a.png` },
      { kind: "variant", name: "embedded-a.png@256.webp" },
      { kind: "variant", name: "embedded-a.png@512.webp" },
      { kind: "original", name: `${canonicalPrefix}folder-b.png` },
      { kind: "variant", name: "folder-b.png@256.webp" },
    ];
    const present = [
      `${tempPrefix}embedded-a.png`,
      `${tempPrefix}embedded-a.png@256.webp`,
      `${tempPrefix}folder-b.png`,
      `${tempPrefix}folder-b.png@256.webp`,
    ];
    premiseHolds(
      "the fixture is short exactly one object, so the mismatch is the variant's absence",
      present.length === required.length - 1,
    );
    variantAwareShowTx(required);
    const storage = {
      list: vi.fn(async (prefix: string) => (prefix === tempPrefix ? present : [])),
      move: vi.fn(async () => undefined),
      removePrefix: vi.fn(async () => undefined),
    };

    expect(await promoteSnapshotUpload(snapshotRevisionId, { storage })).toMatchObject({
      outcome: "manifest_mismatch",
      snapshotRevisionId,
      deltas: { missing: ["embedded-a.png@512.webp"], extra: [] },
    });
  });
});

describe("defaultStorage — pagination past the SDK's 100-object page", () => {
  // 60 diagrams (MAX_TOTAL_DIAGRAM_ITEMS) x (1 original + up to 3 variants) = up to
  // 240 objects, so a single unpaginated list() silently truncates at 100 and every
  // variant-bearing promote fails its manifest check.
  const OBJECT_COUNT = 137;
  const PAGE = 100;

  function fakeSupabase(objectCount: number) {
    const names = Array.from({ length: objectCount }, (_, index) => `object-${index}.webp`);
    const listCalls: Array<{ prefix: string; limit?: number; offset?: number }> = [];
    const removed: string[][] = [];
    const bucket = {
      list: async (prefix: string, options?: { limit?: number; offset?: number }) => {
        listCalls.push({ prefix, ...(options ?? {}) });
        const limit = options?.limit ?? PAGE;
        const offset = options?.offset ?? 0;
        return {
          data: names.slice(offset, offset + limit).map((name) => ({ name, id: name })),
          error: null,
        };
      },
      remove: async (paths: string[]) => {
        removed.push(paths);
        return { error: null };
      },
      move: async () => ({ error: null }),
    };
    return {
      listCalls,
      removed,
      client: { storage: { from: () => bucket } } as unknown as Parameters<
        typeof defaultStorage
      >[0],
    };
  }

  test("list() returns every object, not just the first page", async () => {
    premise("the fixture exceeds one SDK page, or pagination is untested", OBJECT_COUNT, PAGE);
    const fake = fakeSupabase(OBJECT_COUNT);

    const paths = await defaultStorage(fake.client).list(tempPrefix);

    expect(paths).toHaveLength(OBJECT_COUNT);
    expect(paths[0]).toBe(`${tempPrefix}object-0.webp`);
    expect(paths.at(-1)).toBe(`${tempPrefix}object-${OBJECT_COUNT - 1}.webp`);
    expect(fake.listCalls.length).toBeGreaterThan(1);
  });

  test("removePrefix() removes every object, not just the first page", async () => {
    premise("the fixture exceeds one SDK page, or pagination is untested", OBJECT_COUNT, PAGE);
    const fake = fakeSupabase(OBJECT_COUNT);

    await defaultStorage(fake.client).removePrefix!(tempPrefix);

    expect(fake.removed.flat()).toHaveLength(OBJECT_COUNT);
  });
});

// ---------------------------------------------------------------------------
// Name-set validation (spec docs/superpowers/specs/2026-08-10-promote-identity-validation.md
// §4.2/§4.3/§6): path binding first, then exact-set multiset comparison at both
// checkpoints, bounded deltas, and the post-commit SNAPSHOT_PROMOTE_MANIFEST_MISMATCH
// warn. Expected names derive from the fixture manifests, never from
// implementation output.
// ---------------------------------------------------------------------------

describe("promoteSnapshotUpload — name-set validation (exact set + path binding)", () => {
  type RequiredRow = { kind: "original" | "variant"; name: string };

  const defaultRequired: RequiredRow[] = [
    { kind: "original", name: `${canonicalPrefix}a.png` },
    { kind: "original", name: `${canonicalPrefix}b.png` },
  ];

  function setRequiredRows(rows: RequiredRow[]) {
    promoteMock.showTx.queryRows.mockImplementation(async (sql: string) =>
      /jsonb_array_elements/i.test(sql) ? rows.map((row) => ({ ...row })) : [],
    );
  }

  function recordingStorage(listings: Record<string, string[]>) {
    const moves: Array<{ from: string; to: string }> = [];
    return {
      moves,
      storage: {
        list: vi.fn(async (prefix: string) => listings[prefix] ?? []),
        move: vi.fn(async (from: string, to: string) => void moves.push({ from, to })),
        removePrefix: vi.fn(async () => undefined),
      },
    };
  }

  beforeEach(() => {
    promoteMock.events.length = 0;
    promoteMock.promoteTx.queryOne.mockClear();
    promoteMock.showTx.queryOne.mockClear();
    promoteMock.showTx.queryRows.mockClear();
    promoteMock.postgres.mockClear();
    promoteMock.showLockSkipped = false;
    mismatchWarns.length = 0;
    setRequiredRows(defaultRequired);
  });

  test("AC-1: the filing's probe shape — equal count, missing required name — fails with the missing name reported", async () => {
    // The filing's probe: countCheckPasses:true with
    // missingExpected:["embedded-a.png@256.webp"] — an unrelated equal-count
    // extra masks the absent variant under a count-only check.
    setRequiredRows([
      { kind: "original", name: `${canonicalPrefix}embedded-a.png` },
      { kind: "variant", name: "embedded-a.png@256.webp" },
    ]);
    const { storage } = recordingStorage({
      [tempPrefix]: [`${tempPrefix}embedded-a.png`, `${tempPrefix}unrelated.bin`],
    });

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({
      outcome: "manifest_mismatch",
      snapshotRevisionId,
      deltas: {
        missing: ["embedded-a.png@256.webp"],
        extra: ["unrelated.bin"],
        duplicated: [],
        mispathed: [],
        truncated: false,
      },
    });
  });

  test("AC-2: all required present plus an extra fails with only `extra` populated (exact set)", async () => {
    const { storage } = recordingStorage({
      [tempPrefix]: [`${tempPrefix}a.png`, `${tempPrefix}b.png`, `${tempPrefix}stray.bin`],
    });

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({
      outcome: "manifest_mismatch",
      snapshotRevisionId,
      deltas: {
        missing: [],
        extra: ["stray.bin"],
        duplicated: [],
        mispathed: [],
        truncated: false,
      },
    });
  });

  test("AC-2: an exact match promotes, and the mismatch warn never fires", async () => {
    const { storage } = recordingStorage({
      [tempPrefix]: [`${tempPrefix}a.png`, `${tempPrefix}b.png`],
      [canonicalPrefix]: [`${canonicalPrefix}a.png`, `${canonicalPrefix}b.png`],
    });

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({ outcome: "promoted", snapshotRevisionId });
    expect(mismatchWarns).toHaveLength(0);
  });

  test("AC-3: a duplicated requirement fails as `duplicated`, not `missing`", async () => {
    // Two manifest entries claiming one basename: a storage listing cannot
    // duplicate a path, so the requirement is unsatisfiable-as-a-set.
    setRequiredRows([
      { kind: "original", name: `${canonicalPrefix}dup.png` },
      { kind: "original", name: `${canonicalPrefix}dup.png` },
    ]);
    const { storage } = recordingStorage({ [tempPrefix]: [`${tempPrefix}dup.png`] });

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({
      outcome: "manifest_mismatch",
      snapshotRevisionId,
      deltas: {
        missing: [],
        extra: [],
        duplicated: ["dup.png"],
        mispathed: [],
        truncated: false,
      },
    });
  });

  test("AC-3: a stale-revision or bare snapshotPath fails as `mispathed` BEFORE any listing comparison", async () => {
    const staleRev = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const stalePath = `diagram-snapshots/shows/${showId}/${staleRev}/embedded-a.png`;
    setRequiredRows([
      // Right basename, wrong revision dirname — the R4 probe shape: would pass
      // a basename-only check, cut over, and 410 at serve time.
      { kind: "original", name: stalePath },
      // Slash-less original: mispathed by definition (dirname can't equal the prefix).
      { kind: "original", name: "bare.png" },
      // Variant keys are basenames by construction and take NO path check —
      // mislabeling provenance would falsely flag this row.
      { kind: "variant", name: "embedded-a.png@256.webp" },
    ]);
    const { storage } = recordingStorage({});

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({
      outcome: "manifest_mismatch",
      snapshotRevisionId,
      deltas: {
        missing: [],
        extra: [],
        duplicated: [],
        mispathed: ["bare.png", stalePath],
        truncated: false,
      },
    });
    // Ordering proof: the mispathed failure happened before promotion ever
    // consulted storage — the listing comparison was never reached.
    expect(storage.list).not.toHaveBeenCalled();
    expect(mismatchWarns).toHaveLength(1);
  });

  test("an 11-name delta records 10 names + truncated:true", async () => {
    const names = Array.from({ length: 11 }, (_, i) => `c${String(i).padStart(2, "0")}.png`);
    premise("the fixture exceeds the 10-name bound, or truncation is untested", names.length, 10);
    setRequiredRows(
      names.map((name) => ({ kind: "original" as const, name: `${canonicalPrefix}${name}` })),
    );
    const { storage } = recordingStorage({ [tempPrefix]: [] });

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result.outcome).toBe("manifest_mismatch");
    const deltas = (result as { deltas?: { missing: string[]; truncated: boolean } }).deltas;
    expect(deltas?.missing).toEqual([...names].sort().slice(0, 10));
    expect(deltas?.truncated).toBe(true);
  });

  test("a post-move extra rolls every moved object back and reports `extra`", async () => {
    const { moves, storage } = recordingStorage({
      [tempPrefix]: [`${tempPrefix}a.png`, `${tempPrefix}b.png`],
      [canonicalPrefix]: [
        `${canonicalPrefix}a.png`,
        `${canonicalPrefix}b.png`,
        `${canonicalPrefix}phantom.bin`,
      ],
    });

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({
      outcome: "manifest_mismatch",
      snapshotRevisionId,
      deltas: {
        missing: [],
        extra: ["phantom.bin"],
        duplicated: [],
        mispathed: [],
        truncated: false,
      },
    });
    // Forward moves, then the reverse loop restores them in reverse order.
    expect(moves).toEqual([
      { from: `${tempPrefix}a.png`, to: `${canonicalPrefix}a.png` },
      { from: `${tempPrefix}b.png`, to: `${canonicalPrefix}b.png` },
      { from: `${canonicalPrefix}b.png`, to: `${tempPrefix}b.png` },
      { from: `${canonicalPrefix}a.png`, to: `${tempPrefix}a.png` },
    ]);
    expect(mismatchWarns).toHaveLength(1);
  });

  test("the mismatch warn fires exactly once, AFTER the promote transaction resolves, with the bounded deltas", async () => {
    setRequiredRows([
      { kind: "original", name: `${canonicalPrefix}embedded-a.png` },
      { kind: "variant", name: "embedded-a.png@256.webp" },
    ]);
    const { storage } = recordingStorage({
      [tempPrefix]: [`${tempPrefix}embedded-a.png`, `${tempPrefix}unrelated.bin`],
    });

    await promoteSnapshotUpload(snapshotRevisionId, { storage });

    const warnEvents = promoteMock.events.filter((event) => event.startsWith("warn:"));
    expect(warnEvents).toHaveLength(1);
    // POST-COMMIT: the warn lands after withPromoteLock resolved, never inside it.
    expect(promoteMock.events.indexOf("warn:SNAPSHOT_PROMOTE_MANIFEST_MISMATCH")).toBeGreaterThan(
      promoteMock.events.indexOf(`promote-resolved:${showId}`),
    );
    expect(mismatchWarns).toHaveLength(1);
    const record = mismatchWarns[0]!;
    expect(record.level).toBe("warn");
    expect(record.showId).toBe(showId);
    expect(record.context.snapshotRevisionId).toBe(snapshotRevisionId);
    // Variant keys embed `@<width>`; the emit encodes `@` as `[at]` so the
    // logger's email-redaction net can't collapse the name to [email-redacted].
    expect(record.context.deltas).toEqual({
      missing: ["embedded-a.png[at]256.webp"],
      extra: ["unrelated.bin"],
      duplicated: [],
      mispathed: [],
      truncated: false,
    });
  });

  test("a lock-skipped mismatch carries no deltas and does not warn", async () => {
    promoteMock.showLockSkipped = true;
    const { storage } = recordingStorage({});

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({ outcome: "manifest_mismatch", snapshotRevisionId });
    expect((result as { deltas?: unknown }).deltas).toBeUndefined();
    expect(mismatchWarns).toHaveLength(0);
  });
});
