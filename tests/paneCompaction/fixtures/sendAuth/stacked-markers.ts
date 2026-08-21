// FIXTURE — rule 21.1: TWO markers stacked above ONE declaration.
//
// The multiplicity axis `ambiguous-pass.ts` does NOT reach. That fixture puts two
// markers on two DIFFERENT targets (multiplicity ACROSS targets); this one puts
// two markers on a SINGLE target, so both resolve to the same function node and
// the send-bearing function lexically contains two declared passes by a different
// route. Same code, different path, which is why neither stands in for the other.
//
// The weaker implementation it kills: one that dedupes the pass set by the node
// each marker attaches to (`new Set(passes.map((p) => p.fn))`). That collapses to
// a single pass here, reports CLEAN, and the ambiguity goes unreported — the
// fail-open direction the consequence bound forbids.
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
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
