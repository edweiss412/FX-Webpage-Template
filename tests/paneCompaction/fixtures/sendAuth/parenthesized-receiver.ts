// FIXTURE — diff r2 F2: a PARENTHESIZED receiver, `(this.ch).dispatch(...)`.
//
// Parentheses are a transparent wrapper: they change no meaning and no evaluation
// order here, so a reader sees the same call `class-field-sink` carries. The sink
// walk did not, because it inspected the callee's expression NODE and a
// ParenthesizedExpression is neither an identifier nor a property access — so
// discovery missed it AND the default-deny arm missed it, and the module reported
// nothing at all.
//
// Its positive pair is `class-field-sink`, identical but for the parentheses.
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
    // The parentheses ARE the fixture. Prettier normalises a redundant wrapper away,
    // which would silently convert this case into a duplicate of `class-field-sink`
    // and retire the only coverage of the unwrapping arm — a formatter quietly
    // deleting the construct under test. The directive sits IMMEDIATELY above the
    // line, because anything between it and the code detaches it.
    // prettier-ignore
    (this.ch).dispatch("p1", "/compact");
  }
}
