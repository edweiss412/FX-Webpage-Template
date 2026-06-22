import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const SHOW_ID = "018f2f4c-0000-4000-9000-000000000001";
const DIAGRAM_REV = "018f2f4c-0000-4000-9000-000000000003";
const AGENDA_FILE_ID = "drive_file_id_1234567890";
const GOOGLE_SESSION_COOKIE = "sb-access-token=valid-google-session; sb-refresh-token=valid";

const state = vi.hoisted(() => ({
  pickerCalls: [] as Array<{ showId: string; cookie: string | undefined }>,
  assetCalls: [] as Array<{ showId: string; hasPickerCookie: boolean }>,
}));

vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: vi.fn(async () => ({ ok: false, reason: "not_admin" })),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  AdminInfraError: class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";
  },
  requireAdminIdentity: vi.fn(async () => {
    throw new Error("not admin");
  }),
}));

vi.mock("@/lib/auth/picker/resolvePickerSelection", () => ({
  resolvePickerSelection: async (input: { showId: string; cookie: string | undefined }) => {
    state.pickerCalls.push(input);
    return { kind: "no_selection" };
  },
}));

vi.mock("@/lib/auth/picker/validatePickerAssetSession", () => ({
  validatePickerAssetSession: async (request: Request, showId: string) => {
    state.assetCalls.push({
      showId,
      hasPickerCookie: request.headers.get("cookie")?.includes("__Host-fxav_picker") ?? false,
    });
    return { ok: false, response: new Response(null, { status: 401 }) };
  },
}));

vi.mock("@/lib/auth/validateGoogleSession", () => ({
  validateGoogleSession: vi.fn(async () => ({
    kind: "success",
    viewer: {
      kind: "crew",
      showId: SHOW_ID,
      crewMemberId: "018f2f4c-0000-4000-9000-000000000002",
      email: "crew@example.com",
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: SHOW_ID,
                published: true,
                archived: false,
                diagrams: null,
                agenda_links: [],
                role_flags: ["A1"],
              },
              error: null,
            }),
          }),
          maybeSingle: async () => ({
            data: {
              id: SHOW_ID,
              published: true,
              archived: false,
              diagrams: null,
              agenda_links: [],
              role_flags: ["A1"],
            },
            error: null,
          }),
        }),
      }),
    }),
    rpc: vi.fn(async () => ({ data: "version", error: null })),
  }),
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { email: "crew@example.com" } },
        error: null,
      }),
    },
  }),
}));

const { POST: subscriberTokenPost } = await import("@/app/api/realtime/subscriber-token/route");
const { GET: showVersionGet } = await import("@/app/api/show/[slug]/version/route");
const { GET: diagramAssetGet } = await import("@/app/api/asset/diagram/[show]/[rev]/[key]/route");
const { GET: reelAssetGet } = await import("@/app/api/asset/reel/[show]/route");
const { GET: agendaAssetGet } = await import("@/app/api/asset/agenda/[show]/[id]/route");
const { POST: reportPost } = await import("@/app/api/report/route");

function googleSessionRequest(url: string, init?: RequestInit): NextRequest {
  const headers = new Headers(init?.headers);
  headers.set("cookie", GOOGLE_SESSION_COOKIE);
  const requestInit: { headers: Headers; method?: string; body?: BodyInit | null } = { headers };
  if (init?.method !== undefined) requestInit.method = init.method;
  if (init?.body !== undefined) requestInit.body = init.body;
  return new NextRequest(url, requestInit);
}

describe("data APIs reject Google sessions without picker cookies", () => {
  beforeEach(() => {
    state.pickerCalls = [];
    state.assetCalls = [];
  });

  test("realtime subscriber-token returns 401 without a picker cookie", async () => {
    const response = await subscriberTokenPost(
      googleSessionRequest("https://crew.fxav.test/api/realtime/subscriber-token", {
        method: "POST",
        body: JSON.stringify({ slug: "test-show" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(401);
    expect(state.pickerCalls).toEqual([{ showId: SHOW_ID, cookie: undefined }]);
  });

  test("show version returns 401 before viewer_version_token without a picker cookie", async () => {
    const response = await showVersionGet(
      googleSessionRequest("https://crew.fxav.test/api/show/test-show/version"),
      { params: Promise.resolve({ slug: "test-show" }) },
    );

    expect(response.status).toBe(401);
    expect(state.pickerCalls).toEqual([{ showId: SHOW_ID, cookie: undefined }]);
  });

  test("diagram asset returns 401 without a picker cookie", async () => {
    const response = await diagramAssetGet(
      googleSessionRequest(
        `https://crew.fxav.test/api/asset/diagram/${SHOW_ID}/${DIAGRAM_REV}/diagram.png`,
      ),
      { params: Promise.resolve({ show: SHOW_ID, rev: DIAGRAM_REV, key: "diagram.png" }) },
    );

    expect(response.status).toBe(401);
    expect(state.assetCalls).toEqual([{ showId: SHOW_ID, hasPickerCookie: false }]);
  });

  test("reel asset returns 401 without a picker cookie", async () => {
    const response = await reelAssetGet(
      googleSessionRequest(`https://crew.fxav.test/api/asset/reel/${SHOW_ID}`),
      { params: Promise.resolve({ show: SHOW_ID }) },
    );

    expect(response.status).toBe(401);
    expect(state.assetCalls).toEqual([{ showId: SHOW_ID, hasPickerCookie: false }]);
  });

  test("agenda asset returns 401 without a picker cookie", async () => {
    const response = await agendaAssetGet(
      googleSessionRequest(`https://crew.fxav.test/api/asset/agenda/${SHOW_ID}/${AGENDA_FILE_ID}`),
      { params: Promise.resolve({ show: SHOW_ID, id: AGENDA_FILE_ID }) },
    );

    expect(response.status).toBe(401);
    expect(state.assetCalls).toEqual([{ showId: SHOW_ID, hasPickerCookie: false }]);
  });

  test("report route returns 401 without a picker cookie", async () => {
    const response = await reportPost(
      googleSessionRequest("https://crew.fxav.test/api/report", {
        method: "POST",
        body: JSON.stringify({
          idempotency_key: "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
          show_id: SHOW_ID,
          message: "Something looks wrong",
          surface: "crew_footer",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(401);
    expect(state.pickerCalls).toEqual([{ showId: SHOW_ID, cookie: undefined }]);
  });
});
