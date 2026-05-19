/**
 * components/admin/HelpAffordance.tsx (M10 §B Task 10.9 / Phase 3 / Cluster I-6)
 *
 * Spec §9.0.1 third help affordance. Renders the "What does this mean?"
 * collapsible disclosure next to an already-rendered admin error message.
 * The disclosure body is the catalog row's `helpfulContext` paragraph
 * (one plain-language explanation per dougFacing-non-null code).
 *
 * Pairing contract:
 *   - The host renders the error message text (via messageFor().dougFacing
 *     or via <ErrorExplainer />). This component renders ONLY the
 *     disclosure — no message text, no chrome of its own.
 *   - When the code is unknown or its helpfulContext is null, render
 *     NOTHING (returns null). The §9.0.1 contract applies only to codes
 *     whose dougFacing is non-null; admin-log-only codes are exempt.
 *   - Server Component (no 'use client'). The disclosure is a native
 *     <details> / <summary> so the open/close state is browser-managed.
 *
 * This is the canonical §9.0.1 "What does this mean?" affordance for
 * admin surfaces. Crew surfaces use <ErrorExplainer helpfulContext />
 * directly because the disclosure pairs with the message text in one
 * block on those pages.
 */
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { lookupHelpfulContext, type MessageParams } from "@/lib/messages/lookup";

export type HelpAffordanceProps = {
  /**
   * Message code — usually a `MessageCode` literal from the catalog, but
   * accepts any string for defense-in-depth (some host components pull
   * the code from a server response body). Unknown codes render null.
   */
  code: MessageCode | string | null | undefined;
  /**
   * Placeholder values for catalog interpolation. Mirrors the same
   * params shape used by `messageFor`. Optional.
   */
  params?: MessageParams;
};

function isKnownCode(code: string): code is MessageCode {
  return Object.prototype.hasOwnProperty.call(MESSAGE_CATALOG, code);
}

export function HelpAffordance({ code, params }: HelpAffordanceProps) {
  if (typeof code !== "string" || code.length === 0) return null;
  if (!isKnownCode(code)) return null;
  const helpful = lookupHelpfulContext(code, params);
  if (helpful == null) return null;

  return (
    <details
      data-testid="help-affordance"
      data-code={code}
      className="mt-2 list-none text-sm text-text-subtle [&::-webkit-details-marker]:hidden [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none"
    >
      <summary
        data-testid="help-affordance-trigger"
        className="cursor-pointer list-none underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        What does this mean?
      </summary>
      <p
        data-testid="help-affordance-body"
        className="mt-2 max-w-prose"
      >
        {helpful}
      </p>
    </details>
  );
}
