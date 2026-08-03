/**
 * @vitest-environment jsdom
 */
/**
 * tests/components/admin/showpage/publishedModalFreshnessCue.test.tsx
 *
 * The freshness cue's STATE MACHINE, driven through the real modal (spec
 * 2026-08-03-modal-freshness-cue section 11.2), mirroring the shape of
 * `tests/components/admin/showpage/shareHubFlashState.test.tsx`.
 *
 * Every transition is a real RTL `rerender` with different raw rows, so `data`
 * and `bySection` are rebuilt by the REAL adapter and the REAL warning model.
 * Poking a prop would have proved the component reads a prop; this proves it
 * isolates a change through the production pipeline.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import {
  installModalDomStubs,
  publishedModalElement,
  type RawRow,
} from "./__fixtures__/publishedModalHarness";
import { SECTION_FRESHNESS_FLASH_MS } from "@/components/admin/review/sectionFreshness";

// The modal calls useRouter/useSearchParams; without the app-router context these
// throw before any assertion runs. Same stub shape the sibling showpage suites use.
// Mutable so a test can drop `?show`, which is the only way to reach the modal's
// HIDDEN state from jsdom: with the param still committed, the aborted-close
// self-heal resets `closing` during the same render and no commit ever observes
// it as true.
let searchParamsValue = "show=published-fixture-show";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

const ATTR = "data-section-freshness-flash";
const ANNOUNCE = "published-show-review-freshness-announce";

/** A warn routed to a section by block kind, which is what places it in a card. */
const row = (block: string, key: string, value = "v"): RawRow => ({ block, key, value });

// Fixture keys are held CONSTANT across a transition unless the case means to
// change that section. An earlier draft varied the crew key while adding a rooms
// row, so "a different section changed" was really "both changed" and the test
// was measuring something other than what it claimed.
const CREW: readonly RawRow[] = [row("crew", "c1")];
const CREW_EDITED: readonly RawRow[] = [row("crew", "c2")];
/** Crew row UNCHANGED, rooms added: the only changed section is rooms. */
const CREW_AND_ROOMS: readonly RawRow[] = [row("crew", "c1"), row("rooms", "r1")];
/** Four sections beyond the crew baseline, so `changed` clears the cap of three. */
const OVER_CAP: readonly RawRow[] = [
  row("crew", "c9"),
  row("rooms", "r1"),
  row("hotels", "h1"),
  row("venue", "v1"),
];

/** Cards currently wearing the attribute, as [testid, value] pairs. */
function armedCards(): Array<[string, string]> {
  return [...document.querySelectorAll(`[${ATTR}]`)].map((el) => [
    el.getAttribute("data-testid") ?? "(no testid)",
    el.getAttribute(ATTR) ?? "",
  ]);
}

/**
 * The announcement's text, read from a CLONE with nothing else in it, so the
 * assertion cannot pass on some other node that happens to render the same words.
 */
function announcementText(): string {
  const region = screen.getByTestId(ANNOUNCE);
  return (region.textContent ?? "").trim();
}

const announcementNode = () => screen.getByTestId(ANNOUNCE);

describe("published review modal: freshness cue", () => {
  beforeEach(() => {
    installModalDomStubs();
    searchParamsValue = "show=published-fixture-show";
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
  });

  it("S1: the first render arms nothing", () => {
    render(publishedModalElement(CREW));
    expect(armedCards()).toEqual([]);
    expect(announcementText()).toBe("");
  });

  it("S2: the FIRST transition after mount is a baseline, even when content changed", () => {
    // Both halves in one row on purpose. Asserting only the content-EQUAL first
    // transition would leave the stale-prefetch path untested, and that path is the
    // whole reason branch 2 exists: a prefetched open can serve a payload minutes
    // old, so the first refresh after opening must not flash what changed while the
    // modal was shut.
    const { rerender } = render(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW_EDITED));
    expect(armedCards(), "the first transition is the baseline, whatever moved").toEqual([]);
    expect(announcementText()).toBe("");

    // The SECOND transition, with a real change, does arm.
    rerender(publishedModalElement(CREW));
    expect(armedCards().length).toBe(1);
  });

  it("S3: a later change arms exactly one card and nothing else in the tree", () => {
    const { rerender } = render(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW)); // baseline, no change
    rerender(publishedModalElement(CREW_EDITED));

    const armed = armedCards();
    expect(armed.length).toBe(1);
    expect(armed[0]?.[0]).toContain("-section-crew-panel-card");
    // The announcement region must not be counted as an armed node: it renders the
    // section's NAME, so a selector that caught it would pass for the wrong reason.
    expect(announcementNode().hasAttribute(ATTR)).toBe(false);
  });

  it("S4: the attribute clears at exactly the flash duration, not before", () => {
    const { rerender } = render(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW_EDITED));
    expect(armedCards().length).toBe(1);

    act(() => void vi.advanceTimersByTime(SECTION_FRESHNESS_FLASH_MS - 1));
    expect(armedCards().length, "still armed one tick before the deadline").toBe(1);
    act(() => void vi.advanceTimersByTime(1));
    expect(armedCards()).toEqual([]);
  });

  it("S5: a repeat cue on the same section flips the value so the animation restarts", () => {
    const { rerender } = render(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW_EDITED));
    const first = armedCards()[0]?.[1];
    expect(first).toBeDefined();

    act(() => void vi.advanceTimersByTime(400));
    rerender(publishedModalElement(CREW));
    const second = armedCards()[0]?.[1];
    // Changing an attribute's VALUE does not restart a CSS animation; changing
    // which `animation-name` it selects does. That is the entire mechanism.
    expect(second).not.toBe(first);
    expect([first, second].sort()).toEqual(["1", "2"]);
  });

  it("S6: a content-equal refresh mid-flash neither clears nor extends the cue", () => {
    const { rerender } = render(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW_EDITED));
    const value = armedCards()[0]?.[1];

    act(() => void vi.advanceTimersByTime(800));
    rerender(publishedModalElement(CREW_EDITED)); // identical content, new objects
    expect(armedCards()[0]?.[1], "left running, not re-armed").toBe(value);

    // The ORIGINAL deadline still governs: extending it would be the bug.
    act(() => void vi.advanceTimersByTime(SECTION_FRESHNESS_FLASH_MS - 800 - 1));
    expect(armedCards().length).toBe(1);
    act(() => void vi.advanceTimersByTime(1));
    expect(armedCards()).toEqual([]);
  });

  it("S7: over the cap, no card flashes and the announcement is the surface sentence", () => {
    const { rerender } = render(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW));
    rerender(publishedModalElement(OVER_CAP));
    expect(armedCards()).toEqual([]);
    expect(announcementText()).toBe("Show details updated.");
  });

  it("S8: exactly at the cap, every changed card arms", () => {
    const { rerender } = render(publishedModalElement([]));
    rerender(publishedModalElement([]));
    rerender(publishedModalElement(CREW_AND_ROOMS));
    expect(armedCards().length).toBe(2);
  });

  it("S9: arming and expiry reconcile the card, never remount it", () => {
    const { rerender } = render(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW));
    const before = document.querySelector('[data-testid$="-section-crew-panel-card"]');
    expect(before).not.toBeNull();

    rerender(publishedModalElement(CREW_EDITED));
    const during = document.querySelector('[data-testid$="-section-crew-panel-card"]');
    act(() => void vi.advanceTimersByTime(SECTION_FRESHNESS_FLASH_MS));
    const after = document.querySelector('[data-testid$="-section-crew-panel-card"]');

    // Node IDENTITY, which is the only assertion that distinguishes a reconcile
    // from a remount. A remount would reset scroll and focus inside the card,
    // which is the property the whole realtime design exists to preserve.
    expect(during).toBe(before);
    expect(after).toBe(before);
  });

  it("S10: unmounting mid-flash leaves no pending timer, with two batches outstanding", () => {
    const { rerender, unmount } = render(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW_EDITED)); // batch 1
    act(() => void vi.advanceTimersByTime(200));
    rerender(publishedModalElement(CREW_AND_ROOMS)); // batch 2, batch 1 still live
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    // Two batches, and the per-batch effect returns no cleanup by design, so the
    // unmount-only effect is the single thing standing between this and an orphan.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("S11: the region is always present, correctly roled, and never remounts", () => {
    const { rerender } = render(publishedModalElement(CREW));
    const region = announcementNode();
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.className).toContain("sr-only");

    rerender(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW_EDITED));
    act(() => void vi.advanceTimersByTime(SECTION_FRESHNESS_FLASH_MS));
    // Identity, not a key: React keys are not observable in jsdom, so "stable key"
    // is only testable as "the same node survived".
    expect(announcementNode()).toBe(region);
  });

  it("S11b: a refresh that changes nothing announces nothing", () => {
    const { rerender } = render(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW));
    expect(announcementText()).toBe("");
    expect(armedCards()).toEqual([]);
  });

  it("S12: copy matches the rendered registry labels, with no em dash or apostrophe", () => {
    const first = render(publishedModalElement([]));
    first.rerender(publishedModalElement([]));
    first.rerender(publishedModalElement(CREW));
    const one = announcementText();
    expect(one).toBe("Updated: Crew.");
    first.unmount();

    // A SEPARATE mount for the two-item case: reusing the first would make the
    // second transition a one-section change, which is what an earlier draft of
    // this row accidentally asserted.
    const second = render(publishedModalElement([]));
    second.rerender(publishedModalElement([]));
    second.rerender(publishedModalElement(CREW_AND_ROOMS));
    const two = announcementText();

    // The rooms label is read off the RENDERED rail chip rather than written here,
    // which is what stops the suite pinning a stale copy of the registry map. The
    // chip carries an sr-only status after its label, so take the label half.
    const roomsChip = document
      .querySelector('[data-testid$="-review-chip-dot-rooms"]')
      ?.parentElement;
    const roomsLabel = (roomsChip?.textContent ?? "").split("\u2014")[0]?.trim() ?? "";
    expect(roomsLabel.length, "the rooms rail chip must carry its registry label").toBeGreaterThan(
      0,
    );

    expect(two.startsWith("Updated: ")).toBe(true);
    expect(two.endsWith(".")).toBe(true);
    expect(two, "two sections join with a final and").toContain(" and ");
    expect(two, "the spoken name is the rendered name").toContain(roomsLabel);

    for (const text of [one, two]) {
      expect(text).not.toContain("\u2014");
      expect(text).not.toContain("'");
      expect(text).not.toContain("\u2019");
    }
  });

  it("S14: a different section changing mid-flash does NOT truncate the first", () => {
    const { rerender } = render(publishedModalElement([]));
    rerender(publishedModalElement([]));
    rerender(publishedModalElement(CREW)); // batch 1: crew
    expect(armedCards().length).toBe(1);

    act(() => void vi.advanceTimersByTime(400));
    rerender(publishedModalElement(CREW_AND_ROOMS)); // batch 2: rooms joins
    // The wash holds through 45% of 1600ms, so at 400ms crew is still at full
    // tint. An implementation that REPLACED the id set would snap it to resting
    // here, which is what per-batch expiry exists to prevent.
    expect(armedCards().length, "crew must still be armed alongside rooms").toBe(2);

    // Each expires on its OWN clock: crew first, 400ms before rooms.
    act(() => void vi.advanceTimersByTime(SECTION_FRESHNESS_FLASH_MS - 400));
    expect(armedCards().length).toBe(1);
    act(() => void vi.advanceTimersByTime(400));
    expect(armedCards()).toEqual([]);
  });

  it("S15: crossing from a LIVE cue to an over-cap update clears every attribute", () => {
    const { rerender } = render(publishedModalElement([]));
    rerender(publishedModalElement([]));
    rerender(publishedModalElement(CREW));
    expect(armedCards().length).toBe(1);

    act(() => void vi.advanceTimersByTime(200));
    rerender(publishedModalElement(OVER_CAP));
    // S7 starts from rest and cannot catch a merge that leaves the earlier
    // attribute on under an announcement that no longer makes a per-card claim.
    expect(armedCards()).toEqual([]);
    expect(announcementText()).toBe("Show details updated.");
  });

  it("S16: a repeat cue with IDENTICAL copy still re-announces", () => {
    const { rerender } = render(publishedModalElement([]));
    rerender(publishedModalElement([]));
    rerender(publishedModalElement(CREW));
    const first = announcementNode().firstElementChild;
    expect(announcementText()).toBe("Updated: Crew.");

    act(() => void vi.advanceTimersByTime(400));
    rerender(publishedModalElement([]));
    act(() => void vi.advanceTimersByTime(10));
    rerender(publishedModalElement(CREW));
    const second = announcementNode().firstElementChild;

    // Asserted by NODE IDENTITY, never by text: the text is equal in both the
    // working and the broken implementation, so a text assertion would pass
    // against the silent bug. React reconciles an identical string onto the same
    // node, which is not a DOM mutation and is therefore never announced.
    expect(announcementText()).toBe("Updated: Crew.");
    expect(second).not.toBe(first);
  });

  it("S19: the clear-on-hide branch is wired to `closing`", () => {
    // WHY THIS IS STRUCTURAL AND WHAT THAT COSTS. The behaviour it guards is real
    // and was found by a surviving mutant: an ABORTED close does not unmount this
    // component, it only hides the shell, so a live cue would otherwise survive
    // the hide and resume on reopen with whatever was left of its timer.
    //
    // It cannot be driven from jsdom. The close runs through the shell's animated
    // exit, which never completes here, and with `?show` still committed the
    // aborted-close self-heal un-hides during the very render that hid the
    // surface, so no commit ever observes `closing` as true. Both were verified
    // rather than assumed: a click-driven version of this row sat at "still
    // armed" through a render-phase implementation AND a commit-phase one.
    //
    // So this asserts the WIRING, and the behavioural twin lives in the realtime
    // e2e where a real browser can drive a real close. A guard that says what it
    // does not prove is worth more than one that quietly proves nothing.
    const src = readFileSync(
      join(__dirname, "..", "..", "..", "..", "components/admin/showpage/PublishedReviewModal.tsx"),
      "utf8",
    );
    const guard = "if (closing && (armed.size > 0 || announced !== null || seen.baseline)) {";
    expect(src, "a clear-on-hide branch must exist and be gated on closing").toContain(guard);
    const body = src.slice(src.indexOf(guard), src.indexOf(guard) + 260);
    expect(body).toContain("setArmed(EMPTY_ARMED)");
    expect(body).toContain("setAnnounced(null)");
    expect(body).toContain("baseline: false");
  });

  it("the sync stamps moving alone cues nothing", () => {
    // The component-level twin of the detector's poll-found-nothing case. Needs
    // the harness overrides this task added; without them the state is
    // inexpressible, which is why they exist.
    const { rerender } = render(publishedModalElement(CREW));
    rerender(publishedModalElement(CREW));
    rerender(
      publishedModalElement(CREW, {
        lastCheckedAt: "2026-07-16T12:30:00.000Z",
        lastSyncedAt: "2026-07-16T12:30:00.000Z",
      }),
    );
    expect(armedCards()).toEqual([]);
    expect(announcementText()).toBe("");
  });
});
