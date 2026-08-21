// FIXTURE — a sink called from a CLASS PROPERTY INITIALIZER, whose nearest enclosing
// construct has a name the naming walk deliberately does NOT use.
//
// Two things at once, and the second is the reason it exists. It is the only case
// that reaches the `(module scope)` FALLBACK: every other reported call has a method,
// function, property-assignment or variable declaration above it. And it kills the
// weakening of the function-declaration arm — as a disjunction that arm fires on ANY
// ancestor whose `.name` is defined, which here is the PropertyDeclaration `done`,
// so the mutant names `done` where the shipped walk correctly declines every arm and
// falls through.
//
// The shipped walk declines it on purpose: a property declaration is not a callable
// construct, so naming it would point an author at a declaration rather than at the
// code that runs.
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

declare const makeChannel: () => Channel;

const ch: Channel = makeChannel();

export class Driver {
  readonly done: void = ch.dispatch("p1", "/compact");
}
