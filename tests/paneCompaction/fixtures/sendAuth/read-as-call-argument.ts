// FIXTURE — AC-2: a READ member handed on as a bare CALL ARGUMENT, not as a property value. The called-versus-referenced test must ask whether the call'\''s CALLEE is this access, not merely whether a call is nearby — otherwise a member passed as a callback reads as an invocation and is silently classified.
//
// Added by the Task 8 mutation gate, which proved the corpus could not see this.
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
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", mint(ch.memo));
  return 0;
}

function mint(read: (cwd: string) => Record<string, unknown> | null): string {
  return String(read("/"));
}
