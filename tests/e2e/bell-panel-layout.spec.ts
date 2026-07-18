/**
 * tests/e2e/bell-panel-layout.spec.ts (bell notification center Task 16, spec §13/§14)
 *
 * Real-browser dimensional-invariant assertions + transition audit for the
 * NotifBell badge and BellPanel overlay. jsdom (the Task 13/14 component tests)
 * computes NO layout and this project's Tailwind v4 does not default `.flex` to
 * `align-items: stretch`, so the two §14 invariants ship dimensionally UNVERIFIED
 * until a browser renders them. This is their red→green home.
 *
 * Spec §14 dimensional invariants (verbatim — "the complete list"):
 *   1. The unread-dot slot occupies a fixed `size-2` (8px) box whether the dot
 *      is visible or not — guards the U→R no-layout-shift claim. Asserted here:
 *      `bell-unread-dot-<id>` rect is 8×8 (±0.5) BEFORE and AFTER the row is
 *      clicked (the read gesture), the dot's computed opacity flips 1→0 (visible
 *      vs cleared), and the dot's slot offset WITHIN the header
 *      (`bell-entry-toggle-<id>`) plus the header's height are unchanged across
 *      the flip (so the adjacent title never reflows). Absolute position is NOT
 *      asserted: the popover's absolute placement can shift for unrelated
 *      reasons (other rows mounting/unmounting), so the dot signal is isolated
 *      from that by measuring header-relative offsets instead.
 *   2. Panel width + placement (redesign D1 / DI-1 / DI-2). Verified across a
 *      width sweep crossing BOTH the 420px cap and the 640px sm breakpoint
 *      (639/640 pins the boundary):
 *        - width < 640 (mobile bottom-sheet): `w-full max-w-[420px]`, `mx-auto`
 *          centered, `fixed bottom-0` bottom-anchored. Below 420 the sheet is
 *          full-bleed (width === viewport); at/above 420 it caps to 420, centered.
 *        - width ≥ 640 (desktop anchored dropdown): `sm:w-[420px]` fixed, anchored
 *          below the bell (`sm:absolute sm:right-0 sm:top-[calc(100%+10px)]`) in
 *          the upper nav region — NOT centered, NOT bottom-anchored — with the
 *          right edge inside the viewport (no horizontal overflow). There is no
 *          sub-640 desktop regime, so no `calc()` overflow cap and no narrow-
 *          desktop case (R6).
 *
 * The `sheet-rise` / `bell-pop-in` open animations animate only transform, so we
 * wait for all running animations to finish before reading any vertical coordinate
 * (width is translate-invariant and safe to read mid-animation, but top/bottom are
 * not). The `bell-panel` element IS the sized dialog container after the redesign
 * (the width/position classes live on it directly; the sibling backdrop is a
 * separate NON-INTERACTIVE aria-hidden <div> scrim — a mouse-only click-outside
 * affordance kept OUT of the a11y tree so no focusable control sits outside the
 * aria-modal dialog; Esc + the in-dialog close button own keyboard/AT dismissal),
 * so geometry is measured on `bell-panel` directly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRANSITION AUDIT (spec §13 — full inventory). Every conditional render in
 * components/admin/nav/NotifBell.tsx + components/admin/BellPanel.tsx, its
 * declared treatment, and where it is verified. "unit" = the Task 13/14 jsdom
 * suites; "here" = this real-browser spec.
 *
 *  NotifBell.tsx
 *   - `degraded ? <degraded button> : <normal button>` (badge variant, B!↔normal)
 *       → instant swap, no animation. Tested: unit (degraded needs a count
 *         infra_error, not seedable in this e2e).
 *   - normal button `count > 0 ? <span admin-notif-badge> : null` (B+↔B0)
 *       → instant mount/unmount, no count-down/pulse (§13 rows B+→B0, B0→B+).
 *         Tested: HERE — badge shows "1"/"2", then unmounts after the panel open
 *         stamps the watermark (B+→B0).
 *   - badge text `count > 9 ? "9+" : String(count)` (B+→B+ count text swap)
 *       → instant text swap. Tested: HERE ("1"→"2" via a fresh commit) + unit
 *         (the 9+ cap).
 *   - `open ? <BellPanel/> : null` (C→O / O→C)
 *       → sheet-rise motion-safe on open, instant unmount on close
 *         (`motion-reduce:animate-none`). Tested: HERE — open shows `bell-panel`,
 *         close removes it; the width sweep waits on the sheet-rise animation.
 *
 *  BellPanel.tsx
 *   - container `motion-safe:animate-[sheet-rise…] motion-reduce:animate-none`
 *       → C→O sheet-rise (translateY 100%→0). Tested: HERE (panel visible after
 *         open; animation awaited via settleAnimations before vertical reads).
 *   - backdrop `motion-safe:transition-opacity duration-fast`
 *       → scrim fade. Tested: unit (presence) — not a dimensional signal.
 *   - panel state machine `loading | error | ready`:
 *       · `status === "loading"` → `bell-loading` (L). Instant swap. Tested:
 *         transiently HERE (awaited to ready) + unit.
 *       · `status === "error"` → `bell-error` + Retry (L→E, E→L). Instant, no
 *         crossfade. Tested: unit + route tests (a forced feed 500 is not
 *         seedable in this e2e).
 *       · ready branch below.
 *   - ready `feed.entries.length === 0 ? bell-empty : sections` (Z, feed empty)
 *       → instant swap. Tested: unit (this spec always seeds ≥1 row).
 *   - `active.length > 0 ? <section bell-section-active> : null`
 *       → instant. Tested: HERE (present) + unit.
 *   - `history.length > 0 ? <section bell-section-history> : null` (A→H)
 *       → NO live re-sort; snapshot only, instant on refetch — the SAME instant
 *         treatment for BOTH the resolve/save refetch and the realtime
 *         ping-triggered refetch (spec §5.4 open-panel feed refresh); neither
 *         animates the reflow. Tested: unit (resolve-while-open case + ping
 *         refetch case) — this spec does not resolve a row.
 *   - `feed.truncated ? bell-truncation-row : null`
 *       → instant. Tested: unit.
 *   - `viewerIsDeveloper ? <DevFooter/> : null`
 *       → instant. Tested: HERE (ADMIN_FIXTURE is a developer → footer mounts)
 *         + unit.
 *   - ActiveRow dot `dotVisible ? opacity-100 : opacity-0` with
 *     `motion-safe:transition-opacity motion-safe:duration-fast` (U→R)
 *       → opacity fade, fixed slot, no layout shift. Tested: HERE (invariant 1).
 *   - ActiveRow show-page chevron (BELL-1, spec §4.1, Task 7 chevron rework)
 *     `entry.slug !== null ? <a bell-caret> : null`
 *       → instant conditional render, no animation (a plain nav link, not a
 *         disclosure). The toggle button no longer has expand/collapse state
 *         of its own — it is mark-read-only, and the chevron is a DOM sibling
 *         of it, never nested inside. Every alert this spec seeds is GLOBAL
 *         (`seedGlobal` — `show_id: null`), so `entry.slug` is always null and
 *         the chevron never renders here; its presence/href/aria-label and
 *         sibling-not-nested DOM shape are pinned at the unit level instead
 *         (`tests/components/bellPanelRedesign.test.tsx`,
 *         `tests/components/bellPanelDeferrals.test.tsx`).
 *   - ActionCell `isHealth ? telemetry : isAutoResolving ? auto-note : Resolve`
 *     (+ `isWatch` retry form, `entry.action` link)
 *       → instant conditional content. Tested: HERE (SYNC_DELAYED_SEVERE is
 *         non-health/non-auto → Resolve renders) + unit for the other arms.
 *   - `OccurrenceChip` repeat-chip (`occurrences <= 1 ? null`), `IdentityChip`
 *     (`text ? … : null`), `HistoryRow` (`resolved ? … : null`),
 *     `DevFooter` bounds (`boundsError ? … : null`)
 *       → instant. Tested: unit / route.
 *
 *  Compound transitions (§13)
 *   - ping arrives while panel open → feed refetches in place; new rows mount
 *     unread at top, no reflow animation; badge reflects the refetched snapshot.
 *     Tested: HERE (ping test — badge picks up a new alert on the next commit,
 *     and a mid-open insert surfaces on refetch with its unread dot visible).
 *   - resolve clicked while a read POST is in flight → independent endpoints,
 *     idempotent. Tested: unit (Task 14 case 8).
 *   - dev edits config while feed open → Save → refetch, instant re-render.
 *     Tested: unit / route.
 *
 * REALTIME CAVEAT: local `realtime.messages` has no current partition, so the
 * private-broadcast delivery path (spec §5) may not fire under `supabase start`.
 * The "ping while open" case below therefore exercises the REFETCH path that
 * works locally (service-role insert + close/reopen + next-commit badge recount).
 * Live realtime broadcast delivery of a ping is verified against the validation
 * project in Task 18.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Requires the e2e env (dev server on :3000 with ENABLE_TEST_AUTH +
 * TEST_AUTH_SECRET + seeded local Supabase). Auth: ADMIN_FIXTURE via signInAs
 * (also `is_developer=true`, so the dev footer renders — the panel width cap is
 * developer-independent). Runs on desktop-chromium; every viewport is set
 * explicitly via setViewportSize (the width sweep needs per-width control).
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";
import { canonicalize } from "@/lib/email/canonicalize";

const TOL = 0.5;
const PANEL_MAX = 420; // max-w-[420px] (BellPanel.tsx:603)
const SM = 640; // --breakpoint-sm (app/globals.css:213)
const VP_HEIGHT = 900;

// Non-health, non-inbox-routed, non-auto-resolving code (catalog.ts: no
// `audience`/`adminSurface`/`resolution` fields → in NONE of the bell exclusion
// sets → reaches EVERY admin feed, dev or non-dev) with a `title` (so the row
// renders realistic content height for the layout checks).
const SEED_CODE = "SYNC_DELAYED_SEVERE";
// Two more bell-eligible codes (same non-health/non-inbox/non-auto criteria).
// DISTINCT codes are REQUIRED for multiple GLOBAL alerts: the partial unique
// index `admin_alerts_one_unresolved_idx` on (coalesce(show_id,''), code) WHERE
// resolved_at IS NULL forbids two unresolved globals sharing a code.
const SEED_CODE_2 = "AMBIGUOUS_EMAIL_BINDING";
const SEED_CODE_3 = "WIZARD_SESSION_SUPERSEDED";

// Canonical fixture email — the key admin_bell_state / admin_alert_reads store.
const FIXTURE_EMAIL = canonicalize(ADMIN_FIXTURE.email) ?? ADMIN_FIXTURE.email;

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

type Rect = {
  top: number;
  left: number;
  right: number;
  width: number;
  height: number;
  bottom: number;
};

async function rectOf(locator: Locator): Promise<Rect> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
      bottom: r.bottom,
    };
  });
}

async function opacityOf(locator: Locator): Promise<number> {
  return locator.evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity));
}

/** Wait for every running CSS animation/transition on the element + subtree. */
async function settleAnimations(locator: Locator): Promise<void> {
  await locator.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))),
  );
}

/** No document-level horizontal overflow at the current viewport. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * Deterministic bell baseline for the fixture admin: no alerts, no read marks,
 * no watermark. With `admin_bell_state.opened_at` absent, every active alert is
 * unseen (badge counts it); with `admin_alert_reads` absent, every active row is
 * unread (dot visible). AGENTS invariant 9: destructure { error } + throw.
 */
async function resetBellState(): Promise<void> {
  const alerts = await admin.from("admin_alerts").delete().neq("id", NIL_UUID);
  if (alerts.error) throw new Error(`resetBellState admin_alerts: ${alerts.error.message}`);
  // reads cascade on the alert delete (on delete cascade), but clear any orphan
  // for this email defensively so a leftover read mark can't hide a fresh dot.
  const reads = await admin.from("admin_alert_reads").delete().eq("admin_email", FIXTURE_EMAIL);
  if (reads.error) throw new Error(`resetBellState admin_alert_reads: ${reads.error.message}`);
  const stateRow = await admin.from("admin_bell_state").delete().eq("admin_email", FIXTURE_EMAIL);
  if (stateRow.error) throw new Error(`resetBellState admin_bell_state: ${stateRow.error.message}`);
}

/** Seed one unresolved GLOBAL alert; returns its id. `ageMs` back-dates raised_at. */
async function seedGlobal(code: string, ageMs = 5 * 3600_000): Promise<string> {
  const { data, error } = await admin
    .from("admin_alerts")
    .insert({
      show_id: null,
      code,
      context: {},
      raised_at: new Date(Date.now() - ageMs).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seedGlobal(${code}) failed: ${error?.message ?? "no row returned"}`);
  }
  return data.id as string;
}

/** Click the bell, wait for the overlay. Returns the sized panel container. */
async function openPanel(page: Page): Promise<Locator> {
  await page.getByTestId("admin-notif-bell").click();
  await expect(page.getByTestId("bell-panel")).toBeVisible();
  await expect(page.getByTestId("bell-panel-close")).toBeVisible();
  // After the redesign the `bell-panel` element IS the sized dialog container
  // (role=dialog + the width classes live on it directly; the sibling backdrop is
  // a separate <button>). Measure it directly.
  return page.getByTestId("bell-panel");
}

/**
 * Navigate to /admin and tolerate the cold-server transient: a freshly-booted
 * dev server's FIRST request can hit an `AdminInfraError` in requireAdmin's
 * first Supabase auth roundtrip, rendering the "Admin session unavailable" retry
 * surface (the nav + bell never mount there). Reload per the page's own "Try
 * again" guidance until the admin chrome loads. (CI carries `retries: 2` for the
 * same class; this makes a local single-shot run deterministic too.)
 */
async function settleAdminChrome(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const unavailable = await page
      .getByRole("heading", { name: "Admin session unavailable" })
      .count();
    if (unavailable === 0) return;
    await page.reload();
  }
}

async function gotoAdmin(page: Page): Promise<void> {
  await page.goto("/admin");
  await settleAdminChrome(page);
}

test.describe("bell panel layout dimensions + transition audit (real browser, §13/§14)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await resetBellState();
  });

  test.afterEach(async () => {
    await resetBellState();
  });

  // ── §14 invariant 1: fixed dot slot + U→R read gesture, no layout shift. ──
  test("unread dot: fixed size-2 slot, opacity flip on read, no layout shift @ 1280px", async ({
    page,
  }) => {
    const id = await seedGlobal(SEED_CODE);
    await page.setViewportSize({ width: 1280, height: VP_HEIGHT });
    await gotoAdmin(page);

    // Badge reflects the one unseen alert (opened_at absent → unseen).
    const badge = page.getByTestId("admin-notif-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("1");

    const inner = await openPanel(page);
    const entry = page.getByTestId(`bell-entry-${id}`);
    await expect(entry).toBeVisible();
    await settleAnimations(inner);

    const dot = page.getByTestId(`bell-unread-dot-${id}`);
    const toggle = page.getByTestId(`bell-entry-toggle-${id}`);

    // DI-4 (Quiet-rail redesign): the severity glyph is a fixed 18×18 on-surface
    // stroke icon (no fill circle) that never shrinks in the row flex; the unread
    // pip (the dot) rides its top-right corner.
    const sev = await rectOf(page.getByTestId(`bell-sev-${id}`));
    expect(Math.abs(sev.width - 18), "severity glyph width 18px").toBeLessThanOrEqual(TOL);
    expect(Math.abs(sev.height - 18), "severity glyph height 18px").toBeLessThanOrEqual(TOL);

    // BEFORE the read gesture: dot is a fixed 8×8 box and is visible (opacity 1).
    const dotBefore = await rectOf(dot);
    expect(Math.abs(dotBefore.width - 8), "dot slot width 8px before read").toBeLessThanOrEqual(
      TOL,
    );
    expect(Math.abs(dotBefore.height - 8), "dot slot height 8px before read").toBeLessThanOrEqual(
      TOL,
    );
    expect(await opacityOf(dot), "dot visible (opacity 1) before read").toBeGreaterThanOrEqual(
      1 - 0.01,
    );
    const toggleBefore = await rectOf(toggle);
    // The dot's offset WITHIN the header is the true no-shift signal for the dot
    // slot: it is immune to the panel's absolute repositioning (clicking the row
    // also EXPANDS it — a separate §13 disclosure transition — which re-lays-out
    // the vertically-centered popover; that is expected, not a dot shift).
    const dotOffBeforeX = dotBefore.left - toggleBefore.left;
    const dotOffBeforeY = dotBefore.top - toggleBefore.top;

    // The read gesture: clicking the row fires /bell/read; the dot clears
    // OPTIMISTICALLY (opacity → 0) regardless of the POST (no realtime dep).
    // The toggle has no expand/collapse state of its own (spec §4.1, Task 7
    // chevron rework) — mark-read is its only effect, so no `bell-context-*`
    // node ever exists to assert against.
    await toggle.click();
    await expect
      .poll(async () => opacityOf(dot), { message: "dot opacity settles to 0 after read" })
      .toBeLessThanOrEqual(0.02);
    await settleAnimations(dot);

    // AFTER: the dot still occupies its 8×8 slot (opacity, not display, changed).
    const dotAfter = await rectOf(dot);
    expect(Math.abs(dotAfter.width - 8), "dot slot width 8px after read").toBeLessThanOrEqual(TOL);
    expect(Math.abs(dotAfter.height - 8), "dot slot height 8px after read").toBeLessThanOrEqual(
      TOL,
    );
    expect(await opacityOf(dot), "dot cleared (opacity 0) after read").toBeLessThanOrEqual(0.02);

    // No layout shift from the dot flip: the dot's slot keeps its exact position
    // WITHIN the header (so the adjacent title never reflows), and the header row
    // keeps its height. Relative (header-scoped) offsets, not absolute position,
    // are the true signal here — the panel's absolute placement can still shift
    // for unrelated reasons (e.g. the vertically-centered popover repositioning
    // as OTHER rows mount/unmount elsewhere in the list).
    const toggleAfter = await rectOf(toggle);
    const dotOffAfterX = dotAfter.left - toggleAfter.left;
    const dotOffAfterY = dotAfter.top - toggleAfter.top;
    expect(
      Math.abs(dotOffAfterX - dotOffBeforeX),
      "dot slot horizontal offset within header unchanged across read (no title reflow)",
    ).toBeLessThanOrEqual(TOL);
    expect(
      Math.abs(dotOffAfterY - dotOffBeforeY),
      "dot slot vertical offset within header unchanged across read",
    ).toBeLessThanOrEqual(TOL);
    expect(
      Math.abs(toggleAfter.height - toggleBefore.height),
      "row header height unchanged across read (dot slot no-shift)",
    ).toBeLessThanOrEqual(TOL);

    // B+→B0: opening the panel stamped the watermark, so the badge unmounts.
    await expect(
      page.getByTestId("admin-notif-badge"),
      "badge unmounts after panel open stamps the watermark (B+→B0)",
    ).toHaveCount(0);
  });

  // ── §14 invariant 2 + redesign D1 (DI-1/DI-2): mobile bottom-sheet vs desktop
  // anchored dropdown, across a width sweep crossing the 420px cap boundary AND
  // the 640px sheet↔dropdown boundary. The 639/640 pair pins the sm breakpoint. ──
  //   - width < 640 (mobile): `w-full max-w-[420px]`, `mx-auto` centered, `fixed
  //     bottom-0` bottom-anchored. Full-bleed below 420, capped to 420 at/above.
  //   - width ≥ 640 (desktop): `sm:w-[420px]` fixed, anchored below the bell
  //     (`sm:absolute sm:right-0 sm:top-[calc(100%+10px)]`) in the upper nav
  //     region — NOT centered, NOT bottom-anchored — and never overflowing.
  for (const width of [375, 600, 639, 640, 768, 1024, 1280]) {
    const belowCap = width < PANEL_MAX;
    const sheetMode = width < SM;
    test(`panel geometry @ ${width}px (${sheetMode ? "mobile sheet" : "desktop anchored"})`, async ({
      page,
    }) => {
      await seedGlobal(SEED_CODE); // realistic content height for the vertical checks
      await page.setViewportSize({ width, height: VP_HEIGHT });
      await gotoAdmin(page);
      const panel = await openPanel(page);
      await settleAnimations(panel);

      const r = await rectOf(panel);

      // The 420 cap holds at every width; no element overflows the viewport and
      // the document never scrolls horizontally.
      expect(r.width, `width ≤ 420 @ ${width}px`).toBeLessThanOrEqual(PANEL_MAX + TOL);
      expect(r.right, `right edge ≤ viewport @ ${width}px`).toBeLessThanOrEqual(width + TOL);
      expect(r.left, `left edge ≥ 0 @ ${width}px`).toBeGreaterThanOrEqual(-TOL);
      expect(
        await horizontalOverflow(page),
        `document horizontal overflow @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);

      if (sheetMode) {
        // Mobile bottom-sheet: centered (mx-auto) + bottom-anchored (fixed bottom-0).
        expect(
          Math.abs(r.left - (width - r.right)),
          `sheet horizontally centered @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        expect(
          Math.abs(r.bottom - VP_HEIGHT),
          `sheet bottom-anchored to viewport @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        if (belowCap) {
          expect(
            Math.abs(r.width - width),
            `full-bleed width === viewport @ ${width}px (w-full under cap)`,
          ).toBeLessThanOrEqual(TOL);
        } else {
          expect(
            Math.abs(r.width - PANEL_MAX),
            `capped width === 420 @ ${width}px`,
          ).toBeLessThanOrEqual(TOL);
        }
      } else {
        // Desktop anchored dropdown: fixed 420 wide, anchored below the bell in the
        // upper nav region — not centered, not bottom-anchored.
        expect(
          Math.abs(r.width - PANEL_MAX),
          `desktop width === 420 @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
        expect(r.top, `anchored below the nav bell (upper region) @ ${width}px`).toBeLessThan(200);
        expect(r.bottom, `not bottom-anchored @ ${width}px`).toBeLessThan(VP_HEIGHT - TOL);
      }
    });
  }

  // ── §13 compound: a ping (new alert) is reflected by the badge on the next
  // commit and by the panel on refetch (close/reopen). Local realtime is inert
  // (no messages partition); live broadcast delivery is verified in Task 18. ──
  test("ping / new alert: badge recount + refetched panel show the new rows @ 1280px", async ({
    page,
  }) => {
    const id1 = await seedGlobal(SEED_CODE);
    await page.setViewportSize({ width: 1280, height: VP_HEIGHT });
    await gotoAdmin(page);
    const badge = page.getByTestId("admin-notif-badge");
    await expect(badge).toHaveText("1");

    // Ping observed by the badge on the next server commit: insert a second
    // unseen alert (distinct code — see the one-unresolved index note) and
    // reload → count is now 2.
    const id2 = await seedGlobal(SEED_CODE_2);
    await page.reload();
    await settleAdminChrome(page);
    await expect(badge, "badge recounts the new alert on next commit").toHaveText("2");

    // The panel's refetch (on open) reflects both alerts.
    await openPanel(page);
    await expect(page.getByTestId(`bell-entry-${id1}`)).toBeVisible();
    await expect(page.getByTestId(`bell-entry-${id2}`)).toBeVisible();

    // Mid-open ping: insert a THIRD alert (raised now → newest) while the panel
    // is open, then trigger the in-place refetch via close/reopen. The refetched
    // panel surfaces it, mounted unread (dot visible) per §13 "new rows mount
    // unread at top". (Realtime would do this without the reopen — Task 18.)
    const id3 = await seedGlobal(SEED_CODE_3, 0);
    await page.getByTestId("bell-panel-close").click();
    await expect(page.getByTestId("bell-panel")).toHaveCount(0);
    const inner = await openPanel(page);
    const entry3 = page.getByTestId(`bell-entry-${id3}`);
    await expect(entry3, "mid-open ping surfaces on refetch").toBeVisible();
    await settleAnimations(inner);
    expect(
      await opacityOf(page.getByTestId(`bell-unread-dot-${id3}`)),
      "newly-arrived ping row mounts unread (dot visible)",
    ).toBeGreaterThanOrEqual(1 - 0.01);
  });

  // ── BELL-2 triage grouping (spec §1.2/§1.3, §2, §3): real-browser render of
  // the ≥9 grouped mode. The grouping LOGIC matrix (thresholds, tones, fail-
  // closed, history-vs-active truncation) is exhaustively covered by the jsdom
  // component tests; HERE we prove the branch renders in a real browser with the
  // right tier order + dimensions + no overflow, and the static headers animate
  // nothing (§3). ──
  test("grouped ≥9: tier headers in Critical→Warning order, 18px glyph, no overflow, static headers @ 1280px", async ({
    page,
  }) => {
    // 1 degraded-health (critical tier) + 8 distinct notice codes = 9 active on
    // a non-truncated feed (feedCap default 50) → grouped. Dev fixture: only
    // inbox-routed codes are excluded, so a health code reaches the bell feed.
    const NOTICE_CODES = [
      "SYNC_DELAYED_SEVERE",
      "AMBIGUOUS_EMAIL_BINDING",
      "DRIVE_FETCH_FAILED",
      "RESYNC_QUALITY_REGRESSED",
      "USE_RAW_DECISION_STALE",
      "STALE_MANUAL_REPLAY_ABORTED",
      "WIZARD_SESSION_SUPERSEDED",
      "REAP_STALE_SESSIONS_FAILED",
    ];
    const critId = await seedGlobal("WEBHOOK_TOKEN_INVALID", 60 * 3600_000);
    for (let i = 0; i < NOTICE_CODES.length; i++) {
      await seedGlobal(NOTICE_CODES[i]!, (i + 1) * 3600_000);
    }

    await page.setViewportSize({ width: 1280, height: VP_HEIGHT });
    await gotoAdmin(page);
    const inner = await openPanel(page);
    await settleAnimations(inner);

    const critHeader = page.getByTestId("bell-section-active-tier-critical");
    const noticeHeader = page.getByTestId("bell-section-active-tier-notice");
    await expect(critHeader).toBeVisible();
    await expect(noticeHeader).toBeVisible();
    // No info tier (no info-tone code is dev-bell-eligible).
    await expect(page.getByTestId("bell-section-active-tier-info")).toHaveCount(0);

    // DOM order: Critical section sits above Warning.
    const critRect = await rectOf(critHeader);
    const noticeRect = await rectOf(noticeHeader);
    expect(critRect.top, "Critical tier renders above Warning").toBeLessThan(noticeRect.top);

    // Header labels + counts.
    await expect(critHeader).toContainText("Critical · 1");
    await expect(noticeHeader).toContainText(`Warning · ${NOTICE_CODES.length}`);

    // DI-4 unchanged under grouping: the critical row's severity glyph is 18×18.
    const sev = await rectOf(page.getByTestId(`bell-sev-${critId}`));
    expect(Math.abs(sev.width - 18), "severity glyph width 18px").toBeLessThanOrEqual(TOL);
    expect(Math.abs(sev.height - 18), "severity glyph height 18px").toBeLessThanOrEqual(TOL);

    // No horizontal overflow with the tier headers present.
    expect(await horizontalOverflow(page), "no document horizontal overflow").toBeLessThanOrEqual(
      TOL,
    );

    // §3 transition audit: the static tier headers run NO animation/transition.
    for (const header of [critHeader, noticeHeader]) {
      const running = await header.evaluate((el) => el.getAnimations({ subtree: false }).length);
      expect(running, "tier headers are static (no animation)").toBe(0);
    }
  });
});
