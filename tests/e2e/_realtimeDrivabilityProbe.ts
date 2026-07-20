/**
 * tests/e2e/_realtimeDrivabilityProbe.ts — realtime-refresh plan Task 3 spike.
 *
 * Standalone script (NOT a Playwright test): opens /admin?show=<slug> in a real
 * browser, records the realtime websocket frames + the ?show=/version requests
 * around a service-role crew_members.role UPDATE, prints raw frames + timings,
 * and ends with one of three machine-readable results:
 *   PROBE RESULT: DRIVABLE       — ok join reply, warm-up frame delivered, quiescence
 *                                  reached, trigger-mutation frame arrived AND the row
 *                                  text swapped in place
 *   PROBE RESULT: NOT_DRIVABLE   — ok join reply (subscription healthy) but the manual
 *                                  publish_show_invalidation warm-up frames never
 *                                  delivered across 3 bounded attempts
 *   PROBE RESULT: INDETERMINATE  — anything else (no/error join reply, no quiescence,
 *                                  warm-up delivered but trigger frame absent, frame
 *                                  without swap): a stack/auth/trigger/app fault, NOT
 *                                  drivability evidence — diagnose; select NO branch
 *
 * Measurement notes (plan round-10 findings):
 * - RSC requests are discriminated from the document navigation via the `rsc`
 *   request header — the first ?show= response after goto is the NAVIGATION,
 *   not the modal's post-open refresh; only RSC-tagged entries measure refreshes.
 * - Quiescence before mutation is OBSERVED (no in-flight ?show=/version request
 *   AND no topic frame for QUIET_FLOOR_MS), never a fixed sleep — otherwise a
 *   pre-mutation refresh still in flight could produce the swap.
 * - Any missing OPTIONAL timing (open-refresh, post-frame request start) leaves
 *   the corresponding oracle constant at its documented FLOOR (the spec's
 *   "floor …, may raise, never lower" contract); it does not change the result.
 *
 * Prereqs: supabase local running; dev server on :3000 booted with the
 * test-auth env (plan Task 3 Step 1). Env loads itself via @next/env
 * (loadEnvConfig — the scripts/captureStep3HeaderBaseline.ts pattern;
 * `source .env.local` is NOT shell-safe here: unquoted values like
 * EMAIL_FROM break the shell parse). Helpers that read env at module
 * scope are dynamic-imported AFTER the load.
 *
 * Run:
 *   pnpm tsx tests/e2e/_realtimeDrivabilityProbe.ts
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), false);

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const JOIN_WAIT_MS = 30_000; // hydration + socket join budget before INDETERMINATE
const QUIET_FLOOR_MS = 1_000; // observed-quiet window required before mutating
const QUIESCE_ACQUIRE_MS = 20_000; // budget to ACHIEVE that window before INDETERMINATE
const FRAME_WAIT_MS = 10_000; // NOT_DRIVABLE if no invalidation frame within this window post-commit
const SWAP_WAIT_MS = 15_000; // INDETERMINATE if a frame arrived but the row text never swaps

type Stamped = { at: number; text: string };

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

function finish(result: string, indeterminate = false): void {
  console.log(`PROBE RESULT: ${result}`);
  if (indeterminate) process.exitCode = 1;
}

async function main(): Promise<void> {
  // Dynamic imports AFTER loadEnvConfig — several helpers read env at module scope.
  const { chromium } = await import("@playwright/test");
  const { ADMIN_FIXTURE } = await import("./helpers/fixtures");
  const { signInAs } = await import("./helpers/signInAs");
  const { seedShowWithCrew, deleteSeededShow } = await import("./helpers/seedShowWithCrew");
  const { admin } = await import("./helpers/supabaseAdmin");
  // Seed FIRST, then everything else inside try/finally — a target-validation
  // or browser-launch failure must still delete the seeded show.
  const seeded = await seedShowWithCrew({
    // Default crew is EMPTY — pass rows explicitly (SeedShowWithCrewOptions.crew).
    crew: [
      { name: "Probe Target", role: "Probe Role Original" },
      { name: "Probe Anchor", role: "Probe Role Anchor" },
    ],
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const target = seeded.crew[0];
    if (!target) throw new Error("probe: seedShowWithCrew({}) returned an empty roster");
    const topic = `realtime:show:${seeded.showId}:invalidation`;
    browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext()).newPage();
    const frames: Stamped[] = [];
    const socketEvents: Stamped[] = [];
    const requests: Stamped[] = [];
    let inflight = 0;
    const isTracked = (url: string): boolean => {
      const u = new URL(url);
      return u.searchParams.get("show") === seeded.slug || u.pathname.endsWith("/version");
    };
    // Listeners BEFORE goto — the socket opens during hydration; a late
    // listener misses the join reply and the join→refresh timing.
    page.on("websocket", (ws) => {
      socketEvents.push({ at: Date.now(), text: `open ${ws.url()}` });
      ws.on("framereceived", (f) => frames.push({ at: Date.now(), text: String(f.payload) }));
      ws.on("framesent", (f) => frames.push({ at: Date.now(), text: `SENT ${String(f.payload)}` }));
      ws.on("close", () => socketEvents.push({ at: Date.now(), text: "close" }));
      ws.on("socketerror", (e) => socketEvents.push({ at: Date.now(), text: `error ${String(e)}` }));
    });
    page.on("request", (r) => {
      if (!isTracked(r.url())) return;
      inflight += 1;
      const u = new URL(r.url());
      const kind = r.headers()["rsc"] ? "RSC" : "DOC";
      requests.push({ at: Date.now(), text: `REQ ${kind} ${r.method()} ${u.pathname}${u.search}` });
    });
    const settle = (r: { url(): string; request(): { headers(): Record<string, string> } }, status: string) => {
      if (!isTracked(r.url())) return;
      inflight -= 1;
      const u = new URL(r.url());
      const kind = r.request().headers()["rsc"] ? "RSC" : "DOC";
      requests.push({ at: Date.now(), text: `RESP ${kind} ${status} ${u.pathname}${u.search}` });
    };
    page.on("response", (r) => settle(r, String(r.status())));
    page.on("requestfailed", (r) => {
      if (!isTracked(r.url())) return;
      inflight -= 1;
      requests.push({ at: Date.now(), text: `FAILED ${r.url()}` });
    });
    // Parsed frame predicates (mirror the oracle's contract): a join reply must
    // carry status "ok" — an ERROR reply is a stack/auth fault (INDETERMINATE),
    // never NOT_DRIVABLE evidence; an invalidation frame must carry the
    // payload.event === "invalidate" discriminator, never bare "broadcast".
    type WireFrame = { topic?: string; event?: string; payload?: { status?: string; event?: string } };
    const parseFrame = (text: string): WireFrame | null => {
      try {
        return JSON.parse(text) as WireFrame;
      } catch {
        return null;
      }
    };
    const isJoinReplyOk = (f: Stamped): boolean => {
      if (f.text.startsWith("SENT") || !f.text.includes(topic)) return false;
      const p = parseFrame(f.text);
      return p?.event === "phx_reply" && p.payload?.status === "ok";
    };
    const isJoinReplyError = (f: Stamped): boolean => {
      if (f.text.startsWith("SENT") || !f.text.includes(topic)) return false;
      const p = parseFrame(f.text);
      return p?.event === "phx_reply" && p.payload?.status !== undefined && p.payload.status !== "ok";
    };
    const isInvalidation = (f: Stamped): boolean => {
      if (f.text.startsWith("SENT") || !f.text.includes(topic)) return false;
      const p = parseFrame(f.text);
      return p?.event === "broadcast" && p.payload?.event === "invalidate";
    };
    // Standalone context has no Playwright baseURL — pass it explicitly.
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: BASE });
    const gotoAt = Date.now(); // navigation start — anchors goto→join and goto→open-refresh
    await page.goto(`${BASE}/admin?show=${seeded.slug}`);
    const join = await poll(
      () => frames.find((f) => isJoinReplyOk(f) || isJoinReplyError(f)),
      JOIN_WAIT_MS,
    );
    if (!join || isJoinReplyError(join)) {
      console.log(
        join
          ? `join reply ERROR on ${topic}: ${join.text}`
          : `no join reply on ${topic} within ${JOIN_WAIT_MS}ms — socket events: ${JSON.stringify(socketEvents)}`,
      );
      console.log("(no healthy subscription means broadcast drivability was NOT tested — diagnose auth/stack first)");
      finish("INDETERMINATE (no ok join reply)", true);
      return;
    }
    // Open-refresh completion (MODAL_OPEN_TIMEOUT_MS input): first RSC-tagged
    // ?show= response after goto — the DOC navigation response is excluded.
    const openResp = await poll(
      () =>
        requests.find(
          (r) => r.at > gotoAt && r.text.startsWith("RESP RSC") && r.text.includes(`show=${seeded.slug}`),
        ),
      JOIN_WAIT_MS,
    );
    // Warm-up broadcast (cold-start defense — the plan-time node probe measured
    // the FIRST broadcast after a fresh stack getting dropped once): up to 3
    // bounded manual publishes; each awaits its frame via the STRICT predicate.
    // Warm-up undeliverable after 3 healthy-join attempts IS the NOT_DRIVABLE
    // evidence; a later trigger-mutation miss with warm-up delivered is a
    // TRIGGER fault (INDETERMINATE), not a broadcast-pipeline fault.
    let warmupOk = false;
    for (let attempt = 1; attempt <= 3 && !warmupOk; attempt += 1) {
      const warmupAt = Date.now();
      const rpcRes = await admin.rpc("publish_show_invalidation", { p_show_id: seeded.showId });
      if (rpcRes.error) throw new Error(`warm-up publish failed: ${rpcRes.error.message}`);
      const frame = await poll(() => frames.find((f) => f.at > warmupAt && isInvalidation(f)), 5_000);
      warmupOk = frame !== undefined;
      console.log(`warm-up attempt ${attempt}: ${frame ? `frame in ${frame.at - warmupAt}ms` : "no frame"}`);
    }
    if (!warmupOk) {
      finish("NOT_DRIVABLE (healthy join; manual publish frames undeliverable after 3 attempts)");
      return;
    }
    // OBSERVED quiescence (not a fixed sleep): no in-flight tracked request AND
    // no topic frame for QUIET_FLOOR_MS, achieved within QUIESCE_ACQUIRE_MS.
    const quietAt = await poll(() => {
      const now = Date.now();
      const lastFrame = frames.filter((f) => f.text.includes(topic)).at(-1);
      const lastReq = requests.at(-1);
      const quietSince = Math.max(lastFrame?.at ?? 0, lastReq?.at ?? 0);
      return inflight === 0 && now - quietSince >= QUIET_FLOOR_MS ? now : undefined;
    }, QUIESCE_ACQUIRE_MS);
    if (!quietAt) {
      console.log(`quiescence not reached within ${QUIESCE_ACQUIRE_MS}ms (inflight=${inflight})`);
      finish("INDETERMINATE (no quiescence)", true);
      return;
    }
    const commitAt = Date.now();
    const { error } = await admin
      .from("crew_members")
      .update({ role: "Probe Role Realtime" })
      .eq("id", target.id);
    if (error) throw new Error(`probe mutation failed: ${error.message}`);
    const inval = await poll(
      () => frames.find((f) => f.at > commitAt && isInvalidation(f)),
      FRAME_WAIT_MS,
    );
    // Content swap, TIMESTAMPED via poll — a frame with no swap is INDETERMINATE.
    const swapAt = inval
      ? await poll(async () => {
          const n = await page.getByText("Probe Role Realtime").count();
          return n > 0 ? Date.now() : undefined;
        }, SWAP_WAIT_MS)
      : undefined;
    console.log("=== RAW TOPIC FRAMES ===");
    for (const f of frames.filter((x) => x.text.includes(topic))) console.log(f.at, f.text);
    console.log("=== REQUESTS (?show= + /version) ===");
    for (const r of requests) console.log(r.at, r.text);
    console.log("=== TIMINGS (ms) ===");
    console.log("goto→join-reply:", join.at - gotoAt);
    console.log("goto→open-refresh RSC response:", openResp ? openResp.at - gotoAt : "NONE OBSERVED (floor stands)");
    console.log("commit→frame:", inval ? inval.at - commitAt : "NO FRAME");
    // Request STARTS only, RSC only: a pre-frame request's late response (or the
    // DOC navigation) must never masquerade as the post-frame refresh.
    const rsc = inval
      ? requests.find(
          (r) => r.at > inval.at && r.text.startsWith("REQ RSC") && r.text.includes(`show=${seeded.slug}`),
        )
      : undefined;
    console.log(
      "frame→?show= RSC request start:",
      rsc && inval ? rsc.at - inval.at : "NONE OBSERVED (floor stands)",
    );
    console.log("frame→content swap:", swapAt && inval ? swapAt - inval.at : "NO SWAP");
    if (inval && swapAt) {
      finish("DRIVABLE");
    } else if (!inval) {
      // Warm-up frames DID deliver, so the broadcast pipeline is healthy — a
      // missing trigger-mutation frame is a TRIGGER/DB fault, not fallback evidence.
      finish("INDETERMINATE (warm-up delivered but no frame from the crew_members UPDATE — trigger fault, diagnose)", true);
    } else {
      // Frame arrived but the content never swapped: realtime IS drivable but the
      // refresh pipeline is broken — neither branch may be selected until diagnosed.
      finish("INDETERMINATE (frame received, no content swap — diagnose before selecting a branch)", true);
    }
  } finally {
    try {
      await deleteSeededShow(seeded.driveFileId);
    } finally {
      await browser?.close();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
