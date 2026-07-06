"use client";

/**
 * components/admin/nav/useBellBadge.ts (bell notification center Task 12)
 *
 * Badge state for the admin bell (spec §4/§5). FOUR commit sources, raced
 * safely via the same monotonic-token + AbortController pattern as
 * useNeedsAttentionBadge (components/admin/nav/useNeedsAttentionBadge.ts):
 *   1. initial server prop (first paint)
 *   2. prop change — router.refresh() re-renders the layout tree, so a
 *      mutation on the SAME route delivers a fresh count as a new prop
 *   3. pathname change — refetch from GET /api/admin/alerts/bell/count
 *   4. realtime `admin:alerts` broadcast (spec §5) — a push signal that
 *      triggers the SAME refetch as source 3 via `refetch()`, not a
 *      separate data path
 *
 * DEVIATION from useNeedsAttentionBadge (spec §5.4 — "bell keeps, not
 * hides"): a fetch fault does NOT null the count. The badge keeps showing
 * the last-known good count and sets `degraded = true` so the caller can
 * render a stale-data affordance instead of the badge disappearing.
 * `degraded` clears the moment any source (prop or fetch) delivers a fresh
 * `ok` result. `degraded` also seeds `true` when the FIRST-paint `initial`
 * prop itself is `infra_error` (no last-known count exists yet, so `count`
 * stays null in that case only).
 *
 * Realtime (source 4) is best-effort and fails OPEN to pathname-only mode
 * (spec §5.4): on channel error/timeout/close OR a token-mint failure, the
 * hook tears down the channel once and re-mints + resubscribes once; if
 * that retry ALSO fails, it gives up silently for the remainder of the
 * mount — no bounded backoff, no visible `degraded` flag for a realtime-only
 * fault. Realtime is a push optimization on top of sources 1-3, not the
 * source of truth, so its failure alone must not degrade the badge's
 * reported data freshness.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { subscribeToBell, type BellChannel } from "@/lib/realtime/subscribeToBell";
import type { BellCountResult } from "@/lib/admin/bellFeed";

const COUNT_ENDPOINT = "/api/admin/alerts/bell/count";
const TOKEN_ENDPOINT = "/api/admin/alerts/bell/token";

export type UseBellBadgeResult = {
  count: number | null;
  degraded: boolean;
  refetch: () => void;
  // Monotonic counter bumped on every realtime `changed` push (spec §5.4 —
  // "and the feed too, if the panel is open"). An open BellPanel watches this
  // and refetches its feed when it advances; the count refetch below is the
  // badge's own reaction to the same push. Starts at 0; only CHANGES matter.
  pingSignal: number;
};

export function useBellBadge(initial: BellCountResult): UseBellBadgeResult {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(initial.kind === "ok" ? initial.count : null);
  const [degraded, setDegraded] = useState<boolean>(initial.kind === "infra_error");
  const [pingSignal, setPingSignal] = useState(0);
  const tokenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastPathRef = useRef(pathname);

  // Shared fetch core for sources 3 (pathname) and 4 (realtime ping), and
  // the externally-exposed `refetch`. Race-safe via the same monotonic
  // token + abort pattern as useNeedsAttentionBadge; the one behavioral
  // difference is the catch branch (spec §5.4: keep last-known, don't null).
  const runFetch = useCallback((): (() => void) => {
    tokenRef.current += 1;
    const token = tokenRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void fetch(COUNT_ENDPOINT, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as { count?: unknown };
        if (typeof body.count !== "number" || !Number.isFinite(body.count)) {
          throw new Error("bad body");
        }
        if (tokenRef.current === token) {
          setCount(body.count);
          setDegraded(false);
        }
      })
      .catch(() => {
        // spec §5.4: a fault keeps the last-known count and marks
        // degraded, rather than nulling the count (fail-quiet D-4 does
        // NOT apply to the bell).
        if (tokenRef.current === token) setDegraded(true);
      });
    return () => controller.abort();
  }, []);

  const refetch = useCallback(() => {
    runFetch();
  }, [runFetch]);

  // Source 1/2: initial prop + prop changes (router.refresh path). Always
  // commits — the newest server truth wins. An infra_error prop marks
  // degraded but leaves `count` untouched (keeps last-known; see file
  // header deviation note).
  useEffect(() => {
    tokenRef.current += 1;
    abortRef.current?.abort();
    if (initial.kind === "ok") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- coordinated prop sync; mirrors useNeedsAttentionBadge
      setCount(initial.count);
      setDegraded(false);
    } else {
      setDegraded(true);
    }
  }, [initial]);

  // Source 3: pathname change.
  useEffect(() => {
    if (pathname === lastPathRef.current) return; // initial mount: server prop is fresh
    lastPathRef.current = pathname;
    return runFetch();
  }, [pathname, runFetch]);

  // Source 4: realtime admin:alerts broadcast. Mount-once (deps only on the
  // stable `refetch` callback) — the bell is a single global admin topic,
  // not scoped to any route param that would need to trigger a remount.
  useEffect(() => {
    let torndown = false;
    let currentChannel: BellChannel | null = null;
    let retried = false;

    function teardownChannel(): void {
      if (currentChannel) {
        getSupabaseBrowserClient().removeChannel(currentChannel);
        currentChannel = null;
      }
    }

    async function maybeRetryOnce(): Promise<void> {
      if (torndown || retried) return;
      retried = true;
      teardownChannel();
      await mintAndSubscribe();
    }

    async function mintAndSubscribe(): Promise<void> {
      if (torndown) return;
      let jwt: string;
      try {
        const res = await fetch(TOKEN_ENDPOINT, { method: "POST" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as { jwt?: unknown };
        if (typeof body.jwt !== "string") throw new Error("bad body");
        jwt = body.jwt;
      } catch {
        await maybeRetryOnce();
        return;
      }
      if (torndown) return;

      try {
        const supabase = getSupabaseBrowserClient();
        const result = subscribeToBell(
          supabase,
          jwt,
          () => {
            if (torndown) return;
            // Source 4: refetch the badge count (its own reaction) AND advance
            // the ping signal so an open BellPanel refetches its feed (spec
            // §5.4). setPingSignal is stable, so no new effect dep is needed.
            refetch();
            setPingSignal((n) => n + 1);
          },
          (status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              void maybeRetryOnce();
            }
          },
        );
        currentChannel = result.channel;
      } catch {
        await maybeRetryOnce();
      }
    }

    void mintAndSubscribe();

    return () => {
      torndown = true;
      teardownChannel();
    };
  }, [refetch]);

  return { count, degraded, refetch, pingSignal };
}
