/**
 * tests/e2e/admin-banner.spec.ts (M5 §B Task 5.9 — Doug's portion)
 *
 * E2E coverage for the admin AlertBanner. Runs against the mobile-safari
 * project (port 3000), which has ADMIN_DEV_PANEL_ENABLED=true so the
 * /admin/dev route renders for admins.
 *
 * M12.3 items 1+2 (amended by the needs-attention spec D-5): the global
 * AlertBanner mounts on the dashboard (app/admin/page.tsx) + on
 * /admin/needs-attention only — it is NO LONGER a persistent admin-layout
 * slot. So the banner render/resolve/cancel/clean-state tests target /admin
 * (the dashboard), NOT /admin/dev. The dedicated banner-placement contract
 * test asserts the banner is present on /admin + /admin/needs-attention and
 * absent on /admin/dev, /admin/settings, and per-show routes.
 *
 * Spec §4.6 (admin_alerts) + §12.4 (catalog) + invariant 5 (no raw codes
 * in user-visible UI).
 *
 * Test surfaces:
 *   1. Clean state — no banner on /admin.
 *   2. Insert one row — banner renders the catalog dougFacing copy on /admin
 *      (anti-tautology: assert against the literal string from the catalog
 *      file, not messageFor()).
 *   3. Click Resolve on /admin — banner disappears; row is `resolved_at IS NOT NULL`.
 *   4. Non-admin user → /admin/dev returns 403 (requireAdmin gate; not a
 *      banner test).
 *   5. Banner-placement contract — banner present on /admin AND
 *      /admin/needs-attention (needs-attention spec D-5), absent on
 *      /admin/dev, /admin/settings, and a per-show route.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { ADMIN_FIXTURE, NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
// RECON-1 T8: seedGlobalAlert seeds N unresolved rows (one GLOBAL top row +
// fillers) so the queue chip / "N alerts" badge render; TOP_CODE is the code of
// that top (most-recent) GLOBAL row the banner renders. seedGlobalAlert
// internally calls the helper's OWN clearAlerts, so it coexists with this
// file's local clearAlerts (NOT imported — name collision; see Step 0).
import { seedGlobalAlert, TOP_CODE } from "./helpers/seedAlerts";

const ALERT_CODE = "AMBIGUOUS_EMAIL_BINDING" as const;

// RECON-1 T7/T8 <details> SCOPING HAZARD (spec §7.1 S1, load-bearing): the
// expanded panel is a SECTION-level grid SIBLING of <details> (the F18 fix —
// Chromium will not full-width-span a display:contents-nested grid item), and
// ErrorExplainer + HelpAffordance each render their OWN nested <details> INSIDE
// that panel. So `[data-testid=admin-alert-banner] details` matches THREE
// <details> when expanded → Playwright strict-mode violation. EVERYWHERE we mean
// the OUTER disclosure we scope to the one details that owns the caret (the caret
// testid is unique to the outer summary; the panel is no longer a <details>
// descendant, so `details:has([data-testid=admin-alert-panel])` would match
// NOTHING). Mirrors admin-banner-layout.spec.ts.
const OUTER_DETAILS =
  "[data-testid=admin-alert-banner] details:has([data-testid=admin-alert-caret])";
const OUTER_SUMMARY = `${OUTER_DETAILS} > summary`;

async function clearAlerts(): Promise<void> {
  // Wipe ALL admin_alerts rows — service role bypasses RLS. Use neq on a
  // never-matching id so the DELETE WHERE clause is well-formed.
  const { error } = await admin
    .from("admin_alerts")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(`clearAlerts failed: ${error.message}`);
}

async function insertAlert(code: string): Promise<string> {
  const { data, error } = await admin
    .from("admin_alerts")
    .insert({
      code,
      // show_id null — the unique partial index allows one row per
      // (coalesce(show_id::text, ''), code) where resolved_at is null.
      // We clear the table beforehand so collision isn't a concern.
      context: { source: "e2e" },
    })
    .select("id")
    .single();
  if (error) throw new Error(`insertAlert(${code}) failed: ${error.message}`);
  return data!.id as string;
}

async function rowResolvedAt(id: string): Promise<string | null> {
  const { data, error } = await admin
    .from("admin_alerts")
    .select("resolved_at")
    .eq("id", id)
    .single();
  if (error) throw new Error(`rowResolvedAt(${id}) failed: ${error.message}`);
  return (data?.resolved_at as string | null) ?? null;
}

test.describe("admin AlertBanner (mobile-safari, /admin)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await clearAlerts();
  });

  test("clean state: no banner on the dashboard when admin_alerts has no unresolved rows", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    // M12.3 items 1+2: the AlertBanner is no longer a persistent-layout slot —
    // it mounts ONLY on the dashboard page (app/admin/page.tsx). A clean DB ⇒
    // the dashboard renders (empty-state tolerant of zero shows) but the banner
    // self-fetches 0 rows and renders null.
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-testid=admin-nav-brand]")).toBeVisible();
    await expect(page.locator("[data-testid=admin-alert-banner]")).toHaveCount(0);
  });

  test("inserted row: banner renders the dougFacing catalog copy verbatim (anti-tautology)", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const id = await insertAlert(ALERT_CODE);

    await page.goto("/admin");

    const banner = page.locator("[data-testid=admin-alert-banner]");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-alert-id", id);

    // Anti-tautology: assert the literal string from MESSAGE_CATALOG, not
    // the runtime messageFor() result.
    await expect(page.locator("[data-testid=error-explainer-message]")).toHaveText(
      MESSAGE_CATALOG[ALERT_CODE].dougFacing!,
    );
  });

  test("Resolve action: two-tap confirm submits + hides banner + stamps resolved_at on the row", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const id = await insertAlert(ALERT_CODE);

    await page.goto("/admin");
    await expect(page.locator("[data-testid=admin-alert-banner]")).toBeVisible();

    // M9 C4 / M5-D3 (R2 fix): Resolve is now a two-tap confirm flow per
    // shape brief §5.4. First tap moves idle → confirm; the form
    // submits only on the second tap (Confirm resolve). This test pins
    // both transitions plus the eventual server-side resolve.
    //
    // M12.3: the Resolve button lives in the always-visible action cell of the
    // collapsed strip (NOT behind the <details> disclosure), so the two-tap flow
    // works without expanding the panel first. ALERT_CODE is GLOBAL (show_id
    // null) so the action cell shows Resolve, not a View-show link
    // (AlertBanner.tsx:197 `isPerShowAlert = alert.show_id !== null`).

    // First tap: idle → confirm. The Confirm + Cancel sibling pair
    // appears; the original Resolve button unmounts.
    await page.click("[data-testid=admin-alert-resolve-button]");
    await expect(page.locator("[data-testid=admin-alert-confirm-row]")).toBeVisible();
    await expect(
      page.locator("[data-testid=admin-alert-confirm-resolve-button]"),
    ).toBeVisible();
    await expect(page.locator("[data-testid=admin-alert-cancel-button]")).toBeVisible();

    // Second tap: Confirm resolve submits the parent <form> Server Action
    // which UPDATEs the row and revalidates /admin so the banner re-renders empty.
    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.click("[data-testid=admin-alert-confirm-resolve-button]"),
    ]);

    // Banner is gone (no longer mounts because the SELECT now returns 0 rows).
    await expect(page.locator("[data-testid=admin-alert-banner]")).toHaveCount(0);

    // Refresh — banner stays gone (state, not just optimistic UI).
    await page.reload();
    await expect(page.locator("[data-testid=admin-alert-banner]")).toHaveCount(0);

    // DB confirms: the row's resolved_at is non-null AND resolved_by is
    // the admin's email.
    const resolvedAt = await rowResolvedAt(id);
    expect(resolvedAt).not.toBeNull();

    const { data, error } = await admin
      .from("admin_alerts")
      .select("resolved_by")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    expect((data as { resolved_by: string | null } | null)?.resolved_by).toBe(ADMIN_FIXTURE.email);
  });

  test("M9 C4 / M5-D3: Cancel during two-tap confirm reverts to idle (no DB write)", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const id = await insertAlert(ALERT_CODE);

    await page.goto("/admin");
    await expect(page.locator("[data-testid=admin-alert-banner]")).toBeVisible();

    // First tap → confirm.
    await page.click("[data-testid=admin-alert-resolve-button]");
    await expect(page.locator("[data-testid=admin-alert-confirm-row]")).toBeVisible();

    // Cancel → idle. Confirm row unmounts; original Resolve returns.
    await page.click("[data-testid=admin-alert-cancel-button]");
    await expect(page.locator("[data-testid=admin-alert-confirm-row]")).toHaveCount(0);
    await expect(page.locator("[data-testid=admin-alert-resolve-button]")).toBeVisible();

    // No server round-trip happened: the row is still unresolved.
    const resolvedAt = await rowResolvedAt(id);
    expect(resolvedAt).toBeNull();
  });

  test("non-admin user: /admin/dev → 403 from the layout's requireAdmin gate", async ({
    page,
  }) => {
    // This test is about requireAdmin, NOT the banner — it stays on /admin/dev
    // (a valid admin-gated route). M12.3: the global banner no longer mounts on
    // /admin/dev anyway (dashboard-only), so the body-absence assertion below is
    // a requireAdmin gate check, not a banner-slot claim. Even with an
    // unresolved alert in the table, the non-admin gets a 403 before any admin
    // chrome renders.
    await insertAlert(ALERT_CODE);

    await signInAs(page, NON_ADMIN_CREW_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(response?.status()).toBe(403);

    // Belt-and-suspenders: even if the page rendered partial chrome, the
    // banner testid must not appear in the response body.
    const body = (await response?.text()) ?? "";
    expect(body).not.toContain("admin-alert-banner");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// RECON-1 Task 8: no-JS reachability, identity/route/query remount, exact-count
// a11y. These are TOP-LEVEL tests (outside the describe above), so each signs in
// explicitly — the describe-level beforeEach (signOut + clearAlerts) does NOT
// apply here. They sign OUT first (clean slate) then sign in as ADMIN_FIXTURE.
// Surface: /admin. M12.3 items 1+2: the banner is now DASHBOARD-ONLY (mounted
// under the Dashboard header in app/admin/page.tsx, removed from the layout) —
// PRESENT on /admin, ABSENT on /admin/settings + per-show. Runs in BOTH
// mobile-safari@390 and desktop-chromium@1280 (admin-banner is in both
// testMatch regexes).
// ───────────────────────────────────────────────────────────────────────────

test.describe("admin AlertBanner — RECON-1 behavior (no-JS / remount / a11y)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await clearAlerts();
  });
  test.afterAll(async () => {
    await clearAlerts();
  });

  // Step 1 — No-JS reachability (spec §11 F3). With JavaScript disabled the
  // native <details> toggle (a browser default action) must still open the
  // panel and surface the full message / help / raised-at / queue chip; the
  // chip is a real <a href> that navigates on click without JS.
  test("no-JS: native <summary> opens; full message/help/raised-at/+N more reachable; queue link navigates", async ({
    browser,
  }) => {
    // Manual contexts do NOT inherit the project `use` config — pass baseURL so
    // signInAs's relative POST and page.goto("/admin") resolve (F-P14). Fall
    // back to the 127.0.0.1:3000 server URL (exactOptionalPropertyTypes forbids
    // an `undefined` baseURL; mirrors admin-banner-layout.spec.ts).
    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:3000";
    const ctx = await browser.newContext({ baseURL, javaScriptEnabled: false });
    const page = await ctx.newPage();
    // signInAs POSTs via page.request (Playwright request context, independent
    // of page JS) → works with javaScriptEnabled:false. (No signInAsViaApi.)
    await signInAs(page, ADMIN_FIXTURE);
    await seedGlobalAlert({ count: 110 });
    await page.goto("/admin");

    const panel = page.getByTestId("admin-alert-panel");
    // Collapsed by default: the panel is in the DOM but hidden by the explicit
    // pure-CSS sibling rule
    //   [data-testid=admin-alert-banner] details:not([open]) ~ [data-testid=admin-alert-panel] { display:none }
    // in globals.css (the panel is a SECTION sibling of <details>, NOT a child,
    // so the UA `details:not([open]) > :not(summary)` rule does NOT apply here —
    // spec §7.1 S1). Either way: native toggle drives visibility with NO JS.
    await expect(panel).toBeHidden();

    // Open the disclosure with NO JS — native <details> toggle is a browser
    // default action, so a real click works even with javaScriptEnabled:false.
    // Scope to the OUTER summary (the caret-owning one) — NOT the nested
    // ErrorExplainer/HelpAffordance summaries (which only exist once open).
    await page.locator(OUTER_SUMMARY).click();
    await expect(panel).toBeVisible();

    // Full context reachable without JS:
    await expect(panel.getByText(/what does this mean/i)).toBeVisible(); // HelpAffordance disclosure
    await expect(page.getByTestId("admin-alert-raised-at")).toBeVisible();
    const chip = page.getByTestId("admin-alert-queue-chip");
    await expect(chip).toBeVisible();

    // Queue link navigates (full load, JS off) to /admin#alerts (reachability).
    await chip.click();
    await expect(page).toHaveURL(/\/admin#alerts$/);
    await ctx.close();
  });

  // Step 2 — Dashboard-only presence + query remount (M12.3 items 1+2; spec
  // §11 F17/F19). The banner is now mounted ONLY on the dashboard (under the
  // Dashboard header), NOT in the persistent admin layout. Two properties:
  //   (i) navigating AWAY to /admin/settings → the banner is GONE (count 0);
  //       returning to /admin → it is PRESENT and COLLAPSED.
  //   (ii) a QUERY-ONLY change WITHIN /admin still remounts a fresh COLLAPSED
  //        <details> via AlertBannerRouteBoundary (keyed by pathname+search+
  //        alertId). The __noReload sentinel proves the query nav was
  //        client-side (a full load would collapse <details> natively and pass
  //        WITHOUT the boundary doing anything).
  //
  // VERIFIED (plan watchpoint): the dashboard Active/Archived segmented control
  // (DashboardBucketSegmentedControl.tsx:51,71) navigates via next/link
  // (`<Link href="?bucket=...">`) — client-side, NOT a full-page form. The
  // "Active" segment is ALWAYS a <Link> (only "Archived" is count-disabled),
  // so the archived→active click is reliably a real client-side query nav.
  test("dashboard-only: banner gone on settings, present+collapsed back on /admin; query nav re-renders collapsed (M12.3, F17/F19)", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await seedGlobalAlert({ count: 1 });
    await page.goto("/admin");
    const banner = page.locator("[data-testid=admin-alert-banner]");
    const details = page.locator(OUTER_DETAILS);
    const summary = page.locator(OUTER_SUMMARY);

    // (i) navigate AWAY to settings via the in-app nav LINK (client-side). Scope
    // to the admin NAV chrome. (The Dashboard body's own "Open settings" link was
    // removed in M12.6 — the nav Settings tab is now the only Settings link.) The
    // two nav Settings links live in `admin-nav-topbar` (visible ≥720px) and the
    // bottom tab (visible <720px); `getByRole` excludes display:none elements, so
    // at each viewport exactly ONE of the .or() branches resolves → no strict-mode
    // violation in either project.
    const settingsNavLink = page
      .getByTestId("admin-nav-topbar")
      .getByRole("link", { name: /settings/i })
      .or(page.getByTestId("admin-bottom-tabs").getByRole("link", { name: /settings/i }));
    await expect(banner).toBeVisible(); // present on the dashboard
    await summary.click();
    await expect(details).toHaveAttribute("open", "");
    await settingsNavLink.click();
    await expect(page).toHaveURL(/\/admin\/settings/);
    // M12.3 item 1: the global banner does NOT ride to settings.
    await expect(banner).toHaveCount(0);

    // returning to /admin → banner present and COLLAPSED again.
    await page.goto("/admin");
    await expect(banner).toBeVisible();
    await expect(page.locator(OUTER_DETAILS)).not.toHaveAttribute("open", /.*/);

    // (ii) QUERY-ONLY change WITHIN /admin WITHOUT mutating any `shows` row
    // (avoids the per-show advisory-lock invariant + shared-CI-seed
    // contamination). Start on the archived bucket — the seed has active shows,
    // so the "Active" segment is always a real next/link there — then click
    // Active: same pathname /admin, query changes (?bucket=archived → cleared).
    await page.goto("/admin?bucket=archived");
    await summary.click();
    await expect(details).toHaveAttribute("open", "");
    await page.evaluate(() => {
      (window as Window & { __noReload?: boolean }).__noReload = true;
    });
    await page
      .getByTestId("dashboard-bucket-segmented")
      .getByRole("link", { name: /active/i })
      .click();
    await expect(page).not.toHaveURL(/bucket=archived/); // query changed, same /admin pathname
    expect(
      await page.evaluate(() => (window as Window & { __noReload?: boolean }).__noReload),
    ).toBe(true); // client-side, no full load
    await expect(page.locator(OUTER_DETAILS)).not.toHaveAttribute("open", /.*/);
  });

  // Step 2b — Banner-placement contract, explicit negative assertions (M12.3
  // adversarial R2, AMENDED by the needs-attention spec D-5). The global banner
  // is mounted on the dashboard page (app/admin/page.tsx:107) AND on
  // /admin/needs-attention (app/admin/needs-attention/page.tsx). With a single
  // seeded GLOBAL alert present, the banner MUST be:
  //   • PRESENT on /admin (the dashboard) AND /admin/needs-attention
  //   • ABSENT (count 0) on /admin/dev, /admin/settings, and a per-show route
  //     /admin/show/<slug>.
  // The per-show route keeps its OWN "Alerts for this show" surface, which is
  // NOT [data-testid=admin-alert-banner] — so this assertion does not collide
  // with that section. A real seeded slug is read from the DB at runtime
  // (mirrors lib/parser/slug-derived seed slugs, e.g. "slug-xxxxxxxx").
  test("banner placement contract: present on /admin + /admin/needs-attention, absent elsewhere (M12.3, amended by needs-attention spec D-5)", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await seedGlobalAlert({ count: 1 }); // one unresolved GLOBAL (show_id null) alert

    // A real seeded show slug for the per-show route. Service-role read bypasses
    // RLS; the seed always has shows (deriveSlug in supabase/seed.ts).
    const { data: show, error: showErr } = await admin
      .from("shows")
      .select("slug")
      .limit(1)
      .single();
    if (showErr) throw new Error(`slug fetch failed: ${showErr.message}`);
    const slug = show!.slug as string;

    const banner = page.locator("[data-testid=admin-alert-banner]");

    // PRESENT on the dashboard AND the needs-attention page (spec D-5).
    for (const route of ["/admin", "/admin/needs-attention"]) {
      await page.goto(route);
      await expect(banner, `global banner must mount on ${route}`).toBeVisible();
      await expect(banner).toHaveCount(1);
    }

    // ABSENT everywhere else the banner used to ride via the old layout slot.
    for (const route of ["/admin/dev", "/admin/settings", `/admin/show/${slug}`]) {
      const response = await page.goto(route);
      // Each route is admin-gated and must render for ADMIN_FIXTURE (200), so a
      // count-0 result means "banner genuinely absent", not "route 403'd".
      expect(response?.status(), `${route} should render for admin`).toBe(200);
      await expect(
        banner,
        `global banner must NOT mount on ${route} (dashboard-only)`,
      ).toHaveCount(0);
    }
  });

  // Step 3 — Alert-identity remount (spec §11 F9), the load-bearing
  // persistent-layout case. Resolve expanded alert A → alert B must render
  // COLLAPSED in the SAME persistent-layout slot. The boundary key includes the
  // alertId segment, so A→B forces a fresh collapsed <details>.
  //
  // Negative-regression: drop the `alertId` segment from the boundary key (in
  // AlertBannerRouteBoundary's routeKey) → B reconciles into A's still-open
  // <details> and renders EXPANDED → this test must fail.
  test("F9: resolve expanded alert A → alert B renders COLLAPSED in the same slot", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await clearAlerts();
    // B must be a NON-INFO, dougFacing-capable global code (info-severity codes
    // are excluded by AlertBanner/fetchUnresolvedAlertCount → banner would
    // render null instead of B). Derive it from the catalog to avoid
    // miscitation; ≠ TOP_CODE.
    const SECOND_CODE = Object.values(MESSAGE_CATALOG).find(
      (e) =>
        (e as { severity?: string }).severity !== "info" &&
        e.dougFacing != null &&
        e.code !== TOP_CODE,
    )!.code;
    // Two distinct GLOBAL (resolvable) alerts; A is most recent so it is the top.
    const { error } = await admin.from("admin_alerts").insert([
      {
        show_id: null,
        code: TOP_CODE,
        context: { "sheet-name": "Alert A Show" },
        raised_at: new Date().toISOString(),
      },
      {
        show_id: null,
        code: SECOND_CODE,
        context: {},
        raised_at: new Date(Date.now() - 3_600_000).toISOString(),
      },
    ]);
    if (error) throw new Error(`F9 seed failed: ${error.message}`);
    await page.goto("/admin");

    const section = page.getByTestId("admin-alert-banner");
    const details = page.locator(OUTER_DETAILS);
    const aId = await section.getAttribute("data-alert-id");
    expect(aId).toBeTruthy();

    // expand A, then resolve A through the real two-tap form
    await page.locator(OUTER_SUMMARY).click();
    await expect(details).toHaveAttribute("open", "");
    await page.getByTestId("admin-alert-action").getByRole("button").click(); // idle → confirm
    await page
      .getByTestId("admin-alert-action")
      .getByRole("button", { name: /confirm/i })
      .click(); // confirm → resolve

    // B is now the top alert in the same persistent-layout slot — it RENDERS
    // (not null)…
    await expect(section).toBeVisible();
    await expect(section).not.toHaveAttribute("data-alert-id", aId!); // …identity changed (A→B)
    await expect(page.locator(OUTER_DETAILS)).not.toHaveAttribute("open", /.*/); // …and B is COLLAPSED (F9)
  });

  // Step 4 — Exact-count accessibility via the a11y TREE (spec §11 F14/F16), NOT
  // bare attributes. seedGlobalAlert({count:110}) ⇒ unresolvedCount 110,
  // moreCount 109 (count - 1, the topmost is shown).
  //
  // Negative-regressions: (a) bound the sr-only / aria-label counts (e.g. emit
  // "99+" there too), or (b) drop the badge's aria-hidden (the bounded "99+"
  // leaks into the accessible name) → these assertions must fail.
  test("F14/F16: exact counts are exposed to the accessibility tree (accessible name), visible text bounded", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await seedGlobalAlert({ count: 110 }); // unresolvedCount 110, moreCount 109
    await page.goto("/admin");

    // The queue chip lives in the PANEL, which is `display:none` while collapsed
    // (the §7.1 S1 sibling rule) → display:none removes it from the accessibility
    // tree, so toHaveAccessibleName reads "" until the disclosure is open. Expand
    // first so the chip is in the a11y tree, then assert its accessible name.
    await page.locator(OUTER_SUMMARY).click();
    await expect(page.getByTestId("admin-alert-panel")).toBeVisible();

    // Link: the ACCESSIBLE NAME is the EXACT count (not a bounded "+99+ more").
    // The aria-label carries the full 109; the visible text is the bounded
    // "+99+ more". The accessible-name assertion is viewport-INDEPENDENT and must
    // hold in both projects.
    await expect(page.getByTestId("admin-alert-queue-chip")).toHaveAccessibleName(
      "View 109 more unresolved alerts",
    );

    // Badge: exact total is real text in the a11y tree via the sr-only sibling…
    await expect(page.getByText("110 unresolved alerts")).toBeAttached();
    // …while the bounded visible badge is the bounded count ALONE ("99+"),
    // aria-hidden (NOT in the accessible name). Scope to the BADGE (the icon is
    // also aria-hidden → `summary [aria-hidden]` would multi-match).
    //
    // The visible badge is the terse numeral only (no "alerts" word) so it stays
    // narrow enough to keep `shrink-0` and never needs truncation at any
    // viewport, while the EXACT count is preserved in the sr-only span asserted
    // above. Both assertions read DOM text content (viewport-independent).
    await expect(
      page.locator("[data-testid=admin-alert-badge] [aria-hidden=true]"),
    ).toHaveText(/^99\+$/);
  });
});
