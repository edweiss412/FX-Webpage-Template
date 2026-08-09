// Focused unit coverage for the SIGNAL_TEXT_DRIFT tier (spec
// parser/2026-08-09-warning-shape-mutation-stability §11).
//
// WHY THIS FILE EXISTS. The tier landed on corpus replays and a full 8-shard run, with no
// focused tests — cross-model review called that out, and it was a real TDD-invariant
// violation: adding `|| 1` back to the occurrence extractor, or mapping the new verdict
// to the wrong alarm kind, would have passed the entire unit suite. Every arm below names
// the mutant it kills.
import { describe, expect, it } from "vitest";

import type { ParsedSheet, ParseWarning } from "@/lib/parser/types";
import { KNOWN_SILENT_HOLES } from "@/tests/parser/mutation/knownHoles";
import { newSignalFired, signalKeys, signalKeysEq, verdict } from "@/tests/parser/mutation/oracle";
import { VERDICT_ALARM_KIND } from "@/tests/parser/mutation/runShard";

const sheet = (
  warnings: ParseWarning[],
  extra: { hardErrors?: unknown[]; raw_unrecognized?: unknown[] } = {},
): ParsedSheet =>
  ({
    warnings,
    hardErrors: extra.hardErrors ?? [],
    raw_unrecognized: extra.raw_unrecognized ?? [],
    show: { title: "t" },
  }) as unknown as ParsedSheet;

const ref = (rawSnippet: string, over: Partial<ParseWarning> = {}): ParseWarning =>
  ({
    severity: "warn",
    code: "REF_ERROR_LITERAL",
    message: "m",
    rawSnippet,
    ...over,
  }) as ParseWarning;

describe("signalKeysEq — the equality tier", () => {
  it("premise: the ledger actually carries text_drift rows, so this tier is live", () => {
    // Guards the guard: if nothing were ever classified as drift, every arm here would be
    // describing a code path the harness does not reach.
    expect(KNOWN_SILENT_HOLES.some((h) => h.kind === "text_drift")).toBe(true);
  });

  it("holds when only a warning's TEXT moves (the whole point of the class)", () => {
    const a = sheet([ref("\\#REF\\!", { blockRef: { kind: "section" } })]);
    const b = sheet([ref("\\#REF\\!  Tuesday", { blockRef: { kind: "rooms" } })]);
    expect(signalKeysEq(a, b)).toBe(true);
    expect(verdict(a, b)).toBe("SIGNAL_TEXT_DRIFT");
  });

  it("FAILS when a code's count drops — the skip-one-cell regression", () => {
    // The kill-case that makes this predicate sound where an existential one was not:
    // "a warning still fires" is true here, and must not be enough.
    const a = sheet([ref("\\#REF\\!"), ref("\\#REF\\!")]);
    const b = sheet([ref("\\#REF\\!")]);
    expect(signalKeysEq(a, b)).toBe(false);
    expect(verdict(a, b)).toBe("SILENT_SIGNAL_LOSS");
  });

  it("FAILS on a warn -> info downgrade, which keeps the code and the count", () => {
    // Cross-model review, BLOCKING: severity was missing from the key. An info warning
    // drops out of operator-facing gap counts and section routing, so Doug stops seeing
    // it — signal loss wearing the multiset of drift.
    const a = sheet([ref("\\#REF\\!")]);
    const b = sheet([ref("\\#REF\\!", { severity: "info" })]);
    expect(signalKeysEq(a, b)).toBe(false);
    expect(verdict(a, b)).toBe("SILENT_SIGNAL_LOSS");
  });
});

describe("occurrence weighting", () => {
  it("counts literals, so fusing two broken cells into one preserves the total", () => {
    // Without weighting this is 2 -> 1 and reads as loss, which is what forced the tier.
    const a = sheet([ref("\\#REF\\!"), ref("\\#REF\\!")]);
    const fused = sheet([ref("\\#REF\\!  \\#REF\\!")]);
    expect(signalKeysEq(a, fused)).toBe(true);
  });

  it("has NO zero-fallback: a REF warning with no literal left is LOSS, not drift", () => {
    // The `|| 1` fallback that a naive implementation writes would call this drift. A
    // REF warning whose cleaned snippet holds zero literals IS the anomaly.
    const a = sheet([ref("\\#REF\\!")]);
    const gutted = sheet([ref("clean value")]);
    expect(signalKeysEq(a, gutted)).toBe(false);
    expect(verdict(a, gutted)).toBe("SILENT_SIGNAL_LOSS");
  });

  it("counts on the CLEANED value, since the corpus stores the escaped form", () => {
    // `\#REF\!` does not contain the substring `#REF!`; a raw-text counter reads zero.
    const escaped = sheet([ref("\\#REF\\!")]);
    const bare = sheet([ref("#REF!")]);
    expect(signalKeysEq(escaped, bare)).toBe(true);
  });

  it("leaves UNREGISTERED codes at weight 1 regardless of their text", () => {
    const a = sheet([{ severity: "warn", code: "UNKNOWN_FIELD", message: "m" } as ParseWarning]);
    const b = sheet([
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "m",
        rawSnippet: "#REF! #REF!",
      } as ParseWarning,
    ]);
    expect(signalKeysEq(a, b)).toBe(true);
  });
});

describe("the other two signal channels are in the key", () => {
  // FAULT-INJECTION GAP, found by cross-model review: the builder above pinned both of
  // these to empty arrays, so DELETING either loop from `weightedSignalKeys` left all 13
  // earlier arms green while softening a real removal from loss to drift. An assertion
  // that cannot see a channel does not cover it.
  it("a dropped HARD ERROR is loss, not drift", () => {
    const a = sheet([ref("\\#REF\\!")], {
      hardErrors: [{ code: "MI-1_VERSION_DETECTION_FAILED", message: "m" }],
    });
    const b = sheet([ref("\\#REF\\!")]);
    expect(signalKeysEq(a, b)).toBe(false);
    expect(verdict(a, b)).toBe("SILENT_SIGNAL_LOSS");
  });

  it("a dropped RAW_UNRECOGNIZED entry is loss, not drift", () => {
    const a = sheet([ref("\\#REF\\!")], {
      raw_unrecognized: [{ block: "venue", key: "k", value: "v" }],
    });
    const b = sheet([ref("\\#REF\\!")]);
    expect(signalKeysEq(a, b)).toBe(false);
    expect(verdict(a, b)).toBe("SILENT_SIGNAL_LOSS");
  });

  it("hard errors and raw_unrecognized still compare EQUAL when genuinely unchanged", () => {
    const he = [{ code: "MI-1_VERSION_DETECTION_FAILED", message: "m" }];
    const ru = [{ block: "venue", key: "k", value: "v" }];
    const a = sheet([ref("\\#REF\\!")], { hardErrors: he, raw_unrecognized: ru });
    const b = sheet([ref("\\#REF\\!  Tuesday")], { hardErrors: he, raw_unrecognized: ru });
    expect(signalKeysEq(a, b)).toBe(true);
    expect(verdict(a, b)).toBe("SIGNAL_TEXT_DRIFT");
  });
});

describe("weighting is confined to the equality tier", () => {
  it("signalKeys stays UNWEIGHTED, so newSignalFired is unaffected", () => {
    // A leak here would shift `stronger` and could move verdicts across the payload-changed
    // rows too, which is a far larger blast radius than this tier is allowed.
    const one = sheet([ref("\\#REF\\!")]);
    const two = sheet([ref("\\#REF\\!  \\#REF\\!")]);
    expect(signalKeys(one).get("W:REF_ERROR_LITERAL")).toBe(1);
    expect(signalKeys(two).get("W:REF_ERROR_LITERAL")).toBe(1); // one WARNING, not two literals
    expect(newSignalFired(one, two)).toBe(false);
  });
});

describe("verdict ordering", () => {
  it("SIGNALED still wins over the drift tier when a code count goes UP", () => {
    const a = sheet([ref("\\#REF\\!")]);
    const b = sheet([
      ref("\\#REF\\!"),
      { severity: "warn", code: "UNKNOWN_FIELD", message: "m" } as ParseWarning,
    ]);
    expect(verdict(a, b)).toBe("SIGNALED");
  });

  it("identical signals are ABSORBED, never drift", () => {
    const a = sheet([ref("\\#REF\\!")]);
    expect(verdict(a, sheet([ref("\\#REF\\!")]))).toBe("ABSORBED");
  });
});

describe("verdict -> alarm coupling", () => {
  // The bug this pins: the tier was added to the oracle and NOT to runShard's emission,
  // so every drift mutant produced no alarm at all and its ledger rows read as FIXED. An
  // unplumbed bucket looks EMPTY rather than broken, which is why the map is total and
  // why omitting a verdict is a compile error rather than a silent hole.
  it("maps every verdict, and only ABSORBED/SIGNALED are benign", () => {
    expect(VERDICT_ALARM_KIND).toEqual({
      ABSORBED: null,
      SIGNALED: null,
      SILENT_WRONG: "wrong",
      SILENT_SIGNAL_LOSS: "signal_loss",
      SIGNAL_TEXT_DRIFT: "text_drift",
    });
  });

  it("records the drift class rather than dropping it", () => {
    expect(VERDICT_ALARM_KIND.SIGNAL_TEXT_DRIFT).toBe("text_drift");
    expect(VERDICT_ALARM_KIND.SIGNAL_TEXT_DRIFT).not.toBeNull();
  });
});
