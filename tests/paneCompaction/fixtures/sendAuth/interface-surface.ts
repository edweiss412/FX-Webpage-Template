// FIXTURE — AC-4: the surface type declared as an INTERFACE.
//
// Added by the Task 8 mutation gate: the entire `interface` branch of the read-set
// derivation was REMOVABLE with the corpus still green, because every other
// fixture spells its surface as a type alias. A scanner understanding only one
// spelling returns an EMPTY read set — silently — against a module using the other.

export interface Channel {
  panes(): string[];
  gauge(id: string): string;
  memo(cwd: string): Record<string, unknown> | null;
  claim(branch: string): string[];
  dispatch(target: string, text: string): void;
  emit(line: string): void;
  trace(line: string): void;
  clock(): number;
}

export function settle(ch: Channel): number {
  ch.dispatch("p1", "/compact");
  return 0;
}
