// FIXTURE — the CONTROL for `derivation-name-collision.ts`, one variable apart: the
// SAME second function, with the first function (whose derivation shares the name)
// removed. It reports MULTI-READ. Without this pair the collision case is satisfied
// by any implementation that reports MULTI-READ for some unrelated reason.
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

export function other(snap: Channel): number {
  // send-auth: pass
  const authorizeTwice = (): boolean => {
    const first = snap.panes();
    const second = snap.panes();
    return first.length === second.length;
  };
  if (!authorizeTwice()) return 1;
  snap.dispatch("p2", "/compact");
  return 0;
}
