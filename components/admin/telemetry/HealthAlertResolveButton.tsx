"use client";

/**
 * components/admin/observability/HealthAlertResolveButton.tsx
 * (alert-audience-split Task 9, spec §6.6)
 *
 * The per-row Resolve control on the developer HealthAlertsPanel, bound to the
 * dev-gated `resolveHealthAlertFormAction` Server Action. A Server Action (NOT a
 * <form action="/api/…"> to the JSON resolve route) so resolution revalidates in
 * place and stays on `#health` — no navigation to a raw JSON document (R5 finding 3).
 *
 * Pending state comes from `useFormStatus` (the form's own submission state), NOT
 * a synchronous onClick setState-disable, which would cancel the React 19
 * form-action before it dispatches.
 */
import { useFormStatus } from "react-dom";
import { resolveHealthAlertFormAction } from "@/app/admin/actions";

function SubmitButton({ alertId }: { alertId: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid={`health-alert-resolve-${alertId}`}
      disabled={pending}
      className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      {pending ? "Resolving…" : "Mark resolved"}
    </button>
  );
}

export function HealthAlertResolveButton({ alertId }: { alertId: string }) {
  return (
    <form
      action={resolveHealthAlertFormAction}
      data-testid={`health-alert-resolve-form-${alertId}`}
    >
      <input type="hidden" name="id" value={alertId} />
      <SubmitButton alertId={alertId} />
    </form>
  );
}
