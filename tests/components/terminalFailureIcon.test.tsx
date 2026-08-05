// @vitest-environment jsdom
//
// BL-TERMINAL-FAILURE-ICON — the failure screen has no shape signal.
//
// `<TerminalFailure>` renders in the muted text palette on a centered block.
// DESIGN.md §1 rightly bans red/green as primary semantic colors, which leaves
// this surface with nothing but words to say it IS a failure: at a glance it
// reads like any other centered page. The entry's promotion mechanics are the
// contract — a lucide `AlertCircle` above the h1, at `--icon-lg` (32px), in
// `text-text-subtle`.
//
// ANTI-TAUTOLOGY. "An svg exists somewhere in the tree" is the assertion this
// suite refuses to be. What is actually pinned:
//   1. DOM ORDER — the icon must precede the h1. "Above the h1" is the whole
//      request; an icon rendered under the retry link satisfies a presence check
//      and satisfies nobody looking at the screen.
//   2. It is DECORATIVE — `aria-hidden`, contributing nothing to the accessible
//      name. The heading already says what happened, and an icon that announces
//      "alert circle" makes the screen-reader experience worse, not better.
//   3. The accessible text is UNCHANGED from before, asserted against the
//      heading and body strings rather than against a snapshot.
// The size and color are asserted as the tokens DESIGN.md names, not as
// arbitrary literals, so a later token rename fails here rather than drifting.
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TerminalFailure } from "@/components/auth/TerminalFailure";

afterEach(cleanup);

function iconOf(): SVGElement {
  const icon = screen.getByTestId("terminal-failure").querySelector("svg");
  if (!icon) throw new Error("no icon rendered in the terminal-failure block");
  return icon;
}

it("renders an icon BEFORE the heading, not merely somewhere on the page", () => {
  render(<TerminalFailure code="SYNC_INFRA_ERROR" />);
  const heading = screen.getByRole("heading", { level: 1 });
  // DOCUMENT_POSITION_FOLLOWING: the heading comes after the icon.
  expect(iconOf().compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("is decorative — hidden from assistive technology, adding no words", () => {
  render(<TerminalFailure code="SYNC_INFRA_ERROR" />);
  expect(iconOf()).toHaveAttribute("aria-hidden", "true");
  // And it contributes nothing to what is read: the block's text is the heading
  // plus the catalog body, with no icon label spliced in.
  const text = screen.getByTestId("terminal-failure").textContent ?? "";
  expect(text).not.toMatch(/alert|circle|icon|warning sign/i);
});

it("carries the documented size and color tokens, not arbitrary literals", () => {
  render(<TerminalFailure code="SYNC_INFRA_ERROR" />);
  // --icon-lg is 32px (DESIGN.md:382) = size-8 on the Tailwind scale.
  expect(iconOf()).toHaveClass("size-8");
  expect(iconOf()).toHaveClass("text-text-subtle");
});

it("leaves the existing copy and retry affordance untouched", () => {
  render(<TerminalFailure code="SYNC_INFRA_ERROR" retryHref="/show/east-coast" />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    /having trouble loading this show/i,
  );
  expect(screen.getByTestId("terminal-failure-retry")).toHaveAttribute("href", "/show/east-coast");
  // The icon is not a second interactive element competing with the retry link.
  expect(screen.getAllByRole("link")).toHaveLength(1);
});

it("renders the icon on the no-retry variant too", () => {
  // The rare-surface argument in the entry applies to BOTH variants; an icon
  // wired only into the retry branch would pass every case above.
  render(<TerminalFailure code="SYNC_INFRA_ERROR" />);
  expect(screen.queryByTestId("terminal-failure-retry")).toBeNull();
  expect(iconOf()).toBeInTheDocument();
});
