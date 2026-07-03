"use client";

/**
 * components/admin/PublishedToggle.tsx (published-toggle spec §3.3)
 *
 * The persistent Published switch at the top of Share & access — the single publish
 * control on the show page (replaces the window-gated Undo auto-publish and the Held
 * Publish button). ON → `publish_show` (existing gates), OFF → `unpublish_show` (pure
 * unpublish: the crew link pauses; the SAME link works again when toggled back on).
 * Flips instantly in both directions (user decision D6 — no confirm dialog; flipping
 * back IS the undo).
 *
 * Mode boundaries (spec §3.3; archived pages never mount this component):
 *   Live                  → ON, enabled     Held → OFF, enabled
 *   Publishing… (¬pub)    → OFF, disabled   Live + finalize-owned → ON, disabled
 * The disable condition is `finalizeOwned` alone — a pending-changes finalize can own
 * a LIVE show (spec R2/R3), and mid-finalize flips must not race the apply.
 *
 * React-19 dispatch safety (the B1 revoke-hang lesson, AutoPublishToggle.tsx:21-27):
 * the switch is the form SUBMITTER; it disables ONLY on useFormStatus().pending or
 * finalizeOwned — never synchronously in its own onClick. Typed refusals render
 * locally WITHOUT router.refresh() (PublishShowButton.tsx:53-65 pattern — refreshing
 * would remount the island and wipe the copy, plan R10); success refreshes so the
 * server-rendered `published` flows back down.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";

type LifecycleResult = { ok: true } | { ok: false; code: string };

const KNOWN_REFUSAL_CODES = new Set([
  "PUBLISH_BLOCKED_PENDING_REVIEW",
  "SHOW_ARCHIVED_IMMUTABLE",
  "FINALIZE_OWNED_SHOW",
]);

export type PublishedToggleProps = {
  /** Slug, for stable identification of the bound action's subject (debug/test affordance). */
  slug: string;
  /** Server-computed current state (page.tsx — never null at this callsite). */
  published: boolean;
  /** Server-computed finalize ownership; disables the switch in BOTH published states. */
  finalizeOwned: boolean;
  /** Pre-bound (to this show's slug) setShowPublishedAction. */
  setPublished: (next: boolean) => Promise<LifecycleResult>;
};

export function PublishedToggle({
  slug: _slug,
  published,
  finalizeOwned,
  setPublished,
}: PublishedToggleProps) {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [genericError, setGenericError] = useState(false);

  const subline = finalizeOwned
    ? published
      ? "Changes are being finalized — the switch unlocks when they commit."
      : "A publish is finishing — the switch unlocks when it's done."
    : published
      ? "Crew link is active."
      : "Crew link is off — nobody can open this show.";

  return (
    <div
      data-testid="published-toggle-row"
      className="flex items-start justify-between gap-3 rounded-sm border border-border bg-surface-sunken p-tile-pad"
    >
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-text-strong">Published</h3>
        <p data-testid="published-toggle-subline" className="mt-1 max-w-prose text-sm text-text-subtle">
          {subline}
        </p>
        {errorCode ? (
          <div
            role="alert"
            data-testid="published-toggle-error"
            className="mt-2 rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
          >
            <ErrorExplainer code={errorCode} surface="admin" />
            <HelpAffordance code={errorCode} />
          </div>
        ) : null}
        {genericError ? (
          <p
            role="alert"
            data-testid="published-toggle-retry"
            className="mt-2 rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
          >
            That didn&rsquo;t go through. Refresh and try again.
          </p>
        ) : null}
      </div>

      <form
        action={async () => {
          setErrorCode(null);
          setGenericError(false);
          const result = await setPublished(!published);
          if (result.ok) {
            router.refresh();
            return;
          }
          // Refusals render locally WITHOUT router.refresh() — the established
          // PublishShowButton pattern (components/admin/PublishShowButton.tsx:53-65).
          // Refreshing here can wipe the inline copy the user needs (plan R10).
          if (KNOWN_REFUSAL_CODES.has(result.code)) setErrorCode(result.code);
          else setGenericError(true);
        }}
        className="shrink-0 self-center"
      >
        <SwitchButton on={published} disabled={finalizeOwned} />
      </form>
    </div>
  );
}

/**
 * Extracted so useFormStatus() runs inside a definite child of the <form> (React 19
 * requirement — AutoPublishToggle.tsx:106-111 precedent). ARIA switch reflecting `on`;
 * disables on form-pending or finalizeOwned, never synchronously in its own onClick.
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
      aria-label="Published"
      data-testid="published-toggle"
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
