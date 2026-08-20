// FIXTURE — AC-1: the classifier's FINAL FALLTHROUGH. A surface held in an array literal is matched by no earlier arm, and the mutation gate proved that arm unreached: its report statement was removable with the corpus green.
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
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  const held = [ch];
  if (!authorizeOnce() || held.length === 0) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
