// @vitest-environment jsdom
/**
 * tests/components/admin/dev/galleryWriteGuard.test.tsx
 *
 * The containment guarantee for the gallery (spec §4.4).
 *
 * The cross-model review's P0: §4.4 asserted every action in the subtree posts
 * through a form submit, so one capture-phase preventDefault covered them all.
 * That is FALSE for the control that actually ships — `PerShowAlertResolveButton`
 * is `type="button"` with an onClick that calls `fetch(POST ...)` directly
 * (components/admin/PerShowAlertResolveButton.tsx:59-66). The original test hid
 * this by injecting a synthetic `<form action>` instead of exercising a real
 * imperative write, so it passed against an unguarded surface.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { GalleryWriteGuard } from "@/components/admin/dev/GalleryWriteGuard";

afterEach(cleanup);

describe("GalleryWriteGuard", () => {
  test("blocks an imperative POST that no submit handler would ever see", async () => {
    const real = vi.fn(async () => new Response("{}", { status: 200 }));
    window.fetch = real as unknown as typeof window.fetch;
    render(<GalleryWriteGuard />);
    await waitFor(() => expect(window.fetch).not.toBe(real));

    const res = await window.fetch("/api/admin/show/gallery/alerts/abc/resolve", {
      method: "POST",
    });

    expect(real, "the real fetch must never be reached").not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, code: "GALLERY_DISPLAY_ONLY" });
    // Discoverable rather than silent, and assertable from a real browser.
    expect(document.documentElement.getAttribute("data-gallery-blocked-write")).toContain("POST");
  });

  test("blocks every mutating method, not just POST", async () => {
    const real = vi.fn(async () => new Response("{}", { status: 200 }));
    window.fetch = real as unknown as typeof window.fetch;
    render(<GalleryWriteGuard />);
    await waitFor(() => expect(window.fetch).not.toBe(real));

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await window.fetch("/api/anything", { method });
      expect(res.status, method).toBe(403);
    }
    expect(real).not.toHaveBeenCalled();
  });

  test("reads still pass through, because the surface legitimately fetches to render", async () => {
    const real = vi.fn(async () => new Response("{}", { status: 200 }));
    window.fetch = real as unknown as typeof window.fetch;
    render(<GalleryWriteGuard />);
    await waitFor(() => expect(window.fetch).not.toBe(real));

    await window.fetch("/api/admin/something");
    await window.fetch("/api/admin/something", { method: "HEAD" });
    expect(real).toHaveBeenCalledTimes(2);
  });

  test("a Request object carrying the method is caught, not only an init.method", async () => {
    // The method can live on either argument; reading only `init` would miss this.
    const real = vi.fn(async () => new Response("{}", { status: 200 }));
    window.fetch = real as unknown as typeof window.fetch;
    render(<GalleryWriteGuard />);
    await waitFor(() => expect(window.fetch).not.toBe(real));

    const res = await window.fetch(new Request("http://x.test/api/y", { method: "POST" }));
    expect(res.status).toBe(403);
    expect(real).not.toHaveBeenCalled();
  });

  test("restores the original fetch on unmount, so it cannot leak past the page", async () => {
    const real = vi.fn(async () => new Response("{}", { status: 200 }));
    window.fetch = real as unknown as typeof window.fetch;
    const { unmount } = render(<GalleryWriteGuard />);
    await waitFor(() => expect(window.fetch).not.toBe(real));
    unmount();
    expect(window.fetch).toBe(real);
  });
});
