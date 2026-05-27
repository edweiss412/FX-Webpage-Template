-- M12.1 T2.1 — enable pg_net for outbound HTTP calls from pg_cron job bodies.
-- See sub-amendment spec §2.3 (cron scheduling architecture) + §4 (live-code citations).
create extension if not exists pg_net;
