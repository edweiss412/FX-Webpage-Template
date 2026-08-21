// FIXTURE — the marker attaches to the send-bearing function ITSELF. The containment test must accept a function as lexically within itself, and the pass name must come from a FunctionDeclaration rather than a variable declaration — two arms the corpus never exercised while every pass was a nested arrow.
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

// send-auth: pass
export function settle(ch: Channel): number {
  if (ch.panes().length === 0) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
