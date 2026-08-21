// FIXTURE — the marker skips a following COMMENT RUN to reach the declaration. '\''Immediately above'\'' is a source-text relation, and a scanner that stops at the first non-whitespace byte lands on a comment and attaches to nothing.
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
  // A second comment sits between the marker and the pass it declares.
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
