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
--
-- Deploy version skew (Codex adversarial R1/R2): rows the OLD writer creates
-- AFTER this migration but BEFORE the fixed writer deploys are repaired by the
-- writer's on-conflict context refresh when they retry/send; rows that are
-- already terminal (sent, or failed at SEND_RETRY_CAP) are not revisited by
-- the loop, so the closure for those is to RE-RUN this file once post-deploy
-- (it is idempotent — `psql "$URL" -f <this file>`). Project reality at merge
-- time: pre-launch (v1 ships at M13), the only live environment is the
-- validation project, and its email_deliveries table is empty — production
-- is born with the fixed writer and never has a skew window at all.

update public.email_deliveries
   set context = (context #>> '{}')::jsonb
 where jsonb_typeof(context) = 'string'
   and (context #>> '{}') ~ '^\s*[{[]';
