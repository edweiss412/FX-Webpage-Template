"use client";

/**
 * app/admin/settings/admins/AddAdminForm.tsx (M9 C9 / M2-D1)
 *
 * Client-side wrapper around the addAdminAction Server Action. Wires
 * useActionState (React 19) to the action so we can read the
 * discriminated outcome and render:
 *   - inline error region for invalid_email / already_active
 *   - re-add prompt for re_add_required (with a confirm_re_add hidden
 *     field that re-submits the same email + note)
 *
 * The Add button is disabled when the email field is empty (HTML5 +
 * controlled state). Authoritative validation is server-side via the
 * canonicalize() boundary in lib/data/adminEmails.ts.
 */
import { useState } from "react";
import { useActionState } from "react";

import { canonicalize } from "@/lib/email/canonicalize";
import { getDougFacing } from "@/lib/messages/lookup";

import { addAdminAction, type AdminEmailActionResult } from "./actions";

export function AddAdminForm() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [result, formAction, isPending] = useActionState<AdminEmailActionResult | null, FormData>(
    addAdminAction,
    null,
  );

  // Re-add second-tap: if the previous submit returned re_add_required
  // for the email currently in the field, the form swaps to a "Re-add"
  // affirm pair instead of the regular Add button. Email comparison
  // uses canonicalize() so the prior server result (canonicalized) and
  // the current input agree even when the user retyped with different
  // case or spacing.
  const canonicalEmail = canonicalize(email);
  const isReAddPrompt =
    result?.kind === "re_add_required" && result.email === canonicalEmail;

  return (
    <form
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
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          data-testid="admin-allowlist-email-input"
          className="rounded-sm border border-border bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-text-strong">Note (optional)</span>
        <input
          name="note"
          type="text"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          data-testid="admin-allowlist-note-input"
          className="rounded-sm border border-border bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
      </label>

      {isReAddPrompt && result?.kind === "re_add_required" ? (
        <div
          data-testid="admin-allowlist-re-add-prompt"
          className="rounded-sm border border-warning-text bg-warning-bg p-tile-pad text-sm text-warning-text"
        >
          <p>
            <strong>{result.email}</strong> was previously revoked. Re-add this email to restore
            admin access?
          </p>
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
              onClick={() => {
                setEmail("");
                setNote("");
              }}
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
            disabled={canonicalEmail === null || isPending}
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Adding…" : "Add"}
          </button>
        </div>
      )}

      {result?.kind === "invalid_email" && (
        <p
          data-testid="admin-allowlist-error-invalid"
          role="alert"
          className="text-sm text-error-text"
        >
          {getDougFacing("ADMIN_EMAIL_INVALID")}
        </p>
      )}
      {result?.kind === "already_active" && (
        <p
          data-testid="admin-allowlist-error-active"
          role="alert"
          className="text-sm text-text-subtle"
        >
          {getDougFacing("ADMIN_EMAIL_ALREADY_ACTIVE", { email: result.email })}
        </p>
      )}
    </form>
  );
}
