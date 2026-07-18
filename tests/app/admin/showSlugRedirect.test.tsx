/**
 * tests/app/admin/showSlugRedirect.test.tsx (admin-show-modal Task 9, spec §3)
 *
 * `/admin/show/[slug]` is a pure legacy redirect to the canonical modal URL
 * `/admin?show=<slug>`. Contract pinned here:
 *   • awaits requireAdmin() BEFORE redirect() (auth-chain registry row for this
 *     path — lib/audit/trustDomains.ts — stays true unchanged);
 *   • target is /admin?show=<enc(slug)>;
 *   • incoming searchParams (alert_id, the inert `review` param) are
 *     re-appended, FIRST value only for repeated keys;
 *   • an incoming `show` param is DROPPED (the path slug wins);
 *   • fragment passthrough is browser behavior — not server-visible, no test.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const redirectMock = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

const requireAdminMock = vi.fn(async () => ({ email: "admin@example.com" }));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: () => requireAdminMock(),
}));

async function loadPage() {
  const mod = await import("@/app/admin/show/[slug]/page");
  return mod.default;
}

function call(slug: string, searchParams?: Record<string, string | string[]>): Promise<unknown> {
  return loadPage().then((Page) =>
    Page({
      params: Promise.resolve({ slug }),
      ...(searchParams ? { searchParams: Promise.resolve(searchParams) } : {}),
    }),
  );
}

beforeEach(() => {
  redirectMock.mockClear();
  requireAdminMock.mockClear();
});

describe("/admin/show/[slug] legacy redirect (spec §3)", () => {
  test("redirects to /admin?show=<slug> (no extra params)", async () => {
    await expect(call("rpas-central-2026")).rejects.toThrow(
      "NEXT_REDIRECT:/admin?show=rpas-central-2026",
    );
    expect(redirectMock).toHaveBeenCalledWith("/admin?show=rpas-central-2026");
  });

  test("slug is URL-encoded in the target", async () => {
    const slug = "weird/slug &co";
    const expected = new URLSearchParams({ show: slug }).toString();
    await expect(call(slug)).rejects.toThrow(`NEXT_REDIRECT:/admin?${expected}`);
  });

  test("awaits requireAdmin() before redirect()", async () => {
    await expect(call("some-show")).rejects.toThrow("NEXT_REDIRECT:");
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(requireAdminMock.mock.invocationCallOrder[0]!).toBeLessThan(
      redirectMock.mock.invocationCallOrder[0]!,
    );
  });

  test("requireAdmin rejection propagates and redirect is never called", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("NOT_ADMIN"));
    await expect(call("some-show")).rejects.toThrow("NOT_ADMIN");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test("re-appends incoming alert_id and review params", async () => {
    await expect(call("east-coast", { alert_id: "abc-123", review: "1" })).rejects.toThrow(
      "NEXT_REDIRECT:/admin?show=east-coast&alert_id=abc-123&review=1",
    );
  });

  test("repeated keys keep the FIRST value only", async () => {
    await expect(call("east-coast", { alert_id: ["first-id", "second-id"] })).rejects.toThrow(
      "NEXT_REDIRECT:/admin?show=east-coast&alert_id=first-id",
    );
  });

  test("an incoming `show` param is DROPPED — the path slug wins", async () => {
    await expect(call("path-slug", { show: "query-slug", alert_id: "a1" })).rejects.toThrow(
      "NEXT_REDIRECT:/admin?show=path-slug&alert_id=a1",
    );
    expect(redirectMock).toHaveBeenCalledWith("/admin?show=path-slug&alert_id=a1");
  });

  test("empty-string param values are dropped, empty array tolerated", async () => {
    await expect(call("s1", { alert_id: "", review: [] })).rejects.toThrow(
      "NEXT_REDIRECT:/admin?show=s1",
    );
  });
});
