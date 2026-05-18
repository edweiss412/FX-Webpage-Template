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

function Step2Placeholder() {
  return (
    <section
      data-testid="wizard-step2-placeholder"
      aria-labelledby="wizard-step2-placeholder-heading"
      className="flex flex-col gap-4 rounded-md border border-border bg-surface p-tile-pad"
    >
      <h2
        id="wizard-step2-placeholder-heading"
        className="text-xl font-semibold text-text-strong"
      >
        Verify your folder
      </h2>
      <p className="max-w-prose text-base text-text-subtle">
        Step 2 is coming in the next phase. The wizard will ask for the folder
        URL, confirm read access, and show what is inside. For now, click
        &quot;Start over&quot; to return to step 1.
      </p>
    </section>
  );
}

function Step3Placeholder() {
  return (
    <section
      data-testid="wizard-step3-placeholder"
      aria-labelledby="wizard-step3-placeholder-heading"
      className="flex flex-col gap-4 rounded-md border border-border bg-surface p-tile-pad"
    >
      <h2
        id="wizard-step3-placeholder-heading"
        className="text-xl font-semibold text-text-strong"
      >
        Review your sheets
      </h2>
      <p className="max-w-prose text-base text-text-subtle">
        Step 3 is coming in the next phase. The wizard will list every sheet
        the scan found and let you approve or skip each one.
      </p>
    </section>
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
          {step === 2 ? <Step2Placeholder /> : null}
          {step === 3 ? <Step3Placeholder /> : null}
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
