import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import type { PersistedDiagrams } from "@/lib/parser/types";
import {
  ASSET_RECOVERY_ALERT_FAMILY,
  CONCURRENT_SYNC_SKIPPED,
  assetRecovery,
  runAssetRecoveryCron,
  type AssetRecoveryStorage,
  type AssetRecoveryTx,
} from "@/lib/sync/assetRecovery";
import { DIAGRAM_VARIANT_WIDTHS } from "@/lib/sync/diagramVariants";
import { resetLogSink, setLogSink } from "@/lib/log/logger";
import type { LogRecord } from "@/lib/log/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const showId = "11111111-1111-4111-8111-111111111111";
const driveFileId = "sheet-file-1";
const snapshotRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function md5Hex(value: string): string {
  return createHash("md5").update(new TextEncoder().encode(value)).digest("hex");
}

function partialDiagrams(): PersistedDiagrams {
  return {
    snapshot_revision_id: snapshotRevisionId,
    snapshot_status: "partial_failure",
    linkedFolder: null,
    embeddedImages: [
      {
        sheetTab: "DIAGRAMS",
        objectId: "embedded-1",
        mimeType: "image/png",
        sheetsRevisionId: "sheet-rev-1",
        embeddedFingerprint: sha256Base64Url(new TextEncoder().encode("embedded-bytes")),
        recovery_disposition: "normal",
        snapshotPath: null,
      },
    ],
    linkedFolderItems: [
      {
        driveFileId: "linked-1",
        mimeType: "image/jpeg",
        drive_modified_time: "2026-05-01T00:00:00.000Z",
        headRevisionId: "linked-rev-1",
        md5Checksum: md5Hex("linked-bytes"),
        snapshotPath: null,
      },
    ],
  };
}

function storage() {
  const uploads: Array<{ path: string; contentType: string }> = [];
  const removed: string[] = [];
  const storagePort: AssetRecoveryStorage = {
    async upload(path, _bytes, options) {
      uploads.push({ path, contentType: options.contentType });
    },
    async remove(path) {
      removed.push(path);
    },
  };
  return { storagePort, uploads, removed };
}

describe("assetRecovery", () => {
  test("retries missing embedded and linked entries, uploads to locked revision, and flips complete", async () => {
    const { storagePort, uploads } = storage();
    let persisted: unknown = null;
    const resolveCalls: Array<[string, readonly string[]]> = [];

    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      withShowLock: async (_driveFileId, fn) =>
        await fn({
          readLockedShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
          updateRecoveredDiagrams: async (_showId, diagrams) => {
            persisted = diagrams;
            return true;
          },
          upsertRecoveryCooldown: async () => undefined,
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async () => undefined,
          resolveAdminAlerts: async (id, codes) => void resolveCalls.push([id, codes]),
        }),
      storage: storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("embedded-bytes"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
      },
    });

    // These fixtures feed non-image bytes, so the variant stage legitimately fails
    // per asset and signals it as data — the recovery itself is unaffected, which is
    // the failure-isolation contract (spec §3). Real-image parity is pinned in the
    // "variant stage parity" block below.
    expect(result).toEqual({
      outcome: "recovered",
      snapshotRevisionId,
      variantFailures: [
        {
          assetKey: "embedded-embedded-1.png",
          reason: "sharp_error",
          message: expect.any(String),
        },
        { assetKey: "folder-linked-1.jpg", reason: "sharp_error", message: expect.any(String) },
      ],
    });
    // S3: the 'complete' branch resolves the full asset-recovery family inside the locked tx.
    expect(resolveCalls).toEqual([[showId, [...ASSET_RECOVERY_ALERT_FAMILY]]]);
    expect(uploads.map((upload) => upload.path)).toEqual([
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/embedded-embedded-1.png",
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/folder-linked-1.jpg",
    ]);
    expect(persisted).toMatchObject({
      snapshot_status: "complete",
      embeddedImages: [
        {
          snapshotPath:
            "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/embedded-embedded-1.png",
        },
      ],
      linkedFolderItems: [
        {
          snapshotPath:
            "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/folder-linked-1.jpg",
        },
      ],
    });
  });

  test("restage-only unresolved entries transition to partial_failure_restage_required and alert", async () => {
    const alerts: string[] = [];
    const diagrams = {
      ...partialDiagrams(),
      linkedFolderItems: [],
      embeddedImages: [
        {
          ...partialDiagrams().embeddedImages[0]!,
          embeddedFingerprint: null,
          recovery_disposition: "restage_required" as const,
        },
      ],
    };

    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams }),
      withShowLock: async (_driveFileId, fn) =>
        await fn({
          readLockedShow: async () => ({ showId, driveFileId, diagrams }),
          updateRecoveredDiagrams: async (_showId, next) => {
            expect(next.snapshot_status).toBe("partial_failure_restage_required");
            return true;
          },
          upsertRecoveryCooldown: async () => undefined,
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async (_showId, code) => void alerts.push(code),
          resolveAdminAlerts: async () => undefined,
        }),
      storage: storage().storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => {
          throw new Error("restage-only entries must not be fetched");
        },
        fetchLinkedRevisionBytes: async () => null,
      },
    });

    expect(result).toEqual({ outcome: "restage_required", snapshotRevisionId });
    expect(alerts).toEqual(["EMBEDDED_RECOVERY_REQUIRES_RESTAGE"]);
  });

  test("revision drift detected under lock writes cooldown before any canonical upload", async () => {
    const { storagePort, uploads } = storage();
    const cooldowns: unknown[] = [];
    const alerts: unknown[] = [];
    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      withShowLock: async (_driveFileId, fn) =>
        await fn({
          readLockedShow: async () => ({
            showId,
            driveFileId,
            diagrams: { ...partialDiagrams(), snapshot_revision_id: "newer-rev" },
          }),
          updateRecoveredDiagrams: async () => {
            throw new Error("drifted recovery must not update diagrams");
          },
          upsertRecoveryCooldown: async (...args) => void cooldowns.push(args),
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async (...args) => void alerts.push(args),
          resolveAdminAlerts: async () => undefined,
        }),
      storage: storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("embedded-bytes"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
      },
    });

    expect(result).toEqual({
      outcome: "revision_drift",
      code: "ASSET_RECOVERY_REVISION_DRIFT",
      previewRevisionId: snapshotRevisionId,
    });
    expect(uploads).toEqual([]);
    expect(cooldowns).toEqual([[showId, snapshotRevisionId]]);
    expect(alerts).toEqual([
      [
        showId,
        "ASSET_RECOVERY_REVISION_DRIFT",
        {
          currentSnapshotRevisionId: "newer-rev",
          snapshotRevisionId,
        },
      ],
    ]);
  });

  test("revision drift after canonical upload removes uploaded recovery bytes", async () => {
    const { storagePort, uploads, removed } = storage();
    let lockCount = 0;

    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      withShowLock: async (_driveFileId, fn) => {
        lockCount += 1;
        return await fn({
          readLockedShow: async () => ({
            showId,
            driveFileId,
            diagrams:
              lockCount === 1
                ? partialDiagrams()
                : { ...partialDiagrams(), snapshot_revision_id: "newer-rev" },
          }),
          updateRecoveredDiagrams: async () => {
            throw new Error("drifted recovery must not update diagrams");
          },
          upsertRecoveryCooldown: async () => undefined,
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async () => undefined,
          resolveAdminAlerts: async () => undefined,
        });
      },
      storage: storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("embedded-bytes"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
      },
    });

    expect(result).toEqual({
      outcome: "revision_drift",
      code: "ASSET_RECOVERY_REVISION_DRIFT",
      previewRevisionId: snapshotRevisionId,
    });
    expect(removed).toEqual(uploads.map((upload) => upload.path));
  });

  test("busy show lock returns concurrent sync skipped", async () => {
    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      withShowLock: async () => ({ skipped: CONCURRENT_SYNC_SKIPPED }),
      storage: storage().storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("embedded-bytes"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
      },
    });

    expect(result).toEqual({ outcome: "skipped", code: CONCURRENT_SYNC_SKIPPED });
  });

  test("active drift cooldown returns before Drive fetches or lock acquisition", async () => {
    const alerts: unknown[] = [];
    const result = await assetRecovery(showId, {
      now: () => new Date("2026-05-10T00:01:00.000Z"),
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      readRecoveryCooldown: async () => ({
        lastDriftAt: "2026-05-10T00:00:30.000Z",
        retryCount: 2,
      }),
      upsertAdminAlert: async (...args) => void alerts.push(args),
      withShowLock: async () => {
        throw new Error("cooldown gate must not acquire the show lock");
      },
      storage: storage().storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => {
          throw new Error("cooldown gate must not fetch Drive bytes");
        },
        fetchLinkedRevisionBytes: async () => null,
      },
    });

    expect(result).toEqual({
      outcome: "drift_cooldown",
      code: "ASSET_RECOVERY_DRIFT_COOLDOWN",
    });
    expect(alerts).toEqual([[showId, "ASSET_RECOVERY_DRIFT_COOLDOWN", { snapshotRevisionId }]]);
  });

  test("entry-count byte ceiling aborts before Drive fetches or lock acquisition and alerts", async () => {
    const alerts: string[] = [];
    const diagrams: PersistedDiagrams = {
      ...partialDiagrams(),
      embeddedImages: Array.from({ length: 61 }, (_, index) => ({
        ...partialDiagrams().embeddedImages[0]!,
        objectId: `embedded-${index}`,
      })),
      linkedFolderItems: [],
    };

    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams }),
      withShowLock: async () => {
        throw new Error("byte-ceiling abort must not acquire the show lock");
      },
      upsertAdminAlert: async (_showId, code) => void alerts.push(code),
      storage: storage().storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => {
          throw new Error("byte-ceiling abort must not fetch bytes");
        },
        fetchLinkedRevisionBytes: async () => null,
      },
    });

    expect(result).toEqual({ outcome: "bytes_exceeded", code: "ASSET_RECOVERY_BYTES_EXCEEDED" });
    expect(alerts).toEqual(["ASSET_RECOVERY_BYTES_EXCEEDED"]);
  });

  test("clearing the cooldown gate resolves the cooldown alert even when the run then fails bytes_exceeded", async () => {
    const cooldownResolves: string[] = [];
    // 61 unresolved embedded entries → the entry-count ceiling trips bytes_exceeded AFTER the
    // cooldown gate has already concluded inactive/absent.
    const diagrams: PersistedDiagrams = {
      ...partialDiagrams(),
      embeddedImages: Array.from({ length: 61 }, (_, index) => ({
        ...partialDiagrams().embeddedImages[0]!,
        objectId: `embedded-${index}`,
      })),
      linkedFolderItems: [],
    };

    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams }),
      readRecoveryCooldown: async () => null, // no active cooldown → gate passes
      resolveDriftCooldownAlert: async (id) => void cooldownResolves.push(id),
      upsertAdminAlert: async () => undefined,
      withShowLock: async () => {
        throw new Error("byte-ceiling abort must not acquire the show lock");
      },
      storage: storage().storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => {
          throw new Error("byte-ceiling abort must not fetch bytes");
        },
        fetchLinkedRevisionBytes: async () => null,
      },
    });

    expect(result).toEqual({ outcome: "bytes_exceeded", code: "ASSET_RECOVERY_BYTES_EXCEEDED" });
    expect(cooldownResolves).toEqual([showId]);
  });

  test("a run that lands partial_failure does NOT resolve the asset-recovery family", async () => {
    const resolveCalls: Array<[string, readonly string[]]> = [];
    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      withShowLock: async (_driveFileId, fn) =>
        await fn({
          readLockedShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
          updateRecoveredDiagrams: async () => true,
          upsertRecoveryCooldown: async () => undefined,
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async () => undefined,
          resolveAdminAlerts: async (id, codes) => void resolveCalls.push([id, codes]),
        }),
      storage: storage().storagePort,
      drive: {
        // Embedded bytes mismatch the fingerprint → entry stays unresolved (recovery_disposition
        // "normal") while the linked entry recovers → final snapshot_status "partial_failure".
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("wrong-bytes"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
      },
    });

    // Same non-image fixture bytes as above: the stage signals, the outcome does not change.
    expect(result).toEqual({
      outcome: "partial_failure",
      snapshotRevisionId,
      variantFailures: [
        { assetKey: "folder-linked-1.jpg", reason: "sharp_error", message: expect.any(String) },
      ],
    });
    expect(resolveCalls).toEqual([]);
  });

  test("cron enumerates recoverable shows and invokes recovery for each show", async () => {
    const recovered: string[] = [];

    const result = await runAssetRecoveryCron({
      listRecoverableShows: async () => ["show-a", "show-b"],
      recover: async (id) => {
        recovered.push(id);
        return { outcome: "no_op" };
      },
    });

    expect(recovered).toEqual(["show-a", "show-b"]);
    expect(result.processed).toEqual([
      { showId: "show-a", result: { outcome: "no_op" } },
      { showId: "show-b", result: { outcome: "no_op" } },
    ]);
  });

  test("cron records one show failure and continues to later recoveries", async () => {
    const recovered: string[] = [];

    const result = await runAssetRecoveryCron({
      listRecoverableShows: async () => ["show-a", "show-b"],
      recover: async (id) => {
        recovered.push(id);
        if (id === "show-a") throw new Error("recovery failed");
        return { outcome: "no_op" };
      },
    });

    expect(recovered).toEqual(["show-a", "show-b"]);
    expect(result.processed).toEqual([
      { showId: "show-a", result: { outcome: "infra_error", code: "SYNC_INFRA_ERROR" } },
      { showId: "show-b", result: { outcome: "no_op" } },
    ]);
  });

  describe("proof-gated cleanup (spec §2, BL-RECOVERY-CLEANUP-DELETES-LIVE-BYTES)", () => {
    const driftedRev = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    // Map-backed storage: assertions run against surviving OBJECT STATE, not the
    // remove call log (spec §6 anti-tautology -- a call-count test can pass with
    // the wrong paths removed).
    function liveStorage() {
      const objects = new Map<string, true>();
      const uploads: string[] = [];
      const storagePort: AssetRecoveryStorage = {
        async upload(path) {
          objects.set(path, true);
          uploads.push(path);
        },
        async remove(path) {
          objects.delete(path);
        },
      };
      return { storagePort, objects, uploads };
    }

    type LockedTxOverrides = {
      readLockedShow?: () => Promise<{
        showId: string;
        driveFileId: string;
        diagrams: PersistedDiagrams;
      } | null>;
      updateRecoveredDiagrams?: () => Promise<boolean>;
    };

    // Both lock passes (pre-upload gate, commit) share this builder; the second
    // pass swaps in `secondPass` so tests can model a winner committing between
    // the loser's gate and its commit attempt -- the probe P1 interleaving.
    function depsWithSecondPass(
      storagePort: AssetRecoveryStorage,
      secondPass: LockedTxOverrides | "contended",
    ) {
      let lockCalls = 0;
      return {
        readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
        withShowLock: async <R>(_driveFileId: string, fn: (tx: AssetRecoveryTx) => Promise<R>) => {
          lockCalls += 1;
          if (lockCalls > 1 && secondPass === "contended") {
            return { skipped: CONCURRENT_SYNC_SKIPPED } as const;
          }
          const overrides = lockCalls > 1 && secondPass !== "contended" ? secondPass : {};
          return await fn({
            readLockedShow:
              overrides.readLockedShow ??
              (async () => ({ showId, driveFileId, diagrams: partialDiagrams() })),
            updateRecoveredDiagrams: overrides.updateRecoveredDiagrams ?? (async () => true),
            upsertRecoveryCooldown: async () => undefined,
            deleteRecoveryCooldown: async () => undefined,
            upsertAdminAlert: async () => undefined,
            resolveAdminAlerts: async () => undefined,
          });
        },
        storage: storagePort,
        drive: {
          fetchEmbeddedImageBytes: async () => new TextEncoder().encode("embedded-bytes"),
          fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
        },
      };
    }

    test("skipped at the commit lock keeps every uploaded object (no proof, no deletion)", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      const result = await assetRecovery(showId, depsWithSecondPass(storagePort, "contended"));
      premise("the loser uploaded before its contended commit attempt", uploads.length, 0);
      expect(result).toEqual({ outcome: "skipped", code: CONCURRENT_SYNC_SKIPPED });
      expect([...objects.keys()].sort()).toEqual([...uploads].sort());
    });

    test("no_op with the SAME locked revision (winner committed it) keeps the winner's MANIFEST-referenced objects", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      // The winner's committed manifest carries REAL snapshotPath values at the
      // deterministic canonical paths -- the assertion below runs against THESE,
      // not against the loser's upload list, so an empty winner manifest cannot
      // vacuously pass (spec §6, probe P1's manifestTargetExists).
      const base = partialDiagrams();
      const winnerCommitted: PersistedDiagrams = {
        ...base,
        snapshot_status: "complete",
        embeddedImages: base.embeddedImages.map((entry) => ({
          ...entry,
          snapshotPath: `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/embedded-${entry.objectId}.png`,
        })),
        linkedFolderItems: base.linkedFolderItems.map((entry) => ({
          ...entry,
          snapshotPath: `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/folder-${entry.driveFileId}.jpg`,
        })),
      };
      const manifestPaths = [
        ...winnerCommitted.embeddedImages,
        ...winnerCommitted.linkedFolderItems,
      ]
        .map((entry) => entry.snapshotPath)
        .filter((path): path is string => Boolean(path));
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, {
          readLockedShow: async () => ({ showId, driveFileId, diagrams: winnerCommitted }),
        }),
      );
      premise("the winner's manifest references concrete canonical paths", manifestPaths.length, 0);
      premiseHolds(
        "the deterministic canonical paths tie the manifest to the loser's uploads",
        manifestPaths.every((path) => uploads.includes(path)),
      );
      expect(result).toEqual({ outcome: "no_op", lockedSnapshotRevisionId: snapshotRevisionId });
      for (const path of manifestPaths) {
        expect(objects.has(path)).toBe(true);
      }
      // And nothing else was deleted either.
      expect([...objects.keys()].sort()).toEqual([...uploads].sort());
    });

    test("no_op with a NULL locked show keeps uploads (no revision proof)", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, { readLockedShow: async () => null }),
      );
      premise("uploads happened before the locked show vanished", uploads.length, 0);
      expect(result).toEqual({ outcome: "no_op" });
      expect([...objects.keys()].sort()).toEqual([...uploads].sort());
    });

    test("no_op with a DIFFERENT locked revision deletes the run's own uploads (proof held)", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, {
          readLockedShow: async () => ({
            showId,
            driveFileId,
            diagrams: {
              ...partialDiagrams(),
              snapshot_revision_id: driftedRev,
              snapshot_status: "complete",
            },
          }),
        }),
      );
      premise("uploads happened under the superseded revision", uploads.length, 0);
      expect(result).toEqual({ outcome: "no_op", lockedSnapshotRevisionId: driftedRev });
      expect(objects.size).toBe(0);
    });

    test("commit-branch revision drift still deletes the run's own uploads (proof held)", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, {
          readLockedShow: async () => ({
            showId,
            driveFileId,
            diagrams: { ...partialDiagrams(), snapshot_revision_id: driftedRev },
          }),
        }),
      );
      premise("uploads happened under the superseded revision", uploads.length, 0);
      expect(result).toMatchObject({ outcome: "revision_drift" });
      expect(objects.size).toBe(0);
    });

    test("CAS-false drift deletes the run's own uploads (spec §2.1 form (b); unreachable via concurrent commits per §2.3, injected via the port seam)", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, { updateRecoveredDiagrams: async () => false }),
      );
      premise("uploads happened before the CAS refused the commit", uploads.length, 0);
      expect(result).toMatchObject({ outcome: "revision_drift" });
      expect(objects.size).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Variant parity on the recovery path (spec §3 wiring site 2, AC-7).
//
// Recovery is the second place original bytes enter storage. If it skipped the
// variant stage, a recovered diagram would render from its original at every
// tier forever — the exact silent degradation the census guard exists to stop.
// ---------------------------------------------------------------------------

describe("assetRecovery — variant stage parity", () => {
  const canonical = `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/`;

  async function realPng(width: number, height: number): Promise<Uint8Array> {
    const buffer = await sharp({
      create: { width, height, channels: 3, background: { r: 90, g: 30, b: 140 } },
    })
      .png()
      .toBuffer();
    return new Uint8Array(buffer);
  }

  function diagramsForBytes(embedded: Uint8Array): PersistedDiagrams {
    return {
      snapshot_revision_id: snapshotRevisionId,
      snapshot_status: "partial_failure",
      linkedFolder: null,
      embeddedImages: [
        {
          sheetTab: "DIAGRAMS",
          objectId: "embedded-1",
          mimeType: "image/png",
          sheetsRevisionId: "sheet-rev-1",
          embeddedFingerprint: sha256Base64Url(embedded),
          recovery_disposition: "normal",
          snapshotPath: null,
        },
      ],
      linkedFolderItems: [],
    };
  }

  async function runRecovery(bytes: Uint8Array) {
    const { storagePort, uploads } = storage();
    let persisted: PersistedDiagrams | null = null;
    const diagrams = diagramsForBytes(bytes);
    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams }),
      withShowLock: async (_driveFileId, fn) =>
        await fn({
          readLockedShow: async () => ({ showId, driveFileId, diagrams }),
          updateRecoveredDiagrams: async (_showId, next) => {
            persisted = next;
            return true;
          },
          upsertRecoveryCooldown: async () => undefined,
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async () => undefined,
          resolveAdminAlerts: async () => undefined,
        }),
      storage: storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => bytes,
        fetchLinkedRevisionBytes: async () => null,
      },
    });
    return { result, uploads, persisted: persisted as PersistedDiagrams | null };
  }

  test("a recovered original uploads its variants beside it and records the §4 fields", async () => {
    const width = 1200;
    premise(
      "fixture width exceeds the smallest ladder tier",
      width,
      Math.min(...DIAGRAM_VARIANT_WIDTHS),
    );
    const bytes = await realPng(width, 800);

    const { result, uploads, persisted } = await runRecovery(bytes);

    expect(result.outcome).toBe("recovered");
    const assetKey = "embedded-embedded-1.png";
    const expectedWidths = DIAGRAM_VARIANT_WIDTHS.filter((w) => w < width);
    premise("the ladder earns tiers for this fixture", expectedWidths.length, 0);
    // Variants land in the SAME canonical directory as the original, so the route's
    // dirname(snapshotPath) + "/" + key reconstruction resolves them (spec §5).
    expect(uploads.map((upload) => upload.path)).toEqual([
      ...expectedWidths.map((w) => `${canonical}${assetKey}@${w}.webp`),
      `${canonical}${assetKey}`,
    ]);

    const entry = persisted!.embeddedImages[0]!;
    expect(entry.variants).toEqual(
      expectedWidths.map((w) => ({ width: w, key: `${assetKey}@${w}.webp` })),
    );
    expect(entry.blurDataURL?.startsWith("data:image/webp;base64,")).toBe(true);
    expect(entry.intrinsicWidth).toBe(width);
    expect(entry.intrinsicHeight).toBe(800);
  });

  test("a corrupt recovered asset still recovers, records no §4 fields, and signals as data", async () => {
    const corrupt = new TextEncoder().encode("not an image at all");

    const { result, uploads, persisted } = await runRecovery(corrupt);

    // The original still recovers — the variant stage never degrades the snapshot.
    expect(result.outcome).toBe("recovered");
    expect(uploads.map((upload) => upload.path)).toEqual([`${canonical}embedded-embedded-1.png`]);
    const entry = persisted!.embeddedImages[0]!;
    expect("variants" in entry).toBe(false);
    expect("blurDataURL" in entry).toBe(false);
    // Narrowed via the whole result: `variantFailures` lives only on the three
    // snapshot-writing arms, so a bare member access does not typecheck.
    expect(result).toMatchObject({
      outcome: "recovered",
      variantFailures: [
        {
          assetKey: "embedded-embedded-1.png",
          reason: "sharp_error",
          message: expect.any(String),
        },
      ],
    });
  });

  test("the recovery cron sink emits DIAGRAM_VARIANT_GENERATION_FAILED once per row, post-commit", async () => {
    const rows = [
      { assetKey: "embedded-a.png", reason: "sharp_error" as const, message: "sharp threw" },
      { assetKey: "folder-b.png", reason: "blur_oversize" as const, message: "blur too big" },
    ];
    const records: LogRecord[] = [];
    setLogSink((record) => {
      records.push(record);
    });
    try {
      await runAssetRecoveryCron({
        listRecoverableShows: async () => [showId],
        recover: async () => ({
          outcome: "recovered" as const,
          snapshotRevisionId,
          variantFailures: rows,
        }),
      });
    } finally {
      resetLogSink();
    }

    premise("the fixture carries rows to emit", rows.length, 0);
    expect(
      records
        .filter((record) => record.code === "DIAGRAM_VARIANT_GENERATION_FAILED")
        .map((record) => ({
          level: record.level,
          showId: record.showId,
          assetKey: (record.context as { assetKey?: unknown }).assetKey,
          reason: (record.context as { reason?: unknown }).reason,
          error: (record.context as { error?: unknown }).error,
        })),
    ).toEqual(
      rows.map((row) => ({
        level: "warn",
        showId,
        assetKey: row.assetKey,
        reason: row.reason,
        error: row.message,
      })),
    );
  });
});
