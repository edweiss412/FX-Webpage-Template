// FIXTURE — AC-U4, scope kind 3 of 4: a NESTED BLOCK re-declares the name with a
// SURFACE-TYPED initializer.
//
// A block is not function-like at all, so an ancestor walk keyed on `isFunctionLike`
// could never see this however many function kinds it listed.
//
// The block declaration is NOT a derivation -- its initializer neither spreads
// the surface nor calls a declared helper -- because a second derivation would
// make MULTI-DERIVATION decide the observation and the fixture would report
// whether or not rule B worked. Per fixture, ask which rule DECIDES.
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

export function settle(ch: Channel, other: Channel): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    {
      const snap: Channel = other;
      void snap;
    }
    const a = snap.panes();
    const b = snap.panes();
    return a.length === b.length;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
