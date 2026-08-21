// FIXTURE — AC-8 regression pin: the ROUND-4 shape. TWO raw handoffs on ONE LINE, distinguished ONLY by callee. An "any call taking the surface is a derivation" reading silences this fixture ENTIRELY; a dedup keyed on code:file:line collapses the pair into one. Both must survive to the assertion.
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
    const seen = observeAll("p1", "main", ch, snapshotOf(ch));
    return seen.length > 0 && snap.panes().length > 0;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}

function snapshotOf(source: Channel): Channel {
  return { ...source };
}

function observeAll(id: string, branch: string, source: Channel, snap: Channel): string[] {
  return [id, branch, ...source.panes(), ...snap.panes()];
}
