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
  validateLinkSession: async () => routeMock.link,
}));

vi.mock("@/lib/auth/validateGoogleSession", () => ({
  validateGoogleSession: async () => routeMock.google,
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
});
