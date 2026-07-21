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
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/warning-surface-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import { correctionLoopCopy } from "@/components/admin/CorrectionLoopCallout";
import { WARNING_CARD_COPY_CODES } from "@/tests/messages/warningCardCopyRegistry";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { FIXTURE_DRIVE_FILE_ID } from "@/tests/helpers/warningSurfaceFixture";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

/** FROZEN literal (spec §12 test 6a). Not `correctionLoopCopy("resync")`:
 *  comparing rendered output to the helper that produced it gives the suite no
 *  independent oracle, so a wrong edit to the shared copy would change both
 *  together and pass. */
const LOOP_SENTENCE =
  "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.";

function warningFor(code: string): ParseWarning {
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

  it("the published extras factory passes it to the ACTIVE list only", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/admin/showpage/sectionWarningExtras.tsx"),
      "utf8",
    );
    // Exactly one followUpCopy mount, and the muted one is not it.
    expect((src.match(/followUpCopy=/g) ?? []).length).toBe(1);
    const mutedMount = src.slice(src.indexOf('tone="muted"') - 400, src.indexOf('tone="muted"'));
    // Match the JSX ATTRIBUTE, not the bare word: the muted mount carries a
    // comment naming followUpCopy to explain why it is absent.
    expect(mutedMount).not.toContain("followUpCopy=");
  });
});
