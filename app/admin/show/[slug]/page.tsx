/**
 * app/admin/show/[slug]/page.tsx
 * (admin-show-modal spec §3/§4 — Task 7 transitional shape)
 *
 * The consolidated per-show review body moved VERBATIM into the
 * `ShowReviewModal` server loader (`app/admin/_showReviewModal.tsx`), which
 * renders the published review surface as the dashboard's `/admin?show=<slug>`
 * modal. Until Task 9 rewrites this route as the canonical
 * `/admin?show=<slug>` redirect, it keeps serving the legacy URL by
 * delegating straight to that loader (same reads, same gates, same render —
 * requireAdmin defense-in-depth preserved here exactly as before the move).
 */
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { ShowReviewModal } from "@/app/admin/_showReviewModal";

export const dynamic = "force-dynamic";

export default async function AdminShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ alert_id?: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  return <ShowReviewModal slug={slug} alertId={sp.alert_id ?? null} />;
}
