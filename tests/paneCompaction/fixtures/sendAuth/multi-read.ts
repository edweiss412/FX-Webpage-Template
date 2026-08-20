// FIXTURE — AC-7: TWO straight-line reads of the SAME method report MULTI-READ naming BOTH lines. Two values read at different instants can disagree; one cannot.
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
    const first = ch.panes();
    const snap: Channel = { ...ch };
    const second = ch.panes();
    return first.length === second.length && snap.memo("/") !== null;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
