-- ============================================================
-- Love Bank — Reminders Schema
-- Run this in Supabase → SQL Editor
-- ============================================================

-- 1. Add notification columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reminders_email      boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminders_sms        boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_number         text,
  ADD COLUMN IF NOT EXISTS phone_verified       boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_quiet_start time      DEFAULT '21:00',
  ADD COLUMN IF NOT EXISTS reminder_quiet_end   time      DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS reminder_timezone    text      DEFAULT 'America/New_York';

-- 2. Reminder send log
CREATE TABLE IF NOT EXISTS reminders_sent (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reminder_type  text        NOT NULL,  -- nibble_alert | streak_warning | daily_nudge | etc.
  channel        text        NOT NULL,  -- email | sms | email+sms
  sent_at        timestamptz DEFAULT now(),
  metadata       jsonb       DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS reminders_sent_user_time ON reminders_sent (user_id, sent_at DESC);

-- 3. RLS: users can only read their own reminder logs
ALTER TABLE reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own reminders"
  ON reminders_sent FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (edge function) bypasses RLS — no insert policy needed.

-- 4. pg_cron job — runs every hour
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY below before running.
-- Find them in: Supabase → Project Settings → API
--
-- SELECT cron.schedule(
--   'love-bank-send-reminders',
--   '0 * * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
--       'Content-Type',  'application/json'
--     ),
--     body    := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );
--
-- To verify it's scheduled:
-- SELECT * FROM cron.job;
--
-- To remove it later:
-- SELECT cron.unschedule('love-bank-send-reminders');
