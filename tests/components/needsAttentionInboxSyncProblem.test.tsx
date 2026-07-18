// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(cleanup);
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import type { NeedsAttentionItem } from "@/lib/admin/needsAttention";

const item: NeedsAttentionItem = {
  variant: "sync_problem",
  key: "alert:a1",
  alertId: "a1",
  showId: "s1",
  slug: "east-coast",
  title: "East Coast",
  code: "SHEET_UNAVAILABLE",
  copy: "East Coast isn't in your folder anymore.",
  activityAt: "2026-07-03T10:00:00Z",
};

describe("NeedsAttentionInbox sync_problem card", () => {
  test("deep-links the alert, has a unique aria-label, and shows no resolve button", () => {
    render(
      <NeedsAttentionInbox
        items={[item]}
        totalCount={1}
        renderedCount={1}
        overflowCount={0}
        now={new Date("2026-07-03T11:00:00Z")}
      />,
    );
    const link = screen
      .getByTestId("needs-attention-item-sync-problem-a1")
      .querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/admin?show=east-coast&alert_id=a1");
    expect(link.getAttribute("aria-label")).toBe("Check sync problem for East Coast (east-coast)");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("East Coast isn't in your folder anymore.")).toBeInTheDocument();
  });

  test("two cards for different shows have distinct accessible names (WCAG 2.4.4)", () => {
    const b: NeedsAttentionItem = {
      ...item,
      key: "alert:a2",
      alertId: "a2",
      slug: "rpas",
      title: "RPAS",
    };
    render(
      <NeedsAttentionInbox
        items={[item, b]}
        totalCount={2}
        renderedCount={2}
        overflowCount={0}
        now={new Date()}
      />,
    );
    const names = screen.getAllByRole("link").map((l) => l.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
  });
});
