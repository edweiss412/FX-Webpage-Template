// FIXTURE — AC-U13: a VALUE REFERENCE carrying a `name` is a USE, not a
// declaration.
//
// `{ ch }` is a ShorthandPropertyAssignment and `export { ch }` is an
// ExportSpecifier. BOTH carry a `name` property whose value IS the identifier,
// so any rule shaped as "the identifier is its parent's name" skips them into
// SILENCE — and the shipped scanner reports them today. That is the regression a
// denylist-shaped replacement would introduce, which is why the accept-set's
// default is USE.
//
// THIS FIXTURE IS A GUARD, NOT A RED: it must report BEFORE and AFTER the
// accept-set lands. A widening that reaches these is a widening into the silent
// direction.
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

declare const ch: Channel;

export { ch };

export function settle(): number {
  void Object.values({ ch });
  ch.dispatch("p1", "/compact");
  return 0;
}
