// @vitest-environment jsdom
/**
 * tests/components/meShowSections.test.tsx
 * (2026-08-07 Step-3 a11y cluster — spec §8 / plan Task 1)
 *
 * Pins the extraction seam the tap-target live-entry harness depends on.
 *
 * `MeShowSections` used to live inside `app/me/page.tsx`, whose module graph
 * constructs `new AsyncLocalStorage()` at module scope
 * (lib/log/requestContext.ts:15) via validateGoogleIdentity. Spec probe P7
 * measured that graph dying under `_step3ReviewModalBundle.mjs`'s empty
 * node-builtin stubs BEFORE React mounts, which is why the seam is an
 * EXTRACTION to app/me/meShowSections.tsx rather than an `export` from the
 * page (spec §1.1 R10, ratified — do not re-propose the export seam).
 *
 * What this test buys that the extraction alone does not: it fails if the new
 * module ever reaches back into a server-only import. jsdom loads the module
 * graph for real, so a re-introduced `next/headers` / `@/lib/log` /
 * `@supabase/ssr` edge fails here instead of surfacing as an opaque
 * browser-bundle death inside the Playwright harness's `beforeAll`.
 *
 * Renders one future + one past show so the `<details data-testid="me-past">`
 * disclosure — the §2.1 site repaired in Task 2 — actually exists: with zero
 * past shows the whole block is unrendered (spec §3) and the harness would
 * measure nothing.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { MeShowSections } from "@/app/me/meShowSections";
import type { CrewShowSummary } from "@/lib/data/listShowsForCrew";

afterEach(cleanup);

/** Fixed reference so the partition is deterministic; see partitionMeShows' `now` contract. */
const NOW = new Date("2026-06-15T12:00:00Z");

const FUTURE_SHOW: CrewShowSummary = {
  id: "show-future",
  slug: "east-coast-tour",
  title: "East Coast Tour",
  dates: { set: "2026-07-01", showDays: ["2026-07-01"] },
  venue: { name: "The Fillmore" },
  shareToken: "tok-future",
};

const PAST_SHOW: CrewShowSummary = {
  id: "show-past",
  slug: "winter-drill",
  title: "Winter Drill",
  dates: { set: "2026-01-10", showDays: ["2026-01-10"] },
  venue: { name: "Riverside Hall" },
  shareToken: "tok-past",
};

describe("MeShowSections extraction seam (spec §8 R10)", () => {
  test("renders from @/app/me/meShowSections in jsdom with no server-only reach", () => {
    render(<MeShowSections shows={[FUTURE_SHOW, PAST_SHOW]} now={NOW} />);

    expect(screen.getByTestId("me-show-sections")).toBeTruthy();
  });

  test("renders the past-shows disclosure the tap-target harness measures", () => {
    render(<MeShowSections shows={[FUTURE_SHOW, PAST_SHOW]} now={NOW} />);

    const summary = screen.getByTestId("me-past-summary");
    // The measured element must be the <summary> itself — spec §2.1's repair
    // and DI-1's rect are both scoped to that tag, not to its <details> parent.
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.closest("details")).toBe(screen.getByTestId("me-past"));
  });
});
