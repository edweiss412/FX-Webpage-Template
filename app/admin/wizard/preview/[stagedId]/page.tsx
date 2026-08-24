/**
 * app/admin/wizard/preview/[stagedId]/page.tsx
 *
 * The staged crew preview: the REAL crew page rendered from a step-3 staged
 * `parse_result`, with no DB show row and no publish. Spec:
 * docs/superpowers/specs/step3-onboarding/2026-08-15-step3-crew-preview-and-opslog-disposition-design.md §2.1.
 *
 * Read-only by construction: no mutation, no server action, no advisory lock
 * (invariants 2 and 10 are N/A here, stated so the meta-test question is
 * pre-empted — `tests/log/_metaMutationSurfaceObservability.test.ts` discovers
 * mutating routes, and a GET page is outside its population).
 *
 * Failure surfaces are §2.7: every shape lands on plain-language admin copy with
 * its own testid, never a raw code (invariant 5) and never the generic admin
 * error boundary. A residual throw during a DESCENDANT server render cannot pass
 * through this function's try/catch, which is why the segment ships its own
 * `error.tsx` beside this file.
 */
import { notFound } from "next/navigation";

import { StagedPreviewBanner } from "@/components/admin/StagedPreviewBanner";
import { CrewShell } from "@/app/show/[slug]/[shareToken]/_CrewShell";
import { lookupStagedRow } from "@/lib/admin/lookupStagedRow";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { asParseResult } from "@/lib/db/coerceJsonbObject";
import { buildStagedShowForViewer } from "@/lib/data/stagedShowForViewer";
import { nowDate } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crew preview · Admin · FXAV" };

// Admin-only copy, following the published preview route's inline-copy precedent
// (app/admin/show/[slug]/preview/[crewId]/page.tsx:44-49). No §12.4 catalog row
// applies: these strings are never crew-facing, so the three-way catalog lockstep
// is untouched.
// not-subject:M5-D8
const LOAD_FAILURE_COPY = "We could not load this preview.";
// not-subject:M5-D8
const EMPTY_ROSTER_COPY =
  "This sheet has no crew members yet, so there is no crew page to preview.";

/** Postgres would reject a non-UUID cast, so the shape is checked before the query. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ stagedId: string }>;
  /** `as` = surrogate viewer id (§2.3); `s` = the raw section deep link. */
  searchParams: Promise<{ as?: string; s?: string }>;
};

function FailureSurface({ testId, copy }: { testId: string; copy: string }) {
  return (
    <main
      data-testid={testId}
      data-render-fault={testId}
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
    >
      <p className="text-base text-text-subtle">{copy}</p>
      <a
        href="/admin"
        className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
      >
        Back to setup
      </a>
    </main>
  );
}

export default async function StagedPreviewPage({ params, searchParams }: PageProps) {
  await requireAdmin();

  const { stagedId } = await params;
  const { as, s } = await searchParams;

  if (!UUID_RE.test(stagedId)) notFound();

  const lookup = await lookupStagedRow(stagedId);
  if (lookup.kind === "not_found") notFound();
  if (lookup.kind === "infra_error") {
    return <FailureSurface testId="staged-preview-infra-error" copy={LOAD_FAILURE_COPY} />;
  }

  const checkedAt = (await nowDate()).toISOString();

  // The decode + adapter pair is the route's own synchronous residual guard;
  // `asParseResult` validates CONTAINERS only, so the adapter is what normalizes
  // the untrusted nested fields (spec §2.1 step 4 / §2.2).
  let built;
  try {
    const parse = asParseResult(lookup.row.parseResult);
    built = buildStagedShowForViewer(parse, {
      driveFileId: lookup.row.driveFileId,
      sourceAnchors: lookup.row.sourceAnchors,
      stagedModifiedTime: lookup.row.stagedModifiedTime,
      checkedAt,
      requestedViewerId: as ?? null,
    });
  } catch {
    return <FailureSurface testId="staged-preview-decode-error" copy={LOAD_FAILURE_COPY} />;
  }

  if (built.kind === "decode_error") {
    return <FailureSurface testId="staged-preview-decode-error" copy={LOAD_FAILURE_COPY} />;
  }
  if (built.kind === "empty_roster") {
    return <FailureSurface testId="staged-preview-empty-roster" copy={EMPTY_ROSTER_COPY} />;
  }

  return (
    <>
      <StagedPreviewBanner
        stagedId={lookup.row.stagedId}
        roster={built.roster}
        selectedId={built.selectedId}
        rawSection={s}
      />
      <CrewShell
        data={built.data}
        viewer={{ kind: "admin_preview", crewMemberId: built.selectedId }}
        showId="staged-preview"
        rawSection={s}
        staticPreview
      />
    </>
  );
}
