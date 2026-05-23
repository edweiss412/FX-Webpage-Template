/**
 * components/admin/HelpAffordance.tsx (M10 §B Task 10.9 / Phase 3 / Cluster I-6;
 * M11 Phase G.3 — extended with the §5.6 template-family `Learn more →` link)
 *
 * Two §9.0.1 affordances on admin error surfaces:
 *
 *   1. The "What does this mean?" disclosure paragraph (M10 — unchanged).
 *      Renders when the catalog row's `helpfulContext` is non-null.
 *
 *   2. The matrix template-family `Learn more →` link (M11 Phase G.3 — new).
 *      Renders when the renderer-gate's `shouldEmitLearnMore({route, helpHref})`
 *      is true: admin-context route AND `messageFor(code).helpHref` non-null,
 *      excluding the preview-as-crew sub-tree. Testid is the matrix family
 *      pattern `help-affordance--error-message--<code>--learn-more`.
 *
 * The two affordances are INDEPENDENT — one, both, or neither may render
 * depending on the catalog row + current route. Component returns null
 * only when neither would emit.
 *
 * Pairing contract:
 *   - The host renders the error message text (via messageFor().dougFacing
 *     or via <ErrorExplainer />). This component renders ONLY the help
 *     affordances — no message text, no chrome of its own.
 *   - When the code is unknown render NOTHING (returns null). The §9.0.1
 *     contract applies only to codes whose `dougFacing` is non-null; admin-
 *     log-only codes are exempt and naturally fall through (their `helpHref`
 *     is null, so the Learn-more gate returns false, and their
 *     `helpfulContext` is also null).
 *   - Client Component ("use client"): `usePathname()` powers the default
 *     route. Callers may also pass `route` explicitly (tests do; non-page
 *     surfaces with explicit context can).
 *
 * This is the canonical §9.0.1 "What does this mean?" + "Learn more →"
 * affordance for admin surfaces. Crew surfaces use <ErrorExplainer
 * helpfulContext /> directly (no Learn-more wiring per §5.6 negative-row).
 */
"use client";

import { usePathname } from "next/navigation";
import { testidForErrorCode } from "@/app/help/_affordanceMatrix";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import {
  lookupHelpfulContext,
  messageFor,
  type MessageParams,
} from "@/lib/messages/lookup";
import { shouldEmitLearnMore } from "@/lib/messages/renderer-gate";

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
  /**
   * Current route. Optional — defaults to `usePathname() ?? "/"` when
   * omitted. Drives whether the per-error `Learn more →` link is emitted
   * (spec §5.2 r10 admin-context gate via `lib/messages/renderer-gate.ts`).
   * Tests + explicit-context callers pass it directly.
   */
  route?: string;
};

function isKnownCode(code: string): code is MessageCode {
  return Object.prototype.hasOwnProperty.call(MESSAGE_CATALOG, code);
}

export function HelpAffordance({ code, params, route }: HelpAffordanceProps) {
  const pathname = usePathname();
  if (typeof code !== "string" || code.length === 0) return null;
  if (!isKnownCode(code)) return null;

  const effectiveRoute = route ?? pathname ?? "/";
  const entry = messageFor(code, params);
  const helpHref = entry.helpHref;
  const helpful = lookupHelpfulContext(code, params);

  const showHelpful = helpful != null;
  const showLearnMore = shouldEmitLearnMore({
    route: effectiveRoute,
    helpHref,
  });

  if (!showHelpful && !showLearnMore) return null;

  return (
    <div
      data-testid="help-affordance"
      className="mt-2 flex flex-col gap-2 text-sm text-text-subtle"
    >
      {showHelpful ? (
        <details className="list-none [&::-webkit-details-marker]:hidden [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none">
          <summary
            data-testid="help-affordance-trigger"
            className="cursor-pointer list-none underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            What does this mean?
          </summary>
          <p data-testid="help-affordance-body" className="mt-2 max-w-prose">
            {helpful}
          </p>
        </details>
      ) : null}
      {showLearnMore && helpHref != null ? (
        <a
          href={helpHref}
          data-testid={testidForErrorCode(code)}
          aria-label={`Learn more: ${entry.title ?? "this error"}`}
          className="inline-flex w-fit min-h-tap-min items-center text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Learn more →
        </a>
      ) : null}
    </div>
  );
}
