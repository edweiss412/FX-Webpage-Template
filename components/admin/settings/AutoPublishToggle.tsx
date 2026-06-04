"use client";

/**
 * components/admin/settings/AutoPublishToggle.tsx (M12.2 Phase B2 Task 8.1 — spec §4)
 *
 * The "Auto-publish clean new shows" toggle in the settings Preferences area.
 * It reflects `app_settings.auto_publish_clean_first_seen` (read server-side and
 * handed in as `initial`) and flips it through the admin-gated `setAutoPublish`
 * server action.
 *
 * Behavior:
 *   - on=true  → clean brand-new sheets auto-publish (amendment-9 default).
 *   - on=false → renders the approval-wait explainer ("new shows wait for your
 *     approval before going live"); a clean first-seen sheet stages for review
 *     (the OFF path the action persists; §4.3).
 *   - infra_error (the settings read failed) → DEGRADED: the control is rendered
 *     disabled and reports OFF (aria-checked=false) so it never silently shows a
 *     wrong/falsely-ON state; a short note prompts a refresh. We do NOT write in
 *     this state (there is no trustworthy current value to flip from).
 *
 * React-19 dispatch safety (the B1 revoke-hang lesson): the switch is the form
 * SUBMITTER. It disables ONLY on useFormStatus().pending — NEVER synchronously
 * in its own onClick — a self-disabling submit cancels the React 19 form-action
 * dispatch (0 POSTs, stranded on pending). The desired next value rides a hidden
 * input so the server action knows where to flip to. On a successful result the
 * page revalidates (the action calls revalidatePath); router.refresh() ensures
 * the client tree re-reads the new server-rendered `initial`.
 *
 * No toast (none exists in the app) — the state change is the confirmation.
 */
import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";

export type AutoPublishInitial =
  | { kind: "value"; on: boolean }
  | { kind: "infra_error" };

export type SetAutoPublishResult = { ok: true } | { ok: false };

export type AutoPublishToggleProps = {
  /** Server-read current value (or an infra_error from the settings data load). */
  initial: AutoPublishInitial;
  /** Admin-gated server action: flips `app_settings.auto_publish_clean_first_seen`. */
  setAutoPublish: (next: boolean) => Promise<SetAutoPublishResult>;
  /** Leading lucide icon for the grouped-card row (M12.3 item 7). */
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
};

export function AutoPublishToggle({ initial, setAutoPublish, icon: Icon }: AutoPublishToggleProps) {
  const router = useRouter();
  const degraded = initial.kind === "infra_error";
  // Degraded reports OFF (never a silent falsely-ON state). A healthy read uses
  // its real boolean.
  const on = initial.kind === "value" ? initial.on : false;

  return (
    <div
      data-testid="auto-publish-setting-row"
      className="flex items-start justify-between gap-3 p-4"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon ? (
          <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-subtle" />
        ) : null}
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text-strong">
            Auto-publish clean new shows
          </h3>
          <p className="mt-1 max-w-prose text-sm text-text-subtle">
            Publish brand-new sheets automatically when they parse with no
            warnings. You can still undo within 24 hours.
          </p>
          {!on && !degraded ? (
            <p
              data-testid="auto-publish-off-explainer"
              className="mt-2 max-w-prose text-sm text-text-subtle"
            >
              Off: new shows wait for your approval before going live.
              You&rsquo;ll review each one in the inbox and publish when
              you&rsquo;re ready.
            </p>
          ) : null}
          {degraded ? (
            <p
              data-testid="auto-publish-degraded"
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
          const result = await setAutoPublish(!on);
          if (result.ok) router.refresh();
        }}
        className="shrink-0 self-center"
      >
        <SwitchButton on={on} disabled={degraded} />
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
function SwitchButton({ on, disabled }: { on: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-busy={pending}
      aria-label="Auto-publish clean new shows"
      data-testid="auto-publish-toggle"
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
