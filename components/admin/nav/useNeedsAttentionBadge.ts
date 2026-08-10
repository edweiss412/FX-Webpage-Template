"use client";

/**
 * Badge state for the mobile "Needs attention" tab (spec §4.2).
 * Three commit sources, raced safely via a monotonic token (R5-F1):
 *   1. initial server prop (first paint)
 *   2. prop change — router.refresh() re-renders the layout tree, so a
 *      mutation on the SAME route delivers a fresh count as a new prop
 *      (R4-F1); always commits and invalidates in-flight fetches
 *   3. pathname change — refetch from the count route handler; commits
 *      only if its token is still current; any fault → null (badge hidden)
 *   4. async seed (admin-nav-badge-streaming §3.2) — the layout no longer
 *      awaits loadNeedsAttentionCount, it hands over the unresolved promise.
 *      The resolved value is ingested through source 2's path, and ONLY into a
 *      VIRGIN hook (see `claimedRef`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { NeedsAttentionCountResult } from "@/lib/admin/needsAttentionCount";

export function useNeedsAttentionBadge(
  initialBadgeCount: number | null,
  seedPromise?: Promise<NeedsAttentionCountResult> | null,
): number | null {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(initialBadgeCount);
  const tokenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastPathRef = useRef(pathname);
  // The virgin-state rule (spec §3.2, R4 F1). A seed is a snapshot of the
  // instant the LAYOUT rendered; by the time it resolves, any other source may
  // already own the badge, and the seed is then stale by construction. This ref
  // records "a newer source has claimed this hook" — set both when a source
  // COMMITS and when the pathname refetch STARTS. The in-flight half matters:
  // ingesting a seed mid-flight would abort the very refetch that navigation
  // issued (see the abort in ingestPropValue), stranding the badge on the stale
  // seed value with nothing left to correct it.
  // Starts CLAIMED when the caller hands over a synchronous count: that value has
  // already committed, and a seed minted by the same server render is not newer
  // than it. `null` is the pending shape, which claims nothing (diff review R2 F1).
  const claimedRef = useRef(initialBadgeCount !== null);
  // The prop value this effect has already accounted for. Initialized to the
  // MOUNT prop, which `useState` above already holds — so the mount run, and
  // any later run that sees an unchanged prop, commits nothing.
  //
  // This is an identity compare rather than a "skip the first run" flag because
  // React invokes effects TWICE on mount under StrictMode (dev) and may replay
  // them on Fast Refresh. A first-run flag reads the replay as a prop change and
  // ingests the pending value, which CLAIMS the hook (below) and makes it drop
  // the streamed seed for the rest of the mount — measured in a real browser:
  // the count route returned 8 and the chip never rendered.
  const lastPropRef = useRef(initialBadgeCount);

  // The ONE commit path for prop-delivered values — the synchronous prop and
  // the resolved seed take exactly the same route, so any future prop-handling
  // nuance carries over to the seed automatically (spec §3.2).
  const ingestPropValue = useCallback((next: number | null) => {
    // Newest server truth — always commit. The commit is coordinated with a
    // token bump + in-flight fetch abort (R5-F1 race safety); a
    // derive-during-render rewrite would have to mutate tokenRef/abortRef
    // during render (a worse violation) and drop the abort.
    tokenRef.current += 1;
    abortRef.current?.abort();
    claimedRef.current = true;
    setCount(next);
  }, []);

  // Shared fetch core for source 3 (pathname) and for the seed DEMOTION below.
  // Race-safe via the same monotonic token + abort pattern every source uses;
  // any fault commits null (fail-quiet, ratified D-4 — the badge hides rather
  // than showing a number it cannot stand behind).
  const runFetch = useCallback((): (() => void) => {
    claimedRef.current = true; // claimed at INITIATION, not at commit — see the ref's comment
    tokenRef.current += 1;
    const token = tokenRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void fetch("/api/admin/needs-attention-count", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as { count?: unknown };
        if (typeof body.count !== "number" || !Number.isFinite(body.count))
          throw new Error("bad body");
        if (tokenRef.current === token) setCount(body.count);
      })
      .catch(() => {
        if (tokenRef.current === token) setCount(null); // fail-quiet (ratified D-4)
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (Object.is(initialBadgeCount, lastPropRef.current)) return; // mount or effect replay
    lastPropRef.current = initialBadgeCount;
    ingestPropValue(initialBadgeCount);
  }, [initialBadgeCount, ingestPropValue]);

  // Source 4: the streamed seed. Keyed on PROMISE IDENTITY — when a newer
  // promise arrives (router.refresh re-renders the layout), this effect's
  // cleanup invalidates the older subscription at that instant, so an older
  // promise resolving later can never paint over the newer one's window.
  useEffect(() => {
    if (!seedPromise) return;
    let current = true;
    void seedPromise.then((value) => {
      if (!current) return; // superseded by a newer promise
      if (claimedRef.current && value.kind !== "ok") {
        // A failed read is information we ALREADY have. Demoting it to "fetch
        // instead" defers the signal to a request that can hang, and until that
        // request lands the badge shows a count the server just told us it could
        // not stand behind. The fail-quiet posture (ratified D-4) applies now —
        // the same treatment every other failed read on this hook gets.
        ingestPropValue(null);
        return;
      }
      if (claimedRef.current) {
        // Non-virgin: the seed is a snapshot of the instant the LAYOUT rendered,
        // so it is stale by arrival and must never be painted directly. DEMOTE
        // to a fresh fetch rather than dropping it — the layout no longer passes
        // a synchronous count, so this promise IS the router.refresh path (an
        // admin resolves an item, the tree re-renders, a new promise arrives).
        // Dropping it would leave the badge on the page-load count forever,
        // stale exactly when the number matters most. Mirrors the bell's
        // long-standing post-zero demotion.
        runFetch();
        return;
      }
      ingestPropValue(value.kind === "ok" ? value.count : null);
    });
    return () => {
      current = false;
    };
  }, [seedPromise, ingestPropValue, runFetch]);

  useEffect(() => {
    if (pathname === lastPathRef.current) return; // initial mount: server prop is fresh
    lastPathRef.current = pathname;
    return runFetch();
  }, [pathname, runFetch]);

  return count;
}
