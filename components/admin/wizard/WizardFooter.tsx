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
 * positioning, but the visible bar (border-t + surface wash) is capped to the
 * admin-shell container — `mx-auto max-w-[1600px]` + the same page padding
 * app/admin/layout.tsx uses — so the bar's top rule and content edges line up
 * exactly with <OnboardingTopBar> (the onboarding header) instead of bleeding
 * edge-to-edge. Below 1600px the bar is the container width (minus page pad);
 * above it, 1600px centered — the header's geometry, mirrored.
 *
 * Notes:
 *  - `border-t` + `backdrop-blur` (no drop shadow) matches the legacy
 *    Step3PublishBar treatment this footer supersedes.
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
          className="flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-border bg-surface/90 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur"
        >
          {back ?? (
            <span
              data-testid="wizard-footer-back-spacer"
              aria-hidden="true"
              className="min-h-tap-min"
            />
          )}
          {center ? <div className="mx-auto min-w-0">{center}</div> : null}
          <div className="ml-auto flex items-end">{primary}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
