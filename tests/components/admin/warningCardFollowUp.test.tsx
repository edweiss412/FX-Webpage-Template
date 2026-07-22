// @vitest-environment jsdom
/**
 * tests/components/admin/warningCardFollowUp.test.tsx
 * (plan Task 5; spec §4, §12 test 6)
 *
 * The correction-loop sentence moves out of the panel and into each warning
 * card's `?` popover, so it exists per warning instead of per panel and is read
 * only where a warning exists.
 *
 * The leaf does NOT hardcode it. `PerShowActionableWarnings` takes an optional
 * `followUpCopy`, and only the PUBLISHED extras factory passes it, which is what
 * keeps `StagedReviewCard` untouched (spec §4.1).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/warning-surface-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import { correctionLoopCopy } from "@/components/admin/CorrectionLoopCallout";
import { WARNING_CARD_COPY_CODES } from "@/tests/messages/warningCardCopyRegistry";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import {
  FIXTURE_DRIVE_FILE_ID,
  FIXTURE_SLUG,
  fixtureSnapshot,
} from "@/tests/helpers/warningSurfaceFixture";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

/** FROZEN literal (spec §12 test 6a). Not `correctionLoopCopy("resync")`:
 *  comparing rendered output to the helper that produced it gives the suite no
 *  independent oracle, so a wrong edit to the shared copy would change both
 *  together and pass. */
const LOOP_SENTENCE =
  "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.";

/**
 * Popover bodies are PORTALED out of their card subtree
 * (hoverhelp-smart-position §4.1) but remain logically owned by it via the
 * root wrapper's aria-owns. Scoped text assertions therefore concatenate the
 * container's text with the text of every owned body — keeping the per-list
 * scoping honest (a document-wide scan would be vacuous).
 */
function textWithOwnedBodies(container: HTMLElement): string {
  let text = container.textContent ?? "";
  for (const owner of container.querySelectorAll("[aria-owns]")) {
    const id = owner.getAttribute("aria-owns");
    const body = id ? document.getElementById(id) : null;
    if (body) text += body.textContent ?? "";
  }
  return text;
}

/**
 * A warning ANCHORED TO A SHEET CELL. The follow-up sentence says "Edit the
 * cell", so `PerShowActionableWarnings` appends it only when a cell exists
 * (whole-diff review finding 3) — a cell-less fixture would make every
 * composition assertion below silently unreachable.
 */
function warningFor(code: string): ParseWarning {
  return {
    severity: "warn",
    code,
    message: `${code} message`,
    rawSnippet: `Row | ${code}`,
    sourceCell: { title: "INFO", gid: 0, a1: "B7" },
  } as ParseWarning;
}

/** The same warning with NO source cell: the asset and Drive codes are raised
 *  this way (lib/sync/enrichWithDrivePins.ts:162 builds `{severity, code,
 *  message}` and nothing else). */
function cellLessWarningFor(code: string): ParseWarning {
  return {
    severity: "warn",
    code,
    message: `${code} message`,
    rawSnippet: `Row | ${code}`,
  } as ParseWarning;
}

/**
 * The popover BODY text for the single card rendered below.
 *
 * `HoverHelp` keeps the body mounted at all times (`<testId>-body`,
 * components/admin/HoverHelp.tsx:245), so no interaction is needed to read it.
 * The testid is per-item (`per-show-actionable-help-<key>`,
 * components/admin/PerShowActionableWarnings.tsx:177), hence the pattern match.
 */
function popoverText(): string {
  const bodies = screen.queryAllByTestId(/^per-show-actionable-help-.*-body$/);
  return bodies.map((el) => el.textContent ?? "").join(" ");
}

/** True when the card renders a help trigger at all. */
function hasTrigger(): boolean {
  return screen.queryAllByTestId(/^per-show-actionable-help-.*-trigger$/).length > 0;
}

function renderCard(code: string, followUpCopy?: string) {
  render(
    <PerShowActionableWarnings
      items={[warningFor(code)]}
      driveFileId={FIXTURE_DRIVE_FILE_ID}
      {...(followUpCopy !== undefined ? { followUpCopy } : {})}
    />,
  );
}

describe("published composition, over EVERY registered code", () => {
  // Iterating all 40 is what excludes an implementation that appends the
  // follow-up only for the code a sampled test happens to use (spec §12 test 6a).
  const codes = [...WARNING_CARD_COPY_CODES].sort();

  it("covers the full registry, so the loop below is not vacuous", () => {
    expect(codes.length).toBeGreaterThanOrEqual(40);
  });

  it.each(codes)("%s renders trigger context then the follow-up, in that order", (code) => {
    const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as
      | { triggerContext?: string | null }
      | undefined;
    const trigger = (entry?.triggerContext ?? "").trim();
    expect(trigger.length).toBeGreaterThan(0);

    renderCard(code, LOOP_SENTENCE);
    const text = popoverText();

    expect(text).toContain(trigger);
    expect(text).toContain(LOOP_SENTENCE);
    // ORDER is part of the contract: the trigger explains when the card
    // appears, the follow-up what to do after acting on it.
    expect(text.indexOf(trigger)).toBeLessThan(text.indexOf(LOOP_SENTENCE));
  });
});

describe("the four guard rows (spec §4.3)", () => {
  const CATALOGED = "UNKNOWN_FIELD";
  const UNCATALOGED = "NOT_A_REAL_CODE_FOR_TESTS";

  it("(b) trigger present, follow-up absent: the trigger alone. This is the staged case", () => {
    renderCard(CATALOGED);
    const entry = MESSAGE_CATALOG[CATALOGED] as { triggerContext?: string | null };
    const trigger = (entry.triggerContext ?? "").trim();
    expect(popoverText()).toContain(trigger);
    expect(popoverText()).not.toContain(LOOP_SENTENCE);
  });

  it("(c) trigger absent, follow-up present: the follow-up alone, and a trigger DOES render", () => {
    // The deliberate widening: an uncataloged code on the published surface now
    // gets a `?` where it previously got none, because there is real content.
    expect(MESSAGE_CATALOG[UNCATALOGED as keyof typeof MESSAGE_CATALOG]).toBeUndefined();
    renderCard(UNCATALOGED, LOOP_SENTENCE);
    expect(hasTrigger()).toBe(true);
    expect(popoverText()).toContain(LOOP_SENTENCE);
  });

  it("(d) both absent: no trigger at all, exactly as today", () => {
    renderCard(UNCATALOGED);
    expect(hasTrigger()).toBe(false);
  });
});

describe("(e) normalization, per input, over the whole blank domain", () => {
  // `String.prototype.trim` strips the ECMAScript WhiteSpace production, which
  // INCLUDES U+00A0. An earlier draft asserted the opposite from memory; `node
  // -e '" ".trim().length'` returns 0. Measure, do not recall.
  const BLANKS: { name: string; value: string | undefined }[] = [
    { name: "undefined", value: undefined },
    { name: "empty string", value: "" },
    { name: "space run", value: "   " },
    { name: "tab", value: "\t" },
    { name: "newline", value: "\n" },
    { name: "non-breaking space", value: " " },
  ];

  it.each(BLANKS)("followUpCopy $name behaves as ABSENT", ({ value }) => {
    renderCard("UNKNOWN_FIELD", value);
    expect(popoverText()).not.toContain(LOOP_SENTENCE);
  });

  it.each(BLANKS)("followUpCopy $name on an uncataloged code renders NO trigger", ({ value }) => {
    // A normalization that missed one of these would manufacture an empty
    // popover on every uncataloged card.
    renderCard("NOT_A_REAL_CODE_FOR_TESTS", value);
    expect(hasTrigger()).toBe(false);
  });
});

describe("(f) single-source consistency", () => {
  it("the rendered follow-up equals what correctionLoopCopy produces", () => {
    // A CONSISTENCY check, not the correctness oracle: the frozen literal above
    // pins the value. This catches a duplicate assembled from concatenated
    // fragments, which a source scan for a literal cannot.
    renderCard("UNKNOWN_FIELD", correctionLoopCopy("resync"));
    expect(popoverText()).toContain(LOOP_SENTENCE);
    expect(correctionLoopCopy("resync")).toBe(LOOP_SENTENCE);
  });
});

describe("the sentence rides only warnings with a cell to edit", () => {
  // Whole-diff review finding 3. Ungated, this handed DIAGRAMS_TAB_MISSING and
  // OPENING_REEL_PERMISSION_DENIED a brand-new popover whose ENTIRE content was
  // "Edit the cell" — advice that does not apply, on codes fixed in Drive or in
  // the sheet's tab structure, and which carry no `triggerContext` of their own.
  it("a cell-less warning with a registered trigger keeps the trigger and drops the follow-up", () => {
    render(
      <PerShowActionableWarnings
        items={[cellLessWarningFor("UNKNOWN_FIELD")]}
        driveFileId={FIXTURE_DRIVE_FILE_ID}
        followUpCopy={LOOP_SENTENCE}
      />,
    );
    const entry = MESSAGE_CATALOG.UNKNOWN_FIELD as { triggerContext?: string | null };
    const trigger = (entry.triggerContext ?? "").trim();
    expect(trigger.length).toBeGreaterThan(0);
    expect(popoverText()).toContain(trigger);
    expect(popoverText()).not.toContain(LOOP_SENTENCE);
  });

  it.each(["DIAGRAMS_TAB_MISSING", "OPENING_REEL_PERMISSION_DENIED"])(
    "%s gains NO popover, because it has neither a trigger nor a cell",
    (code) => {
      // Both are real codes with no `triggerContext` row, verified here rather
      // than assumed: if either ever gains one, this precondition fails loudly
      // instead of the test quietly asserting the wrong thing.
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as
        | { triggerContext?: string | null }
        | undefined;
      expect(entry?.triggerContext ?? null).toBeNull();

      render(
        <PerShowActionableWarnings
          items={[cellLessWarningFor(code)]}
          driveFileId={FIXTURE_DRIVE_FILE_ID}
          followUpCopy={LOOP_SENTENCE}
        />,
      );
      expect(hasTrigger()).toBe(false);
    },
  );

  it("and a cell-bearing warning of the SAME code does get it, so the gate is the cell", () => {
    render(
      <PerShowActionableWarnings
        items={[warningFor("UNKNOWN_FIELD")]}
        driveFileId={FIXTURE_DRIVE_FILE_ID}
        followUpCopy={LOOP_SENTENCE}
      />,
    );
    expect(popoverText()).toContain(LOOP_SENTENCE);
  });
});

describe("the ignored list makes no promise about clearing", () => {
  it("muted cards carry no follow-up sentence", () => {
    // impeccable critique P1a: "we'll re-read the sheet and clear this" is a
    // promise about work still to do. These are warnings the operator already
    // dismissed, so the sentence is wrong there even though it is right two
    // inches above in the active list.
    render(
      <PerShowActionableWarnings
        items={[warningFor("UNKNOWN_FIELD")]}
        driveFileId={FIXTURE_DRIVE_FILE_ID}
        tone="muted"
      />,
    );
    expect(popoverText()).not.toContain(LOOP_SENTENCE);
  });

  it("the published extras factory RENDERS it on active cards and not on ignored ones", () => {
    // BEHAVIORAL, not a source scan (whole-diff review B6/B7). The scan below
    // cannot see a value arriving through a spread, an alias, or a wrapper, and
    // it cannot see production passing the wrong string; this renders the real
    // factory and reads what an operator would read.
    const active = warningFor("UNKNOWN_FIELD");
    const ignored = { ...warningFor("UNKNOWN_FIELD"), rawSnippet: "Row | ignored one" };
    const fp = warningFingerprint(ignored);
    expect(fp, "the ignored fixture must be fingerprintable or nothing is ignored").not.toBeNull();

    const data = buildPublishedSectionData(fixtureSnapshot([active, ignored]) as never, {
      slug: FIXTURE_SLUG,
    });
    const bySection = buildSectionWarningModel({
      slug: FIXTURE_SLUG,
      warnings: [active, ignored],
      ignoredFingerprints: new Set([fp!]),
      renderedSectionIds: new Set<SectionId>(step3Sections(data).map((s) => s.id)),
    });
    // Both lists are populated, or "absent from the ignored list" is vacuous.
    expect(bySection.warnings?.active.length).toBe(1);
    expect(bySection.warnings?.ignored.length).toBe(1);

    render(<>{buildSectionWarningExtras({ bySection })("warnings", data)}</>);

    const active_list = screen.getByTestId("section-warning-active-warnings");
    const ignored_list = screen.getByTestId("section-ignored-warnings-warnings");
    // Scoped per list: a document-wide scan would find the active copy and
    // report the ignored list clean no matter what it renders.
    expect(textWithOwnedBodies(active_list)).toContain(LOOP_SENTENCE);
    expect(textWithOwnedBodies(ignored_list)).not.toContain(LOOP_SENTENCE);
  });

  it("and no OTHER list in the factory's output carries the sentence", () => {
    // Round 2: counting the literal `followUpCopy=` attribute is over-fitted —
    // a correct refactor passing it through a spread or wrapper would fail while
    // the rendered output stayed right. Asserted BEHAVIORALLY instead: render
    // the factory's whole output and confirm the sentence appears in exactly one
    // subtree, which catches a second mount without pinning the syntax.
    const active = warningFor("UNKNOWN_FIELD");
    const ignored = { ...warningFor("UNKNOWN_FIELD"), rawSnippet: "Row | ignored one" };
    const fp = warningFingerprint(ignored);
    expect(fp).not.toBeNull();

    const data = buildPublishedSectionData(fixtureSnapshot([active, ignored]) as never, {
      slug: FIXTURE_SLUG,
    });
    const bySection = buildSectionWarningModel({
      slug: FIXTURE_SLUG,
      warnings: [active, ignored],
      ignoredFingerprints: new Set([fp!]),
      renderedSectionIds: new Set<SectionId>(step3Sections(data).map((s) => s.id)),
    });

    // EVERY section the factory can render, not just "warnings" (round 3): a
    // duplicate mount added to the crew list would be invisible to a
    // single-section render. And occurrences are counted by SPLITTING the text,
    // so the sentence repeated twice inside one node is caught too.
    const sections = step3Sections(data).map((s) => s.id);
    expect(sections.length).toBeGreaterThan(1);

    let occurrences = 0;
    for (const id of sections) {
      const node = buildSectionWarningExtras({ bySection })(id, data);
      if (node === null) continue;
      const { container, unmount } = render(<>{node}</>);
      occurrences += textWithOwnedBodies(container).split(LOOP_SENTENCE).length - 1;
      unmount();
    }
    expect(occurrences, "the sentence renders exactly once across every section").toBe(1);
  });
});
