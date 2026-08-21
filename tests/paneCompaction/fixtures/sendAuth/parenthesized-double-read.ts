// FIXTURE — AC-U3: a doubled read through a PARENTHESIZED receiver.
//
// Transparency is SYMMETRIC. Rule A unwraps the receiver EXPRESSION; the mirror
// is needed from the identifier OUTWARD, because `classify` branches on
// `id.parent` and a parenthesized parent matches NO branch — so the reference
// fell through to the generic report and named the BINDING where the member was
// owed. That is D6, and D6 was not in the design's first draft: the depth probe
// found it, which is why an independence proof is a DERIVED cover over decision
// sites and a site list is a hand-maintained one.
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
    // The redundant parentheses ARE the fixture: prettier deletes them, which
    // would silently convert this into a duplicate of the bare form and retire
    // the only coverage of the outward transparent walk.
    // prettier-ignore
    const first = (ch).gauge("a");
    // prettier-ignore
    const second = (ch).gauge("b");
    const snap: Channel = { ...ch };
    return first === second && snap.memo("/") !== null;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
