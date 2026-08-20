import subprocess, re
# CANDIDATE INVARIANT: after a repair changes N -> M, an occurrence of N is reported
# UNLESS the same sentence also carries M. A transition sentence names both by
# construction; a stale claim names only the superseded value.
def sentences(text):
    for para in text.split("\n"):
        for s in re.split(r"(?<=[.;:])\s+", para):
            if s.strip(): yield s
show = lambda rev,p: subprocess.run(["git","show",f"{rev}:{p}"],capture_output=True,text=True).stdout
S="docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md"
P="docs/superpowers/plans/2026-08-18-control-outline-border-token.md"
OLD,NEW="58","57"
print(f"THE INCIDENT: repair fede5f084 changed {OLD} -> {NEW}\n")
tot_rep=tot_exc=0
for label,path in (("spec",S),("plan",P)):
    txt=show("fede5f084",path)
    rep=exc=0
    for s in sentences(txt):
        if not re.search(rf"\b{OLD}\b",s): continue
        if re.search(rf"\b{NEW}\b",s): exc+=1
        else:
            rep+=1
            if rep<=3: print(f"  REPORT [{label}] …{s.strip()[:105]}…")
    print(f"  {label}: reported {rep} | excluded as transition sentences {exc}")
    tot_rep+=rep; tot_exc+=exc
print(f"\nincident totals: REPORTED {tot_rep} (these are the R5 F1 survivors) | EXCLUDED {tot_exc}")

# Now the false-positive population: do the corpus's transition sentences carry BOTH values?
files=[p for p in subprocess.run(["git","ls-files","docs/superpowers"],capture_output=True,text=True).stdout.split("\n") if p.endswith(".md")]
ARROW=re.compile(r"\b(\d+)\s*(?:->|→|to|,\s*not)\s*(\d+)\b")
both=one=0
for p in files:
    try: t=open(p,encoding="utf8").read()
    except Exception: continue
    for s in sentences(t):
        for m in ARROW.finditer(s):
            a,b=m.group(1),m.group(2)
            if re.search(rf"\b{a}\b",s) and re.search(rf"\b{b}\b",s): both+=1
            else: one+=1
print(f"\ncorpus transition sentences: carry BOTH values {both} | carry only one {one}")
print(f"=> the same-sentence-carries-the-replacement rule excludes {both} of {both+one}")
