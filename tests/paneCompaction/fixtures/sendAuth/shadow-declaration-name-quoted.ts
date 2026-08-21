// FIXTURE — diff r3: a QUOTED declaration name still competes.
//
// The count matched declarations through `isIdentifier`, so `set "snap"(...)` —
// ordinary TypeScript, and one edit from the accessor fixture — was not counted.
// The exemption survived and the pass fell SILENT.
//
// It also corrected a DISPOSITION: this site had been recorded as `grammar`,
// meaning "the field's declared type admits only `Identifier`". It does not; the
// code merely PREFILTERED with `isIdentifier`. A `grammar` claim is validated
// against the compiler's declared field type, never by reading the call site,
// and this fixture is what made that visible.
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
      set "snap"(v: Channel) {
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
