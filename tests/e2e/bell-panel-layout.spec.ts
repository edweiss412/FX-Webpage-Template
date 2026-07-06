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
 *      asserted: clicking also expands the row (a separate §13 disclosure
 *      transition) which re-lays-out the vertically-centered popover — expected,
 *      and isolated from the dot by measuring header-relative offsets.
 *   2. Panel width is `w-full max-w-[420px]` (BellPanel.tsx:603). This is the
 *      literal spec contract, verified across a width sweep:
 *        - width < 420 (e.g. 375): `w-full` wins under the cap → the sheet is
 *          full-bleed, inner width === viewport width (±0.5).
 *        - width ≥ 420 (600/768/1024/1280): `max-w-[420px]` wins → inner width
 *          === 420 (±0.5), horizontally centered (`justify-center`).
 *      NOTE ON THE BRIEF: the task brief paraphrased invariant 2 as "width ===
 *      viewport width on mobile (600)". That paraphrase is inaccurate against the
 *      SHIPPED component and the canonical spec §14 — at 600px the `max-w-[420px]`
 *      cap wins (420, centered), because 600 > 420. AGENTS.md invariant 7 makes
 *      the spec canonical over the brief, and §14 states exactly `w-full
 *      max-w-[420px]`; the full-bleed === viewport case is only reachable BELOW
 *      420px, which this sweep exercises at 375px. Encoding the true contract is
 *      what makes the assertion both pass and meaningful.
 *
 * Vertical placement is a second real-browser signal of the responsive sheet
 * pattern (spec §7.2): below `--breakpoint-sm` (640px) the shell is
 * `items-end` (bottom-anchored sheet, `rounded-t-md`); at/above 640px it is
 * `sm:items-center` (vertically-centered popover). The `sheet-rise` open
 * animation (globals.css:622) animates only `translateY`, so we wait for all
 * running animations to finish before reading any vertical coordinate (width is
 * translate-invariant and safe to read mid-animation, but top/bottom are not).
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
 *   - ActiveRow disclosure `expanded && helpful ? bell-context : null`
 *       → collapsed→expanded height auto-expand (banner ErrorExplainer parity).
 *         Tested: HERE (context appears on expand; header rect unchanged).
 *   - ActiveRow caret (BELL-1) `helpful ? <ChevronRight bell-caret> : null`
 *       → rotate on expand (`rotate-90`, transform-only — NO reflow), rendered
 *         only when the code carries helpfulContext. Independent of read state, so
 *         it never shifts the dot slot or row geometry between unread/read.
 *         Tested: HERE (SEED_CODE has helpfulContext → caret present; rotation is
 *         transform-only so the §14 header-height no-shift assertion below still
 *         holds) + unit (present-with-context / absent-without; rotation class
 *         flips on expand).
 *   - ActionCell `isHealth ? telemetry : isAutoResolving ? auto-note : Resolve`
 *     (+ `isWatch` retry form, `entry.action` link)
 *       → instant conditional content. Tested: HERE (SYNC_DELAYED_SEVERE is
 *         non-health/non-auto → Resolve renders) + unit for the other arms.
 *   - `OccurrenceChip` (`occurrences <= 1 ? null`), `IdentityLine`
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
// sets → reaches EVERY admin feed, dev or non-dev) with both a `title` and
// `helpfulContext` (so the row renders a title and the expand-disclosure).
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

/** Click the bell, wait for the overlay. Returns the inner (sized) container. */
async function openPanel(page: Page): Promise<Locator> {
  await page.getByTestId("admin-notif-bell").click();
  await expect(page.getByTestId("bell-panel")).toBeVisible();
  await expect(page.getByTestId("bell-panel-close")).toBeVisible();
  // The inner container is the panel's only direct-child <div> (the sibling
  // backdrop is a <button>); it carries `w-full max-w-[420px]`.
  return page.getByTestId("bell-panel").locator("xpath=./div");
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

    // The read gesture: clicking the row expands it AND fires /bell/read; the dot
    // clears OPTIMISTICALLY (opacity → 0) regardless of the POST (no realtime dep).
    await toggle.click();
    await expect
      .poll(async () => opacityOf(dot), { message: "dot opacity settles to 0 after read" })
      .toBeLessThanOrEqual(0.02);
    await settleAnimations(dot);
    // The helpfulContext disclosure grew (below the header) — proves the row DID
    // expand, so the header-rect stability below is a real no-shift signal.
    await expect(page.getByTestId(`bell-context-${id}`)).toBeVisible();

    // AFTER: the dot still occupies its 8×8 slot (opacity, not display, changed).
    const dotAfter = await rectOf(dot);
    expect(Math.abs(dotAfter.width - 8), "dot slot width 8px after read").toBeLessThanOrEqual(TOL);
    expect(Math.abs(dotAfter.height - 8), "dot slot height 8px after read").toBeLessThanOrEqual(
      TOL,
    );
    expect(await opacityOf(dot), "dot cleared (opacity 0) after read").toBeLessThanOrEqual(0.02);

    // No layout shift from the dot flip: the dot's slot keeps its exact position
    // WITHIN the header (so the adjacent title never reflows), and the header row
    // keeps its height. Absolute position may change because the row expanded —
    // that is the disclosure transition, not the dot.
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

  // ── §14 invariant 2: panel width w-full max-w-[420px], across a width sweep
  // crossing the 420px cap boundary AND the 640px sheet↔popover boundary. ──
  for (const width of [375, 600, 768, 1024, 1280]) {
    const belowCap = width < PANEL_MAX;
    const sheetMode = width < SM;
    test(`panel width w-full max-w-[420px] @ ${width}px (${
      sheetMode ? "sheet" : "popover"
    }, ${belowCap ? "full-bleed" : "capped"})`, async ({ page }) => {
      await seedGlobal(SEED_CODE); // realistic content height for the vertical checks
      await page.setViewportSize({ width, height: VP_HEIGHT });
      await gotoAdmin(page);
      const inner = await openPanel(page);
      await settleAnimations(inner);

      const r = await rectOf(inner);

      // The cap holds at every width; no document horizontal overflow.
      expect(r.width, `inner width ≤ 420 @ ${width}px`).toBeLessThanOrEqual(PANEL_MAX + TOL);
      expect(
        await horizontalOverflow(page),
        `document horizontal overflow @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);
      // Horizontally centered (justify-center) at every width.
      expect(
        Math.abs(r.left - (width - r.right)),
        `panel horizontally centered @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);

      if (belowCap) {
        // w-full wins under the cap → the sheet is full-bleed.
        expect(
          Math.abs(r.width - width),
          `full-bleed inner width === viewport @ ${width}px (w-full under cap)`,
        ).toBeLessThanOrEqual(TOL);
      } else {
        // max-w-[420px] wins.
        expect(
          Math.abs(r.width - PANEL_MAX),
          `capped inner width === 420 @ ${width}px`,
        ).toBeLessThanOrEqual(TOL);
      }

      if (sheetMode) {
        // items-end → bottom-anchored sheet.
        expect(
          Math.abs(r.bottom - VP_HEIGHT),
          `sheet bottom-anchored to viewport @ ${width}px (items-end)`,
        ).toBeLessThanOrEqual(TOL);
      } else {
        // sm:items-center → vertically centered popover, not bottom-anchored.
        expect(
          r.bottom,
          `popover vertically centered, not bottom-anchored @ ${width}px (sm:items-center)`,
        ).toBeLessThan(VP_HEIGHT - TOL);
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
});
