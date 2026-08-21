// FIXTURE — AC-U15: a `satisfies` expression wrapping a sink receiver.
//
// Transparency is asked of the COMPILER, never enumerated:
// `ts.skipOuterExpressions(node, ts.OuterExpressionKinds.All)` is TypeScript's
// own answer to "which wrappers change no meaning". A hand-written wrapper list
// is the exact defect this arc exists to remove, so writing one would have been
// the defect committed inside its own repair.
//
// One fixture per wrapper KIND rather than one representative: a scanner that
// unwraps parentheses only passes a single representative while silently missing
// the other three.
//
// A transparent wrapper must not change what the guard sees. Under the shipped
// rule this module reported NOTHING AT ALL — the receiver was neither an
// identifier nor a property access, so discovery declined it and the sink walk
// suppressed on the grounds that discovery would handle it.
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
  (ch satisfies Channel).dispatch("p1", "/compact");
  return 0;
}
