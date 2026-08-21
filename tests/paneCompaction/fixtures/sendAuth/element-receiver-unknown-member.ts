// FIXTURE — diff r1 F1: an UNKNOWN member through a STATIC ELEMENT-ACCESS
// receiver.
//
// RESOLVING a name and ENTERING on one are different jobs, and this is the
// second. `classifyUses` walked identifiers, so `this["ch"]` -- which names its
// binding in the source text but contains NO IDENTIFIER -- was never entered and
// the member classification never ran. `this.ch.typo()` reported and
// `this["ch"].typo()` was SILENT: the same asymmetry this arc exists to remove,
// one layer further out than rule A.
//
// THE DOTTED FORM IS THE CONTROL, in this module, one variable away. It reports
// through the route that already worked, so the element form's finding is
// attributable to the ENTRY point rather than to the scanner having run.
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

  dotted(): void {
    // @ts-expect-error — `typo` is DELIBERATELY absent from `Channel`. That absence
    // is the fixture: an UNCLASSIFIED member is what D3 is asked to report on.
    this.ch.typo();
  }

  bracketed(): void {
    // @ts-expect-error — `typo` is DELIBERATELY absent from `Channel`. That absence
    // is the fixture: an UNCLASSIFIED member is what D3 is asked to report on.
    this["ch"].typo();
  }
}
