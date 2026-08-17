/**
 * tests/e2e/published-review-modal.realtime.spec.ts
 * (realtime-refresh spec §8.4 — the repo's FIRST realtime e2e)
 *
 * With the admin published-show modal open, a service-role `crew_members.role`
 * UPDATE must reconcile the open modal IN PLACE through the broadcast chain
 * (statement trigger → realtime frame → bridge debounce → router.refresh())
 * while preserving the §4.4 client-state invariants (popover, focus identity,
 * scrollTop, attention-menu-closed, no skeleton re-entry).
 *
 * Attribution discipline (anti-tautology, spec §8.4): three pre-mutation gates
 * (open-refresh completed network-observed; SUBSCRIBED via the ok join-reply
 * wire frame; OBSERVED quiescence over ?show= + /version requests AND topic
 * frames), a warm-up broadcast phase (cold-start defense — the plan-time spike
 * measured the first post-boot broadcast being dropped), and a positive chain:
 * post-mutation invalidation frame → ?show= RSC request STARTED after the
 * frame → row-scoped content swap, with NO /version request in the window
 * (broadcasts refresh unconditionally; only catch-up paths fetch /version).
 * A socket close/error/re-join in the window is environmental flake → ONE
 * full re-run against a freshly seeded show in a fresh context; second flake
 * fails.
 *
 * Request tracking settles EXACTLY ONCE per request on response.finished()
 * (body complete, never headers) — the committed drivability probe
 * (_realtimeDrivabilityProbe.ts) is the reference implementation.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import {
  seedShowWithCrew,
  deleteSeededShow,
  type SeededShow,
  type SeedCrewMemberInput,
} from "./helpers/seedShowWithCrew";
import { admin } from "./helpers/supabaseAdmin";
import { setCrewRoleLocked } from "./helpers/lockedCrewRestriction";
import { settleDashboardAdminState } from "./helpers/dashboardState";
import { awaitReviewModalOrRecover, openShowReviewModal } from "./helpers/openShowReviewModal";
import {
  CONTENT_SWAP_TIMEOUT_MS,
  SECTION_FRESHNESS_FLASH_MS_E2E,
  INVALIDATION_FRAME_TIMEOUT_MS,
  JOIN_REPLY_TIMEOUT_MS,
  MODAL_OPEN_TIMEOUT_MS,
  POST_FRAME_REQUEST_TIMEOUT_MS,
  QUIESCENCE_ACQUIRE_TIMEOUT_MS,
  QUIET_WINDOW_MS,
  isInvalidationFrame,
  isJoinReplyOk,
} from "./helpers/realtimeOracle";

const BASE = "published-show-review";
// The SHELL. `MODAL` below additionally requires the title, i.e. a LOADED
// modal — which on the aborted-close drive means waiting out a deliberately
// throttled RSC fetch (measured 3.9s of a 1600ms budget). The abort's
// self-heal is a client-side un-hide and lands in ~15ms, so that case watches
// the shell and never the payload.
const MODAL_ANY = `[data-testid="${BASE}-modal"]`;
const MODAL = `${MODAL_ANY}:has([data-testid="${BASE}-title"])`;
const MENU = `[data-testid="${BASE}-attention-menu"]`;
const PILL = `${MODAL} [data-testid="${BASE}-alert-pill"]`;
const SKELETON_TESTID = "published-show-review-loading";
// Derived from the SAME expression `playwright.config.ts` uses for its
// webServer, not a hardcoded 3000: manual `browser.newContext` calls do not
// inherit the project baseURL, and under an E2E_PORT relocation a hardcoded
// port silently exercises a SIBLING worktree's server (plan 1b(a) / R3 F1).
const BASE_URL = `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const VIEWPORT = { width: 1280, height: 800 };
const OLD_ROLE = "Realtime Old Role";
const NEW_ROLE = "Realtime Swapped Role";
// Spent establishing the freshness BASELINE in the aborted-close case below;
// distinct from NEW_ROLE so the two content swaps are independently awaitable.
const BASELINE_ROLE = "Realtime Baseline Role";

test.skip(
  process.env.MODAL_REALTIME_E2E !== "1",
  "prod-server realtime gate (CI sets MODAL_REALTIME_E2E=1)",
);

type Stamped = { at: number; text: string };

/**
 * Wait until the dashboard row's React onClick is attached.
 *
 * Body is verbatim from `published-review-modal.reopen.spec.ts`, where the
 * helper is module-local and therefore not importable. A click dispatched
 * before hydration is swallowed, which on the abort-close drive below would
 * look exactly like the modal failing to reopen — the defect under test.
 */
async function waitForRowHydration(page: Page, slug: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((tid) => {
          const el = document.querySelector(`[data-testid="${tid}"]`) as
            | (Element & Record<string, { onClick?: unknown }>)
            | null;
          if (!el) return false;
          return Object.keys(el).some(
            (k) => k.startsWith("__reactProps$") && typeof el[k]?.onClick === "function",
          );
        }, `shows-table-row-${slug}`),
      { message: "row link hydrated (React onClick attached)", timeout: 30_000 },
    )
    .toBe(true);
}

/**
 * Install the freshness-cue recorder. ARMED BEFORE the stimulus, always: a
 * post-hoc DOM poll cannot tell "never armed" from "armed and already expired",
 * so a poll-based assertion would pass against a completely broken
 * implementation. Extracted from `runScenario` unchanged so both cases record
 * cues the same way.
 */
async function installFreshnessObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __freshnessSeen?: string[];
      __freshnessObserver?: MutationObserver;
    };
    w.__freshnessSeen = [];
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as Element;
        if (!el.hasAttribute?.("data-section-freshness-flash")) continue;
        const id = el.getAttribute("data-testid") ?? "(no testid)";
        w.__freshnessSeen?.push(id);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-section-freshness-flash"],
    });
    w.__freshnessObserver = observer;
  });
}

/**
 * Stamp the instant the FIRST freshness cue becomes visible in the DOM.
 *
 * Separate from the recorder above, and watching `childList` as well as
 * `attributes`, because the two shapes are not interchangeable: React sometimes
 * SETS the attribute on a surviving card (an attributes record) and sometimes
 * INSERTS a card that already carries it (a childList record, no attributes
 * record at all — the same "arrives with its content" blind spot that makes a
 * freshly-inserted live region silent). An attributes-only watcher misses the
 * second shape and reports "never armed" on a run where a cue plainly armed.
 *
 * The stamp is taken page-side at mutation time, not at poll time, so the
 * elapsed check below cannot be flattered by polling latency.
 */
async function installFreshnessArmStamp(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __freshnessArmedAt?: number | null;
      __freshnessArmObserver?: MutationObserver;
    };
    w.__freshnessArmedAt = null;
    const stamp = () => {
      if (w.__freshnessArmedAt != null) return;
      if (document.querySelector("[data-section-freshness-flash]"))
        w.__freshnessArmedAt = Date.now();
    };
    const observer = new MutationObserver(stamp);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-section-freshness-flash"],
    });
    w.__freshnessArmObserver = observer;
    stamp();
  });
}

async function disconnectFreshnessArmStamp(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __freshnessArmObserver?: MutationObserver | undefined };
    w.__freshnessArmObserver?.disconnect();
    w.__freshnessArmObserver = undefined;
  });
}

/** Disconnect it, so no observer outlives its page and hangs Playwright. */
async function disconnectFreshnessObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __freshnessObserver?: MutationObserver | undefined };
    w.__freshnessObserver?.disconnect();
    w.__freshnessObserver = undefined;
  });
}

/** 25 rows force the modal scroller to scroll; roles are UNIQUE per row. */
function buildRoster(): SeedCrewMemberInput[] {
  const rows: SeedCrewMemberInput[] = [
    { name: "Realtime Target", role: OLD_ROLE },
    { name: "Realtime Anchor", role: "Realtime Anchor Role" },
    { name: "Realtime Banner Host", role: "Realtime Banner Role" },
  ];
  for (let i = 1; i <= 22; i += 1) {
    rows.push({ name: `Realtime Filler ${String(i).padStart(2, "0")}`, role: `Filler Role ${i}` });
  }
  return rows;
}

async function poll<T>(
  fn: () => T | undefined | Promise<T | undefined>,
  timeoutMs: number,
  stepMs = 100,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > deadline) return undefined;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

type ScenarioOutcome = { kind: "pass" } | { kind: "flake"; reason: string };

async function runScenario(browser: Browser): Promise<ScenarioOutcome> {
  const seeded: SeededShow = await seedShowWithCrew({ crew: buildRoster() });
  const target = seeded.crew.find((c) => c.name === "Realtime Target")!;
  const anchor = seeded.crew.find((c) => c.name === "Realtime Anchor")!;
  const bannerHost = seeded.crew.find((c) => c.name === "Realtime Banner Host")!;
  const wireTopic = `realtime:show:${seeded.showId}:invalidation`;
  let context: BrowserContext | undefined;
  try {
    // Actionable attention alert so the menu AUTO-OPENS (§4.4 inv-4 setup is
    // non-tautological: observe the auto-open, close it, assert it STAYS
    // closed).
    //
    // NOT `ROLE_FLAGS_NOTICE`, which this fixture used until warning-surface-trim
    // §5: that code is an info-severity member of `DOUG_EXCLUDED_CODES`
    // (lib/adminAlerts/audience.ts:34) and no longer reaches the modal's
    // attention surface at all, so it can no longer open this menu. That is the
    // ratified intent of `2026-07-04-alert-audience-split` §3, not a regression —
    // the bell still carries it, pinned by
    // `tests/components/admin/bellRetainsCutCodes.test.tsx`. Do not swap this
    // back; pick another RETAINED actionable code if this one ever changes
    // (today: AMBIGUOUS_EMAIL_BINDING, LIVE_ROW_CONFLICT,
    // ONBOARDING_SHEET_UNREADABLE).
    //
    // Context is the identity-map shape for this code
    // (lib/adminAlerts/alertIdentityMap.ts:60 — show name, email, crew count).
    const { error: alertErr } = await admin.from("admin_alerts").insert({
      show_id: seeded.showId,
      code: "AMBIGUOUS_EMAIL_BINDING",
      context: {
        email: `${bannerHost.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        crew_member_count: 2,
      },
      raised_at: new Date().toISOString(),
    });
    if (alertErr) throw new Error(`alert seed failed: ${alertErr.message}`);

    // Fresh context per attempt — listeners/counters/node refs never leak
    // between attempts. Manual contexts do NOT inherit the project baseURL.
    context = await browser.newContext({ baseURL: BASE_URL, viewport: VIEWPORT });
    const page: Page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });

    const frames: Stamped[] = [];
    const socketEvents: Stamped[] = [];
    const requests: Stamped[] = [];
    let inflight = 0;
    const isTracked = (url: string): boolean => {
      const u = new URL(url);
      return u.searchParams.get("show") === seeded.slug || u.pathname.endsWith("/version");
    };
    // Listeners BEFORE goto — the socket opens during hydration.
    page.on("websocket", (ws) => {
      socketEvents.push({ at: Date.now(), text: `open ${ws.url()}` });
      ws.on("framereceived", (f) => frames.push({ at: Date.now(), text: String(f.payload) }));
      ws.on("framesent", (f) => frames.push({ at: Date.now(), text: `SENT ${String(f.payload)}` }));
      ws.on("close", () => socketEvents.push({ at: Date.now(), text: "close" }));
      ws.on("socketerror", (e) =>
        socketEvents.push({ at: Date.now(), text: `error ${String(e)}` }),
      );
    });
    page.on("request", (r) => {
      if (!isTracked(r.url())) return;
      inflight += 1;
      const u = new URL(r.url());
      const kind = r.headers()["rsc"] ? "RSC" : "DOC";
      requests.push({ at: Date.now(), text: `REQ ${kind} ${r.method()} ${u.pathname}${u.search}` });
    });
    // Exactly-once settlement on BODY completion (round-13 F1 contract).
    const settledReqs = new Set<unknown>();
    const settleOnce = (req: unknown, entry: string) => {
      if (settledReqs.has(req)) return;
      settledReqs.add(req);
      inflight -= 1;
      requests.push({ at: Date.now(), text: entry });
    };
    page.on("response", (r) => {
      if (!isTracked(r.url())) return;
      const u = new URL(r.url());
      const kind = r.request().headers()["rsc"] ? "RSC" : "DOC";
      void r
        .finished()
        .then(() => settleOnce(r.request(), `RESP ${kind} ${r.status()} ${u.pathname}${u.search}`))
        .catch(() => settleOnce(r.request(), `RESPERR ${kind} ${u.pathname}${u.search}`));
    });
    page.on("requestfailed", (r) => {
      if (!isTracked(r.url())) return;
      // PROD contract (measured 2026-07-19): the router ABORTS the RSC refresh
      // fetch after applying the payload — ERR_ABORTED after a 200 response
      // event IS the success signature on prod (finished() never resolves for
      // it). Settle it as a completed RSC entry so gate 1 / phase (ii) match;
      // a genuine network failure would fail the content assertions anyway.
      const u = new URL(r.url());
      const kind = r.headers()["rsc"] ? "RSC" : "DOC";
      settleOnce(r, `RESP ${kind} ABORTED ${u.pathname}${u.search}`);
    });

    await signInAs(page, ADMIN_FIXTURE);
    const gotoAt = Date.now();

    // Gate 1: loaded modal + the post-open ?show= RSC refresh COMPLETED
    // (network-observed; a content marker cannot prove the refresh finished).
    await openShowReviewModal(page, seeded.slug, { timeoutMs: MODAL_OPEN_TIMEOUT_MS });
    const openResp = await poll(
      () =>
        requests.find(
          (r) =>
            r.at > gotoAt &&
            r.text.startsWith("RESP RSC") &&
            r.text.includes(`show=${seeded.slug}`),
        ),
      MODAL_OPEN_TIMEOUT_MS,
    );
    expect(openResp, "post-open ?show= RSC refresh must complete (gate 1)").toBeTruthy();

    // §4.4 inv-4 setup: the attention menu AUTO-OPENED (actionable alert
    // seeded); the test closes it via the pill toggle, and it must STAY closed.
    await expect(page.locator(MENU)).toBeVisible({ timeout: MODAL_OPEN_TIMEOUT_MS });
    await page.locator(PILL).click();
    await expect(page.locator(MENU)).toHaveCount(0);

    // Gate 2: SUBSCRIBED observed on the wire — ok join reply for the topic.
    const join = await poll(
      () => frames.find((f) => !f.text.startsWith("SENT") && isJoinReplyOk(f.text, seeded.showId)),
      JOIN_REPLY_TIMEOUT_MS,
    );
    expect(join, `ok join reply on ${wireTopic} (gate 2)`).toBeTruthy();

    // Any failure AFTER the healthy join is re-classified as environmental
    // flake IF a socket close/error/re-join was recorded since the join — the
    // mandated fresh-context retry then governs (whole-diff review F1: the
    // guard covers EVERY post-join phase, not only the tail attribution check).
    const disruptionSinceJoin = (): string | null => {
      const d = socketEvents.find(
        (e) => e.at > join!.at && (e.text === "close" || e.text.startsWith("error")),
      );
      if (d) return d.text;
      const rj = frames.find(
        (f) =>
          f.at > join!.at &&
          f.text.startsWith("SENT") &&
          f.text.includes(wireTopic) &&
          f.text.includes("phx_join"),
      );
      return rj ? "re-join" : null;
    };
    try {
      // Warm-up broadcasts (cold-start defense): up to 3 bounded manual
      // publishes, each awaited via the strict frame predicate.
      let warmupOk = false;
      for (let attempt = 1; attempt <= 3 && !warmupOk; attempt += 1) {
        const warmupAt = Date.now();
        const rpcRes = await admin.rpc("publish_show_invalidation", { p_show_id: seeded.showId });
        expect(rpcRes.error, "warm-up publish rpc").toBeNull();
        const frame = await poll(
          () =>
            frames.find(
              (f) =>
                f.at > warmupAt &&
                !f.text.startsWith("SENT") &&
                isInvalidationFrame(f.text, seeded.showId),
            ),
          INVALIDATION_FRAME_TIMEOUT_MS,
        );
        warmupOk = frame !== undefined;
      }
      expect(
        warmupOk,
        "broadcast pipeline undeliverable: 3 warm-up publishes produced no frame",
      ).toBe(true);

      // Gate 3: OBSERVED quiescence — no in-flight tracked request AND no topic
      // frame for QUIET_WINDOW_MS (frames restart the timer), bounded.
      const quietAt = await poll(() => {
        const now = Date.now();
        const lastFrame = frames.filter((f) => f.text.includes(wireTopic)).at(-1);
        const lastReq = requests.at(-1);
        const quietSince = Math.max(lastFrame?.at ?? 0, lastReq?.at ?? 0);
        return inflight === 0 && now - quietSince >= QUIET_WINDOW_MS ? now : undefined;
      }, QUIESCENCE_ACQUIRE_TIMEOUT_MS);
      expect(
        quietAt,
        "quiescence over ?show=//version requests + topic frames (gate 3)",
      ).toBeTruthy();

      // ── Arm the §4.4 oracles ────────────────────────────────────────────────
      const scrollerSel = `[data-testid="wizard-step3-card-${seeded.driveFileId}-review-content"]`;
      const anchorTrigger = page.locator(`[data-testid="crew-row-menu-button-${anchor.id}"]`);
      const anchorMenu = page.locator(`[data-testid="crew-row-menu-${anchor.id}"]`);
      const targetRow = page
        .locator(`li:has([data-testid="crew-row-menu-button-${target.id}"])`)
        .first();

      // Open the ⋮ popover on the UNTOUCHED anchor row; its trigger takes focus.
      await anchorTrigger.scrollIntoViewIfNeeded();
      await anchorTrigger.click();
      await expect(anchorMenu).toBeVisible();
      // Meaningful-focus precondition (whole-diff review R2 F1): the focused
      // node must be the anchor row's trigger or a node INSIDE its popover —
      // never <body> — or the identity oracle would be vacuous. Tag it.
      const probeTagged = await page.evaluate((anchorId) => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement)) return false;
        const onTrigger = el.getAttribute("data-testid") === `crew-row-menu-button-${anchorId}`;
        const inPopover = el.closest(`[data-testid="crew-row-menu-${anchorId}"]`) !== null;
        if (!onTrigger && !inPopover) return false;
        el.setAttribute("data-probe", "focus-anchor");
        return true;
      }, anchor.id);
      expect(
        probeTagged,
        "focus rests on the anchor trigger or inside its popover (never <body>)",
      ).toBe(true);
      // Retain the NODE ITSELF — the final oracle compares identity
      // (document.activeElement === this node), not attribute presence
      // (whole-diff review F2).
      const focusedNode = await page.evaluateHandle(() => document.activeElement);

      // Scroll oracle precondition: scrollable, mid-position ≥100px below max.
      const scrollArm = await page.evaluate((sel) => {
        const s = document.querySelector(sel);
        if (!(s instanceof HTMLElement)) return null;
        if (s.scrollHeight <= s.clientHeight) return { scrollable: false as const };
        const mid = Math.min(150, s.scrollHeight - s.clientHeight - 10);
        s.scrollTop = mid;
        return { scrollable: true as const, scrollTop: s.scrollTop, scrollHeight: s.scrollHeight };
      }, scrollerSel);
      expect(scrollArm, "modal scroller found").not.toBeNull();
      expect(scrollArm!.scrollable, "fixture roster must force scrolling (grow it if not)").toBe(
        true,
      );
      expect(scrollArm!.scrollTop!).toBeGreaterThanOrEqual(100);

      const targetGeomBefore = await targetRow.evaluate((el) => ({
        offsetTop: (el as HTMLElement).offsetTop,
        offsetHeight: (el as HTMLElement).offsetHeight,
      }));

      // Skeleton watch: a MutationObserver catches even a transient fallback flash.
      await page.evaluate((tid) => {
        const w = window as unknown as { __skeletonMounts?: number };
        w.__skeletonMounts = 0;
        const obs = new MutationObserver((muts) => {
          for (const m of muts) {
            for (const n of m.addedNodes) {
              if (
                n instanceof HTMLElement &&
                (n.getAttribute("data-testid") === tid || n.querySelector(`[data-testid="${tid}"]`))
              ) {
                w.__skeletonMounts = (w.__skeletonMounts ?? 0) + 1;
              }
            }
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
      }, SKELETON_TESTID);

      // Content preconditions: target row shows OLD role; NEW role appears NOWHERE.
      await expect(targetRow).toContainText(OLD_ROLE);
      expect(await page.locator(MODAL).getByText(NEW_ROLE).count()).toBe(0);

      // ── Freshness cue observers, ARMED BEFORE the stimulus ────────────────
      //
      // A post-hoc DOM poll cannot distinguish "never armed" from "armed and
      // already expired", so E2 in particular would pass against a completely
      // broken implementation. Both cases record attribute mutations as they
      // happen instead. The record lives on `window`; the observer is
      // disconnected in the page's own teardown below, so no sampler outlives
      // its element and hangs Playwright's auto-wait.
      await installFreshnessObserver(page);

      // ── Mutate (the pinned key-stable stimulus: role swap on ONE row) ──────
      const commitAt = Date.now();
      const { error: mutErr } = await admin
        .from("crew_members")
        .update({ role: NEW_ROLE })
        .eq("id", target.id);
      expect(mutErr, "service-role role UPDATE").toBeNull();

      // Phase (i): the invalidation frame is RECEIVED.
      const inval = await poll(
        () =>
          frames.find(
            (f) =>
              f.at > commitAt &&
              !f.text.startsWith("SENT") &&
              isInvalidationFrame(f.text, seeded.showId),
          ),
        INVALIDATION_FRAME_TIMEOUT_MS,
      );
      // A missing frame with NO observed transport disruption FAILS — it is the
      // primary behavior under test, and the spec's in-test retry contract is
      // reconnect-only (whole-diff review R3 F1). Silent local delivery loss
      // (measured ~9%: 10 of 11 warm-server runs passed) is absorbed by the RUNNER-level retry budget
      // instead: playwright.config.ts sets retries:2 in CI, and each runner
      // retry re-enters runScenario with a FRESH seed + context.
      expect(inval, "post-mutation invalidation frame (phase i)").toBeTruthy();

      // Phase (ii): a ?show= RSC request whose START post-dates the frame, and
      // its completion — the debounced router.refresh() as the frame's consequence.
      const rsc = await poll(
        () =>
          requests.find(
            (r) =>
              r.at > inval!.at &&
              r.text.startsWith("REQ RSC") &&
              r.text.includes(`show=${seeded.slug}`),
          ),
        POST_FRAME_REQUEST_TIMEOUT_MS,
      );
      expect(rsc, "?show= RSC request STARTED after the frame (phase ii)").toBeTruthy();
      const rscDone = await poll(
        () =>
          requests.find(
            (r) =>
              r.at > rsc!.at &&
              r.text.startsWith("RESP RSC") &&
              r.text.includes(`show=${seeded.slug}`),
          ),
        CONTENT_SWAP_TIMEOUT_MS,
      );
      expect(rscDone, "post-frame ?show= RSC response completed (phase ii)").toBeTruthy();

      // Phase (iii): row-scoped swap, in place.
      await expect(targetRow).toContainText(NEW_ROLE, { timeout: CONTENT_SWAP_TIMEOUT_MS });
      expect(new URL(page.url()).searchParams.get("show"), "URL unchanged").toBe(seeded.slug);

      // ── E1: the crew card was cued, and only the crew card ────────────────
      // The freshness cue's whole claim is that a reader can attribute the swap.
      // This is the only place it is proven end to end: a REAL write, a REAL
      // broadcast, and the attribute landing on the section that changed.
      const cued = await page.evaluate(
        () => (window as unknown as { __freshnessSeen?: string[] }).__freshnessSeen ?? [],
      );
      expect(cued.length, "the reconcile must cue at least one card").toBeGreaterThan(0);
      expect(
        cued.every((id) => id.includes("-section-crew-panel-card")),
        `only the crew card may be cued; saw ${JSON.stringify([...new Set(cued)])}`,
      ).toBe(true);

      // ── E2: a broadcast that changes NOTHING cues nothing ─────────────────
      // The honest half. Reset the record, publish an invalidation with no write
      // behind it, wait past the debounce plus an RSC round trip, and assert the
      // record stayed empty. Without the pre-armed observer this assertion is
      // unfalsifiable.
      await page.evaluate(() => {
        (window as unknown as { __freshnessSeen?: string[] }).__freshnessSeen = [];
      });
      const noopAt = Date.now();
      const noopRes = await admin.rpc("publish_show_invalidation", { p_show_id: seeded.showId });
      expect(noopRes.error, "no-op publish rpc").toBeNull();

      // PROVE THE TRIGGER FIRED before asserting that nothing came of it.
      //
      // Round-3 review: waiting a fixed interval and asserting an empty record
      // makes this row pass for the WRONG reason whenever the frame never
      // arrives — a dropped broadcast, a disconnected socket, a debounce that
      // never elapsed all look identical to "the refresh correctly cued
      // nothing". The claim here is "a refresh THAT HAPPENED changed nothing",
      // so the refresh has to be observed, exactly as E1 observes it: the
      // invalidation frame, then the ?show= RSC request it debounces into, then
      // that request completing. Only then is an empty record evidence.
      const noopInval = await poll(
        () =>
          frames.find(
            (f) =>
              f.at > noopAt &&
              !f.text.startsWith("SENT") &&
              isInvalidationFrame(f.text, seeded.showId),
          ),
        INVALIDATION_FRAME_TIMEOUT_MS,
      );
      // A MISSING no-op frame is a FLAKE, not a failure — unlike phase (i),
      // where the frame IS the behaviour under test.
      //
      // Local broadcast delivery is silently lossy at a measured ~9% (see the
      // phase (i) note). Requiring a SECOND frame squares that exposure, and the
      // first CI run of this row proved it: the no-op frame never arrived and a
      // hard `expect` failed the whole scenario twice. E2's claim is "a refresh
      // that changed nothing cues nothing", so a broadcast that never reached
      // the client has not set up the claim at all — there is nothing to assert
      // and nothing to conclude. Handing it to the same bounded-retry machinery
      // that already absorbs delivery loss is the honest disposition; asserting
      // over it would be measuring the transport, not the cue.
      if (!noopInval) {
        return { kind: "flake", reason: "no-op invalidation frame never arrived" };
      }
      const noopRsc = await poll(
        () =>
          requests.find(
            (r) =>
              r.at > noopInval.at &&
              r.text.startsWith("REQ RSC") &&
              r.text.includes(`show=${seeded.slug}`),
          ),
        POST_FRAME_REQUEST_TIMEOUT_MS,
      );
      if (!noopRsc) {
        return { kind: "flake", reason: "no-op frame produced no ?show= RSC request" };
      }
      const noopRscDone = await poll(
        () =>
          requests.find(
            (r) =>
              r.at > noopRsc.at &&
              r.text.startsWith("RESP RSC") &&
              r.text.includes(`show=${seeded.slug}`),
          ),
        CONTENT_SWAP_TIMEOUT_MS,
      );
      if (!noopRscDone) {
        return { kind: "flake", reason: "no-op ?show= RSC response never completed" };
      }

      // The reconcile has now demonstrably happened. Give the arming commit a
      // beat to land, so an empty record cannot mean "measured too early".
      await page.waitForTimeout(CONTENT_SWAP_TIMEOUT_MS);
      const cuedAfterNoop = await page.evaluate(
        () => (window as unknown as { __freshnessSeen?: string[] }).__freshnessSeen ?? [],
      );
      expect(
        cuedAfterNoop,
        "a refresh that changed nothing must cue nothing; the Synced readout is that signal",
      ).toEqual([]);

      await disconnectFreshnessObserver(page);

      // Reconnect flake guard BEFORE the attribution assertion: a close/error or
      // re-join in the window legitimately fetches /version → environmental flake.
      const disruption = disruptionSinceJoin();
      if (disruption) {
        return { kind: "flake", reason: `socket disruption in window: ${disruption}` };
      }
      const versionReq = requests.find(
        (r) => r.at > commitAt && r.text.startsWith("REQ") && r.text.includes("/version"),
      );
      expect(
        versionReq,
        "NO /version request post-mutation — the swap is attributable ONLY to the broadcast path",
      ).toBeUndefined();

      // Skeleton never re-entered (transient observation, whole window).
      const skeletonMounts = await page.evaluate(
        () => (window as unknown as { __skeletonMounts?: number }).__skeletonMounts ?? 0,
      );
      expect(skeletonMounts, "modal must not re-enter its Suspense fallback").toBe(0);

      // Geometry stability, scroll-independent (INCONCLUSIVE on delta — fixture
      // problem, distinct message); then the scrollTop invariant proper.
      const geomAfter = await page.evaluate((sel) => {
        const s = document.querySelector(sel) as HTMLElement;
        return { scrollTop: s.scrollTop, scrollHeight: s.scrollHeight };
      }, scrollerSel);
      const targetGeomAfter = await targetRow.evaluate((el) => ({
        offsetTop: (el as HTMLElement).offsetTop,
        offsetHeight: (el as HTMLElement).offsetHeight,
      }));
      expect(
        Math.abs(geomAfter.scrollHeight - scrollArm!.scrollHeight!),
        "INCONCLUSIVE: scroller scrollHeight changed across the swap — fixture geometry unstable",
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(targetGeomAfter.offsetTop - targetGeomBefore.offsetTop),
        "INCONCLUSIVE: target row offsetTop changed across the swap — fixture geometry unstable",
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(targetGeomAfter.offsetHeight - targetGeomBefore.offsetHeight),
        "INCONCLUSIVE: target row offsetHeight changed across the swap — fixture geometry unstable",
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(geomAfter.scrollTop - scrollArm!.scrollTop!),
        "§4.4 inv-3: scrollTop unchanged across the reconcile",
      ).toBeLessThanOrEqual(1);

      // §4.4 inv-1: the anchor row's popover is still open.
      await expect(anchorMenu, "§4.4 inv-1: open popover survives the reconcile").toBeVisible();
      // §4.4 inv-2: focus unchanged by NODE IDENTITY — compare the retained
      // node reference itself; the data-probe attribute is only a debugging belt.
      const focusHeld = await page.evaluate(
        (el) => document.activeElement === el && el?.getAttribute("data-probe") === "focus-anchor",
        focusedNode,
      );
      expect(focusHeld, "§4.4 inv-2: document.activeElement is the SAME node (identity)").toBe(
        true,
      );
      // §4.4 inv-4: the closed attention menu stays closed.
      await expect(page.locator(MENU), "§4.4 inv-4: attention menu stays closed").toHaveCount(0);

      return { kind: "pass" };
    } catch (err) {
      const disruption = disruptionSinceJoin();
      if (disruption) {
        return {
          kind: "flake",
          reason: `socket disruption (${disruption}) surfaced as: ${String(err).slice(0, 160)}`,
        };
      }
      throw err;
    }
  } finally {
    // Nested so a failing earlier cleanup can never skip the later ones
    // (review R4 advisory 1).
    try {
      await admin.from("admin_alerts").delete().eq("show_id", seeded.showId);
    } finally {
      try {
        await deleteSeededShow(seeded.driveFileId);
      } finally {
        await context?.close();
      }
    }
  }
}

let restoreDashboardState: (() => Promise<void>) | null = null;

test.describe("published review modal — realtime broadcast refresh (realtime-refresh spec §8.4)", () => {
  test.beforeAll(async () => {
    restoreDashboardState = await settleDashboardAdminState();
  });
  test.afterAll(async () => {
    await restoreDashboardState?.();
  });

  test("an ABORTED close clears armed freshness cues (BL-FRESHNESS-ABORTED-CLOSE-E2E)", async ({
    browser,
  }) => {
    test.setTimeout(240_000);

    // REQUIRES THE PRODUCTION-BUILD SERVER, which is what CI runs (the workflow
    // sets CI=true, so playwright.config's webServer is `build && start`). The
    // reopen render costs ~440ms there and ~1900ms against `next dev`, and the
    // budget below is 1600ms — so on a dev server this case fails its own
    // premise rather than reporting anything about the modal. That failure is
    // deliberate and its message says so: the alternative is a case that goes
    // green on a dev server for a reason unrelated to the code under test.

    // The defect this pins: `PublishedReviewModal`'s clear-on-hide branch drops
    // armed cues when the modal starts closing. An ABORTED close — begun, then
    // cancelled inside the 1600ms flash window — is the shape where a surviving
    // cue would resume its timer on reopen and flash content that is no longer
    // fresh. Observed RED against a mutant with that branch commented out
    // before this green was trusted (see the task record).
    const seeded: SeededShow = await seedShowWithCrew({ crew: buildRoster() });
    const target = seeded.crew.find((c) => c.name === "Realtime Target")!;
    const wireTopic = `realtime:show:${seeded.showId}:invalidation`;
    let context: BrowserContext | undefined;
    try {
      context = await browser.newContext({ baseURL: BASE_URL, viewport: VIEWPORT });
      const page: Page = await context.newPage();
      // Same media context the reopen spec's abort case uses — the race is only
      // driveable with the close transition un-animated.
      await page.emulateMedia({ reducedMotion: "reduce" });

      const frames: Stamped[] = [];
      // Listeners BEFORE goto — the socket opens during hydration.
      page.on("websocket", (ws) => {
        ws.on("framereceived", (f) => frames.push({ at: Date.now(), text: String(f.payload) }));
        ws.on("framesent", (f) =>
          frames.push({ at: Date.now(), text: `SENT ${String(f.payload)}` }),
        );
      });

      await signInAs(page, ADMIN_FIXTURE);
      await page.goto("/admin");
      await waitForRowHydration(page, seeded.slug);
      await page.click(`[data-testid="shows-table-row-${seeded.slug}"]`);
      await awaitReviewModalOrRecover(page, {
        timeoutMs: MODAL_OPEN_TIMEOUT_MS,
        label: "click:dashboard-row",
      });

      // SUBSCRIBED on the wire before any stimulus: the file's own comments
      // record that a broadcast fired before the join is simply dropped, which
      // would make this case pass for the wrong reason.
      const join = await poll(
        () =>
          frames.find((f) => !f.text.startsWith("SENT") && isJoinReplyOk(f.text, seeded.showId)),
        JOIN_REPLY_TIMEOUT_MS,
      );
      expect(join, `ok join reply on ${wireTopic}`).toBeTruthy();

      // Cold-start warm-up, same bounded shape as the scenario above.
      let warmupOk = false;
      for (let attempt = 1; attempt <= 3 && !warmupOk; attempt += 1) {
        const warmupAt = Date.now();
        const rpcRes = await admin.rpc("publish_show_invalidation", { p_show_id: seeded.showId });
        expect(rpcRes.error, "warm-up publish rpc").toBeNull();
        const frame = await poll(
          () =>
            frames.find(
              (f) =>
                f.at > warmupAt &&
                !f.text.startsWith("SENT") &&
                isInvalidationFrame(f.text, seeded.showId),
            ),
          INVALIDATION_FRAME_TIMEOUT_MS,
        );
        warmupOk = frame !== undefined;
      }
      expect(warmupOk, "broadcast pipeline undeliverable after 3 warm-up publishes").toBe(true);

      const targetRow = page
        .locator(`li:has([data-testid="crew-row-menu-button-${target.id}"])`)
        .first();

      // BASELINE FIRST. The component arms nothing on the first signature it
      // sees — that one becomes the baseline, which is the whole mechanism that
      // stops a stale prefetch from flashing on open. So a single mutation here
      // would establish the baseline and arm NOTHING, and the abort below would
      // then be aborting over an empty cue set: green against any implementation.
      // This mutation is spent buying the baseline; the next one arms.
      await setCrewRoleLocked(seeded.driveFileId, target.id, BASELINE_ROLE);
      await expect(targetRow).toContainText(BASELINE_ROLE, { timeout: CONTENT_SWAP_TIMEOUT_MS });

      // Arm a real cue: install the stamper FIRST, then mutate.
      await installFreshnessArmStamp(page);
      const commitAt = Date.now();
      await setCrewRoleLocked(seeded.driveFileId, target.id, NEW_ROLE);

      // Phase (i) FIRST, exactly as `runScenario` does: local delivery loss is a
      // measured ~9% of runs, and absorbing it here means a dropped frame reads
      // as a transport miss (retried at the runner) instead of masquerading as
      // "the cue never armed", which is a claim about the component.
      const inval = await poll(
        () =>
          frames.find(
            (f) =>
              f.at > commitAt &&
              !f.text.startsWith("SENT") &&
              isInvalidationFrame(f.text, seeded.showId),
          ),
        INVALIDATION_FRAME_TIMEOUT_MS,
      );
      expect(inval, "post-mutation invalidation frame (phase i)").toBeTruthy();

      // The cue must actually arm, or the abort below proves nothing. This is
      // the premise of the whole case, so it is asserted rather than assumed.
      const armedAt = await poll(
        () =>
          page
            .evaluate(
              () =>
                (window as unknown as { __freshnessArmedAt?: number | null }).__freshnessArmedAt,
            )
            .then((at) => at ?? undefined),
        CONTENT_SWAP_TIMEOUT_MS,
      );
      expect(
        armedAt,
        "a freshness cue must ARM before the abort — otherwise nothing is under test",
      ).toBeTruthy();

      // Begin the close and abort it INSIDE the flash window.
      //
      // THE BUDGET IS THE WHOLE DESIGN OF THIS DRIVE. A cue clears itself on a
      // 1600ms timer that keeps running while the modal is hidden, so every ms
      // between arming and the reopen is spent against the only window in which
      // a survivor is distinguishable from a correctly-cleared one. Measured, at
      // the reopen spec's 2500ms throttle: reopen at 3931ms, and the case passed
      // against a FULLY NEUTERED clear-on-hide branch — a green earned by
      // outrunning the defect. 200ms is therefore the throttle: it exists only
      // to hold the close navigation open the ~15ms it takes to re-click, which
      // the mid-transition probe below then proves it did.
      await page.route("**/admin?*", async (route) => {
        await new Promise((r) => setTimeout(r, 200));
        await route.continue();
      });
      await page
        .locator("[data-review-modal-scrim]")
        .click({ position: { x: 4, y: 4 }, noWaitAfter: true });
      await expect(page.locator(MODAL_ANY)).toHaveCount(0);

      // The close navigation must still be PENDING. If it committed, the modal
      // unmounted and the re-click mounts a FRESH one whose freshness state is
      // empty by construction — the assertion would then hold no matter what
      // the clear-on-hide branch does. Asserting the un-changed URL is what
      // makes this an ABORTED close rather than a close-then-open.
      const midTransition = await page.evaluate(
        (tid) => ({
          rowHref:
            (
              document.querySelector(`[data-testid="${tid}"]`) as HTMLAnchorElement | null
            )?.getAttribute("href") ?? null,
          search: window.location.search,
        }),
        `shows-table-row-${seeded.slug}`,
      );
      expect(midTransition.rowHref, "close nav still pending (row href)").toBe(
        `/admin?show=${seeded.slug}`,
      );
      expect(midTransition.search, "close nav still pending (url)").toBe(`?show=${seeded.slug}`);

      await page.click(`[data-testid="shows-table-row-${seeded.slug}"]`, { noWaitAfter: true });
      await expect(page.locator(MODAL_ANY)).toBeVisible({ timeout: MODAL_OPEN_TIMEOUT_MS });

      // ONE evaluate, so the elapsed reading and the DOM reading cannot drift
      // apart across a round trip.
      const observed = await page.evaluate(() => {
        const w = window as unknown as { __freshnessArmedAt?: number | null };
        return {
          sinceArm: w.__freshnessArmedAt == null ? null : Date.now() - w.__freshnessArmedAt,
          flashing: document.querySelectorAll("[data-section-freshness-flash]").length,
        };
      });

      // PREMISE, asserted rather than assumed: a cue clears itself on a 1600ms
      // timer that keeps running while the modal is hidden, so past that
      // deadline `flashing === 0` is what a BROKEN implementation reports too.
      // Failing here says the drive was too slow, never that the modal is fine.
      expect(
        observed.sinceArm,
        "no cue arm was ever recorded — the case is testing nothing",
      ).not.toBeNull();
      expect(
        observed.sinceArm!,
        `abort drive outran the ${SECTION_FRESHNESS_FLASH_MS_E2E}ms flash window, so a surviving ` +
          `cue would have expired on its own and this case cannot discriminate`,
      ).toBeLessThan(SECTION_FRESHNESS_FLASH_MS_E2E);

      // THE ASSERTION. Page-wide, because a survivor anywhere is the defect.
      expect(
        observed.flashing,
        "an aborted close must clear armed freshness cues; a survivor resumes its timer on reopen",
      ).toBe(0);

      await disconnectFreshnessArmStamp(page);
    } finally {
      // Nested exactly as `runScenario`'s teardown is, so a failing earlier
      // cleanup can never skip a later one. Dropping the seeded show is not
      // optional: the drive id is random, so the helper's pre-seed cleanup
      // cannot reach an earlier run's residue, and every pass or CI retry would
      // otherwise leave another published show in the shared database for the
      // following specs to trip over.
      try {
        await deleteSeededShow(seeded.driveFileId);
      } finally {
        await context?.close();
      }
    }
  });

  test("realtime broadcast reconciles the open modal in place", async ({ browser }) => {
    test.setTimeout(240_000);
    const first = await runScenario(browser);
    if (first.kind === "pass") return;
    // Bounded retry: FULL re-run against a fresh seed in a fresh context.
    const second = await runScenario(browser);
    expect(
      second.kind,
      `first attempt flaked (${first.reason}); the fresh-context re-run must pass`,
    ).toBe("pass");
  });
});
