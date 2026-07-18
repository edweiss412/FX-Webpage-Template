"use client";

/**
 * components/admin/useShowModalNav.ts (admin-show-modal spec §3 / D9)
 *
 * Client-side open/close navigation for the `/admin?show=<slug>` review modal.
 * Mutates ONLY the `show`/`alert_id` params and preserves all others. Every
 * close affordance (X, scrim, Esc, drag-dismiss) funnels through `close`; link
 * sites on client islands build hrefs through `openHref`. The param logic
 * itself lives in the pure, server-safe `lib/admin/showModalParams.ts`.
 */
import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildShowModalHref } from "@/lib/admin/showModalParams";

export function useShowModalNav(): {
  /** Param-preserving href opening `slug`'s modal (`buildShowModalHref` over the current params). */
  openHref: (slug: string) => string;
  /** Push the current URL minus `show`/`alert_id`, `{ scroll: false }` (the dashboard stays put). */
  close: () => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const openHref = useCallback(
    (slug: string) => buildShowModalHref(slug, new URLSearchParams(searchParams)),
    [searchParams],
  );

  const close = useCallback(() => {
    const q = new URLSearchParams(searchParams);
    q.delete("show");
    q.delete("alert_id");
    const qs = q.toString();
    router.push(qs ? `/admin?${qs}` : "/admin", { scroll: false });
  }, [router, searchParams]);

  return { openHref, close };
}
