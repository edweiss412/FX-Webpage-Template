// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/publishedWarningNoLoss.test.tsx
 * (plan Task 3 Step 0; spec §2.1, §11 meta-test 2, §12 test 1)
 *
 * THE PRECONDITION FOR THE WHOLE CHANGE. The trim removes warn-severity rows
 * from the published Parse warnings panel on the grounds that every one of them
 * already renders as an actionable card in its own section. This suite proves
 * that claim BEFORE anything is trimmed, so a later failure means the trim broke
 * it rather than that it was never true.
 *
 * Scoped to the EXTRAS subtree only. Today the panel body ALSO renders every
 * warn row, and that duplication is exactly the defect being removed, so a
 * body-plus-extras uniqueness assertion is guaranteed to fail here. That half
 * lands in Step 2b of the same task, where it flips false to true.
 *
 * Anti-tautology (spec §12 test 1): a union-and-uniqueness assertion alone is
 * satisfied by an implementation that dumps every warning into ONE fallback
 * container. Placement (which section id) and partition (active vs ignored) are
 * what exclude it, which is why both are asserted per identity.
 */
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/warning-surface-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { deriveRoutedWarnings } from "@/lib/admin/routedWarnings";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { warningsBySection, type SectionId } from "@/lib/admin/step3SectionStatus";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { ParseWarning } from "@/lib/parser/types";
import {
  ALL_WARNINGS,
  FIXTURE_SLUG,
  IGNORED_WARNINGS,
  WARN_WARNINGS,
  fixtureSnapshot,
} from "@/tests/helpers/warningSurfaceFixture";

afterEach(cleanup);

function buildData(warnings: readonly ParseWarning[] = ALL_WARNINGS): PublishedSectionData {
  return buildPublishedSectionData(fixtureSnapshot(warnings) as never, { slug: FIXTURE_SLUG });
}

/** The fingerprints the fixture marks ignored, derived live so a
 *  fingerprint-shape change fails here rather than silently disabling the
 *  ignored half of every assertion below. */
function ignoredFingerprints(): Set<string> {
  const fps = IGNORED_WARNINGS.map((w) => warningFingerprint(w)).filter(
    (fp): fp is string => fp !== null,
  );
  expect(fps.length).toBe(IGNORED_WARNINGS.length);
  return new Set(fps);
}

function Harness({ warnings }: { warnings: readonly ParseWarning[] }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const data = buildData(warnings);
  const bySection = buildSectionWarningModel({
    slug: FIXTURE_SLUG,
    warnings,
    ignoredFingerprints: ignoredFingerprints(),
    renderedSectionIds: new Set<SectionId>(step3Sections(data).map((s) => s.id)),
  });
  return (
    <div ref={scrollerRef}>
      <ShowReviewSurface
        data={data}
        scrollerRef={scrollerRef}
        layout="modal"
        renderSectionExtras={buildSectionWarningExtras({ bySection })}
        routedWarnings={deriveRoutedWarnings(bySection)}
      />
    </div>
  );
}

describe("published warning no-loss precondition", () => {
  it("routes every warn-severity warning to a bucket, so none can be orphaned", () => {
    const data = buildData();
    const rendered = new Set<SectionId>(step3Sections(data).map((s) => s.id));
    const routed = warningsBySection(ALL_WARNINGS, rendered);
    const routedCount = [...routed.values()].reduce((n, entries) => n + entries.length, 0);
    // Derived from the fixture, never a literal: every warn row lands somewhere.
    expect(routedCount).toBe(WARN_WARNINGS.length);
    // And they do NOT all land in one bucket, or placement assertions below
    // would be vacuous.
    expect(routed.size).toBeGreaterThan(1);
  });

  it("renders each section's warn rows in the RIGHT section and the RIGHT partition", () => {
    const data = buildData();
    const rendered = new Set<SectionId>(step3Sections(data).map((s) => s.id));
    const routed = warningsBySection(ALL_WARNINGS, rendered);
    const ignored = ignoredFingerprints();

    // Expected per-section active/ignored ROW COUNTS, derived from the routing
    // and the live fingerprints. Counting per section is what fails a
    // single-fallback-container implementation: it would render the right total
    // in one place and zero everywhere else.
    const expected = new Map<SectionId, { active: number; ignored: number }>();
    for (const [sectionId, entries] of routed) {
      let a = 0;
      let g = 0;
      for (const { warning } of entries) {
        const fp = warningFingerprint(warning);
        if (fp !== null && ignored.has(fp)) g += 1;
        else a += 1;
      }
      expected.set(sectionId, { active: a, ignored: g });
    }
    // The fixture must span more than one section, or "placement" is untested.
    expect(expected.size).toBeGreaterThan(1);

    render(<Harness warnings={ALL_WARNINGS} />);

    let totalActive = 0;
    let totalIgnored = 0;
    for (const [sectionId, counts] of expected) {
      const controls = screen.queryByTestId(`section-warning-controls-${sectionId}`);
      expect(controls, `extras container for ${sectionId}`).not.toBeNull();
      const scope = within(controls!);

      const activeRows = within(
        scope.getByTestId(`section-warning-active-${sectionId}`),
      ).queryAllByTestId("per-show-actionable-item").length;
      expect(activeRows, `${sectionId} active rows`).toBe(counts.active);
      totalActive += activeRows;

      if (counts.ignored > 0) {
        const ignoredRows = within(
          scope.getByTestId(`section-ignored-list-${sectionId}`),
        ).queryAllByTestId("per-show-actionable-item").length;
        expect(ignoredRows, `${sectionId} ignored rows`).toBe(counts.ignored);
        totalIgnored += ignoredRows;
      } else {
        expect(scope.queryByTestId(`section-ignored-list-${sectionId}`)).toBeNull();
      }
    }

    // Every warn row is accounted for exactly once across the extras.
    expect(totalActive + totalIgnored).toBe(WARN_WARNINGS.length);
    expect(totalIgnored).toBe(IGNORED_WARNINGS.length);
  });

  it("gives every ACTIVE warn row its OWN enabled, named Report control", () => {
    // Whole-diff review B4: a document-wide `>= activeWarnCount` count is
    // satisfiable by unrelated Report buttons elsewhere on the modal while an
    // actual warning card has none. Scoped PER CARD instead, so the assertion is
    // about each row rather than about a total.
    render(<Harness warnings={ALL_WARNINGS} />);

    const cards = screen
      .queryAllByTestId("per-show-actionable-item")
      .filter((el) => el.closest("[data-testid^='section-warning-active-']") !== null);
    const activeWarnCount = WARN_WARNINGS.length - IGNORED_WARNINGS.length;
    expect(cards.length, "one active card per active warn row").toBe(activeWarnCount);

    for (const card of cards) {
      const buttons = within(card).queryAllByRole("button", { name: /report/i });
      expect(buttons.length, `Report control inside ${card.textContent?.slice(0, 40)}`).toBe(1);
      const button = buttons[0] as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      expect((button.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("places each warn CODE in the section its routing key names, independently derived", () => {
    // Whole-diff review B3: the placement assertion above derives its oracle
    // from `warningsBySection`, the same authority that feeds the render. Swap
    // two destinations and oracle and output move together. These three
    // expectations are written out, so a routing change has to be deliberate.
    render(<Harness warnings={ALL_WARNINGS} />);

    const EXPECTED: { code: string; section: string }[] = [
      { code: "UNKNOWN_ROLE_TOKEN", section: "crew" },
      { code: "ROOM_HEADER_SPLIT_AMBIGUOUS", section: "rooms" },
      { code: "UNKNOWN_FIELD", section: "warnings" },
    ];

    for (const { code, section } of EXPECTED) {
      expect(
        ALL_WARNINGS.some((w) => w.code === code),
        `${code} must be in the fixture`,
      ).toBe(true);
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as { title: string };
      const title = entry.title;
      expect(title.length).toBeGreaterThan(0);

      // Present in the section its routing key names...
      expect(
        screen.getByTestId(`section-warning-controls-${section}`).textContent ?? "",
        `${code} belongs to ${section}`,
      ).toContain(title);

      // ...and ABSENT from the other two. Without this half, a build that
      // rendered every code into every section would pass.
      for (const other of EXPECTED) {
        if (other.section === section) continue;
        expect(
          screen.getByTestId(`section-warning-controls-${other.section}`).textContent ?? "",
          `${code} must NOT appear in ${other.section}`,
        ).not.toContain(title);
      }
    }
  });
});
