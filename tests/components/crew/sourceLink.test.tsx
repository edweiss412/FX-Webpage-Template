// @vitest-environment jsdom
/**
 * tests/components/crew/sourceLink.test.tsx (tile → source-sheet deep links, Task 8)
 *
 * <SourceLink> is the SUBTLE "In sheet" affordance that lives in a SectionCard's
 * header `action` slot and opens the source Google Sheet at the section's anchor.
 * It is intentionally recessive — a small spreadsheet glyph + short "In sheet"
 * label, low-contrast, never competing with the card title or its content.
 *
 * This suite pins:
 *   - it renders NOTHING when buildSheetDeepLink(driveFileId, anchor) returns null
 *     (the null-driveFileId case);
 *   - for a valid driveFileId + allowed anchor it renders a single <a> whose href
 *     EQUALS buildSheetDeepLink(driveFileId, anchor) — asserted against the helper
 *     output, NOT a hardcoded literal (anti-tautology) — opening in a new tab with
 *     a hardened rel and the descriptive aria-label.
 */
import { afterEach, expect, it, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import { buildSheetDeepLink, type SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

afterEach(cleanup);

// An allowed tab + gid + a1 → the helper emits a fully-anchored deep link.
const anchor: SourceAnchor = { title: "AGENDA", gid: 1234567, a1: "A1:F40" };
const driveFileId = "1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY";

test("renders nothing when buildSheetDeepLink returns null (driveFileId=null)", () => {
  const { container } = render(<SourceLink driveFileId={null} anchor={anchor} />);
  // Helper contract: a null driveFileId yields null → the component must too.
  expect(buildSheetDeepLink(null, anchor)).toBeNull();
  expect(container.querySelector("a")).toBeNull();
  expect(container).toBeEmptyDOMElement();
});

test("renders a subtle <a> whose href equals the helper output, opening a new tab safely", () => {
  const expectedHref = buildSheetDeepLink(driveFileId, anchor);
  // Guard: the fixture must actually produce a link (else the assertion is vacuous).
  expect(expectedHref).not.toBeNull();

  const { container } = render(<SourceLink driveFileId={driveFileId} anchor={anchor} />);
  const anchorEl = container.querySelector("a");
  expect(anchorEl).not.toBeNull();

  // Anti-tautology: assert against the helper's own output, not a literal URL.
  expect(anchorEl).toHaveAttribute("href", expectedHref!);
  expect(anchorEl).toHaveAttribute("target", "_blank");
  expect(anchorEl).toHaveAttribute("rel", "noopener noreferrer");
  expect(anchorEl).toHaveAttribute("aria-label", "View this section in the source sheet");

  // The recessive label is present for sighted users.
  expect(anchorEl!.textContent).toContain("In sheet");
});

test("renders the bare spreadsheet base link when no anchor is supplied", () => {
  // anchor omitted → helper returns the un-anchored /edit base (still a valid link).
  const expectedHref = buildSheetDeepLink(driveFileId);
  expect(expectedHref).not.toBeNull();

  const { container } = render(<SourceLink driveFileId={driveFileId} />);
  const anchorEl = container.querySelector("a");
  expect(anchorEl).not.toBeNull();
  expect(anchorEl).toHaveAttribute("href", expectedHref!);
});

// CARDREPORT-1: the recessive header link gets a ≥44px tap target via a
// transparent out-of-flow ::before overlay that grows in one direction only.
it("default (up): the <a> is a positioned host carrying a bottom-anchored 44px hit overlay", () => {
  const { container } = render(<SourceLink driveFileId={driveFileId} anchor={anchor} />);
  const c = container.querySelector('a[data-slot="source-link"]')!.getAttribute("class")!;
  // Failure mode caught: overlay omitted, or grown from the wrong edge (would
  // bleed downward into the interactive rows below in a SectionCard).
  expect(c).toContain("relative");
  expect(c).toContain("before:absolute");
  expect(c).toContain("before:inset-x-0");
  expect(c).toContain("before:bottom-0");
  expect(c).toContain("before:h-tap-min");
  expect(c).not.toContain("before:top-0");
});

it("down: the overlay is top-anchored instead (clears the agenda above the bare schedule header)", () => {
  const { container } = render(
    <SourceLink driveFileId={driveFileId} anchor={anchor} hitDirection="down" />,
  );
  const c = container.querySelector('a[data-slot="source-link"]')!.getAttribute("class")!;
  expect(c).toContain("before:top-0");
  expect(c).not.toContain("before:bottom-0");
});
