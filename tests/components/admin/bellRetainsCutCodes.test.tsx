// @vitest-environment jsdom
/**
 * tests/components/admin/bellRetainsCutCodes.test.tsx
 * (plan Task 7; spec §1.1, §11 meta-test 3, §12 test 13)
 *
 * warning-surface-trim §5 cuts SHOW_FIRST_PUBLISHED and ROLE_FLAGS_NOTICE from
 * the SHOW MODAL's attention surface. The bell must still carry both, because
 * that is where the publish receipt and its data-gaps digest belong.
 *
 * Three assertions at three layers, because no one of them is sufficient:
 *
 *   1. the rendered PANEL, so a panel that filters the codes itself with a
 *      predicate importing no forbidden symbol still fails;
 *   2. the bell's OWN exclusion mechanism, `bellExcludedCodes`, which is the
 *      list the feed route passes into `get_bell_feed_rows` as
 *      `p_excluded_codes` — the route's only code-filtering input;
 *   3. a source scan, so no bell module acquires the modal's exclusion set.
 *
 * Stated limit: layer 2 asserts the route's filter INPUT rather than executing
 * the route against a live database. That path needs Supabase and admin auth,
 * which this jsdom suite has no access to; the assertion covers the mechanism
 * the route actually uses to drop codes, and layer 3 covers the class of change
 * that would introduce a second one.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/app/admin/actions", () => ({
  retryWatchSubscriptionFormAction: vi.fn(async () => {}),
}));

import { BellPanel } from "@/components/admin/BellPanel";
import { bellExcludedCodes } from "@/lib/admin/bellAudience";
import { DOUG_EXCLUDED_CODES } from "@/lib/adminAlerts/audience";
import type { BellEntry } from "@/lib/admin/bellFeed";

/** The two codes this change removes from the modal, and only from the modal. */
const CUT_FROM_MODAL = ["SHOW_FIRST_PUBLISHED", "ROLE_FLAGS_NOTICE"] as const;

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function entryFor(code: string, alertId: string): BellEntry {
  return {
    code,
    alertId,
    showId: null,
    slug: null,
    state: "active",
    activityAt: "2026-07-20T10:00:00.000Z",
    resolvedAt: null,
    occurrences: 1,
    unread: false,
    context: null,
    identity: null,
    isAutoResolving: false,
    autoResolveNote: null,
    actions: [],
    messageParams: {},
    isHealth: false,
  } as BellEntry;
}

function feedBody(entries: BellEntry[]) {
  return {
    entries,
    unseenCount: 0,
    truncated: false,
    historyDays: 14,
    feedCap: 50,
    seenThrough: "2026-07-20T10:00:00.000Z",
  };
}

describe("the bell still renders the codes cut from the modal", () => {
  it("renders one bell ENTRY per cut code, located by the id the feed supplied", async () => {
    // Located by entry element and by the fixture's own alertId, not by text
    // anywhere in the panel: the panel could echo a title in non-entry markup
    // while filtering the real entry, and a text assertion would not notice.
    const entries = CUT_FROM_MODAL.map((code, i) => entryFor(code, `cut-${i + 1}`));
    fetchMock.mockResolvedValue(jsonOk(feedBody(entries)));

    // Every required prop supplied: an omitted `onOpened` throws asynchronously
    // AFTER the assertions pass, which vitest reports as an unhandled rejection
    // and a non-zero exit while the Tests line still reads all-green.
    render(<BellPanel viewerIsDeveloper={false} onClose={() => {}} onOpened={() => {}} />);

    for (let i = 0; i < CUT_FROM_MODAL.length; i += 1) {
      const el = await screen.findByTestId(`bell-entry-cut-${i + 1}`);
      expect(el, `bell entry for ${CUT_FROM_MODAL[i]}`).toBeTruthy();
    }
  });
});

describe("the bell's own exclusion mechanism keeps them", () => {
  it("bellExcludedCodes omits both cut codes for every viewer tier", () => {
    // This is the list the feed route passes into get_bell_feed_rows as
    // p_excluded_codes, so it is the route's only code-filtering input.
    for (const developer of [false, true]) {
      const excluded = bellExcludedCodes(developer);
      for (const code of CUT_FROM_MODAL) {
        expect(excluded, `${code} must survive the bell (developer=${developer})`).not.toContain(
          code,
        );
      }
    }
  });

  it("the feed's ONLY code-filter input is that list, not a literal beside it", () => {
    // Whole-diff review B8: asserting `bellExcludedCodes` omits the codes proves
    // nothing if the feed passes something else. `lib/admin/bellFeed.ts:222` is
    // the single RPC call site, and `p_excluded_codes` is its only
    // code-filtering parameter, so pin that the argument IS the helper's result.
    const src = readFileSync(resolve(process.cwd(), "lib/admin/bellFeed.ts"), "utf8");
    const calls = src.match(/p_excluded_codes:\s*([^,\n]+)/g) ?? [];
    // Exactly one, or a second call site could filter differently.
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("bellExcludedCodes(");
    // And neither cut code is named anywhere in the module, which is how a
    // hardcoded addition alongside the helper would look.
    for (const code of CUT_FROM_MODAL) {
      expect(src, `bellFeed must not name ${code}`).not.toContain(code);
    }
  });

  it("the modal's exclusion set and the bell's are genuinely different lists", () => {
    // If they ever became the same list, every assertion above would still pass
    // while the cut silently propagated to the bell.
    for (const code of CUT_FROM_MODAL) {
      expect(DOUG_EXCLUDED_CODES).toContain(code);
      expect(bellExcludedCodes(false)).not.toContain(code);
    }
  });
});

describe("no bell module imports the modal's exclusion", () => {
  it("BellPanel, the feed route, and its builder import neither forbidden symbol", () => {
    const files = [
      "components/admin/BellPanel.tsx",
      "app/api/admin/alerts/bell/feed/route.ts",
      "lib/admin/bellFeed.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src, `${rel} must not import deriveAttentionItems`).not.toContain(
        "deriveAttentionItems",
      );
      expect(src, `${rel} must not import DOUG_EXCLUDED_CODES`).not.toContain(
        "DOUG_EXCLUDED_CODES",
      );
    }
  });
});
