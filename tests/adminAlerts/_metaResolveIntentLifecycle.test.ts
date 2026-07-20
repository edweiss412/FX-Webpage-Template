/**
 * Defense 5 (spec 2026-07-20-show-scoped-alert-copy-design §7): completeness
 * plus an append-only lifecycle.
 *
 * The lifecycle half needs git, not a second file. Three same-tree oracles were
 * tried and all three failed, and the reason generalizes: NO assertion computed
 * from a single tree can enforce an append-only property, because the
 * "previous" state it must compare against is not in that tree. Any in-tree
 * baseline is just a second file the same commit can edit. So Layer 2 reads the
 * prior baseline from origin/main, which the commit under test cannot rewrite.
 *
 * Why it matters: admin_alerts rows persist. Retiring a producer and cleaning
 * up its "unused" map entry would silently flip already-stored rows from
 * "Confirm" back to "Mark resolved".
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { RESOLVE_INTENTS } from "@/lib/adminAlerts/resolveActionLabel";
import BASELINE from "./resolveIntentsBaseline.json";
import { ADMIN_ALERTS_CODES } from "../messages/adminAlertsRegistry";
import { AUTO_RESOLVING_CODES } from "@/lib/adminAlerts/audience";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const BASELINE_PATH = "tests/adminAlerts/resolveIntentsBaseline.json";
const RESOLVE_INTENTS_BASELINE = BASELINE.intents as Record<string, "confirm" | "resolve">;

describe("defense 5a: completeness", () => {
  it("every resolve-eligible code has an explicit intent row", () => {
    const auto = new Set(AUTO_RESOLVING_CODES);
    const eligible = ADMIN_ALERTS_CODES.filter((c) => !auto.has(c));
    const missing = eligible.filter((c) => !(c in RESOLVE_INTENTS));
    expect(missing, "declare an intent in lib/adminAlerts/resolveActionLabel.ts").toEqual([]);
  });

  // Completeness alone does not make an intent CORRECT: mapping a fault code to
  // "confirm" would satisfy every other assertion and render "Confirm" on a
  // not-found error. "confirm" is the rare, deliberate case, so pin it exactly.
  it("the confirm set is exactly the approved list", () => {
    const confirms = Object.entries(RESOLVE_INTENTS)
      .filter(([, r]) => r.intent === "confirm")
      .map(([c]) => c)
      .sort();
    expect(confirms, "adding a confirm-intent code is a deliberate copy decision").toEqual([
      "ROLE_FLAGS_NOTICE",
    ]);
  });

  // What the exact set above cannot express is the DIRECTION of a future edit.
  it("a warning-severity code is never confirm intent", () => {
    const wrong = Object.entries(RESOLVE_INTENTS)
      .filter(([code, row]) => {
        const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as
          | { severity?: string }
          | undefined;
        return row.intent === "confirm" && entry?.severity === "warning";
      })
      .map(([code]) => code);
    expect(wrong, "a fault cannot be approved; use resolve intent").toEqual([]);
  });
});

describe("defense 5b: layer 1, tree consistency", () => {
  it("RESOLVE_INTENTS and the committed baseline agree exactly", () => {
    const current = Object.fromEntries(
      Object.entries(RESOLVE_INTENTS).map(([k, v]) => [k, v.intent]),
    );
    expect(current).toEqual(RESOLVE_INTENTS_BASELINE);
  });
});

describe("defense 5c: layer 2, history", () => {
  function originMainResolvable(): boolean {
    try {
      execFileSync("git", ["rev-parse", "--verify", "origin/main"], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      return true;
    } catch {
      return false;
    }
  }

  function baselineOnMain(): string | null {
    try {
      return execFileSync("git", ["show", `origin/main:${BASELINE_PATH}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null; // absent on main: the bootstrap case
    }
  }

  it("every historical pair still resolves identically", () => {
    if (!originMainResolvable()) {
      // In CI the ref is always fetchable (unit-suite.yml fetches it at depth 1),
      // so an unresolvable ref means a broken checkout. Failing here is the
      // point: an unconditional skip would make a "required" layer fail-open.
      if (process.env.CI) {
        throw new Error(
          "origin/main is unresolvable in CI, so the lifecycle gate cannot run. " +
            "Check the fetch step in .github/workflows/unit-suite.yml.",
        );
      }
      console.warn("[lifecycle] skipped: origin/main unresolvable (local checkout)");
      return;
    }

    const prev = baselineOnMain();
    if (prev === null) return; // bootstrap: no baseline on main yet, nothing to preserve

    // JSON.parse, never a regex over source text: a formatting-sensitive regex
    // could drop rows while still reporting a non-empty parse.
    const historical = (JSON.parse(prev) as { intents: Record<string, "confirm" | "resolve"> })
      .intents;
    expect(Object.keys(historical).length, "baseline on origin/main is empty").toBeGreaterThan(0);

    for (const [code, intent] of Object.entries(historical)) {
      expect(
        RESOLVE_INTENTS[code]?.intent,
        `${code} changed or was deleted; rows already in admin_alerts still render it`,
      ).toBe(intent);
    }
  });
});
