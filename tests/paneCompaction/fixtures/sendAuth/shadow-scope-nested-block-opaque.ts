// FIXTURE — AC-U4, scope kind 4 of 4: a NESTED BLOCK re-declares the name with NO
// ANNOTATION.
//
// An absent annotation COMPETES: it cannot be ruled out as the surface without a
// checker, and the accept-set's complement is default-denied INTO the reporting
// direction. Paired with kind 3, this varies only the annotation.
//
// Same care as its sibling: the block declaration competes without being a
// derivation, so rule B is what decides the observation here.
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

declare function opaqueThing(): unknown;

export function settle(ch: Channel): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    {
      const snap = opaqueThing();
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
