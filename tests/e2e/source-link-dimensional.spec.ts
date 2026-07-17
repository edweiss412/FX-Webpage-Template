/**
 * tests/e2e/source-link-dimensional.spec.ts — real-browser dimensional-invariant
 * gate for the header SourceLink (tile → source-sheet deep links, spec §5.4).
 *
 * INVARIANT (spec §5.4, mandatory): the `SourceLink` rendered in a SectionCard's
 * HEADER `action` slot must NOT change the height of any data row. The link lives
 * in the header band (right-aligned, `shrink-0`, `h-fit`); a regression — e.g. it
 * stretching its flex parent, or a row losing `shrink-0` so the header forces a
 * reflow — would change a body row's measured height.
 *
 * WHY A REAL BROWSER (jsdom is insufficient): this project's Tailwind v4 does NOT
 * default `.flex` to `align-items: stretch` (AGENTS.md / DESIGN §7). A
 * stretch/shrink regression in the header→body relationship passes every jsdom
 * unit test and only surfaces in a real layout engine. This suite reads
 * `getBoundingClientRect().height` against the live render.
 *
 * HARNESS (plan-R4 finding 1 — explicit control render):
 * `/admin/dev/source-link-dim` (app/admin/dev/source-link-dim/page.tsx) mounts the
 * four measured primitives TWICE with IDENTICAL props — once inside a SectionCard
 * with `action={<SourceLink/>}` (`[data-testid=card-with-link]`), once with
 * `action={undefined}` (`[data-testid=card-no-link]`). Each measured row carries a
 * stable testid: `dim-personrow`, `dim-factrow`, `dim-kvrow`, `dim-keytime`. The
 * control render means the spec does NOT depend on app seed data or the global
 * Task-9 card wiring.
 *
 * ANTI-TAUTOLOGY: the spec measures the ROWS (present in BOTH containers under the
 * same testid), NEVER the link element. A row's height is the thing-under-test;
 * the link is the variable whose presence must not perturb it. Because both cards
 * receive identical children, any per-row delta is attributable ONLY to the
 * header link's presence.
 *
 * ── Project wiring ────────────────────────────────────────────────────────────
 * Runs in the `desktop-chromium` project (port-3000 webServer, baseURL
 * http://127.0.0.1:3000). That webServer is started with ADMIN_DEV_PANEL_ENABLED=
 * true (playwright.config.ts), so the dev-gated harness route is present in the
 * artifact. NOTE: this is intentionally NOT the `dev-build` project — that project
 * (port 3001) targets only `admin-dev.spec.ts`; the dev-flag-on port-3000 server
 * is the correct host at the brief's stated baseURL (127.0.0.1:3000), and it
 * carries the ENABLE_TEST_AUTH + TEST_AUTH_SECRET pair signInAs() needs.
 *
 * AUTH: although the harness page itself does NOT call requireAdmin(), it lives
 * under `app/admin/`, and `app/admin/layout.tsx` calls requireAdminIdentity({
 * layer: "layout" }) for EVERY /admin/* route (app/admin/layout.tsx:54). An
 * unauthenticated visit therefore 307s to /auth/sign-in. So this spec signs in as
 * ADMIN_FIXTURE first (same pattern as admin-dev.spec.ts / crew-layout-dimensions
 * .spec.ts) before navigating to the harness.
 *
 * The ONLY hardcoded number is the ±0.5px tolerance; the expected height for each
 * row is DERIVED from the measured no-link rect (anti-hardcode discipline).
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

const HARNESS_PATH = "/admin/dev/source-link-dim";

/** Per-row equal-height tolerance (px). §5.4 mandates ≤ 0.5px. */
const TOL = 0.5;

/** The four measured row testids (present in BOTH containers). */
const ROW_TESTIDS = ["dim-personrow", "dim-factrow", "dim-kvrow", "dim-keytime"] as const;

async function heightOf(locator: Locator): Promise<number> {
  return locator.evaluate((el) => el.getBoundingClientRect().height);
}

test.describe("SourceLink header does not change row heights (spec §5.4)", () => {
  // Cold first-hit render of the harness compiles a small module graph; budget
  // for it. Reads themselves are sub-second once warm.
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    // The /admin/* layout gate (requireAdminIdentity) 307s unauthenticated
    // visitors to sign-in, so authenticate as the admin fixture first.
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);

    const res = await page.goto(HARNESS_PATH, { waitUntil: "domcontentloaded" });
    expect(
      res?.status(),
      `dev harness ${HARNESS_PATH} must render 200 (requires ADMIN_DEV_PANEL_ENABLED=true at build time + admin session)`,
    ).toBe(200);
    // Both control containers must mount before any measurement.
    await expect(page.getByTestId("card-with-link")).toBeVisible();
    await expect(page.getByTestId("card-no-link")).toBeVisible();
  });

  test("each data row has the same height with and without the header SourceLink", async ({
    page,
  }) => {
    // Prove the link is actually present in the with-link card (otherwise the
    // whole comparison is vacuous — both cards would be no-link controls).
    const link = page
      .getByTestId("card-with-link")
      .locator("[data-slot=section-card-action] [data-slot=source-link]");
    await expect(
      link,
      "the with-link card MUST render the header SourceLink (else the test is vacuous)",
    ).toBeVisible();
    // And the control card must NOT render one.
    await expect(
      page
        .getByTestId("card-no-link")
        .locator("[data-slot=section-card-action] [data-slot=source-link]"),
      "the no-link control card MUST NOT render a SourceLink",
    ).toHaveCount(0);

    const withCard = page.getByTestId("card-with-link");
    const noCard = page.getByTestId("card-no-link");

    for (const testid of ROW_TESTIDS) {
      const withRow = withCard.getByTestId(testid);
      const noRow = noCard.getByTestId(testid);

      // Both rows must exist + be laid out (non-zero height) so a tautological
      // 0 === 0 cannot pass.
      await expect(withRow, `${testid} must exist in the with-link card`).toBeVisible();
      await expect(noRow, `${testid} must exist in the no-link card`).toBeVisible();

      const withH = await heightOf(withRow);
      const noH = await heightOf(noRow);

      expect(
        withH,
        `${testid} with-link height must be laid out (>0); got ${withH}`,
      ).toBeGreaterThan(0);
      expect(noH, `${testid} no-link height must be laid out (>0); got ${noH}`).toBeGreaterThan(0);

      // The invariant: the header SourceLink must not change this row's height.
      // Expected = the no-link (control) height; tolerance ±0.5px.
      expect(
        Math.abs(withH - noH),
        `${testid}: header SourceLink changed the row height (spec §5.4). withLink=${withH} noLink=${noH} Δ=${Math.abs(
          withH - noH,
        ).toFixed(3)}px > ${TOL}px`,
      ).toBeLessThanOrEqual(TOL);
    }
  });

  test("CardHeaderActions (SourceLink + report trigger) does not change data-row heights", async ({
    page,
  }) => {
    const actionsCard = page.getByTestId("card-with-actions");
    const noCard = page.getByTestId("card-no-link");
    await expect(actionsCard, "the with-actions harness card must render").toBeVisible();

    // Both affordances must actually be present (else the comparison is vacuous).
    await expect(
      actionsCard.locator("[data-slot=section-card-action] [data-slot=source-link]"),
      "the with-actions card must render the header SourceLink",
    ).toBeVisible();
    await expect(
      actionsCard.locator("[data-slot=section-card-action] [data-slot=card-report-trigger]"),
      "the with-actions card must render the report trigger",
    ).toBeVisible();

    for (const testid of ROW_TESTIDS) {
      const actionsRow = actionsCard.getByTestId(testid);
      const noRow = noCard.getByTestId(testid);
      await expect(actionsRow, `${testid} must exist in the with-actions card`).toBeVisible();
      const actH = await heightOf(actionsRow);
      const noH = await heightOf(noRow);
      expect(actH, `${testid} with-actions height must be laid out (>0)`).toBeGreaterThan(0);
      // Adding the report trigger to the header must not perturb any body row.
      expect(
        Math.abs(actH - noH),
        `${testid}: CardHeaderActions changed the row height. withActions=${actH} noLink=${noH} Δ=${Math.abs(
          actH - noH,
        ).toFixed(3)}px > ${TOL}px`,
      ).toBeLessThanOrEqual(TOL);
    }

    // Neither affordance may stretch the header band beyond its intrinsic height.
    const headerBox = await actionsCard.locator("header").boundingBox();
    expect(headerBox, "header must lay out").not.toBeNull();
    for (const slot of ["source-link", "card-report-trigger"]) {
      const box = await actionsCard.locator(`[data-slot=${slot}]`).boundingBox();
      expect(box, `${slot} must lay out`).not.toBeNull();
      expect(
        box!.height,
        `${slot} (h=${box!.height}) must not exceed the header band (h=${headerBox!.height})`,
      ).toBeLessThanOrEqual(headerBox!.height + TOL);
    }
  });
});

/**
 * CARDREPORT-1 (spec §4): the two recessive header affordances must expose ≥44px
 * tap targets via a transparent out-of-flow `::before` overlay that grows in ONE
 * direction — UP for SectionCard headers (zero downward overhang clears the
 * interactive rows below), DOWN for the bare `schedule-days` header (zero upward
 * overhang clears the agenda above; the day list below is non-interactive).
 *
 * This probes the LIVE compositor with `elementFromPoint` (not class strings):
 * a point over the transparent `::before` returns the originating element, which
 * carries `data-slot`. All coordinates are derived from measured rects; the only
 * literals are the ±1/±2/±21/±43 probe offsets (each strictly inside/outside the
 * 44px span). The `card-actions-up` / `card-actions-down` harness contexts embed
 * realistic interactive neighbors so the negative probes are non-vacuous.
 */
test.describe("CARDREPORT-1: ≥44px direction-aware hit targets (spec §4)", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    const res = await page.goto(HARNESS_PATH, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("card-actions-up")).toBeVisible();
    await expect(page.getByTestId("card-actions-down")).toBeVisible();
  });

  // Probe the live compositor ENTIRELY in-browser: `getBoundingClientRect()` and
  // `elementFromPoint()` share the viewport coordinate space, whereas Playwright's
  // `boundingBox()` is document-relative — mixing them mis-probes once the page
  // scrolls (these harness cards sit below the 800px fold). `ref` is scrolled into
  // view first; the probe point is `(ax, ay)` as a fraction of ref's rect plus a
  // pixel `(dx, dy)`. Returns the `data-slot` the point resolves to (a transparent
  // `::before` returns its originating element, which carries the slot), or
  // `testid:<id>` for an interactive neighbor without a slot, or null.
  async function hitNear(
    page: Page,
    refSelector: string,
    ax: number,
    ay: number,
    dx: number,
    dy: number,
  ): Promise<string | null> {
    return page.evaluate(
      ({ refSelector, ax, ay, dx, dy }) => {
        const ref = document.querySelector(refSelector);
        if (!ref) return "NO_REF";
        ref.scrollIntoView({ block: "center", inline: "center" });
        const r = ref.getBoundingClientRect();
        const x = r.left + r.width * ax + dx;
        const y = r.top + r.height * ay + dy;
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        const slotEl = el.closest("[data-slot]");
        if (slotEl) return slotEl.getAttribute("data-slot");
        const tid = el.closest("[data-testid]")?.getAttribute("data-testid") ?? null;
        return tid ? `testid:${tid}` : null;
      },
      { refSelector, ax, ay, dx, dy },
    );
  }

  const slotSel = (rootTestId: string, slot: string) =>
    `[data-testid="${rootTestId}"] [data-slot="${slot}"]`;

  test("UP context: 44px reachable upward; zero downward bleed; both tel rows intact", async ({
    page,
  }) => {
    for (const slot of ["source-link", "card-report-trigger"]) {
      const ref = slotSel("card-actions-up", slot);
      // 44px reachable UP: 1px above the box bottom AND 43px above it (1px inside
      // the top of a bottom-anchored 44px overlay) both resolve to the slot.
      expect(await hitNear(page, ref, 0.5, 1, 0, -1)).toBe(slot);
      expect(await hitNear(page, ref, 0.5, 1, 0, -43)).toBe(slot);
      // Zero downward overhang: 2px below the box bottom is NOT the slot.
      expect(await hitNear(page, ref, 0.5, 1, 0, 2)).not.toBe(slot);
    }
    // The trigger also reaches 44px WIDE (±21px from its centre).
    const trig = slotSel("card-actions-up", "card-report-trigger");
    expect(await hitNear(page, trig, 0.5, 0.5, -21, 0)).toBe("card-report-trigger");
    expect(await hitNear(page, trig, 0.5, 0.5, 21, 0)).toBe("card-report-trigger");
    // The interactive tel row BELOW is still hittable at its top edge (overlay didn't shave it).
    expect(await hitNear(page, '[data-testid="dim-tel-below"]', 0.5, 0, 0, 1)).toBe(
      "testid:dim-tel-below",
    );
    // The interactive tel row ABOVE is still hittable at its bottom edge (upward overhang never reached it).
    expect(await hitNear(page, '[data-testid="dim-tel-above"]', 0.5, 1, 0, -1)).toBe(
      "testid:dim-tel-above",
    );
  });

  test("DOWN context: 44px reachable downward + wide; zero upward bleed; no sibling overlap; agenda intact", async ({
    page,
  }) => {
    for (const slot of ["source-link", "card-report-trigger"]) {
      const ref = slotSel("card-actions-down", slot);
      // 44px reachable DOWN: 1px below the box top AND 43px below it (1px inside the
      // bottom of a top-anchored 44px overlay) both resolve to the slot.
      expect(await hitNear(page, ref, 0.5, 0, 0, 1)).toBe(slot);
      expect(await hitNear(page, ref, 0.5, 0, 0, 43)).toBe(slot);
      // Zero upward overhang: 2px above the box top is NOT the slot.
      expect(await hitNear(page, ref, 0.5, 0, 0, -2)).not.toBe(slot);
    }
    // The trigger reaches 44px WIDE in the DOWN branch too.
    const trig = slotSel("card-actions-down", "card-report-trigger");
    expect(await hitNear(page, trig, 0.5, 0.5, -21, 0)).toBe("card-report-trigger");
    expect(await hitNear(page, trig, 0.5, 0.5, 21, 0)).toBe("card-report-trigger");
    // No sibling overlap in the DOWN branch: SourceLink's right edge belongs to SourceLink.
    expect(await hitNear(page, slotSel("card-actions-down", "source-link"), 1, 0.5, -2, 0)).toBe(
      "source-link",
    );
    // The agenda link ABOVE is still hittable at its bottom edge (down overlay stole nothing).
    expect(await hitNear(page, '[data-testid="dim-agenda-above"]', 0.5, 1, 0, -1)).toBe(
      "testid:dim-agenda-above",
    );
  });

  test("UP context no sibling overlap: SourceLink label + right edge belong to SourceLink, not the trigger", async ({
    page,
  }) => {
    const ref = slotSel("card-actions-up", "source-link");
    expect(await hitNear(page, ref, 1, 0.5, -2, 0)).toBe("source-link"); // right edge
    expect(await hitNear(page, ref, 0.5, 0.5, 0, 0)).toBe("source-link"); // mid-label
  });
});
