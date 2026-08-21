// FIXTURE — a surface binding used in a COMPARISON, which is unclassifiable and must
// report.
//
// It is the negative half of the `this.ch = injected` exemption. That exemption is
// deliberately narrow — an assignment whose target is a property of `this` — and a
// mutant widening its conjunction to a disjunction exempts EVERY identifier whose
// parent is a binary expression, including this one, which then falls silent.
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

declare const maybe: Channel | null;

export function check(ch: Channel): boolean {
  return ch !== maybe;
}
