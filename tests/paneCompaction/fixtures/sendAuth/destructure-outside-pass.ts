// FIXTURE — AC-1: a DESTRUCTURE in a branch OUTSIDE the pass. This is the round-2 F3 evasion, and it is why totality is module-wide rather than pass-scoped.
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

export function settle(ch: Channel, force: boolean): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  if (force) {
    const { dispatch } = ch;
    dispatch("p1", "/compact");
    return 0;
  }
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
