// FIXTURE — AC-5: two declared passes in one send-bearing function is AMBIGUOUS-PASS.
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
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  // send-auth: pass
  const authorizeAgain = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.claim("main").length > 0;
  };
  if (!authorizeOnce() || !authorizeAgain()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
