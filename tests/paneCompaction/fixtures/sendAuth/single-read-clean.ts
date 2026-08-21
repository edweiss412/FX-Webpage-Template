// FIXTURE — AC-6/AC-7 false-positive guard: ONE straight-line read of one method must scan CLEAN. Without this counterpart the rule is satisfiable by reporting EVERY in-pass direct read, which passes every violation fixture and fails the live tree.
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
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const panes = ch.panes();
    const snap: Channel = { ...ch };
    return panes.length > 0 && snap.memo("/") !== null;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
