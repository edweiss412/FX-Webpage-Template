"use client";

/**
 * components/admin/PublishShowButton.tsx (M12.2 Phase B2 Task 7.3 — spec §2.4)
 *
 * One-tap Publish control on a Held show's per-show page. Publish is
 * non-destructive (it makes a held show live; it hands out no URL), so there is
 * NO two-tap confirm: a single tap dispatches the bound publishShowAction.
 *
 * React-19 dispatch safety (the B1 revoke-hang lesson): a plain type="submit"
 * button inside a <form action>, disabling ONLY on useFormStatus().pending —
 * never synchronously in its own onClick.
 *
 * On success → router.refresh() (the page re-renders into its live
 * presentation; the share/rotate controls, gated published && !archived,
 * return). On a PUBLISH_BLOCKED_PENDING_REVIEW refusal (unsynced changes, a
 * pending review, or a live deferral — §2.4) → render the §12.4 catalog copy
 * via ErrorExplainer (invariant 5, no raw codes) PLUS a Re-sync affordance
 * (the clearing path: a successful manual Re-sync clears requires_resync /
 * deletes the deferral so a subsequent Publish passes). Other refusals
 * (SHOW_ARCHIVED_IMMUTABLE / FINALIZE_OWNED_SHOW) and the retired not-found /
 * infra sentinel render appropriate catalog copy or plain-language prose.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { ReSyncButton } from "@/components/admin/ReSyncButton";
import { AccentButton } from "@/components/shared/AccentButton";

type LifecycleResult = { ok: true } | { ok: false; code: string };

const KNOWN_REFUSAL_CODES = new Set([
  "PUBLISH_BLOCKED_PENDING_REVIEW",
  "SHOW_ARCHIVED_IMMUTABLE",
  "FINALIZE_OWNED_SHOW",
]);

export type PublishShowButtonProps = {
  /** Pre-bound (to this show's slug) Publish server action. */
  publishAction: () => Promise<LifecycleResult>;
  /** Slug for the Re-sync affordance (the PUBLISH_BLOCKED_PENDING_REVIEW clearing path). */
  slug: string;
};

export function PublishShowButton({ publishAction, slug }: PublishShowButtonProps) {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [genericError, setGenericError] = useState(false);

  const onResult = (result: LifecycleResult) => {
    if (result.ok) {
      router.refresh();
      return;
    }
    if (result.code === "show_not_found") {
      setNotFound(true);
    } else if (KNOWN_REFUSAL_CODES.has(result.code)) {
      setErrorCode(result.code);
    } else {
      setGenericError(true);
    }
  };

  const blocked = errorCode === "PUBLISH_BLOCKED_PENDING_REVIEW";

  return (
    <div className="flex flex-col items-start gap-3">
      <form
        action={async () => {
          setErrorCode(null);
          setNotFound(false);
          setGenericError(false);
          const result = await publishAction();
          onResult(result);
        }}
      >
        <SubmitButton />
      </form>

      {errorCode ? (
        <div
          role="alert"
          data-testid={blocked ? "publish-show-blocked" : "publish-show-error"}
          className="flex flex-col gap-3 rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <div>
            <ErrorExplainer code={errorCode} surface="admin" />
            <HelpAffordance code={errorCode} />
          </div>
          {blocked ? (
            // The clearing path (§2.4 R30): a manual Re-sync clears
            // requires_resync / deletes the live deferral so a subsequent
            // Publish passes the atomic gate.
            <ReSyncButton slug={slug} />
          ) : null}
        </div>
      ) : null}

      {notFound ? (
        <p
          role="alert"
          data-testid="publish-show-not-found"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-sm text-warning-text"
        >
          We couldn&rsquo;t find this show anymore. Refresh the page and try again.
        </p>
      ) : null}

      {genericError ? (
        <p
          role="alert"
          data-testid="publish-show-generic-error"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-sm text-warning-text"
        >
          Publishing didn&rsquo;t go through. Try again in a moment; if it keeps failing, contact
          the developer.
        </p>
      ) : null}
    </div>
  );
}

/** useFormStatus must run inside a definite child of the <form> (React 19). */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <AccentButton
      type="submit"
      data-testid="publish-show-button"
      disabled={pending}
      aria-busy={pending}
      size="sm"
      inline
      minWidthTap
    >
      {pending ? "Publishing…" : "Publish"}
    </AccentButton>
  );
}
