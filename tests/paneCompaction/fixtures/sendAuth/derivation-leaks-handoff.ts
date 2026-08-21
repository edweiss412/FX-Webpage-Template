// FIXTURE — AC-8: a derivation exempts the READS taken through it; it does not exempt its whole INITIALIZER SUBTREE. An implementation that skips the subtree on recognizing a derivation passes every other derivation fixture and silently permits a handoff.
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
    const snap: Channel = { ...ch, memo: inspect(ch) };
    return snap.panes().length > 0;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}

function inspect(source: Channel): (cwd: string) => Record<string, unknown> | null {
  return (cwd) => source.memo(cwd);
}
