/**
 * components/admin/wizard/WizardFooter.tsx
 *
 * Shared, full-width sticky footer for the onboarding wizard (all three
 * steps). Layout + stickiness ONLY — each step supplies its own controls:
 *   - `back`    — the previous-step affordance (omitted on step 1, the first step)
 *   - `center`  — optional status text (step 3's "N of M selected")
 *   - `primary` — the forward/commit action (Continue, or step 3's Publish)
 *
 * Design (2026-07-05, user-approved): the bar is FIXED to the viewport bottom
 * and spans edge-to-edge (`fixed inset-x-0 bottom-0`) so its background reads as
 * a true full-width footer. Its inner row is capped at the admin-shell width
 * (`max-w-[1600px]`, matching app/admin/layout.tsx) so Back sits at the shell's
 * left content edge and the primary action at the right edge — a stable position
 * as the operator moves between steps. The centered content column above widens
 * per step; the footer controls do NOT, on purpose.
 *
 * Notes:
 *  - `border-t` + `backdrop-blur` (no drop shadow) matches the legacy
 *    Step3PublishBar treatment this footer supersedes.
 *  - `items-end` matches the legacy Step3PublishBar so FinalizeButton's "above"
 *    status panels (in-flow via flex-col-reverse) grow the bar upward cleanly.
 *  - `flex-wrap` lets back / center / primary stack on very narrow widths
 *    instead of overflowing (mobile — Doug uses /admin on a phone).
 *  - `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]` clears the iOS home
 *    indicator. Consumers must pad their own content so this fixed bar never
 *    occludes the last element (OnboardingWizard adds the bottom padding).
 *  - `back` omitted → a hidden spacer holds the slot so `primary` (via `ml-auto`
 *    on its wrapper) keeps its right-edge position.
 */
export function WizardFooter({
  back,
  center,
  primary,
}: {
  back?: React.ReactNode;
  center?: React.ReactNode;
  primary: React.ReactNode;
}) {
  return (
    <div
      data-testid="wizard-footer"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 backdrop-blur"
    >
      <div
        data-testid="wizard-footer-inner"
        className="mx-auto flex w-full max-w-[1600px] flex-wrap items-end gap-x-4 gap-y-2 px-page-pad-mobile pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-page-pad-desktop"
      >
        {back ?? (
          <span
            data-testid="wizard-footer-back-spacer"
            aria-hidden="true"
            className="min-h-tap-min"
          />
        )}
        {center ? <div className="mx-auto">{center}</div> : null}
        <div className="ml-auto flex items-end">{primary}</div>
      </div>
    </div>
  );
}
