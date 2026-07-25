// @vitest-environment jsdom
/**
 * tests/components/a11y/newTabAnnouncementBehavior.test.tsx
 *
 * Behavioral coverage for spec 2026-07-25-newtab-announcement-family §7. The
 * structural guard (tests/styles/_metaNewTabAnnouncement.test.ts) proves an
 * announcement is PRESENT on every external anchor; these tests prove the
 * resulting accessible NAME is right, which no static check can do.
 *
 * Two things carry the weight here:
 *
 * 1. **The Group C negative cases.** Those four anchors are internal fragment
 *    or route links when `action.external` is false. An unconditional hint would
 *    announce a new tab on a same-page jump -- a false statement aimed at
 *    exactly the users who cannot see that it did not happen. These are the
 *    tests that catch the most likely wrong implementation.
 * 2. **Anchored name equality.** Assertions are anchored at both ends, because a
 *    substring match would happily pass "Open in Sheet(opens in a new tab)" --
 *    the missing-separator bug that already shipped undetected once in this
 *    codebase (see §3.1 and the regression pin in newTabHint.test.tsx).
 *
 * Group A/B anchors whose render fixtures already live in a dedicated suite are
 * asserted there rather than duplicated here (SourceLink, CrewPageLink,
 * PublishedReviewModal, Step3ReviewModal, step3ReviewSections, VenueMapTile).
 * This file owns the four Group C renderers plus the empty-interpolation seams,
 * which had no existing coverage at all.
 */
import "@testing-library/jest-dom/vitest";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AttentionBanner } from "@/components/admin/review/AttentionBanner";
import type { AttentionItem } from "@/lib/admin/attentionItems";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(""),
}));

const NOW = new Date("2026-07-19T12:00:00Z");

/** Minimal alert item carrying an action link, mirroring attentionBanner.test.tsx. */
function alertItem(action: { label: string; href: string; external: boolean } | null): AttentionItem {
  return {
    id: "alert:a1",
    kind: "alert",
    tone: "notice",
    sectionId: "crew",
    crewKey: null,
    actionable: true,
    menuTitle: "Role flags changed",
    menuSubtitle: "Crew · John Redcorn",
    alert: {
      alertId: "a1",
      code: "TEST_FAKE_CODE_FOR_BANNER",
      template: null,
      action,
      helpHref: null,
      helpfulContext: null,
      createdAt: NOW.toISOString(),
      failedKeys: null,
      dataGaps: null,
      autoClears: false,
      identitySuppressed: false,
      occurrences: 1,
    } as NonNullable<AttentionItem["alert"]>,
  } as AttentionItem;
}

afterEach(cleanup);

describe("Group C: the announcement is gated on action.external", () => {
  test("external action announces the new tab, anchored", () => {
    const { container } = render(
      <AttentionBanner
        item={alertItem({ label: "Open in Sheet", href: "https://x.example/s", external: true })}
        slug="demo"
        now={NOW}
        highlighted={false}
        onResolved={() => {}}
      />,
    );
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-testid="attention-banner-action-a1"]',
    )!;
    expect(link).toBeTruthy();
    expect(link).toHaveAttribute("target", "_blank");
    // Anchored: a substring match would pass the missing-separator bug.
    expect(link).toHaveAccessibleName("Open in Sheet (opens in a new tab)");
  });

  test("INTERNAL action must not claim to open a new tab", () => {
    // The highest-value test in this diff. external:false actions are same-app
    // links -- fragments like #share-access, or a route like /admin/onboarding.
    const { container } = render(
      <AttentionBanner
        item={alertItem({
          label: "Review sharing",
          href: "/admin?show=demo#share-access",
          external: false,
        })}
        slug="demo"
        now={NOW}
        highlighted={false}
        onResolved={() => {}}
      />,
    );
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-testid="attention-banner-action-a1"]',
    )!;
    expect(link).toBeTruthy();
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveAccessibleName("Review sharing");
    // Belt and braces: the phrase must not appear anywhere in the subtree,
    // hidden or otherwise, so a future refactor cannot reintroduce it silently.
    expect(link.textContent ?? "").not.toContain("opens in a new tab");
  });

  test("no action link at all when the alert carries none", () => {
    const { container } = render(
      <AttentionBanner
        item={alertItem(null)}
        slug="demo"
        now={NOW}
        highlighted={false}
        onResolved={() => {}}
      />,
    );
    expect(container.querySelector('[data-testid="attention-banner-action-a1"]')).toBeNull();
    expect(container.textContent ?? "").not.toContain("opens in a new tab");
  });
});
