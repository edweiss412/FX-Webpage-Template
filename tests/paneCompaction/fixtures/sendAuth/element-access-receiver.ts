// FIXTURE — AC-U14: a STATICALLY KNOWN element-access receiver names its member
// in the source text, so it resolves.
//
// `this["ch"]` and `` this[`ch`] `` need neither a checker nor a call graph: the
// key IS a literal in the bytes. Putting them in the same bucket as a call
// result left a real surface sink FULLY SILENT — the fail-open direction — which
// is why `opaque` means "no statically knowable name" rather than "not a bare
// identifier".
//
// Its opaque pair is `element-access-opaque-key.ts`, one variable away: the same
// shape with a non-literal key, which must stay silent.
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

export class Driver {
  private ch: Channel;

  constructor(injected: Channel) {
    this.ch = injected;
  }

  settle(): void {
    this["ch"].dispatch("p1", "/compact");
  }

  settleTemplate(): void {
    this[`ch`].dispatch("p2", "/compact");
  }
}
