/**
 * Playwright E2E suite for the footer theme toggle.
 *
 * PRODUCT.md commits to a "clearly discoverable theme toggle [that] respects
 * `prefers-color-scheme` on first paint." This suite proves that wire-up is
 * real rather than a flag-lifecycle violation: the toggle writes, the write
 * persists, and the persisted value is applied BEFORE anything paints.
 *
 * REWRITTEN 2026-08-09 (spec docs/superpowers/specs/ci/
 * 2026-08-09-resurrect-mobile-safari-e2e-design.md §3.2). The previous file was
 * wholly `test.describe.skip` against the retired `?crew=`/`?as=admin` viewer
 * mock and the slug-only `/show/[slug]` route, which has no page.tsx — every
 * navigation in it 404'd. Theme PERSISTENCE is the one behavior in that dead set
 * covered nowhere else: crew-page.spec.ts touches only the instant `data-theme`
 * flip mid-crossfade, and tests/help/header.test.tsx mocks the component.
 *
 * RESOLUTION RECIPE IS PART OF THE TEST (spec §3.2, review R2 F2). The toggle
 * exists ONLY in the CrewShell's Footer (components/layout/Footer.tsx, rendered
 * via _CrewShell). An UNAUTHENTICATED share-token request renders
 * SignInOrSkipGate/PickerInterstitial instead, which has no footer and no
 * toggle — so a test that merely navigated would fail on a missing locator and
 * read as a product defect. Hence lookupSeededShow + share token +
 * signInAs(ADMIN_FIXTURE): the admin arm of resolveShowPageAccess renders the
 * CrewShell directly. The CONTRACT under test is identity-agnostic (any resolved
 * viewer gets the Footer toggle); the RESOLUTION is not.
 *
 * PROJECT HONESTY (spec §3.1/§3.2). This file carries NO
 * `testInfo.project.name` early-return: every case asserts behavior that is
 * identical under both projects, so both mobile-safari and desktop-chromium
 * genuinely execute it and both may be counted in the REQUIRED registry. A
 * project-gated no-op would be credited as coverage it does not provide.
 *
 * Production lines under test:
 *   - the `STORAGE_KEY` write in components/layout/ThemeToggle.tsx (flip())
 *   - the `NO_FOUC_SCRIPT` block in app/layout.tsx (:52), rendered as the FIRST
 *     child of <body> (:63, before GlobalErrorListener and children)
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";
const STORAGE_KEY = "fxav-theme";
/** DESIGN.md §3 `--spacing-tap-min`. */
const TAP_MIN = 44;
/** Subpixel tolerance for device-pixel-ratio rounding on a rect read. */
const TOL = 0.5;

type ThemeMutation = {
  value: string | null;
  readyState: string;
  /**
   * Rendered text length of everything in <body> that can PAINT at write time —
   * element children excluding script/style/link/template, summed. This is the
   * spec's no-FOUC contract made executable.
   *
   * Spec §3.2.2 drafted the assertion as `bodyChildCount <= 1`, reasoning that
   * the bootstrap script is the only child preceding its own write. Execution
   * disproved the literal bound while confirming the intent, twice over:
   *   - under the DEV server an extra `<script data-nextjs-dev-overlay="true">`
   *     precedes it, and
   *   - React streams an empty Suspense marker first, measured verbatim as
   *     `<div hidden=""><!--$--><!--/$--></div>`.
   * Neither paints. Counting raw children encodes those incidental wrappers;
   * counting PAINTED TEXT asserts what the spec's own words require ("no
   * paintable sibling content preceded the theme application") and reads the
   * same under dev and the production artifact.
   *
   * Body `textContent` is NOT usable here: it includes the inline bootstrap's
   * own source, so it is never 0 even when nothing has painted.
   *
   * This is the assertion that kills the end-of-<body> mutant. `readyState`
   * cannot: a script at the end of <body> still executes with readyState
   * "loading", so only the amount of content already parsed distinguishes it.
   */
  paintedTextLength: number;
  /** Element children of <body> at write time, abbreviated. Diagnostic only. */
  bodyTags: string;
};
/** Resolve the seeded Waldorf show + a share token for its crew route. */
async function lookupSeededShow(): Promise<{ slug: string; shareToken: string }> {
  // not-subject-to-meta: test-local fixture lookup, not a lib helper — no
  // _metaInfraContract registry row applies. Invariant 9's call-boundary
  // discipline still does: destructure { data, error }, distinguish a RETURNED
  // error from an empty result, and fail loud naming the site so a seed problem
  // is never mistaken for a product failure.
  const { data: show, error: showError } = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showError) {
    throw new Error(
      `theme-toggle.spec: shows lookup FAILED for drive_file_id=${SEED_DRIVE_FILE_ID}: ${showError.message}`,
    );
  }
  if (!show) {
    throw new Error(
      `theme-toggle.spec: seeded show not found (run \`pnpm db:seed\` first). ` +
        `drive_file_id=${SEED_DRIVE_FILE_ID}`,
    );
  }

  // not-subject-to-meta: same test-local fixture lookup as above.
  const { data: token, error: tokenError } = await admin
    .from("show_share_tokens")
    .select("share_token")
    .eq("show_id", show.id as string)
    .limit(1)
    .maybeSingle();
  if (tokenError) {
    throw new Error(
      `theme-toggle.spec: show_share_tokens lookup FAILED for show ${show.id}: ${tokenError.message}`,
    );
  }
  if (!token?.share_token) {
    throw new Error(`theme-toggle.spec: no share_token for show ${show.id} (run \`pnpm db:seed\`)`);
  }

  return {
    slug: show.slug as string,
    shareToken: token.share_token as string,
  };
}

test.describe("crew footer theme toggle — persistence, no-FOUC, a11y, tap target", () => {
  // First-hit cold render of the crew shell touches a wide module graph.
  test.setTimeout(120_000);

  let slug = "";
  let shareToken = "";

  test.beforeAll(async () => {
    const seeded = await lookupSeededShow();
    slug = seeded.slug;
    shareToken = seeded.shareToken;
  });

  test.beforeEach(async ({ page }) => {
    // Deterministic starting theme. The no-FOUC script falls back to
    // matchMedia when localStorage holds no value, so without pinning the
    // emulated colour scheme the initial theme would depend on the runner.
    await page.emulateMedia({ colorScheme: "light" });

    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  /**
   * Suppress the Next DEV overlay for the CURRENT document. It is a
   * `<nextjs-portal>` custom element the dev server injects over the bottom of
   * the viewport — where the footer lives — and Playwright correctly refuses the
   * click with "<nextjs-portal> … intercepts pointer events". CI runs the
   * PRODUCTION artifact (`pnpm build && pnpm start`), which never emits the
   * element, so this is a no-op there; without it the suite cannot be verified
   * locally at all.
   *
   * Deliberately NOT `click({ force: true })`: forcing switches off the
   * actionability checks for the real button too, so a genuinely obscured or
   * undersized toggle would start passing.
   *
   * Re-applied per navigation via addStyleTag (a real <head> insertion): a
   * reload discards the injected <style>, and a <style> appended to
   * documentElement at document_start is not reliably applied — measured on this
   * branch, the portal still intercepted with the init-script form in place.
   */
  async function hideDevOverlay(page: Page): Promise<void> {
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  }

  /**
   * Land on the crew route with the CrewShell (and therefore the Footer) up.
   *
   * Width 760 is load-bearing, and NOT a convenience. At 390px the crew
   * sub-nav's fixed bottom bar (`min-[720px]:hidden fixed inset-x-0 bottom-0`,
   * components/crew/CrewSubNav.tsx:155) overlaps the footer's theme toggle, and
   * the page is not padded to clear it. Measured on the seeded route at 390x844,
   * scrolled fully to the bottom:
   *
   *   toggle top 775.6 bottom 819.6 · bar top 790.7 bottom 844 · overlaps true
   *   document.elementFromPoint(toggle centre) -> the BAR's <svg>
   *   getComputedStyle(document.body).paddingBottom -> "0px"
   *
   * so the toggle's centre is genuinely un-tappable there and no amount of
   * scrolling clears it (the document bottom is already at the viewport bottom).
   * That obstruction is a PRODUCT defect, filed as
   * BL-CREW-FOOTER-OBSCURED-BY-FIXED-BOTTOM-BAR with this probe attached — it is
   * a design call (how the footer should clear the mobile bar) this arc does not
   * settle. It is NOT worked around by clicking a sliver or hiding product
   * chrome: the bar is `min-[720px]:hidden`, so at >=720px it does not render and
   * the toggle is reachable exactly as a real user finds it. The theme contract
   * under test (write, persist, restore, announce) is viewport-independent; the
   * mobile tap floor is asserted separately, at 390px, by the tap-target case.
   */
  async function gotoCrewShell(page: Page): Promise<void> {
    await page.setViewportSize({ width: 760, height: 1000 });
    // Retried, because two things here are slow rather than wrong: the admin
    // session set by signInAs has to be visible to the SSR request (until it is,
    // resolveShowPageAccess renders SignInOrSkipGate and `crew-shell` never
    // appears), and a cold dev server compiles this route on first hit. Neither
    // can mask a broken route — one that never renders the shell still fails on
    // the outer timeout, naming the same locator.
    await expect(async () => {
      const res = await page.goto(`/show/${slug}/${shareToken}?s=today`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status(), `crew route /show/${slug}/${shareToken} must render`).toBe(200);
      await expect(page.getByTestId("crew-shell")).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 90_000 });
    // Readiness gate: the toggle itself, before any interaction.
    await expect(page.getByTestId("theme-toggle")).toBeVisible({ timeout: 15_000 });
    await hideDevOverlay(page);
  }

  /** A reload plus the gates every post-reload assertion depends on. */
  async function reloadCrewShell(page: Page): Promise<void> {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("theme-toggle")).toBeVisible({ timeout: 15_000 });
    await hideDevOverlay(page);
  }

  const appliedTheme = (page: Page) =>
    page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const storedTheme = (page: Page) =>
    page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);

  /**
   * Wait until the toggle is INTERACTIVE, not merely present.
   *
   * ThemeToggle is a client island (`"use client"`). Before React hydrates it, the
   * button is SSR markup with NO onClick, so a tap is silently a no-op: visible,
   * enabled, stable, dispatched — and nothing happens. Measured on this branch
   * under TZ=UTC (the CI runner's zone), where the SSR/CSR hero mismatch widens
   * React's regeneration window.
   *
   * The gate is React's own marker: hydration attaches a `__reactProps$…` key to
   * the DOM node. That is deterministic — unlike `networkidle`, which is a
   * heuristic the plan's harness checklist rules out as a readiness gate.
   */
  async function waitForToggleHydrated(page: Page): Promise<void> {
    await expect(page.getByTestId("theme-toggle")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="theme-toggle"]');
        return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps$"));
      },
      undefined,
      { timeout: 30_000 },
    );
  }

  /**
   * Tap the toggle ONCE and assert the theme reaches `expected`.
   *
   * The single tap is the contract, and it is deliberately NOT retried. An earlier
   * version of this helper wrapped the click in `toPass`, which made it pass when
   * the first tap did nothing and a later one worked — masking exactly the
   * one-tap regression this suite is the unique cover for (whole-diff review
   * round 3, P1). Readiness is handled where readiness belongs, above; if the
   * island is not interactive yet, that gate fails and says so, rather than the
   * suite quietly accepting a toggle that needs two taps.
   */
  async function tapToggle(page: Page, expected: "light" | "dark"): Promise<void> {
    await waitForToggleHydrated(page);
    await page.getByTestId("theme-toggle").click();
    await expect.poll(() => appliedTheme(page), { timeout: 10_000 }).toBe(expected);
  }

  test("persistence: a tap flips data-theme, writes localStorage, and survives a reload — BOTH directions", async ({
    page,
  }) => {
    await gotoCrewShell(page);
    // Pin the starting point explicitly rather than assuming the emulated
    // scheme won: if the app ever stopped applying it, the assertions below
    // would otherwise silently invert.
    expect(await appliedTheme(page), "seeded starting theme is light").toBe("light");

    // ── light → dark ──
    await tapToggle(page, "dark");
    expect(await storedTheme(page), `the tap must write ${STORAGE_KEY}`).toBe("dark");

    await reloadCrewShell(page);
    expect(await appliedTheme(page), "dark must survive a reload").toBe("dark");
    expect(await storedTheme(page), "the stored value must survive a reload").toBe("dark");

    // ── dark → light ── the reverse branch is part of the contract, not a
    // symmetry assumption: flip() computes `next` from the CURRENT theme, so a
    // one-directional test passes against a write that is hardcoded to "dark".
    await tapToggle(page, "light");
    expect(await storedTheme(page), "the reverse tap must write light").toBe("light");

    await reloadCrewShell(page);
    expect(await appliedTheme(page), "light must survive a reload").toBe("light");
    expect(await storedTheme(page), "the stored light value must survive a reload").toBe("light");
  });

  test("no-FOUC: the persisted theme is applied during parse, before any paintable sibling exists", async ({
    page,
  }) => {
    await gotoCrewShell(page);
    await tapToggle(page, "dark");

    // The oracle. Installed BEFORE the reload, so it runs ahead of every page
    // script on the next navigation and can observe the bootstrap's own write.
    //
    // Asserting "data-theme is dark after load" would pass against a
    // DOMContentLoaded handler — i.e. against a real flash. Asserting the
    // bootstrap ran with NO body would be unsatisfiable: the live script IS the
    // first child of <body> (app/layout.tsx:63), so document.body necessarily
    // exists when it executes. What actually distinguishes correct placement is
    // the PAIR (readyState, paintedTextLength) at mutation time — see the
    // ThemeMutation docblock for why painted text, and not a raw child count,
    // is the discriminator the spec ratified.
    await page.addInitScript(() => {
      const w = window as unknown as { __themeMutations?: ThemeMutation[]; __themeErr?: string };
      w.__themeMutations = [];
      w.__themeErr = "";
      try {
        const record = (): void => {
          const painted = document.body
            ? [...document.body.children].filter(
                (el) => !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName),
              )
            : [];
          w.__themeMutations!.push({
            // documentElement can be absent this early; a throw here would kill
            // the observer before it installs and leave the oracle silently
            // empty (measured on this branch — the array came back undefined).
            value: document.documentElement
              ? document.documentElement.getAttribute("data-theme")
              : null,
            readyState: document.readyState,
            paintedTextLength: painted.reduce(
              (n, el) => n + (el.textContent ?? "").trim().length,
              0,
            ),
            bodyTags: painted.map((el) => el.tagName).join(",") || "(none)",
          });
        };
        // The attribute's state when this script runs, before any page script.
        record();
        // Observed on `document` (always present at document_start) with
        // subtree, so an <html> that does not exist yet is still covered once
        // the parser creates it.
        new MutationObserver(record).observe(document, {
          subtree: true,
          attributes: true,
          attributeFilter: ["data-theme"],
        });
      } catch (err) {
        w.__themeErr = String(err);
      }
    });

    await reloadCrewShell(page);
    const oracle = await page.evaluate(() => {
      const w = window as unknown as { __themeMutations?: ThemeMutation[]; __themeErr?: string };
      return { mutations: w.__themeMutations ?? [], err: w.__themeErr ?? "(unset)" };
    });
    const mutations = oracle.mutations;
    // Fail loudly with the cause rather than as a confusing empty-array
    // assertion: an oracle that recorded nothing proves nothing.
    expect(
      mutations.length,
      `the no-FOUC oracle recorded no mutations; in-page error: ${oracle.err}`,
    ).toBeGreaterThan(0);

    // Premise: the observer really was installed ahead of the bootstrap. Its
    // own first record is taken before any page script runs, so the attribute
    // must still be unset there. If this ever held "dark", the observer would
    // be running LATE and every assertion below would be about the wrong frame.
    expect(
      mutations[0]?.value,
      "the oracle must be installed before the no-FOUC bootstrap writes",
    ).toBeNull();

    const applied = mutations.find((m) => m.value === "dark");
    expect(applied, "the persisted theme must be applied on load").toBeDefined();
    // A DOMContentLoaded-handler mutant fails here ("interactive").
    expect(
      applied!.readyState,
      "the theme must be applied DURING parse, not after DOMContentLoaded",
    ).toBe("loading");
    // An end-of-<body> mutant fails here: by then the page's real content has
    // parsed as earlier siblings, so painted text is thousands of characters.
    // Correct placement paints nothing — only a hidden Suspense marker and
    // scripts precede the write. See ThemeMutation above for why this, and not
    // a child count or body textContent, is the discriminator.
    expect(
      applied!.paintedTextLength,
      `no paintable sibling may precede the theme write ` +
        `(paintable body children at write time: ${applied!.bodyTags})`,
    ).toBe(0);
  });

  test("a11y: aria-pressed and the accessible name track the theme across the cycle", async ({
    page,
  }) => {
    await gotoCrewShell(page);
    const toggle = page.getByTestId("theme-toggle");

    // Light: not pressed, and the name states the ACTION a tap performs.
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toHaveAttribute("aria-label", "Switch to dark theme");

    await tapToggle(page, "dark");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toHaveAttribute("aria-label", "Switch to light theme");

    // …and the restored theme drives them after a reload, not just the click.
    await reloadCrewShell(page);
    const restored = page.getByTestId("theme-toggle");
    await expect(restored).toHaveAttribute("aria-pressed", "true");
    await expect(restored).toHaveAttribute("aria-label", "Switch to light theme");
  });

  test(`tap target: the toggle is at least ${TAP_MIN}x${TAP_MIN}px`, async ({ page }) => {
    await gotoCrewShell(page);
    // Asserted at the MOBILE width under both projects — the tap floor is a
    // mobile contract, and measuring it only at 760px would let a
    // narrow-viewport regression through. Measuring needs no click, so the
    // bottom-bar obstruction above does not apply here.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("theme-toggle")).toBeVisible();
    const box = await page.getByTestId("theme-toggle").boundingBox();
    expect(box, "the toggle must have a laid-out box").not.toBeNull();
    expect(
      box!.width,
      `toggle width must clear the ${TAP_MIN}px tap floor; got ${box!.width}`,
    ).toBeGreaterThanOrEqual(TAP_MIN - TOL);
    expect(
      box!.height,
      `toggle height must clear the ${TAP_MIN}px tap floor; got ${box!.height}`,
    ).toBeGreaterThanOrEqual(TAP_MIN - TOL);
  });
});
