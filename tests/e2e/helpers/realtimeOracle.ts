/**
 * tests/e2e/helpers/realtimeOracle.ts (realtime-refresh plan Task 3 spike)
 *
 * Constants + frame predicates for the modal realtime e2e, pinned from the
 * 2026-07-19 spike measurements (spec §1.1: requirements are spec-fixed,
 * constants are measurement-fixed). Raw spike frames are quoted below so a
 * future Supabase realtime upgrade can re-derive them.
 *
 * Measured browser-chain timings (dev server, local supabase, 2026-07-19):
 *   goto→join-reply 1263ms · goto→open-refresh RSC response 1491ms ·
 *   commit→invalidation-frame 14ms · frame→?show= RSC request START 109ms
 *   (the bridge's 100ms debounce, observed) · frame→content swap 554ms ·
 *   warm-up publish→frame 14ms.
 * Every documented floor exceeds its derivation input — ALL floors stand.
 *
 * WIRE FORMAT (authoritative, from the spike): local Supabase Realtime uses
 * the Phoenix V2 ARRAY serializer (socket URL carries vsn=2.0.0) —
 * [join_ref, ref, topic, event, payload]:
 *   join reply:   ["10","10","realtime:show:<id>:invalidation","phx_reply",
 *                  {"status":"ok","response":{"postgres_changes":[]}}]
 *   invalidation: [null,null,"realtime:show:<id>:invalidation","broadcast",
 *                  {"event":"invalidate","meta":{"id":"…"},
 *                   "payload":{"id":"…","show_id":"…","version_token":"…"},
 *                   "type":"broadcast"}]
 * The predicates decode BOTH the V2 array envelope and the object shape, and
 * compare the topic by PARSED equality (never substring).
 */

// Quiet window for the pre-mutation quiescence gate. MUST exceed the bridge's
// 100ms debounce + dispatch latency (spec §8.4 gate 3; floor 250ms, never
// lower). Measured frame→request 109ms → max(250, ceil(1.5×109)) = 250.
export const QUIET_WINDOW_MS = 250;

// Phase timeouts — EVERY wait in the realtime spec uses one of these, never a
// bare Playwright default (the spec binds oracle constants, timeouts included,
// to the spike's measurements). Floor-vs-multiple: slow CI has headroom, a
// hang still fails.
export const MODAL_OPEN_TIMEOUT_MS = 15_000; // max(15_000, 3×1491)
export const JOIN_REPLY_TIMEOUT_MS = 15_000; // max(15_000, 3×1263)
export const QUIESCENCE_ACQUIRE_TIMEOUT_MS = 10_000; // max(10_000, 20×QUIET_WINDOW_MS) — bound on ACHIEVING quiescence
export const INVALIDATION_FRAME_TIMEOUT_MS = 10_000; // max(10_000, 5×14)
export const POST_FRAME_REQUEST_TIMEOUT_MS = 5_000; // max(5_000, 5×109)
export const CONTENT_SWAP_TIMEOUT_MS = 10_000; // max(10_000, 5×554)

type WireFrame = {
  topic?: string | undefined;
  event?: string | undefined;
  payload?: { status?: string; event?: string } | undefined;
};

/** Decode a websocket frame: Phoenix V2 array envelope or plain object. */
function parseWireFrame(text: string): WireFrame | null {
  try {
    const raw = JSON.parse(text) as unknown;
    if (Array.isArray(raw)) {
      const topic = raw[2];
      const event = raw[3];
      const payload = raw[4];
      return {
        topic: typeof topic === "string" ? topic : undefined,
        event: typeof event === "string" ? event : undefined,
        payload: (payload ?? undefined) as WireFrame["payload"],
      };
    }
    return raw as WireFrame;
  } catch {
    return null;
  }
}

function wireTopic(showId: string): string {
  return `realtime:show:${showId}:invalidation`;
}

/** ok-status join reply for the show's invalidation channel (spec §8.4 gate 2). */
export function isJoinReplyOk(frameText: string, showId: string): boolean {
  const f = parseWireFrame(frameText);
  return f?.topic === wireTopic(showId) && f.event === "phx_reply" && f.payload?.status === "ok";
}

/** Broadcast invalidation frame — requires the payload.event === "invalidate"
 *  discriminator so an unrelated broadcast can never satisfy the oracle. */
export function isInvalidationFrame(frameText: string, showId: string): boolean {
  const f = parseWireFrame(frameText);
  return (
    f?.topic === wireTopic(showId) && f.event === "broadcast" && f.payload?.event === "invalidate"
  );
}
