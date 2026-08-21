// FIXTURE — AC-5: a marker token inside a STRING LITERAL is not a declaration.
//
// The impostor sits IMMEDIATELY ABOVE a pass-shaped declaration, which is what
// makes it discriminating: a line-regex over the function span attaches it to
// `authorizeOnce` and reports this module CLEAN. Extraction through
// `commentRanges` sees a protected string range, finds no marker, and reports
// UNDECLARED-PASS. Above an ordinary statement both implementations agree, and
// the fixture would prove nothing.
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
  const banner = "// send-auth: pass";
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  ch.emit(banner);
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
