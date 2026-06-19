import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const showId = "11111111-1111-4111-8111-111111111111";

type MockReelRow = {
  published: boolean | null;
  opening_reel_drive_file_id: string | null;
  opening_reel_drive_modified_time: string | null;
  opening_reel_head_revision_id: string | null;
  opening_reel_mime_type: string | null;
};

type MockLinkResult =
  | {
      kind: "success";
      viewer: { kind: "crew"; showId: string; crewMemberId: string };
    }
  | { kind: "continue"; priorFailure?: { status: 401 | 410; code: string }; clearCookie?: true };

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
  google: { kind: "continue" } as { kind: string },
  linkCalls: 0,
  googleCalls: 0,
  peek: { kind: "none" } as { kind: "none" } | { kind: "envelope"; showId: string },
  show: {
    published: true,
    opening_reel_drive_file_id: "reel-file-1",
    opening_reel_drive_modified_time: "2026-05-01T00:00:00.000Z",
    opening_reel_head_revision_id: "reel-rev-1",
    opening_reel_mime_type: "video/mp4",
  } as MockReelRow,
  current: {
    modifiedTime: "2026-05-01T00:00:00.000Z",
    headRevisionId: "reel-rev-1",
    md5Checksum: "",
    trashed: false,
    size: "100",
  } as {
    modifiedTime: string;
    headRevisionId: string;
    md5Checksum: string;
    trashed: boolean;
    size: string | null;
  },
  revisionBytes: new TextEncoder().encode("reel-bytes") as Uint8Array | null,
  revisionError: null as unknown,
  fallbackBytes: new TextEncoder().encode("reel-bytes") as Uint8Array,
  driveCalls: [] as string[],
  supabaseError: null as unknown,
  lastDriveArgs: null as null | {
    fileId: string;
    fields?: string;
    alt?: string;
    supportsAllDrives?: boolean;
  },
  lastRevisionsOptions: null as null | {
    responseType: "stream";
    headers?: Record<string, string>;
  },
  // When set, overrides the synthetic 206 Content-Range total — used
  // to simulate Drive returning a 206 whose total size exceeds
  // MAX_REEL_FALLBACK_BYTES (Codex R22 P1 cap-bypass close-out).
  reel206TotalOverride: null as number | null,
  // Codex R23 P1 controls: simulate misbehaving upstream that omits
  // Content-Range on 206 (omit206ContentRange) or sends the
  // RFC-7233-legal "unknown total" form `bytes 0-9/*` (use206StarTotal)
  // or sends a malformed total (use206MalformedTotal).
  omit206ContentRange: false as boolean,
  use206StarTotal: false as boolean,
  use206MalformedTotal: false as boolean,
  // When true, the 206 media response omits the `content-length` header
  // so the route must derive the slice length from the verified
  // Content-Range (adversarial R3 — agenda-route parity).
  omit206ContentLength: false as boolean,
  // Adversarial R3: when true, the 206 media response reports the FULL
  // FILE size (the Content-Range total) as Content-Length instead of the
  // slice length (10 for bytes 0-9). The route must fail closed on the
  // inconsistent pair, never forward it.
  use206FullFileContentLength: false as boolean,
}));

function md5(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

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
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            routeMock.supabaseError
              ? { data: null, error: routeMock.supabaseError }
              : { data: routeMock.show, error: null },
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/drive/client", () => ({
  getDriveClient: () => ({
    files: {
      get: async (args: {
        fileId: string;
        fields?: string;
        alt?: string;
        supportsAllDrives?: boolean;
      }) => {
        routeMock.driveCalls.push(args.alt === "media" ? "files.media" : "files.metadata");
        routeMock.lastDriveArgs = args;
        if (args.alt === "media") return { data: routeMock.fallbackBytes };
        return { data: routeMock.current };
      },
    },
    revisions: {
      get: async (
        _args: {
          fileId: string;
          revisionId: string;
          alt: "media";
          supportsAllDrives?: boolean;
        },
        options?: { responseType: "stream"; headers?: Record<string, string> },
      ) => {
        routeMock.driveCalls.push("revisions.media");
        routeMock.lastRevisionsOptions = options ?? null;
        if (routeMock.revisionError) throw routeMock.revisionError;
        // Mimic Drive's behavior: if Range header is present, return 206
        // with synthetic Content-Range; otherwise full 200.
        if (options?.headers?.Range) {
          const total =
            routeMock.reel206TotalOverride !== null
              ? routeMock.reel206TotalOverride
              : (routeMock.revisionBytes?.byteLength ?? 0);
          const headers: Record<string, string> = {};
          if (!routeMock.omit206ContentLength) {
            // The synthetic Content-Range is always `bytes 0-9/...` — a
            // 10-byte slice. A consistent upstream reports the SLICE
            // length on a 206; use206FullFileContentLength reproduces the
            // inconsistent full-file pair (adversarial R3).
            headers["content-length"] = routeMock.use206FullFileContentLength
              ? String(total)
              : "10";
          }
          if (!routeMock.omit206ContentRange) {
            if (routeMock.use206StarTotal) {
              headers["content-range"] = `bytes 0-9/*`;
            } else if (routeMock.use206MalformedTotal) {
              headers["content-range"] = `bytes 0-9/not-a-number`;
            } else {
              headers["content-range"] = `bytes 0-9/${total}`;
            }
          }
          // Gaxios 7.x (googleapis dep) returns `response.headers` as a
          // WHATWG `Headers` instance, NOT a plain object. The mock
          // mirrors the live shape so plain index access on headers can
          // never regress silently again (live-reproduced agenda-route
          // bug, 2026-06-12; reel route shared the same class).
          return { data: routeMock.revisionBytes, status: 206, headers: new Headers(headers) };
        }
        return { data: routeMock.revisionBytes, status: 200 };
      },
    },
  }),
}));

async function getReel(init?: { headers?: Record<string, string> }): Promise<Response> {
  const { GET } = await import("@/app/api/asset/reel/[show]/route");
  const url = `https://crew.fxav.test/api/asset/reel/${showId}`;
  const req = init?.headers
    ? new NextRequest(url, { headers: init.headers })
    : new NextRequest(url);
  return await GET(req, { params: Promise.resolve({ show: showId }) });
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
  routeMock.show = {
    published: true,
    opening_reel_drive_file_id: "reel-file-1",
    opening_reel_drive_modified_time: "2026-05-01T00:00:00.000Z",
    opening_reel_head_revision_id: "reel-rev-1",
    opening_reel_mime_type: "video/mp4",
  };
  routeMock.current = {
    modifiedTime: "2026-05-01T00:00:00.000Z",
    headRevisionId: "reel-rev-1",
    md5Checksum: md5(new TextEncoder().encode("reel-bytes")),
    trashed: false,
    size: "10",
  };
  routeMock.revisionBytes = new TextEncoder().encode("reel-bytes");
  routeMock.revisionError = null;
  routeMock.fallbackBytes = new TextEncoder().encode("reel-bytes");
  routeMock.driveCalls = [];
  routeMock.supabaseError = null;
  routeMock.linkCalls = 0;
  routeMock.googleCalls = 0;
  routeMock.peek = { kind: "none" };
  routeMock.lastDriveArgs = null;
  routeMock.lastRevisionsOptions = null;
  routeMock.reel206TotalOverride = null;
  routeMock.omit206ContentRange = false;
  routeMock.use206StarTotal = false;
  routeMock.use206MalformedTotal = false;
  routeMock.omit206ContentLength = false;
  routeMock.use206FullFileContentLength = false;
});

async function headReel(init?: { headers?: Record<string, string> }): Promise<Response> {
  const { HEAD } = await import("@/app/api/asset/reel/[show]/route");
  const url = `https://crew.fxav.test/api/asset/reel/${showId}`;
  const req = init?.headers
    ? new NextRequest(url, { headers: init.headers })
    : new NextRequest(url);
  return await HEAD(req, { params: Promise.resolve({ show: showId }) });
}

describe("/api/asset/reel/[show]", () => {
  test("rejects unauthenticated requests before Drive metadata", async () => {
    routeMock.link = { kind: "continue" };

    const response = await getReel();

    expect(response.status).toBe(401);
    expect(routeMock.driveCalls).toEqual([]);
  });

  test("returns 410 for null or non-video pin tuples with private revalidation", async () => {
    routeMock.show = { ...routeMock.show, opening_reel_head_revision_id: null };
    const missing = await getReel();
    expect(missing.status).toBe(410);
    expect(missing.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");

    routeMock.show = {
      ...routeMock.show,
      opening_reel_head_revision_id: "reel-rev-1",
      opening_reel_mime_type: "application/pdf",
    };
    expect((await getReel()).status).toBe(410);
  });

  test("streams exact revision bytes when live Drive metadata matches the pin tuple", async () => {
    const response = await getReel();

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("reel-bytes");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(routeMock.driveCalls).toEqual(["files.metadata", "revisions.media"]);
  });

  test("returns 410 when live Drive metadata drifts before streaming", async () => {
    routeMock.current = { ...routeMock.current, headRevisionId: "newer-rev" };

    const response = await getReel();

    expect(response.status).toBe(410);
    expect(routeMock.driveCalls).toEqual(["files.metadata"]);
  });

  test("fallback buffers alt-media bytes and rejects md5 drift before serving", async () => {
    routeMock.revisionError = { code: 404 };
    routeMock.fallbackBytes = new TextEncoder().encode("mutated-bytes");

    const drifted = await getReel();

    expect(drifted.status).toBe(410);
    expect(routeMock.driveCalls).toEqual(["files.metadata", "revisions.media", "files.media"]);
  });

  test("Codex R1 P1 class-sweep: non-admin viewer on unpublished show → 410 (no Drive call)", async () => {
    routeMock.show = { ...routeMock.show, published: false };
    const res = await getReel();
    await expectPickerShowUnavailable(res);
    expect(routeMock.driveCalls).toEqual([]);
  });

  test("Codex R1 P1 class-sweep: admin viewer on unpublished show → 200 (admin sees drafts)", async () => {
    routeMock.admin = { ok: true } as never;
    routeMock.link = { kind: "continue" };
    routeMock.show = { ...routeMock.show, published: false };
    const res = await getReel();
    expect(res.status).toBe(200);
  });

  test("Codex R2 P1: Supabase returned-error surfaces as 500 (not benign 410)", async () => {
    routeMock.supabaseError = { code: "PGRST500", message: "infra fault" };
    const res = await getReel();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("REEL_ASSET_LOOKUP_FAILED");
    expect(routeMock.driveCalls).toEqual([]);
  });

  test("Codex R2 P1: oversized Drive `size` pre-flight → 410 (no media call)", async () => {
    routeMock.current = {
      ...routeMock.current,
      size: String(513 * 1024 * 1024),
    };
    const res = await getReel();
    expect(res.status).toBe(410);
    expect(routeMock.driveCalls).toEqual(["files.metadata"]);
  });

  test("Codex R2 P1: undefined/non-numeric `size` falls through to stream gate", async () => {
    routeMock.current = { ...routeMock.current, size: null };
    const res = await getReel();
    // Stream is bounded by boundedWebStreamFromNode + cap; a small body still flows.
    expect(res.status).toBe(200);
  });

  test("Codex R5 P1 + R10 P1: cross-show cookie envelope → 403 WITHOUT calling destructive picker asset resolver", async () => {
    // Cross-show peek skips destructive link validator. Route still
    // attempts Google fallthrough (R10 P1); when Google also fails,
    // final response is 403.
    routeMock.peek = { kind: "envelope", showId: "other-show-id" };
    const res = await getReel();
    expect(res.status).toBe(403);
    expect(routeMock.linkCalls).toBe(0);
  });

  test("Codex R7 P1: modtime equality is instant-based (Postgres `+00:00` vs Drive `.000Z` both pass)", async () => {
    // Postgres `timestamptz` normalizes to ISO-with-offset (e.g.,
    // `2026-05-01T00:00:00+00:00`) while Drive returns `.000Z`. Both
    // represent the same instant. The route MUST treat them as
    // identical, not 410-drift.
    routeMock.show = {
      ...routeMock.show,
      opening_reel_drive_modified_time: "2026-05-01T00:00:00+00:00",
    };
    routeMock.current = {
      ...routeMock.current,
      modifiedTime: "2026-05-01T00:00:00.000Z",
    };
    const res = await getReel();
    expect(res.status).toBe(200);
  });

  test("Codex R7 P1: modtime drift still trips on a genuinely different instant", async () => {
    routeMock.show = {
      ...routeMock.show,
      opening_reel_drive_modified_time: "2026-05-01T00:00:00+00:00",
    };
    routeMock.current = {
      ...routeMock.current,
      modifiedTime: "2026-05-02T00:00:00.000Z", // 24h later — real drift
    };
    const res = await getReel();
    expect(res.status).toBe(410);
  });

  test("Codex R14 P1: metadata + media calls include supportsAllDrives: true (Shared Drive compat)", async () => {
    await getReel();
    expect(routeMock.lastDriveArgs?.supportsAllDrives).toBe(true);
  });

  test("Codex R14 P1: success response advertises Accept-Ranges: bytes", async () => {
    const res = await getReel();
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("Codex R14 P1: Range request forwards to Drive and returns 206 with Content-Range", async () => {
    const res = await getReel({ headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(206);
    expect(routeMock.lastRevisionsOptions?.headers?.Range).toBe("bytes=0-9");
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-9\//);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("gaxios 7.x regression: 206 whose headers are a WHATWG Headers instance forwards Content-Range/Content-Length (was 410 on every valid slice)", async () => {
    // Same class as the live-reproduced agenda bug: plain index access on
    // a Headers instance read null, so the R22/R23 fail-closed total-size
    // guard 410'd every valid Range slice. The mock above now returns
    // `new Headers(...)`; this test pins the end-to-end contract.
    // Content-Length is the SLICE length (10 for bytes 0-9), never the
    // full file size (adversarial R3).
    const res = await getReel({ headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-9\/\d+$/);
    expect(res.headers.get("content-length")).toBe("10");
  });

  test("adversarial R3: 206 whose upstream Content-Length disagrees with the Content-Range slice → fail-closed 410", async () => {
    // Upstream says `Content-Range: bytes 0-9/22` (a 10-byte slice) but
    // `Content-Length: 22` (the full file). Forwarding the pair verbatim
    // hands the video client an impossible contract. Fail closed.
    routeMock.reel206TotalOverride = 22; // under cap → bytes 0-9/22
    routeMock.use206FullFileContentLength = true; // Content-Length: 22
    const res = await getReel({ headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(410);
  });

  test("adversarial R3: 206 without upstream Content-Length derives the slice length from the verified Content-Range", async () => {
    routeMock.omit206ContentLength = true;
    const res = await getReel({ headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-length")).toBe("10");
  });

  test("Codex R19 P1: Drive metadata 404 → 410 (drift contract — not REEL_ASSET_LOOKUP_FAILED 500)", async () => {
    // Reel pinned to a now-deleted Drive file. Metadata `files.get`
    // throws { code: 404 }. Per AC-7.24's single-410 drift contract,
    // the route MUST surface 410, NOT 500.
    routeMock.show = { ...routeMock.show };
    // Override the drive client to throw on the metadata files.get.
    // The mock's `get` handler doesn't currently throw — we override
    // by setting `current` to a value AND mutating revisionError isn't
    // enough. Use a vi.doMock-style override: hook the drive client.
    const originalCurrent = routeMock.current;
    const driveCallsBefore = routeMock.driveCalls.length;
    const { GET } = await import("@/app/api/asset/reel/[show]/route");
    // Replace the drive client mock for this test by temporarily
    // routing files.get(metadata) to throw 404. Since the existing
    // mock doesn't expose a per-call hook, we simulate by setting an
    // empty `current` that makes drifted() trip — but that's not the
    // same code path. Instead, lean on the route's existing outer
    // catch by having the metadata fetch reject. We attach a getter
    // that throws when accessed.
    Object.defineProperty(routeMock, "current", {
      get() {
        const err: unknown = Object.assign(new Error("not found"), { code: 404 });
        throw err;
      },
      configurable: true,
    });
    try {
      const res = await GET(new NextRequest(`https://crew.fxav.test/api/asset/reel/${showId}`), {
        params: Promise.resolve({ show: showId }),
      });
      expect(res.status).toBe(410);
      // The metadata path WAS attempted (counted), then the error
      // surfaced from the route — not the fallback flow.
      expect(routeMock.driveCalls.length).toBeGreaterThan(driveCallsBefore);
    } finally {
      Object.defineProperty(routeMock, "current", {
        value: originalCurrent,
        writable: true,
        configurable: true,
      });
    }
  });

  test("Codex R22 P1: 206 response gates on TOTAL size from Content-Range (cap bypass closed)", async () => {
    // Drive metadata `size` is finite and under cap, but the 206
    // Content-Range claims a 600MB total — over the 512MB
    // MAX_REEL_FALLBACK_BYTES cap. The route MUST 410 instead of
    // forwarding the slice.
    routeMock.current = { ...routeMock.current, size: "10" };
    routeMock.reel206TotalOverride = 600 * 1024 * 1024;
    const res = await getReel({ headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(410);
  });

  test("Codex R18 P1: pre-flight unsatisfiable Range (bytes=-0 with finite size) → 416 (no Drive call)", async () => {
    routeMock.current = { ...routeMock.current, size: "10" };
    const res = await getReel({ headers: { Range: "bytes=-0" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */10");
    // Only metadata fetched; revisions.media MUST NOT fire.
    expect(routeMock.driveCalls).toEqual(["files.metadata"]);
  });

  test("Codex R18 P1: Drive 416 thrown from revisions.get → 416 response (not 500)", async () => {
    routeMock.current = { ...routeMock.current, size: "10" };
    routeMock.revisionError = { code: 416 };
    const res = await getReel({ headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("Codex R17 P1: suffix Range (bytes=-N) forwards verbatim to Drive revisions.get", async () => {
    const res = await getReel({ headers: { Range: "bytes=-4" } });
    expect(res.status).toBe(206);
    expect(routeMock.lastRevisionsOptions?.headers?.Range).toBe("bytes=-4");
  });

  test("Codex R17 P1: suffix Range honored on the md5-verified fallback path too", async () => {
    routeMock.fallbackBytes = new TextEncoder().encode("reel-bytes"); // length 10
    routeMock.current = {
      ...routeMock.current,
      md5Checksum: md5(routeMock.fallbackBytes),
    };
    routeMock.revisionError = { code: 404 };
    const res = await getReel({ headers: { Range: "bytes=-3" } });
    // last 3 bytes of "reel-bytes" → "tes" — start=7, end=9, len=3.
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 7-9/10");
    expect(res.headers.get("content-length")).toBe("3");
  });

  test("Codex R14 P1: malformed/multi-range request → 416 (no Drive call)", async () => {
    const res = await getReel({ headers: { Range: "bytes=0-10, 20-30" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("Codex R15 P1: Range request that loses Pattern A → 206 from md5-verified fallback", async () => {
    // 10-byte body so `bytes=0-9` slices the whole thing.
    routeMock.fallbackBytes = new TextEncoder().encode("reel-bytes"); // length 10
    routeMock.current = {
      ...routeMock.current,
      md5Checksum: md5(routeMock.fallbackBytes),
    };
    routeMock.revisionError = { code: 404 };
    const res = await getReel({ headers: { Range: "bytes=0-4" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-4\/10$/);
    expect(res.headers.get("content-length")).toBe("5");
    expect(routeMock.driveCalls).toEqual(["files.metadata", "revisions.media", "files.media"]);
  });

  test("Codex R15 P1: Range request beyond body via fallback → 416 (no body slice)", async () => {
    routeMock.fallbackBytes = new TextEncoder().encode("reel-bytes");
    routeMock.current = {
      ...routeMock.current,
      md5Checksum: md5(routeMock.fallbackBytes),
    };
    routeMock.revisionError = { code: 404 };
    const res = await getReel({ headers: { Range: "bytes=100-200" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */10");
  });

  test("Codex R8 P1: non-allowlisted video MIME → 410 (no fallback to broad prefix gate)", async () => {
    routeMock.show = { ...routeMock.show, opening_reel_mime_type: "video/x-flv" };
    const res = await getReel();
    expect(res.status).toBe(410);
    expect(routeMock.driveCalls).toEqual([]);
  });

  test("Codex R8 P1: fallback md5 branch response carries nosniff", async () => {
    routeMock.revisionError = { code: 404 };
    routeMock.fallbackBytes = new TextEncoder().encode("reel-bytes");
    const res = await getReel();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("Codex R6 P1: exact-revision branch rejects an oversized buffered Uint8Array via the byte ceiling", async () => {
    // Drive size pre-flight is null so we pass the metadata gate, then
    // the revision branch hands back a buffered (non-stream) payload
    // larger than MAX_REEL_FALLBACK_BYTES. The non-stream fallback in
    // `boundedStreamFrom` must throw `ByteLimitExceededError` and the
    // route catch must surface 410, not 200.
    routeMock.current = { ...routeMock.current, size: "10" };
    // 513MB - 1 byte over the 512MB cap. Node 20's mmap-backed
    // Uint8Array allocation is near-instant; pages fault in only when
    // touched, and the route never reads the contents.
    routeMock.revisionBytes = new Uint8Array(513 * 1024 * 1024);
    const res = await getReel();
    expect(res.status).toBe(410);
  });

  // ───────────────────────────────────────────────────────────────
  // Codex R23 — RFC 7233 / 9110 / 9111 comprehensive sweep
  // ───────────────────────────────────────────────────────────────

  test("Codex R23 P1: 206 with `bytes 0-9/*` total → fail-closed 410", async () => {
    routeMock.current = { ...routeMock.current, size: "10" };
    routeMock.use206StarTotal = true;
    const res = await getReel({ headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(410);
  });

  test("Codex R23 P1: 206 without any Content-Range header → fail-closed 410", async () => {
    routeMock.current = { ...routeMock.current, size: "10" };
    routeMock.omit206ContentRange = true;
    const res = await getReel({ headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(410);
  });

  test("Codex R23 P1: 206 with malformed (non-numeric) total → fail-closed 410", async () => {
    routeMock.current = { ...routeMock.current, size: "10" };
    routeMock.use206MalformedTotal = true;
    const res = await getReel({ headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(410);
  });

  test("Codex R23 P2: Vary: Range present on 200 exact-revision success", async () => {
    const res = await getReel();
    expect(res.status).toBe(200);
    expect(res.headers.get("vary")).toBe("Range");
  });

  test("Codex R23 P2: Vary: Range present on 206 exact-revision partial", async () => {
    routeMock.current = { ...routeMock.current, size: "10" };
    const res = await getReel({ headers: { Range: "bytes=0-4" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("vary")).toBe("Range");
  });

  test("Codex R23 P2: Vary: Range present on md5-fallback 200", async () => {
    routeMock.fallbackBytes = new TextEncoder().encode("reel-bytes");
    routeMock.current = {
      ...routeMock.current,
      md5Checksum: md5(routeMock.fallbackBytes),
    };
    routeMock.revisionError = { code: 404 };
    const res = await getReel();
    expect(res.status).toBe(200);
    expect(res.headers.get("vary")).toBe("Range");
  });

  test("Codex R23 P2: Vary: Range present on md5-fallback 206", async () => {
    routeMock.fallbackBytes = new TextEncoder().encode("reel-bytes");
    routeMock.current = {
      ...routeMock.current,
      md5Checksum: md5(routeMock.fallbackBytes),
    };
    routeMock.revisionError = { code: 404 };
    const res = await getReel({ headers: { Range: "bytes=0-4" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("vary")).toBe("Range");
  });

  test("Codex R23 P2: 500 (Supabase returned-error) response carries private Cache-Control", async () => {
    routeMock.supabaseError = { code: "PGRST500", message: "infra fault" };
    const res = await getReel();
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
  });

  test("Codex R23 P2: 401 unauthenticated response carries private Cache-Control", async () => {
    routeMock.link = { kind: "continue" };
    const res = await getReel();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
  });

  test("Codex R23 P2: 403 cross-show response carries private Cache-Control", async () => {
    routeMock.link = {
      kind: "success",
      viewer: { kind: "crew", showId: "other-show", crewMemberId: "crew-1" },
    };
    const res = await getReel();
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
  });

  test("Codex R23 P2: HEAD returns 200 metadata headers without opening revisions.media", async () => {
    routeMock.current = { ...routeMock.current, size: "10" };
    const res = await headReel();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-length")).toBe("10");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("vary")).toBe("Range");
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(0);
    // HEAD must NOT open the revision media stream nor the files.media
    // fallback — only the metadata fetch fires.
    expect(routeMock.driveCalls).toEqual(["files.metadata"]);
  });

  test("Codex R23 P2: HEAD runs same auth chain → 401 when unauthenticated", async () => {
    routeMock.link = { kind: "continue" };
    const res = await headReel();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
    expect(routeMock.driveCalls).toEqual([]);
  });

  test("Codex R23 P2: HEAD on unpublished show → 410 (no Drive call)", async () => {
    routeMock.show = { ...routeMock.show, published: false };
    const res = await headReel();
    expect(res.status).toBe(410);
    expect(routeMock.driveCalls).toEqual([]);
  });

  test("Codex R23 P2: HEAD on drift → 410 (no revisions.media)", async () => {
    routeMock.current = { ...routeMock.current, headRevisionId: "newer-rev" };
    const res = await headReel();
    expect(res.status).toBe(410);
    expect(routeMock.driveCalls).toEqual(["files.metadata"]);
  });

  test("Codex R23 P2: HEAD with malformed Range → 416 (no revisions.media)", async () => {
    const res = await headReel({ headers: { Range: "bytes=0-10, 20-30" } });
    expect(res.status).toBe(416);
    expect(routeMock.driveCalls.includes("revisions.media")).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────
  // Codex R24 P1 — HEAD/GET parity contract pin (RFC 9110 §9.3.2)
  // Every deterministic failure-mode input asserts HEAD == GET.
  // Note: revisions-GC'd → md5-fallback divergence is a flake-class
  // condition (HEAD cannot predict it without an upstream media call),
  // so it is intentionally excluded from this parity pin.
  // ───────────────────────────────────────────────────────────────

  test("Codex R24 P1: HEAD/GET parity — unauthenticated", async () => {
    routeMock.link = { kind: "continue" };
    const head = await headReel();
    routeMock.linkCalls = 0;
    const get = await getReel();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(401);
  });

  test("Codex R24 P1: HEAD/GET parity — cross-show viewer", async () => {
    routeMock.link = {
      kind: "success",
      viewer: { kind: "crew", showId: "other-show", crewMemberId: "crew-1" },
    };
    const head = await headReel();
    const get = await getReel();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(403);
  });

  test("Codex R24 P1: HEAD/GET parity — unpublished show", async () => {
    routeMock.show = { ...routeMock.show, published: false };
    const head = await headReel();
    const get = await getReel();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  test("Codex R24 P1: HEAD/GET parity — non-allowlisted MIME", async () => {
    routeMock.show = { ...routeMock.show, opening_reel_mime_type: "video/x-flv" };
    const head = await headReel();
    const get = await getReel();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  test("Codex R24 P1: HEAD/GET parity — drift (modtime/headRev mismatch)", async () => {
    routeMock.current = { ...routeMock.current, headRevisionId: "newer-rev" };
    const head = await headReel();
    const get = await getReel();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  test("Codex R24 P1: HEAD/GET parity — oversized Drive size pre-flight", async () => {
    routeMock.current = { ...routeMock.current, size: String(513 * 1024 * 1024) };
    const head = await headReel();
    const get = await getReel();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(410);
  });

  test("Codex R24 P1: HEAD/GET parity — Supabase returned-error → 500", async () => {
    routeMock.supabaseError = { code: "PGRST500", message: "infra fault" };
    const head = await headReel();
    const get = await getReel();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(500);
  });

  // Codex R25 P1: HEAD/GET parity for success-path inputs.
  test("Codex R25 P1: HEAD/GET parity — satisfiable explicit Range → both 206", async () => {
    routeMock.current = { ...routeMock.current, size: "10" };
    const head = await headReel({ headers: { Range: "bytes=0-4" } });
    const get = await getReel({ headers: { Range: "bytes=0-4" } });
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(206);
  });

  test("Codex R25 P1: HEAD/GET parity — satisfiable suffix Range → both 206", async () => {
    routeMock.current = { ...routeMock.current, size: "10" };
    const head = await headReel({ headers: { Range: "bytes=-4" } });
    const get = await getReel({ headers: { Range: "bytes=-4" } });
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(206);
  });

  test("Codex R25 P1: HEAD/GET parity — no Range → both 200", async () => {
    const head = await headReel();
    const get = await getReel();
    expect(head.status).toBe(get.status);
    expect(head.status).toBe(200);
  });

  test("Codex R6 P1: HEAD/GET parity — Pattern A unknown Drive size strips Range and returns full 200", async () => {
    routeMock.current = { ...routeMock.current, size: null };
    const range = { Range: "bytes=0-4" };

    const head = await headReel({ headers: range });
    routeMock.driveCalls = [];
    routeMock.lastRevisionsOptions = null;
    const get = await getReel({ headers: range });

    expect(head.status).toBe(get.status);
    expect(get.status).toBe(200);
    expect(head.headers.get("content-range")).toBeNull();
    expect(get.headers.get("content-range")).toBeNull();
    // TS narrows lastRevisionsOptions to `null` after the reset above; widen on read.
    const postGetOptionsA = routeMock.lastRevisionsOptions as {
      responseType: "stream";
      headers?: Record<string, string>;
    } | null;
    expect(postGetOptionsA?.headers).toBeUndefined();
    await expect(get.text()).resolves.toBe("reel-bytes");
  });

  test("Codex R6 P1: HEAD/GET parity — Pattern B fallback unknown Drive size strips Range and returns full 200", async () => {
    routeMock.current = { ...routeMock.current, size: null };
    routeMock.revisionError = { code: 404 };
    routeMock.fallbackBytes = new TextEncoder().encode("reel-bytes");
    routeMock.current = {
      ...routeMock.current,
      md5Checksum: md5(routeMock.fallbackBytes),
    };
    const range = { Range: "bytes=0-4" };

    const head = await headReel({ headers: range });
    routeMock.driveCalls = [];
    routeMock.lastRevisionsOptions = null;
    const get = await getReel({ headers: range });

    expect(head.status).toBe(get.status);
    expect(get.status).toBe(200);
    expect(head.headers.get("content-range")).toBeNull();
    expect(get.headers.get("content-range")).toBeNull();
    const postGetOptionsB = routeMock.lastRevisionsOptions as {
      responseType: "stream";
      headers?: Record<string, string>;
    } | null;
    expect(postGetOptionsB?.headers).toBeUndefined();
    await expect(get.text()).resolves.toBe("reel-bytes");
  });
});
