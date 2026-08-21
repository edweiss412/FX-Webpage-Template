// FIXTURE — AC-U3: a RAW HANDOFF through a PARENTHESIZED argument.
//
// `helper((ch))` is `helper(ch)` to every reader. D5 inspected the argument node
// without unwrapping, so the wrapper silenced it.
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

declare function helper(c: Channel): void;

export function settle(ch: Channel): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    // The redundant parentheses ARE the fixture: prettier deletes them, which
    // would silently convert this into a duplicate of the bare form and retire
    // the only coverage of the outward transparent walk.
    // prettier-ignore
    helper((ch));
    return snap.memo("/") !== null;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
