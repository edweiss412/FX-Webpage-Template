// FIXTURE — AC-8: TWO derivations in one pass. Two snapshots are two instants, which is the defect class this whole gate exists for.
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
    const first: Channel = { ...ch };
    const second = snapshotOf(ch);
    return first.panes().length === second.panes().length;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}

function snapshotOf(source: Channel): Channel {
  return { ...source };
}
