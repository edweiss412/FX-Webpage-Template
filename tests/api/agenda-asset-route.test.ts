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
  google: { kind: "continue" as const },
  linkCalls: 0,
  googleCalls: 0,
  peek: { kind: "none" } as
    | { kind: "none" }
    | { kind: "envelope"; showId: string },
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
          ...(args.supportsAllDrives === undefined ? {} : { supportsAllDrives: args.supportsAllDrives }),
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
            return {
              data: routeMock.driveBytes,
              status: 206,
              headers: {
                "content-range": `bytes 0-9/${routeMock.driveBytes.byteLength}`,
                "content-length": String(routeMock.driveBytes.byteLength),
              },
            };
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
  routeMock.driveMeta = { mimeType: "application/pdf", trashed: false };
  routeMock.driveBytes = new TextEncoder().encode("%PDF-1.7 fixture bytes");
  routeMock.driveError = null;
  routeMock.filesGetCalls = [];
  routeMock.lastMediaOptions = null;
});

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
    expect(res.status).toBe(410);
    expect(routeMock.filesGetCalls).toEqual([]);
  });

  test("Codex R1 P1: non-admin viewer on null-published show → 410 (no Drive call)", async () => {
    routeMock.showRow = {
      id: showId,
      published: null,
      agenda_links: [{ label: "Agenda", fileId: agendaFileId }],
    };
    const res = await getAgenda();
    expect(res.status).toBe(410);
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

  test("Codex R5 P1 + R10 P1: cross-show cookie envelope → 403 WITHOUT calling destructive validateLinkSession", async () => {
    // Cross-show peek skips destructive link validator. Route still
    // attempts Google fallthrough (R10 P1); when Google also fails,
    // final response is 403.
    routeMock.peek = { kind: "envelope", showId: "other-show-id" };
    const res = await getAgenda();
    expect(res.status).toBe(403);
    expect(routeMock.linkCalls).toBe(0);
  });
});
