/**
 * tests/e2e/control-outline-pill.route.spec.ts
 *
 * The FIFTH surface of AC-13, and the only one measured on a production route.
 *
 * WHY IT IS NOT IN `control-outline-contrast.live.spec.ts` with the other four.
 * `components/admin/OnboardingWizard.tsx` is a SERVER component whose module
 * scope constructs a Supabase server client, so a client bundle cannot mount it
 * (probe and reasoning in `_controlOutlineAdminSurfacesEntry.tsx`). That forces
 * a real-route navigation, and a real Next document loads the app's own font
 * faces — which the shared font-fidelity fixture's oracle rightly refuses,
 * because a harness built by `compileEntryCss` emits Inter and nothing else.
 * Its refusal is correct and this file is the resolution: a spec that does not
 * call `compileEntryCss` binds `test` from Playwright, is outside that oracle's
 * subject, and leaves the oracle undiluted for the harness specs it guards.
 *
 * WHAT IT ASSERTS: the computed border colour of the step indicator's DONE pill
 * against the ground behind it, at 390px, in both themes, over the 3:1 non-text
 * floor (SC 1.4.11). Observed RED at 1.59 light / 1.60 dark with the pre-sweep
 * token planted back.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { enterWizardAdminState } from "./helpers/dashboardState";

const MOBILE = { width: 390, height: 900 } as const;
const FLOOR = 3.0;

/**
 * The computed outline colour of a selector, the first opaque background above
 * it, and the WCAG ratio between them. A copy of the harness spec's reader by
 * intent rather than by accident: sharing it would put this file back in the
 * import graph the font oracle's subject is derived from.
 */
async function outlineContrast(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const parse = (c: string): [number, number, number] | null => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      if (m[4] !== undefined && Number(m[4]) === 0) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };
    const lum = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const border = parse(getComputedStyle(el).borderTopColor);
    let node: Element | null = el;
    let bg: [number, number, number] | null = null;
    while (node && !bg) {
      bg = parse(getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    if (!border || !bg) return { border: null, bg: null, ratio: null };
    const [hi, lo] = [lum(border), lum(bg)].sort((a, b) => b - a) as [number, number];
    return {
      border: getComputedStyle(el).borderTopColor,
      bg: bg.join(","),
      ratio: (hi + 0.05) / (lo + 0.05),
    };
  }, selector);
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: the wizard step indicator's DONE pill clears the 3:1 non-text floor`, async ({
    page,
  }) => {
    // The ONE surface of the five measured on its real route rather than in the
    // static harness, because `OnboardingWizard.tsx` is a server component and
    // a client bundle is the wrong vehicle for it (the entry file carries the
    // probe). `?step=2` is the cheapest state where a pill is DONE: `isDone` is
    // `n < step`, so pill 1 is done and pill 2 is current.
    //
    // Two pieces of setup, both load-bearing, both learned by watching this case
    // fail without them. The wizard renders only while onboarding is INCOMPLETE
    // and the shared e2e database does not sit in that state, so
    // `enterWizardAdminState` puts it there and the finally puts it back. And
    // signOut precedes signIn, exactly as
    // tests/e2e/onboarding-wizard-step1.spec.ts does it.
    const restore = await enterWizardAdminState();
    try {
      await signOut(page);
      await signInAs(page, ADMIN_FIXTURE);
      // `emulateMedia`, NOT a `data-theme` write. The static harness pages have
      // no theme system so stamping the attribute is fine there; the real route
      // does, and a run that stamped it read a colour from the OTHER theme
      // against this theme's background — a ratio that belonged to neither.
      // globals.css keys dark off `prefers-color-scheme` for exactly this case.
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
      await page.setViewportSize(MOBILE);
      await page.goto("/admin?step=2");
      await page.evaluate(() => document.fonts.ready);

      await expect(
        page.locator("[data-testid=onboarding-wizard]"),
        "the wizard itself renders, so a missing pill below is a pill problem",
      ).toBeVisible();
      // The painted `-visual` span exists only on a REACHABLE pill (the Link
      // branch); an unreachable one paints on the bare testid instead. Asserting
      // it is what distinguishes "the done pill is fine" from "the pill rendered
      // in its other shape and this case measured nothing".
      const done = page.locator('[data-testid="wizard-step-indicator-1-visual"]');
      await expect(done, "pill 1 mounts its painted visual at step 2").toHaveCount(1);
      // The arm is asserted, not assumed: reading the CURRENT pill instead would
      // measure a state this sweep never touched, and would still pass.
      await expect(
        page.locator('[data-testid="wizard-step-indicator-2"][aria-current="step"]'),
        "step 2 is the current step, so pill 1 is the DONE arm",
      ).toHaveCount(1);

      const measured = await outlineContrast(
        page,
        '[data-testid="wizard-step-indicator-1-visual"]',
      );
      expect(measured!.ratio, `${theme}: ${measured!.border} on ${measured!.bg}`).not.toBeNull();
      expect(
        measured!.ratio!,
        `${theme}: ${measured!.border} on ${measured!.bg}`,
      ).toBeGreaterThanOrEqual(FLOOR);
    } finally {
      await restore();
    }
  });
}
