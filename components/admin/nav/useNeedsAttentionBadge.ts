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
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function useNeedsAttentionBadge(initialBadgeCount: number | null): number | null {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(initialBadgeCount);
  const tokenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastPathRef = useRef(pathname);

  useEffect(() => {
    // Prop sync (router.refresh path): newest server truth — always commit.
    // setState lives in the effect deliberately: the commit is coordinated with
    // a token bump + in-flight fetch abort (R5-F1 race safety). A
    // derive-during-render rewrite would have to mutate tokenRef/abortRef during
    // render (a worse violation) and drop the abort.
    tokenRef.current += 1;
    abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- coordinated prop sync; see above
    setCount(initialBadgeCount);
  }, [initialBadgeCount]);

  useEffect(() => {
    if (pathname === lastPathRef.current) return; // initial mount: server prop is fresh
    lastPathRef.current = pathname;
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
  }, [pathname]);

  return count;
}
