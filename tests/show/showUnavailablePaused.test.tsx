// @vitest-environment jsdom
/**
 * Published-toggle spec §3.5 (user decision D5): a crew share-token URL opened while the
 * show is UNPUBLISHED (valid slug+token, published=false, not archived) renders a minimal
 * "not available right now" page under HTTP 200 — with ZERO show data (no title, no dates:
 * the component takes no show props at all; that IS the leak-minimization mechanism).
 * Archived and never-resolved links keep the 404 notFound() boundary (existence oracle
 * unchanged for revoked links).
 *
 * Concrete failure modes caught: (a) the unpublished arm regressing to notFound() (the
 * pre-toggle behavior) or to the full crew render; (b) show data leaking onto the paused
 * page; (c) the archived arm accidentally adopting the 200 page.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { messageFor } from "@/lib/messages/lookup";

vi.mock("@/lib/auth/picker/showPageChainRequest", () => ({
  buildShowPageChainRequest: vi.fn(async () => new Request("http://internal/")),
}));
vi.mock("@/lib/auth/picker/resolveShowPageAccess", () => ({
  resolveShowPageAccess: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

afterEach(cleanup);

// Fixture-derived leak probe: the seeded/fixture title string the paused page must NOT
// contain. The page component receives no show data, so ANY title would have to come from
// a data fetch the unpublished arm must never perform.
const FIXTURE_TITLE = "II - Consultants Roundtable 2025";

describe("unpublished crew URL → ShowUnavailable (HTTP 200, zero show data)", () => {
  test("unpublished arm renders the CREW_SHOW_PAUSED copy — no notFound(), no show title", async () => {
    const { resolveShowPageAccess } = await import("@/lib/auth/picker/resolveShowPageAccess");
    const { notFound } = await import("next/navigation");
    vi.mocked(resolveShowPageAccess).mockResolvedValue({ kind: "unpublished" });
    vi.mocked(notFound).mockClear();

    const { default: ShowPage } = await import("@/app/show/[slug]/[shareToken]/page");
    const element = await ShowPage({
      params: Promise.resolve({ slug: "consultants-roundtable", shareToken: "a".repeat(64) }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element as React.ReactElement);

    const expectedCopy = messageFor("CREW_SHOW_PAUSED").crewFacing;
    expect(expectedCopy).toBeTruthy();
    expect(container.textContent).toContain(expectedCopy);
    // Invariant 5: never the raw code. D5: never show data.
    expect(container.textContent).not.toContain("CREW_SHOW_PAUSED");
    expect(container.textContent).not.toContain(FIXTURE_TITLE);
    expect(container.querySelector('[data-testid="crew-show-paused-root"]')).not.toBeNull();
    expect(notFound).not.toHaveBeenCalled();
  });

  test("archived arm still hard-404s (no paused page for archived shows)", async () => {
    const { resolveShowPageAccess } = await import("@/lib/auth/picker/resolveShowPageAccess");
    const { notFound } = await import("next/navigation");
    vi.mocked(resolveShowPageAccess).mockResolvedValue({ kind: "archived" });
    vi.mocked(notFound).mockClear();

    const { default: ShowPage } = await import("@/app/show/[slug]/[shareToken]/page");
    await expect(
      ShowPage({
        params: Promise.resolve({ slug: "consultants-roundtable", shareToken: "a".repeat(64) }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
