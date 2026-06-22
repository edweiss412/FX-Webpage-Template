"use client";

/**
 * components/admin/wizard/Step1Share.tsx (M10 §B Task 10.2 / Phase 1)
 *
 * Wizard step 1 — "Share your show folder." Renders the spec §9.0 step-1
 * microcopy verbatim, displays the service-account email with a copy
 * affordance, exposes the "What's this email?" disclosure, and links
 * forward to step 2 (`/admin?step=2`).
 *
 * Client Component — owns the copy-to-clipboard interaction and the
 * "Copied!" feedback state. The service-account email is supplied by
 * the server-side wizard shell (OnboardingWizard) which is responsible
 * for resolving it from `GOOGLE_SERVICE_ACCOUNT_JSON`; this component
 * trusts the prop to be a non-empty email.
 *
 * Spec contract:
 *   §9.0 step 1 four numbered prompts are rendered verbatim.
 *   The advance affordance reads "I’ve shared the folder."
 *   No raw error codes are surfaced (invariant 5).
 *
 * DESIGN.md tokens:
 *   - --color-surface, --color-border, --color-text, --color-text-subtle,
 *     --color-accent-on-bg used through Tailwind utilities.
 *   - --spacing-tap-min (44px) on every interactive element.
 *   - --radius-md (12px) on the email card; --radius-sm on the copy
 *     button.
 *   - Curly apostrophes throughout (impeccable typography contract).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { HelpTooltip } from "@/components/admin/HelpTooltip";

type Step1ShareProps = {
  serviceAccountEmail: string;
};

const COPY_FEEDBACK_RESET_MS = 2200;

export function Step1Share({ serviceAccountEmail }: Step1ShareProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(serviceAccountEmail);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_RESET_MS);
    } catch {
      // Clipboard refusal is benign here — Doug can still select-and-copy by
      // hand. Don't surface a raw error; the email is already visible.
      setCopied(false);
    }
  }, [serviceAccountEmail]);

  return (
    <section
      data-testid="wizard-step1"
      aria-labelledby="wizard-step1-heading"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <p
          data-testid="wizard-step1-eyebrow"
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Step 1 of 3
        </p>
        <div className="flex items-center gap-2">
          <h2 id="wizard-step1-heading" className="text-2xl font-semibold text-text-strong">
            Share your show folder
          </h2>
          <HelpTooltip
            label="Help: Share your show folder"
            testId="help-affordance--wizard-step1--tooltip"
          >
            <p>
              The app reads your show sheets straight from Google Drive. You pick one folder and
              share it with the email we display below. Anything you drop into that folder appears
              here in a few minutes; nothing else on your Drive is touched.
            </p>
            <p className="mt-2">
              <a
                href="/help/admin/onboarding-wizard#service-account"
                aria-label="Learn more about sharing your show folder"
                className="inline-flex min-h-tap-min items-center text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Learn more →
              </a>
            </p>
          </HelpTooltip>
        </div>
        <p className="max-w-prose text-base text-text-subtle">
          The app reads sheets out of one Google Drive folder you pick. Share that folder with the
          email below so the app can see what is inside.
        </p>
      </header>

      <ol data-testid="wizard-step1-steps" className="flex flex-col gap-4 text-base text-text">
        <li className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-sm font-semibold text-text-subtle tabular-nums"
          >
            1
          </span>
          <span>
            In Google Drive, find the folder where you keep your show sheets (or make a new one).
          </span>
        </li>
        <li className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-sm font-semibold text-text-subtle tabular-nums"
          >
            2
          </span>
          <span>Click &quot;Share&quot; on the folder.</span>
        </li>
        <li className="flex flex-col gap-3">
          <div className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-sm font-semibold text-text-subtle tabular-nums"
            >
              3
            </span>
            <span>Paste this email and give it Viewer access:</span>
          </div>
          <div className="ml-9 flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad shadow-(--shadow-tile) sm:flex-row sm:items-center sm:gap-4">
            <code
              data-testid="wizard-step1-service-account-email"
              className="break-all text-sm font-medium tabular-nums text-text-strong sm:flex-1 sm:text-base"
            >
              {serviceAccountEmail}
            </code>
            <button
              type="button"
              data-testid="wizard-step1-copy-email-button"
              onClick={handleCopy}
              aria-label={`Copy ${serviceAccountEmail} to clipboard`}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <span
              role="status"
              aria-live="polite"
              data-testid="wizard-step1-copy-feedback"
              className="text-xs text-text-subtle sm:min-w-[6ch]"
            >
              {copied ? "Copied to clipboard" : ""}
            </span>
          </div>
        </li>
        <li className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-sm font-semibold text-text-subtle tabular-nums"
          >
            4
          </span>
          <span>Come back here and click &quot;I&rsquo;ve shared the folder.&quot;</span>
        </li>
      </ol>

      <details
        data-testid="wizard-step1-explainer"
        className="rounded-md border border-border bg-surface-sunken p-tile-pad"
      >
        <summary
          data-testid="wizard-step1-explainer-summary"
          className="cursor-pointer text-sm font-semibold text-text-strong"
        >
          What&rsquo;s this email?
        </summary>
        <p className="mt-3 max-w-prose text-sm text-text-subtle">
          It is the app&rsquo;s identity inside your Drive. It can only see what you share with it,
          and only the folder you choose. Removing the share at any time revokes the app&rsquo;s
          access.
        </p>
      </details>

      <div className="flex justify-end">
        <Link
          data-testid="wizard-step1-advance"
          href="/admin?step=2"
          className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          I&rsquo;ve shared the folder
        </Link>
      </div>
    </section>
  );
}
