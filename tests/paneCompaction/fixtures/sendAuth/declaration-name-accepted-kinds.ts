// FIXTURE — AC-U13's paired half: a REAL DECLARATION of each accepted parent
// kind must stay silent.
//
// The four-kind list at BASE missed accessor, method and property-assignment
// names, so an accessor NAMED for a surface binding was reported as a USE of it.
// Widening the accept-set is what removes that, and this fixture is what stops
// the widening being invisible.
//
// Its expect-a-REPORT pair is `declaration-name-value-references.ts`: the two
// differ in whether the `name` belongs to a DECLARATION or to a VALUE
// REFERENCE, which is the whole distinction under test.
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

declare function use(v: unknown): void;

class Holder {
  set ch(v: Channel) {
    use(v);
  }

  method(ch: Channel): void {
    use(ch);
  }
}
void Holder;

export function settle(local: Channel): number {
  local.dispatch("p1", "/compact");
  return 0;
}
