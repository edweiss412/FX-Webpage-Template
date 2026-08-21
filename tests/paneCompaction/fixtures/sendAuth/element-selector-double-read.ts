// FIXTURE — the SELECTOR killer, second half: a doubled read whose MEMBER is
// selected by element access.
//
// Under a receiver-only unification `ch["panes"]()` twice reports the BINDING
// twice instead of MULTI-READ naming `panes` — the wrong-attribution direction
// rather than silence, which is why one killing case does not stand in for the
// other. The bare `gauge` pair in the SAME pass is the control.
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

export function settle(ch: Channel, local: Channel): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const first = ch["panes"]();
    const second = ch["panes"]();
    const g1 = local.gauge("a");
    const g2 = local.gauge("b");
    const snap: Channel = { ...local };
    return first.length === second.length && g1 === g2 && snap.memo("/") !== null;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
