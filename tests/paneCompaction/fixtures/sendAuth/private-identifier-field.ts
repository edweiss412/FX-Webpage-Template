// FIXTURE — diff r1 F2: a PRIVATE IDENTIFIER field holding the surface.
//
// `surfaceBindings` required the declaration's name to be an `Identifier`, so a
// `#ch` field never joined the binding set at all and every use of it resolved
// as FOREIGN -- silent, before rule A ever ran. The binding-COLLECTION side was
// keyed on one spelling while the resolution side had been unified.
//
// `PrivateIdentifier.text` carries the `#`, and the declaration and the use now
// read it through the SAME resolver, so the two agree by construction rather
// than by coincidence.
//
// The public field in this module is the control: it reported before and after.
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
  #ch: Channel;
  private open: Channel;

  constructor(injected: Channel) {
    this.#ch = injected;
    this.open = injected;
  }

  hidden(): void {
    this.#ch.dispatch("p1", "/compact");
  }

  exposed(): void {
    this.open.dispatch("p2", "/compact");
  }

  // THE UNKNOWN-MEMBER PAIR, and it exists because the sink pair above MASKED a
  // second defect. `dispatch` is a declared sink, so discovery recognises it
  // independently of the member classification -- a DIFFERENT RULE decided the
  // observation, and the entry path stayed untested while the fixture looked
  // like it covered the private form. Both diff-r2 reviewers found that
  // independently, from opposite sides of the seam.
  //
  // An UNKNOWN member has no other route: only the member classification can
  // report it, so this pair is what makes the private entry path observable.

  hiddenUnknown(): void {
    // @ts-expect-error — `typo` is DELIBERATELY absent from `Channel`. That
    // absence is the fixture: only the member classification can report it.
    this.#ch.typo();
  }

  exposedUnknown(): void {
    // @ts-expect-error — the public control, one variable away from the private form.
    this.open.typo();
  }
}
