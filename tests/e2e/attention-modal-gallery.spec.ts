/**
 * tests/e2e/attention-modal-gallery.spec.ts
 * (plan 2026-07-21-attention-modal-switcher-gallery Task 5b — acceptance suite)
 *
 * The integration acceptance for the switcher-driven attention modal gallery.
 * Authored BEFORE the switcher (Task 6) and route rewrite (Task 7): it runs RED
 * against the current card route until those land, then Task 9 iterates it GREEN.
 *
 * ── What it proves ───────────────────────────────────────────────────────────
 *  1. Flight boundary (§1.4): EVERY rendered scenario, deep-linked via
 *     `?scenario=<id>`, shows ITS OWN attention artifact INSIDE the freshly
 *     queried `[role="dialog"]` — a scenario-specific marker scoped to the
 *     dialog, never to `SwitcherControls` (which also prints codes).
 *  2. Operability (§1.5): the control bar is OUTSIDE `[data-inert-root]`, stays
 *     non-inert, and is clickable while the admin root is inert.
 *  3. Stepping (R1-1, §6.5): `←`/`→` advance the `aria-live` count with focus
 *     inside the dialog; N discrete presses leave EXACTLY one dialog + one
 *     control bar (no leaked remounts); body scroll stays locked.
 *  4. Write containment (§1.8, §6.4): across every mutation control found in the
 *     sweep, NO non-GET request leaves the browser; the fetch-backed resolve
 *     control trips `data-gallery-blocked-write` and is run last per the
 *     guard-attribute sequencing (`plan-R2 §16`).
 *  5. Close/reopen/Escape (§1.6, plan-R2 §11): X releases inert + scroll-lock;
 *     Reopen restores the dialog, the locks, and nav; Escape while OPEN is
 *     swallowed; Escape while CLOSED is NOT intercepted.
 *  6. Excluded deep-links (plan-R2 §18, R5-cut): a `?scenario=<excluded>` id
 *     falls back to index 0; the structural footnote lists all three labels and
 *     the cut footnote is present with its count.
 *
 * ── Harness (§5) ─────────────────────────────────────────────────────────────
 * Runs in the `dev-build` project (port 3001, built with
 * ADMIN_DEV_PANEL_ENABLED=true; playwright.config.ts) — the route is a
 * build-gated dev surface, so `next dev`/prod-baseline projects do not host it.
 * Auth is the test-only session minter (`developer-tier.spec.ts:15` pattern):
 * the fxav-developer fixture mints app_metadata `{ role:"admin", developer:true }`,
 * so `requireDeveloper()` admits it via the JWT arm without any table seed.
 *
 * The expected per-scenario marker and the rendered/excluded partition are
 * DERIVED from the same server helpers the route uses — the test never hardcodes
 * a scenario list, so a catalog change re-derives instead of silently skipping.
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import { signInAs, signOut } from "./helpers/signInAs";
import type { TestAuthFixture } from "./helpers/fixtures";
import { partitionScenarios } from "@/app/admin/dev/attention-gallery/buildSwitcherScenarios";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import { buildScenarioModalData } from "@/lib/dev/buildScenarioModalData";
import { deriveRoutedWarnings } from "@/lib/admin/routedWarnings";
import { ALL_SCENARIOS } from "@/lib/dev/attentionScenarios/index";

// The developer fixture is admin+developer via the JWT arm (test-auth route
// allowlist entry `fxav-developer@example.com`). No admin_emails seed needed —
// requireDeveloper() is satisfied by the developer:true claim alone.
const DEVELOPER_FIXTURE: TestAuthFixture = {
  email: "fxav-developer@example.com",
  isAdmin: true,
  label: "developer (admin + developer)",
};

const GALLERY_PATH = "/admin/dev/attention-gallery";
const DIALOG = '[data-testid="published-show-review-modal"]';
const CONTROLS = '[data-testid="attention-switcher-controls"]';

/** A scenario-specific marker that must appear INSIDE the dialog for scenario s. */
type Marker = { testid: string; note: string };

/**
 * Derive the authoritative in-dialog marker for a rendered scenario. Precedence
 * mirrors the modal's own surfacing order so the marker is the thing the modal
 * actually renders for THIS scenario:
 *   - an alert item        -> its `attention-banner-<alertId>` (unique per scenario)
 *   - degraded             -> the degraded notice
 *   - warnings             -> the first warned section's active-warnings block
 *   - a hold               -> the Changes rail badge
 *   - clean baseline       -> the modal title (the "nothing needs attention" state)
 */
function markerFor(id: string): Marker {
  const s = ALL_SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`markerFor: unknown scenario ${id}`);
  const items = deriveScenarioAttention(s);
  const alert = items.find((i) => i.kind === "alert");
  if (alert && alert.kind === "alert") {
    return { testid: `attention-banner-${alert.alert.alertId}`, note: "alert banner" };
  }
  const d = buildScenarioModalData(s);
  if (d.alertsDegraded) {
    return { testid: "attention-degraded-notice", note: "degraded notice" };
  }
  const routed = deriveRoutedWarnings(d.bySection);
  const warnedSection = Object.keys(routed.activeWarningsBySection)[0];
  if (warnedSection) {
    return { testid: `section-warning-active-${warnedSection}`, note: "warned section" };
  }
  if (items.some((i) => i.kind === "hold")) {
    return { testid: "changes-rail-badge", note: "changes badge (hold)" };
  }
  return { testid: "published-show-review-title", note: "clean baseline title" };
}

// Derived ONCE at module load — the authority the route also uses.
const { rendered, excluded } = partitionScenarios();
const RENDERED_IDS = rendered.map((s) => s.id);
const STRUCTURAL = excluded.filter((e) => e.reason === "structural");
const CUT = excluded.filter((e) => e.reason === "cut");

async function gotoScenario(page: Page, id: string): Promise<void> {
  await page.goto(`${GALLERY_PATH}?scenario=${encodeURIComponent(id)}`);
  // Landed on the gallery, not bounced to sign-in (auth sanity before assertions).
  await expect(page).toHaveURL(new RegExp("/admin/dev/attention-gallery"));
  // Re-query the dialog after every navigation — never retain a handle across a
  // keyed remount (§5.4 detach-safety).
  await expect(page.locator(DIALOG)).toHaveCount(1);
}

test.describe.configure({ mode: "serial" });

test.describe("attention modal switcher gallery", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, DEVELOPER_FIXTURE);
  });

  test("auth + shell: developer lands on the gallery with exactly one dialog and one control bar", async ({
    page,
  }) => {
    await page.goto(GALLERY_PATH);
    await expect(page).toHaveURL(new RegExp("/admin/dev/attention-gallery"));
    await expect(page.locator(DIALOG)).toHaveCount(1);
    await expect(page.locator(CONTROLS)).toHaveCount(1);
  });

  test("Flight boundary + write containment: every rendered scenario shows its own attention, nothing writes", async ({
    page,
  }) => {
    expect(RENDERED_IDS.length).toBeGreaterThan(0);

    // Global write guard: any non-GET request to our origin fails the test.
    const nonGetWrites: string[] = [];
    const onRequest = (req: Request) => {
      const method = req.method().toUpperCase();
      if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        const u = new URL(req.url());
        // Only our own app origin is interesting; ignore any 3rd-party beacons.
        if (u.port === "3001") nonGetWrites.push(`${method} ${u.pathname}`);
      }
    };
    page.on("request", onRequest);

    // Coverage ledger: prove BOTH write mechanisms were exercised — a form-action
    // control (publish toggle) and the fetch-backed control (resolve). Both are
    // no-ops here; the point is that clicking them produces no write.
    const exercised = new Set<string>();
    const RESOLVE_RE = /^per-show-alert-resolve-/;

    try {
      // The fetch-backed resolve control runs LAST (guard-attribute sequencing),
      // so defer any scenario that surfaces it and sweep the rest first.
      const resolveScenarios: string[] = [];

      for (const id of RENDERED_IDS) {
        await gotoScenario(page, id);
        const dialog = page.locator(DIALOG);

        // (1) Flight proof — the scenario's OWN marker inside the dialog.
        const marker = markerFor(id);
        await expect(
          dialog.locator(`[data-testid="${marker.testid}"]`),
          `${id}: expected in-dialog ${marker.note} (${marker.testid})`,
        ).toBeAttached();

        // Defer resolve-bearing scenarios; sweep form-action controls now.
        const resolveBtn = dialog.locator('[data-testid^="per-show-alert-resolve-"]');
        if ((await resolveBtn.count()) > 0) {
          resolveScenarios.push(id);
        }

        // (2) Exercise the publish toggle where present (a form-action write path).
        const publish = dialog.locator('[data-testid="strip-publish-toggle"] button').first();
        if ((await publish.count()) > 0) {
          await publish.click();
          exercised.add("publish");
        }
      }

      // The fetch-backed control LAST. `data-gallery-blocked-write` must be
      // ABSENT before the action, SET after the click, and the click must leave
      // NO request on the wire (the guard synthesises the refusal in-process).
      for (const id of resolveScenarios) {
        await gotoScenario(page, id);
        const dialog = page.locator(DIALOG);
        await expect(page.locator("html")).not.toHaveAttribute("data-gallery-blocked-write", /.+/);
        const resolveBtn = dialog.locator('[data-testid^="per-show-alert-resolve-"]').first();
        await resolveBtn.click();
        await expect(page.locator("html")).toHaveAttribute("data-gallery-blocked-write", /.+/);
        exercised.add("resolve");
        // A fresh navigation clears the attribute (guard-attribute sequencing).
        await gotoScenario(page, RENDERED_IDS[0]!);
        await expect(page.locator("html")).not.toHaveAttribute("data-gallery-blocked-write", /.+/);
        break; // one representative resolve control is sufficient
      }
    } finally {
      page.off("request", onRequest);
    }

    expect(nonGetWrites, `mutation controls leaked writes: ${nonGetWrites.join(", ")}`).toEqual([]);
    // Both distinct write mechanisms (§1.8) were exercised and contained.
    expect([...exercised].sort()).toEqual(["publish", "resolve"]);
  });

  test("stepping: arrows advance the aria-live count and never leak a second dialog", async ({
    page,
  }) => {
    await gotoScenario(page, RENDERED_IDS[0]!);
    const live = page.locator(`${CONTROLS} [aria-live="polite"]`);
    await expect(live).toHaveText(/^\s*1\s*\/\s*\d+/);

    // Focus inside the dialog, then step forward with discrete presses.
    await page.locator(DIALOG).click();
    await page.keyboard.press("ArrowRight");
    await expect(live).toHaveText(/^\s*2\s*\//);
    await page.keyboard.press("ArrowRight");
    await expect(live).toHaveText(/^\s*3\s*\//);
    await page.keyboard.press("ArrowLeft");
    await expect(live).toHaveText(/^\s*2\s*\//);

    // Rapid discrete stepping settles on exactly one dialog + one control bar.
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
    await expect(page.locator(DIALOG)).toHaveCount(1);
    await expect(page.locator(CONTROLS)).toHaveCount(1);
    // Body scroll stays locked while the modal is open.
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  });

  test("operability: control bar is outside the inert admin root and clickable while the modal is active", async ({
    page,
  }) => {
    await gotoScenario(page, RENDERED_IDS[0]!);
    // The controls are portaled to body, a SIBLING of [data-inert-root].
    const controlsInInertRoot = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="attention-switcher-controls"]');
      const inertRoot = bar?.closest("[data-inert-root]");
      return inertRoot !== null && inertRoot !== undefined;
    });
    expect(controlsInInertRoot).toBe(false);
    // The admin root IS inert while the modal is open.
    await expect(page.locator("[data-inert-root]").first()).toHaveAttribute("inert", /.*/);
    // And the bar's buttons are operable (Next advances).
    const live = page.locator(`${CONTROLS} [aria-live="polite"]`);
    await page.getByRole("button", { name: /next scenario/i }).click();
    await expect(live).toHaveText(/^\s*2\s*\//);
  });

  test("close / reopen / Escape: X releases locks, Reopen restores, Escape-open swallowed, Escape-closed not intercepted", async ({
    page,
  }) => {
    await gotoScenario(page, RENDERED_IDS[0]!);

    // Escape while OPEN is swallowed — the modal stays.
    await page.locator(DIALOG).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(DIALOG)).toHaveCount(1);

    // Close via the backdrop (requestClose) — inert + scroll-lock released.
    await page.locator('[data-testid="published-show-review-backdrop"]').click();
    await expect(page.locator(DIALOG)).toHaveCount(0);
    await expect(page.locator("[data-inert-root]").first()).not.toHaveAttribute("inert", /.*/);
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

    // Escape while CLOSED is NOT intercepted (no shell listener to race) — the
    // switcher must not swallow it. Nothing to assert but the absence of a
    // reopened dialog; the count stays 0.
    await page.keyboard.press("Escape");
    await expect(page.locator(DIALOG)).toHaveCount(0);

    // Reopen restores the dialog, the locks, and stepping.
    await page.getByRole("button", { name: /reopen/i }).click();
    await expect(page.locator(DIALOG)).toHaveCount(1);
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    const live = page.locator(`${CONTROLS} [aria-live="polite"]`);
    await page.locator(DIALOG).click();
    await page.keyboard.press("ArrowRight");
    await expect(live).toHaveText(/^\s*2\s*\//);
  });

  test("excluded deep-links fall back to index 0; footnotes list structural labels and the cut count", async ({
    page,
  }) => {
    expect(STRUCTURAL.length).toBe(3);
    expect(CUT.length).toBeGreaterThan(0);

    // A structural-excluded id resolves to null -> switcher starts at index 0.
    for (const e of STRUCTURAL) {
      await gotoScenario(page, e.id);
      const live = page.locator(`${CONTROLS} [aria-live="polite"]`);
      await expect(live).toHaveText(/^\s*1\s*\//);
      // The dialog shows the FIRST rendered scenario's marker, not the excluded one.
      const marker = markerFor(RENDERED_IDS[0]!);
      await expect(page.locator(DIALOG).locator(`[data-testid="${marker.testid}"]`)).toBeAttached();
    }

    // Footnotes (outside the inert root, in the control bar).
    const controls = page.locator(CONTROLS);
    for (const e of STRUCTURAL) {
      await expect(controls.getByText(e.label, { exact: false })).toBeVisible();
    }
    await expect(controls.getByText(String(CUT.length), { exact: false })).toBeVisible();
    await expect(controls.getByText(/published attention surface/i)).toBeVisible();
  });
});
