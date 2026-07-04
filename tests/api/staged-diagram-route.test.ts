import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  handleStagedDiagramGet,
  STAGED_DIAGRAM_CACHE_SECONDS,
  STAGED_DIAGRAM_OBJECT_ID_MAX,
  type StagedDiagramRouteDeps,
} from "@/app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route";

/**
 * Task 3 — staged-diagram preview route (spec §B1, §K7). Admin-only, read-only:
 * serves a staged embedded-diagram image's bytes live-fetched from Drive via the
 * injectable snapshot helper. SECURITY-LOAD-BEARING surface: `parse_result` is
 * UNTRUSTED JSONB and the fetch helper sends the Drive bearer token to whatever
 * `contentUrl` says — hostile URLs must produce ZERO fetches (SSRF/token-exfil
 * class). All failures are fail-soft 4xx (the consumer is an <img> onError
 * placeholder); a 500 leaking from untrusted JSONB is a bug this file pins.
 *
 * Harness: deps-injection (the wizard-unapprove-route.test.ts `deps(overrides)`
 * builder pattern) — no vi.mock module graphs, no live DB.
 */

const WSID = "00000000-1111-4222-8333-444444444444";
const DFID = "drive-abc-123";

const validStub = {
  sheetTab: "DIAGRAMS",
  objectId: "obj-1",
  mimeType: "image/png",
  sheetsRevisionId: "rev-1",
  embeddedFingerprint: "fp",
  recovery_disposition: "normal",
  snapshotPath: null,
  contentUrl: "https://lh3.googleusercontent.com/img-1",
};

const parseResultWith = (images: unknown[]) => ({
  diagrams: { embeddedImages: images, linkedFolderItems: [], linkedFolder: null },
});

const PNG_BYTES = new TextEncoder().encode("png-bytes");

// Module-level spies so every test can assert call counts (the security tests
// assert ZERO calls — the spy must be the same object the route received).
const queryOneMock = vi.fn<(sqlText: string, params: unknown[]) => Promise<unknown>>();
const fetchImageBytesMock = vi.fn<
  (stub: unknown, ctx: { driveFileId: string }) => Promise<unknown>
>();

beforeEach(() => {
  queryOneMock.mockReset();
  fetchImageBytesMock.mockReset();
  queryOneMock.mockResolvedValue({ parse_result: parseResultWith([validStub]) });
  fetchImageBytesMock.mockResolvedValue({
    bytes: PNG_BYTES,
    sha256Base64Url: "s",
    md5Hex: "m",
  });
});

function deps(overrides: StagedDiagramRouteDeps = {}): StagedDiagramRouteDeps {
  return {
    requireAdminIdentity: async () => ({ email: "doug@fxav.com" }),
    queryOne: queryOneMock as unknown as NonNullable<StagedDiagramRouteDeps["queryOne"]>,
    fetchImageBytes: fetchImageBytesMock as unknown as NonNullable<
      StagedDiagramRouteDeps["fetchImageBytes"]
    >,
    ...overrides,
  };
}

function get(
  objectId = "obj-1",
  wsid = WSID,
  dfid = DFID,
  overrides: StagedDiagramRouteDeps = {},
): Promise<Response> {
  return handleStagedDiagramGet(
    new Request(
      `https://x.test/api/admin/onboarding/staged-diagram/${wsid}/${dfid}/${encodeURIComponent(objectId)}`,
    ),
    { params: Promise.resolve({ wizardSessionId: wsid, driveFileId: dfid, objectId }) },
    deps(overrides),
  );
}

describe("staged-diagram route — auth (§K7.1)", () => {
  // Failure mode: a session-guard bypass — the route reading pending_syncs (or
  // fetching Drive bytes) before/without the admin gate.
  test("non-admin (plain error) → 403 ADMIN_FORBIDDEN, queryOne never called", async () => {
    const response = await get("obj-1", WSID, DFID, {
      requireAdminIdentity: async () => {
        throw new Error("nope");
      },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: "ADMIN_FORBIDDEN" });
    expect(queryOneMock.mock.calls.length).toBe(0);
    expect(fetchImageBytesMock.mock.calls.length).toBe(0);
  });

  test("auth infra fault (ADMIN_SESSION_LOOKUP_FAILED) → 500 with that code, queryOne never called", async () => {
    const response = await get("obj-1", WSID, DFID, {
      requireAdminIdentity: async () => {
        throw { code: "ADMIN_SESSION_LOOKUP_FAILED" };
      },
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, code: "ADMIN_SESSION_LOOKUP_FAILED" });
    expect(queryOneMock.mock.calls.length).toBe(0);
  });
});

describe("staged-diagram route — param validation (§K7.2, §K7.3)", () => {
  // Failure mode: a malformed UUID reaching `$2::uuid` would be a Postgres
  // invalid-uuid 500, not a controlled 404.
  test("malformed wizardSessionId → 404 with ZERO queryOne calls", async () => {
    const response = await get("obj-1", "not-a-uuid");
    expect(response.status).toBe(404);
    expect(queryOneMock.mock.calls.length).toBe(0);
  });

  test.each(["a/b", ""])(
    "malformed driveFileId %j → 404 with ZERO queryOne calls",
    async (dfid) => {
      const response = await get("obj-1", WSID, dfid);
      expect(response.status).toBe(404);
      expect(queryOneMock.mock.calls.length).toBe(0);
    },
  );

  test.each(["a b", "", "a".repeat(STAGED_DIAGRAM_OBJECT_ID_MAX + 1)])(
    "malformed objectId %j → 400 with ZERO queryOne calls",
    async (objectId) => {
      const response = await get(objectId);
      expect(response.status).toBe(400);
      expect(queryOneMock.mock.calls.length).toBe(0);
    },
  );
});

describe("staged-diagram route — row lookup (§K7.4, §K7.5)", () => {
  // Failure mode: serving bytes for a superseded/absent wizard session.
  test("superseded/absent session (queryOne → null) → 404", async () => {
    queryOneMock.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(404);
    expect(fetchImageBytesMock.mock.calls.length).toBe(0);
  });

  test("row lookup is guarded on the ACTIVE session (app_settings CAS) with [driveFileId, wizardSessionId] params", async () => {
    await get();
    expect(queryOneMock.mock.calls.length).toBe(1);
    const [sqlText, params] = queryOneMock.mock.calls[0]!;
    expect(sqlText).toMatch(/pending_syncs/);
    expect(sqlText).toMatch(/pending_wizard_session_id/);
    expect(params).toEqual([DFID, WSID]);
  });

  // Failure mode: unknown objectId falling through to a Drive fetch.
  test("unknown objectId → 404, fetchImageBytes never called", async () => {
    const response = await get("obj-unknown");
    expect(response.status).toBe(404);
    expect(fetchImageBytesMock.mock.calls.length).toBe(0);
  });
});

describe("staged-diagram route — URL trust boundary (§K7.6, §K7.7) — token never leaves", () => {
  // Failure mode (SSRF/token exfiltration): the helper sends the Drive BEARER
  // TOKEN to contentUrl; a hostile URL in corrupt parse_result must produce
  // ZERO fetch calls.
  test.each([
    "http://lh3.googleusercontent.com/x", // http scheme
    "https://evil.example/x", // untrusted host
    "https://google.com.evil.net/x", // suffix spoof
  ])("hostile contentUrl %j → 404 with ZERO fetchImageBytes calls", async (contentUrl) => {
    queryOneMock.mockResolvedValue({
      parse_result: parseResultWith([{ ...validStub, contentUrl }]),
    });
    const response = await get();
    expect(response.status).toBe(404);
    expect(fetchImageBytesMock.mock.calls.length).toBe(0);
  });

  test("null contentUrl (XLSX-media entry) with no media pair → 404 with ZERO fetchImageBytes calls", async () => {
    queryOneMock.mockResolvedValue({
      parse_result: parseResultWith([{ ...validStub, contentUrl: null }]),
    });
    const response = await get();
    expect(response.status).toBe(404);
    expect(fetchImageBytesMock.mock.calls.length).toBe(0);
  });
});

describe("staged-diagram route — XLSX-media stubs (spec §A2/§A3, hasStagedPreviewSource)", () => {
  const mediaStub = {
    ...validStub,
    contentUrl: null,
    mediaPartName: "xl/media/image1.png",
    embeddedFingerprint: "fp",
  };

  // Failure mode: the shipped 404-all-media bug — a well-formed XLSX-media
  // stub (null contentUrl, real mediaPartName + fingerprint) must be served,
  // not blanket-404'd like the current `contentUrl == null` gate does.
  test("media stub (mediaPartName + fingerprint) → 200 with fetchImageBytes(stub, {driveFileId})", async () => {
    queryOneMock.mockResolvedValue({
      parse_result: parseResultWith([mediaStub]),
    });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("png-bytes");
    expect(fetchImageBytesMock.mock.calls.length).toBe(1);
    const [calledStub, calledCtx] = fetchImageBytesMock.mock.calls[0]!;
    expect(calledStub).toEqual(mediaStub);
    expect(calledCtx).toEqual({ driveFileId: DFID });
  });

  // Failure mode: a restage-only stub (fingerprint null — parser hasn't
  // recomputed it yet) being served anyway.
  test("media stub with null embeddedFingerprint (restage-only) → 404, ZERO fetchImageBytes calls", async () => {
    queryOneMock.mockResolvedValue({
      parse_result: parseResultWith([{ ...mediaStub, embeddedFingerprint: null }]),
    });
    const response = await get();
    expect(response.status).toBe(404);
    expect(fetchImageBytesMock.mock.calls.length).toBe(0);
  });

  test("media stub with no mediaPartName → 404, ZERO fetchImageBytes calls", async () => {
    const { mediaPartName: _omit, ...withoutMediaPartName } = mediaStub;
    queryOneMock.mockResolvedValue({
      parse_result: parseResultWith([withoutMediaPartName]),
    });
    const response = await get();
    expect(response.status).toBe(404);
    expect(fetchImageBytesMock.mock.calls.length).toBe(0);
  });

  test("media stub, fetchImageBytes resolves null → 404 (fail-soft)", async () => {
    queryOneMock.mockResolvedValue({
      parse_result: parseResultWith([mediaStub]),
    });
    fetchImageBytesMock.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(404);
  });

  test("media stub, fetchImageBytes rejects → 404, not 500", async () => {
    queryOneMock.mockResolvedValue({
      parse_result: parseResultWith([mediaStub]),
    });
    fetchImageBytesMock.mockRejectedValue(new Error("export refetch exploded"));
    const response = await get();
    expect(response.status).toBe(404);
  });
});

describe("staged-diagram route — byte serving (§K7.8–§K7.10)", () => {
  // Failure mode: un-normalized SnapshotAssetBytes union — serving
  // "[object Object]" (or crashing) when the helper returns the realistic
  // wrapped BoundedByteResult shape instead of a raw Uint8Array.
  test("happy path (wrapped BoundedByteResult) → 200 with exact headers", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("png-bytes");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("cache-control")).toBe(
      `private, max-age=${STAGED_DIAGRAM_CACHE_SECONDS}`,
    );
    expect(response.headers.get("content-length")).toBe(String(PNG_BYTES.byteLength));
  });

  test("raw Uint8Array return is also served as 200 with matching content-length", async () => {
    fetchImageBytesMock.mockResolvedValue(PNG_BYTES);
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("png-bytes");
    expect(response.headers.get("content-length")).toBe(String(PNG_BYTES.byteLength));
  });

  test("helper returning null (stale contentUrl / stall timeout) → 404", async () => {
    fetchImageBytesMock.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(404);
  });

  // Failure mode: the helper RETHROWS non-timeout errors
  // (defaultSnapshotAssetsForApply.ts:60-77) — an uncaught throw would surface
  // as a 500 instead of the fail-soft 404 the <img> placeholder absorbs.
  test("helper THROWS → 404, not 500", async () => {
    fetchImageBytesMock.mockRejectedValue(new Error("token fetch exploded"));
    const response = await get();
    expect(response.status).toBe(404);
  });
});

describe("staged-diagram route — raster mime allowlist (§K7.11)", () => {
  // Failure mode: inline-SVG XSS — SVG can carry script when served same-origin.
  test("image/svg+xml stub → 404 with ZERO fetchImageBytes calls", async () => {
    queryOneMock.mockResolvedValue({
      parse_result: parseResultWith([{ ...validStub, mimeType: "image/svg+xml" }]),
    });
    const response = await get();
    expect(response.status).toBe(404);
    expect(fetchImageBytesMock.mock.calls.length).toBe(0);
  });
});

describe("staged-diagram route — untrusted parse_result containers (§K7.12)", () => {
  // Failure mode: legacy double-encoded/corrupt JSONB rows exist
  // (applyStaged.ts:443-459) — dereferencing them raw would throw a 500.
  test.each([
    ["JSON string (double-encode)", JSON.stringify(parseResultWith([validStub]))],
    ["null", null],
    ["{} (missing diagrams)", {}],
    ["non-array embeddedImages", { diagrams: { embeddedImages: "x" } }],
  ])("parse_result = %s → 404, never 500", async (_label, parse_result) => {
    queryOneMock.mockResolvedValue({ parse_result });
    const response = await get();
    expect(response.status).toBe(404);
    expect(fetchImageBytesMock.mock.calls.length).toBe(0);
  });
});

describe("staged-diagram route — untrusted parse_result elements (§K7.13)", () => {
  // Failure mode: a malformed element crashing objectId matching (500) instead
  // of being skipped (an unaddressable stub is a 404 like any unknown objectId).
  test.each([
    ["null element", [null]],
    ["non-string objectId", [{ objectId: 123 }]],
    ["non-string contentUrl", [{ ...validStub, contentUrl: 7 }]],
    ["missing sheetTab", [{ ...validStub, sheetTab: undefined }]],
    ["non-string alt", [{ ...validStub, alt: 7 }]],
  ])("embeddedImages = %s → 404, never 500", async (_label, images) => {
    queryOneMock.mockResolvedValue({ parse_result: parseResultWith(images) });
    const response = await get();
    expect(response.status).toBe(404);
    expect(fetchImageBytesMock.mock.calls.length).toBe(0);
  });
});
