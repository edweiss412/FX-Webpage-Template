// @vitest-environment jsdom
//
// Phase 6 T6.1 — ChangeFeedBadge maps the canonical ChangeStatus to a visible
// text label (never color-only — DESIGN §a11y / invariant 5 no-raw-status-string).
// Failure mode it catches: a status maps to the wrong color token / missing
// accessible text, so a "rejected" row reads as "applied".
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ChangeFeedBadge } from "@/components/admin/ChangeFeedBadge";

afterEach(cleanup);

describe("ChangeFeedBadge", () => {
  it.each([
    ["applied", "Applied"],
    ["pending", "Pending review"],
    ["rejected", "Rejected"],
    ["undone", "Undone"],
    // PF21: 'superseded' is the canonical 5th ChangeStatus — a newer change
    // replaced this entry. Muted, action-less.
    ["superseded", "Superseded"],
  ] as const)("renders %s with visible text label", (status, label) => {
    render(<ChangeFeedBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("never relies on color alone (each badge has a text node, not just a dot)", () => {
    const { container } = render(<ChangeFeedBadge status="rejected" />);
    // a11y: textContent must carry the meaning, not an aria-hidden dot
    expect(container.textContent?.trim()).toBe("Rejected");
  });

  it("renders the superseded badge with a muted label (PF21)", () => {
    render(<ChangeFeedBadge status="superseded" />);
    // copy is a stable UI label — the raw status string never appears
    expect(screen.getByText("Superseded")).toBeInTheDocument();
    expect(screen.queryByText("superseded")).toBeNull();
  });
});
