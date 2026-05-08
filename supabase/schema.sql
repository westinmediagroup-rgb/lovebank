-- ============================================================
-- LOVE BANK — Full Database Schema
-- Run this in Supabase SQL Editor (one paste, one run)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- Extended user data beyond auth.users
-- ============================================================
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  display_name        text not null,
  love_language       text check (love_language in ('words','time','touch','acts','gifts')),
  partner_ll_guess    text check (partner_ll_guess in ('words','time','touch','acts','gifts')),
  communication_style text check (communication_style in ('process_first','say_it_direct','need_space','write_it_out')),
  needs               text[] default '{}',      -- up to 3
  fears               text[] default '{}',      -- up to 2, private
  relationship_stage  text check (relationship_stage in ('dating','engaged','newlyweds','married')),
  relationship_start  date,
  onboarding_complete boolean default false,
  couple_id           uuid,                     -- FK added after couples table
  current_score       integer default 0,
  deposit_streak      integer default 0,
  last_deposit_at     timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ============================================================
-- COUPLES
-- ============================================================
create table public.couples (
  id              uuid primary key default uuid_generate_v4(),
  partner_a_id    uuid not null references public.profiles(id) on delete cascade,
  partner_b_id    uuid references public.profiles(id) on delete set null,
  status          text default 'pending' check (status in ('pending','active','paused','disconnected')),
  relationship_stage text check (relationship_stage in ('dating','engaged','newlyweds','married')),
  relationship_start date,
  couple_score    integer default 0,
  health_state    text default 'Growing' check (health_state in ('Thriving','Growing','Recovering','Drifting','Struggling')),
  nibble_active   boolean default false,
  nibble_since    timestamptz,
  opening_balance integer default 150,          -- set on creation based on stage
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Add FK from profiles to couples
alter table public.profiles
  add constraint profiles_couple_id_fkey
  foreign key (couple_id) references public.couples(id) on delete set null;

-- ============================================================
-- INVITE LINKS
-- ============================================================
create table public.invites (
  id          uuid primary key default uuid_generate_v4(),
  token       text unique not null default encode(gen_random_bytes(24), 'base64url'),
  inviter_id  uuid not null references public.profiles(id) on delete cascade,
  invitee_email text,
  status      text default 'pending' check (status in ('pending','accepted','expired')),
  expires_at  timestamptz default (now() + interval '72 hours'),
  created_at  timestamptz default now()
);

-- ============================================================
-- DEPOSITS
-- ============================================================
create table public.deposits (
  id                  uuid primary key default uuid_generate_v4(),
  couple_id           uuid not null references public.couples(id) on delete cascade,
  logger_id           uuid not null references public.profiles(id) on delete cascade,
  receiver_id         uuid not null references public.profiles(id) on delete cascade,
  deposit_type        text not null,
  -- quick_text | voice_note | written_note | act_of_service | surprise_gesture
  -- planned_experience | hard_conversation | public_affirmation | milestone_written
  love_language_tag   text check (love_language_tag in ('words','time','touch','acts','gifts')),
  effort_tier         text not null check (effort_tier in ('quick','planned','brave','milestone')),
  ll_match            boolean default false,    -- deposit LL matches receiver's LL
  base_value          integer not null,
  ll_multiplier       numeric(3,2) default 1.0,
  effort_multiplier   numeric(3,2) default 1.0,
  final_value         integer not null,
  note                text,
  status              text default 'pending' check (status in ('pending','confirmed','adjusted','flagged','expired')),
  confirmed_at        timestamptz,
  auto_confirm_at     timestamptz,              -- set on creation, null for T3
  tokens_applied      boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ============================================================
-- WITHDRAWALS
-- ============================================================
create table public.withdrawals (
  id              uuid primary key default uuid_generate_v4(),
  couple_id       uuid not null references public.couples(id) on delete cascade,
  logger_id       uuid not null references public.profiles(id) on delete cascade,
  withdrawal_type text not null,
  -- cancelled_plans | going_quiet | dismissal | stonewalling | broken_promise
  -- phone_during_connection | avoidance | false_agreement | unilateral_decision
  -- chronic_criticism | no_repair_after_conflict
  cost            integer not null,
  note            text,
  repaired        boolean default false,
  repair_id       uuid,                         -- FK to repairs
  repair_window_ends_at timestamptz default (now() + interval '24 hours'),
  penalty_applied boolean default false,        -- 7-day unresolved penalty
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- REPAIRS
-- ============================================================
create table public.repairs (
  id              uuid primary key default uuid_generate_v4(),
  withdrawal_id   uuid not null references public.withdrawals(id) on delete cascade,
  couple_id       uuid not null references public.couples(id) on delete cascade,
  logger_id       uuid not null references public.profiles(id) on delete cascade,
  repair_type     text not null check (repair_type in ('apology_action','hard_conversation','written_note')),
  tokens_returned integer not null,             -- 50% of withdrawal cost
  note            text,
  within_window   boolean not null,             -- true if within 24h
  created_at      timestamptz default now()
);

-- Add FK from withdrawals to repairs
alter table public.withdrawals
  add constraint withdrawals_repair_id_fkey
  foreign key (repair_id) references public.repairs(id) on delete set null;

-- ============================================================
-- NIBBLE EVENTS
-- ============================================================
create table public.nibble_events (
  id          uuid primary key default uuid_generate_v4(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  event_type  text not null check (event_type in ('activated','drain','repelled')),
  tokens_taken integer default 0,
  created_at  timestamptz default now()
);

-- ============================================================
-- ACTIVITY LOG (denormalised feed for dashboard)
-- ============================================================
create table public.activity_log (
  id            uuid primary key default uuid_generate_v4(),
  couple_id     uuid not null references public.couples(id) on delete cascade,
  actor_id      uuid not null references public.profiles(id) on delete cascade,
  event_type    text not null,
  -- deposit_logged | deposit_confirmed | deposit_flagged | withdrawal_logged
  -- repair_logged | nibble_drain | nibble_repelled | streak_bonus
  ref_id        uuid,                           -- references deposit/withdrawal/repair id
  token_delta   integer default 0,
  description   text,
  created_at    timestamptz default now()
);

-- ============================================================
-- NOTIFICATION QUEUE
-- ============================================================
create table public.notification_queue (
  id            uuid primary key default uuid_generate_v4(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  type          text not null,
  -- deposit_logged | confirmation_request | deposit_auto_confirmed
  -- deposit_flagged | repair_window_closing | nibble_warning | nibble_repelled
  -- invite_sent | partner_joined | weekly_balance_sheet
  payload       jsonb default '{}',
  sent          boolean default false,
  sent_at       timestamptz,
  created_at    timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.invites enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;
alter table public.repairs enable row level security;
alter table public.nibble_events enable row level security;
alter table public.activity_log enable row level security;
alter table public.notification_queue enable row level security;

-- profiles: users can read their own and their partner's profile
create policy "profiles_select" on public.profiles
  for select using (
    auth.uid() = id
    or id in (
      select case when partner_a_id = auth.uid() then partner_b_id else partner_a_id end
      from public.couples
      where (partner_a_id = auth.uid() or partner_b_id = auth.uid())
        and status = 'active'
    )
  );

create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id);

-- couples: members can read their own couple
create policy "couples_select" on public.couples
  for select using (
    partner_a_id = auth.uid() or partner_b_id = auth.uid()
  );

create policy "couples_insert" on public.couples
  for insert with check (partner_a_id = auth.uid());

create policy "couples_update" on public.couples
  for update using (
    partner_a_id = auth.uid() or partner_b_id = auth.uid()
  );

-- invites: inviter can manage, anyone can read by token
create policy "invites_select" on public.invites
  for select using (inviter_id = auth.uid() or true);  -- token lookup needed

create policy "invites_insert" on public.invites
  for insert with check (inviter_id = auth.uid());

create policy "invites_update" on public.invites
  for update using (inviter_id = auth.uid() or auth.uid() is not null);

-- deposits: couple members only
create policy "deposits_select" on public.deposits
  for select using (
    couple_id in (
      select id from public.couples
      where partner_a_id = auth.uid() or partner_b_id = auth.uid()
    )
  );

create policy "deposits_insert" on public.deposits
  for insert with check (logger_id = auth.uid());

create policy "deposits_update" on public.deposits
  for update using (
    couple_id in (
      select id from public.couples
      where partner_a_id = auth.uid() or partner_b_id = auth.uid()
    )
  );

-- withdrawals: couple members only
create policy "withdrawals_select" on public.withdrawals
  for select using (
    couple_id in (
      select id from public.couples
      where partner_a_id = auth.uid() or partner_b_id = auth.uid()
    )
  );

create policy "withdrawals_insert" on public.withdrawals
  for insert with check (logger_id = auth.uid());

create policy "withdrawals_update" on public.withdrawals
  for update using (
    couple_id in (
      select id from public.couples
      where partner_a_id = auth.uid() or partner_b_id = auth.uid()
    )
  );

-- repairs
create policy "repairs_select" on public.repairs
  for select using (
    couple_id in (
      select id from public.couples
      where partner_a_id = auth.uid() or partner_b_id = auth.uid()
    )
  );

create policy "repairs_insert" on public.repairs
  for insert with check (logger_id = auth.uid());

-- nibble events: couple members read only
create policy "nibble_events_select" on public.nibble_events
  for select using (
    couple_id in (
      select id from public.couples
      where partner_a_id = auth.uid() or partner_b_id = auth.uid()
    )
  );

-- activity log: couple members read only
create policy "activity_log_select" on public.activity_log
  for select using (
    couple_id in (
      select id from public.couples
      where partner_a_id = auth.uid() or partner_b_id = auth.uid()
    )
  );

-- notification queue: own notifications only
create policy "notifications_select" on public.notification_queue
  for select using (recipient_id = auth.uid());

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger couples_updated_at before update on public.couples
  for each row execute function public.handle_updated_at();

create trigger deposits_updated_at before update on public.deposits
  for each row execute function public.handle_updated_at();

create trigger withdrawals_updated_at before update on public.withdrawals
  for each row execute function public.handle_updated_at();

-- Create profile on user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_profiles_couple_id on public.profiles(couple_id);
create index idx_couples_partner_a on public.couples(partner_a_id);
create index idx_couples_partner_b on public.couples(partner_b_id);
create index idx_deposits_couple_id on public.deposits(couple_id);
create index idx_deposits_status on public.deposits(status);
create index idx_deposits_auto_confirm on public.deposits(auto_confirm_at) where tokens_applied = false;
create index idx_withdrawals_couple_id on public.withdrawals(couple_id);
create index idx_withdrawals_unrepaired on public.withdrawals(created_at) where repaired = false;
create index idx_activity_log_couple on public.activity_log(couple_id, created_at desc);
create index idx_invites_token on public.invites(token);
create index idx_invites_status on public.invites(status);
create index idx_notification_queue_unsent on public.notification_queue(recipient_id) where sent = false;
