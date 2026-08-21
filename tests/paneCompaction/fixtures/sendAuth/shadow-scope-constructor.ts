// FIXTURE — AC-U4, scope kind 1 of 4: a CONSTRUCTOR parameter re-declares the name.
//
// The deleted `shadowedBetween` walked ancestors asking whether a parameter of an
// enclosing `isFunctionLike` node re-declared the name, so it fell SILENT on every
// scope kind it did not list — fail-open, in the forbidden direction, and widening
// it one scope per round is the ratchet this arc exists to avoid.
//
// A COUNT needs no notion of scope at all, which is why it is total over this case
// and the three below without naming any of them.
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
    class Holder {
      constructor(snap: Channel) {
        void snap;
      }
    }
    void Holder;
    const a = snap.panes();
    const b = snap.panes();
    return a.length === b.length;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
