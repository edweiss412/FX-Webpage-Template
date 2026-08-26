"use client";

/**
 * components/admin/RescanSheetButton.tsx (per-sheet Re-scan — spec §9)
 *
 * A quiet secondary CTA mounted on the wizard Step-3 review card (both render
 * paths) and inside the final-publish blocker lists (only for the rows a re-scan
 * can heal: STAGED_PARSE_OUTDATED_AT_PHASE_D and ROLE_MAPPINGS_OUTDATED_AT_PUBLISH
 * — the RESCANNABLE_CAS_CODES set in both panels). It re-fetches
 * ONE Drive file, re-parses, and re-stages it:
 *
 *   POST /api/admin/onboarding/rescan-sheet  { driveFileId, wizardSessionId }
 *
 * The route always returns HTTP 200 with a typed RescanResult-shaped JSON body
 * (the button reads `{ ok }` + the inline copy). On a successful mutation
 * (`ok === true`) it router.refresh()es so the Step-3 cards / blocker lists
 * re-read the freshly-staged rows on the next server render.
 *
 * No raw §12.4 code is rendered (invariant 5): the `needs_attention` / `busy`
 * branches resolve their cataloged dougFacing via messageFor + render a
 * <HelpAffordance> (mirroring ReSyncButton's error block); every other branch is
 * a short plain-English line. Copy carries NO em dashes (DESIGN.md UI-copy rule).
 *
 * Double-click is guarded by the loading state (disabled while in flight) — NOT a
 * self-disabling form action (see feedback_react_form_action_synchronous_disable).
 */
import { useContext, useRef, useState } from "react";

import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { cn } from "@/lib/ui/cn";
import { SECONDARY_ACTION_CLASS, SECONDARY_ACTION_ON_TINTED_CLASS } from "@/lib/ui/actionClass";

export type RescanSheetButtonProps = {
  driveFileId: string;
  wizardSessionId: string;
  /**
   * Where the result line renders (spec 2026-07-03 §G). "stacked" (default) keeps
   * today's in-flow block below the button — the two Step3SheetCard call sites pass
   * no prop and stay byte-identical. "overlay" floats the result absolutely above
   * the button (out of flow, so a fixed-height footer never grows) and adds a
   * dismiss button; entrance is the fast pop-in via [data-rescan-overlay-result].
   */
  resultPlacement?: "stacked" | "overlay";
  /**
   * Step-3 consolidation (spec §4.4 R8): externally freeze the button while a
   * publish/resume run is active (in addition to its own in-flight `pending`).
   * The modal Re-scan (its first consumer) and the row Re-scan (Task 2.4) both
   * pass `isPublishRunActive` here.
   */
  disabled?: boolean;
  /**
   * The button stands on a TINTED card (`warning-bg` / `info-bg` / `danger-bg`)
   * rather than a neutral ground, so its resting outline takes the plate token.
   *
   * A prop, not a class, because nothing in this button's own class string can
   * say what it is standing on, and `cn` does not merge Tailwind conflicts, so a
   * caller cannot append a second `border-*` and get a defined winner. Default
   * false: every other call site is on a neutral ground and renders unchanged.
   *
   * ONE caller sets it — the archived-tab rescan notice in
   * `components/admin/wizard/step3ReviewSections.tsx`, whose card is `bg-info-bg`
   * (design doc 2026-08-25-ui-polish-class-sweep-design.md, D2).
   */
  onTintedPlate?: boolean;
};

// The route's RescanResult → JSON mapping (app/api/admin/onboarding/rescan-sheet/route.ts).
type RescanResponse =
  | { ok: true; status: "updated"; needsReview: boolean; changed: boolean; demoted: boolean }
  | { ok: false; status: "needs_attention" | "busy"; code: string }
  | { ok: false; status: "superseded" | "no_active_session" | "not_found" | "not_a_sheet" };

// The rendered result line: `info` (a clean / informational outcome) or `coded` (a
// cataloged code that adds dougFacing + a HelpAffordance disclosure).
type ResultState = { kind: "info"; copy: string } | { kind: "coded"; copy: string; code: string };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when the catalog lookup returns null; every
// real coded branch routes through messageFor(code).dougFacing first.
const CODED_FALLBACK =
  "This sheet could not be re-scanned right now. Refresh and try again, or contact the developer if this keeps happening.";

// Short plain-English lines for the typed, code-less guard outcomes (no em dashes).
const PLAIN_COPY: Record<"superseded" | "no_active_session" | "not_found" | "not_a_sheet", string> =
  {
    superseded: "This setup was replaced by a newer run. Refresh and try again.",
    no_active_session: "Setup isn't running right now. Refresh the page and try again.",
    not_found: "This sheet is no longer part of this setup.",
    not_a_sheet: "This file isn't a Google Sheet, so there's nothing to re-scan.",
  };

function resultFor(body: RescanResponse): ResultState {
  if (body.ok) {
    if (body.needsReview) {
      return {
        kind: "info",
        copy:
          body.demoted || body.changed
            ? "Updated. This sheet changed and needs your review before publishing."
            : "No changes found. This sheet still needs your review before publishing.",
      };
    }
    return {
      kind: "info",
      // Unchanged still closes the loop: a role-mapping heal re-derives the staged
      // stamp without any sheet edit, so "No changes found." alone reads as failure.
      copy: body.changed
        ? "Updated. Still ready to publish."
        : "No changes found. Still ready to publish.",
    };
  }
  if (body.status === "needs_attention" || body.status === "busy") {
    return { kind: "coded", copy: lookupDougFacing(body.code) ?? CODED_FALLBACK, code: body.code };
  }
  return { kind: "info", copy: PLAIN_COPY[body.status] };
}

export function RescanSheetButton({
  driveFileId,
  wizardSessionId,
  resultPlacement,
  disabled,
  onTintedPlate,
}: RescanSheetButtonProps) {
  const placement = resultPlacement ?? "stacked";
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  // BL-ANNOUNCE-REGION-UNMOUNT-CLASS: the announcement goes to a region that
  // OUTLIVES this component's own success branch. The result block below is
  // inserted together with its text, and a live region that arrives already
  // populated is never announced — screen readers announce mutations WITHIN an
  // existing region. The provider's region is mounted above this branch, so a
  // mutation is what it receives.
  const { announce } = useContext(UndoAnnounceContext);
  const triggerRef = useRef<HTMLButtonElement>(null);

  async function handleClick() {
    if (pending) return;
    setResult(null);
    setPending(true);
    try {
      const response = await fetch("/api/admin/onboarding/rescan-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId, wizardSessionId }),
      });
      const body = (await response.json()) as RescanResponse;
      const next = resultFor(body);
      setResult(next);
      // Announce through the branch-stable channel, not the block below.
      announce(next.copy);
      if (body.ok) router.refresh();
    } catch {
      const failure = {
        kind: "info" as const,
        copy: "Something went wrong starting the re-scan. Refresh and try again.",
      };
      setResult(failure);
      announce(failure.copy);
    } finally {
      setPending(false);
    }
  }

  // Stacked tone classes are byte-pinned by the default-placement test (the two
  // Step3SheetCard call sites pass no prop); overlay appends the out-of-flow
  // positioning + card shadow + right padding so copy clears the dismiss button.
  // No border on either tone. In the stacked placement this block renders INSIDE
  // the row's own bordered card, and a bordered box inside a bordered box is the
  // nested chrome of STEP3-GALLERY-TAP-TARGETS-1 item (d) — reachable only after
  // a re-scan returns, which is why the first version of the row-slot guard,
  // asserting on the initial render alone, could not see it (whole-diff review,
  // brief B r1 F1). The tint carries the tone in both placements, and the
  // overlay placement additionally carries `shadow-tile` for separation.
  const toneClass =
    result?.kind === "coded"
      ? "flex flex-col gap-1 rounded-sm bg-warning-bg p-3 text-sm text-warning-text"
      : "rounded-sm bg-info-bg px-3 py-2 text-sm text-text-strong";
  // Mobile-safe anchoring (impeccable audit P1): below sm the wrapper is NOT
  // the positioning context (root drops `relative` via `sm:relative`), so the
  // overlay anchors `left-0` against the nearest positioned ancestor — the
  // modal footer, which carries `relative` for exactly this contract
  // (Step3ReviewModal.tsx footer). Anchoring to the wrapper (`right-0`) at
  // 390px clipped coded results past the left viewport edge in the normal
  // footer branch (and `left-0` on the wrapper would mirror-clip the demoted
  // right-aligned branch). ≥sm restores today's wrapper-anchored `right-0`.
  const overlayClass = cn(
    "absolute bottom-full left-0 sm:left-auto sm:right-0 mb-2 z-raised w-max max-w-[min(20rem,80vw)] shadow-tile pr-10",
  );

  return (
    <div
      className={
        placement === "overlay" ? "sm:relative flex flex-col gap-2" : "flex flex-col gap-2"
      }
    >
      <button
        type="button"
        ref={triggerRef}
        data-testid={`rescan-sheet-button-${driveFileId}`}
        onClick={() => void handleClick()}
        disabled={pending || disabled}
        aria-busy={pending}
        // The shared secondary-action treatment (lib/ui/actionClass.ts). This
        // button's own class was the value promoted into that constant; the
        // outline has since moved to `border-text-faint` (2026-08-14, DESIGN
        // §1.2a) and this call site inherited it with no edit here, which is
        // the point of the constant. `self-start` is placement.
        //
        // `onTintedPlate` picks the plate variant, which differs in the outline
        // token alone. It is a prop because ONE of this button's callers renders
        // it inside a tinted card and the rest do not, and nothing in the
        // button's own class string could tell them apart (design doc
        // 2026-08-25-ui-polish-class-sweep-design.md, D2).
        className={cn(
          onTintedPlate ? SECONDARY_ACTION_ON_TINTED_CLASS : SECONDARY_ACTION_CLASS,
          "self-start",
        )}
      >
        {pending ? "Re-scanning…" : "Re-scan this sheet"}
      </button>

      {result ? (
        placement === "overlay" ? (
          /* Overlay (impeccable dual-gate P1): the positioned wrapper is NOT
             the live region — interactive content inside `role="status"` is an
             ARIA authoring anti-pattern (SRs announce the Dismiss/Learn-more
             controls as status noise). The live region is the inner <p> with
             ONLY the status copy; Dismiss + HelpAffordance are siblings. */
          <div
            data-testid={`rescan-sheet-result-${driveFileId}`}
            data-rescan-overlay-result=""
            className={`${toneClass} ${overlayClass}`}
          >
            {/* Overlay-only dismiss (spec §G): a floating layer must be
                closable. Exit is instant (§H N4). Focus returns to the
                Re-scan trigger BEFORE the overlay unmounts so it never drops
                to body inside the focus-trapped dialog (WCAG 2.4.3). Stacked
                stays dismissless — it persists until the next click clears it
                (handleClick's setResult(null)). */}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                triggerRef.current?.focus();
                setResult(null);
              }}
              className="absolute -right-2 -top-2 inline-flex size-tap-min items-center justify-center rounded-pill text-text hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
            {/* No role/aria-live here. This block is INSERTED with its text,
                so it could never announce; the branch-stable provider region
                does that now (BL-ANNOUNCE-REGION-UNMOUNT-CLASS). Keeping a
                second live region would only risk a double announcement on the
                day the insertion timing changed. */}
            <p>{renderEmphasis(result.copy)}</p>
            {result.kind === "coded" ? <HelpAffordance code={result.code} /> : null}
          </div>
        ) : (
          /* Stacked stays byte-identical to the pre-overlay markup (the two
             Step3SheetCard call sites pass no prop) — pinned by the
             default-placement byte-parity tests. */
          <div data-testid={`rescan-sheet-result-${driveFileId}`} className={toneClass}>
            <p>{renderEmphasis(result.copy)}</p>
            {result.kind === "coded" ? <HelpAffordance code={result.code} /> : null}
          </div>
        )
      ) : null}
    </div>
  );
}
