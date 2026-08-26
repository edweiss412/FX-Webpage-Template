/**
 * tests/specLintGate/_gateCases.ts — the ONE case table both implementations run.
 *
 * Shared rather than duplicated so the parity suite cannot drift from the unit
 * suite, and DERIVED-checked rather than enumerated-and-trusted: the parity suite
 * asserts this table produces every outcome the core can return, so a branch
 * added to the gate without a case here reds instead of passing unobserved.
 * `tests/reviewRounds/_arcFixtures.ts` feeding `bridgeParity.test.ts` is the
 * precedent.
 */
import type { GateInput } from "../../lib/specLintGate/gate";

export interface GateCase {
  readonly name: string;
  readonly input: GateInput;
}

/** A report block whose summary line the gate can read. */
const block = (hard: number, advisory = 0) =>
  [
    "spec:lint docs/x.md",
    "kind: plan (inferred)",
    "",
    `summary: ${hard} hard, ${advisory} advisory`,
  ].join("\n");

export const GATE_CASES: readonly GateCase[] = [
  {
    name: "spec, no reports -> refuse (coverage arm)",
    input: { stage: "spec", reports: [], waived: false },
  },
  {
    name: "plan, no reports -> refuse (coverage arm covers both gated stages)",
    input: { stage: "plan", reports: [], waived: false },
  },
  {
    name: "spec, one clean report -> proceed",
    input: { stage: "spec", reports: [{ rel: "a.md", block: block(0) }], waived: false },
  },
  {
    name: "spec, advisory-only report -> proceed (advisory NEVER blocks)",
    input: { stage: "spec", reports: [{ rel: "a.md", block: block(0, 9) }], waived: false },
  },
  {
    name: "spec, one hard report -> refuse (enforcement arm)",
    input: { stage: "spec", reports: [{ rel: "a.md", block: block(3) }], waived: false },
  },
  {
    name: "spec, CLEAN FIRST then hard -> refuse (ranges over every report, not the first)",
    input: {
      stage: "spec",
      reports: [
        { rel: "clean.md", block: block(0) },
        { rel: "hard.md", block: block(2) },
      ],
      waived: false,
    },
  },
  {
    name: "spec, several hard -> refuse naming ALL of them",
    input: {
      stage: "spec",
      reports: [
        { rel: "a.md", block: block(1) },
        { rel: "b.md", block: block(4) },
      ],
      waived: false,
    },
  },
  {
    name: "spec, unreadable summary -> refuse as infra fault, NOT as zero",
    input: {
      stage: "spec",
      reports: [{ rel: "a.md", block: "spec:lint docs/x.md\nkind: plan\n\nsummary: banana" }],
      waived: false,
    },
  },
  {
    name: "spec, unreadable BEFORE a hard one -> the infra fault is reported alone",
    input: {
      stage: "spec",
      reports: [
        { rel: "weird.md", block: "spec:lint docs/x.md\nkind: plan\n\nsummary: banana" },
        { rel: "hard.md", block: block(5) },
      ],
      waived: false,
    },
  },
  {
    name: "spec, hard but waived -> proceed",
    input: { stage: "spec", reports: [{ rel: "a.md", block: block(3) }], waived: true },
  },
  {
    name: "spec, no reports and waived -> proceed",
    input: { stage: "spec", reports: [], waived: true },
  },
  {
    name: "diff stage with no reports -> proceed (ungated)",
    input: { stage: "diff", reports: [], waived: false },
  },
  {
    name: "diff stage with a hard report -> proceed (ungated)",
    input: { stage: "diff", reports: [{ rel: "a.md", block: block(7) }], waived: false },
  },
  {
    name: "task stage with a hard report -> proceed (ungated)",
    input: { stage: "task", reports: [{ rel: "a.md", block: block(7) }], waived: false },
  },
];
