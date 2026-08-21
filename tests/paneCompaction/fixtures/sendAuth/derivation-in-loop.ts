// FIXTURE — AC-7b: the round-3 F1 shape — the DERIVATION DECLARATION under a two-iteration loop. The round-2 design exempted it on a TEMPORAL argument ("evaluated once per pass") and this scanned clean; the exemption is now POSITIONAL.
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
    let ok = false;
    for (let i = 0; i < 2; i += 1) {
      const snap: Channel = { ...ch };
      ok = snap.panes().length > 0;
    }
    return ok;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
