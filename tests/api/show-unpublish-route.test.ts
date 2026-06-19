// M12.13 Task 11 — the public route's contract CHANGES (spec §3 R8, §7
// route-contract lockstep): token AND r are required; bare slug+token POSTs
// are rejected with the neutral 404 WITHOUT consuming and WITHOUT a code in
// the body; consumption happens EXCLUSIVELY via the locked wrapper
// `unpublishShowViaEmailedLink` (a pre-check + plain `unpublishShow` would
// leave the check-then-consume race on this leg — R15). CONSUMED never
// returns on any public leg (R19/R20); EXPIRED keeps its catalog-coded shape
// (it is binding-validated — the stored token still exists). Infra faults
// surface as 503 without a code (invariant 9: discriminable, never benign).
//
// The B2-era pins this file used to carry (bare slug+token passthrough at
// :27-35 and the CONSUMED body shape at :37-52) are REPLACED — token+r is the
// single canonical public contract; the old behavior is preserved nowhere.
// Real-DB zero-state-change matrix: tests/api/show-unpublish-route.realdb.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import type { UnpublishShowResult } from "@/lib/sync/unpublishShow";

const routeMock = vi.hoisted(() => ({
  result: { outcome: "success", status: 200, showId: "show-1" } as UnpublishShowResult,
  throws: false,
  calls: [] as Array<{ slug: string; token: string; r: string }>,
  plainCalls: 0,
}));

vi.mock("@/lib/sync/unpublishShow", () => ({
  unpublishShowViaEmailedLink: async (args: { slug: string; token: string; r: string }) => {
    routeMock.calls.push(args);
    if (routeMock.throws) throw new Error("simulated wrapper infra fault");
    return routeMock.result;
  },
  unpublishShow: async () => {
    routeMock.plainCalls += 1;
    throw new Error("STRUCTURAL VIOLATION: public route called plain unpublishShow");
  },
}));

async function post(url: string) {
  const { POST } = await import("@/app/api/show/[slug]/unpublish/route");
  return POST(new NextRequest(url, { method: "POST" }), {
    params: Promise.resolve({ slug: "client-show" }),
  });
}

const BASE = "https://fxav.test/api/show/client-show/unpublish";

beforeEach(() => {
  routeMock.result = { outcome: "success", status: 200, showId: "show-1" };
  routeMock.throws = false;
  routeMock.calls = [];
  routeMock.plainCalls = 0;
});

describe("POST /api/show/[slug]/unpublish — token+r contract (M12.13 R8)", () => {
  test("valid token+r → 200 { ok:true, showId }; consumes via the wrapper with {slug, token, r}", async () => {
    const response = await post(`${BASE}?token=tok-1&r=0123456789abcdef`);
    await expect(response.json()).resolves.toEqual({ ok: true, showId: "show-1" });
    expect(response.status).toBe(200);
    expect(routeMock.calls).toEqual([
      { slug: "client-show", token: "tok-1", r: "0123456789abcdef" },
    ]);
    expect(routeMock.plainCalls).toBe(0);
  });

  test("bare slug+token (no r) → neutral 404, NO code in the body, wrapper NEVER called (no consume)", async () => {
    const response = await post(`${BASE}?token=tok-1`);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(response.status).toBe(404);
    expect(routeMock.calls).toEqual([]);
  });

  test("missing token (r alone) and empty-string params → neutral 404, wrapper NEVER called", async () => {
    for (const qs of ["?r=0123456789abcdef", "?token=&r=0123456789abcdef", "?token=tok-1&r=", ""]) {
      const response = await post(`${BASE}${qs}`);
      await expect(response.json()).resolves.toEqual({ ok: false });
      expect(response.status).toBe(404);
    }
    expect(routeMock.calls).toEqual([]);
  });

  test("not_found outcome (covers invalid-r, unknown slug, and post-consumption token+old-r) → neutral 404, NO code", async () => {
    routeMock.result = { outcome: "not_found", status: 404 };
    const response = await post(`${BASE}?token=tok-1&r=0123456789abcdef`);
    const body = await response.json();
    expect(body).toEqual({ ok: false });
    expect(Object.keys(body)).toEqual(["ok"]);
    expect(response.status).toBe(404);
  });

  test("consumed outcome → neutral 404 WITHOUT the code (R20: CONSUMED never returns on a public leg)", async () => {
    routeMock.result = {
      outcome: "consumed",
      status: 400,
      code: "UNPUBLISH_TOKEN_CONSUMED",
      showId: "show-1",
    };
    const response = await post(`${BASE}?token=tok-1&r=0123456789abcdef`);
    const body = await response.json();
    expect(body).toEqual({ ok: false });
    expect(JSON.stringify(body)).not.toContain("UNPUBLISH_TOKEN_CONSUMED");
    expect(response.status).toBe(404);
  });

  test("expired outcome (binding-validated) → 400 { ok:false, code: UNPUBLISH_TOKEN_EXPIRED }", async () => {
    routeMock.result = {
      outcome: "expired",
      status: 400,
      code: "UNPUBLISH_TOKEN_EXPIRED",
      showId: "show-1",
    };
    const response = await post(`${BASE}?token=tok-1&r=0123456789abcdef`);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "UNPUBLISH_TOKEN_EXPIRED",
    });
    expect(response.status).toBe(400);
  });

  test("wrapper THROWN infra fault → 503 { ok:false } with NO code (discriminable from the neutral 404)", async () => {
    routeMock.throws = true;
    const response = await post(`${BASE}?token=tok-1&r=0123456789abcdef`);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(response.status).toBe(503);
  });

  test("STRUCTURAL: the route source consumes only via unpublishShowViaEmailedLink, never plain unpublishShow", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/show/[slug]/unpublish/route.ts"),
      "utf8",
    );
    expect(source).toMatch(/unpublishShowViaEmailedLink\(/);
    expect(source).not.toMatch(/\bunpublishShow\(/);
  });
});
