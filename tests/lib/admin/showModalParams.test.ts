/**
 * tests/lib/admin/showModalParams.test.ts (admin-show-modal spec §3 / D9 — Task 5)
 *
 * Pure param helpers for the `/admin?show=<slug>` review modal. Server-safe by
 * contract: `app/admin/page.tsx` (an RSC) imports `firstParam` directly, so this
 * module must never grow hooks or a "use client" directive.
 *
 * Failure modes caught:
 *   - open href dropping current params (archived-bucket context lost on open);
 *   - a stale `alert_id` surviving into the next modal open (wrong alert
 *     highlighted);
 *   - duplicate `show` params when a modal link is built while one is open;
 *   - an unencoded slug corrupting the query string;
 *   - `firstParam` treating `""` / `[]` as present (§6.2 guard table: absent).
 */
import { describe, expect, it } from "vitest";
import { buildShowModalHref, firstParam } from "@/lib/admin/showModalParams";

describe("buildShowModalHref (D9: preserve all params except show/alert_id)", () => {
  it("appends show to the preserved current params", () => {
    expect(buildShowModalHref("x", new URLSearchParams("bucket=archived"))).toBe(
      "/admin?bucket=archived&show=x",
    );
  });

  it("targets /admin with only show when there are no current params", () => {
    expect(buildShowModalHref("x", new URLSearchParams())).toBe("/admin?show=x");
  });

  it("replaces an existing show param (never duplicates)", () => {
    const href = buildShowModalHref("next-show", new URLSearchParams("show=prev&bucket=archived"));
    const q = new URLSearchParams(href.split("?")[1]);
    expect(q.getAll("show")).toEqual(["next-show"]);
    expect(q.get("bucket")).toBe("archived");
  });

  it("strips alert_id (it addresses one modal instance, not the next open)", () => {
    const href = buildShowModalHref("x", new URLSearchParams("alert_id=al-1&bucket=archived"));
    const q = new URLSearchParams(href.split("?")[1]);
    expect(q.get("alert_id")).toBeNull();
    expect(q.get("bucket")).toBe("archived");
    expect(q.get("show")).toBe("x");
  });

  it("does not mutate the caller's URLSearchParams", () => {
    const current = new URLSearchParams("show=prev&alert_id=al-1");
    buildShowModalHref("x", current);
    expect(current.get("show")).toBe("prev");
    expect(current.get("alert_id")).toBe("al-1");
  });

  it("encodes the slug (round-trips through URLSearchParams parsing)", () => {
    const slug = "café show/2026&more";
    const href = buildShowModalHref(slug, new URLSearchParams());
    // Raw reserved characters must not survive into the query string…
    expect(href).not.toContain(" ");
    expect(href.split("?")[1]).not.toContain("/");
    // …and a standards parse recovers the exact slug.
    expect(new URLSearchParams(href.split("?")[1]).get("show")).toBe(slug);
  });
});

describe("firstParam (§6.2 guard table)", () => {
  it("array → first element wins", () => {
    expect(firstParam(["a", "b"])).toBe("a");
  });

  it("plain value passes through", () => {
    expect(firstParam("v")).toBe("v");
  });

  it("empty string → null (treated as absent)", () => {
    expect(firstParam("")).toBeNull();
  });

  it("undefined → null", () => {
    expect(firstParam(undefined)).toBeNull();
  });

  it("empty array → null", () => {
    expect(firstParam([])).toBeNull();
  });

  it("array whose first element is empty → null (absent, not '')", () => {
    expect(firstParam(["", "b"])).toBeNull();
  });
});
