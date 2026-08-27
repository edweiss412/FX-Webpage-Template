/**
 * lib/admin/lookupStagedRow.ts
 *
 * The staged crew preview's single Supabase read (spec
 * docs/superpowers/specs/step3-onboarding/2026-08-15-step3-crew-preview-and-opslog-disposition-design.md §2.1
 * step 3).
 *
 * It lives in its OWN module for two reasons: the route module-mocks it in
 * tests (a same-module export cannot be mocked out from under the page's
 * lexical reference), and AGENTS.md invariant 9 wants a full three-way boundary
 * as a registered, independently exercisable helper rather than an inline
 * `not-subject-to-meta` waiver. Registry row + behavioral proofs:
 * `tests/admin/_metaInfraContract.test.ts`.
 *
 * Boundary contract (invariant 9): `{ data, error }` is destructured, and the
 * returned-error path is distinguished from the thrown path — both map to
 * `infra_error`, while a HEALTHY `maybeSingle()` miss maps to `not_found`. That
 * distinction is load-bearing: mapping a healthy null to `infra_error` would
 * turn AC-4's required 404 into an error surface.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { log } from "@/lib/log";

export type StagedRow = {
  stagedId: string;
  driveFileId: string | null;
  parseResult: unknown;
  sourceAnchors: Record<string, SourceAnchor>;
  stagedModifiedTime: string | null;
};

export type StagedRowLookup =
  | { kind: "found"; row: StagedRow }
  | { kind: "not_found" }
  | { kind: "infra_error" };

export async function lookupStagedRow(stagedId: string): Promise<StagedRowLookup> {
  try {
    // Session-bound server client (not service-role): RLS stays engaged, so this
    // surface cannot read rows the admin's own session would be denied.
    // `requireAdmin()` already gated the route; this is defense-in-depth on the
    // data layer, mirroring `lookupShow` at
    // app/admin/show/[slug]/preview/[crewId]/page.tsx:71.
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("pending_syncs")
      .select("staged_id, drive_file_id, parse_result, source_anchors, staged_modified_time")
      .eq("staged_id", stagedId)
      .maybeSingle();

    // RETURNED error: an infra fault that resolved rather than threw.
    if (error) {
      void log.error("pending_syncs staged-row read returned error", {
        source: "admin.lookupStagedRow",
        code: "STAGED_ROW_READ_RETURNED_ERROR",
        error,
      });
      return { kind: "infra_error" };
    }
    // HEALTHY miss: no row for this staged id. NOT an infra fault.
    if (!data) return { kind: "not_found" };

    const row = data as Record<string, unknown>;
    const id = typeof row.staged_id === "string" ? row.staged_id : null;
    if (id === null) return { kind: "not_found" };

    return {
      kind: "found",
      row: {
        stagedId: id,
        driveFileId: typeof row.drive_file_id === "string" ? row.drive_file_id : null,
        parseResult: row.parse_result,
        sourceAnchors:
          typeof row.source_anchors === "object" &&
          row.source_anchors !== null &&
          !Array.isArray(row.source_anchors)
            ? (row.source_anchors as Record<string, SourceAnchor>)
            : {},
        stagedModifiedTime:
          typeof row.staged_modified_time === "string" ? row.staged_modified_time : null,
      },
    };
  } catch (err) {
    // THROWN: token expiry mid-query, network reset, client construction fault.
    void log.error("pending_syncs staged-row read threw", {
      source: "admin.lookupStagedRow",
      code: "STAGED_ROW_READ_THREW",
      error: err,
    });
    return { kind: "infra_error" };
  }
}
