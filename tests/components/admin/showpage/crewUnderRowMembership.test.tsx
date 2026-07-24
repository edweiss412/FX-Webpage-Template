// tests/components/admin/showpage/crewUnderRowMembership.test.tsx
// @vitest-environment jsdom
/** Spec 2026-07-23-crewwarn-underrow-polish §5 membership rule + §6 item 4.
 *  visible = nodes.slice(0,2); hidden = nodes.slice(2) (step3ReviewSections.tsx:1481-1483).
 *  Card identity = help-trigger testid (stableWarningKeys) - the cards' visible text
 *  is IDENTICAL across FIELD_UNREADABLE fixtures, so text-based assertions would be
 *  vacuous (plan-R1 F2). Failure modes: hidden-removal disturbing the visible pair;
 *  visible-removal not promoting hidden[0]; details open-state lost while hidden
 *  remains; a 0→>0 disclosure mounting OPEN; restoration not returning a condensed
 *  indented card; fallback group card losing full copy. */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/membership-fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import {
  buildSectionWarningExtras,
  renderCrewUnderRowCards,
} from "@/components/admin/showpage/sectionWarningExtras";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { deriveRoutedWarnings } from "@/lib/admin/routedWarnings";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { stableWarningKeys } from "@/lib/dataQuality/warningIdentity";

afterEach(cleanup);

const SHOW_ID = "44444444-4444-4444-8444-444444444444";
const SLUG = "membership-fixture";
const DFID = "DRIVE_MEMBERSHIP";

const warn = (index: number, snippet: string): ParseWarning => ({
  severity: "warn",
  code: "FIELD_UNREADABLE",
  message: `Crew phone could not be read (${snippet})`,
  rawSnippet: snippet,
  blockRef: { kind: "crew", index, name: "Alice Anders" },
});
const W1 = warn(0, "AAA");
const W2 = warn(1, "BBB");
const W3 = warn(2, "CCC");
const W4 = warn(3, "DDD");

const idFor = (w: ParseWarning) => `per-show-actionable-help-${stableWarningKeys([w])[0]!}`;

function snapshot(warnings: ParseWarning[]): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Membership Fixture Show",
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
      drive_file_id: DFID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: warnings,
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: [
      { id: "bbbbbbbb-0000-4000-8000-000000000001", name: "Alice Anders", role: "PM" },
    ],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

function Harness({
  warnings,
  ignoredFingerprints = new Set<string>(),
  matched = true,
}: {
  warnings: ParseWarning[];
  ignoredFingerprints?: ReadonlySet<string>;
  matched?: boolean;
}) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const data = buildPublishedSectionData(snapshot(warnings), {
    slug: SLUG,
  }) as PublishedSectionData;
  const bySection = buildSectionWarningModel({
    slug: SLUG,
    warnings: data.warnings,
    ignoredFingerprints,
    renderedSectionIds: new Set<SectionId>(step3Sections(data).map((s) => s.id)),
  });
  const renderedCrewKeys = new Set(matched ? ["alice anders"] : []);
  return (
    <ShowReviewSurface
      data={data}
      scrollerRef={scrollerRef}
      layout="page"
      renderSectionExtras={buildSectionWarningExtras({ bySection, renderedCrewKeys })}
      routedWarnings={deriveRoutedWarnings(bySection)}
      crewUnderRowCards={renderCrewUnderRowCards({
        model: bySection.crew,
        published: {
          slug: SLUG,
          showId: SHOW_ID,
          driveFileId: DFID,
          useRawDecisions: data.useRawDecisions,
        },
        renderedKeys: renderedCrewKeys,
      })}
    />
  );
}

const stack = () => screen.getByTestId("crew-warn-stack-alice anders");
const detailsEl = () =>
  screen.queryByTestId("crew-warn-more-alice anders") as HTMLDetailsElement | null;
/** Visible = pl-6 wrappers that are DIRECT stack children (hidden ones live under
 *  the details element). Identity via the help-trigger testid prefix. */
const visibleIds = () =>
  Array.from(stack().children)
    .filter((el): el is HTMLElement => el.tagName === "DIV" && el.className === "pl-6")
    .map(
      (el) =>
        el
          .querySelector('[data-testid^="per-show-actionable-help-"]')
          ?.getAttribute("data-testid") ?? "",
    );
const hasId = (ids: string[], w: ParseWarning) => ids.some((t) => t.startsWith(idFor(w)));

describe("§5 membership rule across rerenders", () => {
  it("hidden removal: visible pair UNCHANGED; open survives while hidden remains; details unmounts when hidden empties", () => {
    const { rerender } = render(<Harness warnings={[W1, W2, W3, W4]} />);
    const d = detailsEl()!;
    expect(d.textContent).toContain("2 more");
    d.open = true;
    // Remove a HIDDEN node (W4): visible pair identical, open persists, count drops.
    const before = visibleIds();
    expect(before).toHaveLength(2);
    rerender(<Harness warnings={[W1, W2, W3]} />);
    expect(visibleIds()).toEqual(before);
    const dAfter = detailsEl()!;
    expect(dAfter.open).toBe(true);
    expect(dAfter.textContent).toContain("1 more");
    // Remove the LAST hidden node: details unmounts entirely.
    rerender(<Harness warnings={[W1, W2]} />);
    expect(detailsEl()).toBeNull();
  });

  it("visible removal: hidden[0] promotes into the visible slice", () => {
    const { rerender } = render(<Harness warnings={[W1, W2, W3]} />);
    expect(hasId(visibleIds(), W3)).toBe(false);
    rerender(<Harness warnings={[W2, W3]} />);
    const after = visibleIds();
    expect(after).toHaveLength(2);
    expect(hasId(after, W2)).toBe(true);
    expect(hasId(after, W3)).toBe(true);
    expect(detailsEl()).toBeNull();
  });

  it("re-entry crossing 0 → >0 mounts the disclosure CLOSED", () => {
    const { rerender } = render(<Harness warnings={[W1, W2]} />);
    expect(detailsEl()).toBeNull();
    rerender(<Harness warnings={[W1, W2, W3]} />);
    const d = detailsEl()!;
    expect(d.open).toBe(false);
    expect(d.textContent).toContain("1 more");
  });
});

describe("§5 active↔ignored variant flip (both directions)", () => {
  const fp = () => {
    const v = warningFingerprint(W3);
    expect(v).not.toBeNull();
    return v!;
  };

  it("active→ignored RERENDER: capped under-row card moves to the group full/muted; cap disclosure collapses", () => {
    // Start ACTIVE (whole-diff R1 F1: the flip must be exercised as a rerender in
    // THIS direction too, not mounted directly in the ignored state).
    const { rerender } = render(<Harness warnings={[W1, W2, W3]} />);
    expect(detailsEl()!.textContent).toContain("1 more");
    rerender(<Harness warnings={[W1, W2, W3]} ignoredFingerprints={new Set([fp()])} />);
    expect(detailsEl()).toBeNull();
    expect(visibleIds()).toHaveLength(2);
    expect(hasId(visibleIds(), W3)).toBe(false);
    const ignored = screen.getByTestId("section-ignored-list-crew");
    expect(within(ignored).getAllByTestId("per-show-actionable-guidance").length).toBeGreaterThan(
      0,
    );
  });

  it("ignoring a VISIBLE warning of a capped stack promotes hidden[0] (flip + promotion compose)", () => {
    // W1 is visible, W3 hidden. Ignoring W1 must promote W3 into the visible pair
    // (whole-diff R1 F1: ordering-sensitive cap promotion in the ignore flow).
    const v = warningFingerprint(W1);
    expect(v).not.toBeNull();
    const { rerender } = render(<Harness warnings={[W1, W2, W3]} />);
    expect(hasId(visibleIds(), W3)).toBe(false);
    rerender(<Harness warnings={[W1, W2, W3]} ignoredFingerprints={new Set([v!])} />);
    const after = visibleIds();
    expect(after).toHaveLength(2);
    expect(hasId(after, W1)).toBe(false);
    expect(hasId(after, W3)).toBe(true);
    expect(detailsEl()).toBeNull();
  });

  it("ignored card renders FULL copy, muted, unindented in the group; under-row card unmounts", () => {
    render(<Harness warnings={[W1, W2, W3]} ignoredFingerprints={new Set([fp()])} />);
    expect(detailsEl()).toBeNull();
    expect(hasId(visibleIds(), W3)).toBe(false);
    const ignored = screen.getByTestId("section-ignored-list-crew");
    const guidance = within(ignored).getAllByTestId("per-show-actionable-guidance");
    expect(guidance.length).toBeGreaterThan(0);
    // Muted skin (tone="muted"): guidance uses text-text-subtle, not warning-text.
    expect(guidance[0]!.className).toContain("text-text-subtle");
    expect(ignored.querySelector(".pl-6")).toBeNull();
  });

  it("restoration returns a condensed, indented card under the row", () => {
    const { rerender } = render(
      <Harness warnings={[W1, W2, W3]} ignoredFingerprints={new Set([fp()])} />,
    );
    rerender(<Harness warnings={[W1, W2, W3]} />);
    // Back to 3 actives: capped stack, W3 hidden behind "1 more", all condensed.
    expect(detailsEl()!.textContent).toContain("1 more");
    expect(within(stack()).queryAllByTestId("per-show-actionable-guidance")).toHaveLength(0);
    detailsEl()!.open = true;
    const hiddenWrapper = detailsEl()!.querySelector("div.pl-6");
    expect(hiddenWrapper).not.toBeNull();
  });
});

describe("§5 matched↔fallback variant flip", () => {
  it("fallback group card is FULL (inline guidance); matched under-row card is condensed", () => {
    const { rerender } = render(<Harness warnings={[W1]} matched={false} />);
    const group = screen.getByTestId("section-warning-controls-crew");
    expect(within(group).getAllByTestId("per-show-actionable-guidance").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("crew-warn-stack-alice anders")).toBeNull();
    rerender(<Harness warnings={[W1]} matched />);
    expect(screen.queryByTestId("section-warning-controls-crew")).toBeNull();
    expect(within(stack()).queryAllByTestId("per-show-actionable-guidance")).toHaveLength(0);
    expect(visibleIds()).toHaveLength(1);
  });
});
