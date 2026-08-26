/**
 * tests/specLintGate/bridgeParity.test.ts — the bridge is a MIRROR, executably.
 *
 * `scripts/codex-guard.mjs` must run as bare `node`, so it imports
 * `scripts/specLintGate.mjs` rather than the TypeScript core. That makes the
 * bridge the code LIVE DISPATCHES actually run, while every unit test exercises
 * the core. The failure this pins is the gap between them: the bridge losing a
 * branch of the contract while the TypeScript suite stays green.
 *
 * For THIS contract that gap is not abstract. A bridge that defaulted an
 * unreadable `summary:` line to zero, while the core refuses it, would dispatch a
 * hard artifact silently on the exact path a real review takes — and no unit test
 * of the core would notice.
 *
 * The case table is SHARED with the unit suite and its coverage is ASSERTED
 * rather than assumed: a branch added to the gate without a case here reds. That
 * is the half a fixed enumeration always loses, because a later task adds a
 * branch and nobody remembers to extend the list.
 */
import { describe, expect, it } from "vitest";

import { decide as tsDecide, hardCountOf as tsHardCountOf } from "../../lib/specLintGate/gate";
// The wrapper runs this copy. Vitest imports the .mjs directly; no build step.
import { decide as jsDecide, hardCountOf as jsHardCountOf } from "../../scripts/specLintGate.mjs";
import { GATE_CASES } from "./_gateCases";

describe("bridge parity: scripts/specLintGate.mjs vs lib/specLintGate/gate.ts", () => {
  it("has cases at all (a scan of nothing proves nothing)", () => {
    expect(GATE_CASES.length).toBeGreaterThanOrEqual(10);
  });

  it.each(GATE_CASES.map((c) => [c.name, c] as const))("agrees on %s", (_name, c) => {
    const ts = tsDecide(c.input);
    // The bridge is plain JS, so its return type is not the discriminated union.
    // Reading it as a bag of fields keeps the comparison honest — a cast would
    // assert the very shape under test — and keeps this file strict-clean.
    const js: Record<string, unknown> = jsDecide(c.input);
    expect(js.kind).toBe(ts.kind);
    // The MESSAGE is part of the contract, not decoration: it is what names the
    // failing file and its hard count to the operator, and a bridge that refused
    // with different text would still pass a kind-only comparison.
    expect(js.message ?? null).toBe(ts.kind === "refuse" ? ts.message : null);
  });

  it("the shared table reaches every outcome the core can return", () => {
    // Derived, not trusted. A gate branch added without a case here makes this
    // fail, which is the property an enumerated list cannot have.
    const kinds = new Set(GATE_CASES.map((c) => tsDecide(c.input).kind));
    expect([...kinds].sort()).toEqual(["proceed", "refuse"]);

    // Refusal REASONS are a second axis the kind alone hides: coverage,
    // enforcement and infra-fault all return `refuse`, so a table that lost the
    // infra-fault case would still satisfy the assertion above.
    const messages = GATE_CASES.map((c) => tsDecide(c.input))
      .filter((d): d is { kind: "refuse"; message: string } => d.kind === "refuse")
      .map((d) => d.message);
    expect(messages.some((m) => m.includes("requires at least one --lint-doc"))).toBe(true);
    expect(messages.some((m) => m.includes("hard spec:lint failures"))).toBe(true);
    expect(messages.some((m) => m.includes("no readable summary count"))).toBe(true);

    // R1 finding 2: an unreadable report must not SUPPRESS the hard failures in
    // the same dispatch. Asserted on the combined case specifically, because the
    // three reason-presence checks above are all satisfied by a message that
    // names only one class.
    const combined = GATE_CASES.find((c) => c.name.includes("unreadable AND hard"));
    expect(combined, "the combined case must exist").toBeDefined();
    const d = tsDecide(combined!.input);
    expect(d.kind).toBe("refuse");
    const msg = d.kind === "refuse" ? d.message : "";
    expect(msg).toContain("no readable summary count");
    expect(msg).toContain("hard spec:lint failures");
    expect(msg).toContain("hard.md");
  });

  it("agrees on hardCountOf, including that null is NOT zero", () => {
    const blocks = [
      "summary: 0 hard, 0 advisory",
      "summary: 12 hard, 3 advisory",
      "summary: banana",
      "no summary line at all",
      "  summary: 1 hard, 0 advisory", // indented: not a summary line
    ];
    for (const b of blocks) expect(jsHardCountOf(b)).toBe(tsHardCountOf(b));
    // Pinned explicitly, because coercing null to 0 is the exact silent-dispatch
    // defect this whole arm exists to prevent.
    expect(tsHardCountOf("summary: banana")).toBeNull();
    expect(jsHardCountOf("summary: banana")).toBeNull();
  });
});
