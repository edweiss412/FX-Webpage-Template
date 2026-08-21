// FIXTURE — AC-U4, scope kind 2 of 4: a SET ACCESSOR name re-declares the name.
//
// An accessor's NAME is a declaring position, and the four-kind list at BASE did
// not include it. Counting declarations reaches it without a scope model.
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
    class Holder {
      set snap(v: Channel) {
        void v;
      }
    }
    void Holder;
    const a = snap.panes();
    const b = snap.panes();
    return a.length === b.length;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
