// @vitest-environment jsdom
//
// Phase 6 T6.9 — changes-feed a11y + reduced-motion contracts. Failure modes:
//  (a) an entry-appearance animation has no prefers-reduced-motion rest state;
//  (b) an action button lacks an accessible name;
//  (c) a status conveyed by color only.
//
// DEFAULT: no entry animation — the feed is a STATIC list (avoids the framer
// SSR-opacity-0 trap, M12.11). This test PINS that no motion was introduced: the
// feed source files contain no framer-motion import. If motion is later added per
// an impeccable request, it must follow the M12.11 gotchas and this guard updates.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ChangesFeed } from "@/components/admin/ChangesFeed";

afterEach(cleanup);

const now = new Date("2026-06-09T12:00:00Z");
const noop = vi.fn();

describe("ChangesFeed a11y", () => {
  it("the feed section is labelled by its heading (aria-labelledby → an h2)", () => {
    const { container } = render(
      <ChangesFeed
        entries={[]}
        truncated={false}
        now={now}
        undoAction={noop}
        approveAction={noop}
        rejectAction={noop}
      />,
    );
    const section = container.querySelector("section");
    expect(section).not.toBeNull();
    const labelId = section!.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const heading = container.querySelector(`#${labelId}`);
    expect(heading?.tagName.toLowerCase()).toBe("h2");
    expect(heading).toHaveTextContent("Changes");
  });

  it("every action button has a non-empty accessible name (Undo + Approve + Reject)", () => {
    render(
      <ChangesFeed
        entries={[
          {
            id: "u1",
            occurredAt: "2026-06-09T11:00:00Z",
            status: "applied",
            action: "undo",
            summary: "Removed Alice",
            entityRef: "Alice",
            changeLogId: "cl-1",
          },
          {
            id: "p1",
            occurredAt: "2026-06-09T10:30:00Z",
            status: "pending",
            action: "approve_reject",
            summary: "Email change for Bob",
            entityRef: "Bob",
            gate: {
              holdId: "h1",
              disposition: { disposition: "email_change", name: "Bob", email: "b@new" },
              baseModifiedTime: "2026-06-09T10:00:00Z",
            },
          },
        ]}
        truncated={false}
        now={now}
        undoAction={noop}
        approveAction={noop}
        rejectAction={noop}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const btn of buttons) {
      // accessible name comes from aria-label or text content — never empty.
      const name = btn.getAttribute("aria-label") ?? btn.textContent ?? "";
      expect(name.trim().length).toBeGreaterThan(0);
    }
    // the Approve/Reject names are disambiguated by the disposition name (WCAG 2.5.3).
    expect(screen.getByRole("button", { name: /approve change for bob/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject change for bob/i })).toBeInTheDocument();
  });

  it("status is conveyed by a text node, never color only (each badge carries a label)", () => {
    render(
      <ChangesFeed
        entries={[
          {
            id: "r1",
            occurredAt: "2026-06-09T11:00:00Z",
            status: "rejected",
            action: "none",
            summary: "Email change rejected",
            entityRef: "Cara",
          },
        ]}
        truncated={false}
        now={now}
        undoAction={noop}
        approveAction={noop}
        rejectAction={noop}
      />,
    );
    const row = screen.getByTestId("change-feed-entry-r1");
    // the status badge renders a real text label (not a bare color swatch).
    expect(within(row).getByText("Rejected")).toBeInTheDocument();
  });

  it("introduces NO framer-motion entry animation (static list — M12.11 SSR trap avoided)", () => {
    const files = [
      "components/admin/ChangesFeed.tsx",
      "components/admin/ChangeFeedEntry.tsx",
      "components/admin/ChangeFeedBadge.tsx",
      "components/admin/ChangeFeedTime.tsx",
      "components/admin/UndoChangeButton.tsx",
      "components/admin/Mi11GateActions.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, `${f} must not import framer-motion (default: static list)`).not.toMatch(
        /from\s+["']framer-motion["']/,
      );
    }
  });
});
