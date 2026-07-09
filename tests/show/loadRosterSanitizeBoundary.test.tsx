// tests/show/loadRosterSanitizeBoundary.test.tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/picker/showPageChainRequest", () => ({ buildShowPageChainRequest: vi.fn(async () => new Request("http://internal/")) }));
vi.mock("@/lib/auth/picker/resolveShowPageAccess", () => ({ resolveShowPageAccess: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }), redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));

import ShowPage from "@/app/show/[slug]/[shareToken]/page";
import { resolveShowPageAccess } from "@/lib/auth/picker/resolveShowPageAccess";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

describe("loadRoster sanitize boundary (no_auth first-contact path)", () => {
  test("raw roster with a sentinel name + duplicate id renders only the sanitized row", async () => {
    (resolveShowPageAccess as any).mockResolvedValue({ kind: "no_auth", reason: "first_contact", showId: "sid" });
    const rawRows = [
      { id: "1", name: "TBD", role: "A1", role_flags: [], claimed_via_oauth_at: null },
      { id: "2", name: "Doug Larson", role: "A1", role_flags: [], claimed_via_oauth_at: null },
      { id: "2", name: "Doug dup", role: "A1", role_flags: [], claimed_via_oauth_at: null },
    ];
    const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: rawRows, error: null }) };
    (createSupabaseServiceRoleClient as any).mockReturnValue({ from: () => q });

    const ui = await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({ gate: "skip" }) });
    const { container } = render(ui);
    const rows = container.querySelectorAll('[data-testid="picker-roster-row"]');
    expect(rows.length).toBe(1); // "TBD" dropped, duplicate id "2" collapsed → one row
    expect(rows[0]?.textContent).toContain("Doug Larson");
  });
});
