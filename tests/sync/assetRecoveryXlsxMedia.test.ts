import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import type { PersistedDiagrams } from "@/lib/parser/types";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import { extractEmbeddedObjects } from "@/lib/drive/embeddedObjects";
import {
  assetRecovery,
  fetchEmbeddedImageBytesTimed,
  type AssetRecoveryStorage,
} from "@/lib/sync/assetRecovery";

const sampleXlsx = (): ArrayBuffer => {
  const b = readFileSync(new URL("../fixtures/diagrams/embedded-sample.xlsx", import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

const ex = extractEmbeddedObjects(sampleXlsx());
const diagObjs = ex.objectsByTab.get("DIAGRAMS")!;
const infoObj = ex.objectsByTab.get("INFO")![0]!;
const fp = (objectId: string) => sha256Base64Url(ex.bytesByObjectId.get(objectId)!);

type PersistedEmbedded = PersistedDiagrams["embeddedImages"][number];
function stub(over: Partial<PersistedEmbedded>): PersistedEmbedded {
  return {
    sheetTab: "DIAGRAMS",
    objectId: "x-obj",
    mimeType: "image/png",
    contentUrl: null,
    sheetsRevisionId: "rev-9",
    embeddedFingerprint: null,
    recovery_disposition: "normal",
    snapshotPath: null,
    ...over,
  };
}

describe("fetchEmbeddedImageBytesTimed — XLSX-media branch (recovery port)", () => {
  test("resolves DIAGRAMS-tab bytes matching the fingerprint", async () => {
    const target = diagObjs[0]!;
    const bytes = await fetchEmbeddedImageBytesTimed(
      stub({
        objectId: target.objectId,
        mediaPartName: target.mediaPartName,
        embeddedFingerprint: fp(target.objectId),
      }),
      {},
      { fetchXlsxBytes: async () => sampleXlsx() },
    );
    expect(bytes && sha256Base64Url(bytes as Uint8Array)).toBe(fp(target.objectId));
  });

  test("returns null for a fingerprint whose bytes live only on a non-DIAGRAMS tab", async () => {
    const bytes = await fetchEmbeddedImageBytesTimed(
      stub({
        objectId: infoObj.objectId,
        mediaPartName: infoObj.mediaPartName,
        embeddedFingerprint: fp(infoObj.objectId),
      }),
      {},
      { fetchXlsxBytes: async () => sampleXlsx() },
    );
    expect(bytes).toBeNull();
  });

  test("returns null (fail-soft) when the re-export throws", async () => {
    const target = diagObjs[0]!;
    const bytes = await fetchEmbeddedImageBytesTimed(
      stub({ mediaPartName: target.mediaPartName, embeddedFingerprint: fp(target.objectId) }),
      {},
      {
        fetchXlsxBytes: async () => {
          throw new Error("drive down");
        },
      },
    );
    expect(bytes).toBeNull();
  });

  test("returns null when there is no fetchXlsxBytes (no driveFileId) or no mediaPartName", async () => {
    const target = diagObjs[0]!;
    expect(
      await fetchEmbeddedImageBytesTimed(
        stub({ mediaPartName: target.mediaPartName, embeddedFingerprint: fp(target.objectId) }),
        {},
        {}, // no fetchXlsxBytes → the defaultRecover no-driveFileId case
      ),
    ).toBeNull();
    expect(
      await fetchEmbeddedImageBytesTimed(
        stub({ embeddedFingerprint: fp(target.objectId) }), // no mediaPartName
        {},
        { fetchXlsxBytes: async () => sampleXlsx() },
      ),
    ).toBeNull();
  });
});

describe("assetRecovery — driveFileId threading", () => {
  const showId = "11111111-1111-4111-8111-111111111111";
  const driveFileId = "sheet-file-1";
  const snapshotRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  function partialDiagrams(): PersistedDiagrams {
    return {
      snapshot_revision_id: snapshotRevisionId,
      snapshot_status: "partial_failure",
      linkedFolder: null,
      embeddedImages: [
        stub({
          objectId: "embedded-1",
          embeddedFingerprint: sha256Base64Url(new TextEncoder().encode("x")),
        }),
      ],
      linkedFolderItems: [],
    };
  }
  const storagePort: AssetRecoveryStorage = { async upload() {}, async remove() {} };

  test("forwards previewShow.driveFileId into the embedded byte port options", async () => {
    const seen: Array<{ driveFileId?: string } | undefined> = [];
    await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      withShowLock: async (_d, fn) =>
        await fn({
          readLockedShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
          updateRecoveredDiagrams: async () => true,
          upsertRecoveryCooldown: async () => undefined,
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async () => undefined,
        }),
      storage: storagePort,
      drive: {
        fetchEmbeddedImageBytes: async (_entry, options) => {
          seen.push(options as { driveFileId?: string });
          return null;
        },
        fetchLinkedRevisionBytes: async () => null,
      },
    });
    expect(seen[0]).toMatchObject({ driveFileId });
  });
});
