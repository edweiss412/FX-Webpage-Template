// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/WizardFooter.test.tsx
 *
 * Pins the presentational contract of <WizardFooter> — the shared sticky
 * footer used by every onboarding-wizard step. The component owns layout +
 * stickiness ONLY; each step supplies its own back / center / primary controls.
 *
 * Contract (footer portal + header-width match, 2026-07-05):
 *   - it PORTALS its fixed bar to document.body so it escapes the wizard
 *     content's stacking context. app/admin/layout.tsx wraps page content in
 *     <PageTransition> (a framer-motion element whose settled inline transform
 *     opens a new stacking context); a fixed footer authored INSIDE that
 *     subtree is confined to it, so the layout's fixed mobile bottom tab bar
 *     (a SIBLING of PageTransition, z-30) paints over the footer regardless of
 *     the footer's own z-index. Portaling to <body> lifts the footer into the
 *     root stacking context where z-40 wins. (Mount-gated: renders null until
 *     mounted, so the portal never runs during SSR.)
 *   - the fixed wrapper is `fixed inset-x-0 bottom-0 z-40`;
 *   - the bar is capped to the admin-shell container (mx-auto max-w-[1600px]
 *     px-page-pad-*) so its top rule + width MATCH <OnboardingTopBar> (the
 *     onboarding header) rather than bleeding full-viewport;
 *   - `primary` always renders; `center` and `back` render only when given;
 *   - when `back` is omitted a hidden spacer keeps `primary` right-aligned.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { WizardFooter } from "@/components/admin/wizard/WizardFooter";

afterEach(() => cleanup());

describe("WizardFooter", () => {
  test("portals a fixed bottom bar (z-40) to document.body and renders the primary slot", () => {
    render(<WizardFooter primary={<button>Continue</button>} />);
    const footer = screen.getByTestId("wizard-footer");
    // Portaled OUT of the render container, into document.body, so it escapes
    // the PageTransition transform's stacking context.
    expect(footer.closest("body")).toBe(document.body);
    expect(footer.className).toContain("fixed");
    expect(footer.className).toContain("inset-x-0");
    expect(footer.className).toContain("bottom-0");
    // z-40 beats the layout's z-30 mobile bottom tab bar once portaled to root.
    expect(footer.className).toContain("z-40");
    expect(footer.textContent).toContain("Continue");
  });

  test("bar is capped to the admin-shell container so it matches the onboarding header width", () => {
    render(<WizardFooter primary={<button>Go</button>} />);
    const footer = screen.getByTestId("wizard-footer");
    // The shell container mirror (mx-auto max-w-[1600px] + page padding) is what
    // aligns the bar's rule + content edges with <OnboardingTopBar>.
    const shell = footer.querySelector(".mx-auto.max-w-\\[1600px\\]");
    expect(shell).not.toBeNull();
    expect(shell!.className).toContain("px-page-pad-mobile");
    expect(shell!.className).toContain("sm:px-page-pad-desktop");
    // The visible bar is an OPAQUE page-background fill (bg-bg) + a hairline
    // border-t rule on the inner row, capped to the shell width. The fill hides
    // scrolling content behind the bar; the rule gives it a crisp top edge (owner
    // decision 2026-07-06). The full-bleed fixed wrapper carries neither.
    const inner = screen.getByTestId("wizard-footer-inner");
    expect(inner.className).toContain("bg-bg");
    expect(inner.className).toContain("border-t");
    expect(footer.className).not.toContain("border-t");
    expect(footer.className).not.toContain("bg-bg");
  });

  test("renders back and center slots when provided", () => {
    render(
      <WizardFooter
        back={<a data-testid="my-back">Back</a>}
        center={<span data-testid="my-center">3 of 4 selected</span>}
        primary={<button>Publish</button>}
      />,
    );
    const footer = screen.getByTestId("wizard-footer");
    expect(within(footer).getByTestId("my-back")).toBeTruthy();
    expect(within(footer).getByTestId("my-center").textContent).toContain("3 of 4 selected");
    expect(within(footer).queryByTestId("wizard-footer-back-spacer")).toBeNull();
  });

  test("omits back → renders a hidden spacer so primary stays right-aligned", () => {
    render(<WizardFooter primary={<button>Continue</button>} />);
    const footer = screen.getByTestId("wizard-footer");
    const spacer = within(footer).getByTestId("wizard-footer-back-spacer");
    expect(spacer.getAttribute("aria-hidden")).toBe("true");
    expect(within(footer).queryByTestId("my-back")).toBeNull();
  });
});
