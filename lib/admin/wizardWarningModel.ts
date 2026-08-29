// SERVER-ONLY module — never import from a "use client" file. It pulls node:crypto
// transitively through `buildReportSurfaceId` / `warningFingerprint`
// (`lib/dataQuality/warningFingerprint.ts:1-2`), the same constraint documented on
// `lib/admin/sectionWarningModel.ts`. Client code receives the built model as data
// across the RSC boundary; it never builds one.
//
// Spec: docs/superpowers/specs/2026-08-28-wizard-warning-ignore-controls.md §2.1.
import type { ParseWarning } from "@/lib/parser/types";
import { warningFingerprint, buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";
import { canonicalize } from "@/lib/email/canonicalize";

export type WizardWarningItem = {
  /** Index into the row's FULL ParseResult.warnings array — the JUMP-TARGET identity
   *  only (`data-warning-index` / `data-attention-anchor`). React keys stay
   *  content-derived via `stableWarningKeys` (`lib/dataQuality/warningIdentity.ts:46`). */
  index: number;
  reportSurfaceId: string;
  /**
   * Which store this row's ignore actually lives in — set on IGNORED items only.
   *
   * Whole-diff P0: linkage alone does not determine the backend. A row that was
   * FIRST-SEEN when the operator dismissed a warning, and became LINKED before finalize,
   * holds that dismissal in the STAGED column while the row now reads as a show row.
   * Targeting Un-ignore by linkage sent it to the slug route, which deletes nothing and
   * still answers `unignored`, so the client announced "Warning restored", refreshed, and
   * the warning stayed hidden. A false success on a control that cannot work is worse
   * than an error; the write has to follow the store the read used.
   */
  /**
   * WHICH store this dismissal lives in, and therefore which one an Un-ignore must
   * clear. `both` is not a degenerate case: the two stores are written by two
   * different surfaces, so the same fingerprint can legitimately sit in each, and
   * clearing only one leaves the other still hiding the row (whole-diff R1 P0).
   */
  ignoreOrigin?: "show" | "staged" | "both";
};

export type WizardWarningModel = {
  /** Fingerprint absent from the ignored set, or no fingerprint at all. */
  active: WizardWarningItem[];
  ignored: WizardWarningItem[];
};

/** One row of the `pending_syncs.ignored_warnings` jsonb array. */
export type StagedIgnoreEntry = { fingerprint: string; code: string; ignored_by: string };

/**
 * Read-side coercion for the untrusted `pending_syncs.ignored_warnings` column.
 *
 * Strips every entry to exactly the three stored fields: the column is jsonb with
 * no CHECK (spec §2.7 matrix — one writer, coercion on read), so an entry carrying
 * extra keys must not round-trip them back into storage on the next write. A
 * wholly malformed value degrades to `[]`, which renders every warning ACTIVE —
 * fail toward VISIBLE (spec §1.1.7).
 */
export function normalizeStagedIgnoredWarnings(raw: unknown): StagedIgnoreEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: StagedIgnoreEntry[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    // An empty fingerprint can never match a real one (sha256 base64url is never
    // empty), so it is dropped with the missing and non-string cases.
    if (typeof e.fingerprint !== "string" || e.fingerprint.length === 0) continue;
    // Whole-diff R1 P0: `ignored_by` must be usable HERE, because the finalize carry
    // requires it (`public.ignored_warnings` has a canonical-email CHECK) and drops
    // what it cannot canonicalize. Coercing a missing identity to "" made the two
    // boundaries DISAGREE: the read side hid the warning, the carry dropped the entry,
    // and the operator watched a dismissal they had confirmed come back after
    // publishing with nothing said. One rule, both ends — an entry that cannot become
    // a durable row does not get to hide a warning either.
    const ignoredBy = typeof e.ignored_by === "string" ? canonicalize(e.ignored_by) : null;
    if (ignoredBy === null) continue;
    out.push({
      fingerprint: e.fingerprint,
      code: typeof e.code === "string" ? e.code : "",
      ignored_by: ignoredBy,
    });
  }
  return out;
}

/**
 * A partition reconciled against the warnings array a caller is about to render or count.
 *
 * `buildWizardWarningModel` guarantees in-range indices BY CONSTRUCTION, so on the server
 * — where the model and the warnings come from one array in one pass — this is identity.
 * The client cannot assume that: a model held in React state can outlive the parse it was
 * built from, and then it addresses rows that are no longer there.
 *
 * Whole-diff R1 P1. Every site that COUNTS the partition, or uses an item's index to REACH
 * INTO the warnings array, must reconcile first. Sites that only MATCH an index against
 * rendered entries are immune, because an index nothing holds simply never matches — which
 * is why `ignoredWarningIndices` deliberately does not call this, and says so.
 *
 * The rule is the derivation, not the list: count or index, reconcile; match, do not.
 */
export function reconcileWizardWarningItems(
  partition: readonly WizardWarningItem[],
  warningsLength: number,
): readonly WizardWarningItem[] {
  return partition.filter((item) => item.index >= 0 && item.index < warningsLength);
}

/**
 * Partition a row's warnings into active and ignored, carrying ORIGINAL indices.
 *
 * Same semantics as `partitionByIgnored` (`lib/dataQuality/partitionByIgnored.ts:4-16`) —
 * a null fingerprint is always active — but items carry `{index, reportSurfaceId}`
 * instead of copies of the warnings, so every consumer re-joins against the one
 * `warnings` array it already holds and no second copy can drift.
 */
export function buildWizardWarningModel(args: {
  /** LINKED rows: the show slug. FIRST-SEEN rows: `staged-${driveFileId}`. Only a
   *  stable namespace for the opaque surface id. */
  reportScope: string;
  warnings: readonly ParseWarning[];
  ignoredFingerprints: ReadonlySet<string>;
  /** The subset of `ignoredFingerprints` that came from the row's STAGED column. Every
   *  ignored item is stamped with the store it was found in, so the control writes back
   *  to the one the read came from. Omitted or empty means every ignore is durable,
   *  which is every published and LINKED-only row. */
  stagedFingerprints?: ReadonlySet<string>;
  /** The subset that came from the DURABLE `public.ignored_warnings` table. Needed
   *  alongside `stagedFingerprints` because `ignoredFingerprints` is their UNION for a
   *  linked row, and a union cannot say whether a staged fingerprint is ALSO durable —
   *  which is the whole difference between clearing one store and clearing both. */
  durableFingerprints?: ReadonlySet<string>;
  /**
   * Whether the durable read actually RESOLVED, as opposed to failing open to empty.
   *
   * Whole-diff R3 P0. The loader degrades an `infra_error` to an empty set by design
   * (§1.1.7, fail toward VISIBLE), which is correct for rendering — over-showing a
   * warning is the safe error. It is the wrong default the moment the same value routes
   * a MUTATION: an unresolved read then looks exactly like "this fingerprint is not
   * durable", the durable arm is skipped, and Un-ignore reports a success the store
   * contradicts. Emptiness cannot carry this, so resolvedness is passed explicitly.
   *
   * Defaults to true, which keeps every caller that has no loader (published mounts,
   * fixtures, first-seen rows) on the exact behaviour it had.
   */
  durableResolved?: boolean;
}): WizardWarningModel {
  const {
    reportScope,
    warnings,
    ignoredFingerprints,
    stagedFingerprints,
    durableFingerprints,
    durableResolved = true,
  } = args;
  const active: WizardWarningItem[] = [];
  const ignored: WizardWarningItem[] = [];
  for (let index = 0; index < warnings.length; index += 1) {
    const w = warnings[index] as ParseWarning;
    const item: WizardWarningItem = {
      index,
      reportSurfaceId: buildReportSurfaceId(reportScope, w),
    };
    const fp = warningFingerprint(w);
    if (fp !== null && ignoredFingerprints.has(fp)) {
      // Whole-diff R1 P0: when a fingerprint sits in BOTH stores, say so.
      //
      // This previously picked `staged`, reasoning that the durable route would delete
      // its own copy and leave the staged one still hiding the row. That reasoning was
      // right and incomplete — it is equally true reversed. Either single choice removes
      // one copy while the enrichment union restores the other, and the operator is told
      // "Warning restored" about a warning that is still hidden. A caller that sees
      // `both` must clear both, and must not report success on a partial clear.
      //
      // `durableFingerprints` is REQUIRED to tell "staged only" from "both", and this is
      // why: for a linked row `ignoredFingerprints` is the UNION, so union-membership
      // plus staged-membership cannot distinguish the two. Absent it (published and
      // standalone mounts, which have no staged store at all) the staged set is the
      // whole answer and the old two-way split is exactly right.
      const inStaged = stagedFingerprints?.has(fp) === true;
      // R3 P0: an UNRESOLVED durable read cannot rule the durable store out, so a
      // staged fingerprint routes to `both` and the caller clears both. Deleting from
      // a store that holds nothing is a harmless no-op; skipping one that holds a copy
      // is the false success. Conservative in the direction the operator can see.
      const inDurable = durableFingerprints?.has(fp) === true || !durableResolved;
      ignored.push({
        ...item,
        ignoreOrigin: inStaged ? (inDurable ? "both" : "staged") : "show",
      });
    } else active.push(item);
  }
  return { active, ignored };
}
