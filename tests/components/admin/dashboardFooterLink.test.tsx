// @vitest-environment jsdom
// Phase 2 (nav-perf) Workstream C2 — DashboardFooter "Take the tour" affordance
// must be a next/link <Link> (client soft-nav) rather than a bare <a> (which is a
// full document reload that re-runs the force-dynamic /help layout). The visible
// single text run "Take the tour →", aria-label, and data-testid are preserved
// (byte-stable screenshot rationale, DashboardFooter.tsx:31-34).
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// Mark every next/link <Link> with a marker attr so the test can prove the
// affordance came from next/link — a bare <a> would NOT carry the marker.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: ReactNode }) => (
    <a data-mocked-next-link="true" href={typeof href === "string" ? href : String(href)} {...rest}>
      {children}
    </a>
  ),
}));

import { DashboardFooter } from "@/components/admin/DashboardFooter";

afterEach(cleanup);

describe("DashboardFooter — Take the tour (Phase 2 C2)", () => {
  it("renders the tour affordance via next/link (client nav, not a full-reload anchor)", () => {
    const { getByTestId } = render(<DashboardFooter />);
    const el = getByTestId("help-affordance--dashboard-footer--tour");
    expect(el.tagName).toBe("A");
    // proves it came from next/link (the mock marks it); a bare <a> would not.
    expect(el).toHaveAttribute("data-mocked-next-link", "true");
    expect(el).toHaveAttribute("href", "/help/tour");
    expect(el).toHaveAttribute("aria-label", "Take the tour");
    // single text run preserved — no split (flex would drop the space + shift paint).
    expect(el.textContent).toBe("Take the tour →");
  });
});
