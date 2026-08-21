// FIXTURE — the fifth receiver shape: a CALL RESULT, which is DECLARED SILENCE.
//
// `getChannel().dispatch(...)` genuinely cannot be resolved without knowing what
// a call returns, which is the machinery the ratified no-call-graph fence rules
// out. So it is `opaque` — and `opaque` is silent BY DESIGN, not by oversight.
//
// This is the boundary that makes the whole rule defensible, and it is exactly
// where a reviewer should press: a STATIC element key names its member in the
// bytes and therefore resolves, while a call result does not name it at all.
// Collapsing the two is what left a real surface sink silent; separating them is
// what keeps this case from re-opening the fence.
//
// THE CONTROL IS IN THIS MODULE. `settleBare` reports through the ordinary
// route, so the call-result receiver's silence is ATTRIBUTABLE rather than
// indistinguishable from a scanner that never looked — an expect-CLEAN verdict
// is otherwise satisfied by any implementation that fails to look.
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

declare function getChannel(): Channel;

export function settleOpaque(): void {
  getChannel().dispatch("p1", "/compact");
}

export function settleBare(ch: Channel): void {
  ch.dispatch("p2", "/compact");
}
