"use client";

/**
 * app/admin/settings/admins/ReAddRowButton.tsx (M9 C9 / M5-D-C9-1 P2 fix)
 *
 * One-tap re-add for a revoked admin_emails row. Submits to
 * addAdminAction with confirm_re_add=true so the upsert RPC
 * reactivates the row atomically (clears revoked_*, refreshes
 * added_*, replaces note per amendment §5.4).
 *
 * Critique finding P2: without this affordance, restoring a revoked
 * admin took 3 steps (retype email → re_add_required prompt →
 * confirm). Brief §11 anti-goals forbid bulk import + role hierarchy
 * but not a per-row re-add control on the audit list.
 */
import { useActionState } from "react";

import { addAdminAction, type AdminEmailActionResult } from "./actions";

export function ReAddRowButton({ email }: { email: string }) {
  const [_result, formAction, isPending] = useActionState<
    AdminEmailActionResult | null,
    FormData
  >(addAdminAction, null);
  void _result;
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="confirm_re_add" value="true" />
      <button
        type="submit"
        data-testid="admin-allowlist-readd-row-button"
        disabled={isPending}
        aria-busy={isPending}
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center px-3 text-xs text-accent-on-bg underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Re-adding…" : "Re-add"}
      </button>
    </form>
  );
}
