// FIXTURE — AC-7b false-positive guard: a derivation ON the straight-line path, memoizing a raw read inside its own initializer. This is the SHIPPED MEMO's shape — a rule that reported it would fail against correct live code.
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
    const panes = ch.panes();
    let memoOnce: Record<string, unknown> | null | undefined;
    const snap: Channel = {
      ...ch,
      memo: (cwd) => {
        if (memoOnce === undefined) memoOnce = ch.memo(cwd);
        return memoOnce;
      },
    };
    return panes.length > 0 && snap.memo("/") !== null;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
