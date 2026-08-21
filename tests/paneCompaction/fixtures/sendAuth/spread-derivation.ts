// FIXTURE — AC-8: a SPREAD is a derivation, and reads THROUGH the derived binding are unconstrained. Without this case an implementation recognizing only the declared helper passes the whole set and then reports against the live tree, where the shipped memo is a spread.
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
    const snap: Channel = { ...ch, emit: () => undefined };
    return snap.panes().length > 0 && snap.panes().length < 99 && snap.memo("/") !== null;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
