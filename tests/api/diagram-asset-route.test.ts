import { beforeEach, describe, expect, test, vi } from "vitest";
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
  diagrams: null as unknown,
  storageBytes: new TextEncoder().encode("diagram-bytes") as Uint8Array | null,
  storageError: null as unknown,
  storageDownloads: [] as string[],
  fromCalls: [] as string[],
}));

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
    from(table: string) {
      routeMock.fromCalls.push(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: routeMock.diagrams ? { id: showId, diagrams: routeMock.diagrams } : null,
              error: null,
            }),
          }),
        }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          routeMock.storageDownloads.push(`${bucket}/${path}`);
          if (routeMock.storageError) {
            return { data: null, error: routeMock.storageError };
          }
          if (!routeMock.storageBytes) {
            return { data: null, error: { message: "not found" } };
          }
          return {
            data: new Blob([new TextDecoder().decode(routeMock.storageBytes)], {
              type: "image/png",
            }),
            error: null,
          };
        },
      }),
    },
  }),
}));

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

async function getDiagram(rev = currentRev, key = assetKey): Promise<Response> {
  const { GET } = await import("@/app/api/asset/diagram/[show]/[rev]/[key]/route");
  return await GET(
    new NextRequest(`https://crew.fxav.test/api/asset/diagram/${showId}/${rev}/${key}`),
    {
      params: Promise.resolve({ show: showId, rev, key }),
    },
  );
}

beforeEach(() => {
  vi.resetModules();
  routeMock.admin = { ok: false, reason: "not_admin" };
  routeMock.link = {
    kind: "success",
    viewer: { kind: "crew", showId, crewMemberId: "crew-1" },
  };
  routeMock.google = { kind: "continue" };
  routeMock.diagrams = diagramsWithPending();
  routeMock.storageBytes = new TextEncoder().encode("diagram-bytes");
  routeMock.storageError = null;
  routeMock.storageDownloads = [];
  routeMock.fromCalls = [];
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
    expect(missing.status).toBe(500);
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
});
