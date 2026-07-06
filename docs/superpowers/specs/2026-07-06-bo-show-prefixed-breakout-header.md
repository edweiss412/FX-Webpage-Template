# Spec — Parse show-prefixed `<PREFIX> BREAKOUT N` breakout-room headers

**Date:** 2026-07-06
**Slug:** `bo-show-prefixed-breakout-header`
**Backlog:** `BL-ROOM-SHOW-PREFIXED-BREAKOUT-HEADER` (`BACKLOG.md:276`)
**Class:** PARSER COVERAGE · **Severity:** low · **Blast radius:** parser only (no UI, no DB, no advisory locks)

## 1. Intent

Two real breakout-room headers in `fixtures/shows/raw/2025-03-dci-rpas-central.md` carry a **show-code prefix** before the `BREAKOUT` keyword and are **currently unparsed** — the fixture's baseline rooms contain only the GS room:

- `2025-03-dci-rpas-central.md:207` — `| RPAS BREAKOUT 1&#10;LASALLE A&#10;30' x 25' x 10.5'&#10;7th Floor |` above a real `BO Setup`/`BO Set Time`/… block
- `2025-03-dci-rpas-central.md:152` — `| RPAS BREAKOUT 2&#10;LASALLE B&#10;30' x 25' x 10.5'&#10;7th Floor |` above a real `BO …` block

Goal: parse both as breakout rooms named `LASALLE A` / `LASALLE B` with their dims (`30' x 25' x 10.5'`), floor (`7th Floor`), and BO fields.

## 2. Root cause (live-code citations)

Two case-sensitive gates in `lib/parser/blocks/rooms.ts` are anchored on `BREAKOUT` sitting immediately after the leading `|`/kind-label, so a show-code prefix defeats both:

1. **`boBlockRe`** (`rooms.ts:1080`): `const boBlockRe = /^\|\s*(BREAKOUT(?:&#10;|\s)[^|]*?)\s*\|/gm;` — requires the header cell to START with `BREAKOUT`. `RPAS ` before it prevents the match, so the block is never entered by `parseBoRooms` (`rooms.ts:1071`).
2. **`splitRoomHeader` step-1 strip** (`rooms.ts:1385`): `.replace(/^(?:GENERAL\s+SESSION|BREAKOUT(?:\s+\d+)?|ADDITIONAL\s+ROOM|LUNCH\s+ROOM)\b/i, "")` — strips the kind label only from the START. Even if the block were matched, a flattened header `RPAS BREAKOUT 1 LASALLE A …` would retain `RPAS BREAKOUT 1` in the derived name.

These RPAS headers are **not** admitted by `computeRoomHeaderModel` (`rooms.ts:269`): `isRoomHeaderShape` (`rooms.ts:158`) requires a trailing DAY-range (`headerDayMarker`, `rooms.ts:140`), which these headers lack. So they are neither a `roomHeaderLines` terminator nor a Pass-2 `groups` candidate — they are owned exclusively by the `boBlockRe` regex path in `parseBoRooms`. No other pass claims them (confirmed §5).

## 3. Change

Two surgical regex edits in `lib/parser/blocks/rooms.ts`, both scoped to the `boBlockRe`/`splitRoomHeader` breakout path.

### 3.1 `boBlockRe` — admit an optional single UPPERCASE-alnum-token prefix

```
- const boBlockRe = /^\|\s*(BREAKOUT(?:&#10;|\s)[^|]*?)\s*\|/gm;
+ const boBlockRe = /^\|\s*((?:[A-Z0-9]+\s+)?BREAKOUT(?:&#10;|\s)[^|]*?)\s*\|/gm;
```

The prefix group `(?:[A-Z0-9]+\s+)?` is **optional** and matches **one** uppercase-alnum token plus its trailing whitespace (e.g. `RPAS `). Case-sensitivity is preserved (no `/i` flag), so mixed-case field labels like `Breakout Room Setup Date / Time` still never match. The captured group `m[1]` includes the prefix; it is stripped downstream by 3.2.

### 3.2 `splitRoomHeader` — case-sensitive prefix pre-strip

Prepend, before the existing kind-label strip (`rooms.ts:1384-1387`):

```
  s = s
+   .replace(/^[A-Z0-9]+\s+(?=BREAKOUT\b)/, "")
    .replace(/^(?:GENERAL\s+SESSION|BREAKOUT(?:\s+\d+)?|ADDITIONAL\s+ROOM|LUNCH\s+ROOM)\b/i, "")
    .replace(/^[\s:–—-]+/, "")
    .trim();
```

The pre-strip is its **own** regex with **no `/i` flag** and a lookahead `(?=BREAKOUT\b)` — it removes a leading uppercase-alnum token ONLY when an **uppercase** `BREAKOUT` immediately follows. It is therefore inert for every other header shape (GS/ADDITIONAL/LUNCH, plain numbered/numberless `BREAKOUT`, and any mixed-case name containing `Breakout`). After the pre-strip, the existing `BREAKOUT(?:\s+\d+)?` strip removes the `BREAKOUT 1` keyword+number, leaving `LASALLE A …` for the floor/dims/name extraction that follows unchanged.

## 4. Worked example (exact parser output — captured from the implemented change)

`parseRooms(dci-rpas-central, "v2")` emits, in document order (`RPAS BREAKOUT 2` at line 152 precedes `RPAS BREAKOUT 1` at line 207, so `LASALLE B` is emitted first):

```
gs:General Session
breakout:LASALLE B
breakout:LASALLE A
```

Each breakout (identical field set; the two blocks are byte-identical except the header name):

| field | value |
|---|---|
| kind | `breakout` |
| name | `LASALLE B` / `LASALLE A` |
| dimensions | `30' x 25' x 10.5'` |
| floor | `7th Floor` |
| setup | `TBD` |
| set_time | `3/24 @ 10:00 AM` |
| show_time | `TBD` |
| strike_time | `TBD` |
| audio | `N/A` |
| video | `(1) Eiki Projector (1) 7' Tripod (1) Tripod Skirt (1) ASUS Laptop (1) Slide Advancer (1) Projector Stand` |
| lighting | `N/A` |
| scenic | `N/A` |
| power | `null` (no `BO Power` row) |
| digital_signage | `N/A` |
| other | `N/A` |
| notes | `null` |

`N/A` is preserved verbatim — `presence()` (`lib/parser/blocks/_helpers.ts:71`) does NOT map `N/A` to null. `power` is `null` because the two blocks carry no `BO Power` row.

## 5. Blast radius / corpus no-op

`<UPPERCASE-token> BREAKOUT` appears in **exactly** these two headers across BOTH renderer families:

```
$ grep -roE '\|\s*[A-Z0-9]+ BREAKOUT' fixtures/shows/raw/ fixtures/shows/exporter-xlsx/
fixtures/shows/raw/2025-03-dci-rpas-central.md:152:| RPAS BREAKOUT 2
fixtures/shows/raw/2025-03-dci-rpas-central.md:207:| RPAS BREAKOUT 1
```

Because the `boBlockRe` prefix group is optional, plain `BREAKOUT`/`BREAKOUT N …`/`BREAKOUT&#10;NAME` headers still match at the SAME offset with the SAME capture (the optional group backtracks to empty), so no existing breakout header changes. The corpus no-op deep-equal test (`tests/parser/blocks/roomHeaderModel.test.ts:194`) was run with the change applied: **only** `fixtures/shows/raw/2025-03-dci-rpas-central.md` diverges; all other 17 of the 18 baseline keys stay byte-identical.

## 6. Baseline regeneration

`tests/parser/blocks/__baselines__/origin-main-rooms.json` is the frozen origin/main contract deep-equal'd by `roomHeaderModel.test.ts:202`. The `fixtures/shows/raw/2025-03-dci-rpas-central.md` array MUST be regenerated to append the two breakouts (§4) after the existing GS room. Regeneration is mechanical: run `parseSheet(fixture).rooms` on that one fixture with the change applied and overwrite ONLY that key. Every other key is untouched (§5). The baseline edit lands in the SAME task/commit as the source change that produces it.

## 7. Tests

TDD per task. Add to `tests/parser/blocks/rooms.test.ts` a describe block for `2025-03-dci-rpas-central` that asserts:

- **T1 — two breakouts parse.** `parseRooms(md, "v2").filter(r => r.kind === "breakout")` has length 2.
- **T2 — names derive from the non-prefix, non-BREAKOUT portion.** The breakout names, as a set, are `["LASALLE A", "LASALLE B"]` (order-insensitive to avoid coupling the test to document order). **Anti-tautology:** the names `LASALLE A/B` do not appear anywhere in the header keyword `RPAS BREAKOUT N`, so a passing assertion proves the prefix+keyword were actually stripped, not merely that the header was captured.
- **T3 — dims/floor/fields.** For the `LASALLE A` room: `dimensions === "30' x 25' x 10.5'"`, `floor === "7th Floor"`, `set_time === "3/24 @ 10:00 AM"`, and `video` contains `Eiki Projector`. These values are derived from the fixture cell content (§4), not invented; the `video` substring is a non-`N/A`, block-specific string that a mis-scoped extraction (grabbing the wrong block) could not accidentally satisfy.
- **T4 — no prefix leakage.** No emitted room `name` contains `RPAS` or `BREAKOUT` (`rooms.every(r => !/RPAS|BREAKOUT/i.test(r.name))`). Concrete failure mode caught: the 3.2 pre-strip regressing so the name retains `RPAS BREAKOUT 1 LASALLE A`.

The corpus no-op test (`roomHeaderModel.test.ts:194`) already guards that no OTHER fixture changes and that the regenerated `dci-rpas` baseline matches live output — it is the structural defense, not a new meta-test.

## 8. Guard conditions & edge cases

- **Numberless gate unchanged.** `firstLine` = `RPAS BREAKOUT 1` fails `/^BREAKOUT\s+\d/i` (`rooms.ts:1092`), so these take the **numberless** branch, which requires `roomHasContent(room)` (`rooms.ts:1114`, `roomHasContent` at `rooms.ts:687`). Both rooms have real BO fields (dims/floor/video/set_time) → admitted. A prefixed header sitting above NO field block (or an equipment/pull-sheet `<PREFIX> BREAKOUT SESSION N - X` section with no room fields) still fails `roomHasContent` → rejected. The change adds no new admit path beyond "prefixed header + real BO fields."
- **Block extraction unchanged.** `extractBoBlock` (`rooms.ts:1264`) bounds the block by the next `NEXT_ROOM_HEADER_RE`/`roomHeaderLines`/blank-line terminator; the RPAS blocks are terminated by the blank line after their `Digital Signage` row (verified in §4 output). No new terminator wiring is needed.
- **Case-sensitivity is load-bearing.** Both new regexes are case-sensitive on the `BREAKOUT` keyword and the prefix token, so mixed-case template labels (`Breakout Room Setup Date / Time`) and mixed-case names (`Grand Breakout Hall`) are never matched/stripped.
- **Dims-only asset protection is untouched.** This change does NOT introduce any dims-based admit gate; admission still requires the literal `BREAKOUT` keyword in the header. The `BL-ROOM-DIMS-ONLY-NOVEL-HEADER` descoping (no name-blind dims admit) is unaffected.

## 9. Out of scope (descoped)

- **Multi-token prefixes.** `(?:[A-Z0-9]+\s+)?` admits exactly ONE prefix token. A two-word prefix (`DCI EAST BREAKOUT 1`) is deliberately out of scope — no such header exists in the corpus, and widening the prefix risks swallowing a legitimate name word. Revisit only when a real fixture needs it.
- **Lowercase / mixed-case prefixed headers.** Real headers are ALL-CAPS; a mixed-case `Rpas Breakout 1` is out of scope by the case-sensitivity guard (§8).
- **Bare-name dims-only rooms with no `BREAKOUT`/`BO` field block.** Still out of scope per `BL-ROOM-DIMS-ONLY-NOVEL-HEADER`; unchanged here.

## 10. Do-not-relitigate (disagreement-loop preempts)

- **Optional prefix group is intentional, not over-broad.** Its case-sensitivity + the downstream `roomHasContent` numberless gate are the two protections; §5's grep proves it newly matches exactly the two intended headers. Do not propose making the prefix mandatory (breaks plain `BREAKOUT`) or `/i` (matches mixed-case labels).
- **Baseline change is expected and correct.** `dci-rpas-central` gaining two breakouts is the whole point; the corpus no-op test failing on that one key pre-regeneration is the designed signal, not a regression. Every OTHER key stays byte-identical.
- **Separate PR, not a rider.** Per the backlog entry, this changes the frozen baseline and is its own PR (it was explicitly excluded from the BO-venue-header anchor's byte-identical scope).

## 11. Plan-wide invariant applicability

- **Inv. 1 (TDD per task):** applies — test-first, commit per task.
- **Inv. 6 (commit per task, conventional commits):** applies — `test(parser):` / `feat(parser):`.
- **Inv. 2 (advisory lock), 3 (email canon), 4 (no global cursor), 5 (no raw error codes in UI), 8 (UI gate), 9 (Supabase boundary), 10 (mutation telemetry):** N/A — pure parser logic, no DB/auth/UI/mutation/HTTP surface.
- **Meta-test inventory:** CREATES none; EXTENDS none as a registry. The existing corpus no-op deep-equal (`roomHeaderModel.test.ts:194`) already covers the structural defense (no fabricated/dropped room on any fixture).
