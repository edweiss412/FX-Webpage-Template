/**
 * tests/styles/subtleInteractiveScan.ts
 *
 * The D2 policy scan (spec §4.4): every in-scope interactive element whose
 * resolved className carries `text-text-subtle` as a RESTING color.
 *
 * It adds nothing to the corpus walk — scope, resolution and the path model all
 * come from `interactiveScanCore`, so this guard and the tap-height guard can
 * never disagree about what counts as interactive (spec §4.4).
 *
 * BARE TOKEN ONLY. `hover:text-text-subtle` and `data-[…]:text-text-subtle` are
 * not hits: DESIGN.md §1.1's rule is about the color an action target RESTS at,
 * and a variant-prefixed token is a state, not the rest.
 *
 * DOCUMENTED LIMIT — the token must be on the CONTROL'S OWN className. A control
 * that paints its label through a nested `<span>` (the onboarding wizard's step
 * pills, `components/admin/OnboardingWizard.tsx`) is invisible to this scan: the
 * span is not itself an in-scope element, and the button's own className does not
 * carry the token. So the registry's 15 rows are the sites the POLICY can see,
 * not a census of every pixel that renders subtle inside something clickable.
 * Widening to descendants means every span inside every control, which is a
 * different guard with a different census — it is a scope decision, not a bug fix
 * (invariant-8 critique round 2, P3, 2026-08-14).
 *
 * That axis became EXPRESSIBLE on 2026-08-26: `scanInteractiveElements` takes a
 * declared `paintedChildren` option, and the two control-outline guards read it.
 * This scan still does not, and the decision above is why. The limit is now a
 * choice one line from being reversed rather than a thing the scanner cannot do,
 * so a later reader should not read "cannot" here where the truth is "does not".
 */
import { allStrings, scanInteractiveElements } from "./interactiveScanCore";

export type SubtleHit = {
  file: string;
  line: number;
  tag: string;
  token: string;
  partial: boolean;
};

/**
 * The policed token. A field rather than an implicit constant so a future
 * second policed token cannot alias registry rows (plan R1 F5).
 */
const POLICED_TOKEN = "text-text-subtle";

const RESTING = new RegExp(`(^|\\s)${POLICED_TOKEN}(\\s|$)`);

export function scanSubtleInteractive(rootDir: string): SubtleHit[] {
  return scanInteractiveElements(rootDir)
    .filter((el) => allStrings(el).some((str) => RESTING.test(str)))
    .map((el) => ({
      file: el.file,
      line: el.line,
      tag: el.tag,
      token: POLICED_TOKEN,
      // The hit itself is proven; `partial` records that some OTHER part of the
      // same className was unreadable (spec §10's non-provable direction).
      partial: el.unresolved,
    }));
}
