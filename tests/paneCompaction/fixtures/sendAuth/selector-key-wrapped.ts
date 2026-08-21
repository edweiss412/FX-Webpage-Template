// FIXTURE — the killer for the element-key unwrap in the SELECTOR position.
//
// §3c calls the wrapped key "the same unwrap applied to a second position", and
// the corpus pinned only the FIRST: `element-key-wrapped.ts` wraps the key that
// names the RECEIVER. This wraps the key that names the SELECTED MEMBER. An
// implementation that unwraps the receiver key and not the selector key passes
// that fixture and falls SILENT here.
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
  // The parentheses around the SELECTOR key are the fixture.
  // prettier-ignore
  ch[("dispatch")]("p1", "/compact");
  return 0;
}
