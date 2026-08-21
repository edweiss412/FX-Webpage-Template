import subprocess, re
show=lambda rev,p: subprocess.run(["git","show",f"{rev}:{p}"],capture_output=True,text=True).stdout
def sentences(t):
    for para in t.split("\n"):
        for s in re.split(r"(?<=[.;:])\s+", para):
            if s.strip(): yield s
S="docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md"
P="docs/superpowers/plans/2026-08-18-control-outline-border-token.md"

# F1: a sentence repaired HALFWAY carries BOTH values, so the same-sentence rule
# suppresses the surviving stale one. Does counting occurrences of N discriminate?
print("=== F1: half-repaired sentence ===")
fixture = "Update the census-length premise from 21 to 57, and the distinct-identity assertion to 58."
n_old, n_new = "58", "57"
print(f"  sentence: {fixture}")
print(f"  carries {n_new}? {bool(re.search(rf'\b{n_new}\b',fixture))}  -> current rule SUPPRESSES (silent miss)")
print(f"  occurrences of {n_old}: {len(re.findall(rf'\b{n_old}\b',fixture))}")
print(f"  occurrences of {n_new}: {len(re.findall(rf'\b{n_new}\b',fixture))}")
print("  candidate refinement: exclude only when the sentence reads as ONE transition --")
print("  i.e. exactly one N and one M. Here 1 and 1, so it would STILL suppress. Refinement FAILS.")

# F2/F4: what does the named half ACTUALLY report on c272ebed3?
print("\n=== F2/F4: named half, measured on c272ebed3 ===")
ident="PublishedReviewModal.tsx:964"
hunks=subprocess.run(["git","show","--unified=0","c272ebed3"],capture_output=True,text=True).stdout
touched=set(re.findall(r"^\+\+\+ b/(\S+)",hunks,re.M))
print("  files the repair touched:", len(touched))
tot=0
for label,path in (("spec",S),("plan",P)):
    txt=show("c272ebed3",path)
    hits=[i+1 for i,l in enumerate(txt.split("\n")) if ident in l]
    tot+=len(hits)
    print(f"  {label}: {len(hits)} occurrences at lines {hits}")
probe="docs/superpowers/specs/probes/2026-08-18-border-border-neutral-fill-census.md"
ptxt=show("c272ebed3",probe)
phits=[i+1 for i,l in enumerate(ptxt.split("\n")) if ident in l]
print(f"  probe record: {len(phits)} occurrences at lines {phits}")
print(f"  TOTAL occurrences of the identifier across the arc: {tot+len(phits)}")
print("  => 'the section-6 identifier survivor' is WRONG; the named half reports many.")
