// @vitest-environment jsdom
/**
 * tests/show/crewLinkNotFound.test.tsx
 *
 * M12 Phase 0.F smoke 6 Part C: a rotated/reset (or wrong) crew share-token
 * URL must render a BRANDED not-found page, while preserving the HTTP 404
 * status (a revoked-link holder must not be able to confirm the show exists —
 * the whole point of M11.5 link rotation). page.tsx already `notFound()`s the
 * `show_unavailable` arm; the new `not-found.tsx` boundary supplies the branded
 * body without changing the status.
 *
 * Two contracts pinned:
 *   1. The not-found boundary renders the cataloged CREW_LINK_UNAVAILABLE
 *      crew-facing copy (routed through messageFor, never the raw code), and
 *      leaks no show title/slug.
 *   2. The `show_unavailable` page arm calls notFound() (→ HTTP 404), NOT a
 *      200 body — i.e. existence is never confirmed for a rotated link.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

describe("branded crew-link not-found boundary", () => {
  test("renders the cataloged CREW_LINK_UNAVAILABLE copy, never the raw code", async () => {
    const { default: NotFound } = await import("@/app/show/[slug]/[shareToken]/not-found");
    const { container } = render(<NotFound />);

    const expectedCopy = messageFor("CREW_LINK_UNAVAILABLE").crewFacing;
    expect(expectedCopy).toBeTruthy();
    expect(container.textContent).toContain(expectedCopy);
    // AGENTS.md invariant 5: never render the raw code.
    expect(container.textContent).not.toContain("CREW_LINK_UNAVAILABLE");
    // Branded surface, not a bare Chrome 404.
    expect(container.querySelector('[data-testid="crew-not-found-root"]')).not.toBeNull();
  });
});

describe("show_unavailable preserves HTTP 404 (no existence leak)", () => {
  beforeEach(async () => {
    const { resolveShowPageAccess } = await import("@/lib/auth/picker/resolveShowPageAccess");
    vi.mocked(resolveShowPageAccess).mockReset();
  });

  test("rotated/unresolved token → notFound(), not a 200 render", async () => {
    const { resolveShowPageAccess } = await import("@/lib/auth/picker/resolveShowPageAccess");
    const { notFound } = await import("next/navigation");
    vi.mocked(resolveShowPageAccess).mockResolvedValue({ kind: "show_unavailable" });

    const { default: ShowPage } = await import("@/app/show/[slug]/[shareToken]/page");

    await expect(
      ShowPage({
        params: Promise.resolve({ slug: "any-show", shareToken: "b".repeat(64) }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
