/**
 * app/admin/show/[slug]/page.tsx (admin-show-modal spec §3 — legacy redirect)
 *
 * The published review surface now lives in the dashboard modal at
 * `/admin?show=<slug>` (ShowReviewModal, `app/admin/_showReviewModal.tsx`).
 * This route survives ONLY as the durable/emailed deep-link form (D10 — the
 * auth `next` pipeline is path-only, so emailed links keep the PATH shape and
 * 307 here into the modal). requireAdmin() stays BEFORE the redirect — the
 * auth-chain registry row for this path (`lib/audit/trustDomains.ts`) and the
 * auth audit remain true unchanged.
 *
 * Param passthrough: incoming searchParams are re-appended (first value per
 * key); an incoming `show` param is DROPPED (the path slug wins). The URL
 * fragment survives via browser redirect behavior — never server-visible.
 */
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

export default async function AdminShowRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const q = new URLSearchParams({ show: slug });
  for (const [k, v] of Object.entries(sp)) {
    if (k === "show") continue;
    const first = Array.isArray(v) ? v[0] : v;
    if (first) q.set(k, first);
  }
  redirect(`/admin?${q.toString()}`);
}
