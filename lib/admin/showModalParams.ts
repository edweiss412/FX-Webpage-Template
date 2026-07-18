/**
 * lib/admin/showModalParams.ts (admin-show-modal spec §3 / D9)
 *
 * PURE, server-safe param helpers for the `/admin?show=<slug>` review modal —
 * no hooks, no "use client". `app/admin/page.tsx` is an RSC and imports
 * `firstParam` directly; a hook-bearing client module here is exactly the class
 * `tests/admin/serverNoClientValueCall.test.ts` guards against. The client hook
 * wrapper (`useShowModalNav`) lives in `components/admin/useShowModalNav.ts` and
 * delegates both param computations to this module (single source of truth).
 */

/** D9: preserve every current param EXCEPT `show` (replaced) and `alert_id`
 *  (dropped — it addresses one modal instance, never the next open), then set
 *  `show=slug`. URLSearchParams owns the encoding. */
export function buildShowModalHref(slug: string, currentParams: URLSearchParams): string {
  const q = new URLSearchParams(currentParams);
  q.delete("show");
  q.delete("alert_id");
  q.set("show", slug);
  return `/admin?${q.toString()}`;
}

/** §6.2 guard table: array → first element wins; `""`/`undefined` → absent
 *  (null), so `?show=` never mounts an empty-slug modal. */
export function firstParam(v: string | string[] | undefined): string | null {
  const first = Array.isArray(v) ? v[0] : v;
  return first ? first : null;
}
