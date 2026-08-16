/**
 * Fixture builders for the pane-compaction suites.
 *
 * Two properties are deliberate and load-bearing:
 *
 * 1. **Pressure is derived THROUGH the parser.** A builder renders tenths into
 *    the glyph the TUI would draw and then parses it back, so a fixture cannot
 *    assert a pressure the parser could never produce. Passing `tenths` straight
 *    into the classifier would test it in a different universe from the parser,
 *    and the anchored-gauge defect would be invisible to every case here.
 * 2. **No shared mutable defaults.** Every value a case depends on is set by
 *    that case. A shared fixture is the easiest way to commit the premise
 *    adjacency failure, where a case proves something about its neighbour's
 *    inputs rather than its own.
 */
import {
  type ObservedPane,
  type PositionCost,
  parseGauge,
} from "@/scripts/lib/pane-compaction-core";

/** Render tenths into the glyph the TUI would draw. */
export function gaugeFor(tenths: number): string {
  if (tenths < 0 || tenths > 10) throw new Error(`tenths out of range: ${tenths}`);
  const full = Math.floor(tenths / 2);
  const half = tenths % 2;
  const empty = 5 - full - half;
  return `Opus 5 ctx ${"█".repeat(full)}${"▓".repeat(half)}${"░".repeat(empty)} 5h`;
}

/** Tenths, round-tripped through the real parser. Throws if they disagree. */
export function pressureOf(tenths: number): number {
  const parsed = parseGauge(gaugeFor(tenths));
  if (parsed !== tenths) {
    throw new Error(`fixture cannot express ${tenths}: parser read ${String(parsed)}`);
  }
  return parsed;
}

export type PaneOverrides = Partial<Omit<ObservedPane, "tenths">> & { tenths?: number | null };

export function aPane(overrides: PaneOverrides = {}): ObservedPane {
  const { tenths, ...rest } = overrides;
  return {
    paneId: "wM:p1",
    branch: "feat/example",
    duplicateName: false,
    status: "working",
    owned: true,
    contested: false,
    rejectedField: null,
    sessionMismatch: false,
    ghFault: false,
    blockedOn: "",
    position: "Lowest" as PositionCost,
    tenths: tenths === null ? null : pressureOf(tenths ?? 0),
    ...rest,
  };
}

/** Two panes sharing a name, for the duplicate-name ordering cases. */
export function aRoster(
  opts: {
    duplicateName?: string;
    resolvesToBranch?: boolean;
    tenths?: number;
    position?: PositionCost;
  } = {},
): ObservedPane[] {
  if (opts.duplicateName === undefined) {
    return [
      aPane({ paneId: "wM:p1", tenths: 2 }),
      aPane({ paneId: "wM:p2", tenths: 6, branch: "fix/other" }),
    ];
  }
  const t = opts.tenths ?? 6;
  const branch = opts.resolvesToBranch === false ? null : opts.duplicateName;
  const position = opts.position ?? "Lowest";
  return [
    aPane({ paneId: "wM:p1", branch, duplicateName: true, tenths: t, position }),
    aPane({ paneId: "wM:p2", branch, duplicateName: true, tenths: t, position }),
  ];
}
