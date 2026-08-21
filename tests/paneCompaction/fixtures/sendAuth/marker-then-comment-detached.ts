// FIXTURE — the POSITIVE PAIR for marker-then-comment, one delta apart: the comment run is followed by something that is NOT a function, so the marker attaches to nothing and the pass stays undeclared.
//
// Added by the Task 8 mutation gate, which proved the corpus could not see this.
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
  // A second comment sits between the marker and what follows it.
  const threshold = 3;
  if (ch.panes().length < threshold) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
