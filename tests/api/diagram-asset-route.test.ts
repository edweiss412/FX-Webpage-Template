import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PersistedDiagrams } from "@/lib/parser/types";

const showId = "11111111-1111-4111-8111-111111111111";
const currentRev = "22222222-2222-4222-8222-222222222222";
const pendingRev = "33333333-3333-4333-8333-333333333333";
const assetKey = "embedded-obj-1.png";
const canonicalPath = `diagram-snapshots/shows/${showId}/${currentRev}/${assetKey}`;

type MockLinkResult =
  | {
      kind: "success";
      viewer: { kind: "crew"; showId: string; crewMemberId: string };
    }
  | {
      kind: "continue";
      clearCookie?: true;
      priorFailure?: { status: 401 | 410; code: string };
    }
  | { kind: "terminal_failure"; status: 401 | 500; code: string; clearCookie?: true };

const routeMock = vi.hoisted(() => ({
  admin: { ok: false, reason: "not_admin" as const },
  link: {
    kind: "success" as const,
    viewer: {
      kind: "crew" as const,
      showId: "11111111-1111-4111-8111-111111111111",
      crewMemberId: "crew-1",
    },
  } as MockLinkResult,
  google: { kind: "continue" as const },
  linkCalls: 0,
  googleCalls: 0,
  peek: { kind: "none" } as
    | { kind: "none" }
    | { kind: "envelope"; showId: string },
  lastFetchRange: null as string | null,
  // When set, the upstream fetch mock returns 416 with this
  // Content-Range header so route 416 forwarding (R20 P2) is testable.
  fetch416ContentRange: null as string | null,
  // When set on a 206 response, overrides the synthetic Content-Range
  // total — used to simulate an oversized canonical object whose slice
  // would pass the slice-level Content-Length gate but whose full size
  // exceeds the route's MAX_DIAGRAM_BYTES cap (Codex R21 P1).
  fetch206TotalSizeOverride: null as number | null,
  // Codex R23 P1 controls: simulate misbehaving upstream that omits
  // Content-Range on 206 / sends `bytes 0-9/*` unknown-total / sends
  // a malformed total.
  fetch206OmitContentRange: false as boolean,
  fetch206UseStarTotal: false as boolean,
  fetch206UseMalformedTotal: false as boolean,
  published: true as boolean | null,
  diagrams: null as unknown,
  storageBytes: new TextEncoder().encode("diagram-bytes") as Uint8Array | null,
  storageError: null as unknown,
  storageDownloads: [] as string[],
  fromCalls: [] as string[],
  // Codex R24 P1: tracks whether the route issued a HEAD-method fetch
  // against the signed URL (HEAD path verifies object existence without
  // body bytes).
  lastHeadFetch: false as boolean,
  omitHeadContentLength: false as boolean,
}));

vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => routeMock.admin,
}));

vi.mock("@/lib/auth/validateLinkSession", () => ({
  validateLinkSession: async () => {
    routeMock.linkCalls += 1;
    return routeMock.link;
  },
  peekLinkSessionShow: () => routeMock.peek,
}));

vi.mock("@/lib/auth/validateGoogleSession", () => ({
  validateGoogleSession: async () => {
    routeMock.googleCalls += 1;
    return routeMock.google;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from(table: string) {
      routeMock.fromCalls.push(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: routeMock.diagrams
                ? { id: showId, published: routeMock.published, diagrams: routeMock.diagrams }
                : null,
              error: null,
            }),
          }),
        }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => {
          routeMock.storageDownloads.push(`${bucket}/${path}`);
          if (routeMock.storageError) {
            return { data: null, error: routeMock.storageError };
          }
          if (!routeMock.storageBytes) {
            return { data: null, error: { message: "not found" } };
          }
          return {
            data: {
              signedUrl: `https://test.supabase.local/object/sign/${bucket}/${path}`,
            },
            error: null,
          };
        },
      }),
    },
  }),
}));

// Mock global fetch so the route's signed-URL streaming fetch is
// answered by the test fixture's stored bytes. The route gates on
// `Content-Length` for the byte ceiling pre-flight, so we set that
// header from `routeMock.storageBytes.byteLength`. The body is the
// raw bytes wrapped in a Response.
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("supabase.local/object/sign/")) {
      if (originalFetch) return originalFetch(input);
      throw new Error("unmocked fetch");
    }
    if (!routeMock.storageBytes) {
      return new Response(null, { status: 404 });
    }
    const bytes = routeMock.storageBytes;
    // Codex R24 P1: HEAD path needs Content-Length echoed back (and no
    // body). Mock responds to HEAD with the same headers GET would emit
    // but with a null body — matches Supabase Storage's signed-URL HEAD
    // behavior.
    if (init?.method === "HEAD") {
      routeMock.lastHeadFetch = true;
      const headers: Record<string, string> = {};
      if (!routeMock.omitHeadContentLength) {
        headers["content-length"] = String(bytes.byteLength);
      }
      return new Response(null, {
        status: 200,
        headers,
      });
    }
    // Capture Range header forwarded to the upstream fetch so tests can
    // assert the route forwards it correctly.
    const rangeHeader =
      init?.headers && typeof (init.headers as Headers).get === "function"
        ? (init.headers as Headers).get("Range")
        : (init?.headers as Record<string, string> | undefined)?.Range ??
          (init?.headers as Record<string, string> | undefined)?.range ??
          null;
    routeMock.lastFetchRange = rangeHeader;
    if (routeMock.fetch416ContentRange !== null) {
      return new Response(null, {
        status: 416,
        headers: { "content-range": routeMock.fetch416ContentRange },
      });
    }
    if (rangeHeader) {
      const total =
        routeMock.fetch206TotalSizeOverride !== null
          ? routeMock.fetch206TotalSizeOverride
          : bytes.byteLength;
      // Codex R25 P1: realistic upstream behavior — when a Range is
      // forwarded, slice the body and report slice-length Content-Length,
      // not full-body length. Without this the GET path would emit
      // Content-Length=13 while HEAD computes slice-length 4, and the
      // HEAD/GET parity tests would falsely flag a route bug.
      // Parse the requested Range to compute slice bounds.
      let sliceStart = 0;
      let sliceEnd = bytes.byteLength - 1;
      const suffixMatch = rangeHeader.match(/^bytes=-(\d+)$/);
      const explicitMatch = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
      if (suffixMatch) {
        const suffix = Number(suffixMatch[1]);
        sliceStart = Math.max(0, bytes.byteLength - suffix);
        sliceEnd = bytes.byteLength - 1;
      } else if (explicitMatch) {
        sliceStart = Number(explicitMatch[1]);
        sliceEnd = explicitMatch[2]
          ? Math.min(Number(explicitMatch[2]), bytes.byteLength - 1)
          : bytes.byteLength - 1;
      }
      const slice = bytes.subarray(sliceStart, sliceEnd + 1);
      const headers: Record<string, string> = {
        "content-length": String(slice.byteLength),
      };
      if (!routeMock.fetch206OmitContentRange) {
        if (routeMock.fetch206UseStarTotal) {
          headers["content-range"] = `bytes ${sliceStart}-${sliceEnd}/*`;
        } else if (routeMock.fetch206UseMalformedTotal) {
          headers["content-range"] = `bytes ${sliceStart}-${sliceEnd}/not-a-number`;
        } else {
          headers["content-range"] = `bytes ${sliceStart}-${sliceEnd}/${total}`;
        }
      }
      return new Response(slice as BlobPart, { status: 206, headers });
    }
    return new Response(bytes as BlobPart, {
      status: 200,
      headers: { "content-length": String(bytes.byteLength) },
    });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

function currentDiagrams(): PersistedDiagrams {
  return {
    snapshot_revision_id: currentRev,
    snapshot_status: "complete",
    linkedFolder: null,
    embeddedImages: [
      {
        sheetTab: "DIAGRAMS",
        objectId: "obj-1",
        mimeType: "image/png",
        sheetsRevisionId: "sheet-rev-1",
        embeddedFingerprint: "fingerprint",
        recovery_disposition: "normal",
        snapshotPath: canonicalPath,
      },
    ],
    linkedFolderItems: [],
  };
}

function diagramsWithPending(): { current: PersistedDiagrams; pending: PersistedDiagrams } {
  return {
    current: currentDiagrams(),
    pending: {
      ...currentDiagrams(),
      snapshot_revision_id: pendingRev,
      embeddedImages: [
        {
          ...currentDiagrams().embeddedImages[0]!,
          objectId: "pending-only",
          snapshotPath: `diagram-snapshots/shows/${showId}/${pendingRev}/embedded-pending-only.png`,
        },
      ],
    },
  };
}

async function getDiagram(
  rev = currentRev,
  key = assetKey,
  init?: { headers?: Record<string, string> },
): Promise<Response> {
  const { GET } = await import("@/app/api/asset/diagram/[show]/[rev]/[key]/route");
  const url = `https://crew.fxav.test/api/asset/diagram/${showId}/${rev}/${key}`;
  const req = init?.headers
    ? new NextRequest(url, { headers: init.headers })
    : new NextRequest(url);
  return await GET(req, {
    params: Promise.resolve({ show: showId, rev, key }),
  });
}

async function headDiagram(
  rev = currentRev,
  key = assetKey,
  init?: { headers?: Record<string, string> },
): Promise<Response> {
  const { HEAD } = await import("@/app/api/asset/diagram/[show]/[rev]/[key]/route");
  const url = `https://crew.fxav.test/api/asset/diagram/${showId}/${rev}/${key}`;
  const req = init?.headers
    ? new NextRequest(url, { headers: init.headers })
    : new NextRequest(url);
  return await HEAD(req, {
    params: Promise.resolve({ show: showId, rev, key }),
  });
}

beforeEach(() => {
  vi.resetModules();
  routeMock.admin = { ok: false, reason: "not_admin" };
  routeMock.link = {
    kind: "success",
    viewer: { kind: "crew", showId, crewMemberId: "crew-1" },
  };
  routeMock.google = { kind: "continue" };
  routeMock.linkCalls = 0;
  routeMock.googleCalls = 0;
  routeMock.peek = { kind: "none" };
  routeMock.lastFetchRange = null;
  routeMock.fetch416ContentRange = null;
  routeMock.fetch206TotalSizeOverride = null;
  routeMock.fetch206OmitContentRange = false;
  routeMock.fetch206UseStarTotal = false;
  routeMock.fetch206UseMalformedTotal = false;
  routeMock.published = true;
  routeMock.diagrams = diagramsWithPending();
  routeMock.storageBytes = new TextEncoder().encode("diagram-bytes");
  routeMock.storageError = null;
  routeMock.storageDownloads = [];
  routeMock.fromCalls = [];
  routeMock.lastHeadFetch = false;
  routeMock.omitHeadContentLength = false;
});

describe("/api/asset/diagram/[show]/[rev]/[key]", () => {
  test("rejects unauthenticated requests before reading Storage", async () => {
    routeMock.link = { kind: "continue" };

    const response = await getDiagram();

    expect(response.status).toBe(401);
    expect(routeMock.storageDownloads).toEqual([]);
  });

  test("serves current canonical bytes with private revalidation and never reads pending", async () => {
    const response = await getDiagram();

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("diagram-bytes");
    expect(response.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(routeMock.storageDownloads).toEqual([
      `diagram-snapshots/shows/${showId}/${currentRev}/${assetKey}`,
    ]);

    const pendingResponse = await getDiagram(pendingRev, "embedded-pending-only.png");
    expect(pendingResponse.status).toBe(410);
    expect(pendingResponse.headers.get("cache-control")).toBe(
      "private, max-age=0, must-revalidate",
    );
  });

  test("rejects r-prefixed and non-uuid revisions with 410", async () => {
    await expect(getDiagram(`r=${currentRev}`)).resolves.toMatchObject({ status: 410 });
    await expect(getDiagram("_pending%2Frun-1")).resolves.toMatchObject({ status: 410 });
    expect(routeMock.fromCalls).toEqual([]);
  });

  test("rejects stale revisions and missing canonical bytes with 410", async () => {
    await expect(getDiagram("44444444-4444-4444-8444-444444444444")).resolves.toMatchObject({
      status: 410,
    });

    routeMock.storageBytes = null;
    const missing = await getDiagram();
    expect(missing.status).toBe(410);
  });

  test("maps cross-show and revoked sessions to 403 and 410", async () => {
    routeMock.link = {
      kind: "success",
      viewer: { kind: "crew", showId: "other-show", crewMemberId: "crew-1" },
    };
    await expect(getDiagram()).resolves.toMatchObject({ status: 403 });

    routeMock.link = {
      kind: "continue",
      clearCookie: true,
      priorFailure: { status: 410, code: "LINK_NO_CREW_MATCH" },
    };
    await expect(getDiagram()).resolves.toMatchObject({ status: 410 });
  });

  test("Codex R1 P1 class-sweep: non-admin viewer on unpublished show → 410 (no Storage call)", async () => {
    routeMock.published = false;
    const res = await getDiagram();
    expect(res.status).toBe(410);
    expect(routeMock.storageDownloads).toEqual([]);
  });

  test("Codex R4 P1: unpublished show + non-admin → 410 WITHOUT calling link/google validators (no last_active_at refresh)", async () => {
    routeMock.published = false;
    const res = await getDiagram();
    expect(res.status).toBe(410);
    // The validators have side effects (validateLinkSession refreshes
    // link_sessions.last_active_at). Asserting zero calls pins the
    // page-level gate ordering into the asset route.
    expect(routeMock.linkCalls).toBe(0);
    expect(routeMock.googleCalls).toBe(0);
  });

  test("Codex R1 P1 class-sweep: admin viewer on unpublished show → 200 (admin sees drafts)", async () => {
    routeMock.admin = { ok: true } as never;
    routeMock.link = { kind: "continue" };
    routeMock.published = false;
    const res = await getDiagram();
    expect(res.status).toBe(200);
  });

  test("Codex R4 P2: oversized Storage object → 410 (route-level byte ceiling)", async () => {
    // 60MB blob — over the 50MB MAX_DIAGRAM_BYTES route cap.
    routeMock.storageBytes = new Uint8Array(60 * 1024 * 1024);
    const res = await getDiagram();
    expect(res.status).toBe(410);
  });

  test("Codex R5 P1 + R10 P1: cross-show cookie envelope → 403 WITHOUT calling destructive validateLinkSession", async () => {
    // Crew member has a valid show-A link cookie but hits show-B's
    // asset URL. The route must NOT call validateLinkSession (which
    // would DELETE the show-A session row). The route STILL runs
    // validateGoogleSession so a same-show Google session can rescue
    // the request (R10 P1 fix); when Google also fails, the final
    // response is 403 (cross-show diagnostic).
    routeMock.peek = { kind: "envelope", showId: "other-show-id" };
    const res = await getDiagram();
    expect(res.status).toBe(403);
    expect(routeMock.linkCalls).toBe(0);
  });

  test("Codex R10 P1: cross-show link cookie + valid same-show Google session → 200", async () => {
    routeMock.peek = { kind: "envelope", showId: "other-show-id" };
    routeMock.google = {
      kind: "success" as const,
      viewer: { kind: "crew", showId, crewMemberId: "crew-1" },
    } as never;
    const res = await getDiagram();
    expect(res.status).toBe(200);
    expect(routeMock.linkCalls).toBe(0);
    expect(routeMock.googleCalls).toBeGreaterThan(0);
  });

  test("Codex R6 P1: persisted SVG MIME → 410 (no same-origin active content)", async () => {
    // Mutate the diagram entry's MIME to SVG. The route MUST reject —
    // SVG can carry script when loaded as a same-origin top-level doc.
    const tampered = currentDiagrams();
    (tampered.embeddedImages[0] as { mimeType: string }).mimeType = "image/svg+xml";
    routeMock.diagrams = { current: tampered, pending: null };
    const res = await getDiagram();
    expect(res.status).toBe(410);
  });

  test("Codex R17 P1: success response advertises Accept-Ranges: bytes", async () => {
    const res = await getDiagram();
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("Codex R17 P1: Range request forwards to upstream fetch and returns 206 with Content-Range", async () => {
    const res = await getDiagram(currentRev, assetKey, { headers: { Range: "bytes=0-3" } });
    expect(res.status).toBe(206);
    expect(routeMock.lastFetchRange).toBe("bytes=0-3");
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-/);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("Codex R17 P1: suffix Range (bytes=-N) forwards verbatim to upstream", async () => {
    const res = await getDiagram(currentRev, assetKey, { headers: { Range: "bytes=-4" } });
    expect(res.status).toBe(206);
    expect(routeMock.lastFetchRange).toBe("bytes=-4");
  });

  test("Codex R21 P1: 206 response gates on TOTAL object size (from Content-Range), not slice size", async () => {
    // Slice is tiny (the small fixture body) but Content-Range claims
    // the full object is 60MB — over the 50MB MAX_DIAGRAM_BYTES cap.
    // The route MUST 410 instead of forwarding the slice (which would
    // let an oversized canonical object be fetched piecemeal).
    routeMock.fetch206TotalSizeOverride = 60 * 1024 * 1024;
    const res = await getDiagram(currentRev, assetKey, { headers: { Range: "bytes=0-3" } });
    expect(res.status).toBe(410);
  });

  test("Codex R20 P2: upstream 416 forwards Content-Range to the client", async () => {
    routeMock.fetch416ContentRange = "bytes */100";
    const res = await getDiagram(currentRev, assetKey, { headers: { Range: "bytes=200-300" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */100");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("Codex R17 P1: malformed/multi-range request → 416 (no upstream fetch)", async () => {
    const res = await getDiagram(currentRev, assetKey, {
      headers: { Range: "bytes=0-10, 20-30" },
    });
    expect(res.status).toBe(416);
    expect(routeMock.lastFetchRange).toBeNull();
  });

  test("Codex R6 P1: served raster MIME carries X-Content-Type-Options: nosniff", async () => {
    const res = await getDiagram();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("Codex R9 P1: stale revoked link cookie does NOT block a valid Google session", async () => {
    // The crew member has a stale link cookie (revoked, prior 410) AND a
    // valid Google session for this show. The page resolver lets them
    // through; the asset route MUST mirror that fallthrough.
    routeMock.link = {
      kind: "continue",
      clearCookie: true,
      priorFailure: { status: 410, code: "LINK_NO_CREW_MATCH" },
    };
    routeMock.google = {
      kind: "success" as const,
      viewer: { kind: "crew", showId, crewMemberId: "crew-1" },
    } as never;
    const res = await getDiagram();
    expect(res.status).toBe(200);
    // Sanity: both validators were exercised — the helper didn't
    // short-circuit on the link 410.
    expect(routeMock.linkCalls).toBeGreaterThan(0);
    expect(routeMock.googleCalls).toBeGreaterThan(0);
  });

  // ───────────────────────────────────────────────────────────────
  // Codex R23 — RFC 7233 / 9110 / 9111 comprehensive sweep
  // ───────────────────────────────────────────────────────────────

  test("Codex R23 P1: 206 with `bytes 0-N/*` total → fail-closed 410", async () => {
    routeMock.fetch206UseStarTotal = true;
    const res = await getDiagram(currentRev, assetKey, { headers: { Range: "bytes=0-3" } });
    expect(res.status).toBe(410);
  });

  test("Codex R23 P1: 206 without any Content-Range header → fail-closed 410", async () => {
    routeMock.fetch206OmitContentRange = true;
    const res = await getDiagram(currentRev, assetKey, { headers: { Range: "bytes=0-3" } });
    expect(res.status).toBe(410);
  });

  test("Codex R23 P1: 206 with malformed (non-numeric) total → fail-closed 410", async () => {
    routeMock.fetch206UseMalformedTotal = true;
    const res = await getDiagram(currentRev, assetKey, { headers: { Range: "bytes=0-3" } });
    expect(res.status).toBe(410);
  });

  test("Codex R23 P2: Vary: Range present on 200 success", async () => {
    const res = await getDiagram();
    expect(res.status).toBe(200);
    expect(res.headers.get("vary")).toBe("Range");
  });

  test("Codex R23 P2: Vary: Range present on 206 partial", async () => {
    const res = await getDiagram(currentRev, assetKey, { headers: { Range: "bytes=0-3" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("vary")).toBe("Range");
  });

  test("Codex R23 P2: 500 infra-error response carries private Cache-Control", async () => {
    routeMock.storageError = { message: "infra exploded" };
    const res = await getDiagram();
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
  });

  test("Codex R23 P2: 401 unauthenticated response carries private Cache-Control", async () => {
    routeMock.link = { kind: "continue" };
    const res = await getDiagram();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
  });

  test("Codex R23 P2: 403 cross-show response carries private Cache-Control", async () => {
    routeMock.link = {
      kind: "success",
      viewer: { kind: "crew", showId: "other-show", crewMemberId: "crew-1" },
    };
    const res = await getDiagram();
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
  });

  test("Codex R24 P1: HEAD returns 200 metadata headers AND verifies storage object exists (issues HEAD-method fetch, not body fetch)", async () => {
    const res = await headDiagram();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("vary")).toBe("Range");
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(0);
    // R24 P1: HEAD MUST mint a signed URL + verify the canonical object
    // exists via an upstream HEAD-method fetch (no body bytes). Without
    // this, HEAD reports 200 for a deleted/replaced object that GET
    // would 410 on — a HEAD/GET parity violation.
    expect(routeMock.storageDownloads.length).toBe(1);
    expect(routeMock.lastHeadFetch).toBe(true);
    // HEAD must NOT issue a body-bearing GET fetch.
    expect(routeMock.lastFetchRange).toBeNull();
  });

  test("Codex R23 P2: HEAD runs same auth chain → 401 when unauthenticated", async () => {
    routeMock.link = { kind: "continue" };
    const res = await headDiagram();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
    expect(routeMock.storageDownloads).toEqual([]);
  });

  test("Codex R23 P2: HEAD on unpublished show → 410 (no storage call)", async () => {
    routeMock.published = false;
    const res = await headDiagram();
    expect(res.status).toBe(410);
    expect(routeMock.storageDownloads).toEqual([]);
  });

  test("Codex R23 P2: HEAD on stale rev → 410", async () => {
    const res = await headDiagram("44444444-4444-4444-8444-444444444444", assetKey);
    expect(res.status).toBe(410);
    expect(routeMock.storageDownloads).toEqual([]);
  });

  test("Codex R23 P2: HEAD with malformed Range → 416", async () => {
    const res = await headDiagram(currentRev, assetKey, { headers: { Range: "bytes=0-10, 20-30" } });
    expect(res.status).toBe(416);
    expect(routeMock.storageDownloads).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────
  // Codex R24 P1 — HEAD/GET parity contract
  //
  // Per RFC 9110 §9.3.2, HEAD MUST return the same status as GET would
  // for the same input. The parity block below exercises every known
  // failure-mode input class and asserts HEAD.status === GET.status.
  // Adding a new failure mode requires adding a row here (so future
  // HEAD modifications can't silently break parity).
  // ───────────────────────────────────────────────────────────────

  test("Codex R24 P1: HEAD on missing storage object → 410 (matches GET)", async () => {
    routeMock.storageBytes = null;
    const head = await headDiagram();
    const get = await getDiagram();
    expect(head.status).toBe(410);
    expect(get.status).toBe(410);
  });

  test("Codex R24 P1: HEAD on oversized storage object → 410 (matches GET)", async () => {
    // 60MB blob — over MAX_DIAGRAM_BYTES (50MB) cap.
    routeMock.storageBytes = new Uint8Array(60 * 1024 * 1024);
    const head = await headDiagram();
    const get = await getDiagram();
    expect(head.status).toBe(410);
    expect(get.status).toBe(410);
  });

  test("Codex R24 P1: HEAD pre-flights unsatisfiable Range (bytes=-0 with known size) → 416 (matches GET)", async () => {
    routeMock.storageBytes = new Uint8Array(10);
    const head = await headDiagram(currentRev, assetKey, { headers: { Range: "bytes=-0" } });
    expect(head.status).toBe(416);
    expect(head.headers.get("content-range")).toBe("bytes */10");
  });

  test("Codex R24 P1: HEAD/GET parity — unpublished show", async () => {
    routeMock.published = false;
    const head = await headDiagram();
    const get = await getDiagram();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  test("Codex R24 P1: HEAD/GET parity — stale revision", async () => {
    const head = await headDiagram("44444444-4444-4444-8444-444444444444");
    const get = await getDiagram("44444444-4444-4444-8444-444444444444");
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  test("Codex R24 P1: HEAD/GET parity — unauthenticated", async () => {
    routeMock.link = { kind: "continue" };
    const head = await headDiagram();
    const get = await getDiagram();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(401);
  });

  test("Codex R24 P1: HEAD/GET parity — cross-show viewer", async () => {
    routeMock.link = {
      kind: "success",
      viewer: { kind: "crew", showId: "other-show", crewMemberId: "crew-1" },
    };
    const head = await headDiagram();
    const get = await getDiagram();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(403);
  });

  test("Codex R24 P1: HEAD/GET parity — Storage signedUrl returns 'not found' error", async () => {
    routeMock.storageError = { message: "Object not found", status: 404 };
    const head = await headDiagram();
    const get = await getDiagram();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  // ───────────────────────────────────────────────────────────────
  // Codex R25 P1 — HEAD/GET parity for SUCCESS-PATH inputs
  // R24's parity block covered only failure modes; satisfiable Range
  // is a success-path divergence (HEAD-200 vs GET-206) that the R23/R24
  // audits both missed. Adding parametrized success-path coverage here
  // closes the structural gap.
  // ───────────────────────────────────────────────────────────────

  test("Codex R25 P1: HEAD/GET parity — satisfiable explicit Range → both 206 with matching Content-Range", async () => {
    const head = await headDiagram(currentRev, assetKey, { headers: { Range: "bytes=0-3" } });
    const get = await getDiagram(currentRev, assetKey, { headers: { Range: "bytes=0-3" } });
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(206);
    expect(head.headers.get("content-range")).toBe(get.headers.get("content-range"));
    expect(head.headers.get("content-length")).toBe(get.headers.get("content-length"));
  });

  test("Codex R25 P1: HEAD/GET parity — satisfiable suffix Range → both 206", async () => {
    // diagram-bytes is 13 bytes, suffix -4 → bytes 9-12
    const head = await headDiagram(currentRev, assetKey, { headers: { Range: "bytes=-4" } });
    const get = await getDiagram(currentRev, assetKey, { headers: { Range: "bytes=-4" } });
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(206);
    expect(head.headers.get("content-length")).toBe(get.headers.get("content-length"));
  });

  test("Codex R25 P1: HEAD/GET parity — no Range → both 200 with full Content-Length", async () => {
    const head = await headDiagram();
    const get = await getDiagram();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(get.headers.get("content-length"));
  });

  test("Codex R6 P1: HEAD/GET parity — unknown upstream size strips Range and returns full 200", async () => {
    routeMock.omitHeadContentLength = true;
    const range = { Range: "bytes=0-3" };

    const head = await headDiagram(currentRev, assetKey, { headers: range });
    routeMock.lastFetchRange = null;
    routeMock.lastHeadFetch = false;
    const get = await getDiagram(currentRev, assetKey, { headers: range });

    expect(head.status).toBe(get.status);
    expect(get.status).toBe(200);
    expect(head.headers.get("content-range")).toBeNull();
    expect(get.headers.get("content-range")).toBeNull();
    expect(routeMock.lastHeadFetch).toBe(true);
    expect(routeMock.lastFetchRange).toBeNull();
    await expect(get.text()).resolves.toBe("diagram-bytes");
  });
});
