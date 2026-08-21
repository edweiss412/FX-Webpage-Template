// FIXTURE — AC-U14, the OPAQUE half: a NON-LITERAL element key stays `opaque`.
//
// `this[key]` does not name its member in the source text, so resolving it would
// need the machinery the no-call-graph fence rules out. It is DECLARED SILENCE,
// not an oversight.
//
// THE POSITIVE CONTROL IS IN THIS FILE, deliberately. An expect-CLEAN fixture is
// satisfied by any implementation that fails to look — a broken parse, a wrong
// extension, an empty walk. `settleBare` reports through the ordinary bare-
// identifier route, so this module is NOT silent: exactly one finding is owed,
// and the opaque receiver contributing none is then ATTRIBUTABLE rather than
// indistinguishable from the scanner never arriving.
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

const key = "ch";

export class Driver {
  private ch: Channel;

  constructor(injected: Channel) {
    this.ch = injected;
  }

  settleOpaque(): void {
    this[key].dispatch("p1", "/compact");
  }

  settleBare(): void {
    this.ch.dispatch("p2", "/compact");
  }
}
