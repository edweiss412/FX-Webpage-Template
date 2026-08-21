// FIXTURE — diff r4 F1, and the ONE half of it that is a defect.
//
// An unclassified member reached through a PROPERTY-ACCESS receiver. The bare form
// `ch.typo()` reports UNCLASSIFIED-USE; `this.ch.typo()` reported NOTHING, because
// the classifier walks IDENTIFIERS and `ch` inside `this.ch` is a property NAME,
// which it skips — and no arm caught the call afterwards.
//
// THE DISCRIMINATOR IS THE BARE CONTROL, NOT INTUITION. Probed side by side before
// the repair: bare `ch.typo()` -> 1 finding, `this.ch.typo()` -> 0. Probed in the
// same run, `ch.panes()` outside a pass -> 0 and `this.ch.panes()` -> 0, which AGREE:
// a read outside a declared pass is unconstrained by rule 2, so that pair is the rule
// working, not a second defect. The repair is therefore the narrow one the asymmetry
// names — decline through a property receiver must REPORT exactly where decline
// through a bare identifier already does — and NOT a blanket report on member reads,
// which would have fired on correct code.
//
// Authored against the `Channel` row; no live spelling appears anywhere.

export type Channel = {
  panes(): string[];
  gauge(id: string): string;
  memo(cwd: string): Record<string, unknown> | null;
  claim(branch: string): string[];
  dispatch(target: string, text: string): void;
  emit(line: string): void;
  trace(line: string): void;
  clock(): number;
};

export class Driver {
  private ch: Channel;

  constructor(injected: Channel) {
    this.ch = injected;
  }

  settle(): void {
    // @ts-expect-error — `typo` is DELIBERATELY absent from `Channel`. That absence is
    // the case under test: a member the type does not declare cannot be classified,
    // and the scanner's rule is that silence is never a certificate. A fixture that
    // typechecks by adding the member to the type would test nothing.
    this.ch.typo();
  }
}
