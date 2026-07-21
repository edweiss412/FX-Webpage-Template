# Self-found spec defects (found during plan pre-draft verification, after R1 dispatch)

Fold into the R1 repair commit regardless of whether Codex independently reports them.

## D1 — `admin_alerts` unique index makes Apply collide

`supabase/migrations/20260501001000_internal_and_admin.sql`:

```sql
create unique index admin_alerts_one_unresolved_idx
  on public.admin_alerts (coalesce(show_id::text, ''), code) where resolved_at is null;
```

**One unresolved row per (show, code).** Spec §5.1/§5.3 claim Apply inserts one row per `scenario.alerts` and that "real rows are never touched". Both break:

- A scenario carrying two rows of the same code (a plausible "occurrence" or "many items" construction) violates the index.
- If the target show already has a **real** unresolved alert of a code the scenario also inserts, the insert is rejected by the DB. §5.3's "allowed; real rows are never touched" is wrong — it is not allowed, it fails.

**Fix direction:** Apply skips any code that already has an unresolved row on the target show and reports the skipped set; scenarios are constrained to distinct codes (asserted in the catalog). Also narrows materialize's job: T1's 44-code sweep belongs to the gallery, so materialize's scenarios are T3 composites with few codes and low collision risk.

## D2 — the two consumers disagree on derived alert fields

`lib/adminAlerts/fetchPerShowAlerts.ts:100` selects only `id, code, context, raised_at, occurrence_count`. `identityText`, `messageParams`, and `crewName` are **derived** at `lib/adminAlerts/fetchPerShowAlerts.ts:169-172` from `context` plus a DB-resolved `AlertIdentity`.

The spec's scenario type declares `alerts: AttentionAlertInput[]`, which lets the catalog author set those three derived fields directly. The gallery would honor them; materialize cannot reproduce them (they are not columns). **Same scenario, two different renderings** — precisely the failure the instrument exists to prevent.

**Fix direction:** scenario alerts declare DB-shaped fields only (`code`, `context`, `raised_at`, `occurrence_count`), plus an explicit optional `identity: AlertIdentity | null` used **only** by the gallery. Extract the DB-independent derivation tail (`identity -> {identityText, messageParams, crewName}`) into an exported pure function that both `fetchPerShowAlerts` and the gallery call, so the shared step cannot drift.

Identity **resolution** (`resolveAlertIdentities`, up to 3 DB reads against real crew rows) is inherently DB-bound and cannot be reproduced for synthetic rows. The spec must state plainly: gallery identity is _declared_, materialize identity is _resolved_, and the routing readout labels which it is showing.

## D4 — holds have the same derived-vs-stored split as D2

`FeedEntry` (`lib/sync/holds/types.ts:60-77`) is a **derived** shape produced by `readShowChangeFeed` from `sync_holds` rows merged with `show_change_log` rows. It is not a storable shape. The spec's scenario type declares `holds: FeedEntry[]`, so — exactly as in D2 — the gallery can render a hold that materialize cannot insert.

The storable shape is `SyncHold` (`lib/sync/holds/types.ts:12-25`): `{ id, showId, driveFileId, domain, entityKey, heldValue, proposedValue, baseModifiedTime, kind, reservationCollisions, createdAt, createdBy }`.

Narrow but real divergence: `toHoldItem` (`lib/admin/attentionItems.ts:284-295`) reads only `entry.summary`, `entry.status`, `entry.action`, and `entry.gate.holdId`. `summary` is **generated** by the feed shaping from the hold's `disposition`, not authored — so a catalog that authors `summary` freely shows copy materialize will never produce.

**Fix direction:** same pattern as D2. Scenario holds declare `SyncHold`-shaped input; the gallery runs the same shaping step `readShowChangeFeed` uses (`lib/sync/feed/readShowChangeFeed.ts:286-318`) to produce `FeedEntry`. Extract that step if it is not already callable in isolation.

## D5 — `logAdminOutcome` codes do not take the §12.4 lockstep

Spec §7.1 claimed the two new codes fan out to master-spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`. False, and expensive in the wrong direction: it would have sent the implementer to edit the master spec and regenerate codes for no reason, and putting a non-message code into the message catalog risks the `x1-catalog-parity` gate rather than satisfying it.

`logAdminOutcome`'s `code` is a free string (`lib/log/logAdminOutcome.ts:9`), not a `MessageCode`. Verified: neither `DEV_PARSE_STAGED` nor `DEV_SCHEMA_RESET` appears in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` or `lib/messages/catalog.ts`; both appear only in `app/admin/dev/actions.ts`, `tests/log/_auditableMutations.ts`, and `tests/log/adminOutcomeBehavior.test.ts`.

**Fix applied:** §7.1 now states the registration surface is those two test registries and nothing else. Net effect is a scope _reduction_.

## D3 — `context` is NOT NULL

Same migration: `context jsonb not null`. Spec §3.1's generic default row uses `context: null`. Valid for the gallery (`AttentionAlertInput.context` is `Record<string, unknown> | null`, `lib/admin/attentionItems.ts:38`), invalid for any materialize insert. Default must be `{}` for DB-bound scenarios; the spec must distinguish the gallery-legal shape from the DB-legal shape.
