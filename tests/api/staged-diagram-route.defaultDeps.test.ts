import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { extractEmbeddedObjects } from "@/lib/drive/embeddedObjects";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import type { StagedDiagramRouteDeps } from "@/app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route";

/**
 * Task 2 (spec §A3) — the staged-diagram route's DEFAULT `fetchImageBytes`
 * binding for XLSX-media stubs (contentUrl null). Separate file from
 * staged-diagram-route.test.ts (the deps-injection harness) because this one
 * needs vi.mock module graphs to exercise the real
 * `defaultStagedDiagramFetchImageBytes` → `fetchCurrentSheetXlsxBytes` wiring;
 * the injection-harness file stays vi.mock-free by design.
 *
 * Pattern precedent: tests/sync/snapshotAssetsXlsxMedia.test.ts:7-37.
 */

const sampleXlsx = (): ArrayBuffer => {
  const b = readFileSync(new URL("../fixtures/diagrams/embedded-sample.xlsx", import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const { fetchCurrentSheetXlsxBytes } = vi.hoisted(() => ({ fetchCurrentSheetXlsxBytes: vi.fn() }));
vi.mock("@/lib/drive/fetch", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchCurrentSheetXlsxBytes,
}));
vi.mock("@/lib/drive/client", () => ({ getDriveClient: () => ({}), getDriveAccessToken: async () => "t" }));

describe("defaultStagedDiagramFetchImageBytes (spec §A3)", () => {
  test("default fetcher serves DIAGRAMS media bytes for the route-param driveFileId", async () => {
    const { defaultStagedDiagramFetchImageBytes } = await import(
      "@/app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route"
    );
    fetchCurrentSheetXlsxBytes.mockResolvedValue(sampleXlsx());
    const ex = extractEmbeddedObjects(sampleXlsx());
    const obj = ex.objectsByTab.get("DIAGRAMS")![0]!;
    const bytes = ex.bytesByObjectId.get(obj.objectId)!;
    const stub = {
      sheetTab: "DIAGRAMS",
      objectId: obj.objectId,
      mimeType: "image/png",
      contentUrl: null,
      mediaPartName: obj.mediaPartName,
      sheetsRevisionId: "rev-1",
      embeddedFingerprint: sha256Base64Url(bytes),
      recovery_disposition: "normal" as const,
      snapshotPath: null,
    };
    const result = await defaultStagedDiagramFetchImageBytes(stub, { driveFileId: "df-123" });
    expect(fetchCurrentSheetXlsxBytes).toHaveBeenCalledWith("df-123", expect.anything());
    expect(result).toBeInstanceOf(Uint8Array);
    expect(sha256Base64Url(result as Uint8Array)).toBe(stub.embeddedFingerprint);
  });

  test("ROUTE default path (no fetchImageBytes injection) serves media bytes end-to-end", async () => {
    const { handleStagedDiagramGet } = await import(
      "@/app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route"
    );
    fetchCurrentSheetXlsxBytes.mockResolvedValue(sampleXlsx());
    const ex = extractEmbeddedObjects(sampleXlsx());
    const obj = ex.objectsByTab.get("DIAGRAMS")![0]!;
    const bytes = ex.bytesByObjectId.get(obj.objectId)!;
    const stub = {
      sheetTab: "DIAGRAMS",
      objectId: obj.objectId,
      mimeType: "image/png",
      contentUrl: null,
      mediaPartName: obj.mediaPartName,
      sheetsRevisionId: "rev-1",
      embeddedFingerprint: sha256Base64Url(bytes),
      recovery_disposition: "normal" as const,
      snapshotPath: null,
    };
    const WSID = "00000000-1111-4222-8333-444444444444";
    const res = await handleStagedDiagramGet(
      new Request("http://x"),
      { params: Promise.resolve({ wizardSessionId: WSID, driveFileId: "df-123", objectId: obj.objectId }) },
      {
        requireAdminIdentity: async () => ({ email: "a@b.c" }),
        queryOne: (async () => ({
          parse_result: { diagrams: { embeddedImages: [stub], linkedFolderItems: [], linkedFolder: null } },
        })) as unknown as NonNullable<StagedDiagramRouteDeps["queryOne"]>,
        // NO fetchImageBytes — the route must bind defaultStagedDiagramFetchImageBytes itself
      },
    );
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(fetchCurrentSheetXlsxBytes).toHaveBeenCalledWith("df-123", expect.anything());
  });
});
