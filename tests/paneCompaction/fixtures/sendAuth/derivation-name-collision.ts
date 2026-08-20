// FIXTURE — diff r1 F1: a derivation named `snap` in ONE pass must not exempt a RAW
// binding of the same name in ANOTHER. The exemption was keyed MODULE-WIDE BY TEXT,
// which is rule 16: keyed coarser than the fact it disposes of, it absorbs every
// later arrival at the finer grain, invisibly, because the absorbed thing does not
// exist yet when the row is written.
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
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}

export function other(snap: Channel): number {
  // send-auth: pass
  const authorizeTwice = (): boolean => {
    const first = snap.panes();
    const second = snap.panes();
    return first.length === second.length;
  };
  if (!authorizeTwice()) return 1;
  // A BARE MENTION, outside the pass that derived a name of `snap` in the OTHER
  // function. `classifyUses` must still see it: under a module-wide derived set the
  // identifier is skipped and this unclassifiable use is silent.
  const held = [snap];
  if (held.length === 0) return 1;
  snap.dispatch("p2", "/compact");
  return 0;
}
