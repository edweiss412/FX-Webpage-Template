// FIXTURE — a sink called from a NAMED FUNCTION nested inside a class method.
//
// The finding must name `inner`, the nearest enclosing named construct, not `run`.
// The naming walk checks a method arm BEFORE a function-declaration arm, so a mutant
// that stops the function-declaration arm from matching does not fail loudly — it
// silently reports the METHOD instead, which is a different and wronger answer.
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
  private held: Channel;

  constructor(injected: Channel) {
    this.held = injected;
  }

  run(): void {
    const ch: Channel = this.held;
    function inner(): void {
      ch.dispatch("p1", "/compact");
    }
    inner();
  }
}
