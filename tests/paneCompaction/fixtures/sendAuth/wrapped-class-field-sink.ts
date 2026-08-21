// FIXTURE — diff r3 F6, the one finding of that round that probed SILENT, and the
// THIRD recurrence of one axis: r1 F3 (discovery reached module-level functions
// only), r2 F2 (the callee was inspected without unwrapping parentheses), now this.
//
// One variable from `class-field-sink`: the class is declared INSIDE a module-level
// function. That single move made the module silent, because two arms disagreed
// about what a receiver is. The sink walk resolves a receiver at its RIGHTMOST NAME,
// so it saw `this.ch.dispatch` — then suppressed, on the grounds that the call sits
// inside a discovered top-level function and primary discovery would handle it.
// Discovery marked a function send-bearing only when the receiver was a BARE
// IDENTIFIER, so it declined that very call. Suppressed by one arm, skipped by the
// other, reported by neither.
//
// The repair is the NARROWING the axis mandates, not a wider recognizer: the
// classification is computed ONCE and both arms consume it, so suppression can only
// rest on a classification that actually happened, and a form discovery cannot
// classify REPORTS instead of vanishing.
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

export function build(injected: Channel): void {
  class Driver {
    private ch: Channel;

    constructor(given: Channel) {
      this.ch = given;
    }

    settle(): void {
      this.ch.dispatch("p1", "/compact");
    }
  }

  new Driver(injected).settle();
}
