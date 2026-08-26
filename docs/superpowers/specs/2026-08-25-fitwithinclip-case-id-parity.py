import io, re, sys
p = "docs/superpowers/specs/2026-08-25-fitwithinclip-measure-class.md"
s = io.open(p, encoding="utf-8").read()
# USE, not mention: ids inside §3.1's tables (lines starting with "|"), and ids
# in §5.1's bullet list. Backticked spans are mentions and are stripped.
sec31 = s[s.index("## §3.1"):s.index("## §4 ")]
sec51 = s[s.index("### §5.1"):s.index("### §5.2")]
strip = lambda t: re.sub(r"`[^`]*`", "", t)
used = set(re.findall(r"\(h\d+\)", "\n".join(l for l in strip(sec31).split("\n") if l.startswith("|"))))
defined = set(re.findall(r"\(h\d+\)", strip(sec51)))
print("§3.1 table USES :", " ".join(sorted(used)))
print("§5.1 DEFINES    :", " ".join(sorted(defined)))
missing = sorted(used - defined)
print("USED BUT UNDEFINED:", " ".join(missing) if missing else "none")
sys.exit(1 if missing else 0)
