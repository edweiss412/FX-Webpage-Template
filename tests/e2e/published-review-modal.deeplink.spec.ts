/**
 * tests/e2e/published-review-modal.deeplink.spec.ts (admin-show-modal Task 12 —
 * spec §3 URL contract, D7/D8/D10)
 *
 * End-to-end deep-link coverage for the `/admin?show=<slug>` published review
 * modal against the REAL app (dev server on :3000 + Supabase + fixture auth):
 *
 *   - cold `/admin?show=<slug>` opens the modal (title asserted INSIDE the
 *     modal container — never a page-wide match the dashboard rows could
 *     satisfy; expected text derives from the seeded fixture).
 *   - `&alert_id=<uuid>` renders the highlight ring on the matching alert row
 *     (`li[aria-current="true"]`, PerShowAlertSection) AND one-shot-scrolls it
 *     into the surface scroller's viewport (§3 — highlight alone never
 *     scrolled anything on the old page).
 *   - `#share-access` fragment scrolls the share panel into view via the
 *     surface's `syncHash` non-rail fallback (D7).
 *   - SIGNED-IN legacy `/admin/show/<slug>?alert_id=x` 307s into the modal
 *     with the param preserved (redirect passthrough) → highlight applied.
 *   - SIGNED-IN legacy COMBINED `/admin/show/<slug>?alert_id=x#share-access`
 *     lands on `/admin?show=<slug>&alert_id=x`: params preserved by the
 *     redirect, highlight applied, and the alert_id scroll wins precedence
 *     over the hash restore (§3). The fragment survives only when the
 *     redirect is delivered as a real HTTP 3xx (browser re-applies it — D7);
 *     a streamed in-document client redirect (dev-server delivery) carries
 *     the Location path only — the test pins whichever path the run took.
 *   - unknown slug → the loader redirects to bare `/admin`: no modal AND the
 *     `show` param stripped (D8 silent drop; both asserted — anti-tautology).
 *   - SIGNED-OUT `/admin/show/<slug>` → redirects to sign-in with a VALIDATED
 *     admin `next` target (D10's path-only pipeline): the full legacy path
 *     when the runtime injects `x-pathname`, else the documented `/admin`
 *     fallback (lib/auth/requireAdmin.ts:49-64). The harness cannot complete
 *     real OAuth, so the post-auth 307-into-the-modal half is covered by the
 *     signed-in legacy case above.
 *
 * Runs in the default playwright.config.ts (desktop-chromium project).
 */
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";

const TOL = 0.5;

const BASE = "published-show-review";
/** ANY review-modal frame — the Suspense SKELETON shares the shell testIdBase,
 *  and during the streaming swap both frames transiently coexist in the DOM.
 *  Use for ABSENCE assertions (neither skeleton nor loaded modal remains). */
const MODAL_ANY = `[data-testid="${BASE}-modal"]`;
/** The LOADED modal only (the skeleton renders no title node) — use for
 *  visibility waits and scoped queries so the transient skeleton twin can
 *  never trip Playwright strict mode. */
const MODAL = `${MODAL_ANY}:has([data-testid="${BASE}-title"])`;

/** Fixture-derived expectation (anti-tautology: the assertion reads THIS
 *  constant, which fed the seed — never text scraped back off the page). */
const SEED_TITLE = "Modal Deeplink E2E Show";

// A doug-visible, non-health, show-scopable §12.4 code (the same code the bell
// suites seed as their top alert) — fetchPerShowAlerts excludes only
// audience:"health" codes, so this row renders in the per-show alert section.
const ALERT_CODE = "SYNC_DELAYED_SEVERE";

let show: SeededShow;
let alertId: string;
let restoreDashboardState: (() => Promise<void>) | null = null;

test.describe("published review modal — deep links (spec §3, D7/D8/D10)", () => {
  test.beforeAll(async () => {
    // The modal mounts only on the SETTLED dashboard branch (wizard-mode
    // ignores `?show`, spec §3) — settle app_settings for the run.
    restoreDashboardState = await settleDashboardAdminState();
    show = await seedShowWithCrew({
      title: SEED_TITLE,
      crew: [{ name: "Alice Cooper", role: "A1", email: "alice@fxav.test" }],
    });
    // One unresolved show-scoped alert → the per-show alert section renders a
    // row whose id drives the `alert_id` highlight cases. (Unique partial index
    // on (coalesce(show_id,''), code) WHERE resolved_at IS NULL — one row per
    // (show, code) is safe.)
    const { data, error } = await admin
      .from("admin_alerts")
      .insert({
        show_id: show.showId,
        code: ALERT_CODE,
        context: {},
        raised_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`deeplink spec alert seed failed: ${error?.message ?? "no row"}`);
    }
    alertId = data.id as string;
  });

  test.afterAll(async () => {
    if (show) {
      const { error } = await admin.from("admin_alerts").delete().eq("show_id", show.showId);
      if (error) throw new Error(`deeplink spec alert cleanup failed: ${error.message}`);
      await deleteSeededShow(show.driveFileId);
    }
    if (restoreDashboardState) await restoreDashboardState();
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  /** The surface's internal scroller (the pane the one-shot scrolls target). */
  function scrollerSel(): string {
    return `[data-testid="wizard-step3-card-${show.driveFileId}-review-content"]`;
  }

  async function openModal(page: Page, url: string) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url);
    // Suspense-streamed server loader — allow a dev-server compile on first hit.
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
  }

  /** Poll until `target` is scrolled into the scroller's viewport — the
   *  one-shot mount scrolls run in effects after hydration. "In view" =
   *  the target's TOP edge sits inside the scroller viewport with a real
   *  visible band below it (≥40px or the full target, whichever is smaller):
   *  a block TALLER than the pane (e.g. the share-access cluster, which
   *  scrollIntoView aligns to the top) is still legitimately "scrolled to",
   *  while an off-screen target — above the pane or below the fold — fails. */
  async function expectInScrollerViewport(page: Page, targetSel: string, label: string) {
    await expect
      .poll(
        () =>
          page.evaluate(
            ([sSel, tSel, tol]) => {
              const scroller = document.querySelector(sSel as string);
              const target = document.querySelector(tSel as string);
              if (!scroller || !target) return "missing element";
              const s = scroller.getBoundingClientRect();
              const t = target.getBoundingClientRect();
              if (t.height <= 0) return "target has no height";
              if (t.top < s.top - (tol as number)) return `target top ${t.top} above ${s.top}`;
              if (t.top > s.bottom - (tol as number))
                return `target top ${t.top} below the fold ${s.bottom}`;
              const visible = Math.min(t.bottom, s.bottom) - Math.max(t.top, s.top);
              const required = Math.min(t.height, 40);
              if (visible + (tol as number) < required)
                return `only ${visible}px of the target visible (< ${required})`;
              return "in view";
            },
            [scrollerSel(), targetSel, TOL] as const,
          ),
        { message: `${label} scrolled into the surface scroller's viewport` },
      )
      .toBe("in view");
  }

  test("cold /admin?show=<slug> opens the modal with the fixture title inside the panel", async ({
    page,
  }) => {
    await openModal(page, `/admin?show=${show.slug}`);

    // Anti-tautology: the title is read INSIDE the modal container only — the
    // dashboard behind the scrim also renders the show's title in its rows, so
    // a page-wide text match could pass with no modal content at all.
    const title = page.locator(`${MODAL} [data-testid="${BASE}-title"]`);
    await expect(title, "exactly one in-modal title node").toHaveCount(1);
    await expect(title).toHaveText(SEED_TITLE);

    // The dialog is labelled by that title (a11y wiring, spec §6.1).
    const labelled = await page.locator(MODAL).evaluate((el) => {
      const id = el.getAttribute("aria-labelledby");
      return id ? (document.getElementById(id)?.textContent ?? null) : null;
    });
    expect(labelled, "dialog accessible name is the show title").toBe(SEED_TITLE);
  });

  test("&alert_id= highlights the matching alert row and scrolls it into the scroller viewport", async ({
    page,
  }) => {
    await openModal(page, `/admin?show=${show.slug}&alert_id=${alertId}`);

    const highlighted = page.locator(`${MODAL} li[aria-current="true"]`);
    await expect(highlighted, "exactly one highlighted alert row").toHaveCount(1);
    await expect(highlighted).toHaveAttribute("data-testid", `per-show-alert-${alertId}`);
    // The §3 highlight ring (PerShowAlertSection's static ring treatment).
    const cls = (await highlighted.getAttribute("class")) ?? "";
    expect(cls, "highlight ring classes applied").toContain("ring-2");

    await expectInScrollerViewport(
      page,
      `${MODAL} li[aria-current="true"]`,
      "highlighted alert row",
    );
  });

  test("#share-access fragment scrolls the share panel into view (D7 non-rail fallback)", async ({
    page,
  }) => {
    await openModal(page, `/admin?show=${show.slug}#share-access`);
    expect(new URL(page.url()).hash, "fragment intact after load").toBe("#share-access");
    await expectInScrollerViewport(page, `${MODAL} #share-access`, "share-access block");
  });

  test("SIGNED-IN legacy /admin/show/<slug>?alert_id=x 307s into the modal with the highlight", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/admin/show/${show.slug}?alert_id=${alertId}`);

    await page.waitForURL((u) => u.pathname === "/admin" && u.searchParams.has("show"), {
      timeout: 30_000,
    });
    const u = new URL(page.url());
    expect(u.searchParams.get("show"), "redirect carries the slug as ?show").toBe(show.slug);
    expect(u.searchParams.get("alert_id"), "redirect preserves alert_id").toBe(alertId);

    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    const highlighted = page.locator(`${MODAL} li[aria-current="true"]`);
    await expect(highlighted).toHaveAttribute("data-testid", `per-show-alert-${alertId}`);
  });

  test("SIGNED-IN combined legacy ?alert_id=x#share-access keeps params; fragment per redirect delivery; alert scroll wins", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const resp = await page.goto(`/admin/show/${show.slug}?alert_id=${alertId}#share-access`);

    await page.waitForURL((u) => u.pathname === "/admin" && u.searchParams.has("show"), {
      timeout: 30_000,
    });
    const u = new URL(page.url());
    expect(u.pathname).toBe("/admin");
    expect(u.searchParams.get("show"), "param passthrough: show").toBe(show.slug);
    expect(u.searchParams.get("alert_id"), "param passthrough: alert_id").toBe(alertId);
    // The fragment is never server-visible; only the BROWSER can re-apply it —
    // and it does so ONLY across a real HTTP 3xx (D7 rationale). Which delivery
    // Next uses is runtime-dependent: a pre-stream redirect() yields a real 307
    // (fragment preserved), while a dev-server streamed render delivers the
    // redirect as an in-document client navigation whose target is the
    // Location path only (fragment dropped). Pin the behavior of WHICHEVER
    // path this run took — deterministic per environment, never vacuous.
    const wasHttpRedirect = resp?.request().redirectedFrom() != null;
    if (wasHttpRedirect) {
      expect(u.hash, "fragment intact across the real 307").toBe("#share-access");
    } else {
      expect(u.hash, "streamed client-side redirect carries no fragment (documented)").toBe("");
    }

    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    const highlighted = page.locator(`${MODAL} li[aria-current="true"]`);
    await expect(highlighted, "highlight applied").toHaveCount(1);
    await expect(highlighted).toHaveAttribute("data-testid", `per-show-alert-${alertId}`);
    // §3 precedence: when BOTH alert_id and a fragment are present, the
    // alert_id one-shot scroll wins — the highlighted row (not merely the
    // share panel) ends inside the scroller viewport.
    await expectInScrollerViewport(
      page,
      `${MODAL} li[aria-current="true"]`,
      "highlighted alert row (precedence over hash restore)",
    );
  });

  test("unknown slug redirects to bare /admin — no modal, show param stripped (D8)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/admin?show=definitely-not-a-show-${randomUUID().slice(0, 8)}`);

    // The streamed loader redirect()s → the client navigates to bare /admin.
    await page.waitForURL((u) => u.pathname === "/admin" && !u.searchParams.has("show"), {
      timeout: 30_000,
    });
    // BOTH halves (anti-tautology): the URL is stripped AND no modal mounted
    // (neither the loaded modal nor the Suspense skeleton frame remains).
    await expect(page.locator(MODAL_ANY)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has("show")).toBe(false);
  });

  test("SIGNED-OUT /admin/show/<slug> redirects to sign-in carrying next=/admin/show/<slug> (D10)", async ({
    page,
  }) => {
    // Drop the beforeEach session entirely: this is the durable emailed-link,
    // signed-out cold load.
    await signOut(page);
    await page.goto(`/admin/show/${show.slug}`);

    await page.waitForURL(/\/auth\/sign-in/, { timeout: 30_000 });
    const u = new URL(page.url());
    // The auth boundary holds: signed-out never sees show content, only the
    // sign-in redirect. The `next` param is the validated post-auth landing
    // (the harness cannot complete real OAuth; the signed-in legacy case above
    // covers the 307-into-the-modal half). Path preservation depends on the
    // `x-pathname` header (lib/auth/requireAdmin.ts:49-64): runtimes that
    // inject it yield the full legacy path; runtimes without it (next dev /
    // bare `next start` — this harness AND CI) hit the documented '/admin'
    // fallback. Accept exactly those two values — anything else (an open
    // redirect, a crew path, a query-carrying next) fails.
    const next = u.searchParams.get("next");
    expect(
      [`/admin/show/${show.slug}`, "/admin"],
      "sign-in redirect carries a validated admin next target",
    ).toContain(next);
  });
});
