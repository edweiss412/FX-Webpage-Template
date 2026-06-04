"use client";

/**
 * components/admin/settings/NotifyToggle.tsx (M12.2 Phase B3 Task 6.2 — spec §7.2)
 *
 * The two notification Preferences toggles ("Alert me about sync problems",
 * "Daily review digest"). Structurally identical to AutoPublishToggle — one
 * parameterized component (copy + action + testId) rather than two near-duplicate
 * files. Each reflects its `app_settings` boolean (read server-side, handed in as
 * `initial`) and flips it through an admin-gated server action.
 *
 * Behavior:
 *   - on=true / on=false → the switch reports that state (aria-checked).
 *   - infra_error (the settings read failed) → DEGRADED: the control is rendered
 *     disabled and reports OFF (aria-checked=false) so it never silently shows a
 *     wrong/falsely-ON state; a short note prompts a refresh. We do NOT write in
 *     this state (there is no trustworthy current value to flip from).
 *
 * React-19 dispatch safety (the B1 revoke-hang lesson): the switch is the form
 * SUBMITTER. It disables ONLY on useFormStatus().pending — NEVER synchronously in
 * its own onClick — a self-disabling submit cancels the React 19 form-action
 * dispatch (0 POSTs, stranded on pending). On a successful result the action
 * revalidates and router.refresh() re-reads the new server-rendered `initial`.
 *
 * No toast (none exists in the app) — the state change is the confirmation.
 */
import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";

export type NotifyToggleInitial =
  | { kind: "value"; on: boolean }
  | { kind: "infra_error" };

export type NotifyToggleResult = { ok: true } | { ok: false };

export type NotifyToggleProps = {
  /** Stable test/DOM id base, e.g. "sync-problems" → "sync-problems-toggle". */
  testId: string;
  title: string;
  description: string;
  /** Accessible name for the switch (matches the visible title). */
  ariaLabel: string;
  /** Server-read current value (or an infra_error from the settings data load). */
  initial: NotifyToggleInitial;
  /** Admin-gated server action that flips the underlying app_settings boolean. */
  action: (next: boolean) => Promise<NotifyToggleResult>;
  /** Leading lucide icon for the grouped-card row (M12.3 item 7). */
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
};

export function NotifyToggle({
  testId,
  title,
  description,
  ariaLabel,
  initial,
  action,
  icon: Icon,
}: NotifyToggleProps) {
  const router = useRouter();
  const degraded = initial.kind === "infra_error";
  // Degraded reports OFF (never a silent falsely-ON state). A healthy read uses
  // its real boolean.
  const on = initial.kind === "value" ? initial.on : false;

  return (
    <div
      data-testid={`${testId}-setting-row`}
      className="flex items-start justify-between gap-3 p-4"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon ? (
          <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-subtle" />
        ) : null}
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text-strong">{title}</h3>
          <p className="mt-1 max-w-prose text-sm text-text-subtle">{description}</p>
          {degraded ? (
            <p
              data-testid={`${testId}-degraded`}
              role="status"
              className="mt-2 w-full max-w-prose rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
            >
              We couldn&rsquo;t read this setting just now. Refresh to try again.
            </p>
          ) : null}
        </div>
      </div>

      <form
        action={async () => {
          const result = await action(!on);
          if (result.ok) router.refresh();
        }}
        className="shrink-0 self-center"
      >
        <SwitchButton on={on} disabled={degraded} ariaLabel={ariaLabel} testId={testId} />
      </form>
    </div>
  );
}

/**
 * Extracted so useFormStatus() runs inside a definite child of the <form>
 * (React 19 requirement). The button is an ARIA switch reflecting `on`; it
 * disables on form-pending (and when degraded), never synchronously in its own
 * onClick.
 */
function SwitchButton({
  on,
  disabled,
  ariaLabel,
  testId,
}: {
  on: boolean;
  disabled: boolean;
  ariaLabel: string;
  testId: string;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-busy={pending}
      aria-label={ariaLabel}
      data-testid={`${testId}-toggle`}
      disabled={isDisabled}
      className={[
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        on ? "border-accent bg-accent" : "border-border-strong bg-surface-sunken",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "inline-block h-5 w-5 rounded-full bg-bg shadow-(--shadow-tile) transition-transform duration-fast",
          on ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}
