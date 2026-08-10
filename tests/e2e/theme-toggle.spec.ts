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
 * moved to the crew page HEADER on 2026-08-09 (UI spec §2.3) and now has two
 * forms: an identity-less page renders the STANDALONE toggle in the header's
 * right slot, and a page with a resolved crew identity carries the switch inside
 * the avatar menu. This suite's admin-fixture recipe resolves `identityChip=null`
 * — the admin arm of resolveShowPageAccess renders the CrewShell without a
 * picker identity — so it drives the STANDALONE form, which is the one whose
 * persistence and no-FOUC contract this file has always been about. The
 * avatar-menu form is driven by its own arm below. An UNAUTHENTICATED share-token request renders
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
   * Land on the crew route with the header chrome up.
   *
   * AT 390px, the mobile width this product is designed for. The previous
   * version ran at 760 and said why: at 390 the crew sub-nav's fixed bottom bar
   * overlapped the FOOTER's theme toggle, `document.elementFromPoint` at the
   * toggle's centre returned the BAR's svg, and no amount of scrolling cleared
   * it. That obstruction was real and it was filed, with that probe attached, as
   * BL-CREW-FOOTER-OBSCURED-BY-FIXED-BOTTOM-BAR.
   *
   * BOTH halves of the workaround's premise are now gone. The shell pads below
   * the footer so its box clears the bar (UI spec §2.1), and the toggle itself
   * left the footer for the header (§2.3), where nothing has ever overlapped it.
   * Running at 760 would now be testing a width no crew member uses, to dodge a
   * defect that no longer exists.
   */
  async function gotoCrewShell(page: Page): Promise<void> {
    await page.setViewportSize({ width: 390, height: 844 });
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

    // Resolved BY ROLE AND ACCESSIBLE NAME, not by testid + aria-* attributes.
    // Attribute assertions alone are satisfiable by markup that exposes nothing:
    // adding `aria-hidden="true"`, or swapping the <button> for a <div>, keeps
    // every attribute intact while removing the named button from the
    // accessibility tree entirely (whole-diff review round 6, P1). getByRole
    // consults the computed accessible name, so both mutants stop resolving.
    const named = (name: string) => page.getByRole("button", { name });

    // Light: the name states the ACTION a tap performs, and it is not pressed.
    await expect(named("Switch to dark theme")).toBeVisible();
    await expect(named("Switch to dark theme")).toHaveAttribute("aria-pressed", "false");

    await tapToggle(page, "dark");
    await expect(named("Switch to light theme")).toBeVisible();
    await expect(named("Switch to light theme")).toHaveAttribute("aria-pressed", "true");
    // The old name must be GONE, not merely joined by the new one.
    await expect(named("Switch to dark theme")).toHaveCount(0);

    // …and the restored theme drives them after a reload, not just the click.
    await reloadCrewShell(page);
    await expect(named("Switch to light theme")).toBeVisible();
    await expect(named("Switch to light theme")).toHaveAttribute("aria-pressed", "true");
  });

  test(`tap target: the toggle is at least ${TAP_MIN}x${TAP_MIN}px`, async ({ page }) => {
    await gotoCrewShell(page);
    // The tap floor is a MOBILE contract and `gotoCrewShell` now lands at 390px,
    // so this case no longer has to re-set the viewport to escape a workaround
    // width. Kept explicit anyway: the assertion is about 390 specifically, and
    // a future change to the helper's default must not silently move what this
    // measures.
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

/**
 * ARM (b) — the theme switch inside the header AVATAR MENU.
 *
 * Spec: docs/superpowers/specs/2026-08-09-crew-chrome-wizard-connector.md §2.3
 * Plan: docs/superpowers/plans/2026-08-09-quick-wins-2/plan.md, Task B4
 *
 * The suite above drives the STANDALONE toggle, because its admin-fixture recipe
 * resolves `identityChip=null`. A crew member with a resolved identity gets a
 * different control entirely — the switch lives behind the avatar — and that
 * form has no coverage anywhere else. So this arm establishes a real crew
 * identity through the picker and drives the menu.
 *
 * CHROMIUM-GATED, and the reason is a measured browser limit rather than a
 * preference: over plain http WebKit refuses to STORE the server's own
 * Set-Cookie for the `__Host-`-prefixed, Secure picker envelope, so a selection
 * never persists and a correct implementation reads as broken. That is why
 * `picker-flow.spec.ts` lives in desktop-chromium too. Skipping is declared out
 * loud rather than silently returning early, so this never counts as coverage it
 * does not provide.
 *
 * THE 44px FLOOR IS MEASURED HERE, NOT ASSERTED AS CLASSES. The jsdom suite
 * (tests/components/auth/avatarMenu.test.tsx) pins that the trigger and both
 * rows carry the tap-floor TOKENS; jsdom computes no layout, so a control the
 * cascade had collapsed would pass there. Real geometry is this file's job.
 */
test.describe("crew avatar menu — theme switch behind a resolved identity", () => {
  test("opens the menu, flips the theme, and every target clears the tap floor at 390px", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "picker identity does not persist under WebKit over plain http (__Host- cookie); " +
        "picker-flow.spec.ts is desktop-chromium for the same reason",
    );

    const { slug, shareToken } = await lookupSeededShow();
    await page.setViewportSize({ width: 390, height: 844 });

    // Establish a crew identity the way a crew member does: land unauthenticated,
    // meet the picker, tap a name.
    await signOut(page);
    await expect(async () => {
      const res = await page.goto(`/show/${slug}/${shareToken}`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status(), `crew route must render`).toBe(200);
      await expect(page.getByTestId("picker-interstitial-root")).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 90_000 });

    const firstRow = page.locator('[data-testid="picker-roster-row"]').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page.getByTestId("crew-shell")).toBeVisible({ timeout: 30_000 });

    // HYDRATION GATE on the island itself, not `networkidle`: the picker recipe's
    // own gates prove the crew shell rendered, which is a SERVER fact and says
    // nothing about whether this client island has hydrated. The bounded
    // open-retry is the actual readiness signal — a menu that never opens fails
    // on the outer timeout naming this locator, rather than on a click that
    // silently did nothing.
    const trigger = page.getByTestId("avatar-menu-trigger");
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      await trigger.click();
      await expect(page.getByRole("menu")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    const themeRow = page.getByTestId("avatar-menu-theme");
    const personRow = page.getByTestId("avatar-menu-switch-person");
    await expect(themeRow).toBeVisible();

    // Geometry, at the mobile width, on all three targets — the half jsdom cannot do.
    for (const [label, locator] of [
      ["avatar trigger", trigger],
      ["theme row", themeRow],
      ["switch-person row", personRow],
    ] as const) {
      const box = await locator.boundingBox();
      expect(box, `${label} must have a laid-out box`).not.toBeNull();
      expect(
        box!.height,
        `${label} height must clear the ${TAP_MIN}px tap floor; got ${box!.height}`,
      ).toBeGreaterThanOrEqual(TAP_MIN - TOL);
    }
    // The trigger is a circular target, so its WIDTH is a floor too; the rows are
    // full-width menu items and their width is not the constraint.
    const triggerBox = await trigger.boundingBox();
    expect(
      triggerBox!.width,
      `avatar trigger width must clear the ${TAP_MIN}px tap floor; got ${triggerBox!.width}`,
    ).toBeGreaterThanOrEqual(TAP_MIN - TOL);

    // The switch itself: activating the row flips the applied theme and does NOT
    // close the menu.
    const before = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
    await themeRow.click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.theme ?? null))
      .not.toBe(before);
    await expect(
      page.getByRole("menu"),
      "the menu must stay open across a theme flip",
    ).toBeVisible();
    expect(
      await page.evaluate(() => window.localStorage.getItem("fxav-theme")),
      "the flip must persist through the same localStorage key the standalone toggle uses",
    ).toBe(await page.evaluate(() => document.documentElement.dataset.theme ?? null));
  });
});
