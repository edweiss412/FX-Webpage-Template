-- Backfill: normalize double-encoded email_deliveries.context rows.
--
-- lib/notify/deliver.ts (upsertSent/upsertFailed) passed JSON.stringify(context)
-- to a postgres.js `::jsonb` param; postgres.js serializes the param itself, so
-- every written row stored a jsonb STRING SCALAR whose inner text is the JSON
-- object document (jsonb_typeof(context) = 'string'). The writer is fixed in
-- the same PR; this migration repairs rows the broken writer already produced.
--
-- Idempotent: after the first pass jsonb_typeof is 'object', so re-runs match
-- zero rows. The inner-text guard (`^\s*[{[]`) skips any string scalar that is
-- not a JSON document, so the cast can never throw on unexpected data.

update public.email_deliveries
   set context = (context #>> '{}')::jsonb
 where jsonb_typeof(context) = 'string'
   and (context #>> '{}') ~ '^\s*[{[]';
