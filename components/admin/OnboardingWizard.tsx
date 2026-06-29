/**
 * components/admin/OnboardingWizard.tsx (M10 §B Task 10.2 / Phase 1)
 *
 * Server-side wizard shell. Resolves the service-account email from
 * `GOOGLE_SERVICE_ACCOUNT_JSON`, picks the current step from URL
 * `?step=N` (whitelisted to 1 / 2 / 3 with fallback to 1), and renders
 * the matching step body plus the wizard chrome (step indicator,
 * "Start over" form bound to startOverServerAction).
 *
 * Phase 1 ships only Step 1 (<Step1Share>). Step 2 and Step 3 render
 * Phase 1 placeholders so the URL transitions exist before the real
 * step components land (Phase 2, after §A Pin-2).
 *
 * When the service-account credentials cannot be parsed, the wizard
 * renders the §12.4-cataloged ONBOARDING_OPERATOR_ERROR Doug-facing
 * copy (via `messageFor`, never a raw code) and keeps the Start Over
 * affordance available so the operator has a recovery path.
 *
 * Per spec §9.0:
 *   - "Pre-onboarding 'Start over' affordance. Every wizard step (1, 2,
 *     3) — and `/admin` itself when in wizard-mode — renders a small
 *     'Start over' link/button (admin-gated)."
 *   - The shell does NOT compose URLs to build-gated routes (memory
 *     `feedback_build_gated_routes_never_fallback_target`).
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { AppSettingsRow } from "@/lib/onboarding/sessionLifecycle";
import { startOverServerAction } from "@/lib/onboarding/serverActions";
import { messageFor } from "@/lib/messages/lookup";
import { Step1Share } from "@/components/admin/wizard/Step1Share";
import { Step2Verify } from "@/components/admin/wizard/Step2Verify";
import {
  Step3Review,
  type Step3Row,
  type Step3ManifestStatus,
} from "@/components/admin/wizard/Step3Review";
import { FinalizeButton } from "@/components/admin/FinalizeButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { driveFolderUrl } from "@/lib/drive/driveFolderUrl";
import type { ParseResult } from "@/lib/parser/types";
import { buildAdminAgendaPreview, type AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";

type OnboardingWizardProps = {
  settings: AppSettingsRow;
  searchParams: { step?: string };
  // True iff the active wizard session has reviewable scan results (the
  // onboarding_scan_manifest has rows). Computed server-side by the /admin
  // dispatcher via readScanManifestCount. This is the honest "a scan produced
  // something to review" signal — NOT `pending_wizard_session_id !== null`,
  // which is also true after Start Over / a failed scan with an empty manifest.
  // Defaults to false so a caller (or test) that omits it never advertises a
  // forward/resume affordance that would land on an empty Step 3.
  hasReviewableScan?: boolean;
};

type ServiceAccountResult = { ok: true; email: string } | { ok: false };

function readServiceAccountEmail(): ServiceAccountResult {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return { ok: false };
  try {
    const parsed = JSON.parse(raw) as { client_email?: unknown };
    if (typeof parsed.client_email === "string" && parsed.client_email.length > 0) {
      return { ok: true, email: parsed.client_email };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

function pickStep(hint: string | undefined): 1 | 2 | 3 {
  if (hint === "2") return 2;
  if (hint === "3") return 3;
  return 1;
}

function StartOverForm() {
  return (
    <form
      data-testid="wizard-start-over-form"
      data-action="startOverServerAction"
      action={startOverServerAction}
      className="flex justify-start"
    >
      <button
        type="submit"
        data-testid="wizard-start-over-button"
        className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-transparent px-3 text-sm font-medium text-text-subtle underline-offset-4 transition-colors duration-fast hover:text-text-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        Start over
      </button>
    </form>
  );
}

function StepIndicator({ step, maxReachedStep }: { step: 1 | 2 | 3; maxReachedStep: 1 | 2 | 3 }) {
  // Pill shape shared by all three states; focus ring shared by the two link
  // states (a plain span is not focusable, so it does not carry the ring).
  const base =
    "flex size-7 items-center justify-center rounded-pill text-xs font-semibold tabular-nums transition-colors duration-fast";
  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
  return (
    <nav
      aria-label="Onboarding progress"
      data-testid="wizard-step-indicator"
      className="flex items-center gap-3"
    >
      {([1, 2, 3] as const).map((n) => {
        const isActive = n === step;
        // Reachable = step ≤ the furthest step the operator has actually reached.
        // `maxReachedStep` is derived from server progress (a reserved scan
        // session makes Step 3 reachable), NOT merely the current URL step — so
        // hitting "Back" to Step 2 leaves Step 3's pill a real, navigable <Link>
        // (the forward path). Pills beyond the reached frontier stay plain,
        // non-interactive text — no href, so they cannot be tabbed to or clicked.
        const isVisited = n <= maxReachedStep;
        // Direction-aware label: a reachable pill ahead of the current step is
        // "Go to" (forward), behind it is "Go back to".
        const navLabel = n < step ? `Go back to step ${n}` : `Go to step ${n}`;
        if (isVisited) {
          return (
            <Link
              key={n}
              href={`/admin?step=${n}`}
              data-testid={`wizard-step-indicator-${n}`}
              aria-current={isActive ? "step" : undefined}
              aria-label={isActive ? `Step ${n}, current step` : navLabel}
              className={[
                base,
                focusRing,
                isActive
                  ? "bg-accent text-accent-text"
                  : "bg-surface-sunken text-text-subtle hover:text-text-strong",
              ].join(" ")}
            >
              {n}
            </Link>
          );
        }
        return (
          <span
            key={n}
            data-testid={`wizard-step-indicator-${n}`}
            aria-disabled="true"
            className={[base, "bg-surface-sunken text-text-faint"].join(" ")}
          >
            {n}
          </span>
        );
      })}
      <span className="sr-only">Step {step} of 3</span>
    </nav>
  );
}

// Non-destructive "Back" affordance (Task 5): a plain <Link> to the previous
// step, matching the existing forward `?step=` pattern (Step2Verify's "Continue
// to Step 3" link). Step 1 has no Back, so this renders only for steps 2 and 3.
// SAFETY: mounting `?step=N-1` is read-only. Step2Verify (the ?step=2 body)
// fires its scan POST ONLY from the form's onSubmit handler, never on mount, so
// Back cannot re-trigger a scan or orphan the wizard session.
function BackLink({ step }: { step: 2 | 3 }) {
  return (
    <Link
      href={`/admin?step=${step - 1}`}
      data-testid="wizard-back-link"
      className="inline-flex min-h-tap-min items-center gap-1 rounded-sm px-2 text-sm font-medium text-text-subtle transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      Back
    </Link>
  );
}

type Step3FetchResult =
  | { kind: "ok"; rows: Step3Row[]; finishable: boolean }
  | { kind: "infra_error"; message: string };

// FIX 1 (CRITICAL): a "clean review row" is one that renders as the publish
// CARD — manifest 'staged' (unchecked) OR 'applied' (checked). Both carry the
// surviving pending_syncs parse preview; an 'applied' row keeps its card +
// checked, individually-uncheckable checkbox so per-row uncheck survives a
// router.refresh(). 'applied' is NOT a blocking status.
const isCleanReviewRow = (s: Step3ManifestStatus): boolean => s === "staged" || s === "applied";

// Exported for tests/admin/_metaInfraContract.test.ts — the helper is the
// subject row of the §B Supabase call-boundary registry for the Step 3
// wizard surface (AGENTS.md §1.9). Production callers use Step3Container.
export async function fetchStep3Data(wizardSessionId: string): Promise<Step3FetchResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `supabase client failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // AGENTS.md §1.9: every Supabase await wraps in try/catch so a thrown
  // infra fault (auth expiration, network reset, RLS reject mid-query)
  // surfaces as the same typed `infra_error` result as the returned
  // `.error` branch — never as an uncaught framework exception.
  let manifestRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const q = await supabase
      .from("onboarding_scan_manifest")
      .select("drive_file_id, name, status")
      .eq("wizard_session_id", wizardSessionId)
      .order("drive_file_id", { ascending: true });
    if (q.error) {
      return {
        kind: "infra_error",
        message: `onboarding_scan_manifest query failed: ${q.error.message}`,
      };
    }
    manifestRows = (q.data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `onboarding_scan_manifest query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let pendingSyncsRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const q = await supabase
      .from("pending_syncs")
      .select(
        "staged_id, drive_file_id, staged_modified_time, parse_result, last_finalize_failure_code",
      )
      .eq("wizard_session_id", wizardSessionId);
    if (q.error) {
      return {
        kind: "infra_error",
        message: `pending_syncs query failed: ${q.error.message}`,
      };
    }
    pendingSyncsRows = (q.data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_syncs query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let pendingIngestionsRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const q = await supabase
      .from("pending_ingestions")
      .select("id, drive_file_id, last_error_code")
      .eq("wizard_session_id", wizardSessionId);
    if (q.error) {
      return {
        kind: "infra_error",
        message: `pending_ingestions query failed: ${q.error.message}`,
      };
    }
    pendingIngestionsRows = (q.data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_ingestions query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const stagedByDfid = new Map<
    string,
    {
      stagedId: string;
      title: string | null;
      parseResult: ParseResult | null;
      adminAgendaPreview: AdminAgendaItem[];
      agendaStateKey: string;
      lastFinalizeFailureCode: string | null;
    }
  >();
  for (const ps of pendingSyncsRows) {
    const driveFileId = ps.drive_file_id as string;
    // §7.1: thread the FULL parse preview, not just the title. The jsonb is
    // untyped at the call boundary; coerce defensively to `ParseResult | null`
    // (a non-object/absent value → null) so the card can render summary +
    // breakdown without re-querying.
    const rawParse = ps.parse_result;
    const parseResult =
      rawParse !== null && typeof rawParse === "object" ? (rawParse as ParseResult) : null;
    const stagedId = ps.staged_id as string;
    const stagedModifiedTime = (ps.staged_modified_time as string | null) ?? null;
    // Task 11: baseline (note-only) agenda preview. Build with NO opts → every
    // item is note-only (`block: null`, `href: null`). A null/absent agenda_links
    // (partial/malformed jsonb) guards to `[]`.
    const agendaLinks = parseResult?.show?.agenda_links;
    const adminAgendaPreview = Array.isArray(agendaLinks)
      ? buildAdminAgendaPreview(agendaLinks)
      : [];
    // Task 11: stable identity that changes when the staged row is rescanned.
    const agendaStateKey = `${wizardSessionId}:${stagedId}:${stagedModifiedTime}`;
    stagedByDfid.set(driveFileId, {
      stagedId,
      title: parseResult?.show?.title ?? null,
      parseResult,
      adminAgendaPreview,
      agendaStateKey,
      // Task 5b (spec §6.1): the demotion code drives the card's dirty re-scan state.
      lastFinalizeFailureCode: (ps.last_finalize_failure_code as string | null) ?? null,
    });
  }

  const ingestionByDfid = new Map<string, { id: string; code: string | null }>();
  for (const pi of pendingIngestionsRows) {
    ingestionByDfid.set(pi.drive_file_id as string, {
      id: pi.id as string,
      code: (pi.last_error_code as string | null) ?? null,
    });
  }

  const rows: Step3Row[] = manifestRows.map((m) => {
    const driveFileId = m.drive_file_id as string;
    const status = m.status as Step3ManifestStatus;
    const driveFileName = (m.name as string | null) ?? null;
    const base: Step3Row = { driveFileId, status, driveFileName };
    if (isCleanReviewRow(status)) {
      // FIX 1 (CRITICAL): a checked card flips the manifest status
      // 'staged'→'applied', but the pending_syncs row SURVIVES approval (it is
      // deleted only at finalize). Both 'staged' (unchecked) and 'applied'
      // (checked) clean rows render as the SAME publish card, so BOTH must carry
      // the full ParseResult — gating on 'staged' alone made a refreshed applied
      // row lose its preview + checkbox and collapse to a dead "Applied" badge.
      const staged = stagedByDfid.get(driveFileId);
      if (staged) {
        // §7.1: a clean row carries its full ParseResult (may be null if the
        // jsonb was absent/malformed). Title is the back-compat summary field.
        // Task 11: carry the baseline (note-only) agenda preview + the stable
        // agendaStateKey so the card has note-only items immediately.
        // Task 5b: thread the demotion code so a dirty re-scan row renders distinctly.
        const withParse: Step3Row = {
          ...base,
          parseResult: staged.parseResult,
          adminAgendaPreview: staged.adminAgendaPreview,
          agendaStateKey: staged.agendaStateKey,
          lastFinalizeFailureCode: staged.lastFinalizeFailureCode,
        };
        if (staged.title) return { ...withParse, stagedShowTitle: staged.title };
        return withParse;
      }
    }
    if (status === "hard_failed") {
      const ingestion = ingestionByDfid.get(driveFileId);
      if (ingestion) {
        const withId: Step3Row = { ...base, pendingIngestionId: ingestion.id };
        if (ingestion.code !== null) return { ...withId, errorCode: ingestion.code };
        return withId;
      }
    }
    return base;
  });

  // §7.3: the UI half of the `finishable` predicate. A row blocks finish iff
  // it is in a genuine error/conflict state needing acknowledgement. The
  // canonical blocking set is the identical 3-element set the server gate
  // (Task B1) uses; a clean `staged` row (unchecked → Held) and `applied`
  // (checked) are NOT blocking. An empty list is finishable.
  const BLOCKING = new Set(["hard_failed", "live_row_conflict", "discard_retryable"]);
  // A row demoted by a per-sheet re-scan carries a non-null lastFinalizeFailureCode
  // (e.g. RESCAN_REVIEW_REQUIRED) while its manifest status is the non-blocking
  // 'staged'. The server final-CAS gate refuses such a row, so the finish button must
  // also block on it (else the UI enables a finish the server would reject).
  const finishable =
    rows.length === 0 || rows.every((r) => !BLOCKING.has(r.status) && !r.lastFinalizeFailureCode);

  return { kind: "ok", rows, finishable };
}

async function Step3Container({ wizardSessionId }: { wizardSessionId: string }) {
  const result = await fetchStep3Data(wizardSessionId);
  if (result.kind === "infra_error") {
    return (
      <section
        data-testid="wizard-step3-infra-error"
        className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text"
      >
        <p className="font-semibold">We could not load your sheets.</p>
        <p className="text-sm">
          This is usually temporary. Refresh in a moment. If it keeps happening, contact the
          developer.
        </p>
      </section>
    );
  }
  // D5: thread the publish-intent counts into the finish button. publishCount =
  // rows currently checked (status 'applied' → Live); uncheckedCleanCount =
  // clean rows left unchecked (status 'staged' → Held). The label reads
  // "Publish N shows & finish setup" and a soft confirm fires when any clean
  // row is unchecked. Only clean rows participate (blocking rows never count).
  const publishCount = result.rows.filter((r) => r.status === "applied").length;
  const uncheckedCleanCount = result.rows.filter((r) => r.status === "staged").length;

  return (
    <div className="flex flex-col gap-section-gap">
      <Step3Review wizardSessionId={wizardSessionId} rows={result.rows} />
      {result.rows.length > 0 ? (
        <FinalizeButton
          wizardSessionId={wizardSessionId}
          disabled={!result.finishable}
          publishCount={publishCount}
          uncheckedCleanCount={uncheckedCleanCount}
        />
      ) : null}
    </div>
  );
}

function OperatorErrorBlock() {
  const entry = messageFor("ONBOARDING_OPERATOR_ERROR");
  return (
    <section
      data-testid="wizard-operator-error"
      aria-labelledby="wizard-operator-error-heading"
      className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text"
    >
      <h2 id="wizard-operator-error-heading" className="text-lg font-semibold">
        Setup is paused
      </h2>
      <p className="max-w-prose text-base">{entry.dougFacing}</p>
      {entry.helpfulContext ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">What does this mean?</summary>
          <p className="mt-2 max-w-prose">{entry.helpfulContext}</p>
        </details>
      ) : null}
    </section>
  );
}

export async function OnboardingWizard({
  settings,
  searchParams,
  hasReviewableScan = false,
}: OnboardingWizardProps) {
  const service = readServiceAccountEmail();
  const step = pickStep(searchParams.step);

  // Pre-onboarding only. Per spec §9.0:
  //   "After onboarding succeeds the [pre-onboarding 'Start over']
  //    affordance disappears — restart goes through `/admin/settings`
  //    instead."
  // The post-onboarding re-run-setup path uses /admin/settings's
  // Re-run Setup, which calls `rerunSetupServerAction` with the
  // checkpoint-aware suppression gate. Rendering the unconditional
  // `startOverServerAction` here in the re-run-setup window would
  // let a stale tab bypass the suppression and strand
  // `published = false` finalize rows. Gate by `watched_folder_id`
  // so the destructive purge path is available ONLY when no live
  // folder is connected yet.
  const showStartOver = settings.watched_folder_id === null;

  // Back/forward fix (2026-06-26): once a scan has produced reviewable results
  // the operator has reached Step 3, so every step is navigable even after
  // hitting "Back" to Step 2. Reachability is derived from server progress
  // (`hasReviewableScan` = the scan manifest has rows) rather than the current
  // URL step — otherwise Back collapses the forward pills into dead text and
  // strands the operator with no way to return to the review surface. We gate on
  // reviewable rows, NOT `pending_wizard_session_id !== null`: that session id is
  // also non-null after Start Over (rotated) and after a failed/0-sheet scan,
  // states with an EMPTY manifest where a forward pill + a "you already scanned"
  // resume panel would be a lie pointing at an empty Step 3.
  const scanReached = hasReviewableScan;
  const maxReachedStep: 1 | 2 | 3 = scanReached ? 3 : step;

  // Rehydrate Step 2 after a Back: surface the folder the operator already
  // scanned (input pre-fill + a "Continue to Step 3" link) so they need not
  // re-scan to go forward. The canonical folder URL is rebuilt from the
  // persisted Drive folder id and round-trips through the scan route's parser.
  const priorScan = scanReached
    ? {
        folderName: settings.pending_folder_name,
        folderUrl: driveFolderUrl(settings.pending_folder_id),
        folderId: settings.pending_folder_id,
      }
    : undefined;

  // Task 6: Steps 1-2 stay narrow (max-w-2xl); Step 3 widens on desktop so its
  // review cards can lay out in a multi-column grid (the grid itself lives in
  // <Step3Review>). The chrome (stepper, Back, Start over) is left-aligned, so
  // the wider container only meaningfully affects the card area.
  const containerMaxWidth = step === 3 ? "max-w-2xl lg:max-w-6xl" : "max-w-2xl";

  return (
    <div
      data-testid="onboarding-wizard"
      className={`mx-auto flex ${containerMaxWidth} flex-col gap-section-gap`}
    >
      <div className="flex items-center justify-between gap-3">
        <StepIndicator step={step} maxReachedStep={maxReachedStep} />
        {step !== 1 ? <BackLink step={step} /> : null}
      </div>

      {service.ok ? (
        <>
          {step === 1 ? <Step1Share serviceAccountEmail={service.email} /> : null}
          {step === 2 ? <Step2Verify {...(priorScan ? { priorScan } : {})} /> : null}
          {step === 3 && settings.pending_wizard_session_id !== null ? (
            <Step3Container wizardSessionId={settings.pending_wizard_session_id} />
          ) : null}
          {step === 3 && settings.pending_wizard_session_id === null ? (
            <section
              data-testid="wizard-step3-no-session"
              className="flex flex-col gap-3 rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
            >
              <p className="font-semibold text-text-strong">Nothing scanned yet.</p>
              <p>
                Go back to step 2 and verify your folder. Once the scan finishes we will list every
                sheet here for review.
              </p>
            </section>
          ) : null}
        </>
      ) : (
        <OperatorErrorBlock />
      )}

      {showStartOver ? (
        <>
          <hr className="border-border" />
          <StartOverForm />
        </>
      ) : null}
    </div>
  );
}
