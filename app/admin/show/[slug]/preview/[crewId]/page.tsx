/**
 * app/admin/show/[slug]/preview/[crewId]/page.tsx
 * (M10 §B Task 10.8 / Phase 3 / Cluster I-5)
 *
 * Admin "preview as crew member" route per spec §9.3. Renders the same
 * crew page body the targeted crew member would see, with a sticky
 * yellow banner indicating the impersonation state.
 *
 * Auth contract (Pin-3, identity-only Viewer kind):
 *   - The route requires admin (requireAdmin), then resolves the show
 *     by slug and calls `getShowForViewer(showId, { kind:
 *     'admin_preview', crewMemberId })`. The helper itself does the
 *     role re-derivation from `crew_members.role_flags`, the cross-show
 *     fail-closed check (`LINK_NO_CREW_MATCH`), and rejects any caller
 *     that tries to inject a `crewMember` payload (Pin-3 contract).
 *   - Identity-only: the route never passes pre-derived role flags or
 *     an `impersonate` field. Task 4.3's structural regression test
 *     enforces this at the symbol level; this route is one of its two
 *     legitimate callers.
 *
 * Render contract (spec §9.3):
 *   - Sticky banner above the show body: "Previewing as <Name> (<Role>)"
 *     with an Exit affordance back to /admin/show/[slug] and a "Report
 *     this view" link.
 *   - Show body is the same `<ShowBody />` Server Component the live
 *     crew page renders (extracted in M10 §B Phase 3 for this reuse).
 *     All role-based filtering applies as if the admin were that
 *     viewer, per spec.
 *
 * Build-gated-routes-never-fallback-target: this route is admin-only
 * AND ungated by build flags. Exit/Report links target
 * `/admin/show/<slug>` which is the canonical admin per-show page.
 */
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getShowForViewer, type ShowForViewer } from "@/lib/data/getShowForViewer";
import { PreviewBanner } from "@/components/admin/PreviewBanner";
import { ShowBody } from "@/app/show/[slug]/_ShowBody";

const INFRA_ERROR_COPY =
  // not-subject:M5-D8 — admin-only infra-fallback copy. `ADMIN_SESSION_LOOKUP_FAILED`
  // in the catalog is crew-facing (dougFacing is null); this surface is admin-only
  // so the literal below is the canonical Doug copy for the infra-error path until a
  // dedicated `ADMIN_PREVIEW_LOAD_FAILED` catalog entry lands in §A.
  "We could not load this preview. Try again in a moment, or contact the developer if this keeps happening.";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preview as crew member · Admin · FXAV" };

type PageProps = {
  params: Promise<{ slug: string; crewId: string }>;
};

type ShowLookup =
  | { kind: "found"; id: string }
  | { kind: "not_found" }
  | { kind: "infra_error" };

// Exported for tests/admin/_metaInfraContract.test.ts — registry row
// for the §B Supabase call-boundary contract (AGENTS.md §1.9).
export async function lookupShow(slug: string): Promise<ShowLookup> {
  try {
    // Session-bound server client (not service-role): keeps RLS engaged
    // so this surface cannot read shows the admin's session would
    // otherwise be denied. requireAdmin() already gated the route; this
    // is defense-in-depth on the data layer.
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shows")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return { kind: "infra_error" };
    if (!data) return { kind: "not_found" };
    const id = (data as { id?: string }).id;
    if (!id) return { kind: "not_found" };
    return { kind: "found", id };
  } catch {
    return { kind: "infra_error" };
  }
}

type CrewLookup =
  | { kind: "found"; name: string; roleLabel: string | null }
  | { kind: "not_found" }
  | { kind: "infra_error" };

// Exported for tests/admin/_metaInfraContract.test.ts — registry row
// for the §B Supabase call-boundary contract (AGENTS.md §1.9).
export async function lookupCrewMember(
  showId: string,
  crewMemberId: string,
): Promise<CrewLookup> {
  try {
    // Session-bound server client. The banner's identity label reads
    // from `crew_members.role` (display label like "A1", "Stage
    // Manager") — NOT the capability `role_flags` array. Per spec §9.3
    // the banner shows "<Name> (<Role>)" so operators recognize the
    // viewer they are previewing; role_flags drive auth and tile
    // visibility separately inside getShowForViewer.
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("crew_members")
      .select("name, role")
      .eq("id", crewMemberId)
      .eq("show_id", showId)
      .maybeSingle();
    if (error) return { kind: "infra_error" };
    if (!data) return { kind: "not_found" };
    const name = (data as { name?: string }).name;
    if (typeof name !== "string" || name.length === 0) {
      return { kind: "not_found" };
    }
    const rawRole = (data as { role?: unknown }).role;
    const roleLabel =
      typeof rawRole === "string" && rawRole.length > 0 ? rawRole : null;
    return { kind: "found", name, roleLabel };
  } catch {
    return { kind: "infra_error" };
  }
}

export default async function AdminPreviewAsPage({ params }: PageProps) {
  await requireAdmin();
  const { slug, crewId } = await params;

  const showLookup = await lookupShow(slug);
  if (showLookup.kind === "not_found") notFound();
  if (showLookup.kind === "infra_error") {
    return (
      <main
        data-testid="admin-preview-infra-error"
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
      >
        <h1 className="text-2xl font-bold text-text-strong">
          We could not load this preview
        </h1>
        <p className="mt-4 text-base text-text-subtle">{INFRA_ERROR_COPY}</p>
        <a
          href={`/admin/show/${encodeURIComponent(slug)}`}
          className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
        >
          Back to show
        </a>
      </main>
    );
  }
  const showId = showLookup.id;

  // Cross-show fail-closed: confirm the crew member belongs to this
  // show BEFORE rendering the banner. getShowForViewer would also
  // reject mismatch via LINK_NO_CREW_MATCH, but failing fast here lets
  // the banner display the real name + role rather than relying on
  // the helper's identity output.
  const crewLookup = await lookupCrewMember(showId, crewId);
  if (crewLookup.kind === "not_found") notFound();
  if (crewLookup.kind === "infra_error") {
    // AGENTS.md §1.9 Supabase call-boundary discipline: surface infra
    // faults as a discriminable error UI rather than masking them as a
    // benign navigation (the previous redirect made a DB/RLS failure
    // look identical to the operator clicking Exit preview).
    return (
      <main
        data-testid="admin-preview-crew-infra-error"
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
      >
        <h1 className="text-2xl font-bold text-text-strong">
          We could not load this preview
        </h1>
        <p className="mt-4 text-base text-text-subtle">{INFRA_ERROR_COPY}</p>
        <a
          href={`/admin/show/${encodeURIComponent(slug)}`}
          className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
        >
          Back to show
        </a>
      </main>
    );
  }

  // Pin-3 contract: identity-only Viewer.
  let data: ShowForViewer;
  try {
    data = await getShowForViewer(showId, {
      kind: "admin_preview",
      crewMemberId: crewId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "LINK_NO_CREW_MATCH") {
      notFound();
    }
    return (
      <main
        data-testid="admin-preview-data-failure"
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
      >
        <h1 className="text-2xl font-bold text-text-strong">
          We could not load this preview
        </h1>
        <p className="mt-4 text-base text-text-subtle">{INFRA_ERROR_COPY}</p>
        <a
          href={`/admin/show/${encodeURIComponent(slug)}`}
          className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
        >
          Back to show
        </a>
      </main>
    );
  }

  return (
    <>
      <PreviewBanner
        crewMemberName={crewLookup.name}
        crewMemberRoleLabel={crewLookup.roleLabel}
        slug={slug}
        showId={showId}
        crewMemberId={crewId}
      />
      <ShowBody
        slug={slug}
        showId={showId}
        viewer={{ kind: "admin_preview", crewMemberId: crewId }}
        data={data}
      />
    </>
  );
}
