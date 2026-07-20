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
import { settleDashboardAdminState } from "./helpers/dashboardState";
import {
  CONTENT_SWAP_TIMEOUT_MS,
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
const MODAL = `[data-testid="${BASE}-modal"]:has([data-testid="${BASE}-title"])`;
const MENU = `[data-testid="${BASE}-attention-menu"]`;
const PILL = `${MODAL} [data-testid="${BASE}-alert-pill"]`;
const SKELETON_TESTID = "published-show-review-loading";
const BASE_URL = "http://127.0.0.1:3000";
const VIEWPORT = { width: 1280, height: 800 };
const OLD_ROLE = "Realtime Old Role";
const NEW_ROLE = "Realtime Swapped Role";

test.skip(
  process.env.MODAL_REALTIME_E2E !== "1",
  "prod-server realtime gate (CI sets MODAL_REALTIME_E2E=1)",
);

type Stamped = { at: number; text: string };

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
    // closed). Context shape verified at published-show-attention.spec.ts:74.
    const { error: alertErr } = await admin.from("admin_alerts").insert({
      show_id: seeded.showId,
      code: "ROLE_FLAGS_NOTICE",
      context: {
        changes: [{ crew_name: bannerHost.name, prior_flags: ["A1"], new_flags: ["A1", "LEAD"] }],
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
    await page.goto(`/admin?show=${seeded.slug}`);

    // Gate 1: loaded modal + the post-open ?show= RSC refresh COMPLETED
    // (network-observed; a content marker cannot prove the refresh finished).
    await expect(page.locator(MODAL)).toBeVisible({ timeout: MODAL_OPEN_TIMEOUT_MS });
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
      // Tag the focused node so identity (not equality-by-selector) is asserted.
      const probeTagged = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement)) return false;
        el.setAttribute("data-probe", "focus-anchor");
        return true;
      });
      expect(probeTagged, "activeElement is a taggable HTMLElement after popover open").toBe(true);
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
    await admin.from("admin_alerts").delete().eq("show_id", seeded.showId);
    await deleteSeededShow(seeded.driveFileId);
    await context?.close();
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
