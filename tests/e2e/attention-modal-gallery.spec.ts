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
// MUST be first: loads .env.local into the runner before the server imports
// below evaluate (they throw at import without HASH_FOR_LOG_PEPPER et al.).
import "./helpers/loadTestEnv";
import { test, expect, type Page, type Request } from "@playwright/test";
import { signInAs, signOut } from "./helpers/signInAs";
import type { TestAuthFixture } from "./helpers/fixtures";
import { partitionScenarios } from "@/app/admin/dev/attention-gallery/buildSwitcherScenarios";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import { buildScenarioModalData } from "@/lib/dev/buildScenarioModalData";
import { deriveRoutedWarnings } from "@/lib/admin/routedWarnings";
import type { MessageCode } from "@/lib/messages/catalog";
import { ALL_SCENARIOS } from "@/lib/dev/attentionScenarios/index";
import { T3_CREW_COLLISION } from "@/lib/dev/attentionScenarios/tier3";
import { T2_FEED_TRUNCATED, T2_MULTI_HOLD } from "@/lib/dev/attentionScenarios/tier2";

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

/**
 * A scenario's in-dialog marker set. The dialog is proven to render THIS
 * scenario's attention if ANY listed testid is attached OR ANY listed text is
 * visible. An OR-set is required because the modal buckets attention into FIVE
 * distinct render paths that do NOT share a testid:
 *   - overview-routed alert -> `attention-banner-<alertId>` (the overview slot)
 *   - degraded              -> `attention-degraded-notice`
 *   - warnings              -> `section-warning-active-<sec>`
 *   - a hold                -> `changes-rail-badge`
 *   - rooms / event / crew alerts ALSO render via AttentionBanner (same
 *     `attention-banner-<alertId>` testid), while a warnings-routed alert
 *     renders as `parse-attention-note-<CODE>`. The clean baseline shows the
 *     empty-attention copy.
 * The alert testids were validated against the built server's rendered DOM.
 */
type Marker = { testids: string[]; texts: string[] };

function alertCode(s: (typeof ALL_SCENARIOS)[number], alertId: string): MessageCode | undefined {
  const idx = Number(alertId.split("-alert-").pop());
  return s.alerts[idx]?.code as MessageCode | undefined;
}

function markerFor(id: string): Marker {
  const s = ALL_SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`markerFor: unknown scenario ${id}`);
  const items = deriveScenarioAttention(s);
  const alerts = items.filter((i) => i.kind === "alert");
  const d = buildScenarioModalData(s);
  const testids: string[] = [];
  const texts: string[] = [];

  // Alerts render via AttentionBanner for EVERY non-warnings routing
  // (overview / rooms / event / crew all emit `attention-banner-<alertId>`,
  // verified against the built server's rendered DOM), while a warnings-routed
  // alert renders as `parse-attention-note-<CODE>`. Add both candidates per
  // alert; the OR-match catches whichever the modal actually rendered.
  for (const a of alerts) {
    if (a.kind !== "alert") continue;
    testids.push(`attention-banner-${a.alert.alertId}`);
    const code = alertCode(s, a.alert.alertId);
    if (code) testids.push(`parse-attention-note-${code}`);
  }
  if (d.alertsDegraded) testids.push("attention-degraded-notice");
  // Warnings -> the warned section's active-warnings block.
  for (const sec of Object.keys(deriveRoutedWarnings(d.bySection).activeWarningsBySection)) {
    testids.push(`section-warning-active-${sec}`);
  }
  // A hold -> the Changes rail badge.
  if (items.some((i) => i.kind === "hold")) testids.push("changes-rail-badge");
  // Monitoring-only items (non-actionable self_heal, e.g. t2-monitoring-only
  // from the monitoring-badge-expand work) render in the quiet pill segment,
  // not as AttentionBanner cards (PublishedReviewModal.tsx:821).
  if (items.some((i) => i.kind === "alert" && !i.actionable && i.clearingKind === "self_heal")) {
    testids.push("attention-pill-monitoring-segment");
  }
  // Nothing above -> the clean-modal empty-attention copy.
  if (testids.length === 0 && texts.length === 0) texts.push("Nothing needs a look");
  return { testids, texts };
}

/** Assert at least one of a scenario's markers is present inside the dialog. */
async function expectMarker(page: Page, id: string): Promise<void> {
  const dialog = page.locator(DIALOG);
  const marker = markerFor(id);
  for (const t of marker.testids) {
    if ((await dialog.locator(`[data-testid="${t}"]`).count()) > 0) return;
  }
  for (const text of marker.texts) {
    if ((await dialog.getByText(text, { exact: false }).count()) > 0) return;
  }
  throw new Error(
    `${id}: no in-dialog marker found. testids=[${marker.testids.join(", ")}] texts=[${marker.texts.join(
      " | ",
    )}]`,
  );
}

// Derived ONCE at module load — the authority the route also uses.
const { rendered, excluded } = partitionScenarios();
const RENDERED_IDS = rendered.map((s) => s.id);
const STRUCTURAL = excluded.filter((e) => e.reason === "structural");
const CUT = excluded.filter((e) => e.reason === "cut");

async function gotoScenario(page: Page, id: string): Promise<void> {
  // Bounded retry: the route is a server render whose first line is a Supabase
  // requireDeveloper() call. Under the 72-scenario sweep a single request can
  // transiently blip (a masked SSR digest error, verified NON-reproducible in
  // isolation — the same scenario renders 8/8 clean on the built artifact), so
  // one reload absorbs the transient without masking a persistent failure (the
  // final attempt still throws). Re-queries the dialog every attempt — never
  // retains a handle across a keyed remount (§5.4 detach-safety).
  const ATTEMPTS = 3;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    await page.goto(`${GALLERY_PATH}?scenario=${encodeURIComponent(id)}`);
    await expect(page).toHaveURL(new RegExp("/admin/dev/attention-gallery"));
    try {
      await expect(page.locator(DIALOG)).toHaveCount(1, { timeout: 8000 });
      return;
    } catch (err) {
      if (attempt === ATTEMPTS) throw err;
    }
  }
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

    // Global write guard: a non-GET request to a SHOW-MUTATION endpoint fails
    // the test. The admin LAYOUT (which wraps every admin page) mints a realtime
    // subscription token via `POST /api/admin/alerts/bell/token` on load — that
    // is background admin chrome, present on every admin route, unrelated to the
    // gallery's mutation controls, and outside GalleryWriteGuard's fetch-only
    // scope (it is not a `window.fetch` call). It never writes show data, so it
    // is not a containment failure; ignore it and any other realtime-token mint.
    // Same class: the client error-reporting beacon (`POST
    // /api/observe/client-error`) fires whenever a transient SSR digest blip
    // (the DEVELOPER_SESSION_LOOKUP_FAILED class gotoScenario's bounded retry
    // absorbs) reaches the client error boundary. It writes telemetry, never
    // show data, and fires independently of any mutation control.
    const IGNORED_WRITE_PATHS = [
      /\/api\/admin\/alerts\/bell\/token$/,
      /\/token$/,
      /\/api\/observe\/client-error$/,
    ];
    const nonGetWrites: string[] = [];
    const onRequest = (req: Request) => {
      const method = req.method().toUpperCase();
      if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        const u = new URL(req.url());
        // Only our own app origin is interesting; ignore any 3rd-party beacons.
        if (u.port !== "3001") return;
        if (IGNORED_WRITE_PATHS.some((re) => re.test(u.pathname))) return;
        nonGetWrites.push(`${method} ${u.pathname}`);
      }
    };
    page.on("request", onRequest);

    // Coverage ledger: prove BOTH write mechanisms were exercised — a form-action
    // control (publish toggle) and the fetch-backed control (resolve). Both are
    // no-ops here; the point is that clicking them produces no write.
    const exercised = new Set<string>();

    try {
      // The fetch-backed resolve control runs LAST (guard-attribute sequencing),
      // so defer any scenario that surfaces it and sweep the rest first.
      const resolveScenarios: string[] = [];

      for (const id of RENDERED_IDS) {
        await gotoScenario(page, id);
        const dialog = page.locator(DIALOG);

        // (1) Flight proof — the scenario's OWN marker inside the dialog.
        await expectMarker(page, id);

        // Defer resolve-bearing scenarios; sweep form-action controls now.
        const resolveBtn = dialog.locator('[data-testid^="per-show-alert-resolve-"]');
        // Scripted action-outcome scenarios (t2-act-*) serve a SCRIPTED response
        // for resolve (data-gallery-scripted-write, not blocked-write) and are
        // containment-proven by their own suite below; this sweep's blocked-write
        // sequencing needs an UNSCRIPTED representative.
        if ((await resolveBtn.count()) > 0 && !id.startsWith("t2-act-")) {
          resolveScenarios.push(id);
        }

        // (2) Exercise the publish toggle where present (a form-action write path).
        // Scenarios with actionable items AUTO-OPEN the attention dropdown
        // (§5.2), and a tall menu (needs-look + monitoring groups, e.g.
        // t3-full-attention-split) overlays the strip and intercepts the click.
        // First Escape closes only the menu (capture-phase handler), never the
        // modal.
        const attentionMenu = dialog.locator(
          '[data-testid="published-show-review-attention-menu"]',
        );
        if ((await attentionMenu.count()) > 0) {
          await page.keyboard.press("Escape");
          await expect(attentionMenu).toHaveCount(0);
        }
        const publish = dialog.locator('[data-testid="strip-publish-toggle"] button').first();
        // Skip DISABLED toggles (e.g. the finalize-owned / live lifecycle
        // scenarios render the switch locked): a disabled control cannot write,
        // so containment holds trivially, and clicking it only times out. The
        // ledger's "publish" entry is still proven by the enabled scenarios.
        if ((await publish.count()) > 0 && (await publish.isEnabled())) {
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

  test("Escape is swallowed (stays on the gallery); the modal's native X exits to /admin", async ({
    page,
  }) => {
    await gotoScenario(page, RENDERED_IDS[0]!);

    // Escape is swallowed by the switcher so the modal's shell close (which
    // navigates to /admin) never fires — the operator stays mid-sweep. The modal
    // stays mounted, the URL stays on the gallery, and stepping still works.
    await page.locator(DIALOG).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(DIALOG)).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp("/admin/dev/attention-gallery"));
    const live = page.locator(`${CONTROLS} [aria-live="polite"]`);
    await page.keyboard.press("ArrowRight");
    await expect(live).toHaveText(/^\s*2\s*\//);

    // The modal's OWN close affordance is the real component's behavior: it
    // navigates to the dashboard (useShowModalNav → router.push('/admin')),
    // leaving the gallery. This documents the discovered close semantics.
    await page.locator('[data-testid="published-show-review-close"]').click();
    await expect(page).toHaveURL(new RegExp("/admin(\\?|$)"));
    await expect(page.locator(DIALOG)).toHaveCount(0);
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
      await expectMarker(page, RENDERED_IDS[0]!);
    }

    // Footnotes live behind the collapsed-by-default disclosure (slim-bar spec
    // §2.2/§2.3): absent until the excluded toggle opens the panel.
    const controls = page.locator(CONTROLS);
    await expect(controls.getByText(/published attention surface/i)).toHaveCount(0);
    await controls.getByTestId("attention-switcher-excluded-toggle").click();
    for (const e of STRUCTURAL) {
      await expect(controls.getByText(e.label, { exact: false })).toBeVisible();
    }
    await expect(controls.getByText(String(CUT.length), { exact: false })).toBeVisible();
    await expect(controls.getByText(/published attention surface/i)).toBeVisible();
  });

  test("collapsed bar clears the modal at both viewports; panel state survives remount", async ({
    page,
  }) => {
    // Strict rect overlap: any shared area counts as intersection.
    const intersects = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

    const MODAL_BOXES = [
      // The PANEL box, not DIALOG: `published-show-review-modal` is the
      // full-viewport overlay wrapper (fixed inset-0, ReviewModalShell.tsx:582)
      // and intersects everything by construction. The panel node carries
      // data-review-modal-panel (dataAttrPrefix="review-modal").
      "[data-review-modal-panel]",
      '[data-testid="published-show-review-header"]',
      '[data-testid="published-show-review-close"]',
      // No footer box: PublishedReviewModal passes no footer prop, so the shell
      // never renders `-footer` (ReviewModalShell.tsx renders it only when
      // `footer != null`). Panel containment covers the gap regardless.
    ];

    // Collapsed-state geometry, asserted per viewport. Mobile FIRST so the
    // disclosure has never been touched; desktop re-navigates fresh (slim-bar
    // spec §5 ordering — no expanded-state leakage into collapsed assertions).
    const assertCollapsedGeometry = async () => {
      const bar = page.locator(CONTROLS);
      const barBox = await bar.boundingBox();
      expect(barBox).not.toBeNull();
      // The amended [R1-12] cap: single row, <=64px (0px safe-area inset here).
      expect(barBox!.height).toBeLessThanOrEqual(64);
      // No horizontal content overflow: the inset-x-0 bar box is always inside
      // the viewport, so scrollWidth vs clientWidth is the real assertion.
      const { scrollWidth, clientWidth } = await bar.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      // The bar must not intersect the modal panel or its header/close boxes.
      // Every other protected surface is a descendant clipped by the panel's
      // overflow-clip, so clearing the panel box clears them (containment).
      for (const sel of MODAL_BOXES) {
        const box = await page.locator(sel).boundingBox();
        expect(box, `${sel} should render a box`).not.toBeNull();
        expect(intersects(barBox!, box!), `collapsed bar must not intersect ${sel}`).toBe(false);
      }
    };

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoScenario(page, RENDERED_IDS[0]!);
    await assertCollapsedGeometry();

    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoScenario(page, RENDERED_IDS[0]!);
    await assertCollapsedGeometry();

    // Persistence (desktop only, spec §5): the bar is outside the keyed modal
    // subtree, so the open panel survives a scenario remount. Await the remount
    // proof (aria-live count advance) BEFORE asserting persistence.
    const toggle = page.getByTestId("attention-switcher-excluded-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.locator(DIALOG).click();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(`${CONTROLS} [aria-live="polite"]`)).toHaveText(/^\s*2\s*\//);
    await expect(page.getByTestId("attention-switcher-excluded-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(page.getByTestId("attention-switcher-excluded-panel")).toBeVisible();
  });

  test("tier-3 composite deep-links render in the switcher (gap-fill §3.1)", async ({ page }) => {
    await gotoScenario(page, T3_CREW_COLLISION);
    await expect(page.locator(`${CONTROLS}[data-codes*="AMBIGUOUS_EMAIL_BINDING"]`)).toHaveCount(1);
  });

  test("feed truncation notice renders only on the flagged scenario (gap-fill §3.2)", async ({
    page,
  }) => {
    await gotoScenario(page, T2_FEED_TRUNCATED);
    await expect(
      page.locator(DIALOG).locator('[data-testid="change-feed-truncation"]'),
    ).toBeVisible();
    await gotoScenario(page, T2_MULTI_HOLD);
    await expect(
      page.locator(DIALOG).locator('[data-testid="change-feed-truncation"]'),
    ).toHaveCount(0);
  });

  test("group select jumps to a section's first scenario and tracks stepping (gap-fill §3.5)", async ({
    page,
  }) => {
    await gotoScenario(page, RENDERED_IDS[0]!);
    const select = page.locator('[data-testid="attention-switcher-group-select"]');
    const targetGroup = rendered.find((s) => s.group !== rendered[0]!.group)!.group;
    const firstIndex = rendered.findIndex((s) => s.group === targetGroup);
    await select.selectOption(targetGroup);
    const live = page.locator(`${CONTROLS} [aria-live="polite"]`);
    await expect(live).toHaveText(new RegExp(`^\\s*${firstIndex + 1}\\s*/`));
    await expect(select).toHaveValue(targetGroup);
    await expect(page.locator(DIALOG)).toHaveCount(1);
  });
  test("modal-state: changelog history renders every badge, accept, undo, and gate composition (§3.6)", async ({
    page,
  }) => {
    await gotoScenario(page, "t2-changelog-history");
    const dialog = page.locator(DIALOG);
    const feedEntries = dialog.locator('[data-testid="change-feed-summary"]');
    await expect(feedEntries).toHaveCount(12);
    for (const badge of ["Applied", "Rejected", "Undone", "Superseded", "Pending review"]) {
      await expect(dialog.getByText(badge).first()).toBeVisible();
    }
    await expect(dialog.getByRole("button", { name: /accept all \(3\)/i })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^undo this change$/i })).toHaveCount(2);
    await expect(dialog.getByText("Accepted", { exact: true })).toHaveCount(3);
  });

  test("modal-state: archived show hides the publish toggle and re-sync (§3.6)", async ({
    page,
  }) => {
    await gotoScenario(page, "t2-archived");
    const dialog = page.locator(DIALOG);
    await expect(dialog.getByText(/archived/i).first()).toBeVisible();
    await expect(dialog.getByRole("switch")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /re-sync/i })).toHaveCount(0);
  });

  test("modal-state: nothing-parsed shows the empty-section copy (§3.6)", async ({ page }) => {
    await gotoScenario(page, "t2-nothing-parsed");
    const dialog = page.locator(DIALOG);
    // Every declared-empty section's copy, not just crew/rooms (review B P2):
    // the scenario empties crew, venue, rooms, hotels, transport, contacts,
    // billing, agenda AND absents dates.
    await expect(dialog.getByText("No crew parsed.")).toBeVisible();
    await expect(dialog.getByText("No venue details parsed.")).toBeVisible();
    await expect(dialog.getByText("No rooms parsed.")).toBeVisible();
    await expect(dialog.getByText("No hotels parsed.")).toBeVisible();
    await expect(dialog.getByText("No transportation parsed.")).toBeVisible();
    await expect(dialog.getByText("No contacts parsed.")).toBeVisible();
    await expect(dialog.getByText("No billing details parsed.")).toBeVisible();
    await expect(dialog.getByText(/dates not detected/i).first()).toBeVisible();
  });

  test("modal-state: overflow volumes render every cap note (§3.6)", async ({ page }) => {
    await gotoScenario(page, "t2-overflow-volumes");
    const dialog = page.locator(DIALOG);
    // All four declared overflow axes (review B P2): crew 31/cap 30, rooms
    // 21/cap 20, hotels 13/cap 12 (step3ReviewSections.tsx:152-154), schedule
    // "overflow" (agenda-day cap slicing).
    await expect(dialog.getByText(/and 1 more people/)).toBeVisible();
    await expect(dialog.getByText(/and 1 more rooms/)).toBeVisible();
    await expect(dialog.getByText(/and 1 more hotels/)).toBeVisible();
    await expect(dialog.getByText(/more days/).first()).toBeVisible();
  });

  test("modal-state: ignored warnings disclosure opens to muted cards (§3.6)", async ({ page }) => {
    await gotoScenario(page, "t2-ignored-warnings");
    const dialog = page.locator(DIALOG);
    // Native <details>/<summary> disclosure (sectionWarningExtras.tsx:242-252) —
    // the summary has no button role, so target its testid prefix directly.
    const disclosure = dialog.locator('[data-testid^="section-ignored-summary-"]');
    await disclosure.click();
    await expect(dialog.getByRole("button", { name: /un-ignore/i }).first()).toBeVisible();
  });

  test("modal-state: share batches show the multi-email note (§3.6)", async ({ page }) => {
    await gotoScenario(page, "t2-share-batches");
    const dialog = page.locator(DIALOG);
    await dialog.getByRole("button", { name: /share link/i }).click();
    const note = page.locator('[data-testid="admin-current-share-link-email-note"]');
    await expect(note).toHaveText(/needs \d+ separate emails/i);
    // Cross-check the note's count against the actually rendered batch rows
    // (ShareHub.tsx:442-463 renders one anchor per mailto batch) so a wrong
    // batch calculation cannot pass on the note's mere presence (review B P2).
    const claimed = Number((await note.innerText()).match(/needs (\d+) separate emails/i)?.[1]);
    expect(claimed).toBeGreaterThan(1);
    await expect(page.locator('[data-testid="admin-current-share-link-email-button"]')).toHaveCount(
      claimed,
    );
  });

  test("modal-state: diagram sub-block renders 12 capped thumbnails plus the overflow note (§3.6)", async ({
    page,
  }) => {
    await gotoScenario(page, "t2-diagram-images");
    const dialog = page.locator(DIALOG);
    await expect(dialog.getByText(/\+1 more/)).toBeVisible();
    // The review modal's Diagrams sub-block renders link+img thumbnails (not the
    // crew-page Gallery tile grid): a "13 embedded images" count line, 12 capped
    // thumbnail links, and the "+1 more" note asserted above.
    await expect(dialog.getByText("13 embedded images")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Diagram from Diagrams" })).toHaveCount(12);
  });
});

test.describe("action outcomes (spec 2026-07-23 gallery-action-outcomes)", () => {
  // Non-egress recorder: scripted endpoints must never produce a real network
  // request — GalleryWriteGuard synthesizes the Response BEFORE dispatch, so a
  // single request event to any of these paths is a containment failure.
  const SCRIPTED_ENDPOINTS = [
    /\/api\/admin\/sync\//,
    /\/alerts\/[^/]+\/resolve$/,
    /\/data-quality\/ignore$/,
  ];
  let scriptedEgress: string[] = [];
  const onRequest = (req: Request) => {
    const u = new URL(req.url());
    if (u.port !== "3001") return;
    if (SCRIPTED_ENDPOINTS.some((re) => re.test(u.pathname))) {
      scriptedEgress.push(`${req.method()} ${u.pathname}`);
    }
  };

  test.beforeEach(async ({ page }) => {
    scriptedEgress = [];
    page.on("request", onRequest);
    await signInAs(page, DEVELOPER_FIXTURE);
  });
  test.afterEach(async ({ page }) => {
    page.off("request", onRequest);
    expect(scriptedEgress, "scripted endpoints must never reach the network").toEqual([]);
    await signOut(page);
  });

  const dialogOf = (page: Page) => page.locator(DIALOG);

  test("re-sync error panel renders catalog copy from the scripted 500", async ({ page }) => {
    await gotoScenario(page, "t2-act-resync-error");
    const dialog = dialogOf(page);
    await dialog.locator('[data-testid="admin-resync-button"]').click();
    const panel = dialog.locator('[data-testid="admin-resync-error"]');
    await expect(panel).toBeVisible();
    // Non-empty catalog copy (kills the blank-ErrorExplainer failure mode).
    expect((await panel.innerText()).trim().length).toBeGreaterThan(20);
    await expect(page.locator("html")).toHaveAttribute(
      "data-gallery-scripted-write",
      /POST \/api\/admin\/sync\//,
    );
  });

  test("re-sync shrink-hold confirm shows the scripted detail", async ({ page }) => {
    await gotoScenario(page, "t2-act-resync-shrink");
    const dialog = dialogOf(page);
    await dialog.locator('[data-testid="admin-resync-button"]').click();
    const confirm = dialog.locator('[data-testid="admin-resync-shrink-confirm"]');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("This re-sync would reduce the show:");
    // Scripted detail derived from the scenario object, not duplicated:
    const scenario = ALL_SCENARIOS.find((s) => s.id === "t2-act-resync-shrink");
    const detail =
      scenario?.actionOutcomes?.resync?.kind === "shrink_held"
        ? scenario.actionOutcomes.resync.detail
        : "";
    expect(detail.length).toBeGreaterThan(0);
    await expect(confirm).toContainText(detail);
  });

  test("publish-toggle refusal popover renders the cataloged refusal", async ({ page }) => {
    await gotoScenario(page, "t2-act-publish-refusal");
    const dialog = dialogOf(page);
    await dialog.locator('[data-testid="strip-publish-toggle"] button').first().click();
    const popover = dialog.locator('[data-testid="published-toggle-popover"]');
    await expect(popover).toBeVisible();
    expect((await popover.innerText()).trim().length).toBeGreaterThan(20);
  });

  test("bulk-ignore partial reports Ignored X of N from the scripted per-item results", async ({
    page,
  }) => {
    const scenario = ALL_SCENARIOS.find((s) => s.id === "t2-act-bulkignore-partial");
    const okCount =
      scenario?.actionOutcomes?.bulkIgnore?.kind === "partial"
        ? scenario.actionOutcomes.bulkIgnore.okCount
        : 0;
    const groupSize = scenario?.warnings?.length ?? 0;
    expect(okCount).toBeGreaterThan(0);
    expect(groupSize).toBeGreaterThan(okCount);

    await gotoScenario(page, "t2-act-bulkignore-partial");
    const dialog = dialogOf(page);
    const chip = dialog.locator('[data-testid^="dq-bulk-ignore-"]').first();
    await chip.click(); // arm
    await chip.click(); // confirm (two-tap guard)
    const alertBox = dialog.locator('[data-testid="dq-bulk-ignore-error"]');
    await expect(alertBox).toBeVisible();
    await expect(alertBox).toContainText(
      `Ignored ${okCount} of ${groupSize}. Refresh to see the rest.`,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-gallery-scripted-write",
      /POST .*\/data-quality\/ignore/,
    );
  });

  test("crew-row reset not-found banner renders the roster-changed sentence", async ({ page }) => {
    await gotoScenario(page, "t2-act-crewreset-notfound");
    const dialog = dialogOf(page);
    await dialog.locator('[data-testid^="crew-row-menu-button-"]').first().click();
    await dialog.locator('[data-testid^="crew-row-reset-item-"]').first().click();
    await dialog.locator('[data-testid="crew-row-reset-confirm-go"]').click();
    const banner = dialog.locator('[data-testid="crew-row-reset-error"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("no longer on the roster");
  });

  test("share-hub rotate success reveals the rotated link state", async ({ page }) => {
    await gotoScenario(page, "t2-act-share-success");
    const dialog = dialogOf(page);
    await dialog.locator('[data-testid="share-hub-kebab"]').click();
    await dialog.locator('[data-testid="admin-rotate-share-token-button"]').click();
    await dialog.locator('[data-testid="admin-rotate-share-token-confirm-button"]').click();
    await expect(dialog.locator('[data-testid="admin-rotate-share-token-ok"]')).toBeVisible();
  });

  test("pending: re-sync stays on its busy label (never-resolving script)", async ({ page }) => {
    await gotoScenario(page, "t2-act-pending");
    const dialog = dialogOf(page);
    const btn = dialog.locator('[data-testid="admin-resync-button"]');
    await btn.click();
    await expect(btn).toBeDisabled();
    // Bounded settle: the busy state must STILL hold after a real beat.
    await page.waitForTimeout(500);
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute("aria-busy", "true");
  });
});
