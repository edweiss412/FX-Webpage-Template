// FIXTURE — diff r2 F1: a RAW parameter SHADOWING a derived name, in the SAME pass.
//
// `derivation-name-collision` covers the CROSS-pass case: two functions, each with
// its own pass, sharing a name. This is the same defect one scope down — the inner
// arrow takes its own `snap` parameter, which is a RAW surface binding, and the
// exemption keyed on (pass, NAME) exempts it because a derivation of that name exists
// somewhere in the same pass. Two reads of `panes` through the raw parameter then go
// unreported.
//
// Name-keyed exemptions do not fail at the boundary they were written for; they fail
// wherever the same NAME reappears meaning something else.
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
    const inner = (snap: Channel): boolean => {
      const a = snap.panes();
      const b = snap.panes();
      return a.length === b.length;
    };
    return inner(snap);
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
