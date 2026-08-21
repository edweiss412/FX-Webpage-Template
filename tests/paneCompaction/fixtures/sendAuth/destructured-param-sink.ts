// FIXTURE — diff r1 F2: the surface DESTRUCTURED in a parameter position.
//
// `settle({ dispatch }: Channel)` calls the sink through a bare local, so there is
// no property access on a binding for any member-based arm to inspect and every one
// of them is blind to it. The arm that reports it walks parameters and variable
// declarations annotated with the surface type and names each BOUND MEMBER.
//
// This fixture exists because the arm shipped WITHOUT one: the case lived only in a
// scratch probe, so four mutants survived — the report itself, the recursion, the
// entry call, and the parameter/variable disjunct — and the suite was green. A fix
// with no case is a claim.
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

export function settle({ dispatch }: Channel): number {
  dispatch("p1", "/compact");
  return 0;
}
