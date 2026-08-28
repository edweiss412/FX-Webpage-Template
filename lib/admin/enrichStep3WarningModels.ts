// SERVER-ONLY module — it builds `WizardWarningModel`s, which pulls node:crypto
// through `buildReportSurfaceId` (`lib/admin/wizardWarningModel.ts`). Runs in the
// wizard server component after the step-3 rows exist.
//
// Spec: docs/superpowers/specs/2026-08-28-wizard-warning-ignore-controls.md §2.0/§2.1.
import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import type { LoadIgnoredWarningsResult } from "@/lib/admin/loadIgnoredWarnings";
import {
  buildWizardWarningModel,
  normalizeStagedIgnoredWarnings,
} from "@/lib/admin/wizardWarningModel";

/** `Array.isArray` coercion, mirroring `arr` in `lib/admin/step3Buckets.ts:39`. */
const arr = (value: unknown): ParseWarning[] => (Array.isArray(value) ? value : []);

/**
 * The §2.0 reviewable-preview predicate — `parseResult` is a non-null object whose
 * `show` is truthy. Identical to `hasReviewablePreview`
 * (`components/admin/wizard/Step3Review.tsx:776-779`, mirrored at
 * `lib/admin/step3Buckets.ts:53-61`), reproduced rather than imported because both
 * live behind a component boundary or a private module scope. `warnings` is NOT part
 * of the predicate: on a reviewable preview it coerces through `arr()`.
 */
function hasReviewablePreview(row: Step3Row): boolean {
  const pr = row.parseResult;
  return pr != null && typeof pr === "object" && !!(pr as ParseResult).show;
}

/**
 * Attach a `warningModel` to every row with a reviewable preview, reading each row's
 * ignore store by its LINKAGE (spec §2.0):
 *
 *  - LINKED (a `linkedShowRef` with a usable slug): awaits `loader(showId)`, in
 *    parallel across qualifying rows. An `infra_error` becomes an EMPTY ignore set —
 *    every warning renders active, failing toward VISIBLE (spec §1.1.7).
 *  - FIRST-SEEN: NO loader call. The show does not exist yet, so there is nothing to
 *    query; the fingerprints come from the row's own `pending_syncs.ignored_warnings`.
 *  - NO-PREVIEW: passed through untouched, with NO `warningModel` key.
 *
 * Returns a new array of new row objects; the caller's rows are never mutated.
 */
export async function enrichStep3WarningModels(
  rows: Step3Row[],
  loader: (showId: string) => Promise<LoadIgnoredWarningsResult>,
): Promise<Step3Row[]> {
  const linkedFingerprints = new Map<number, ReadonlySet<string>>();
  await Promise.all(
    rows.map(async (row, i) => {
      const ref = row.linkedShowRef;
      if (!ref || !hasReviewablePreview(row)) return;
      const result = await loader(ref.id);
      linkedFingerprints.set(i, result.kind === "ok" ? result.fingerprints : new Set<string>());
    }),
  );

  return rows.map((row, i) => {
    if (!hasReviewablePreview(row)) return row;
    const ref = row.linkedShowRef;
    const linked = ref != null;
    const ignoredFingerprints = linked
      ? (linkedFingerprints.get(i) ?? new Set<string>())
      : new Set(
          normalizeStagedIgnoredWarnings(row.stagedIgnoredWarnings).map((e) => e.fingerprint),
        );
    return {
      ...row,
      warningModel: buildWizardWarningModel({
        reportScope: linked ? ref.slug : `staged-${row.driveFileId}`,
        warnings: arr((row.parseResult as ParseResult | null | undefined)?.warnings),
        ignoredFingerprints,
      }),
    };
  });
}
