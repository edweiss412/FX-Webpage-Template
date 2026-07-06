"use client";

/**
 * components/admin/wizard/WizardFooter.tsx
 *
 * Shared sticky footer for the onboarding wizard (all three steps). Layout +
 * stickiness ONLY — each step supplies its own controls:
 *   - `back`    — the previous-step affordance (omitted on step 1, the first step)
 *   - `center`  — optional status text (step 2's scan result, step 3's tracking)
 *   - `primary` — the forward/commit action (Continue, or step 3's Publish)
 *
 * PORTALED TO <body> (2026-07-05). app/admin/layout.tsx renders page content
 * inside <PageTransition>, an animated wrapper whose settled inline `transform`
 * opens a NEW stacking context. A fixed footer authored inside that subtree is
 * confined to it, so the layout's fixed mobile bottom tab bar — a SIBLING of
 * <PageTransition> at z-30 — paints OVER the footer no matter how
 * high the footer's own z-index is (a transformed ancestor can't be escaped
 * with z-index alone). Portaling the bar to document.body lifts it into the
 * root stacking context, where its `z-40` beats the z-30 tab bar. Mount-gated
 * so the portal never runs during SSR (all consumers are client components, so
 * the one-frame first-paint gap before the bar mounts is acceptable).
 *
 * WIDTH MATCHES THE HEADER (2026-07-05). The fixed wrapper is full-bleed for
 * positioning, but the visible bar (a `bg-bg` fill, no border/wash) is capped to the
 * admin-shell container — `mx-auto max-w-[1600px]` + the same page padding
 * app/admin/layout.tsx uses — so the bar's top rule and content edges line up
 * exactly with <OnboardingTopBar> (the onboarding header) instead of bleeding
 * edge-to-edge. Below 1600px the bar is the container width (minus page pad);
 * above it, 1600px centered — the header's geometry, mirrored.
 *
 * Notes:
 *  - `bg-bg` fill, no border, no backdrop-blur, no drop shadow (owner decision,
 *    2026-07-06). The fill is the PAGE background color (`--color-bg`, the same
 *    token body paints), so scrolling content disappears cleanly behind the bar
 *    instead of the old transparent bar letting card text bleed through and
 *    overlap the footer copy. The bar reads as an extension of the page, not a
 *    panel — no rule, no wash.
 *  - `items-end` lets a taller `center` (step 3's status panel) grow the bar
 *    upward around the baselined back / primary controls.
 *  - `flex-wrap` lets back / center / primary stack on very narrow widths
 *    instead of overflowing (mobile — Doug uses /admin on a phone).
 *  - `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]` clears the iOS home
 *    indicator. Consumers must pad their own content so this fixed bar never
 *    occludes the last element (OnboardingWizard adds the bottom padding).
 *  - `back` omitted → a hidden spacer holds the slot so `primary` (via `ml-auto`
 *    on its wrapper) keeps its right-edge position.
 */
import { createPortal } from "react-dom";
import { useHasMounted } from "@/lib/a11y/useHasMounted";

export function WizardFooter({
  back,
  center,
  primary,
}: {
  back?: React.ReactNode;
  center?: React.ReactNode;
  primary: React.ReactNode;
}) {
  const mounted = useHasMounted();
  if (!mounted) return null;

  return createPortal(
    <div data-testid="wizard-footer" className="fixed inset-x-0 bottom-0 z-40">
      {/* Mirrors app/admin/layout.tsx's shell container so the bar's width +
          rule align with <OnboardingTopBar>. */}
      <div className="mx-auto max-w-[1600px] px-page-pad-mobile sm:px-page-pad-desktop">
        <div
          data-testid="wizard-footer-inner"
          className="flex flex-wrap items-end gap-x-4 gap-y-2 bg-bg pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        >
          {/* Three equal-weight slots: two `flex-1 basis-0` side columns flank a
              content-sized center. Equal side columns place the center's midpoint
              at the bar's true midpoint regardless of how wide `back` vs `primary`
              are — `mx-auto`/`ml-auto` alone left it off-center (the wider Continue
              button pulled it left). With `center` absent the two side columns
              still split the bar, so `back` hugs the left and `primary` the right. */}
          <div className="flex flex-1 basis-0 items-end justify-start">
            {back ?? (
              <span
                data-testid="wizard-footer-back-spacer"
                aria-hidden="true"
                className="min-h-tap-min"
              />
            )}
          </div>
          {center ? <div className="flex min-w-0 items-end justify-center">{center}</div> : null}
          <div className="flex flex-1 basis-0 items-end justify-end">{primary}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
