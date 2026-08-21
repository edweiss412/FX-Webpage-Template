// FIXTURE — the ScriptKind discriminator. It must REPORT `UNDECLARED-PASS`.
//
// `commentRanges` REQUIRES its caller to pick the kind by extension, and its own
// header records why: read as TSX, `<T>(x: T) => x` opens a JSX element and
// swallows the rest of the file.
//
// THE DIRECTION HERE IS DELIBERATE, and an earlier draft had it backwards. That
// draft carried a real marker after the generic arrow and expected CLEAN — which
// discriminates NOTHING, because under the wrong kind the parse is garbage and
// NO top-level function is found at all, so the scanner returns the empty set by
// a completely different route and the case passes either way. Measured: a
// hardcoded-TSX variant run against the whole corpus reported ALL VERDICTS
// MATCH.
//
// Written to REPORT instead, the coincidence is gone. Under the correct kind
// `settle` is send-bearing with no declared pass and reports; under a hardcoded
// kind it does not parse as a function and the module falls SILENT. Silence on a
// module that should report is the fail-open direction, which is the strongest
// statement this fixture can make.
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

// The BARE `<T>` is the fixture. Prettier rewrites it to `<T,>`, and that
// trailing comma is precisely what disambiguates a generic parameter from a
// JSX open tag — so the reformatted bytes would parse cleanly under BOTH
// kinds and this fixture would stop discriminating the ScriptKind selection
// at all, while still being present and still passing. The directive sits
// IMMEDIATELY above the line, because anything between it and the code
// detaches it.
// prettier-ignore
const identity = <T>(x: T): T => x;

export function settle(ch: Channel): number {
  ch.dispatch("p1", identity("/compact"));
  return 0;
}
