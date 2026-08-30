// @vitest-environment jsdom
/**
 * tests/help/tour-transitions.test.tsx
 *
 * Characterization coverage for the /help/tour transition inventory (spec §5).
 *
 * THIS SUITE HAS NO RED-GREEN CYCLE, deliberately, and the plan says so. Production
 * already satisfies every row: the cards carry `transition-colors`, and the page has no
 * AnimatePresence, no conditional render and no exit animation. A test written against
 * already-correct behaviour passes the moment it is authored, which is the shape
 * docs/agents/writing-plans.md rejects for a red contract. Dressing it as one would have
 * made the plan's red contract say something false about this task.
 *
 * It still earns its place: it pins the inventory so a later change to the cards has
 * something to break, and it records WHICH rows were verified rather than leaving "the
 * transitions are fine" as an assertion nobody can check.
 */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";
import { premise } from "@/tests/_shared/premise";

const src = readFileSync(join(process.cwd(), "app/help/tour/page.mdx"), "utf8");

describe("/help/tour transition inventory (spec §5)", () => {
  it("rest to hover is a border-color transition, on every card", async () => {
    const Mod = await import("@/app/help/tour/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );

    const cards = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[data-tour-card]"));
    // Without this the two assertions below hold vacuously over an empty list —
    // the same shape the coverage guard's own premise exists to catch.
    premise("the tour renders card anchors", cards.length, 0);

    for (const card of cards) {
      const cls = card.getAttribute("class") ?? "";
      expect(cls, `card ${card.getAttribute("href")} animates the transition`).toContain(
        "transition-colors",
      );
      expect(cls, `card ${card.getAttribute("href")} changes border on hover`).toMatch(
        /hover:border-/,
      );
    }
  });

  it("the focus ring APPEARS instantly, and its colour is not excluded from the card's transition", () => {
    // This row said "instant" and asserted only the ABSENCE of focus-scoped
    // transition utilities. That absence is real and still asserted below, but it
    // was never the whole claim: Tailwind 4's `transition-colors` includes
    // `outline-color` (verified against this repo's own 4.2.4 build), and the cards
    // carry it UNSCOPED, so the focus ring's colour is inside the transitioned
    // property set. "No focus-scoped utility" and "nothing transitions on focus"
    // are different statements, and the test only ever checked the first.
    //
    // What is actually true, and what this now pins: the ring's APPEARANCE is
    // instant because `outline-style` is not an animatable property — going from
    // no outline to `3px solid` cannot interpolate — while its COLOUR is subject
    // to the anchor's pre-existing `transition-colors`. Both halves are
    // pre-existing and unchanged by this branch; the defect was the description.
    const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(
      globals,
      "the focus ring is a global :focus-visible rule, not a per-card animation",
    ).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid/);
    expect(globals, "the ring must not declare its own transition").not.toMatch(
      /:focus-visible\s*\{[^}]*transition/,
    );
    // The absence the original row asserted, kept: no focus-SCOPED animation is
    // declared on this page, so nothing overrides the two facts above.
    expect(src, "no focus-scoped transition utility").not.toMatch(/focus(-visible)?:transition/);
    expect(src, "no focus-scoped animation utility").not.toMatch(/focus(-visible)?:animate-/);
  });

  it("the page declares no presence, exit or conditional-render animation", () => {
    // Compound transitions cannot exist without one of these, so their absence is
    // what makes the inventory's three rows the complete set rather than a sample.
    expect(src, "no AnimatePresence").not.toContain("AnimatePresence");
    expect(src, "no motion component").not.toMatch(/<motion\./);
    expect(src, "no exit prop").not.toMatch(/\bexit=/);
    expect(src, "no animate prop").not.toMatch(/\banimate=/);
  });
});
