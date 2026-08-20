/* eslint-disable react/jsx-no-comment-textnodes */
// FIXTURE — AC-5: a marker token inside JSX TEXT is not a declaration.
//
// The impostor sits IMMEDIATELY ABOVE a pass-shaped declaration, and that is
// what makes it discriminating: an UNANCHORED line scan sees the token on that
// line, attaches it to `authorizeOnce`, and reports this module CLEAN.
// Extraction through `commentRanges` under ScriptKind.TSX finds JsxText, which
// is protected, so there is no marker and the module reports UNDECLARED-PASS.
//
// What this fixture does NOT discriminate, stated so nobody reads more into it:
// ScriptKind SELECTION. Lexed as plain TypeScript the token's line yields the
// comment `// send-auth: pass</p>`, which no anchored marker grammar accepts,
// so a TS-only recognizer reaches the same verdict by a different route. The
// ScriptKind question is owned by `generic-arrow-scriptkind.ts`, where the
// verdict actually flips.
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
  const banner = <p>// send-auth: pass</p>;
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  if (!authorizeOnce() || banner === null) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
