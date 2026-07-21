// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/mappedSectionActiveFlag.test.tsx
 * (whole-diff cross-model review, findings A2 / C2)
 *
 * The trim gave the Parse warnings panel a sentence it could not previously
 * say: "Nothing needs a look on this sheet." That sentence is selected from
 * ACTIVE counts, but every MAPPED section's rail state was still derived from
 * every warn row INCLUDING ignored ones. So the moment an operator ignored the
 * last active Crew warning, the panel said nothing needed a look while the Crew
 * rail item still carried the amber dot and announced " — needs review", and
 * that contradiction persisted across refreshes because ignoring does not delete
 * the warning.
 *
 * Two independent reviewers found this from opposite directions (source-diff and
 * cross-surface), which is what a genuine seam defect looks like.
 *
 * The assertions below are deliberately about the SAME RENDER: the panel's
 * empty-state copy and the rail's accessible name are read from one mount, so a
 * fix that corrects one and not the other cannot pass.
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
import type { ParseWarning } from "@/lib/parser/types";
import {
  FIXTURE_DRIVE_FILE_ID,
  FIXTURE_SLUG,
  MAPPED_WARNINGS,
  fixtureSnapshot,
} from "@/tests/helpers/warningSurfaceFixture";

afterEach(cleanup);

const CLEAN = `wizard-step3-card-${FIXTURE_DRIVE_FILE_ID}-warnings-clean`;

/** `MAPPED_WARNINGS[0]` is a crew UNKNOWN_ROLE_TOKEN — NOT an ambiguity code, so
 *  its section resolves to `flagged` (amber). `[1]` is a rooms
 *  ROOM_HEADER_SPLIT_AMBIGUOUS — an ambiguity code, so its section resolves to
 *  `judgment` (calm). Both branches of the §7.1 split are therefore exercised. */
const CREW_WARNING = MAPPED_WARNINGS[0]!;
const ROOM_WARNING = MAPPED_WARNINGS[1]!;

function Harness({
  warnings,
  ignored,
  gated,
}: {
  warnings: readonly ParseWarning[];
  ignored: readonly ParseWarning[];
  gated: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const data = buildPublishedSectionData(fixtureSnapshot(warnings) as never, {
    slug: FIXTURE_SLUG,
  });
  const fingerprints = new Set<string>(
    ignored.map((w) => warningFingerprint(w)).filter((fp): fp is string => fp !== null),
  );
  // A snippet-less warning yields a null fingerprint and can never be ignored,
  // which would make an "all ignored" fixture silently ignore nothing.
  expect(fingerprints.size).toBe(ignored.length);
  const bySection = buildSectionWarningModel({
    slug: FIXTURE_SLUG,
    warnings,
    ignoredFingerprints: fingerprints,
    renderedSectionIds: new Set<SectionId>(step3Sections(data).map((s) => s.id)),
  });
  return (
    <div ref={scrollerRef}>
      <ShowReviewSurface
        data={data}
        scrollerRef={scrollerRef}
        layout="modal"
        {...(gated
          ? {
              renderSectionExtras: buildSectionWarningExtras({ bySection }),
              routedWarnings: deriveRoutedWarnings(bySection),
            }
          : {})}
      />
    </div>
  );
}

/**
 * Every rail control whose accessible name starts with `label`, across BOTH
 * rails — the `<lg` chip strip and the `>=lg` pane render the same section
 * independently, and a fix applied to one is not a fix.
 */
function railNamesFor(label: string): string[] {
  // Anchored, with an optional count between the label and the status clause —
  // the chip rail renders "Crew2 — needs review" where the pane renders
  // "Crew — needs review". A bare `startsWith` also swallows the SEPARATE
  // "Crew schedule" section, which is how the first draft of this helper read a
  // different row's status and reported the wrong answer twice.
  const pattern = new RegExp(`^${label}\\d* — (needs review|no issues)$`);
  return screen
    .getAllByRole("button")
    .map((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter((name) => pattern.test(name));
}

function expectRailState(label: string, state: "needs review" | "no issues") {
  const names = railNamesFor(label);
  // Both rails, or the assertion is half-blind.
  expect(names.length, `${label} must appear in both rails`).toBeGreaterThanOrEqual(2);
  for (const name of names) {
    expect(name, `${label} rail control`).toContain(`— ${state}`);
  }
}

describe("a mapped section's rail state follows its ACTIVE rows, not every row", () => {
  it("clears Crew's amber flag once its only warning is ignored, in the same render that says nothing needs a look", () => {
    // Precondition: active -> Crew is flagged. Without this half, the assertion
    // below passes against a build that never flags Crew at all.
    const { rerender } = render(<Harness warnings={[CREW_WARNING]} ignored={[]} gated={true} />);
    expectRailState("Crew", "needs review");
    expect(screen.queryByTestId(CLEAN)).toBeNull();

    rerender(<Harness warnings={[CREW_WARNING]} ignored={[CREW_WARNING]} gated={true} />);

    // The panel's claim and the rail's claim, read from ONE render.
    expect(screen.getByTestId(CLEAN)).toBeTruthy();
    expectRailState("Crew", "no issues");
  });

  it("clears a JUDGMENT section too, so the fix is not specific to the amber branch", () => {
    const { rerender } = render(<Harness warnings={[ROOM_WARNING]} ignored={[]} gated={true} />);
    // A judgment section is calm in the RAIL by design (no amber dot), so its
    // observable is the section heading's "Parsed with judgment" pill
    // (step3ReviewSections.tsx:757). Present before, absent after.
    expect(screen.queryAllByText("Parsed with judgment").length).toBeGreaterThan(0);

    rerender(<Harness warnings={[ROOM_WARNING]} ignored={[ROOM_WARNING]} gated={true} />);

    expect(screen.queryAllByText("Parsed with judgment").length).toBe(0);
    // And it did not silently become the amber flag instead.
    expect(screen.queryAllByText("Needs a look").length).toBe(0);
    expect(screen.getByTestId(CLEAN)).toBeTruthy();
  });

  it("leaves the UNGATED surface deriving from every row, ignored included", () => {
    // The wizard passes neither prop and has no ignore state on this surface, so
    // its rule must not change. This is the negative half that stops the fix
    // from becoming "never flag a mapped section".
    render(<Harness warnings={[CREW_WARNING]} ignored={[CREW_WARNING]} gated={false} />);
    expectRailState("Crew", "needs review");
  });
});
