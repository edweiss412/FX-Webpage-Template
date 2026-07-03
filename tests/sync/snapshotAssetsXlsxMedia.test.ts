import { describe, expect, test, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import type { EmbeddedImageStub } from "@/lib/parser/types";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import { extractEmbeddedObjects } from "@/lib/drive/embeddedObjects";

const sampleXlsx = (): ArrayBuffer => {
  const b = readFileSync(new URL("../fixtures/diagrams/embedded-sample.xlsx", import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

// Hoisted so the (hoisted) vi.mock factories below can reference them.
const { fetchCurrentSheetXlsxBytes, uploads } = vi.hoisted(() => ({
  fetchCurrentSheetXlsxBytes: vi.fn(),
  uploads: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { error: null };
        },
      }),
    },
  }),
}));
vi.mock("@/lib/drive/client", () => ({ getDriveClient: () => ({}), getDriveAccessToken: async () => "t" }));
vi.mock("@/lib/drive/fetch", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchCurrentSheetXlsxBytes,
}));

const ex = extractEmbeddedObjects(sampleXlsx());
const diagObjs = ex.objectsByTab.get("DIAGRAMS")!;
const infoObj = ex.objectsByTab.get("INFO")![0]!;
const fp = (objectId: string) => sha256Base64Url(ex.bytesByObjectId.get(objectId)!);

function stub(over: Partial<EmbeddedImageStub>): EmbeddedImageStub {
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

describe("snapshotFetchEmbeddedImageBytesTimed — XLSX-media branch (port level)", () => {
  test("returns DIAGRAMS-tab bytes matching the fingerprint", async () => {
    const { snapshotFetchEmbeddedImageBytesTimed } = await import("@/lib/sync/defaultSnapshotAssetsForApply");
    const target = diagObjs[0]!;
    const bytes = await snapshotFetchEmbeddedImageBytesTimed(
      stub({ objectId: target.objectId, mediaPartName: target.mediaPartName, embeddedFingerprint: fp(target.objectId) }),
      { fetchXlsxBytes: async () => sampleXlsx() },
    );
    expect(bytes && sha256Base64Url(bytes as Uint8Array)).toBe(fp(target.objectId));
  });

  test("returns null when the fingerprint's bytes live only on a non-DIAGRAMS tab (tab scoping)", async () => {
    const { snapshotFetchEmbeddedImageBytesTimed } = await import("@/lib/sync/defaultSnapshotAssetsForApply");
    const bytes = await snapshotFetchEmbeddedImageBytesTimed(
      stub({ objectId: infoObj.objectId, mediaPartName: infoObj.mediaPartName, embeddedFingerprint: fp(infoObj.objectId) }),
      { fetchXlsxBytes: async () => sampleXlsx() },
    );
    expect(bytes).toBeNull();
  });

  test("returns null (fail-soft) when the re-export throws", async () => {
    const { snapshotFetchEmbeddedImageBytesTimed } = await import("@/lib/sync/defaultSnapshotAssetsForApply");
    const target = diagObjs[0]!;
    const bytes = await snapshotFetchEmbeddedImageBytesTimed(
      stub({ mediaPartName: target.mediaPartName, embeddedFingerprint: fp(target.objectId) }),
      {
        fetchXlsxBytes: async () => {
          throw new Error("drive down");
        },
      },
    );
    expect(bytes).toBeNull();
  });

  test("returns null when the entry has no mediaPartName or no fetchXlsxBytes", async () => {
    const { snapshotFetchEmbeddedImageBytesTimed } = await import("@/lib/sync/defaultSnapshotAssetsForApply");
    expect(
      await snapshotFetchEmbeddedImageBytesTimed(stub({ embeddedFingerprint: "x" }), {
        fetchXlsxBytes: async () => sampleXlsx(),
      }),
    ).toBeNull();
    const target = diagObjs[0]!;
    expect(
      await snapshotFetchEmbeddedImageBytesTimed(
        stub({ mediaPartName: target.mediaPartName, embeddedFingerprint: fp(target.objectId) }),
        {},
      ),
    ).toBeNull();
  });
});

describe("makeSnapshotAssetsForApply — memoized current export (factory wiring)", () => {
  beforeEach(() => {
    uploads.length = 0;
    fetchCurrentSheetXlsxBytes.mockReset();
    fetchCurrentSheetXlsxBytes.mockImplementation(async () => sampleXlsx());
  });

  test("re-exports the xlsx once for N XLSX-media entries and snapshots each", async () => {
    const { makeSnapshotAssetsForApply } = await import("@/lib/sync/defaultSnapshotAssetsForApply");
    const entries = diagObjs.map((o) =>
      stub({ objectId: o.objectId, mediaPartName: o.mediaPartName, embeddedFingerprint: fp(o.objectId) }),
    );
    const tx = {
      insertPendingSnapshotUpload: vi.fn(async () => {}),
      markPendingSnapshotDeleteStarted: vi.fn(async () => {}),
    };
    const run = makeSnapshotAssetsForApply("show-1", tx);

    const result = await run({
      driveFileId: "sheet-1",
      diagrams: { linkedFolder: null, embeddedImages: entries, linkedFolderItems: [] },
    });

    expect(result.pending.embeddedImages.every((e) => e.snapshotPath !== null)).toBe(true);
    expect(fetchCurrentSheetXlsxBytes).toHaveBeenCalledTimes(1); // memoized once per apply pass
    expect(uploads).toHaveLength(entries.length);
  });
});
