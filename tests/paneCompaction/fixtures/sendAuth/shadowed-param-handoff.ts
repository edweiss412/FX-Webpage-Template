// FIXTURE — diff r4 F2: diff r2 F1's defect, still live ONE ARM OVER.
//
// r2 F1 was a RAW parameter shadowing a derived name inside the same pass, and the
// repair taught the READ path to resolve it: if any scope between the use and the
// derivation re-declares the name, the use is RAW. The HANDOFF path was not taught.
// It received a set of raw NAMES — every binding minus every name some derivation in
// the pass declares — so the shadowing parameter was subtracted by NAME and its
// handoff went unreported.
//
// A NAME IS NOT AN IDENTITY, and a repair applied to one arm is not applied to the
// scanner. The handoff arm now asks the same shadow-aware question the read arm asks,
// so a binding the scanner cannot SHOW to be derived at this use is treated as RAW —
// failing closed, which is the direction the bound requires.
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

declare function leak(ch: Channel): void;

export function settle(ch: Channel): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    const inner = (snap: Channel): boolean => {
      leak(snap);
      return true;
    };
    return inner(snap);
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
