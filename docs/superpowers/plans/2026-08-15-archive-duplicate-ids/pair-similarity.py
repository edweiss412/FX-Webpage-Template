"""Pass 2: pairwise body-similarity of duplicate-id sections in BACKLOG-archive.md.

Sections run heading-to-next-heading (any ^#{2,3}); lines are whitespace-normalized
before comparison. VERBATIM = identical normalized lines; NEAR = SequenceMatcher
ratio > 0.98; everything else DIFFER. Run from the repo root.
"""
import re, difflib
from collections import defaultdict

text = open('BACKLOG-archive.md').read()
lines = text.split('\n')
heads = [(i, m.group(1), m.group(2)) for i, l in enumerate(lines)
         for m in [re.match(r'^(#{2,3}) ((?:BL|DEF)-[A-Z0-9-]+)', l)] if m]
allheads = [i for i, l in enumerate(lines) if re.match(r'^#{2,3} ', l)]
byid = defaultdict(list)
for i, lvl, id_ in heads: byid[id_].append((i, lvl))
dups = {k: v for k, v in byid.items() if len(v) > 1}

def section(start):
    nxt = [j for j in allheads if j > start]
    end = nxt[0] if nxt else len(lines)
    return lines[start:end]

verbatim = near = differ = 0
for id_, occ in sorted(dups.items()):
    (a, la), (b, lb) = occ[:2]
    na = [re.sub(r'\s+', ' ', x.lstrip('#').strip()) for x in section(a) if x.strip()]
    nb = [re.sub(r'\s+', ' ', x.lstrip('#').strip()) for x in section(b) if x.strip()]
    if na == nb:
        verbatim += 1; tag = 'VERBATIM'
    else:
        ratio = difflib.SequenceMatcher(None, '\n'.join(na), '\n'.join(nb)).ratio()
        if ratio > 0.98: near += 1; tag = f'NEAR ratio={ratio:.4f}'
        else: differ += 1; tag = f'DIFFER ratio={ratio:.4f}'
    print(f"{id_}: {tag} (levels {la}/{lb}, lines {a+1}/{b+1})")
print(f"TOTALS: verbatim={verbatim} near={near} differ={differ} of {len(dups)}")
