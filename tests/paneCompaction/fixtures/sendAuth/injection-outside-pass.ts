// FIXTURE — AC-3: the SAME handoff shape OUTSIDE the pass is ordinary INJECTION and must NOT report. Without this an implementation reporting every raw-surface argument anywhere passes the round-4 fixture and fails the live tree.
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
  const seen = observeAll("p1", "main", ch, snapshotOf(ch));
  if (!authorizeOnce() || seen.length === 0) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}

function snapshotOf(source: Channel): Channel {
  return { ...source };
}

function observeAll(id: string, branch: string, source: Channel, snap: Channel): string[] {
  return [id, branch, ...source.panes(), ...snap.panes()];
}
