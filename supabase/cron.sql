-- ============================================================
-- LOVE BANK — Cron schedules
-- Run this in Supabase SQL Editor AFTER deploying Edge Functions
-- Requires pg_cron extension (enabled by default on Supabase)
-- ============================================================

-- Enable pg_cron
create extension if not exists pg_cron;

-- Nibble drain — every hour
select cron.schedule(
  'nibble-cron',
  '0 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/nibble-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Auto-confirm deposits + 7-day penalties — every hour
select cron.schedule(
  'auto-confirm-deposits',
  '30 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/auto-confirm-deposits',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Send email notifications — every 5 minutes
select cron.schedule(
  'send-notifications',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Expire stale invites — daily at 2am UTC
select cron.schedule(
  'expire-invites',
  '0 2 * * *',
  $$
  update public.invites
  set status = 'expired'
  where status = 'pending'
    and expires_at < now();
  $$
);
