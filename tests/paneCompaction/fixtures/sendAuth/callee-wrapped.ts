// FIXTURE — the killer for an unwrap applied to the RECEIVER but not to the
// CALLEE as a whole.
//
// `(ch.dispatch)(...)` wraps the ENTIRE callee, not its receiver. An
// implementation that unwraps only the receiver sees a ParenthesizedExpression
// where a member access is owed, resolves no member, and falls SILENT — while
// passing every wrapped-RECEIVER case in the corpus, because those wrap a
// different node.
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

export function settle(ch: Channel): number {
  // The parentheses around the WHOLE CALLEE are the fixture.
  // prettier-ignore
  (ch.dispatch)("p1", "/compact");
  return 0;
}
