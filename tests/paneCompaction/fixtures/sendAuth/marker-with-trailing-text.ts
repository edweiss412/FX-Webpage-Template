// FIXTURE — the marker grammar is LITERAL, so a comment that merely CONTAINS the
// token is not a declaration.
//
// Added after the rule-17.1 pass: an UNANCHORED matcher (`body.includes(...)`
// instead of `body === ...`) passed the entire corpus, because no fixture carried
// a comment holding the token plus anything else. The gate's operator set cannot
// express that mutation, so only building it by hand exposed the gap.
//
// This is also the executable form of the documented limit the scanner's own
// header states: a marker written with trailing text is NOT recognized, and its
// function then reports `UNDECLARED-PASS` — a surfaced report on an unrecognized
// input, never a silent pass.

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
  // send-auth: pass -- see the fence owned by the send-authorization row
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
