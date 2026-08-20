// FIXTURE — the POSITIVE PAIR for `conditional-pass.ts`.
//
// Byte-for-byte the same module apart from the missing `// send-auth: pass`
// line, and it must REPORT `UNDECLARED-PASS`.
//
// Why the pair exists: `conditional-pass.ts` expects CLEAN, and an expect-CLEAN
// fixture is satisfied by ANY implementation that fails to LOOK — a broken
// parse, a wrong ScriptKind, an empty walk, a discovery step that threw. On its
// own it cannot tell 'the scanner examined this module and correctly declined to
// analyze control flow' from 'the scanner never got here'. Measured on this very
// corpus: a hardcoded-ScriptKind variant passed EVERY fixture precisely because
// an expect-CLEAN case agreed with a garbage parse.
//
// With this pair, silence can no longer be mistaken for correctness: the same
// machinery, on the same shape, must produce a finding when the declaration is
// absent. AC-15's clean result then means what it claims.
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

export function settle(ch: Channel, json: boolean): number {
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  const ok = json ? authorizeOnce() : true;
  if (!ok) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
