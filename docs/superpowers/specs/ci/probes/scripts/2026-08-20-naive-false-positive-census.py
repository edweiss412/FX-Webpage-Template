import subprocess, re, collections
# The NAIVE arm: after a repair changes N -> M, report every surviving N in the
# arc's documents. Its false positives are sentences where the superseded value
# is the SUBJECT. Measure that shape on the live spec+plan corpus.
files = [p for p in subprocess.run(["git","ls-files","docs/superpowers"],capture_output=True,text=True)
         .stdout.split("\n") if p.endswith(".md")]
print(f"tracked spec+plan docs: {len(files)}")
# before/after shapes, drawn from the corpus rather than invented
SHAPES = {
 "X -> Y / X to Y":        re.compile(r"\b(\d+)\s*(?:->|→|to)\s*(\d+)\b"),
 "'N, not M'":             re.compile(r"\b(\d+),\s*not\s+(\d+)\b"),
 "'was N'":                re.compile(r"\bwas\s+(\d+)\b"),
 "'from N to M'":          re.compile(r"\bfrom\s+(\d+)\s+to\s+(\d+)\b"),
 "'no longer N'":          re.compile(r"\bno longer\s+(\d+)\b"),
 "'rather than N'":        re.compile(r"\brather than\s+(\d+)\b"),
}
counts = collections.Counter(); examples = collections.defaultdict(list)
for p in files:
    try: txt = open(p, encoding="utf8").read()
    except Exception: continue
    for name, rx in SHAPES.items():
        for m in rx.finditer(txt):
            counts[name] += 1
            if len(examples[name]) < 2:
                a = max(0, m.start()-45); examples[name].append(f"{p.split('/')[-1]}: …{txt[a:m.end()+25]}…".replace("\n"," "))
print("\nbefore/after shapes in the live corpus (each is a false positive for a naive sweep):")
for name, n in counts.most_common():
    print(f"  {n:>5}  {name}")
    for e in examples[name]: print(f"           {e[:118]}")
print(f"\nTOTAL sites a naive superseded-value sweep would wrongly flag: {sum(counts.values())}")
