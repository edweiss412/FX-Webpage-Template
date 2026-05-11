import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const showId = "11111111-1111-4111-8111-111111111111";

type MockReelRow = {
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
  },
  revisionBytes: new TextEncoder().encode("reel-bytes") as Uint8Array | null,
  revisionError: null as unknown,
  fallbackBytes: new TextEncoder().encode("reel-bytes") as Uint8Array,
  driveCalls: [] as string[],
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
          maybeSingle: async () => ({ data: routeMock.show, error: null }),
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
  };
  routeMock.revisionBytes = new TextEncoder().encode("reel-bytes");
  routeMock.revisionError = null;
  routeMock.fallbackBytes = new TextEncoder().encode("reel-bytes");
  routeMock.driveCalls = [];
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
});
