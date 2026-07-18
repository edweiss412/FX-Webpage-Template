// @vitest-environment jsdom
/**
 * tests/components/admin/review/showReviewSurfaceSyncHash.test.tsx
 * (admin-show-modal spec §6.4 / D7 — Task 3)
 *
 * `syncHash?: boolean` on ShowReviewSurface, default `layout === "page"`. Gates
 * BOTH hash effects: the nav-click `replaceState` and the mount restore. Under
 * `syncHash` the restore gains a fallback: a non-rail fragment resolves via
 * `querySelector('#' + CSS.escape(target))` INSIDE the scroller and
 * `scrollIntoView` (a portal-rendered modal never gets the browser's native
 * anchor scroll). Unknown fragments are a no-op.
 *
 * Failure modes caught:
 *   - the modal default regressing to hash-sync ON (Step3 would mutate the page
 *     URL — the byte-identity contract the wizard suite pins);
 *   - the fallback scrolling via the rail path (or not at all) for a real inner
 *     DOM id like `#share-access`;
 *   - a rail-id fragment bypassing the existing rail scroll path;
 *   - an unknown fragment throwing (CSS.escape/querySelector misuse) or
 *     scrolling anyway.
 *
 * Anti-tautology: the fallback assertion targets the element the FIXTURE
 * renders (`INNER_ANCHOR_ID` on the harness's own node), never a literal the
 * component also hardcodes; `this`-binding of the scrollIntoView mock proves
 * WHICH element scrolled.
 */
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Home } from "lucide-react";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";

// A staged WarningsBreakdown reads useRouter; keep RTL from throwing on the hook.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const SLUG = "sync-hash-show";
const SHOW_ID = "11111111-2222-4333-8444-666666666666";
const DRIVE_FILE_ID = "drive-synchash-1";

// The fixture's own in-scroller anchor: a real inner DOM id (mirrors
// OverviewSection's `#share-access`), defined HERE and asserted against the
// element the harness renders — not a literal duplicated in the component.
const INNER_ANCHOR_ID = "share-access";
// The fixture's rail-participating extra section id (a rail item AND a DOM id,
// so the rail branch's precedence over the querySelector fallback is provable).
const RAIL_EXTRA_ID = "overview";

// jsdom implements neither Element#scrollIntoView nor Element#scrollTo; the
// restore/rail paths guard or call them, so both are observable only via stubs.
const scrollIntoViewMock = vi.fn();
const scrollToMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)),
  );
  // The restore effect defers one frame; run it synchronously so assertions can
  // fire right after render (inside RTL's act).
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // jsdom has no CSS.escape; a spec-faithful stand-in keeps the component's
  // `CSS.escape(target)` call observable (test ids are plain identifiers).
  vi.stubGlobal("CSS", {
    escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`),
  });
  Element.prototype.scrollIntoView = scrollIntoViewMock;
  HTMLElement.prototype.scrollTo = scrollToMock as unknown as typeof HTMLElement.prototype.scrollTo;
});

afterEach(() => {
  cleanup();
  // Reset the URL BEFORE restoring the replaceState spy so the reset call is
  // never carried into the next test's call count.
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
});

function snapshot(): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Sync Hash Fixture Show",
      client_label: "Acme",
      client_contact: null,
      dates: {
        travelIn: "2026-05-01",
        set: null,
        showDays: ["2026-05-02"],
        travelOut: "2026-05-03",
      },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: DRIVE_FILE_ID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: [],
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: [],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

function railTid(name: string): string {
  return `wizard-step3-card-${DRIVE_FILE_ID}-review-${name}`;
}

/** Shell host: the surface owns the live scroller (the shell holds the ref).
 *  The Overview extra renders the fixture's inner anchor INSIDE the scroller. */
function Harness({ layout, syncHash }: { layout: "modal" | "page"; syncHash?: boolean }) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const data = buildPublishedSectionData(snapshot(), { slug: SLUG });
  return (
    <ShowReviewSurface
      data={data}
      scrollerRef={scrollerRef}
      layout={layout}
      // exactOptionalPropertyTypes: ABSENT (default under test), never undefined.
      {...(syncHash === undefined ? {} : { syncHash })}
      extraSectionsBefore={[
        {
          id: RAIL_EXTRA_ID,
          label: "Overview",
          Icon: Home,
          render: () => (
            <div data-testid="overview-panel" id={RAIL_EXTRA_ID}>
              <div data-testid="inner-anchor" id={INNER_ANCHOR_ID} />
            </div>
          ),
        },
      ]}
    />
  );
}

describe("ShowReviewSurface syncHash default (spec §6.4: syncHash ?? layout === 'page')", () => {
  it("page layout (prop omitted): a rail click writes the fragment via replaceState", () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    render(<Harness layout="page" />);
    fireEvent.click(screen.getByTestId(railTid(`rail-item-${RAIL_EXTRA_ID}`)));
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", `#${RAIL_EXTRA_ID}`);
  });

  it("modal layout (prop omitted): a rail click never touches the URL (Step3 anti-regression)", () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    render(<Harness layout="modal" />);
    fireEvent.click(screen.getByTestId(railTid(`rail-item-${RAIL_EXTRA_ID}`)));
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("explicit syncHash={false} overrides page layout: no replaceState on click", () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    render(<Harness layout="page" syncHash={false} />);
    fireEvent.click(screen.getByTestId(railTid(`rail-item-${RAIL_EXTRA_ID}`)));
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });
});

describe("ShowReviewSurface syncHash restore-target resolution (spec §6.4 / D7)", () => {
  it("modal + syncHash: a non-rail fragment scrolls the FIXTURE's in-scroller element via scrollIntoView", () => {
    window.location.hash = `#${INNER_ANCHOR_ID}`;
    render(<Harness layout="modal" syncHash />);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    // `this` of the call proves WHICH element scrolled: the fixture's anchor.
    expect(scrollIntoViewMock.mock.contexts[0]).toBe(screen.getByTestId("inner-anchor"));
    // The fallback must not detour through the rail scroll path.
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("rail-id fragment still routes through the existing rail scroll path (precedence over querySelector)", () => {
    // RAIL_EXTRA_ID is BOTH a rail item and a DOM id in the fixture — the rail
    // branch must win, or `#overview` restores lose scroll-spy suppression.
    window.location.hash = `#${RAIL_EXTRA_ID}`;
    render(<Harness layout="modal" syncHash />);
    expect(scrollToMock).toHaveBeenCalled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    expect(
      screen.getByTestId(railTid(`rail-item-${RAIL_EXTRA_ID}`)).getAttribute("aria-current"),
    ).toBe("true");
  });

  it("unknown fragment: no scroll, no throw", () => {
    window.location.hash = "#no-such-target";
    render(<Harness layout="modal" syncHash />);
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    expect(scrollToMock).not.toHaveBeenCalled();
    // The surface rendered normally (the no-op did not blow up the mount).
    expect(screen.getByTestId(railTid("main"))).toBeTruthy();
  });

  it("modal WITHOUT syncHash ignores a matching fragment entirely (restore effect gated off)", () => {
    window.location.hash = `#${INNER_ANCHOR_ID}`;
    render(<Harness layout="modal" />);
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    expect(scrollToMock).not.toHaveBeenCalled();
  });
});
