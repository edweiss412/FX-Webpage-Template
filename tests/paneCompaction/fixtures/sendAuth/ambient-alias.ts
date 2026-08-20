// FIXTURE — AC-1: a BARE AMBIENT ALIAS. The exemption is for a callback HANDOFF, not for every mention of an ambient member — otherwise an ambient member could be aliased and called twice invisibly.
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
  const clock = ch.clock;
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", String(clock()));
  return 0;
}
