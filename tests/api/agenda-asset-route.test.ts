/**
 * Tests for `/api/asset/agenda/[show]/[id]/route.ts` (M7 Task 7.9, AC-7.1).
 *
 * The agenda PDF proxy mirrors the diagram + reel routes: same three-branch
 * auth chain, same `private, max-age=0, must-revalidate` cache contract,
 * service-account Drive fetch only. The route binds `[id]` (the Drive file
 * id) to the show's persisted `agenda_links` list — a fileId not present in
 * the show's agenda_links yields 410 so a leaked admin URL can't proxy
 * arbitrary Drive content.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const showId = "55555555-5555-4555-8555-555555555555";
const agendaFileId = "1AgendaFileId_abc-123";
const otherFileId = "1OtherFileId_xyz-789";

type MockLinkResult =
  | { kind: "success"; viewer: { kind: "crew"; showId: string; crewMemberId: string } }
  | { kind: "continue"; clearCookie?: true; priorFailure?: { status: 401 | 410; code: string } }
  | { kind: "terminal_failure"; status: 401 | 500; code: string; clearCookie?: true };

const routeMock = vi.hoisted(() => ({
  admin: { ok: false, reason: "not_admin" as const },
  link: {
    kind: "success" as const,
    viewer: { kind: "crew" as const, showId: "", crewMemberId: "crew-1" },
  } as MockLinkResult,
  google: { kind: "continue" } as { kind: string },
  linkCalls: 0,
  googleCalls: 0,
  peek: { kind: "none" } as { kind: "none" } | { kind: "envelope"; showId: string },
  showRow: null as null | {
    id: string;
    published: boolean | null;
    agenda_links: { label?: string; fileId?: string; url?: string }[];
  },
  driveMeta: null as null | {
    mimeType?: string | null;
    trashed?: boolean | null;
    size?: string | null;
  },
  driveBytes: null as null | Uint8Array,
  driveError: null as unknown,
  filesGetCalls: [] as {
    fileId: string;
    alt: string | undefined;
    supportsAllDrives?: boolean;
  }[],
  lastMediaOptions: null as null | {
    responseType: "stream";
    headers?: Record<string, string>;
  },
  // When true, the 206 media response omits the `content-length` header
  // so the route's R20 P1 fallback (derive slice length from
  // Content-Range) is exercised.
  omit206ContentLength: false as boolean,
  // When set, overrides the synthetic 206 Content-Range total — used
  // to simulate Drive returning a 206 whose total size exceeds the
  // route's MAX_AGENDA_BYTES cap (Codex R22 P1).
  agenda206TotalOverride: null as number | null,
  // Codex R23 P1 controls: simulate misbehaving upstream that omits
  // Content-Range on 206 (omit206ContentRange) or sends the
  // RFC-7233-legal "unknown total" form `bytes 0-9/*` (use206StarTotal)
  // or sends a malformed total that doesn't match the numeric regex
  // (use206MalformedTotal). All three must fail-closed at the route.
  omit206ContentRange: false as boolean,
  use206StarTotal: false as boolean,
  use206MalformedTotal: false as boolean,
}));

vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => routeMock.admin,
}));
vi.mock("@/lib/auth/validateGoogleSession", () => ({
  validateGoogleSession: async () => {
    routeMock.googleCalls += 1;
    return routeMock.google;
  },
}));

vi.mock("@/lib/auth/picker/validatePickerAssetSession", () => ({
  validatePickerAssetSession: async (_request: unknown, showIdArg: string) => {
    if (routeMock.peek.kind === "envelope" && routeMock.peek.showId !== showIdArg) {
      routeMock.googleCalls += 1;
      if (routeMock.google.kind === "success") return { ok: true };
      return {
        ok: false,
        response: new Response(null, {
          status: 403,
          headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
        }),
      };
    }
    routeMock.linkCalls += 1;
    if (routeMock.link.kind === "success") {
      return routeMock.link.viewer.showId === showIdArg
        ? { ok: true }
        : {
            ok: false,
            response: new Response(null, {
              status: 403,
              headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
            }),
          };
    }
    if (routeMock.link.kind === "terminal_failure") {
      return {
        ok: false,
        response: Response.json(
          { error: routeMock.link.code },
          {
            status: routeMock.link.status,
            headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
          },
        ),
      };
    }
    routeMock.googleCalls += 1;
    if (routeMock.google.kind === "success") return { ok: true };
    if (routeMock.link.priorFailure?.status === 410) {
      return {
        ok: false,
        response: new Response(null, {
          status: 410,
          headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
        }),
      };
    }
    if (routeMock.peek.kind === "envelope" && routeMock.peek.showId !== showIdArg) {
      return {
        ok: false,
        response: new Response(null, {
          status: 403,
          headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
        }),
      };
    }
    return {
      ok: false,
      response: new Response(null, {
        status: 401,
        headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
      }),
    };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from() {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: routeMock.showRow, error: null }),
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/drive/client", () => ({
  getDriveClient: () => ({
    files: {
      async get(
        args: {
          fileId: string;
          fields?: string;
          alt?: string;
          supportsAllDrives?: boolean;
        },
        options?: { responseType: "stream"; headers?: Record<string, string> },
      ) {
        routeMock.filesGetCalls.push({
          fileId: args.fileId,
          alt: args.alt,
          ...(args.supportsAllDrives === undefined
            ? {}
            : { supportsAllDrives: args.supportsAllDrives }),
        });
        routeMock.lastMediaOptions = options ?? null;
        if (routeMock.driveError) throw routeMock.driveError;
        if (args.alt === "media") {
          if (!routeMock.driveBytes) {
            const err: unknown = Object.assign(new Error("not found"), { code: 404 });
            throw err;
          }
          // Mimic Drive: if a Range header was forwarded, return 206
          // with synthetic Content-Range; otherwise full 200.
          if (options?.headers?.Range) {
            const total =
              routeMock.agenda206TotalOverride !== null
                ? routeMock.agenda206TotalOverride
                : routeMock.driveBytes.byteLength;
            const headers: Record<string, string> = {};
            if (!routeMock.omit206ContentRange) {
              if (routeMock.use206StarTotal) {
                headers["content-range"] = `bytes 0-9/*`;
              } else if (routeMock.use206MalformedTotal) {
                headers["content-range"] = `bytes 0-9/not-a-number`;
              } else {
                headers["content-range"] = `bytes 0-9/${total}`;
              }
            }
            if (!routeMock.omit206ContentLength) {
              headers["content-length"] = String(routeMock.driveBytes.byteLength);
            }
            // Gaxios 7.x (googleapis dep) returns `response.headers` as a
            // WHATWG `Headers` instance, NOT a plain object. The mock
            // mirrors the live shape so plain index access on headers
            // (`headers["content-range"]` → undefined → fail-closed 410 on
            // every valid Range slice) can never regress silently again
            // (live-reproduced production bug, 2026-06-12).
            return { data: routeMock.driveBytes, status: 206, headers: new Headers(headers) };
          }
          return { data: routeMock.driveBytes, status: 200 };
        }
        return { data: routeMock.driveMeta ?? {} };
      },
    },
  }),
}));

async function getAgenda(
  fileId = agendaFileId,
  init?: { headers?: Record<string, string> },
): Promise<Response> {
  const { GET } = await import("@/app/api/asset/agenda/[show]/[id]/route");
  const url = `https://crew.fxav.test/api/asset/agenda/${showId}/${fileId}`;
  const req = init?.headers
    ? new NextRequest(url, { headers: init.headers })
    : new NextRequest(url);
  return GET(req, { params: Promise.resolve({ show: showId, id: fileId }) });
}

async function expectPickerShowUnavailable(response: Response): Promise<void> {
  expect(response.status).toBe(410);
  await expect(response.json()).resolves.toMatchObject({ error: "PICKER_SHOW_UNAVAILABLE" });
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
  routeMock.showRow = {
    id: showId,
    published: true,
    agenda_links: [{ label: "Agenda", fileId: agendaFileId }],
  };
  routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "22" };
  routeMock.driveBytes = new TextEncoder().encode("%PDF-1.7 fixture bytes");
  routeMock.driveError = null;
  routeMock.filesGetCalls = [];
  routeMock.lastMediaOptions = null;
  routeMock.omit206ContentLength = false;
  routeMock.agenda206TotalOverride = null;
  routeMock.omit206ContentRange = false;
  routeMock.use206StarTotal = false;
  routeMock.use206MalformedTotal = false;
});

async function headAgenda(
  fileId = agendaFileId,
  init?: { headers?: Record<string, string> },
): Promise<Response> {
  const { HEAD } = await import("@/app/api/asset/agenda/[show]/[id]/route");
  const url = `https://crew.fxav.test/api/asset/agenda/${showId}/${fileId}`;
  const req = init?.headers
    ? new NextRequest(url, { headers: init.headers })
    : new NextRequest(url);
  return HEAD(req, { params: Promise.resolve({ show: showId, id: fileId }) });
}

describe("/api/asset/agenda/[show]/[id]", () => {
  test("rejects unauthenticated requests before any Drive call", async () => {
    routeMock.link = { kind: "continue" };
    const res = await getAgenda();
    expect(res.status).toBe(401);
    expect(routeMock.filesGetCalls).toEqual([]);
  });

  test("rejects cross-show link viewers with 403", async () => {
    routeMock.link = {
      kind: "success",
      viewer: { kind: "crew", showId: "other-show", crewMemberId: "crew-1" },
    };
    const res = await getAgenda();
    expect(res.status).toBe(403);
    expect(routeMock.filesGetCalls).toEqual([]);
  });

  test("surfaces revoked link sessions as 410", async () => {
    routeMock.link = {
      kind: "continue",
      clearCookie: true,
      priorFailure: { status: 410, code: "LINK_REVOKED_FLOOR" },
    };
    const res = await getAgenda();
    expect(res.status).toBe(410);
  });

  test("serves PDF bytes with private revalidation when fileId is in agenda_links", async () => {
    const res = await getAgenda();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(body)).toContain("%PDF-1.7");
    expect(routeMock.filesGetCalls.map((c) => c.fileId)).toContain(agendaFileId);
  });

  test("returns 410 when fileId is NOT in show.agenda_links (no proxy of arbitrary Drive files)", async () => {
    const res = await getAgenda(otherFileId);
    expect(res.status).toBe(410);
    expect(routeMock.filesGetCalls).toEqual([]);
  });

  test("returns 410 when show row missing", async () => {
    routeMock.showRow = null;
    const res = await getAgenda();
    expect(res.status).toBe(410);
    expect(routeMock.filesGetCalls).toEqual([]);
  });

  test("returns 410 when fileId format is unsupported", async () => {
    const res = await getAgenda("../../etc/passwd");
    expect(res.status).toBe(410);
    expect(routeMock.filesGetCalls).toEqual([]);
  });

  test("returns 410 when the file MIME is not application/pdf (no proxy of non-PDFs)", async () => {
    routeMock.driveMeta = { mimeType: "application/vnd.google-apps.document", trashed: false };
    const res = await getAgenda();
    expect(res.status).toBe(410);
  });

  test("returns 410 when the file has been trashed in Drive", async () => {
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: true };
    const res = await getAgenda();
    expect(res.status).toBe(410);
  });

  test("returns 410 when Drive returns 404 on the bytes fetch (drift)", async () => {
    routeMock.driveBytes = null;
    const res = await getAgenda();
    expect(res.status).toBe(410);
  });

  test("returns 410 when Drive returns 403 / permissionDenied", async () => {
    routeMock.driveError = Object.assign(new Error("permission denied"), { code: 403 });
    const res = await getAgenda();
    expect(res.status).toBe(410);
  });

  test("returns 500 on generic infra failure", async () => {
    routeMock.driveError = Object.assign(new Error("kaboom"), { code: 500 });
    const res = await getAgenda();
    expect(res.status).toBe(500);
  });

  test("Codex R1 P1: non-admin viewer on unpublished show → 410 (no Drive call)", async () => {
    routeMock.showRow = {
      id: showId,
      published: false,
      agenda_links: [{ label: "Agenda", fileId: agendaFileId }],
    };
    const res = await getAgenda();
    await expectPickerShowUnavailable(res);
    expect(routeMock.filesGetCalls).toEqual([]);
  });

  test("Codex R1 P1: non-admin viewer on null-published show → 410 (no Drive call)", async () => {
    routeMock.showRow = {
      id: showId,
      published: null,
      agenda_links: [{ label: "Agenda", fileId: agendaFileId }],
    };
    const res = await getAgenda();
    await expectPickerShowUnavailable(res);
    expect(routeMock.filesGetCalls).toEqual([]);
  });

  test("Codex R1 P1: admin viewer on unpublished show → 200 (admin sees drafts)", async () => {
    routeMock.admin = { ok: true } as never;
    routeMock.link = { kind: "continue" };
    routeMock.showRow = {
      id: showId,
      published: false,
      agenda_links: [{ label: "Agenda", fileId: agendaFileId }],
    };
    const res = await getAgenda();
    expect(res.status).toBe(200);
  });

  test("Codex R2 P1: oversized Drive `size` pre-flight → 410 (no media call)", async () => {
    routeMock.driveMeta = {
      mimeType: "application/pdf",
      trashed: false,
      size: String(51 * 1024 * 1024),
    };
    const res = await getAgenda();
    expect(res.status).toBe(410);
    // Only the metadata call should have fired; no media fetch.
    expect(routeMock.filesGetCalls.map((c) => c.alt ?? "metadata")).toEqual(["metadata"]);
  });

  test("Codex R16 P1: success response advertises Accept-Ranges: bytes", async () => {
    const res = await getAgenda();
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("Codex R16 P1: Range request forwards to Drive and returns 206 with Content-Range", async () => {
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(206);
    expect(routeMock.lastMediaOptions?.headers?.Range).toBe("bytes=0-9");
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-9\/\d+$/);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("gaxios 7.x regression: 206 whose headers are a WHATWG Headers instance forwards Content-Range/Content-Length (was 410 on every valid slice)", async () => {
    // Live-reproduced production bug (validation, 2026-06-12): gaxios 7.1.4
    // returns `response.headers` as a real `Headers` instance; plain index
    // access read null, so the R23 fail-closed total-size guard could not
    // prove total <= cap and 410'd every valid Range slice — pdf.js
    // incremental load died ("This agenda could not be loaded"). The drive
    // mock above now returns `new Headers(...)` (the live shape); this test
    // pins the end-to-end contract explicitly.
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-9/22");
    expect(res.headers.get("content-length")).toBe("22");
  });

  test("Codex R19 P2: Drive metadata 404 (deleted file) → 410, not AGENDA_ASSET_LOOKUP_FAILED 500", async () => {
    routeMock.driveError = Object.assign(new Error("not found"), { code: 404 });
    const res = await getAgenda();
    expect(res.status).toBe(410);
  });

  test("Codex R20 P1: Drive metadata 410 (gone) → 410 (matches 404 behavior)", async () => {
    routeMock.driveError = Object.assign(new Error("gone"), { code: 410 });
    const res = await getAgenda();
    expect(res.status).toBe(410);
  });

  test("Codex R22 P1: 206 response gates on TOTAL size from Content-Range (cap bypass closed)", async () => {
    // Drive metadata `size` is finite and under cap, but the 206
    // response's Content-Range claims a 60MB total — over the 50MB
    // MAX_AGENDA_BYTES cap. Route MUST 410 instead of forwarding the
    // slice.
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "22" };
    routeMock.agenda206TotalOverride = 60 * 1024 * 1024;
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(410);
  });

  test("Codex R20 P1: 206 without upstream Content-Length derives slice length from Content-Range (not full file size)", async () => {
    // Body is 22 bytes (`%PDF-1.7 fixture bytes`). Metadata size is
    // known, so the route forwards Range. On 206 without
    // `content-length`, the route derives the slice length from
    // `Content-Range: bytes 0-9/N` = 10 bytes instead of the full
    // metadata size.
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "22" };
    routeMock.omit206ContentLength = true;
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-9\//);
    // Content-Length must be 10 (slice), NEVER 22 (full body).
    expect(res.headers.get("content-length")).toBe("10");
  });

  test("Codex R20 P1: 200 with metadata size still gets metadata-derived Content-Length", async () => {
    // Sanity check: when there's no Range header (full 200 response)
    // AND upstream lacks content-length, the route falls back to
    // `reportedSize` from metadata. This is the only path that uses
    // metadata size — the 206 path must never.
    routeMock.driveMeta = {
      mimeType: "application/pdf",
      trashed: false,
      size: "22",
    };
    const res = await getAgenda();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("22");
  });

  test("Codex R18 P1: pre-flight unsatisfiable Range (bytes=-0 with known size) → 416 (no media call)", async () => {
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "10" };
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=-0" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */10");
    // Only metadata fetched; media MUST NOT fire.
    expect(routeMock.filesGetCalls.filter((c) => c.alt === "media")).toEqual([]);
  });

  test("Codex R18 P1: Drive 416 thrown from media fetch → 416 response (not 500)", async () => {
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "22" };
    // Force the media call to throw 416 by simulating Drive's behavior.
    routeMock.driveError = Object.assign(new Error("range not satisfiable"), { code: 416 });
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("Codex R17 P2: suffix Range (bytes=-N) forwards verbatim to Drive", async () => {
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=-10" } });
    expect(res.status).toBe(206);
    expect(routeMock.lastMediaOptions?.headers?.Range).toBe("bytes=-10");
  });

  test("Codex R16 P1: malformed/multi-range request → 416 (no Drive media call)", async () => {
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=0-10, 20-30" } });
    expect(res.status).toBe(416);
    // Only the metadata fetch should have fired; media must NOT be called.
    expect(routeMock.filesGetCalls.filter((c) => c.alt === "media")).toEqual([]);
  });

  test("Codex R14 P1: Drive metadata + media calls include supportsAllDrives: true", async () => {
    await getAgenda();
    // Both the metadata fetch (no alt) and the media fetch (alt=media)
    // must set the flag so files in Shared Drives resolve.
    expect(routeMock.filesGetCalls.every((c) => c.supportsAllDrives === true)).toBe(true);
  });

  test("Codex R2 P2: response body is a streamable Web ReadableStream (no buffered copy)", async () => {
    const res = await getAgenda();
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(ReadableStream);
  });

  test("Codex R5 P1 + R10 P1: cross-show cookie envelope → 403 WITHOUT calling destructive picker asset resolver", async () => {
    // Cross-show peek skips destructive link validator. Route still
    // attempts Google fallthrough (R10 P1); when Google also fails,
    // final response is 403.
    routeMock.peek = { kind: "envelope", showId: "other-show-id" };
    const res = await getAgenda();
    expect(res.status).toBe(403);
    expect(routeMock.linkCalls).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────
  // Codex R23 — RFC 7233 / 9110 / 9111 comprehensive sweep
  // ───────────────────────────────────────────────────────────────

  test("Codex R23 P1: 206 with `bytes 0-9/*` total → fail-closed 410 (no body served)", async () => {
    // RFC 7233 / 9110 §14.4 allows `Content-Range: bytes <s>-<e>/*`
    // (unknown total). The prior cap-gate only ran when the regex
    // matched a numeric total — so a `*` total slipped through and
    // could be used to extract an oversized object piecemeal. With
    // R23 P1, any 206 without a parseable numeric total MUST fail
    // closed.
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "22" };
    routeMock.use206StarTotal = true;
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(410);
  });

  test("Codex R23 P1: 206 without any Content-Range header → fail-closed 410", async () => {
    // If upstream omits Content-Range entirely on a 206, route MUST
    // fail closed since the total size cannot be verified against the
    // cap.
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "22" };
    routeMock.omit206ContentRange = true;
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(410);
  });

  test("Codex R23 P1: 206 with malformed (non-numeric) total → fail-closed 410", async () => {
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "22" };
    routeMock.use206MalformedTotal = true;
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(410);
  });

  test("Codex R23 P2: Vary: Range present on 200 success", async () => {
    const res = await getAgenda();
    expect(res.status).toBe(200);
    expect(res.headers.get("vary")).toBe("Range");
  });

  test("Codex R23 P2: Vary: Range present on 206 partial", async () => {
    const res = await getAgenda(agendaFileId, { headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("vary")).toBe("Range");
  });

  test("Codex R23 P2: 500 infra-error response carries private Cache-Control", async () => {
    routeMock.driveError = new Error("drive blew up");
    const res = await getAgenda();
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
  });

  test("Codex R23 P2: 401 (unauthenticated) response carries private Cache-Control", async () => {
    routeMock.link = { kind: "continue" };
    const res = await getAgenda();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
  });

  test("Codex R23 P2: 403 (cross-show) response carries private Cache-Control", async () => {
    routeMock.link = {
      kind: "success",
      viewer: { kind: "crew", showId: "other-show", crewMemberId: "crew-1" },
    };
    const res = await getAgenda();
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
  });

  test("Codex R23 P2: HEAD returns 200 metadata headers without opening media stream", async () => {
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "22" };
    const res = await headAgenda();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe("22");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("vary")).toBe("Range");
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // Body MUST be empty for HEAD.
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(0);
    // Most important: HEAD must NOT call drive.files.get with alt=media.
    expect(routeMock.filesGetCalls.filter((c) => c.alt === "media")).toEqual([]);
  });

  test("Codex R23 P2: HEAD runs same auth chain → 401 when unauthenticated", async () => {
    routeMock.link = { kind: "continue" };
    const res = await headAgenda();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
    expect(routeMock.filesGetCalls).toEqual([]);
  });

  test("Codex R23 P2: HEAD on unpublished show → 410 (no media call)", async () => {
    routeMock.showRow = {
      id: showId,
      published: false,
      agenda_links: [{ label: "Agenda", fileId: agendaFileId }],
    };
    const res = await headAgenda();
    expect(res.status).toBe(410);
    expect(routeMock.filesGetCalls.filter((c) => c.alt === "media")).toEqual([]);
  });

  test("Codex R23 P2: HEAD with malformed Range → 416 (no media call)", async () => {
    const res = await headAgenda(agendaFileId, { headers: { Range: "bytes=0-10, 20-30" } });
    expect(res.status).toBe(416);
    expect(routeMock.filesGetCalls.filter((c) => c.alt === "media")).toEqual([]);
  });

  test("Codex R23 P2: HEAD with unsatisfiable Range (known size) → 416 + Content-Range", async () => {
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "10" };
    const res = await headAgenda(agendaFileId, { headers: { Range: "bytes=-0" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */10");
    expect(routeMock.filesGetCalls.filter((c) => c.alt === "media")).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────
  // Codex R24 P1 — HEAD/GET parity contract pin (RFC 9110 §9.3.2)
  // Every failure-mode input row asserts HEAD.status === GET.status.
  // ───────────────────────────────────────────────────────────────

  test("Codex R24 P1: HEAD/GET parity — unauthenticated", async () => {
    routeMock.link = { kind: "continue" };
    const head = await headAgenda();
    routeMock.linkCalls = 0;
    const get = await getAgenda();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(401);
  });

  test("Codex R24 P1: HEAD/GET parity — cross-show viewer", async () => {
    routeMock.link = {
      kind: "success",
      viewer: { kind: "crew", showId: "other-show", crewMemberId: "crew-1" },
    };
    const head = await headAgenda();
    const get = await getAgenda();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(403);
  });

  test("Codex R24 P1: HEAD/GET parity — unpublished show", async () => {
    routeMock.showRow = {
      id: showId,
      published: false,
      agenda_links: [{ label: "Agenda", fileId: agendaFileId }],
    };
    const head = await headAgenda();
    const get = await getAgenda();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  test("Codex R24 P1: HEAD/GET parity — fileId not in agenda_links", async () => {
    const head = await headAgenda(otherFileId);
    const get = await getAgenda(otherFileId);
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  test("Codex R24 P1: HEAD/GET parity — non-PDF MIME → 410", async () => {
    routeMock.driveMeta = { mimeType: "image/png", trashed: false };
    const head = await headAgenda();
    const get = await getAgenda();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  test("Codex R24 P1: HEAD/GET parity — oversized Drive size pre-flight → 410", async () => {
    routeMock.driveMeta = {
      mimeType: "application/pdf",
      trashed: false,
      size: String(60 * 1024 * 1024),
    };
    const head = await headAgenda();
    const get = await getAgenda();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  test("Codex R24 P1: HEAD/GET parity — Drive metadata 404 → 410", async () => {
    routeMock.driveError = Object.assign(new Error("not found"), { code: 404 });
    const head = await headAgenda();
    const get = await getAgenda();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  // Codex R25 P1: HEAD/GET parity for success-path inputs.
  test("Codex R25 P1: HEAD/GET parity — satisfiable explicit Range → both 206", async () => {
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "22" };
    const head = await headAgenda(agendaFileId, { headers: { Range: "bytes=0-9" } });
    const get = await getAgenda(agendaFileId, { headers: { Range: "bytes=0-9" } });
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(206);
  });

  test("Codex R25 P1: HEAD/GET parity — satisfiable suffix Range → both 206", async () => {
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: "22" };
    const head = await headAgenda(agendaFileId, { headers: { Range: "bytes=-10" } });
    const get = await getAgenda(agendaFileId, { headers: { Range: "bytes=-10" } });
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(206);
  });

  test("Codex R25 P1: HEAD/GET parity — no Range → both 200", async () => {
    const head = await headAgenda();
    const get = await getAgenda();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(200);
  });

  test("Codex R6 P1: HEAD/GET parity — unknown Drive size strips Range and returns full 200", async () => {
    routeMock.driveMeta = { mimeType: "application/pdf", trashed: false, size: null };
    const range = { Range: "bytes=0-9" };

    const head = await headAgenda(agendaFileId, { headers: range });
    routeMock.filesGetCalls = [];
    routeMock.lastMediaOptions = null;
    const get = await getAgenda(agendaFileId, { headers: range });

    expect(head.status).toBe(get.status);
    expect(get.status).toBe(200);
    expect(head.headers.get("content-range")).toBeNull();
    expect(get.headers.get("content-range")).toBeNull();
    // TS narrows lastMediaOptions to `null` after the reset above; widen on read.
    const postGetOptions = routeMock.lastMediaOptions as {
      responseType: "stream";
      headers?: Record<string, string>;
    } | null;
    expect(postGetOptions?.headers).toBeUndefined();
    const body = new TextDecoder().decode(new Uint8Array(await get.arrayBuffer()));
    expect(body).toBe("%PDF-1.7 fixture bytes");
  });
});
