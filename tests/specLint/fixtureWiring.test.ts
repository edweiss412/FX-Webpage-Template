import { describe, it, expect } from "vitest";
import { runLint } from "@/lib/specLint/run";

const resolver = { readFileLines: () => null, listTrackedFiles: () => [] as string[] };

describe("fixture static arm is wired into runLint (spec §3)", () => {
  const doc = (text: string) => ({
    text,
    repoRelPath: "docs/superpowers/plans/x.md",
    kind: "plan" as const,
    kindSource: "explicit" as const,
  });

  it("a malformed marker surfaces through runLint with NO exec maps", () => {
    const text = ["# P", "<!-- fixture: why=x -->", "```ts", "x", "```"].join("\n");
    const res = runLint(doc(text), resolver, null, null, null);
    const f = res.findings.filter((x) => x.code.startsWith("FIXTURE_"));
    expect(f.map((x) => x.code)).toEqual(["FIXTURE_MALFORMED"]);
    expect(f[0]!.check).toBe("taskContract");
    expect(f[0]!.severity).toBe("fail");
  });

  it("a clean marker adds no findings", () => {
    const text = ["# P", "<!-- fixture: why=`w` -->", "```ts", "x", "```"].join("\n");
    const res = runLint(doc(text), resolver, null, null, null);
    expect(res.findings.filter((x) => x.code.startsWith("FIXTURE_"))).toEqual([]);
  });
});
describe("the static arm is kind-scoped and flag-independent through runLint", () => {
  const at = (kind: "spec" | "plan") => ({
    text: ["# D", "<!-- fixture: why=x -->", "```ts", "x", "```"].join("\n"),
    repoRelPath: kind === "plan" ? "docs/superpowers/plans/x.md" : "docs/superpowers/specs/x.md",
    kind,
    kindSource: "explicit" as const,
  });
  const fixtureCodes = (kind: "spec" | "plan") =>
    runLint(at(kind), resolver, null, null, null)
      .findings.filter((f) => f.code.startsWith("FIXTURE_"))
      .map((f) => f.code);

  it("fires for a plan-kind doc and stays silent for a spec-kind one", () => {
    // A wiring that passes a hardcoded "plan" instead of doc.kind fires on
    // specs, where fixture markers are prose (arms spec §8 items 12-13).
    expect(fixtureCodes("plan")).toEqual(["FIXTURE_MALFORMED"]);
    expect(fixtureCodes("spec")).toEqual([]);
  });

  it("fires identically whether or not the exec maps are supplied", () => {
    // The static arm must not be reachable only under --exec-red: the default
    // CLI path is the one codex-guard --lint-doc uses.
    const withMaps = runLint(
      at("plan"),
      resolver,
      { outcomes: new Map(), stderrTails: new Map() },
      { outcomes: new Map(), stderrTails: new Map() },
      { outcomes: new Map(), stdout: new Map(), stderrTails: new Map() },
    );
    expect(
      withMaps.findings.filter((f) => f.code.startsWith("FIXTURE_")).map((f) => f.code),
    ).toEqual(["FIXTURE_MALFORMED"]);
  });
});
