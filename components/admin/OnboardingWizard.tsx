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

type OnboardingWizardProps = {
  settings: AppSettingsRow;
  searchParams: { step?: string };
};

type ServiceAccountResult =
  | { ok: true; email: string }
  | { ok: false };

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

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  return (
    <nav
      aria-label="Onboarding progress"
      data-testid="wizard-step-indicator"
      className="flex items-center gap-3"
    >
      {[1, 2, 3].map((n) => {
        const isActive = n === step;
        return (
          <span
            key={n}
            data-testid={`wizard-step-indicator-${n}`}
            aria-current={isActive ? "step" : undefined}
            className={[
              "flex size-7 items-center justify-center rounded-pill text-xs font-semibold tabular-nums",
              isActive
                ? "bg-accent text-accent-text"
                : "bg-surface-sunken text-text-subtle",
            ].join(" ")}
          >
            {n}
          </span>
        );
      })}
      <span className="sr-only">Step {step} of 3</span>
    </nav>
  );
}

type Step3FetchResult =
  | { kind: "ok"; rows: Step3Row[]; allResolved: boolean }
  | { kind: "infra_error"; message: string };

async function fetchStep3Data(wizardSessionId: string): Promise<Step3FetchResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `supabase client failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const manifestQuery = await supabase
    .from("onboarding_scan_manifest")
    .select("drive_file_id, drive_file_name, status")
    .eq("wizard_session_id", wizardSessionId)
    .order("drive_file_id", { ascending: true });
  if (manifestQuery.error) {
    return {
      kind: "infra_error",
      message: `onboarding_scan_manifest query failed: ${manifestQuery.error.message}`,
    };
  }

  const pendingSyncsQuery = await supabase
    .from("pending_syncs")
    .select("staged_id, drive_file_id, parse_result")
    .eq("wizard_session_id", wizardSessionId);
  if (pendingSyncsQuery.error) {
    return {
      kind: "infra_error",
      message: `pending_syncs query failed: ${pendingSyncsQuery.error.message}`,
    };
  }

  const pendingIngestionsQuery = await supabase
    .from("pending_ingestions")
    .select("id, drive_file_id, last_error_code")
    .eq("wizard_session_id", wizardSessionId);
  if (pendingIngestionsQuery.error) {
    return {
      kind: "infra_error",
      message: `pending_ingestions query failed: ${pendingIngestionsQuery.error.message}`,
    };
  }

  const stagedByDfid = new Map<string, { stagedId: string; title: string | null }>();
  for (const ps of pendingSyncsQuery.data ?? []) {
    const driveFileId = ps.drive_file_id as string;
    const parseResult = ps.parse_result as { show?: { title?: string | null } } | null;
    stagedByDfid.set(driveFileId, {
      stagedId: ps.staged_id as string,
      title: parseResult?.show?.title ?? null,
    });
  }

  const ingestionByDfid = new Map<string, { id: string; code: string | null }>();
  for (const pi of pendingIngestionsQuery.data ?? []) {
    ingestionByDfid.set(pi.drive_file_id as string, {
      id: pi.id as string,
      code: (pi.last_error_code as string | null) ?? null,
    });
  }

  const rows: Step3Row[] = (manifestQuery.data ?? []).map((m) => {
    const driveFileId = m.drive_file_id as string;
    const status = m.status as Step3ManifestStatus;
    const driveFileName = (m.drive_file_name as string | null) ?? null;
    const base: Step3Row = { driveFileId, status, driveFileName };
    if (status === "staged") {
      const staged = stagedByDfid.get(driveFileId);
      if (staged?.title) return { ...base, stagedShowTitle: staged.title };
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

  const allResolved =
    rows.length > 0 &&
    rows.every(
      (r) =>
        r.status === "applied" ||
        r.status === "defer_until_modified" ||
        r.status === "permanent_ignore" ||
        r.status === "skipped_non_sheet",
    );

  return { kind: "ok", rows, allResolved };
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
          The admin database query failed. Refresh in a moment. If this keeps
          happening, contact the developer.
        </p>
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-section-gap">
      <Step3Review wizardSessionId={wizardSessionId} rows={result.rows} />
      {result.rows.length > 0 ? (
        <FinalizeButton
          wizardSessionId={wizardSessionId}
          disabled={!result.allResolved}
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
      <h2
        id="wizard-operator-error-heading"
        className="text-lg font-semibold"
      >
        Setup is paused
      </h2>
      <p className="max-w-prose text-base">{entry.dougFacing}</p>
      {entry.helpfulContext ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            What does this mean?
          </summary>
          <p className="mt-2 max-w-prose">{entry.helpfulContext}</p>
        </details>
      ) : null}
    </section>
  );
}

export async function OnboardingWizard({
  settings,
  searchParams,
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

  return (
    <div
      data-testid="onboarding-wizard"
      className="mx-auto flex max-w-2xl flex-col gap-section-gap"
    >
      <StepIndicator step={step} />

      {service.ok ? (
        <>
          {step === 1 ? <Step1Share serviceAccountEmail={service.email} /> : null}
          {step === 2 ? <Step2Verify /> : null}
          {step === 3 && settings.pending_wizard_session_id !== null ? (
            <Step3Container wizardSessionId={settings.pending_wizard_session_id} />
          ) : null}
          {step === 3 && settings.pending_wizard_session_id === null ? (
            <section
              data-testid="wizard-step3-no-session"
              className="flex flex-col gap-3 rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
            >
              <p className="font-semibold text-text-strong">
                Nothing scanned yet.
              </p>
              <p>
                Go back to step 2 and verify your folder. Once the scan
                finishes we will list every sheet here for review.
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
