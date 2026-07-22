"use client";

/**
 * components/admin/compactAlertHelp.tsx
 * (spec 2026-07-20-show-alert-compact §3.2)
 *
 * The compact card's help affordance: a quiet amber "?" that discloses the
 * catalog's helpful context, plus a route-gated "Learn more" link. Replaces
 * the freestanding help links the alert surfaces used to render inline.
 *
 * Two exports, deliberately split:
 *   - `buildHelpPopoverBody` — pure, so the presence matrix (context / href /
 *     route gate / whitespace) is testable without rendering.
 *   - `CompactAlertHelp` — the trigger + popover, rendering NOTHING when the
 *     builder returns null, so a card without help gets no trigger at all.
 *
 * Route gating is NEW on these surfaces (spec amendment A4): the live
 * AttentionBanner reads `helpHref` directly (AttentionBanner.tsx:93) and
 * `attentionItems` copies the catalog href unconditionally
 * (lib/admin/attentionItems.ts:224), so admin help links could reach
 * crew-facing routes. `shouldEmitLearnMore` is now consulted.
 */
import type { ReactNode } from "react";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { shouldEmitLearnMore } from "@/lib/messages/renderer-gate";

/**
 * Accessible name for a compact-card help trigger.
 *
 * Two constraints shape this, both found by the impeccable audit:
 *   - the "Help: " prefix is load-bearing. `HoverHelp` derives the Learn-more
 *     link's accessible name by stripping exactly that prefix and lowercasing
 *     what remains (HoverHelp.tsx:249-252). Without it the link announces as
 *     "Learn more about what does this mean?".
 *   - the `subject` disambiguates. A constant label gives every card in a stack
 *     an identical button name, which makes a screen reader's button list
 *     useless on the multi-alert modal.
 */
export function helpTriggerLabel(subject: string | null | undefined): string {
  const topic = typeof subject === "string" ? subject.trim() : "";
  return topic.length > 0 ? `Help: ${topic}` : "Help: what this alert means";
}

/** Body copy when the only content is a Learn-more link (§4.1). */
export const HELP_ONLY_LEARN_MORE_LEAD_IN = "More about this alert in the help pages.";

export type HelpPopoverContent = {
  body: ReactNode;
  /** Omitted entirely — never `undefined` — for exactOptionalPropertyTypes. */
  learnMore?: { href: string };
};

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Assemble the popover's content, or null when there is nothing to show.
 * A trigger is rendered iff this returns non-null (§3.2).
 */
export function buildHelpPopoverBody(input: {
  helpfulContext: string | null | undefined;
  helpHref: string | null | undefined;
  route: string;
}): HelpPopoverContent | null {
  const context = nonEmpty(input.helpfulContext);
  const href = nonEmpty(input.helpHref);
  const learnMoreAllowed =
    href !== null && shouldEmitLearnMore({ route: input.route, helpHref: href });

  if (context === null && !learnMoreAllowed) return null;

  // Catalog copy carries Markdown emphasis markers; rendering it raw would leak
  // literal asterisks into the popover (pinned by
  // tests/messages/_metaEmphasisRenderContract.test.ts). The lead-in is our own
  // literal string and needs no rendering.
  const body: ReactNode = context ? renderEmphasis(context) : HELP_ONLY_LEARN_MORE_LEAD_IN;
  return learnMoreAllowed && href !== null ? { body, learnMore: { href } } : { body };
}

export type CompactAlertHelpProps = {
  /** Short plain-text subject naming THIS card, for the trigger's accessible name. */
  subject?: string | null;
  /**
   * The popover's body copy. Deliberately NOT named after any one catalog
   * field: AttentionBanner feeds `helpfulContext`, the warning cards feed
   * `triggerContext` (spec 2026-07-20-warning-card-copy-restore §3.3) - the
   * leaf renders whatever copy its host surface routes here.
   */
  popoverCopy: string | null | undefined;
  /**
   * Second popover paragraph (the correction follow-up), forwarded verbatim to
   * HoverHelp.afterBodyText. Same name at both hops (spec
   * 2026-07-22-warning-panel-polish §3.1) — deliberately NOT `followUpCopy`,
   * which is PerShowActionableWarnings' external input.
   */
  afterBodyText?: string | null;
  helpHref: string | null | undefined;
  /**
   * Route the Learn-more gate is evaluated against. Supplied by the caller
   * rather than read from `usePathname()` here: this leaf is shared with
   * PerShowActionableWarnings, a SERVER component, and callers that never pass
   * a `helpHref` (so the gate cannot matter) should not be forced into a client
   * routing dependency.
   */
  route: string;
  /** Trigger gets `<testId>-trigger`, body gets `<testId>-body`. */
  testId: string;
};

export function CompactAlertHelp({
  subject,
  popoverCopy,
  afterBodyText,
  helpHref,
  route,
  testId,
}: CompactAlertHelpProps) {
  const content = buildHelpPopoverBody({ helpfulContext: popoverCopy, helpHref, route });
  if (content === null) return null;

  return (
    // A per-item testid (it interpolates an alert id or warning key) has no
    // literal for the matrix to match, and a concrete row would break the parity
    // gate's occurs-exactly-once rule, so this family is registered as a
    // template-family row in app/help/_affordanceMatrix.ts instead.
    // not-a-help-affordance: per-item popover, registered as a template-family row
    <HoverHelp
      label={helpTriggerLabel(subject)}
      align="right"
      compactTrigger
      testId={testId}
      // placement deliberately omitted: inherit HoverHelp's shipped default
      // rather than invent a geometry policy (spec amendment A6).
      {...(content.learnMore ? { learnMore: content.learnMore } : {})}
      {...(typeof afterBodyText === "string" && afterBodyText.trim().length > 0
        ? { afterBodyText }
        : {})}
      trigger={
        // The BUTTON owns the 22px box + centering (compactTrigger); this span
        // is the full-size skin, and the inner glyph span is the independently
        // measurable child for the §6 centering proof.
        <span
          aria-hidden="true"
          className="pointer-events-none grid size-full place-items-center rounded-pill border border-warning-text text-xs font-bold text-warning-text transition-colors duration-fast group-hover:bg-warning-text/10"
        >
          <span data-testid="compact-help-glyph">?</span>
        </span>
      }
    >
      {content.body}
    </HoverHelp>
  );
}
