import { describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import type { UnpublishShowResult } from "@/lib/sync/unpublishShow";

const routeMock = vi.hoisted(
  (): { result: UnpublishShowResult; calls: Array<{ slug: string; token: string }> } => ({
    result: { outcome: "success", status: 200, showId: "show-1" },
    calls: [],
  }),
);

vi.mock("@/lib/sync/unpublishShow", () => ({
  unpublishShow: async (args: { slug: string; token: string }) => {
    routeMock.calls.push({ slug: args.slug, token: args.token });
    return routeMock.result;
  },
}));

async function post(url = "https://fxav.test/api/show/client-show/unpublish?token=tok-1") {
  const { POST } = await import("@/app/api/show/[slug]/unpublish/route");
  return POST(new NextRequest(url, { method: "POST" }), {
    params: Promise.resolve({ slug: "client-show" }),
  });
}

describe("POST /api/show/[slug]/unpublish", () => {
  test("passes slug and token to the unpublish service and returns success", async () => {
    routeMock.result = { outcome: "success", status: 200, showId: "show-1" };

    const response = await post();

    await expect(response.json()).resolves.toEqual({ ok: true, showId: "show-1" });
    expect(response.status).toBe(200);
    expect(routeMock.calls).toEqual([{ slug: "client-show", token: "tok-1" }]);
  });

  test("returns catalog code and status for consumed/expired tokens", async () => {
    routeMock.result = {
      outcome: "consumed",
      status: 400,
      code: "UNPUBLISH_TOKEN_CONSUMED",
      showId: "show-1",
    };

    const response = await post();

    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "UNPUBLISH_TOKEN_CONSUMED",
      showId: "show-1",
    });
    expect(response.status).toBe(400);
  });

  test("missing token and not-found results return 404 without raw error code", async () => {
    const missingToken = await post("https://fxav.test/api/show/client-show/unpublish");

    await expect(missingToken.json()).resolves.toEqual({ ok: false });
    expect(missingToken.status).toBe(404);

    routeMock.result = { outcome: "not_found", status: 404 };
    const notFound = await post();

    await expect(notFound.json()).resolves.toEqual({ ok: false });
    expect(notFound.status).toBe(404);
  });
});
