import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/admin/venue-map/route";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";

vi.mock("@/lib/auth/requireAdmin", () => {
  class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";
    constructor(m: string) {
      super(m);
      this.name = "AdminInfraError";
    }
  }
  return { AdminInfraError, requireAdminIdentity: vi.fn() };
});

const requireAdminMock = vi.mocked(requireAdminIdentity);
const OLD = { ...process.env };

function req(qs: string): Request {
  return new Request(`http://localhost/api/admin/venue-map${qs}`);
}

beforeEach(() => {
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue({ email: "admin@fxav.test" } as never);
});
afterEach(() => {
  process.env = { ...OLD };
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/admin/venue-map", () => {
  test("AdminInfraError → 503, empty body", async () => {
    requireAdminMock.mockRejectedValue(new AdminInfraError("x"));
    const res = await GET(req("?q=SF"));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(""); // no raw error text (invariant 5)
  });

  test("empty q → 400, empty body", async () => {
    const res = await GET(req("?q=%20"));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("");
  });

  test("no key configured → 404, empty body", async () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "");
    vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "");
    const res = await GET(req("?q=The%20Masonic"));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  test("configured + upstream OK → 200 image/png with private cache", async () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([137, 80, 78, 71]), {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
      ),
    );
    const res = await GET(req("?q=The%20Masonic&theme=dark"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("private");
    // theme threaded into the upstream URL
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(call).toContain("style="); // dark
  });

  test("upstream 500 (after retries) → 502, empty body, no upstream text", async () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("GOOGLE_INTERNAL_BOOM", { status: 500 })),
    );
    const res = await GET(req("?q=X"));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toBe("");
    expect(body).not.toContain("GOOGLE_INTERNAL_BOOM");
  });
});
