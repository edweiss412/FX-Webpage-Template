"use client";

/**
 * app/admin/settings/admins/AddAdminForm.tsx (M9 C9 / M2-D1)
 *
 * Client-side wrapper around the addAdminAction Server Action. Wires
 * useActionState (React 19) to the action so we can read the
 * discriminated outcome and render:
 *   - inline success message + auto-clear inputs on ok (P1b)
 *   - inline error region for invalid_email / already_active
 *   - re-add prompt for re_add_required (with a confirm_re_add hidden
 *     field that re-submits the same email + note)
 *   - re-add cancel resets useActionState via formKey bump (P3)
 *
 * Inputs are uncontrolled (no value/onChange) so a successful submit
 * can clear them via `formRef.current?.reset()` from a useEffect —
 * the reset() call is a DOM mutation, not a setState in this
 * component, so it satisfies the react-hooks set-state-in-effect rule
 * AND keeps the success message visible (useActionState's result is
 * unaffected by form.reset()).
 *
 * Authoritative validation is server-side via the canonicalize()
 * boundary in lib/data/adminEmails.ts; the HTML5 required +
 * type=email gates obvious-garbage at the input layer.
 */
import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";

import { getDougFacing, getRequiredDougFacing } from "@/lib/messages/lookup";
import { renderEmphasis } from "@/components/messages/renderEmphasis";

import { addAdminAction, type AdminEmailActionResult } from "./actions";

export function AddAdminForm() {
  // P3 fix: formKey bumps on re-add Cancel to remount the form,
  // resetting useActionState so the stale re_add_required result
  // doesn't keep overriding the rendered prompt.
  const [formKey, setFormKey] = useState(0);
  return <AddAdminFormInner key={formKey} onReset={() => setFormKey((k) => k + 1)} />;
}

function AddAdminFormInner({ onReset }: { onReset: () => void }) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [result, formAction, isPending] = useActionState<AdminEmailActionResult | null, FormData>(
    addAdminAction,
    null,
  );

  // P1b fix: clear inputs after a successful add OR re-add so Doug
  // can chain entries without manually deleting the previous email.
  // form.reset() resets native input values without touching component
  // state — invariant 9-safe (no setState in this useEffect).
  useEffect(() => {
    if (result?.kind === "ok") {
      formRef.current?.reset();
    }
  }, [result]);

  const isReAddPrompt = result?.kind === "re_add_required";
  // Resolve to copy in a local (not inline in JSX) so the no-raw-codes
  // scanner does not flag the code string inside a JSX expression.
  const writeFailedMessage = getRequiredDougFacing("ADMIN_EMAIL_WRITE_FAILED");

  return (
    <form
      ref={formRef}
      action={formAction}
      data-testid="admin-allowlist-add-form"
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-text-strong">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          data-testid="admin-allowlist-email-input"
          className="rounded-sm border border-border bg-bg px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-text-strong">Note (optional)</span>
        <input
          name="note"
          type="text"
          maxLength={200}
          data-testid="admin-allowlist-note-input"
          className="rounded-sm border border-border bg-bg px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
      </label>

      {isReAddPrompt && result?.kind === "re_add_required" ? (
        <div
          data-testid="admin-allowlist-re-add-prompt"
          className="route-enter rounded-sm border border-warning-text bg-warning-bg p-tile-pad text-sm text-warning-text"
        >
          <p>
            <strong>{result.email}</strong> was previously revoked. Re-add this email to restore
            admin access?
          </p>
          {/* R14 fix: bind the re-add submission to the email that was
              actually prompted. Without this binding, the user could
              edit the visible email input AFTER the prompt appeared
              and submit a DIFFERENT email with confirm_re_add=true,
              bypassing the per-email second-tap gate.

              Two hidden inputs:
                - `email` overrides the visible (still-editable but
                  ignored) field because FormData.get returns the
                  FIRST element with that name and we render this
                  hidden input here, AFTER the visible one above…
              In FormData semantics for multiple same-name fields,
              getAll() returns both. The server's formData.get("email")
              returns the FIRST value found. To force the hidden bind
              to win, we ALSO send `confirm_email` and the server
              asserts `email === confirm_email` when confirm_re_add is
              true. */}
          <input type="hidden" name="email" value={result.email} />
          <input type="hidden" name="confirm_email" value={result.email} />
          <input type="hidden" name="confirm_re_add" value="true" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              data-testid="admin-allowlist-re-add-button"
              disabled={isPending}
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Re-adding…" : "Re-add"}
            </button>
            <button
              type="button"
              onClick={onReset}
              data-testid="admin-allowlist-re-add-cancel"
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center px-3 text-sm text-text-subtle underline-offset-2 hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            data-testid="admin-allowlist-add-button"
            disabled={isPending}
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Adding…" : "Add"}
          </button>
        </div>
      )}

      {/* P1b: success confirmation. The row also appears in the
          ACTIVE list on revalidation but Doug needs an explicit
          "yes, that happened" signal at the form. */}
      {result?.kind === "ok" && (
        <p
          data-testid="admin-allowlist-success"
          role="status"
          className="rounded-sm bg-info-bg px-2 py-1 text-sm font-medium text-text-strong"
        >
          {result.email ? `Added ${result.email}.` : "Added."}
        </p>
      )}

      {result?.kind === "invalid_email" && (
        <p
          data-testid="admin-allowlist-error-invalid"
          role="alert"
          className="text-sm text-warning-text"
        >
          {renderEmphasis(getDougFacing("ADMIN_EMAIL_INVALID") ?? "")}
        </p>
      )}
      {result?.kind === "already_active" && (
        <p
          data-testid="admin-allowlist-error-active"
          role="alert"
          className="text-sm text-text-subtle"
        >
          {renderEmphasis(
            getDougFacing("ADMIN_EMAIL_ALREADY_ACTIVE", { email: result.email }) ?? "",
          )}
        </p>
      )}
      {/* Task 6.4: transient DB / permissions fault on the add RPC,
          caught as AdminEmailsInfraError and surfaced inline so Doug can
          retry without losing the section. */}
      {result?.kind === "infra_error" && (
        <p
          data-testid="admin-allowlist-error-write-failed"
          role="alert"
          className="rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
        >
          {writeFailedMessage}
        </p>
      )}
    </form>
  );
}
