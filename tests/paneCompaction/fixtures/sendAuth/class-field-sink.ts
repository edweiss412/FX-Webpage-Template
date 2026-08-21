// FIXTURE — rule 28: a class HOLDING the surface, reaching the sink through
// `this.ch`. Ordinary authoring inside the threat fence, and silent until diff r1.
//
// It kills two implementations at once. One that binds only PARAMETERS and VARIABLE
// declarations never sees `ch` as a surface binding at all. One that binds the
// property but requires the call's receiver to be a bare IDENTIFIER declines
// `this.ch.dispatch(...)`, because the receiver is a property access — so the
// receiver is taken at its RIGHTMOST NAME instead.
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

  // The parameter is DELIBERATELY named differently from the field. Named `ch` too,
  // the constructor PARAMETER is a surface binding on its own and `this.ch.dispatch`
  // resolves through it — so the fixture passed whether or not property
  // declarations bind, and the killer audit said so by leaving that mutant alive.
  // A different rule was deciding the observation.
  constructor(injected: Channel) {
    this.ch = injected;
  }

  settle(): void {
    this.ch.dispatch("p1", "/compact");
  }
}
