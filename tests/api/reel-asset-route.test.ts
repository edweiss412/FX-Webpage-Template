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
  google: { kind: "continue" as const },
  linkCalls: 0,
  googleCalls: 0,
  peek: { kind: "none" } as
    | { kind: "none" }
    | { kind: "envelope"; showId: string },
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
}));

function md5(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

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
      get: async (args: { fileId: string; fields?: string; alt?: string }) => {
        routeMock.driveCalls.push(args.alt === "media" ? "files.media" : "files.metadata");
        if (args.alt === "media") return { data: routeMock.fallbackBytes };
        return { data: routeMock.current };
      },
    },
    revisions: {
      get: async () => {
        routeMock.driveCalls.push("revisions.media");
        if (routeMock.revisionError) throw routeMock.revisionError;
        return { data: routeMock.revisionBytes };
      },
    },
  }),
}));

async function getReel(): Promise<Response> {
  const { GET } = await import("@/app/api/asset/reel/[show]/route");
  return await GET(new NextRequest(`https://crew.fxav.test/api/asset/reel/${showId}`), {
    params: Promise.resolve({ show: showId }),
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
});

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
    expect(res.status).toBe(410);
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

  test("Codex R5 P1: cross-show cookie envelope → 403 WITHOUT calling destructive validateLinkSession", async () => {
    routeMock.peek = { kind: "envelope", showId: "other-show-id" };
    const res = await getReel();
    expect(res.status).toBe(403);
    expect(routeMock.linkCalls).toBe(0);
    expect(routeMock.googleCalls).toBe(0);
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
    routeMock.current = { ...routeMock.current, size: null };
    // 513MB - 1 byte over the 512MB cap. Node 20's mmap-backed
    // Uint8Array allocation is near-instant; pages fault in only when
    // touched, and the route never reads the contents.
    routeMock.revisionBytes = new Uint8Array(513 * 1024 * 1024);
    const res = await getReel();
    expect(res.status).toBe(410);
  });
});
