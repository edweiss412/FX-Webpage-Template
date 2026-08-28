/**
 * tests/admin/step3StateGallery.test.ts — the seeded Step-3 state gallery
 * (spec docs/superpowers/specs/admin/2026-08-02-step3-live-render-cluster-design.md §2).
 *
 * DB-backed (serial project). Seeds the six card variants the BACKLOG entry
 * names into ONE reserved wizard session, reads them back exactly the way
 * `fetchStep3Data` does, and drives them through the REAL assembly seam
 * (`assembleStep3Row`) so the assertions measure what the live
 * `/admin?step=3` render measures.
 *
 * Concrete failure modes caught:
 *   - a variant deriving the wrong display state (seed matrix drifting away
 *     from `deriveStep3DisplayState`), which would silently shrink the gallery
 *     the impeccable dual-gate runs against;
 *   - the warn-card variant seeding a warning that no longer registers as a
 *     non-ambiguity gap (needs-a-look card would vanish);
 *   - manifest / pending_ingestions mutations escaping the per-show advisory
 *     lock (invariant 2) — asserted behaviorally against a live holder.
 */
import { afterAll, beforeAll, expect, test } from "vitest";
import postgres from "postgres";
import {
  seedStep3StateGallery,
  cleanupStep3StateGallery,
  seedOneVariantWithHook,
  galleryDatabaseUrl,
  type GalleryRow,
} from "../e2e/helpers/devCaptureStaged";
import { admin } from "../e2e/helpers/supabaseAdmin";
import { assembleStep3Row, type StagedPreviewForRow } from "@/lib/admin/assembleStep3Row";
import type { Step3Row, Step3ManifestStatus } from "@/components/admin/wizard/Step3Review";
import type { ParseResult } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { nonAmbiguityGapTotal } from "@/lib/admin/step3Buckets";
import { buildAdminAgendaPreview } from "@/lib/agenda/agendaAdminPreview";
import { normalizeUseRawDecisions } from "@/lib/sync/useRawOverlay";

// The matrix's literals (spec §2.3), NOT re-derived from the seed inputs.
const EXPECTED: Record<string, string> = {
  ready: "ready",
  needs_a_look: "ready", // warn-card variant of ready (spec §1.1)
  demoted_rescan: "needs_review_reapply",
  no_details: "needs_review_no_details",
  blocking: "needs_review_other",
  set_aside: "set_aside",
};

let seeded: { sessionId: string; rows: GalleryRow[] };

beforeAll(async () => {
  seeded = await seedStep3StateGallery();
}, 60_000);

afterAll(async () => {
  if (seeded) await cleanupStep3StateGallery(seeded.rows);
}, 60_000);

type ReadbackRow = {
  manifest: {
    drive_file_id: string;
    status: Step3ManifestStatus;
    name: string | null;
    publish_intent: boolean | null;
    created_show_id: string | null;
    wizard_session_id: string | null;
  };
  parsedTitle: string | null;
  assembled: Step3Row;
};

/** Reads the three tables production reads, then assembles through the real seam. */
async function readBack(row: GalleryRow): Promise<ReadbackRow> {
  const { data: mani, error: maniErr } = await admin
    .from("onboarding_scan_manifest")
    .select("drive_file_id, name, status, publish_intent, created_show_id, wizard_session_id")
    .eq("wizard_session_id", seeded.sessionId)
    .eq("drive_file_id", row.driveFileId)
    .maybeSingle();
  if (maniErr) throw new Error(`manifest readback failed: ${maniErr.message}`);
  if (!mani) throw new Error(`manifest row missing for ${row.driveFileId}`);

  const { data: pending, error: pendErr } = await admin
    .from("pending_syncs")
    .select(
      "staged_id, parse_result, last_finalize_failure_code, triggered_review_items, pull_sheet_override, source_anchors, staged_modified_time, use_raw_decisions",
    )
    .eq("wizard_session_id", seeded.sessionId)
    .eq("drive_file_id", row.driveFileId)
    .maybeSingle();
  if (pendErr) throw new Error(`pending_syncs readback failed: ${pendErr.message}`);

  const { data: ingestion, error: ingErr } = await admin
    .from("pending_ingestions")
    .select("id, last_error_code")
    .eq("wizard_session_id", seeded.sessionId)
    .eq("drive_file_id", row.driveFileId)
    .maybeSingle();
  if (ingErr) throw new Error(`pending_ingestions readback failed: ${ingErr.message}`);

  // Mirrors fetchStep3Data's stagedByDfid construction (OnboardingWizard.tsx:547-588).
  let staged: StagedPreviewForRow | undefined;
  let parsedTitle: string | null = null;
  if (pending) {
    const rawParse = pending.parse_result;
    const parseResult =
      rawParse !== null && typeof rawParse === "object" ? (rawParse as ParseResult) : null;
    const rawAnchors = pending.source_anchors;
    const agendaLinks = parseResult?.show?.agenda_links;
    parsedTitle = parseResult?.show?.title ?? null;
    staged = {
      stagedId: pending.staged_id as string,
      title: parsedTitle,
      parseResult,
      sourceAnchors:
        rawAnchors !== null && typeof rawAnchors === "object"
          ? (rawAnchors as Record<string, SourceAnchor>)
          : {},
      adminAgendaPreview: Array.isArray(agendaLinks) ? buildAdminAgendaPreview(agendaLinks) : [],
      agendaStateKey: `${seeded.sessionId}:${pending.staged_id}:${pending.staged_modified_time}`,
      lastFinalizeFailureCode: (pending.last_finalize_failure_code as string | null) ?? null,
      useRawDecisions: normalizeUseRawDecisions(pending.use_raw_decisions ?? null),
      // wizard-warning-ignore-controls §2.1. The `ignored_warnings` column arrives with
      // the finalize-carry task's migration; selecting it here before then would red
      // this DB-bound gallery on every intervening commit. The field feeds ENRICHMENT,
      // which this gallery does not run — its subject is display-state derivation — so
      // the placeholder costs the gallery nothing. Completed with the migration.
      ignoredWarnings: null,
    };
  }

  const manifest = mani as ReadbackRow["manifest"];
  const assembled = assembleStep3Row(
    manifest,
    pending
      ? {
          staged_id: pending.staged_id as string,
          parse_result: pending.parse_result,
          last_finalize_failure_code: (pending.last_finalize_failure_code as string | null) ?? null,
          triggered_review_items: pending.triggered_review_items,
          pull_sheet_override: pending.pull_sheet_override,
        }
      : null,
    [], // no public.shows candidates seeded — every variant stays on the linkedShow:null path
    staged,
    ingestion
      ? { id: ingestion.id as string, code: (ingestion.last_error_code as string) ?? null }
      : undefined,
    seeded.sessionId,
  );
  return { manifest, parsedTitle, assembled };
}

test("six variants derive the matrix's states through the real assembly path", async () => {
  const byVariant = new Map<string, ReadbackRow>();
  for (const row of seeded.rows) byVariant.set(row.variant, await readBack(row));

  for (const row of seeded.rows) {
    const read = byVariant.get(row.variant);
    if (!read) throw new Error(`no readback for ${row.variant}`);
    // Assert the field the UI consumes (Step3SheetCard reads row.displayState),
    // NOT a re-derivation — a mutant stamping the wrong displayState with
    // correct inputs must fail.
    expect(read.assembled.displayState, row.variant).toBe(EXPECTED[row.variant]);
    if (row.variant === "needs_a_look") {
      expect(nonAmbiguityGapTotal(read.assembled)).toBeGreaterThan(0);
    }
    if (row.variant === "ready") {
      // The plain ready card must NOT be a warn card, else the gallery renders
      // two needs-a-look variants and zero clean ones.
      expect(nonAmbiguityGapTotal(read.assembled)).toBe(0);
    }
    if (row.variant === "blocking") {
      expect(read.assembled.pendingIngestionId).toBeTruthy();
      expect(read.assembled.errorCode).toBe("STAGED_PARSE_FAILED");
    } else {
      // Only variant 5 seeds a pending_ingestions row; the blocking card's
      // HardFailedActions/HelpAffordance render off pendingIngestionId.
      expect(read.assembled.pendingIngestionId, row.variant).toBeUndefined();
    }
  }

  // Completeness against AC1 (not subset-vacuous).
  expect(seeded.rows).toHaveLength(6);
  expect(new Set(seeded.rows.map((r) => r.variant))).toEqual(
    new Set(["ready", "needs_a_look", "demoted_rescan", "no_details", "blocking", "set_aside"]),
  );
  expect(new Set(seeded.rows.map((r) => r.driveFileId)).size).toBe(6);

  // Variants 1-3 render the parsed show title (Step3SheetCard.tsx:497 prefers
  // pr.show.title); variants 4-6 fall back to the manifest name.
  const parsedTitles = ["ready", "needs_a_look", "demoted_rescan"].map(
    (v) => byVariant.get(v)?.parsedTitle,
  );
  expect(parsedTitles.every((t) => typeof t === "string" && t.length > 0)).toBe(true);
  expect(new Set(parsedTitles).size).toBe(3);
  const manifestNames = ["no_details", "blocking", "set_aside"].map(
    (v) => byVariant.get(v)?.manifest.name,
  );
  expect(manifestNames.every((n) => typeof n === "string" && n.length > 0)).toBe(true);
  expect(new Set(manifestNames).size).toBe(3);
}, 120_000);

test("seed mutations hold the per-show advisory lock (behavioral, advisory-lock.test.ts:50 pattern)", async () => {
  // SAME local database as every other gallery consumer (plan R4 P1):
  // galleryDatabaseUrl ignores TEST_DATABASE_URL and is loopback-guarded, so
  // probe and holder cannot diverge.
  const probe = postgres(galleryDatabaseUrl(), { max: 1 });
  let probeRuns = 0;
  try {
    // The hook fires INSIDE the seed transaction for the blocking variant
    // (pending_syncs + manifest + pending_ingestions DML) AND inside its
    // cleanup transaction (the matching deletes).
    await seedOneVariantWithHook("blocking", async (driveFileId: string) => {
      probeRuns += 1;
      const got = await probe.begin(async (tx) => {
        const [tryRow] = await tx`
          select pg_try_advisory_xact_lock(hashtext(${"show:" + driveFileId})) as got`;
        return tryRow?.got === true; // noUncheckedIndexedAccess: tryRow may be undefined
      });
      expect(got).toBe(false); // competing try-lock refused while the holder lives

      const holders = await probe`
        with k as (
          select hashtext(${"show:" + driveFileId})::bigint as kb
        ),
        expected as (
          select ((kb >> 32) & x'FFFFFFFF'::bigint)::oid as expected_classid,
                 (kb & x'FFFFFFFF'::bigint)::oid         as expected_objid
            from k
        )
        select count(*)::int as n
          from pg_locks, expected
         where locktype = 'advisory'
           and mode = 'ExclusiveLock'
           and granted = true
           and classid = expected.expected_classid
           and objid = expected.expected_objid
           and objsubid = 1`;
      expect(holders[0]?.n).toBe(1); // exactly one matching GRANTED holder
    });
  } finally {
    await probe.end();
  }
  // Both windows observed — a helper that stopped locking cleanup would
  // otherwise pass on the seed observation alone.
  expect(probeRuns).toBe(2);
}, 120_000);
