/**
 * Process-facing mint bar — every NEW process-facing ledger row cites a
 * measured incident, or names its exception.
 *
 * Spec: `docs/superpowers/specs/2026-08-18-process-facing-mint-bar.md`.
 * Policy text: AGENTS.md "Process-facing mint bar (2026-08-18)".
 *
 * WHY. The 2026-08-04 filing bar gates evidence QUALITY; nothing gated what the
 * evidence is OF. Measured 2026-08-18: 53% of open mass and ~74% of the
 * 2026-08-13..17 filing growth was process-facing (lint arms, guard fidelity,
 * review economy, harness tooling) while the product queue was a finishing
 * queue. A surviving mutant or a constructed fixture proves a gap EXISTS; only
 * an incident — a cost event that already happened — proves the gap is worth
 * scheduling over the documented-limits record.
 *
 * ACCEPT-SET, KEYED ON STRUCTURE. A row filed on or after the cutoff PASSES
 * when its `**Facing:**` field parses to `product` or `process` under the
 * canonical leading-token rule (same shape as `parseEffort`), AND — when
 * process — it carries a non-empty `**Incident:**` field or a recognized
 * `**Mint-exception:**` (`invariant` | `ratified-scope`, leading token).
 * Everything else is rejected BY NAME: file, id, and the offending value.
 * Incident CONTENT quality (is the link real, is the round genuinely burned)
 * is review's job, per the fence below — this guard checks the author was
 * forced to answer the question, which is the moment the answer is cheap.
 *
 * CONSEQUENCE BOUND. Worst case of any parse disagreement is a false FAILURE
 * naming one specific entry, repaired by fixing the field or filing the row's
 * finding to the owning surface's documented-limits record. A silent PASS on a
 * new process-facing row without an incident is not reachable: absent keys are
 * the reject branch. Rows without a parseable leading `Filed` date are
 * grandfathered — a DOCUMENTED LIMIT (spec §4): omitting `Filed` dodges this
 * gate, and review owns that class the same way it owns adversarial spellings.
 *
 * THREAT-MODEL FENCE. Defends against honest speculative filing by an ordinary
 * contributor. An author fabricating an incident or spelling fields to dodge
 * the walker is hiding, not forgetting — out of scope, review's class.
 *
 * PREMISE (BL-GUARD-PREMISE-REACHABILITY). At landing, zero live rows are filed
 * past the cutoff, so the corpus scan alone would pass unconditionally. The
 * fixture cases below run constructed entries through the SAME walker and
 * verdict function, proving each reject branch fires; the corpus scan then
 * applies the proven rule to the live queues.
 *
 * DELIBERATELY NOT ENROLLED in the source-mutation registry, same reason as the
 * sizing guard (backlog-convergence spec §3.3): substance is set membership
 * over parser output; the shipped operator families target computational logic.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ledgerFiles, ledgerItems } from "@/scripts/lib/ledger-fields";

const ROOT = join(__dirname, "..", "..");

/** Rows filed on or after this date carry the bar (2026-08-19: the policy ratified late 2026-08-18; a row filed earlier that day cannot be bound by it). Earlier rows are untouched. */
const MINT_BAR_CUTOFF = "2026-08-19";

const RECOGNIZED_EXCEPTIONS = ["invariant", "ratified-scope"] as const;

/**
 * Process mint freeze (AGENTS.md "Process mint freeze (2026-08-25)"). From this
 * date a process-facing row enters the open queue only under one of these three
 * exceptions; an Incident on its own no longer admits it, and `ratified-scope`
 * is retired for process rows. `product-blocked` additionally requires the
 * Incident that names the blocked product arc, and `recurrence` (added
 * 2026-08-27) requires the Incident that names every occurrence — the bar there
 * is two INDEPENDENT arcs, which this file cannot count, so the arc count is
 * review's class and only the Incident's presence is mechanical here.
 */
const PROCESS_MINT_FREEZE = "2026-08-25";
const FREEZE_EXCEPTIONS = ["invariant", "product-blocked", "recurrence"] as const;

/** Freeze exceptions whose admission rests on a cited cost event. */
const INCIDENT_BACKED_EXCEPTIONS = ["product-blocked", "recurrence"] as const;

/** Leading lowercase token of a `Mint-exception` value; undefined when absent. */
function exceptionToken(raw: string): string | undefined {
  return /^\s*([a-z-]+)\b/i.exec(raw)?.[1]?.toLowerCase();
}

/** Leading `YYYY-MM-DD` of a `Filed` value; null when absent or unparseable. */
function filedDate(raw: string | undefined): string | null {
  const m = /^\s*(\d{4}-\d{2}-\d{2})/.exec(raw ?? "");
  return m ? (m[1] ?? null) : null;
}

type Verdict = { ok: true } | { ok: false; why: string };

export function mintBarVerdict(fields: Record<string, string>): Verdict {
  const filed = filedDate(fields.Filed);
  // Lexicographic compare is calendar compare for ISO dates.
  if (filed === null || filed < MINT_BAR_CUTOFF) return { ok: true };

  const facing = /^\s*(product|process)\b/i.exec(fields.Facing ?? "");
  if (!facing) {
    return {
      ok: false,
      why: `filed ${filed} without a parseable **Facing:** (product | process as the LEADING token); got: ${fields.Facing ?? "(absent)"}`,
    };
  }
  if (facing[1]!.toLowerCase() === "product") return { ok: true };

  const incident = (fields.Incident ?? "").trim();
  const exception = (fields["Mint-exception"] ?? "").trim();

  if (filed >= PROCESS_MINT_FREEZE) {
    const token = exceptionToken(exception);
    if (!token || !(FREEZE_EXCEPTIONS as readonly string[]).includes(token)) {
      return {
        ok: false,
        why:
          `process-facing row filed ${filed}, under the process mint freeze (AGENTS.md ` +
          `"Process mint freeze (2026-08-25)"): an Incident alone no longer admits a process row. ` +
          `File it to the owning surface's documented-limits record with a re-file trigger, ` +
          `or name a freeze exception (${FREEZE_EXCEPTIONS.join(" | ")}); got: ${exception || "(absent)"}`,
      };
    }
    if (
      (INCIDENT_BACKED_EXCEPTIONS as readonly string[]).includes(token) &&
      incident === ""
    ) {
      const owed =
        token === "recurrence"
          ? "naming every occurrence (arc or branch per hit, with its corpus row, CI run, or commit)"
          : "naming the blocked product arc (its branch plus the CI run, corpus row, or commit)";
      return {
        ok: false,
        why: `process-facing row filed ${filed} under **Mint-exception:** ${token} with no **Incident:** ${owed}`,
      };
    }
    return { ok: true };
  }

  if (incident !== "") return { ok: true };

  if (exception === "") {
    return {
      ok: false,
      why:
        `process-facing row filed ${filed} with no **Incident:** and no **Mint-exception:**. ` +
        `Cite a measured cost event that already happened (CI run link, burned review-round corpus row, ` +
        `merged defect commit, measured wall-clock), name a recognized exception, ` +
        `or file the finding to the owning surface's documented-limits record instead`,
    };
  }
  const token = exceptionToken(exception);
  if (!token || !(RECOGNIZED_EXCEPTIONS as readonly string[]).includes(token)) {
    return {
      ok: false,
      why: `unrecognized **Mint-exception:** ${exception} (recognized: ${RECOGNIZED_EXCEPTIONS.join(" | ")})`,
    };
  }
  return { ok: true };
}

/** Open queues only. An archived entry is a record, not scheduled work. */
const openLedgers = () => ledgerFiles(ROOT).filter((f) => !/-archive\.md$/.test(f));

/** One constructed entry through the REAL walker, so fixtures share the grammar. */
function fixtureFields(metaLine: string): Record<string, string> {
  const md = `## BL-FIXTURE-ROW — a constructed row for the premise cases\n\n${metaLine}\n\nBody prose.\n`;
  const items = ledgerItems("BACKLOG.md", md);
  expect(items).toHaveLength(1);
  return items[0]!.fields;
}

describe("process-facing mint bar", () => {
  it("premise: the walked ledgers are non-empty, so the corpus scan below can fail", () => {
    expect(openLedgers()).toEqual(["BACKLOG.md", "DEFERRED.md"]);
  });

  // The reject branches, each proven to fire through the real walker — the
  // live corpus holds zero post-cutoff rows at landing, so without these the
  // scan would pass unconditionally (guard-premise rule).
  it("premise: a post-cutoff process row without incident or exception is rejected", () => {
    const v = mintBarVerdict(
      fixtureFields("**Filed:** 2026-08-19 (`fix/x`) · **Facing:** process · **Effort:** S"),
    );
    expect(v.ok).toBe(false);
  });

  it("premise: a post-cutoff row without Facing is rejected", () => {
    const v = mintBarVerdict(fixtureFields("**Filed:** 2026-08-19 (`fix/x`) · **Effort:** S"));
    expect(v.ok).toBe(false);
  });

  it("premise: an unrecognized Mint-exception is rejected", () => {
    const v = mintBarVerdict(
      fixtureFields(
        "**Filed:** 2026-08-19 · **Facing:** process · **Mint-exception:** vibes · **Effort:** S",
      ),
    );
    expect(v.ok).toBe(false);
  });

  it("premise: the accept branches admit exactly the documented shapes", () => {
    for (const line of [
      // pre-cutoff rows are untouched, whatever they carry
      "**Filed:** 2026-08-18 (`fix/x`) · **Effort:** S",
      // no parseable Filed date — grandfathered, documented limit (spec §4)
      "**Effort:** S",
      // product-facing needs nothing further
      "**Filed:** 2026-08-19 · **Facing:** product · **Effort:** S",
      // process-facing with a cited incident
      "**Filed:** 2026-08-19 · **Facing:** process · **Incident:** run 32149575319 red on main · **Effort:** S",
      // process-facing under each recognized exception
      "**Filed:** 2026-08-19 · **Facing:** process · **Mint-exception:** invariant (defends invariant 2) · **Effort:** S",
      "**Filed:** 2026-08-19 · **Facing:** process · **Mint-exception:** ratified-scope (spec §4 limit 8) · **Effort:** S",
    ]) {
      expect(mintBarVerdict(fixtureFields(line)), line).toEqual({ ok: true });
    }
  });

  // Process mint freeze (AGENTS.md "Process mint freeze (2026-08-25)"): from the
  // freeze date an Incident alone no longer admits a process row, and
  // `ratified-scope` no longer admits one at all.
  it("premise: a post-freeze process row with an incident but no freeze exception is rejected", () => {
    const v = mintBarVerdict(
      fixtureFields(
        "**Filed:** 2026-08-25 (`fix/x`) · **Facing:** process · **Incident:** diff round 3 corpus row · **Effort:** S",
      ),
    );
    expect(v.ok).toBe(false);
    expect((v as { why: string }).why).toMatch(/freeze/);
  });

  it("premise: a post-freeze process row under ratified-scope is rejected", () => {
    const v = mintBarVerdict(
      fixtureFields(
        "**Filed:** 2026-08-25 · **Facing:** process · **Mint-exception:** ratified-scope (spec §4) · **Effort:** S",
      ),
    );
    expect(v.ok).toBe(false);
  });

  it("premise: a post-freeze product-blocked row without an incident is rejected", () => {
    const v = mintBarVerdict(
      fixtureFields(
        "**Filed:** 2026-08-25 · **Facing:** process · **Mint-exception:** product-blocked (`feat/crew-x`) · **Effort:** S",
      ),
    );
    expect(v.ok).toBe(false);
  });

  it("premise: a post-freeze recurrence row without an incident is rejected", () => {
    const v = mintBarVerdict(
      fixtureFields(
        "**Filed:** 2026-08-27 · **Facing:** process · **Mint-exception:** recurrence (LIM-X, 2 arcs) · **Effort:** S",
      ),
    );
    expect(v.ok).toBe(false);
  });

  it("premise: the post-freeze accept branches admit exactly the documented shapes", () => {
    for (const line of [
      // the day before the freeze, the 2026-08-18 bar still applies unchanged
      "**Filed:** 2026-08-24 · **Facing:** process · **Incident:** run 32149575319 red on main · **Effort:** S",
      "**Filed:** 2026-08-24 · **Facing:** process · **Mint-exception:** ratified-scope (spec §4) · **Effort:** S",
      // product-facing needs nothing further, before or after
      "**Filed:** 2026-08-25 · **Facing:** product · **Effort:** S",
      // the two surviving process exceptions
      "**Filed:** 2026-08-25 · **Facing:** process · **Mint-exception:** invariant (defends invariant 2) · **Effort:** S",
      "**Filed:** 2026-08-25 · **Facing:** process · **Mint-exception:** product-blocked (`feat/crew-x`) · **Incident:** `feat/crew-x` diff round 2, corpus row docs/review-rounds/feat/crew-x/abc.jsonl · **Effort:** S",
      "**Filed:** 2026-08-27 · **Facing:** process · **Mint-exception:** recurrence (LIM-X, 2 independent arcs) · **Incident:** `feat/a` round 1, docs/review-rounds/feat/a/abc.md; `feat/b` round 2, docs/review-rounds/feat/b/def.md · **Effort:** S",
    ]) {
      expect(mintBarVerdict(fixtureFields(line)), line).toEqual({ ok: true });
    }
  });

  it("every open entry filed on or after the cutoff satisfies the mint bar", () => {
    const violations = openLedgers().flatMap((file) =>
      ledgerItems(file, readFileSync(join(ROOT, file), "utf8"))
        .map((item) => ({ file, id: item.id, verdict: mintBarVerdict(item.fields) }))
        .filter((row) => !row.verdict.ok)
        .map((row) => `${row.file} ${row.id} — ${(row.verdict as { why: string }).why}`),
    );
    expect(
      violations,
      violations.length === 0
        ? ""
        : `${violations.length} ledger entr(ies) fail the process-facing mint bar ` +
          `(AGENTS.md "Process-facing mint bar (2026-08-18)"):\n` +
          violations.map((v) => `  ${v}`).join("\n"),
    ).toEqual([]);
  });
});
