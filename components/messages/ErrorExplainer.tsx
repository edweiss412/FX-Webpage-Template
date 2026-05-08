/**
 * components/messages/ErrorExplainer.tsx (M5 §B Task 5.9 — Doug's portion)
 *
 * Shared message renderer for §12.4 error catalog entries. Used by:
 *   - The sign-in page (Task 5.8 §B): renders `searchParams.code` for the
 *     crew-facing surface.
 *   - The admin AlertBanner (this task): renders the topmost unresolved
 *     admin_alerts row for the dougFacing surface.
 *
 * Contract (spec §12.4 + invariant 5):
 *   - Every user-visible message goes through this component (or a sibling
 *     consumer of `messageFor()`). No raw error codes ever land in the DOM.
 *   - The `surface` prop selects which catalog field to render
 *     (`crewFacing` for crew/end-user surfaces; `dougFacing` for admin).
 *   - Defensive backstop: if `code` is not a known MessageCode (sign-in
 *     page passes a user-controlled string), render NOTHING (return null).
 *     The sign-in page does its own allowlist check upstream; this is the
 *     last line of defense.
 *   - Defensive backstop: if `code` IS a known MessageCode but the catalog
 *     field for the requested `surface` is null (e.g., LINK_EXPIRED has no
 *     dougFacing copy), render NOTHING.
 *   - When `helpfulContext` is true AND the catalog has a non-null
 *     `helpfulContext` field, render the helpful-context block as a
 *     separate subtle block. When the field is null, the block is omitted
 *     (no orphan empty container).
 *
 * Styling: this is a "generic message renderer" — no chrome of its own.
 * The host (AlertBanner / sign-in page error block) provides framing
 * (background, border, padding). We render plain text + an optional
 * subtle helpful-context block.
 *
 * Server Component (no 'use client').
 */
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";

export type ErrorExplainerProps = {
  /**
   * Message code — usually a `MessageCode` literal from the catalog, but
   * accepts any string for defense-in-depth (sign-in page passes
   * user-controlled `searchParams.code`). Unknown codes render null.
   */
  code: MessageCode | string;
  /**
   * Picks which catalog field to render:
   *   - 'crew'  → MESSAGE_CATALOG[code].crewFacing
   *   - 'admin' → MESSAGE_CATALOG[code].dougFacing
   */
  surface: "crew" | "admin";
  /**
   * When true AND the catalog entry has non-null `helpfulContext`, render
   * the helpful-context block below the message. Defaults to false; the
   * sign-in page can opt in for codes where extra context is helpful.
   */
  helpfulContext?: boolean;
};

function isKnownCode(code: string): code is MessageCode {
  return Object.prototype.hasOwnProperty.call(MESSAGE_CATALOG, code);
}

export function ErrorExplainer({ code, surface, helpfulContext = false }: ErrorExplainerProps) {
  // Defensive: unknown code → render nothing. The sign-in page passes
  // user-controlled `searchParams.code`; this is the last backstop.
  if (!isKnownCode(code)) {
    return null;
  }
  const entry = MESSAGE_CATALOG[code];
  const message = surface === "admin" ? entry.dougFacing : entry.crewFacing;

  // Defensive: known code, but no copy for this surface (e.g., LINK_EXPIRED
  // has no dougFacing copy). Render nothing rather than an empty stub.
  if (message == null) {
    return null;
  }

  const showHelpfulContext = helpfulContext === true && entry.helpfulContext != null;

  return (
    <div data-testid="error-explainer">
      {/* The message text. Host provides framing chrome (bg/border/padding). */}
      <p data-testid="error-explainer-message" className="text-base font-medium">
        {message}
      </p>
      {showHelpfulContext ? (
        <details className="mt-3 text-sm text-text-subtle">
          <summary className="cursor-pointer">Helpful context</summary>
          <p data-testid="error-explainer-helpful-context" className="mt-2">
            {entry.helpfulContext}
          </p>
        </details>
      ) : null}
    </div>
  );
}
