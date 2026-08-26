"""Case-id parity for the fitWithinClip measure-class spec.

Every case id USED in §3.1's tables must resolve to a real case: either one
§5.1 defines (new to this arc) or one that already exists in the unit suite.
Exits non-zero on any id that resolves to neither.

USE, not mention. Only table rows in §3.1 count as uses, and backticked spans
are stripped — the paragraph naming `(h4)` and `(h10)` in order to REJECT them
is a mention, and a checker that flags the paragraph explaining a defect is one
people learn to ignore.

Round-9 finding 3: an earlier version recognised only `h\\d+`, so §3.1's `(g2)`
and `(g3)` were invisible to it while the spec claimed it covered "every
numbered id". It now recognises any `(<letters><digits?>)` id and resolves
pre-existing ones against the suite itself, which is the real authority.
"""

import io
import re
import sys

SPEC = "docs/superpowers/specs/2026-08-25-fitwithinclip-measure-class.md"
PLAN = "docs/superpowers/plans/2026-08-25-fitwithinclip-measure-class.md"
SUITE = "tests/components/admin/useFitWithinClip.test.tsx"

ID = re.compile(r"\(([a-z]+\d*)\)")
strip_code = lambda t: re.sub(r"`[^`]*`", "", t)


def section(text: str, start: str, end: str) -> str:
    return text[text.index(start) : text.index(end)]


def main() -> int:
    spec = io.open(SPEC, encoding="utf-8").read()
    suite = io.open(SUITE, encoding="utf-8").read()

    rows = [l for l in strip_code(section(spec, "## §3.1", "## §4 ")).split("\n") if l.startswith("|")]
    used = set(ID.findall("\n".join(rows)))

    defined = set(ID.findall(strip_code(section(spec, "### §5.1", "### §5.2"))))
    # A pre-existing case is one the suite actually declares: test("(g2) ...").
    existing = set(re.findall(r'test\(\s*"\((\w+)\)', suite))

    print("§3.1 table USES  :", " ".join(sorted(used)))
    print("§5.1 DEFINES     :", " ".join(sorted(defined)))
    print("suite ALREADY HAS:", " ".join(sorted(existing)))
    missing = sorted(used - defined - existing)
    print("UNRESOLVED (spec):", " ".join(missing) if missing else "none")

    # The PLAN too, and this is why the widening exists. Diff review round 1
    # finding 3 caught the plan crediting `(h5)` and `(h7)`, neither of which
    # the suite declares. This checker could not have caught it: it read the
    # spec and nothing else, so every id the plan cites went unchecked. The
    # gap was in the instrument's DOMAIN, not in its logic, and fixing the two
    # ids by hand would have left the hole open for the next one.
    #
    # The plan is an execution document, so its ids resolve against the SUITE
    # (the real authority) or against a §5.1 definition. Backticked spans are
    # stripped by the same rule the spec uses: a plan naming an id in order to
    # discuss it is a mention, not a use.
    plan = io.open(PLAN, encoding="utf-8").read()
    plan_used = set(ID.findall(strip_code(plan)))
    plan_missing = sorted(plan_used - defined - existing)
    print("plan USES        :", " ".join(sorted(plan_used)))
    print("UNRESOLVED (plan):", " ".join(plan_missing) if plan_missing else "none")

    # SINGLE-SOURCE: the mutant-to-case mapping lives in the PLAN only.
    #
    # Diff review round 2 found seven places where a duplicated mapping had
    # drifted from the measurement — the spec's §5.1 table crediting `M3` and
    # `M13` to (h3) when neither kills it, `M13` to (h13) which has no mutant,
    # `M16` to (h18) when it kills (h9) instead, plus a blanket claim that every
    # listed mutant turns its case red. Only measurement settles those, and a
    # second copy cannot be re-measured, so it drifts every time a mutant is
    # re-run. The column was deleted rather than corrected.
    #
    # This is the guard on that decision. Backticked spans are stripped by the
    # same use-vs-mention rule used above, so the paragraph EXPLAINING the
    # removal may name mutants; a table column or a prose claim asserting one
    # may not.
    spec_mutants = sorted(set(re.findall(r"\bM\d+\b", strip_code(spec))))
    print("spec MUTANT refs :", " ".join(spec_mutants) if spec_mutants else "none (single-sourced)")

    return 1 if (missing or plan_missing or spec_mutants) else 0


if __name__ == "__main__":
    sys.exit(main())
