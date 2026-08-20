// FIXTURE — AC-8: a DECLARED helper called with something that is NOT the
// surface is not a derivation.
//
// Added by the Task 8 mutation gate. Recognizing a helper call by its CALLEE
// alone makes any `snapshotOf(...)` a derivation, and the pass then silently
// satisfies "exactly one" without ever snapshotting the surface.
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
    const seed = { id: "x" };
    const snap = snapshotOf(seed);
    return snap.id !== "" && ch.panes().length > 0;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}

function snapshotOf(source: { id: string }): { id: string } {
  return { ...source };
}
