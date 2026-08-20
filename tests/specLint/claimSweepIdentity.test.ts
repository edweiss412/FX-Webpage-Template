/**
 * Task 6 — identity, severity, the closed code set, and the inventory
 * reconciliation (spec §3.4, §6, AC-3).
 *
 * The module NAMESPACE is imported on purpose. A named import of a missing
 * export is a LINK-TIME error, which is the collection shape plan §4 declares
 * as Task 1's alone; a namespace import lets the missing export arrive as
 * `undefined` and the red be a VALUE comparison.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as claimSweepModule from "../../lib/specLint/claimSweep";
import {
  incidentDocs,
  repairSpans,
  INCIDENT_IDENTIFIER,
  INCIDENT_IDENTIFIER_TRUNCATED,
  INCIDENT_PROBE,
} from "./claimSweepFixtures";
import {
  ABSENT_IDENTIFIER,
  DOUBLE_OCCURRENCE_LINE,
  DOUBLE_OCCURRENCE_SPLIT_LINE,
  SYNTHETIC_PAIR,
} from "./claimSweepLiterals";
import { parseInventory, parseLimitItems, reconcile } from "./claimSweepInventory";

const SPEC = readFileSync(
  join(process.cwd(), "docs/superpowers/specs/ci/2026-08-20-claim-sweep-after-repair.md"),
  "utf8",
);

const SPANS = repairSpans("c272ebed3");

/**
 * Every fixture invocation this arc makes, so the emitted CODE SET below is
 * taken over the WHOLE corpus rather than one lucky call. Each entry is chosen
 * to reach a different code.
 */
function everyFinding() {
  const docs = incidentDocs("c272ebed3");
  return [
    ...claimSweepModule.claimSweep(incidentDocs("fede5f084"), {
      superseded: "58",
      replacement: "57",
      claimAbout: null,
      touchedLines: new Map(),
    }),
    ...claimSweepModule.claimSweep(docs, {
      superseded: null,
      replacement: null,
      claimAbout: INCIDENT_IDENTIFIER,
      touchedLines: SPANS,
    }),
    ...claimSweepModule.claimSweep(docs, {
      superseded: null,
      replacement: null,
      claimAbout: INCIDENT_IDENTIFIER_TRUNCATED,
      touchedLines: SPANS,
    }),
    ...claimSweepModule.claimSweep([{ path: INCIDENT_PROBE, lines: null }, ...docs], {
      superseded: null,
      replacement: null,
      claimAbout: ABSENT_IDENTIFIER,
      touchedLines: SPANS,
    }),
  ];
}

describe("claim sweep — the closed code set", () => {
  it("exports a four-member code list", () => {
    // THE RED. A namespace import makes the missing export `undefined`, so this
    // is a value comparison rather than a link-time collection failure.
    expect(claimSweepModule.CLAIM_SWEEP_CODES).toBeDefined();
    expect([...claimSweepModule.CLAIM_SWEEP_CODES].sort()).toEqual([
      "CLAIM_IDENTIFIER_NOT_FOUND",
      "CLAIM_SITE_UNSWEPT",
      "SWEEP_DOCUMENT_UNREADABLE",
      "VALUE_SUPERSEDED_ELSEWHERE",
    ]);
  });

  it("emits exactly those codes over the whole fixture corpus, and no others", () => {
    // Compared against the module's OWN exported list rather than a list
    // retyped into this test, so the drift cannot relocate into the checker.
    const findings = everyFinding();
    expect(findings.length).toBeGreaterThan(0); // premise: the corpus produced findings
    expect([...new Set(findings.map((f) => f.code))].sort()).toEqual(
      [...claimSweepModule.CLAIM_SWEEP_CODES].sort(),
    );
  });

  it("is advisory on EVERY emitted finding, asserted structurally", () => {
    const findings = everyFinding();
    expect(findings.filter((f) => f.severity !== "advisory")).toEqual([]);
    expect(findings.every((f) => f.check === "claimSweep")).toBe(true);
  });
});

describe("claim sweep — the §3.4 signal inventory, RECONCILED not trusted", () => {
  const rows = parseInventory(SPEC);
  const limits = parseLimitItems(SPEC);

  it("parses a non-empty table and a non-empty limits list (floors on the derivation)", () => {
    // A zero-length derivation is a BROKEN READ, not an empty table, and the
    // two render identically in every count below.
    expect(rows.length).toBeGreaterThan(6);
    expect(limits.length).toBeGreaterThan(6);
  });

  it("reconciles in BOTH directions against the module's own exported codes", () => {
    expect(reconcile(rows, claimSweepModule.CLAIM_SWEEP_CODES, limits, 3)).toEqual([]);
  });

  it("POSITIVE CONTROL: a row naming a code the module does not export is reported", () => {
    // A check that cannot fail is not a check. The control names BOTH the row
    // and the code, so a failure is actionable rather than a bare red.
    const bogus = SPEC.replace(
      "| a declared peer the resolver cannot read | FINDING `SWEEP_DOCUMENT_UNREADABLE` |",
      "| a declared peer the resolver cannot read | FINDING `SWEEP_DOCUMENT_NOT_A_CODE` |",
    );
    expect(bogus).not.toBe(SPEC); // the construction actually applied
    const mismatches = reconcile(
      parseInventory(bogus),
      claimSweepModule.CLAIM_SWEEP_CODES,
      limits,
      3,
    );
    expect(mismatches.map((m) => m.kind).sort()).toEqual([
      "exported-code-has-no-row",
      "row-names-unexported-code",
    ]);
    expect(mismatches.map((m) => m.detail).join(" ")).toContain("SWEEP_DOCUMENT_NOT_A_CODE");
    expect(mismatches.map((m) => m.detail).join(" ")).toContain("SWEEP_DOCUMENT_UNREADABLE");
  });

  it("POSITIVE CONTROL: a row citing a §5 item that does not exist is reported", () => {
    const bogus = SPEC.replace("DECLARED SILENCE — §5 item 9", "DECLARED SILENCE — §5 item 99");
    expect(bogus).not.toBe(SPEC);
    const mismatches = reconcile(
      parseInventory(bogus),
      claimSweepModule.CLAIM_SWEEP_CODES,
      limits,
      3,
    );
    expect(mismatches.map((m) => m.kind)).toEqual(["row-cites-missing-limit"]);
  });

  it("POSITIVE CONTROL: a refusal row count that disagrees with the suites is reported", () => {
    const mismatches = reconcile(rows, claimSweepModule.CLAIM_SWEEP_CODES, limits, 2);
    expect(mismatches.map((m) => m.kind)).toEqual(["refusal-row-count"]);
  });

  it("POSITIVE CONTROL: an empty derivation reds rather than reading clean", () => {
    // `0 of 0` and `0 of 11` render identically in a mismatch count.
    const mismatches = reconcile([], [], [], 3);
    expect(mismatches.map((m) => m.kind)).toContain("empty-table");
    expect(mismatches.map((m) => m.kind)).toContain("empty-codes");
    expect(mismatches.map((m) => m.kind)).toContain("empty-limits");
  });
});

describe("claim sweep — a finding's identity carries the COLUMN", () => {
  const { superseded, replacement } = SYNTHETIC_PAIR;
  const record = {
    superseded,
    replacement,
    claimAbout: null,
    touchedLines: new Map<string, ReadonlySet<number>>(),
  };

  it("reports TWICE on a line carrying the token twice in one sentence, at two DISTINCT columns", () => {
    // A line-keyed identity emits ONE and the loss is SILENT, arriving as what
    // looks like a legitimate dedup. Measured live on the corpus at this arc's
    // merge-base: for the accepted 58 -> 57 declaration, eight lines carry the
    // superseded token two or three times in a sentence lacking the
    // replacement, so 18 reportable occurrences collapse to 8 line-keyed
    // identities and TEN vanish.
    const findings = claimSweepModule.claimSweep(
      [{ path: "x/double.md", lines: [DOUBLE_OCCURRENCE_LINE] }],
      record,
    );
    expect(findings).toHaveLength(2);
    const columns = findings.map((f) => f.column).sort((a, b) => a - b);
    // Asserted against the MEASURED offsets, not merely against "two distinct
    // values" — forcing both columns to 1 would satisfy a distinctness check
    // that only compared them to each other.
    const first = DOUBLE_OCCURRENCE_LINE.indexOf(superseded);
    const second = DOUBLE_OCCURRENCE_LINE.indexOf(superseded, first + 1);
    expect(columns).toEqual([first + 1, second + 1]);
  });

  it("reports ONCE when the second occurrence moves into a sentence carrying the replacement", () => {
    // One variable — which sentence the second occurrence sits in — so the
    // single finding is attributable to the SENTENCE rule rather than to a
    // dedup that happens to leave one behind.
    const findings = claimSweepModule.claimSweep(
      [{ path: "x/split.md", lines: [DOUBLE_OCCURRENCE_SPLIT_LINE] }],
      record,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.column).toBe(DOUBLE_OCCURRENCE_SPLIT_LINE.indexOf(superseded) + 1);
  });

  it("makes no dedup and no ordering guarantee, so multi-finding assertions are order-independent", () => {
    // Two identical tokens on two identical lines produce two findings that
    // differ only in docLine. Asserted as a SET.
    const findings = claimSweepModule.claimSweep(
      [{ path: "x/twice.md", lines: [DOUBLE_OCCURRENCE_LINE, DOUBLE_OCCURRENCE_LINE] }],
      record,
    );
    expect(new Set(findings.map((f) => `${f.docLine}:${f.column}`)).size).toBe(4);
  });
});
