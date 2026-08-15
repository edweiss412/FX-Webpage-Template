// Probe: storage-asset-integrity spec draft inputs (2026-08-15).
//
// Runs the REAL assetRecovery / snapshotAssets / runDiagramGc bodies against
// in-memory ports to demonstrate, as executable fact rather than prose:
//
//   P1  BL-RECOVERY-CLEANUP-DELETES-LIVE-BYTES — a losing concurrent recovery's
//       no_op cleanup removes the exact canonical paths the winner's committed
//       manifest references (manifestTargetExists flips to false).
//   P2  BL-SNAPSHOT-UPLOAD-THROW-ORPHANS-OBJECTS — a snapshotAssets upload throw
//       leaves _pending/<runUuid>/ objects that a subsequent runDiagramGc pass
//       cannot reclaim (ledger row rolled back; object sweep skips `_pending`).
//
// Run: pnpm tsx docs/superpowers/specs/probes/2026-08-15-storage-asset-integrity-probe.ts
// Exit 0 always; findings print as PROBE lines. This is a measurement, not a test.

import {
  assetRecovery,
  type AssetRecoveryDeps,
  type AssetRecoveryShow,
  type AssetRecoveryTx,
} from "../../../../lib/sync/assetRecovery";
import { snapshotAssets, type SnapshotAssetsTx } from "../../../../lib/sync/snapshotAssets";
import { runDiagramGc, type DiagramGcTx } from "../../../../lib/sync/diagramGc";
import type { PersistedDiagrams } from "../../../../lib/parser/types";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const DRIVE_FILE_ID = "drive-file-1";
const REV = "22222222-2222-4222-8222-222222222222";

// A 1x1 PNG so sharp's variant stage runs for real (no variants emitted — width 1
// is below every ladder rung — but the code path is the shipped one).
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function diagrams(status: PersistedDiagrams["snapshot_status"]): PersistedDiagrams {
  return {
    revision_id: REV,
    snapshot_revision_id: REV,
    snapshot_status: status,
    linkedFolder: null,
    embeddedImages: [
      {
        objectId: "obj1",
        mimeType: "image/png",
        contentUrl: "https://example.invalid/obj1",
        embeddedFingerprint: sha256b64url(PNG_1X1),
        snapshotPath: null,
      },
    ],
    linkedFolderItems: [],
  } as unknown as PersistedDiagrams;
}

import { createHash } from "node:crypto";
function sha256b64url(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("base64url");
}

async function probe1(): Promise<void> {
  // Shared "DB" row + storage. B reads its preview while the row is still
  // partial_failure; the winner (A) is modeled by flipping the row to the
  // committed 'complete' manifest between B's pre-upload gate and B's commit
  // attempt — the exact interleaving from the PR #761 review filing. Paths are
  // deterministic (assetPath is pure), so A's committed manifest references the
  // byte-identical canonical paths B uploaded.
  const storage = new Map<string, Uint8Array>();
  let row: { status: PersistedDiagrams["snapshot_status"]; manifest: PersistedDiagrams } = {
    status: "partial_failure",
    manifest: diagrams("partial_failure"),
  };
  let lockCalls = 0;
  let committedManifestPaths: string[] = [];

  const show: AssetRecoveryShow = {
    showId: SHOW_ID,
    driveFileId: DRIVE_FILE_ID,
    diagrams: row.manifest,
  };

  const tx: AssetRecoveryTx = {
    async readLockedShow() {
      return { showId: SHOW_ID, driveFileId: DRIVE_FILE_ID, diagrams: row.manifest };
    },
    async updateRecoveredDiagrams() {
      return false; // B never gets here in this interleaving
    },
    async upsertRecoveryCooldown() {},
    async deleteRecoveryCooldown() {},
    async upsertAdminAlert() {},
    async resolveAdminAlerts() {},
  };

  const deps: AssetRecoveryDeps = {
    async readPreviewShow() {
      return show;
    },
    async withShowLock(_driveFileId, fn) {
      lockCalls += 1;
      if (lockCalls === 2) {
        // Winner A commits between B's gate and B's commit: status complete,
        // manifest pointing at the canonical paths (deterministic, same as B's).
        const committed = {
          ...row.manifest,
          snapshot_status: "complete" as const,
          embeddedImages: row.manifest.embeddedImages.map((entry) => ({
            ...entry,
            snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/embedded-${entry.objectId}.png`,
          })),
        };
        row = { status: "complete", manifest: committed };
        committedManifestPaths = committed.embeddedImages
          .map((entry) => entry.snapshotPath)
          .filter((path): path is string => Boolean(path));
      }
      return fn(tx);
    },
    storage: {
      async upload(path, bytes) {
        storage.set(path, bytes);
      },
      async remove(path) {
        storage.delete(path);
      },
    },
    drive: {
      async fetchEmbeddedImageBytes() {
        return new Uint8Array(PNG_1X1);
      },
      async fetchLinkedRevisionBytes() {
        return null;
      },
    },
  };

  const result = await assetRecovery(SHOW_ID, deps);
  const manifestTargetExists = committedManifestPaths.every((path) => storage.has(path));
  console.log("PROBE P1 loser outcome:", result.outcome);
  console.log("PROBE P1 winner committed manifest paths:", committedManifestPaths);
  console.log("PROBE P1 storage keys after loser cleanup:", [...storage.keys()]);
  console.log("PROBE P1 manifestTargetExists:", manifestTargetExists);
}

async function probe2(): Promise<void> {
  // snapshotAssets: asset 1 uploads fine, asset 2's drive fetch throws.
  // The tx port records calls the way the real per-file tx would — and the real
  // enclosing advisory-lock tx ABORTS on this throw, so every recorded call is
  // rolled back. GC then runs against the post-rollback DB (no pending row).
  const storage = new Map<string, Uint8Array>();
  const txCalls: string[] = [];
  const tx: SnapshotAssetsTx = {
    async insertPendingSnapshotUpload() {
      txCalls.push("insertPendingSnapshotUpload");
    },
    async markPendingSnapshotDeleteStarted() {
      txCalls.push("markPendingSnapshotDeleteStarted");
    },
  };

  let thrown: unknown = null;
  try {
    await snapshotAssets({
      showId: SHOW_ID,
      driveFileId: DRIVE_FILE_ID,
      diagrams: {
        linkedFolder: null,
        embeddedImages: [
          {
            objectId: "ok",
            mimeType: "image/png",
            contentUrl: "https://example.invalid/ok",
            embeddedFingerprint: sha256b64url(PNG_1X1),
            recovery_disposition: null,
          },
          {
            objectId: "boom",
            mimeType: "image/png",
            contentUrl: "https://example.invalid/boom",
            embeddedFingerprint: "x",
            recovery_disposition: null,
          },
        ],
        linkedFolderItems: [],
      } as never,
      tx,
      storage: {
        async upload(path, bytes) {
          storage.set(path, bytes);
        },
      },
      drive: {
        async fetchEmbeddedImageBytes(entry) {
          if ((entry as { objectId: string }).objectId === "boom") {
            throw new Error("drive 500 mid-run");
          }
          return new Uint8Array(PNG_1X1);
        },
        async fetchLinkedRevisionBytes() {
          return null;
        },
      },
    });
  } catch (error) {
    thrown = error;
  }

  const pendingObjects = [...storage.keys()].filter((key) => key.includes("/_pending/"));
  console.log("PROBE P2 threw:", thrown instanceof Error ? thrown.message : String(thrown));
  console.log("PROBE P2 tx calls (ALL rolled back with the aborting apply tx):", txCalls);
  console.log("PROBE P2 orphaned _pending objects:", pendingObjects);

  // GC pass against the post-rollback world: shows row healthy, ZERO pending
  // ledger rows (the insert rolled back). Storage still holds the orphans.
  const gcRemoved: string[] = [];
  const gcTx: DiagramGcTx = {
    async listShows() {
      return [
        {
          showId: SHOW_ID,
          archived: false,
          currentRevisionId: REV,
          snapshotStatus: "complete",
          retainedRevisionIds: [],
          inFlightRevisionIds: [],
          cutoffDays: 0, // even a ZERO-day cutoff cannot reach them
        },
      ];
    },
    async claimPendingRows() {
      return []; // the ledger row rolled back with the apply tx
    },
    async deletePendingRow() {},
    async deletePromotedRows() {
      return 0;
    },
  };
  const gcResult = await runDiagramGc({
    tx: gcTx,
    storage: {
      async list(prefix) {
        return [...storage.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((path) => ({ path, createdAt: "2020-01-01T00:00:00Z" }));
      },
      async remove(path) {
        gcRemoved.push(path);
        storage.delete(path);
      },
      async removePrefix(prefix) {
        for (const key of [...storage.keys()]) {
          if (key.startsWith(prefix)) {
            gcRemoved.push(key);
            storage.delete(key);
          }
        }
      },
    },
    promoteSnapshotUpload: async () => ({}),
  });
  const survivors = [...storage.keys()].filter((key) => key.includes("/_pending/"));
  console.log("PROBE P2 gc result:", gcResult);
  console.log("PROBE P2 gc removed:", gcRemoved);
  console.log("PROBE P2 _pending objects SURVIVING gc:", survivors);
}

void (async () => {
  await probe1();
  await probe2();
})();
