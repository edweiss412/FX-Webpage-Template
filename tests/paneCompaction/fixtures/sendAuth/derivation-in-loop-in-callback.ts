// FIXTURE — a derivation under TWO blocking ancestors reports ONCE. The straight-line walk stops at the first, and without that stop it emits one finding per enclosing loop or function — duplicates that no single-ancestor fixture can see.
//
// Added by the Task 8 mutation gate.
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
    const take = (): number => {
      let seen = 0;
      for (let i = 0; i < 2; i += 1) {
        const snap: Channel = { ...ch };
        seen = snap.panes().length;
      }
      return seen;
    };
    return take() > 0;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
