"use client";

/**
 * components/admin/settings/DeveloperToggleButton.tsx (developer-tier Task 18 — spec §7)
 *
 * The per-row Developer switch inside AdministratorsSection, visible only to
 * developers (the parent gates on `viewerIsDeveloper`). It promotes/demotes
 * another admin's developer bit through the developer-gated `setDeveloperAction`
 * server action, bound via useActionState. Structurally it mirrors the existing
 * admin switch controls (NotifyToggle / AutoPublishToggle) — an ARIA switch that
 * reflects its server-read `checked` value and flips it on submit.
 *
 * States (spec §13 transition inventory): `off`, `on`, `pending` (optimistic,
 * action in flight — disabled, aria-busy, switch shows the target), `locked`
 * (the actor's OWN row — a disabled indicator; you cannot demote yourself, which
 * the server also refuses). On an error result the optimistic state reverts and
 * the row renders the cataloged getDougFacing copy inline (invariant 5 — never a
 * raw code).
 *
 * React-19 dispatch safety (the B1 revoke-hang lesson): the switch is the form
 * SUBMITTER and disables ONLY on the action's `isPending` — NEVER synchronously
 * in its own onClick (a self-disabling submit cancels the React-19 form-action
 * dispatch). Success revalidates server-side (revalidatePath in the action), so
 * the fresh `checked` flows back down as a prop — no router.refresh() here.
 *
 * Dimensional invariant (spec §13; Tailwind v4 has no default items-stretch): the
 * measured tap target (`data-testid="developer-toggle"`) is the button, sized to
 * the `min-h-tap-min` / `min-w-tap-min` (44px) floor around the 28px visual
 * track. Verified in a real browser by tests/e2e/developer-toggle-layout.spec.ts.
 */
import { useActionState } from "react";
import { Lock } from "lucide-react";
import { getDougFacing } from "@/lib/messages/lookup";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import type { MessageCode } from "@/lib/messages/catalog";
import {
  setDeveloperAction,
  type SetDeveloperActionResult,
} from "@/app/admin/settings/admins/developerActions";

export type DeveloperToggleButtonProps = {
  /** Row email; the subject of the promote/demote. Omitted on the locked variant. */
  email?: string;
  /** Server-read current developer bit for this row. */
  checked: boolean;
  /** The actor's own row — render a static, disabled (locked) indicator. */
  locked?: boolean;
};

/**
 * Map an error result → the cataloged code (invariant 5). Resolved to a copy
 * string via getDougFacing; the code literals never reach user-visible output.
 * `ok` → null (success is an optimistic re-render, no copy).
 */
function errorCopyFor(state: SetDeveloperActionResult | null): string | null {
  if (!state) return null;
  let code: MessageCode | null = null;
  switch (state.kind) {
    case "self_developer_demote_forbidden":
      code = "SELF_DEVELOPER_DEMOTE_FORBIDDEN";
      break;
    case "infra_error":
    case "not_authorized":
    case "not_found":
    case "invalid_email":
      // The UI never shows the toggle to non-developers and only toggles listed
      // active rows, so these are defense-in-depth paths; they surface the
      // generic admin-write copy inline rather than a raw code.
      code = "ADMIN_EMAIL_WRITE_FAILED";
      break;
    case "ok":
      code = null;
      break;
  }
  return code ? getDougFacing(code) : null;
}

const TRACK_BASE =
  "relative inline-flex h-7 w-12 items-center rounded-full border transition-colors duration-fast";
const THUMB_BASE =
  "inline-block h-5 w-5 rounded-full bg-bg shadow-(--shadow-tile) transition-transform duration-fast";
// The button IS the ≥44px tap target (spec §13); the 28px track lives inside it.
const TAP_TARGET =
  "inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60";

/** The visual switch track + thumb, driven by `on`. Purely decorative. */
function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        TRACK_BASE,
        on ? "border-accent bg-accent" : "border-border-strong bg-surface-sunken",
      ].join(" ")}
    >
      <span className={[THUMB_BASE, on ? "translate-x-6" : "translate-x-1"].join(" ")} />
    </span>
  );
}

/**
 * The actor's own row: a locked, disabled indicator. Static — no form, no
 * action. You cannot demote yourself (the server refuses too). Instant, no
 * transition (spec §13 "any → locked").
 */
function LockedDeveloperIndicator({ checked }: { checked: boolean }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-text-subtle">
          <Lock aria-hidden className="size-3" />
          Developer
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-disabled="true"
          disabled
          aria-label="Developer access (your own, locked)"
          data-testid="developer-toggle"
          className={TAP_TARGET}
        >
          <SwitchTrack on={checked} />
        </button>
      </div>
    </div>
  );
}

/** An interactive Developer switch for a NON-actor row. */
function InteractiveDeveloperToggle({ email, checked }: { email: string; checked: boolean }) {
  const [state, formAction, isPending] = useActionState<SetDeveloperActionResult | null, FormData>(
    setDeveloperAction,
    null,
  );
  // Optimistic: while the flip is in flight, show the TARGET state; on error the
  // action resolves (isPending → false) and the switch reverts to `checked`.
  const displayed = isPending ? !checked : checked;
  // Suppress stale error copy during a fresh in-flight submit.
  const errorCopy = isPending ? null : errorCopyFor(state);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-text-subtle">Developer</span>
        <form action={formAction} className="shrink-0">
          <input type="hidden" name="email" value={email} />
          {/* The FLIP target: submit the opposite of the current server value. */}
          <input type="hidden" name="is_developer" value={String(!checked)} />
          <button
            type="submit"
            role="switch"
            aria-checked={displayed}
            aria-busy={isPending}
            aria-label={`Developer access for ${email}`}
            data-testid="developer-toggle"
            disabled={isPending}
            className={TAP_TARGET}
          >
            <SwitchTrack on={displayed} />
          </button>
        </form>
      </div>
      {errorCopy ? (
        <p
          role="alert"
          data-testid="developer-toggle-error"
          className="max-w-prose rounded-sm bg-warning-bg px-2 py-1 text-right text-xs text-warning-text"
        >
          {renderEmphasis(errorCopy)}
        </p>
      ) : null}
    </div>
  );
}

export function DeveloperToggleButton({
  email,
  checked,
  locked = false,
}: DeveloperToggleButtonProps) {
  // `locked` is static per row (actor vs non-actor never changes for a given
  // render tree), so branching to distinct child components here does not
  // violate the rules of hooks.
  if (locked) return <LockedDeveloperIndicator checked={checked} />;
  return <InteractiveDeveloperToggle email={email ?? ""} checked={checked} />;
}
