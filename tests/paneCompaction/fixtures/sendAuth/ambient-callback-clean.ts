// FIXTURE — AC-2 false-positive guard: an AMBIENT member handed on as a callback must NOT report. The live module carries this exact shape (`random: s.random`), so a rule that reported it would fail against correct code.
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
  const token = mint({ clock: ch.clock });
  ch.dispatch("p1", token);
  return 0;
}

function mint(source: { clock: () => number }): string {
  return String(source.clock());
}
