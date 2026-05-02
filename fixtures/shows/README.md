# Show fixture corpus

Each show below is one Doug-produced Institutional Investor event. Three formats:

- **`raw/`** — Google Sheets pulled via Drive MCP `read_file_content`, saved verbatim as markdown tables. Re-fetch with the sheet ID listed below.
- **`pdf-only/`** — Drive PDF exports for shows where the live sheet was never shared (or only INFO/GEAR/DIAGRAMS PDFs were sent).
- **`email-embedded/`** — shows whose original sheet links 404'd; details reconstructed from the prose Doug pasted into the gmail thread body.

All sheets owned by Doug Larson (`dougefreshav@gmail.com` / `dlarson@fxav.net`). Re-fetch any sheet:

```
mcp__claude_ai_Google_Drive__read_file_content({ fileId: "<ID below>" })
```

---

## `raw/` — 10 live sheets

| File                                                | Sheet ID                                       | Show                                                 | Venue                                           | Dates            | Notes                                                                                                                                                                             |
| --------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2024-05-east-coast-family-office.md`               | `1-46eqcGFZtLzbGUt42d-rKLRgM_x0c-SdcTDfOUIhL0` | East Coast Family Office Wealth Conference           | Four Seasons Fort Lauderdale                    | 5/13–5/15/2024   | Oldest in corpus. Smaller field set, no formal GEAR proposal table yet — early template version.                                                                                  |
| `2025-03-dci-rpas-central.md`                       | `1GSVK-C56hiaSnBO8GtObi6Q37r0Vo3oLN_AvjmTlT0k` | DCI / RPAS Central                                   | Four Seasons Hotel Chicago (Westin for crew)    | 3/23–3/27/2025   | Two identical General Sessions (DCI + RPAS) in the same ballroom, split by airwall. RPAS has 2 small breakouts on day 1 only.                                                     |
| `2025-04-asset-mgmt-cfo-coo.md`                     | `1feCUFlC3gB9drA_EKIEpIN9T-iG3sezCmU2b5dD2kW4` | AMI CFO-COO Roundtable                               | Four Seasons Hotel Chicago                      | 4/6–4/10/2025    | Single GS, no breakouts. Zoom virtual speaker/audience added last-minute.                                                                                                         |
| `2025-05-redefining-fixed-income-private-credit.md` | `1y1MPPAt-wq18o0TAu0zZA4a9DKKOHELKzSGt88cIgXQ` | Redefining Fixed Income Forum + Private Credit Forum | Four Seasons Hotel Chicago (The Drake for crew) | 5/11–5/15/2025   | Two co-located client programs. Two breakouts (LaSalle A, Walton Room).                                                                                                           |
| `2025-06-ria-investment-forum.md`                   | `1BTWrGjmZahKRFfiOppOabysB2BfAgdejhwzfzhQfV0k` | RIA Investment Forum Central                         | Park Hyatt Chicago                              | 6/23–6/26/2025   | Two breakouts (Drawing Room A/B). File contains full FXAV crew directory at end.                                                                                                  |
| `2025-10-consultants-roundtable.md`                 | `1lGuXhJtF8R7wTc3cHLN5ZlDZI61EwgcrLufLd3PEs5U` | Consultants Roundtable (AII/III)                     | Four Seasons Hotel Chicago                      | 10/7–10/10/2025  | Different client contact — Elisabeth Kaufman DeTone, II London (`@iilondon.com`). Client labeled `AII/III`, not just `II`. Four breakouts (Delaware, LaSalle, Walton, State B).   |
| `2025-10-fixed-income-trading-summit.md`            | `1CoQRiL0AgZ0rp1_B9Fo205G3bAKv3HYWMgw4SW5xCbU` | Fixed Income Trading Summit                          | Park Hyatt Chicago                              | 10/18–10/22/2025 | One breakout (Salon D). Has "SPREADSHEET FROM LAST YEAR" annotation — Doug duplicates prior-year sheet as starting template.                                                      |
| `2026-03-rpas-central-four-seasons.md`              | `1Fm-kPBDRucPGnGCahh4bqBs68JquhQe9qmrm1Cbjl6I` | RPAS Central 2026                                    | Four Seasons Hotel Chicago                      | 3/22–3/26/2026   | Two breakouts (State A/B). Center box truss for lights due to chandeliers.                                                                                                        |
| `2026-04-asset-mgmt-cfo-coo-waldorf.md`             | `12IBnyJiFdV8zTuGxO9xpCoDy6LViCooynQ8YJtTPKxg` | AMI CFO-COO Roundtable 2026                          | Waldorf Astoria Chicago (new venue)             | 4/19–4/23/2026   | Single GS in Sinclair Ballroom. Power distro + 15' camlock required. NO outside food/drink rule. Door-hold button on freight elevator.                                            |
| `2026-05-fintech-forum-cto-summit.md`               | `1DlzndW4hgK673PvLjBIW45eOb9z6C1oy3cJem64y5OE` | FinTech Forum CTO Summit                             | Kimpton Gray Chicago                            | 5/4–5/6/2026     | Upcoming. 3 show days (longest in corpus). Secondary contact (Lew Knox) alongside main (Ashley Morgan) — adds a column. 3 breakout rooms. Virtual Speaker + Virtual Audience YES. |

---

## `pdf-only/` — 1 show

| File(s)                                 | Source PDF ID                       | Show                                           | Venue              | Dates          | Notes                                                                                                                                                                                      |
| --------------------------------------- | ----------------------------------- | ---------------------------------------------- | ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `2025-11-sub-advisory-central__INFO.md` | `1fiPuOjNWObaPVdmw6FEb5zDFrxlpLAhB` | Sub-Advisory Institute Central Roundtable 2025 | Park Hyatt Chicago | 11/3–11/5/2025 | INFO-tab export, single page. Two breakouts (Drawing Room 1/2).                                                                                                                            |
| `2025-11-sub-advisory-central__GEAR.md` | `1xgIDQzfv-yFHwlfewLMNgL9gFNN89PqE` | (same show)                                    | (same)             | (same)         | **Not Doug's GEAR tab** — Chip Mulzoff's PROPOSAL form. Different layout: per-day rental quantities in a per-Nov-day grid. Useful as evidence that GEAR exists in two formats across FXAV. |

No DIAGRAMS PDF was attached for this show.

---

## `email-embedded/` — 2 shows (sheets 404'd)

| File                                         | Gmail Thread                                      | Original Sheet ID (deleted)                    | Show                                              | Venue                                            | Dates            | Notes                                                                                                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2024-10-legal-forum-chro-dc.md`             | `19258900e77e70f7` (dlarson@fxav.net, 2024-10-04) | `1VpMtMTBzmE63ORWAuY5ZTPqnGuaDeLtTfZ3SYrm_CjM` | II Legal Forum + USI Chief Human Resource Officer | Four Seasons Washington DC (Sonder for one crew) | 10/6–10/10/2024  | Two back-to-back/overlap programs in one Dumbarton room (low ceiling 9'2"). Has unique **"Seasons Restaurant Lunch Session"** sub-event (Wed lunch keynote with portable PA). Crew rows include flight info inline (American/United). |
| `2024-11-sub-advisory-central-park-hyatt.md` | `19331207022577d1` (dlarson@fxav.net, 2024-11-15) | `1y5WtwPhFBHvuK_NOk_FGUD9_sBSf47ArakZG7E1L8js` | Sub-Advisory Central Roundtable                   | Park Hyatt Chicago                               | 11/18–11/20/2024 | Two breakouts (Drawing Room A 20×30, Drawing Room B 21×28). Day-restricted crew (Beau Black load-in only, Kari Rose load-out only).                                                                                                   |

---

## Out of scope (not in corpus)

- **Chip Mulzoff–run shows** (Datacloud 2024 Austin, ABS East 2024 Miami, Private Credit Connect 2024 Miami) — Chip uses freeform prose emails, not Doug's template. Different structure entirely.
- **Corey Andrews–run shows** (Capital Allocators 9/14–9/18/25 Four Seasons Chicago) — also prose email, no shared sheet.
- **Embedded images, room diagrams, agenda PDFs** — Drive MCP `read_file_content` returns text only. Diagrams tabs reference linked Drive folders/files that need separate ingestion.
- **Personal duplicate copies** of the FinTech Forum 2026 sheet sit in Eric's Drive root (`1ZtcesXznK8SI5snY9xEMv1ERsK2OM_GvLJzM75dNHg4`, `14zimY_ONmXhKRh3oFgT2Q1Xle-HNlkZwDg0vRbQpuHI`) — duplicates, ignore.

---

## Adding a new show

1. Get the sheet ID from Doug's "Details for…" email (`https://docs.google.com/spreadsheets/d/<ID>/edit`).
2. `mcp__claude_ai_Google_Drive__read_file_content({ fileId: "<ID>" })`
3. Save the `fileContent` field verbatim to `raw/<YYYY-MM-slug>.md`.
4. Append a row to the `raw/` table above with sheet ID, show, venue, dates, and any unique-to-this-show notes.
