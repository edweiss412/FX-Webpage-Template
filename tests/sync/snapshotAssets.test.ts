import { createHash } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import type { ParseResult } from "@/lib/parser/types";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import sharp from "sharp";
import type { PersistedDiagrams } from "@/lib/parser/types";
import {
  snapshotAssets,
  type SnapshotAssetsArgs,
  type SnapshotAssetsStorage,
} from "@/lib/sync/snapshotAssets";
import { DIAGRAM_VARIANT_WIDTHS } from "@/lib/sync/diagramVariants";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const showId = "11111111-1111-4111-8111-111111111111";
const driveFileId = "sheet-file-1";

function md5Hex(bytes: string): string {
  return createHash("md5").update(new TextEncoder().encode(bytes)).digest("hex");
}

function diagrams(overrides: Partial<ParseResult["diagrams"]> = {}): ParseResult["diagrams"] {
  return {
    linkedFolder: null,
    embeddedImages: [],
    linkedFolderItems: [],
    ...overrides,
  };
}

function fakeStorage() {
  const uploaded: Array<{ path: string; bytes: Uint8Array; contentType: string }> = [];
  const storage: SnapshotAssetsStorage = {
    async upload(path, bytes, options) {
      uploaded.push({ path, bytes, contentType: options.contentType });
    },
  };
  return { storage, uploaded };
}

describe("snapshotAssets", () => {
  test("mints distinct revision ids and temp prefixes for repeated applies of the same source revision", async () => {
    const firstStorage = fakeStorage();
    const secondStorage = fakeStorage();
    const txRows: unknown[] = [];
    const baseDiagrams = diagrams({
      linkedFolderItems: [
        {
          driveFileId: "linked-1",
          mimeType: "image/png",
          drive_modified_time: "2026-05-01T00:00:00.000Z",
          headRevisionId: "rev-linked-1",
          md5Checksum: md5Hex("linked-bytes"),
          snapshotPath: null,
        },
      ],
    });

    const first = await snapshotAssets({
      showId,
      driveFileId,
      diagrams: baseDiagrams,
      tx: { insertPendingSnapshotUpload: async (row) => void txRows.push(row) },
      storage: firstStorage.storage,
      drive: {
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
        fetchEmbeddedImageBytes: async () => null,
      },
      uuid: vi
        .fn()
        .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    });
    const second = await snapshotAssets({
      showId,
      driveFileId,
      diagrams: baseDiagrams,
      tx: { insertPendingSnapshotUpload: async (row) => void txRows.push(row) },
      storage: secondStorage.storage,
      drive: {
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
        fetchEmbeddedImageBytes: async () => null,
      },
      uuid: vi
        .fn()
        .mockReturnValueOnce("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
        .mockReturnValueOnce("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
    });

    expect(first.snapshotRevisionId).not.toBe(second.snapshotRevisionId);
    expect(first.tempPrefix).not.toBe(second.tempPrefix);
    expect(txRows).toHaveLength(2);
    expect(firstStorage.uploaded[0]?.path).toContain(
      "_pending/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/",
    );
    expect(secondStorage.uploaded[0]?.path).toContain(
      "_pending/dddddddd-dddd-4ddd-8ddd-dddddddddddd/",
    );
  });

  test("uploads verified linked and embedded bytes to the temp prefix and stores canonical paths in pending manifest", async () => {
    const { storage, uploaded } = fakeStorage();
    const embeddedBytes = new TextEncoder().encode("embedded-bytes");
    const linkedBytes = new TextEncoder().encode("linked-bytes");

    const result = await snapshotAssets({
      showId,
      driveFileId,
      diagrams: diagrams({
        embeddedImages: [
          {
            sheetTab: "DIAGRAMS",
            objectId: "obj-1",
            mimeType: "image/png",
            sheetsRevisionId: "sheet-rev-1",
            embeddedFingerprint: sha256Base64Url(embeddedBytes),
            recovery_disposition: "normal",
            snapshotPath: null,
          },
        ],
        linkedFolderItems: [
          {
            driveFileId: "linked-1",
            mimeType: "image/jpeg",
            drive_modified_time: "2026-05-01T00:00:00.000Z",
            headRevisionId: "rev-linked-1",
            md5Checksum: createHash("md5").update(linkedBytes).digest("hex"),
            snapshotPath: null,
          },
        ],
      }),
      tx: { insertPendingSnapshotUpload: async () => undefined },
      storage,
      drive: {
        fetchEmbeddedImageBytes: async () => embeddedBytes,
        fetchLinkedRevisionBytes: async () => linkedBytes,
      },
      uuid: vi
        .fn()
        .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    });

    expect(uploaded.map((entry) => entry.path)).toEqual([
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/_pending/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/embedded-obj-1.png",
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/_pending/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/folder-linked-1.jpg",
    ]);
    expect(result.pending).toMatchObject({
      revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      snapshot_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      snapshot_status: "complete",
    });
    expect(result.pending.embeddedImages[0]?.snapshotPath).toBe(
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/embedded-obj-1.png",
    );
    expect(result.pending.linkedFolderItems[0]?.snapshotPath).toBe(
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/folder-linked-1.jpg",
    );
  });

  test("fail-closed drift leaves snapshotPath null and marks partial failure", async () => {
    const { storage, uploaded } = fakeStorage();
    const result = await snapshotAssets({
      showId,
      driveFileId,
      diagrams: diagrams({
        embeddedImages: [
          {
            sheetTab: "DIAGRAMS",
            objectId: "obj-1",
            mimeType: "image/png",
            sheetsRevisionId: "sheet-rev-1",
            embeddedFingerprint: sha256Base64Url(new TextEncoder().encode("approved")),
            recovery_disposition: "normal",
            snapshotPath: null,
          },
          {
            sheetTab: "DIAGRAMS",
            objectId: "obj-restage",
            mimeType: "image/png",
            sheetsRevisionId: "sheet-rev-1",
            embeddedFingerprint: null,
            recovery_disposition: "restage_required",
            snapshotPath: null,
          },
        ],
        linkedFolderItems: [
          {
            driveFileId: "linked-1",
            mimeType: "image/png",
            drive_modified_time: "2026-05-01T00:00:00.000Z",
            headRevisionId: "rev-linked-1",
            md5Checksum: md5Hex("approved-linked"),
            snapshotPath: null,
          },
        ],
      }),
      tx: { insertPendingSnapshotUpload: async () => undefined },
      storage,
      drive: {
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("mutated"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("mutated-linked"),
      },
      uuid: vi
        .fn()
        .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    });

    expect(uploaded).toEqual([]);
    expect(result.pending.snapshot_status).toBe("partial_failure");
    expect(result.pending.embeddedImages.map((entry) => entry.snapshotPath)).toEqual([null, null]);
    expect(result.pending.linkedFolderItems.map((entry) => entry.snapshotPath)).toEqual([null]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "EMBEDDED_ASSET_DRIFTED",
      "EMBEDDED_ASSET_DRIFTED",
    ]);
  });

  test("inserts exactly one pending_snapshot_uploads ledger row per apply attempt", async () => {
    const ledgerRows: unknown[] = [];
    await snapshotAssets({
      showId,
      driveFileId,
      diagrams: diagrams({
        linkedFolderItems: [
          {
            driveFileId: "linked-1",
            mimeType: "image/png",
            drive_modified_time: "2026-05-01T00:00:00.000Z",
            headRevisionId: "rev-linked-1",
            md5Checksum: md5Hex("linked-bytes"),
            snapshotPath: null,
          },
          {
            driveFileId: "linked-2",
            mimeType: "image/png",
            drive_modified_time: "2026-05-01T00:00:00.000Z",
            headRevisionId: "rev-linked-2",
            md5Checksum: md5Hex("linked-bytes"),
            snapshotPath: null,
          },
        ],
      }),
      tx: { insertPendingSnapshotUpload: async (row) => void ledgerRows.push(row) },
      storage: fakeStorage().storage,
      drive: {
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
        fetchEmbeddedImageBytes: async () => null,
      },
      uuid: vi
        .fn()
        .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    });

    expect(ledgerRows).toEqual([
      {
        showId,
        driveFileId,
        snapshotRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tempPrefix:
          "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/_pending/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/",
        assetCount: 2,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Variant stage wiring (spec §3 producer, §4 manifest fields).
//
// These rows are the PRODUCER half of the failure-signal hop census: snapshotAssets
// runs inside the show advisory-lock tx, so it may not log — it returns
// `variantFailures` as DATA and each consuming surface emits post-commit.
// ---------------------------------------------------------------------------

describe("snapshotAssets — variant stage", () => {
  const runUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const snapshotRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const temp = `diagram-snapshots/shows/${showId}/_pending/${runUuid}/`;

  function uuidPair() {
    return vi.fn().mockReturnValueOnce(snapshotRevisionId).mockReturnValueOnce(runUuid);
  }

  async function pngBytes(width: number, height: number): Promise<Uint8Array> {
    const buffer = await sharp({
      create: { width, height, channels: 3, background: { r: 40, g: 80, b: 160 } },
    })
      .png()
      .toBuffer();
    return new Uint8Array(buffer);
  }

  function basename(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1);
  }

  test("a wide embedded image uploads its variants to the temp prefix and records the §4 fields", async () => {
    const width = 1200;
    premise(
      "fixture width exceeds the smallest ladder tier",
      width,
      Math.min(...DIAGRAM_VARIANT_WIDTHS),
    );
    const bytes = await pngBytes(width, 900);
    const store = fakeStorage();

    const result = await snapshotAssets({
      showId,
      driveFileId,
      diagrams: diagrams({
        embeddedImages: [
          {
            sheetTab: "Diagrams",
            objectId: "obj-1",
            mimeType: "image/png",
            sheetsRevisionId: "rev-sheet-1",
            embeddedFingerprint: sha256Base64Url(bytes),
            recovery_disposition: "normal" as const,
            snapshotPath: null,
          },
        ],
      }),
      tx: { insertPendingSnapshotUpload: async () => {} },
      storage: store.storage,
      drive: {
        fetchEmbeddedImageBytes: async () => bytes,
        fetchLinkedRevisionBytes: async () => null,
      },
      uuid: uuidPair(),
    });

    const assetKey = "embedded-obj-1.png";
    const expectedWidths = DIAGRAM_VARIANT_WIDTHS.filter((w) => w < width);
    premise("the ladder earns at least one tier for this fixture", expectedWidths.length, 0);

    // Derived from the fixture, never hardcoded: a fixture edit cannot leave this passing by luck.
    expect(store.uploaded.map((u) => u.path)).toEqual([
      ...expectedWidths.map((w) => `${temp}${assetKey}@${w}.webp`),
      `${temp}${assetKey}`,
    ]);
    for (const upload of store.uploaded.filter((u) => u.path.includes("@"))) {
      expect(upload.contentType).toBe("image/webp");
    }

    const entry = result.pending.embeddedImages[0]!;
    expect(entry.variants).toEqual(
      expectedWidths.map((w) => ({ width: w, key: `${assetKey}@${w}.webp` })),
    );
    expect(entry.blurDataURL?.startsWith("data:image/webp;base64,")).toBe(true);
    expect(entry.intrinsicWidth).toBe(width);
    expect(entry.intrinsicHeight).toBe(900);
    expect(result.variantFailures).toEqual([]);

    // Cross-consistency: the manifest key is the LAST PATH SEGMENT of the object the
    // producer actually uploaded (spec §4), so producer and route fixtures cannot drift.
    const uploadedVariantNames = store.uploaded
      .map((u) => basename(u.path))
      .filter((name) => name.includes("@"));
    expect(entry.variants!.map((v) => v.key)).toEqual(uploadedVariantNames);
    for (const variant of entry.variants!) {
      expect(variant.key).not.toContain("/");
    }
  });

  test("an original below the ladder OMITS the variants field rather than writing null", async () => {
    const width = 200;
    premiseHolds(
      "fixture width is below the smallest tier, so the stage produces no variants",
      width < Math.min(...DIAGRAM_VARIANT_WIDTHS),
    );
    const bytes = await pngBytes(width, 150);
    const store = fakeStorage();

    const result = await snapshotAssets({
      showId,
      driveFileId,
      diagrams: diagrams({
        linkedFolderItems: [
          {
            driveFileId: "linked-1",
            mimeType: "image/png",
            drive_modified_time: "2026-05-01T00:00:00.000Z",
            headRevisionId: "rev-1",
            md5Checksum: createHash("md5").update(bytes).digest("hex"),
            snapshotPath: null,
          },
        ],
      }),
      tx: { insertPendingSnapshotUpload: async () => {} },
      storage: store.storage,
      drive: {
        fetchLinkedRevisionBytes: async () => bytes,
        fetchEmbeddedImageBytes: async () => null,
      },
      uuid: uuidPair(),
    });

    const entry = result.pending.linkedFolderItems[0]!;
    // OMISSION, never null — persisted optional types carry no `| null` arm (spec §4).
    expect("variants" in entry).toBe(false);
    expect(entry.blurDataURL).toBeDefined();
    expect(entry.intrinsicWidth).toBe(width);
    expect(store.uploaded.map((u) => u.path)).toEqual([`${temp}folder-linked-1.png`]);
  });

  test("a corrupt asset uploads its original, records no §4 fields, and signals the failure as data", async () => {
    const good = await pngBytes(800, 600);
    const corrupt = new TextEncoder().encode("definitively not an image");
    const store = fakeStorage();

    const result = await snapshotAssets({
      showId,
      driveFileId,
      diagrams: diagrams({
        embeddedImages: [
          {
            sheetTab: "Diagrams",
            objectId: "corrupt",
            mimeType: "image/png",
            sheetsRevisionId: "rev-sheet-1",
            embeddedFingerprint: sha256Base64Url(corrupt),
            recovery_disposition: "normal" as const,
            snapshotPath: null,
          },
          {
            sheetTab: "Diagrams",
            objectId: "healthy",
            mimeType: "image/png",
            sheetsRevisionId: "rev-sheet-1",
            embeddedFingerprint: sha256Base64Url(good),
            recovery_disposition: "normal" as const,
            snapshotPath: null,
          },
        ],
      }),
      tx: { insertPendingSnapshotUpload: async () => {} },
      storage: store.storage,
      drive: {
        fetchEmbeddedImageBytes: async (entry) => (entry.objectId === "corrupt" ? corrupt : good),
        fetchLinkedRevisionBytes: async () => null,
      },
      uuid: uuidPair(),
    });

    const [failed, healthy] = result.pending.embeddedImages;
    // The original still ships — the snapshot never degrades because of this stage.
    expect(failed!.snapshotPath).toBe(
      `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/embedded-corrupt.png`,
    );
    expect("variants" in failed!).toBe(false);
    expect("blurDataURL" in failed!).toBe(false);
    expect("intrinsicWidth" in failed!).toBe(false);
    expect("intrinsicHeight" in failed!).toBe(false);
    // Failure isolation: the sibling is untouched.
    premise(
      "the healthy sibling earns variants, so isolation is not vacuous",
      healthy!.variants?.length ?? 0,
      0,
    );
    expect(result.pending.snapshot_status).toBe("complete");
    expect(store.uploaded.some((u) => u.path === `${temp}embedded-corrupt.png`)).toBe(true);
    expect(store.uploaded.some((u) => u.path.startsWith(`${temp}embedded-corrupt.png@`))).toBe(
      false,
    );

    expect(result.variantFailures).toEqual([
      { assetKey: "embedded-corrupt.png", reason: "sharp_error", message: expect.any(String) },
    ]);
  });

  test("REGRESSION PIN — a manifest entry built before this feature still round-trips", async () => {
    // Added green, not a RED: isPersistedDiagrams duck-types on snapshot_revision_id
    // alone (lib/data/diagrams.ts), so old manifests parse with or without the fields.
    const legacy: PersistedDiagrams = {
      snapshot_revision_id: snapshotRevisionId,
      snapshot_status: "complete",
      linkedFolder: null,
      embeddedImages: [
        {
          sheetTab: "Diagrams",
          objectId: "obj-legacy",
          mimeType: "image/png",
          sheetsRevisionId: "rev-sheet-1",
          embeddedFingerprint: "fp",
          recovery_disposition: "normal",
          snapshotPath: `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/embedded-obj-legacy.png`,
        },
      ],
      linkedFolderItems: [],
    };

    const roundTripped = JSON.parse(JSON.stringify(legacy)) as PersistedDiagrams;
    expect(roundTripped).toEqual(legacy);
    expect("variants" in roundTripped.embeddedImages[0]!).toBe(false);
  });
});

describe("upload-throw best-effort cleanup (spec §3, BL-SNAPSHOT-UPLOAD-THROW-ORPHANS-OBJECTS)", () => {
  const okBytes = new TextEncoder().encode("embedded-bytes");

  function throwingRunArgs(storagePort: SnapshotAssetsStorage) {
    return {
      showId,
      driveFileId,
      diagrams: {
        linkedFolder: null,
        embeddedImages: [
          {
            sheetTab: "DIAGRAMS",
            objectId: "ok",
            mimeType: "image/png",
            sheetsRevisionId: "sheet-rev-1",
            embeddedFingerprint: sha256Base64Url(okBytes),
            recovery_disposition: "normal",
          },
          {
            sheetTab: "DIAGRAMS",
            objectId: "boom",
            mimeType: "image/png",
            sheetsRevisionId: "sheet-rev-1",
            embeddedFingerprint: "does-not-matter",
            recovery_disposition: "normal",
          },
        ],
        linkedFolderItems: [],
      } as unknown as SnapshotAssetsArgs["diagrams"],
      tx: { insertPendingSnapshotUpload: async () => undefined },
      storage: storagePort,
      drive: {
        fetchEmbeddedImageBytes: async (entry: { objectId: string }) => {
          if (entry.objectId === "boom") throw new Error("drive 500 mid-run");
          return okBytes;
        },
        fetchLinkedRevisionBytes: async () => null,
      },
    } satisfies SnapshotAssetsArgs;
  }

  test("a mid-run throw removes the run's _pending prefix and rethrows the ORIGINAL error", async () => {
    const objects = new Map<string, Uint8Array>();
    const uploaded: string[] = [];
    const removedPrefixes: string[] = [];
    const storagePort: SnapshotAssetsStorage = {
      async upload(path, bytes) {
        objects.set(path, bytes);
        uploaded.push(path);
      },
      async removePrefix(prefix) {
        removedPrefixes.push(prefix);
        for (const key of [...objects.keys()]) {
          if (key.startsWith(prefix)) objects.delete(key);
        }
      },
    };
    await expect(snapshotAssets(throwingRunArgs(storagePort))).rejects.toThrow("drive 500 mid-run");
    // Own-input premises: an object really was uploaded under _pending before the
    // throw, and the catch really attempted the removal -- without both, the
    // empty-survivors assertion below proves nothing.
    premise(
      "an object was uploaded under _pending before the throw",
      uploaded.filter((path) => path.includes("/_pending/")).length,
      0,
    );
    premise("the catch attempted the prefix removal", removedPrefixes.length, 0);
    const pendingSurvivors = [...objects.keys()].filter((key) => key.includes("/_pending/"));
    expect(pendingSurvivors).toEqual([]);
    expect(removedPrefixes).toHaveLength(1);
    expect(removedPrefixes[0]).toMatch(
      new RegExp(`^diagram-snapshots/shows/${showId}/_pending/[0-9a-f-]+/$`),
    );
  });

  test("a rejecting removePrefix never masks the original error", async () => {
    const storagePort: SnapshotAssetsStorage = {
      async upload() {},
      async removePrefix() {
        throw new Error("storage cleanup also failed");
      },
    };
    await expect(snapshotAssets(throwingRunArgs(storagePort))).rejects.toThrow("drive 500 mid-run");
  });

  test("a port WITHOUT removePrefix still rethrows cleanly (optional capability)", async () => {
    const storagePort: SnapshotAssetsStorage = { async upload() {} };
    await expect(snapshotAssets(throwingRunArgs(storagePort))).rejects.toThrow("drive 500 mid-run");
  });

  test("a REJECTING delete-marker neither masks the original error nor skips the prefix removal", async () => {
    // The two cleanups are independent. Before this was pinned, the marker ran
    // outside the wrapped block: a marker rejection replaced the caller's real
    // error AND jumped over removePrefix, so the orphan survived and the reason
    // it survived was hidden behind the wrong exception.
    const objects = new Map<string, Uint8Array>();
    const uploaded: string[] = [];
    const removedPrefixes: string[] = [];
    const storagePort: SnapshotAssetsStorage = {
      async upload(path, bytes) {
        objects.set(path, bytes);
        uploaded.push(path);
      },
      async removePrefix(prefix) {
        removedPrefixes.push(prefix);
        for (const key of [...objects.keys()]) {
          if (key.startsWith(prefix)) objects.delete(key);
        }
      },
    };
    let markerRejections = 0;
    const args = {
      ...throwingRunArgs(storagePort),
      tx: {
        insertPendingSnapshotUpload: async () => undefined,
        markPendingSnapshotDeleteStarted: async () => {
          markerRejections += 1;
          throw new Error("mark failed");
        },
      },
    } satisfies SnapshotAssetsArgs;

    await expect(snapshotAssets(args)).rejects.toThrow("drive 500 mid-run");
    premise(
      "an object was uploaded under _pending before the throw",
      uploaded.filter((path) => path.includes("/_pending/")).length,
      0,
    );
    // Without this the test would still pass against a build that never calls
    // the marker at all, which is a different contract from the one under test.
    premise("the marker was reached and rejected on this run", markerRejections, 0);
    expect(removedPrefixes).toHaveLength(1);
    expect([...objects.keys()].filter((key) => key.includes("/_pending/"))).toEqual([]);
  });
});
