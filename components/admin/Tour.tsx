/**
 * components/admin/Tour.tsx (M10 §B Task 10.9 / Phase 3 / Cluster I-6)
 *
 * Spec §9.0.1 second help affordance. A "Take the tour" link in the
 * dashboard footer that walks Doug through dashboard → per-show parse
 * panel → preview-as via a small inline stepper.
 *
 * Implementation choice: a single client component with a step-array
 * state machine and a backdropped modal. Each step describes a
 * navigation destination but does not auto-navigate — the operator
 * reads, then clicks "Next" or "Open this" (which opens the page in a
 * new tab via the rendered Link). On the last step, "Done" closes the
 * tour and writes a `fxav.tour_completed_at` localStorage marker so
 * the footer's "Take the tour" link reads "Replay tour" on next visit.
 *
 * Build-gated-routes-never-fallback-target: tour step CTAs never link
 * to /admin/dev or any route that is renamed away in production builds
 * (M9 R12-R13 lesson). Targets are the canonical /admin and
 * /admin/show/<slug> URLs.
 */
"use client";

import { useEffect, useState } from "react";

type TourStep = {
  /** Short heading shown at the top of the step body. */
  title: string;
  /** One-paragraph plain-language body. */
  body: string;
};

const STEPS: ReadonlyArray<TourStep> = [
  {
    title: "Your dashboard",
    body:
      "This is your home page. Active shows live in the top list. Anything that needs a second look (a sheet we could not read, or a new sheet we have not seen before) drops into the panel below.",
  },
  {
    title: "Per-show review",
    body:
      "Tap any show title to open its detail page. The top of that page shows anything that needs your attention for that show: re-staged sheets you can apply or discard, alerts, and the last few sync attempts.",
  },
  {
    title: "Preview as a crew member",
    body:
      "On a show page, every crew member has a Preview as link. Open one to see the show exactly as that crew member sees it on their phone. A yellow banner at the top reminds you that you are previewing.",
  },
  {
    title: "If something looks wrong",
    body:
      "Every admin error message has a &ldquo;What does this mean?&rdquo; link. Tap it for a plain-language explanation. If you still need help, use the Report this view button on any page.",
  },
];

const LOCAL_STORAGE_KEY = "fxav.tour_completed_at";

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, new Date().toISOString());
  } catch {
    /* localStorage may be disabled. Silent no-op. */
  }
}

export function Tour() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<string | null>(null);

  useEffect(() => {
    // Hydration-safe read of a client-only persistence store: render once
    // with `null` on the server, then sync to the persisted value on
    // mount. The setState-in-effect is intentional: there is no
    // server-side fallback for localStorage, and `useSyncExternalStore`
    // would require subscribing to a non-existent event source for what
    // is a read-once-on-mount value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompleted(readStored());
  }, []);

  // Escape-key closes the modal. Standard WAI-ARIA dialog contract;
  // separately from any focus-trap library, this restores the keyboard
  // exit affordance that aria-modal="true" implies to screen readers.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const triggerLabel = completed === null ? "Take the tour" : "Replay the tour";

  function handleOpen() {
    setStepIndex(0);
    setOpen(true);
  }
  function handleNext() {
    if (isLast) {
      writeStored();
      setCompleted(new Date().toISOString());
      setOpen(false);
      return;
    }
    setStepIndex((n) => n + 1);
  }
  function handlePrev() {
    setStepIndex((n) => Math.max(0, n - 1));
  }
  function handleClose() {
    setOpen(false);
  }

  if (!step) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        data-testid="admin-tour-trigger"
        data-tour-completed={completed === null ? "false" : "true"}
        className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-transparent px-3 text-sm font-medium text-text-subtle underline-offset-4 transition-colors duration-fast hover:text-text-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {triggerLabel}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-tour-heading"
          data-testid="admin-tour-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim p-4"
        >
          <div className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-md border border-border bg-surface p-tile-pad text-text shadow-(--shadow-tile)">
            <div className="flex items-center justify-between">
              <p
                className="text-xs font-medium uppercase text-text-subtle tabular-nums"
                style={{ letterSpacing: "var(--tracking-eyebrow)" }}
                data-testid="admin-tour-step-indicator"
              >
                Step {stepIndex + 1} of {STEPS.length}
              </p>
              <button
                type="button"
                onClick={handleClose}
                data-testid="admin-tour-exit"
                aria-label="Exit tour"
                className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm px-2 text-sm font-medium text-text-subtle transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Close
              </button>
            </div>

            <h2
              id="admin-tour-heading"
              data-testid="admin-tour-title"
              className="text-xl font-semibold text-text-strong"
            >
              {step.title}
            </h2>
            <p
              data-testid="admin-tour-body"
              className="max-w-prose text-base text-text"
            >
              {step.body}
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={isFirst}
                data-testid="admin-tour-prev"
                className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                data-testid="admin-tour-next"
                className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-accent px-4 text-sm font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                {isLast ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
