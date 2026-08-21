// FIXTURE — an unclassifiable use of the RAW binding, inside a pass that ALSO has a
// well-formed derivation.
//
// It exists because the derivation exemption's own predicate was untestable without
// it. Every other fixture that reaches `derivedAt` has either NO declared pass or a
// pass with NO derivation, and in both cases the `.some(...)` short-circuits to false
// whatever the predicate says — so a mutant could break the name comparison or the
// containment test and every case still passed. THE POPULATION REACHING A PREDICATE
// IS NOT THE POPULATION OF CASES THAT MENTION IT.
//
// Here the pass derives `snap` and separately mentions `ch` bare, so the exemption
// must decide `ch` on its NAME and reject it. Widen the comparison or the
// conjunction and `ch` becomes exempt, and this finding disappears.
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
    const held = [ch];
    return snap.panes().length > 0 && held.length > 0;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
