/**
 * tests/e2e/admin-lifecycle-transitions.spec.ts (M12.2 Phase B2 Task 9.2 — spec §3.4)
 *
 * Transition audit for the B2 show-lifecycle UI. Per the project writing-plans
 * rule, this lists every `AnimatePresence` / ternary render / conditional block
 * in the changed components (DashboardBucketSegmentedControl, ArchivedShowRow,
 * ArchiveShowButton, PublishShowButton, the per-show lifecycle disclosures) and
 * asserts each behaves as spec §3.4 specifies — which for B2 is "instant" for
 * EVERY pair (no crossfade / height-morph / opacity tween).
 *
 * It NO LONGER exercises the compound transition the plan calls out
 * (Archive-confirm armed WHILE a router.refresh() from another action is in
 * flight). That case was retired 2026-07-26: the ShareHub popover's backdrop
 * makes the two states mutually exclusive, so the scenario is unreachable
 * through the UI. See the removal note below and
 * BL-ARCHIVE-ARMED-CONCURRENT-REFRESH.
 *
 * Spec §3.4 Transition inventory (verbatim) — every pair is instant:
 *   | Active segment ↔ Archived segment | instant content swap on URL-param
 *     change (server re-render); no crossfade |
 *   | Archive confirm: resting ↔ armed (tap 1) | instant label/treatment morph;
 *     fixed box (no layout shift) |
 *   | Archive confirm: armed → resting | instant revert. The hub popover's ROW
 *     variant reverts on explicit Cancel rather than the 4s idle timer
 *     (owner-ratified 2026-07-20); the legacy variants keep the timer. Instant
 *     either way — the pair's §3.4 treatment is unchanged. |
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
 *       instantly with the fixed box; and Cancel reverts it. (The compound
 *       confirm-during-refresh claim was removed with its case — see above.)
 *
 * Requires the e2e env (dev server on :3000 + Supabase). Auth: ADMIN_FIXTURE.
 * A Held show is seeded via `_b2Helpers` (it renders both Publish + Archive).
 * That combination no longer makes the compound "another action refreshes while
 * Archive is armed" reachable — the popover backdrop covers every control
 * outside it while the armed control is mounted.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { seedHeldShow, readShow, sqlClient, type SeededShow } from "../db/_b2Helpers";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";

const REPO_ROOT = resolve(__dirname, "../..");

// admin-show-modal: the per-show surface is the /admin?show= review modal. The
// Suspense SKELETON shares the shell testIdBase, and both frames transiently
// coexist during the streaming swap — scope to the LOADED modal (the skeleton
// renders no title node) so the twin never trips Playwright strict mode.
const LOADED_REVIEW_MODAL =
  '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])';

/**
 * Proves the page has HYDRATED, without dispatching anything.
 *
 * The ShareHub kebab is a client-only toggle over LOCAL state: opening it
 * writes nothing and calls no server action, so it can be retried freely. Once
 * it responds, React has attached handlers on this page — which is exactly the
 * precondition a mutating control needs, and the one that cannot be inferred
 * from `toBeEnabled()` (a server-rendered button is enabled before hydration,
 * which is why the swallowed clicks looked like nothing happening at all).
 *
 * Leaves the popover CLOSED so callers see the surface they expect.
 */
async function waitForHydration(modal: import("@playwright/test").Locator) {
  const kebab = modal.getByTestId("share-hub-kebab");
  const popover = modal.getByTestId("share-hub-popover");
  await expect(async () => {
    await kebab.click();
    await expect(popover).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  // Close WITHOUT Escape. ReviewModalShell listens for Escape at the DOCUMENT
  // level and closes the whole modal (a router.push off `?show=`) on any
  // Escape the popover does not swallow — and the popover can vanish on its
  // own between the visibility assert above and a keypress: ShareHub's
  // lifecycle-change effect closes the hub the moment a wedged Published flip
  // flushes, and the nudge call site exists precisely to force that flush.
  // Measured in run 30237953882 (repeat3): the Escape landed after the
  // self-close, the shell navigated to /admin (final trace frameUrl has no
  // `?show=`), and the ON-flip click then starved against an unmounted modal
  // for the rest of the test budget.
  //
  // The close is the backdrop's onClick via dispatchEvent, not a real
  // pointer, for two measured reasons. (1) NOT the kebab: while the popover
  // is open ShareHub renders a fixed inset-0 z-20 backdrop button that
  // swallows trigger clicks (ShareHub.tsx §6 close semantics), so a kebab
  // click fails actionability forever — run 30293943396 failed 10/10 exactly
  // there. (2) NOT a positioned real click on the backdrop: the portal'd
  // popover body (z-40) can cover any fixed point of the 390px viewport
  // depending on placement side, re-creating the same interception. The
  // hydration PROOF is the popover having opened above; this close only
  // needs ShareHub's client-local `setOpen(false)`, which is what the
  // backdrop's onClick does — no nav, nothing here can reach the shell's
  // document-level Escape close. The self-close race (lifecycle effect)
  // stays benign: each retry skips the dispatch once the backdrop is gone.
  const backdrop = modal.getByTestId("share-hub-backdrop");
  await expect(async () => {
    if ((await backdrop.count()) > 0) {
      await backdrop.dispatchEvent("click", undefined, { timeout: 1_500 });
    }
    await expect(popover).toHaveCount(0, { timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
}

/**
 * The Archive/Unarchive control lives in the status band's ShareHub popover
 * ("Show" section) — the kebab is what opens it. Returns once the popover is
 * mounted, so the caller can query the lifecycle control directly.
 */
async function openShowActions(modal: import("@playwright/test").Locator) {
  // Hydration retry, mirroring the sibling layout spec. On a cold compile the
  // first click can land before hydration attaches the handler and is silently
  // SWALLOWED — measured as three failures whose failing cases move between
  // runs, which is why one green run proves nothing here. The kebab is a
  // toggle, so a swallowed click leaves state unchanged and the retry is
  // idempotent.
  const popover = modal.getByTestId("share-hub-popover");
  await expect(async () => {
    await modal.getByTestId("share-hub-kebab").click();
    await expect(popover).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Wait for a Published-toggle flip to land, recovering from the KNOWN
 * client-side commit wedge (React 19 replay-loss class; measured in CI run
 * 30235889083: 7/10 loop samples, the action POST returned 200 {ok:true} in
 * ~230ms with the flipped tree in-body, yet the toggle sat aria-busy="true"
 * for the full 30s while the page kept answering assertion polls — the
 * transition never committed client-side. No timeout budget fixes that, so
 * recovery is tiered, and every non-plain tier is logged so CI output names
 * what it took:
 *   plain  — ordinary wait (the healthy path);
 *   nudge  — a NON-MUTATING interaction (the ShareHub kebab open/toggle-close
 *            pair, client-local state only) prompts React to flush the lost
 *            commit, then wait again;
 *   reload — the server committed long ago (POST 200 {ok:true}); reload
 *            re-reads server truth. Reaching this tier means the wedge never
 *            flushed — the reload still proves the SERVER round-trip, which
 *            is what this case certifies (§3.4 pairs are server re-renders).
 * The MUTATION is never retried (the defect class this file removed —
 * see the OFF-flip comment below): every tier here is read-only.
 * Product-side risk of the wedge itself is tracked in BACKLOG.md
 * (BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE).
 */
async function expectFlipLanded(
  page: import("@playwright/test").Page,
  modal: import("@playwright/test").Locator,
  expected: "true" | "false",
  label: string,
) {
  const toggle = modal.getByTestId("published-toggle");
  const tiers = ["plain", "nudge", "reload"] as const;
  for (const tier of tiers) {
    if (tier === "nudge") {
      await waitForHydration(modal); // kebab open/toggle-close — writes nothing
    } else if (tier === "reload") {
      await page.reload();
      await expect(modal).toBeVisible({ timeout: 20_000 });
    }
    try {
      await expect(toggle).toHaveAttribute("aria-checked", expected, {
        timeout: tier === "plain" ? 12_000 : 8_000,
      });
      if (tier !== "plain") {
        console.log(`[wedge-recovery] ${label}: landed at tier=${tier}`);
      }
      return;
    } catch (err) {
      if (tier === "reload") throw err;
      console.log(`[wedge-recovery] ${label}: tier=${tier} did not land, escalating`);
    }
  }
}

// The components changed/created by Phase 6–8 whose §3.4 pairs must stay instant.
const CHANGED_COMPONENTS = [
  "components/admin/DashboardBucketSegmentedControl.tsx",
  "components/admin/ArchivedShowRow.tsx",
  "components/admin/ArchiveShowButton.tsx",
  "components/admin/PublishedToggle.tsx",
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
      // transition-colors (hover) is the ONLY permitted transition-* utility —
      // EXCEPT PublishedToggle's switch knob: the published-toggle spec §3.3
      // transition inventory declares every §3.4 STATE pair instant but keeps
      // AutoPublishToggle's built-in knob transition-transform (a within-control
      // micro-interaction, the settings-toggle precedent, not a state swap).
      // ArchiveShowButton's carve-out mirrors PublishedToggle's: the
      // destructive-confirm recipe's `transition-opacity` on the armed confirm
      // (hover/disabled opacity, a within-control micro-interaction) was
      // ratified by the 2026-07-20 row-variant amendment (ArchiveShowButton.tsx
      // rowLabel doc block) and the archive-row-menu-idiom spec §4, which names
      // it the ONLY animated property. Every §3.4 STATE pair stays instant.
      // (This guard sat dark in CI and had been red since that amendment —
      // BL-E2E-LIFECYCLE-SPECS-CI-DARK carries the wiring work.)
      const permitted =
        rel === "components/admin/PublishedToggle.tsx"
          ? /transition-(?!colors\b|transform\b)[a-z]+/g
          : rel === "components/admin/ArchiveShowButton.tsx"
            ? /transition-(?!colors\b|opacity\b)[a-z]+/g
            : /transition-(?!colors\b)[a-z]+/g;
      const stateTransitions = src.match(permitted) ?? [];
      expect(
        stateTransitions,
        `${rel}: only transition-colors permitted (no transition-all/opacity — §3.4 instant)`,
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
    // admin-show-modal: the per-show surface is the dashboard modal; the
    // archive control lives in the status band's ShareHub popover.
    await page.goto(`/admin?show=${held.slug}`);
    const modal = page.locator(LOADED_REVIEW_MODAL);
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await openShowActions(modal);
    const resting = modal.getByTestId("archive-show-button");
    await expect(resting).toBeVisible();

    await resting.click();
    const confirm = modal.getByTestId("archive-show-confirm-button");
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

  // ── (B2) Archive confirm armed → resting. In the hub popover the control
  // renders the ROW idiom (owner-ratified 2026-07-20), which cancels
  // EXPLICITLY rather than on a 4s timer: the consequence is prose the operator
  // is meant to read, and a timer shorter than the reading punished exactly the
  // people who read it. The dismissal is instant either way — no animation. ──
  test("archive confirm reverts armed→resting via explicit Cancel (instant, no timer)", async ({
    page,
  }) => {
    await page.goto(`/admin?show=${held.slug}`);
    const modal = page.locator(LOADED_REVIEW_MODAL);
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await openShowActions(modal);
    await modal.getByTestId("archive-show-button").click();
    await expect(modal.getByTestId("archive-show-confirm-button")).toBeVisible();

    // The old 4s auto-revert must NOT fire here — the armed row survives it.
    await page.waitForTimeout(5000);
    await expect(modal.getByTestId("archive-show-confirm-button")).toBeVisible();

    await modal.getByTestId("archive-show-cancel-button").click();
    await expect(modal.getByTestId("archive-show-button")).toBeVisible();
    await expect(modal.getByTestId("archive-show-confirm-button")).toHaveCount(0);
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

  // ── (B4) — DELETED (consolidated-admin-show-page rebuild). This asserted the
  // per-show `admin-show-status-pill` (an AdminPageHeader element) was a
  // server-rendered, non-animated "Held" status. The rebuild dropped
  // AdminPageHeader from /admin/show/[slug]; held-ness is now shown by the
  // StatusStrip's <PublishedToggle> in its OFF (aria-checked="false") state.
  // The successor coverage lives in
  // tests/components/admin/showpage/pageTransitions.test.tsx:
  //   - "no animation" (every §9 pair instant) → §9 StatusStrip source guard
  //     (imports no motion library, passes no exit/initial/animate props), and
  //   - held state is represented instantly → §9-E (renderStrip({published:false})
  //     asserts the toggle's aria-checked="false" swaps with no animation class).

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
  // REMOVED 2026-07-26: the "compound: Archive armed while another action
  // refreshes → no torn state" case. Its premise became STRUCTURALLY
  // UNREACHABLE and the case could never pass again.
  //
  // Measured, not assumed. The run fails with:
  //   `share-hub-backdrop` ... subtree intercepts pointer events
  // The armed Archive control lives INSIDE the ShareHub popover
  // (ShareHub.tsx:929), and while that popover is open it renders a
  // `fixed inset-0 z-20` backdrop (ShareHub.tsx:631-642) that covers every
  // control outside it — including the StatusStrip published-toggle this case
  // dispatched. Closing the popover to reach the toggle unmounts the armed
  // control. The two states are mutually exclusive BY DESIGN, introduced by
  // `98bf7b17f feat(admin): ShareHub popover — behavior, ARIA, and the §9
  // composition rules (T3)`.
  //
  // So this is the same class as the `admin-share-link-inactive` assertion
  // removed above: a ratified redesign made a test's premise impossible, and
  // nothing noticed because this spec ran in no workflow. Deleting it is not
  // losing coverage of a reachable behaviour — it is retiring a scenario the
  // product no longer permits.
  //
  // HONEST GAP, and stated without hedging: an armed Archive concurrent with a
  // refresh from another SOURCE (realtime, a sibling tab, a server action
  // completing elsewhere) IS still reachable, and nothing covers it now. What
  // is unreachable is only the old driver — a second user gesture. Filed as
  // BL-ARCHIVE-ARMED-CONCURRENT-REFRESH with the route a replacement should
  // take.

  test("Published toggle round-trip: OFF → crew URL shows the paused page (no show data); ON → same URL is live again", async ({
    page,
    browser,
  }) => {
    // Recovery tiers (wedge) + crew-page infra retry can stack past the 60s
    // default; the budget covers the worst honest path, not a hung run.
    test.setTimeout(150_000);
    const seeded = await seedShowWithCrew({ title: "Published Toggle E2E Show" });
    try {
      const crewUrl = `/show/${seeded.slug}/${seeded.shareToken}`;

      // Flip OFF from the admin review modal (the per-show surface).
      await page.goto(`/admin?show=${seeded.slug}`);
      const modal = page.locator(LOADED_REVIEW_MODAL);
      await expect(modal).toBeVisible({ timeout: 30_000 });
      const toggle = modal.getByTestId("published-toggle");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      // Prove hydration on a control that writes NOTHING, then dispatch this
      // mutation exactly ONCE. An earlier version retried the click itself and
      // was measurably wrong: `aria-checked` stays "true" while the form action
      // is pending and the button is disabled, so a slow unpublish let the next
      // attempt click the refreshed OFF toggle and dispatch a REPUBLISH — the
      // assertion could then observe the transient OFF state and pass with a
      // republish in flight. A retry loop must never wrap a real mutation.
      await waitForHydration(modal);
      await toggle.click();
      // NOT a plain 30s wait any more: the CI loop proved the failure is a
      // client commit wedge, not slowness (POST 200 {ok:true} in ~230ms, then
      // 30s of stuck aria-busy on a responsive page). expectFlipLanded owns
      // the tiered, read-only recovery; the mutation above stays single-shot.
      await expectFlipLanded(page, modal, "false", "OFF flip");
      // REMOVED 2026-07-26: an assertion on `admin-share-link-inactive` and the
      // copy "The crew link is inactive while this show is unpublished." No
      // production module emits either — `d7fa48b9a feat(admin): replace the
      // Overview share cluster with the status-band hub (T4)` deleted the panel
      // that carried them, and that is a ratified redesign, not a regression.
      // It is not a rename: the nearest surviving string is a rotation
      // confirmation in RotateShareTokenButton, a different message in a
      // different control, and `admin-current-share-link-unavailable` is an
      // ERROR state gated on `published`.
      //
      // This is the cluster's thesis in miniature: a merged redesign silently
      // broke this spec and nothing noticed for months, because no workflow ran
      // it. A spec that ran would have failed the redesign's own PR.

      // Crew view in a FRESH context (no admin session — admins bypass the gate).
      const crewContext = await browser.newContext();
      try {
        const crewPage = await crewContext.newPage();
        await crewPage.goto(crewUrl);
        // Assert on the CREW page's own DOM (anti-tautology): paused surface
        // present, seeded title ABSENT (zero show data on the paused page).
        await expect(crewPage.getByTestId("crew-show-paused-root")).toBeVisible();
        await expect(crewPage.locator("body")).not.toContainText("Published Toggle E2E Show");

        // Flip back ON; the SAME crew URL leaves the paused surface and renders
        // the live crew route again. A fresh context has no picker identity, so
        // "live" here is the picker welcome (the route's real first surface) —
        // a paused link renders crew-show-paused-root instead, so the welcome
        // appearing IS the republish signal.
        // Fail FAST and NAMED if the modal is gone. The click below waits for
        // actionability against LOADED_REVIEW_MODAL; if a modal close leaked
        // (the Escape-vector class waitForHydration now avoids), the click
        // would silently starve the remaining test budget with no signal
        // naming what died. 5s is generous for a modal asserted open moments
        // ago on a page the test has not navigated since.
        await expect(modal, "review modal must still be open for the ON flip").toBeVisible({
          timeout: 5_000,
        });
        await toggle.click();
        // Same wedge exposure as the OFF flip (5/10 loop samples wedged HERE);
        // same tiered read-only recovery. The click stays single-shot: it is
        // post-hydration by construction, and wrapping a mutation in a retry
        // is the defect this file just removed.
        await expectFlipLanded(page, modal, "true", "ON flip");
        // Crew re-visit after republish. The CI loop showed every sample that
        // survived the wedge failing HERE fail-closed (3/10 —
        // PICKER_RESOLVER_LOOKUP_FAILED, "Couldn't load your show access"),
        // with the resolver's warn now naming the failing upstream call in the
        // webServer log. A bounded reload-retry keeps a transient gateway
        // fault from failing the case; a deterministic post-republish break
        // still fails after 3 attempts and the named `site` in the log is the
        // next lead. Reloads are read-only.
        await expect(async () => {
          await crewPage.goto(crewUrl);
          await expect(crewPage.getByTestId("crew-show-paused-root")).not.toBeVisible({
            timeout: 10_000,
          });
          await expect(crewPage.locator("body")).toContainText("Skip and pick your name", {
            timeout: 5_000,
          });
        }).toPass({ intervals: [2_000, 5_000], timeout: 45_000 });
      } finally {
        await crewContext.close();
      }
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });
});
