import json, re, subprocess, sys

REPO = "edweiss412/FX-Webpage-Template"
RUNS = [l.split() for l in open("/tmp/fx_runs.txt").read().splitlines()[1:] if l.strip()]

def api(path):
    p = subprocess.run(["gh", "api", path], capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"gh api FAILED for {path}: {p.stderr.strip()[:200]}")
    return json.loads(p.stdout)

PAT = re.compile(r"source-mutation gate\s*[—–-]\s*([A-Za-z0-9_-]+)")

def surfaces_for(run_id):
    jobs = api(f"repos/{REPO}/actions/runs/{run_id}/jobs?per_page=100")
    if len(jobs["jobs"]) != jobs["total_count"]:
        raise RuntimeError(f"TRUNCATED job page for {run_id}: {len(jobs['jobs'])} of {jobs['total_count']}")
    found, ann_total = set(), 0
    for j in jobs["jobs"]:
        if j["conclusion"] != "failure":
            continue
        anns = api(f"repos/{REPO}/check-runs/{j['id']}/annotations?per_page=100")
        ann_total += len(anns)
        for a in anns:
            m = PAT.search(a.get("title") or "")
            if m:
                found.add(m.group(1))
    return found, ann_total

# POSITIVE CONTROL (rule 89): a run the ledger row documents as annotating `ledgerGit`.
ctl, _ = surfaces_for("32375262145")
print(f"POSITIVE CONTROL 32375262145 -> {sorted(ctl)}")
if "ledgerGit" not in ctl:
    print("ABORT: the control run does not yield ledgerGit; the instrument cannot see its subject.")
    sys.exit(1)
print("control OK — the extractor sees annotations it is known to have.\n")

rows, tally = [], {}
for r in RUNS:
    rid, when, branch = r[0], r[1], r[3] if len(r) > 3 else "?"
    s, n = surfaces_for(rid)
    rows.append((rid, when, branch, s, n))
    for x in s:
        tally[x] = tally.get(x, 0) + 1
    print(f"{rid} {when} {branch[:34]:<34} annotations={n:<3} :: {' '.join(sorted(s)) or 'NONE'}")

print(f"\npopulation: {len(rows)} failing mutation-harness runs, 2026-08-18 to 2026-08-21")
print("surface appearance counts:")
for k, v in sorted(tally.items(), key=lambda kv: -kv[1]):
    print(f"  {v:>2}x  {k}")
watched = {"ledgerGit", "psqlStartupScan"}
predicted = {"ledgerClaimsCore", "premiseScan"}
print(f"\nPRE-REGISTERED READING")
print(f"  documented-flaky surfaces appearing: {sorted(watched & set(tally)) or 'none'}")
print(f"  PREDICTED (unwatched #2/#3 by headroom) appearing: {sorted(predicted & set(tally)) or 'none'}")
