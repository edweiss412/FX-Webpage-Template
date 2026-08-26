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
    print("UNRESOLVED       :", " ".join(missing) if missing else "none")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
