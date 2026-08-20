// FIXTURE — AC-1: a COMPUTED member access. The member is not knowable from the source text, so the use cannot be classified.
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

export function settle(ch: Channel, key: "panes"): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  const picked = ch[key];
  if (!authorizeOnce() || picked().length === 0) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
