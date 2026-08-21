// FIXTURE — a method with a SINK'S NAME on an object that is not the surface.
//
// The sink test asks two things: the callee's rightmost receiver name is a surface
// BINDING, and the member is a declared sink. A mutant weakening that conjunction to
// a disjunction keeps only the member check and fires on any `.dispatch(...)`
// anywhere — a false positive on correct code, which is the direction the
// consequence bound forbids just as firmly as silence.
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

const courier = {
  dispatch(target: string, text: string): void {
    void target;
    void text;
  },
};

export class Driver {
  run(): void {
    courier.dispatch("p1", "/compact");
  }
}
