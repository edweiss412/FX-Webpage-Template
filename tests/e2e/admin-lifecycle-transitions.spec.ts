/**
 * tests/e2e/admin-lifecycle-transitions.spec.ts (M12.2 Phase B2 Task 9.2 — spec §3.4)
 *
 * Transition audit for the B2 show-lifecycle UI. Per the project writing-plans
 * rule, this lists every `AnimatePresence` / ternary render / conditional block
 * in the changed components (DashboardBucketSegmentedControl, ArchivedShowRow,
 * ArchiveShowButton, PublishShowButton, the per-show lifecycle disclosures) and
 * asserts each behaves as spec §3.4 specifies — which for B2 is "instant" for
 * EVERY pair (no crossfade / height-morph / opacity tween). It also exercises
 * the COMPOUND transition the plan calls out: Archive-confirm armed WHILE a
 * router.refresh() from another action is in flight → no torn state.
 *
 * Spec §3.4 Transition inventory (verbatim) — every pair is instant:
 *   | Active segment ↔ Archived segment | instant content swap on URL-param
 *     change (server re-render); no crossfade |
 *   | Archive confirm: resting ↔ armed (tap 1) | instant label/treatment morph;
 *     fixed box (no layout shift) |
 *   | Archive confirm: armed → resting (4s idle) | instant revert |
 *   | Row: Live/Held → Archived (after action + refresh) | instant (full
 *     re-render); row relocates Active→Archived segment |
 *   | Held pill ↔ Published pill ↔ Archived pill | instant — pill is a
 *     server-rendered status, not animated |
 *
 * Two assertion layers:
 *   (A) STATIC SOURCE — the changed B2 components contain NO animation
 *       primitives (no `AnimatePresence`, no framer-motion `motion.`, no
 *       opacity/transform/height/translate STATE transitions). The only
 *       `transition-*` permitted is `transition-colors` (hover micro-feedback,
 *       not a state animation). This is the structural guard that every §3.4
 *       pair stays "instant".
 *   (B) REAL-BROWSER BEHAVIOR — the resting↔armed morph appears/reverts
 *       instantly with the fixed box; the 4s-idle revert fires; the compound
 *       confirm-during-refresh produces no torn state (the confirm form is the
 *       only Archive control on screen at a time; arming then refreshing leaves
 *       a single, consistent control).
 *
 * Requires the e2e env (dev server on :3000 + Supabase). Auth: ADMIN_FIXTURE.
 * A Held show is seeded via `_b2Helpers` (it renders both Publish + Archive, so
 * the compound "another action refreshes while Archive is armed" is reachable).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { seedHeldShow, readShow, sqlClient, type SeededShow } from "../db/_b2Helpers";

const REPO_ROOT = resolve(__dirname, "../..");

// The components changed/created by Phase 6–8 whose §3.4 pairs must stay instant.
const CHANGED_COMPONENTS = [
  "components/admin/DashboardBucketSegmentedControl.tsx",
  "components/admin/ArchivedShowRow.tsx",
  "components/admin/ArchiveShowButton.tsx",
  "components/admin/PublishShowButton.tsx",
  "components/admin/UnarchiveShowButton.tsx",
];

let held: SeededShow & { slug: string };

test.describe("admin lifecycle transition audit (§3.4)", () => {
  test.beforeAll(async () => {
    const h = await seedHeldShow();
    const row = await readShow(h.showId);
    held = { ...h, slug: row.slug as string };
  });

  test.afterAll(async () => {
    // Delete the seeded show; do NOT close the shared `_b2Helpers` postgres.js
    // singleton (shared with admin-lifecycle-layout.spec.ts in the same
    // single-worker process — closing it would CONNECTION_ENDED a co-running
    // spec). The pool is torn down at process exit.
    if (held) {
      await sqlClient`delete from public.shows where id = ${held.showId}::uuid`;
    }
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  // ── (A) STATIC SOURCE GUARD: every §3.4 pair is "instant", so the changed
  // components must carry NO animation primitive. A future regression that
  // wraps the segment swap in <AnimatePresence> or tweens the confirm morph
  // would contradict the spec; this fails it at the source. ──
  test("changed components contain no animation primitives (every §3.4 pair is instant)", () => {
    for (const rel of CHANGED_COMPONENTS) {
      const src = readFileSync(resolve(REPO_ROOT, rel), "utf8");
      expect(src, `${rel}: no AnimatePresence (§3.4 pairs are instant)`).not.toMatch(
        /AnimatePresence/,
      );
      expect(src, `${rel}: no framer-motion import`).not.toMatch(/from\s+["']framer-motion["']/);
      expect(src, `${rel}: no motion.<tag> element`).not.toMatch(/\bmotion\.[a-zA-Z]/);
      // No STATE animations: opacity/transform/translate/scale/height tweens.
      // transition-colors (hover) is the ONLY permitted transition-* utility.
      const stateTransitions = src.match(/transition-(?!colors\b)[a-z]+/g) ?? [];
      expect(
        stateTransitions,
        `${rel}: only transition-colors permitted (no transition-all/opacity/transform — §3.4 instant)`,
      ).toEqual([]);
      // No animate-* (keyframe) utilities driving state changes.
      expect(src, `${rel}: no animate-* keyframe utility`).not.toMatch(/\banimate-[a-z]/);
    }
  });

  // ── (B1) Archive confirm resting ↔ armed: INSTANT morph, fixed box. After
  // tap 1 the confirm button is present SYNCHRONOUSLY (no entrance tween); the
  // resting button is gone (ternary swap, not an overlay crossfade). ──
  test("archive confirm resting↔armed is an instant ternary swap (no crossfade)", async ({
    page,
  }) => {
    await page.goto(`/admin/show/${held.slug}`);
    const resting = page.getByTestId("archive-show-button");
    await expect(resting).toBeVisible();

    await resting.click();
    const confirm = page.getByTestId("archive-show-confirm-button");
    // Instant: the confirm is visible essentially immediately (small timeout —
    // an entrance animation would delay visibility / opacity ramp).
    await expect(confirm).toBeVisible({ timeout: 500 });
    // The morph is a ternary swap: resting is REMOVED from the DOM, not faded
    // out alongside the confirm (no two coexisting opacity-tweened layers).
    await expect(resting).toHaveCount(0);
    // Fully opaque immediately (no opacity tween mid-flight).
    const opacity = await confirm.evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity, "confirm button is fully opaque on arm (no fade-in)").toBe("1");
  });

  // ── (B2) Archive confirm armed → resting (4s idle): the AUTO_REVERT_MS=4000
  // timer reverts to resting with no animation. Assert the resting button
  // returns after the idle window (poll with a margin beyond 4s). ──
  test("archive confirm reverts armed→resting after the 4s idle window (instant)", async ({
    page,
  }) => {
    await page.goto(`/admin/show/${held.slug}`);
    await page.getByTestId("archive-show-button").click();
    await expect(page.getByTestId("archive-show-confirm-button")).toBeVisible();

    // After 4s idle the component setStates back to resting. Allow margin.
    await expect(page.getByTestId("archive-show-button")).toBeVisible({ timeout: 6000 });
    await expect(page.getByTestId("archive-show-confirm-button")).toHaveCount(0);
  });

  // ── (B3) Active ↔ Archived segment swap: instant content swap on URL-param
  // change (server re-render). Navigating ?bucket=archived re-renders the list
  // server-side; assert the segment carries aria-current and the swap is a
  // navigation (no client-side crossfade layer). ──
  test("Active↔Archived segment swap is a server re-render (URL-param), not an animated client toggle", async ({
    page,
  }) => {
    await page.goto("/admin?bucket=active");
    const activeSeg = page.getByTestId("dashboard-bucket-active");
    await expect(activeSeg).toHaveAttribute("aria-current", "page");

    // The archived segment is a Next <Link href="?bucket=archived"> (server
    // navigation), only when archivedCount>0; seed guarantees ≥1 archived? No —
    // this test seeds only a Held show. So assert the control structure: the
    // active segment is the current tab and the swap mechanism is a URL param
    // (anchor href), not an onClick state toggle. Read the rendered tag/href.
    const activeHref = await activeSeg.evaluate(
      (el) => (el as HTMLAnchorElement).getAttribute("href") ?? null,
    );
    expect(activeHref, "active segment is a param Link (server re-render swap)").toBe(
      "?bucket=active",
    );
  });

  // ── (B4) Pills are server-rendered status, not animated. The Held show's
  // per-show status pill reads "Held — not published" with no animation; the
  // ShowsTable held pill on the dashboard is a static span. Assert the per-show
  // pill is present and statically rendered (no transition driving its text). ──
  test("Held pill is a server-rendered status (no animation)", async ({ page }) => {
    await page.goto(`/admin/show/${held.slug}`);
    const pill = page.getByTestId("admin-show-status-pill");
    await expect(pill).toBeVisible();
    await expect(pill).toContainText("Held");
    // No state-transition utility on the pill (color hover is fine but the pill
    // is not interactive); assert it carries no transition-{opacity,transform}.
    const cls = (await pill.getAttribute("class")) ?? "";
    expect(cls).not.toMatch(/transition-(opacity|transform|all)/);
  });

  // ── (B5) COMPOUND: Archive-confirm armed WHILE a router.refresh() from
  // another action (Publish) is in flight → no torn state. We arm Archive, then
  // dispatch Publish (which on success calls router.refresh()). The page
  // re-renders server-side. After settling, there must be exactly ONE coherent
  // Archive control state — never both a resting AND a confirm button mounted,
  // and never a stranded confirm with the page mid-refresh. Because Publish on a
  // freshly-seeded Held show may be blocked (PUBLISH_BLOCKED_PENDING_REVIEW) or
  // succeed, we assert the INVARIANT that holds either way: the Archive control
  // is never torn (count of resting + confirm buttons is exactly 1, or 0 if the
  // show transitioned to Published/Archived and the page re-rendered). ──
  test("compound: Archive armed while another action refreshes → no torn state", async ({
    page,
  }) => {
    await page.goto(`/admin/show/${held.slug}`);

    // Arm Archive.
    await page.getByTestId("archive-show-button").click();
    await expect(page.getByTestId("archive-show-confirm-button")).toBeVisible();

    // Dispatch the OTHER action (Publish) while Archive is armed. Its form
    // action runs the server action then router.refresh() on success.
    const publish = page.getByTestId("publish-show-button");
    await expect(publish).toBeVisible();
    await publish.click();

    // Let the dispatch + any refresh settle.
    await page.waitForLoadState("networkidle");

    // INVARIANT (no torn state): the Archive control is coherent. Either:
    //   - the page re-rendered (refresh) → at most ONE Archive control mounted
    //     in a single resting OR confirm state (never both), or
    //   - Publish was blocked (no refresh) → the armed confirm is still the
    //     single control.
    // In NO case may BOTH a resting and a confirm Archive button coexist.
    const restingCount = await page.getByTestId("archive-show-button").count();
    const confirmCount = await page.getByTestId("archive-show-confirm-button").count();
    expect(
      restingCount + confirmCount,
      `Archive control is coherent (resting=${restingCount}, confirm=${confirmCount}) — never both, never torn`,
    ).toBeLessThanOrEqual(1);
    // And whichever single control is mounted is itself consistent (visible).
    if (restingCount === 1) {
      await expect(page.getByTestId("archive-show-button")).toBeVisible();
    } else if (confirmCount === 1) {
      await expect(page.getByTestId("archive-show-confirm-button")).toBeVisible();
    }
  });
});
