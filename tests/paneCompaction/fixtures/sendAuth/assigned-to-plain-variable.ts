// FIXTURE — the surface ASSIGNED to a plain variable, which is an unclassifiable use
// and must report.
//
// It is the second negative half of the `this.ch = injected` exemption, and it kills
// a different weakening than `binding-in-comparison` does. That exemption is a
// five-part conjunction; weakening the connector after the OPERATOR test yields
// `(isBinaryExpression && operatorIsEquals) || (rest)`, so ANY `=` assignment
// mentioning the surface is exempted regardless of what it assigns INTO. Here the
// target is a plain identifier rather than a property of `this`, so the shipped
// conjunction reports and the weakened one falls silent.
//
// `binding-in-comparison` cannot reach this: its operator is `!==`, so the first
// disjunct is false there and the mutant behaves exactly like the original.
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

// The binding is assigned and never read ON PURPOSE — that IS the shape under test —
// so the unused-variable rule is suppressed at LINE granularity rather than by
// renaming to the `_`-prefixed form the rule would accept. A rename would change the
// name the scanner REPORTS, which is the value this fixture asserts.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare let holder: Channel;

export function stash(ch: Channel): void {
  holder = ch;
}
