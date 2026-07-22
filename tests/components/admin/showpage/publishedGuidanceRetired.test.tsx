// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/publishedGuidanceRetired.test.tsx
 * (plan Task 4; spec §3.5, §12 test 7)
 *
 * The published panel body carries NO panel-level guidance in any of its four
 * states. Its complete content is the info list, or one empty-state line, or
 * nothing at all.
 *
 * ABSENCE IS ASSERTED BY RENDERED TEXT, never by testid. A survivor whose
 * testid was removed or renamed is still visible to the operator, so a
 * testid-absence assertion proves the wrong thing (spec §12 test 7).
 *
 * Each frozen literal gets its OWN test case, so one stale literal cannot be
 * masked by the other still producing the intended failure.
 */
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { ParseWarning } from "@/lib/parser/types";
import {
  ALL_WARNINGS,
  FIXTURE_SLUG,
  IGNORED_WARNINGS,
  INFO_WARNINGS,
  fixtureSnapshot,
} from "@/tests/helpers/warningSurfaceFixture";

/** Spec 2026-07-22-warning-panel-polish §3.4: the published callout's axis is
 *  ACTIONABILITY (INFO_CODE_ACTIONABILITY), not cell presence — no real info
 *  emitter ever carries a sourceCell (OPERATOR_ACTIONABLE_ANCHORED excludes
 *  both, lib/parser/dataGaps.ts:370-391), so the old sourceCell gate could
 *  never fire on this surface. Fixtures below mirror the REAL emitter shapes.
 */
const INFO_NON_ACTIONABLE: readonly ParseWarning[] = INFO_WARNINGS;

/** The one actionable info code (its catalog copy asks the operator to remove
 *  a duplicate — a sheet edit), real emitter shape: no sourceCell
 *  (lib/parser/personalization.ts:71-77). */
const DOUBLE_LOCATION: ParseWarning = {
  severity: "info",
  code: "DAY_RESTRICTION_DOUBLE_LOCATION",
  message: "Day restriction paren+ONLY found in both name and role cells; preferring role cell.",
  rawSnippet: "name: A (SAT ONLY) | role: Tech (SAT ONLY)",
} as ParseWarning;

afterEach(cleanup);

/**
 * FROZEN LITERALS. Written out here rather than imported from the modules that
 * produce them: comparing rendered output to the helper that produced it lets a
 * wrong edit change both together and pass.
 */
// Straight apostrophe in "We'll": CorrectionLoopCallout.tsx:27 builds this from
// a template literal, NOT from an HTML entity. The non-blocking sentence below
// uses a CURLY one, because step3ReviewSections.tsx:2528 writes `&rsquo;`. The
// two differ, and assuming either would have produced an assertion that passes
// against nothing.
const LOOP_SENTENCE =
  "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.";
const NON_BLOCKING_SENTENCE =
  "These warnings don’t block publishing. Some include an optional fix you can apply below.";

function buildData(warnings: readonly ParseWarning[]): PublishedSectionData {
  return buildPublishedSectionData(fixtureSnapshot(warnings) as never, { slug: FIXTURE_SLUG });
}

function Harness({ warnings, gate = true }: { warnings: readonly ParseWarning[]; gate?: boolean }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const data = buildData(warnings);
  const fps = IGNORED_WARNINGS.map((w) => warningFingerprint(w)).filter(
    (fp): fp is string => fp !== null,
  );
  const bySection = buildSectionWarningModel({
    slug: FIXTURE_SLUG,
    warnings,
    ignoredFingerprints: new Set(fps),
    renderedSectionIds: new Set<SectionId>(step3Sections(data).map((s) => s.id)),
  });
  const extras = buildSectionWarningExtras({ bySection });
  return (
    <div data-testid="modal-root" ref={scrollerRef}>
      <ShowReviewSurface
        data={data}
        scrollerRef={scrollerRef}
        layout="modal"
        {...(gate
          ? { renderSectionExtras: extras, routedWarnings: deriveRoutedWarnings(bySection) }
          : {})}
      />
    </div>
  );
}

/**
 * The modal's rendered text, with popover bodies removed from a CLONE.
 *
 * Task 5 deliberately puts the loop sentence inside each warning card's help
 * popover, so a naive whole-tree scan would find it there and the assertion
 * would be unfalsifiable. Removing those elements structurally, rather than
 * subtracting a substring, keeps the scan honest.
 */
function modalTextWithoutPopovers(): { text: string; removedCount: number } {
  const root = screen.getByTestId("modal-root");
  const clone = root.cloneNode(true) as HTMLElement;
  // The help family is per-item: `per-show-actionable-help-<key>-trigger` and
  // `-body` (components/admin/PerShowActionableWarnings.tsx:177 feeding
  // components/admin/HoverHelp.tsx:245). The BODY is always mounted, so it must
  // be removed structurally or this scan can never fail once task 5 lands.
  const removed = Array.from(clone.querySelectorAll("[data-testid*='-help-']"));
  for (const el of removed) el.remove();
  return { text: clone.textContent ?? "", removedCount: removed.length };
}

describe("the published panel retires its panel-level guidance", () => {
  it("does not render the non-blocking sentence", () => {
    render(<Harness warnings={ALL_WARNINGS} />);
    expect(modalTextWithoutPopovers().text).not.toContain(NON_BLOCKING_SENTENCE);
  });

  it("drops the correction-loop sentence from every EMPTY state, where it has no rows to be about", () => {
    // Silent / Elsewhere / Clean all render an empty body. §3.5's retirement
    // holds unconditionally there: the sentence would sit above either nothing
    // or a line saying nothing needs a look.
    render(<Harness warnings={[...IGNORED_WARNINGS]} />);
    const { text } = modalTextWithoutPopovers();
    expect(text).not.toContain(LOOP_SENTENCE);
  });

  it("KEEPS it when the panel lists an ACTIONABLE info row (spec §3.4)", () => {
    // Whole-diff review C1 lineage: info rows never become cards, so this
    // panel is the only home for the correction advice. The 2026-07-22 polish
    // replaced the dead sourceCell conjunct (no info emitter is anchored) with
    // the actionability registry: DAY_RESTRICTION_DOUBLE_LOCATION's copy asks
    // the operator to remove a duplicate, so its presence invites the loop.
    //
    // The fixture is info-ONLY, so nothing on this render has a popover and the
    // sentence cannot be found in one.
    render(<Harness warnings={[DOUBLE_LOCATION]} />);
    const { text, removedCount } = modalTextWithoutPopovers();
    expect(removedCount, "an info-only sheet mounts no warning-card popovers").toBe(0);
    expect(text).toContain(LOOP_SENTENCE);
    // Still not the non-blocking line: its "below" points at controls that are
    // no longer below.
    expect(text).not.toContain(NON_BLOCKING_SENTENCE);
  });

  it("drops it when every listed info row is non-actionable (spec §3.4 - the owner's ask)", () => {
    // A sheet whose only notes need no operator action (auto-corrected /
    // FYI-only rows) must not prompt "Fixed it in the sheet?".
    render(<Harness warnings={INFO_NON_ACTIONABLE} />);
    const { text } = modalTextWithoutPopovers();
    expect(text).not.toContain(LOOP_SENTENCE);
    // The rows themselves still render: this gates the guidance, not the list.
    // Without this the assertion above passes for the wrong reason on any build
    // that renders an empty panel.
    expect(screen.queryAllByTestId(/-warning-\d+$/).length).toBe(INFO_NON_ACTIONABLE.length);
  });

  it("keeps it when only SOME listed rows are actionable", () => {
    // The boundary: `some`, not `every`. One actionable row makes the advice
    // applicable regardless of its non-actionable neighbors.
    render(<Harness warnings={[INFO_NON_ACTIONABLE[0]!, DOUBLE_LOCATION]} />);
    expect(modalTextWithoutPopovers().text).toContain(LOOP_SENTENCE);
  });

  it("keeps BOTH sentences on the ungated (wizard) surface, verbatim", () => {
    // The frozen literals are load-bearing in this direction too: if either
    // string drifts in the component, this assertion fails and tells us the
    // absence assertions above went stale rather than silently passing.
    // Cell-less rows deliberately: the wizard renders the callout
    // unconditionally, because its panel lists every warning including the
    // cell-bearing warn rows and that surface's render is contractually
    // unchanged. If the new gate leaked into the ungated path, this fails.
    render(<Harness warnings={ALL_WARNINGS} gate={false} />);
    // The ungated surface mounts no extras, so there are no popovers to remove
    // here; the sentences are asserted PRESENT as panel-level copy.
    const { text } = modalTextWithoutPopovers();
    expect(text).toContain(LOOP_SENTENCE);
    expect(text).toContain(NON_BLOCKING_SENTENCE);
  });
});
