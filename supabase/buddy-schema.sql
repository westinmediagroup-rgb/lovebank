-- ─── Buddy System Schema ────────────────────────────────────────────────────
-- Run this in the Supabase SQL editor

-- Buddy connections (one per pair)
create table if not exists buddy_connections (
  id             uuid primary key default gen_random_uuid(),
  user_a_id      uuid references profiles(id) on delete cascade not null,  -- inviter
  user_b_id      uuid references profiles(id) on delete cascade,            -- acceptor (null until accepted)
  token          text unique not null default gen_random_uuid()::text,
  status         text not null default 'pending',  -- pending | active | paused
  created_at     timestamptz default now(),
  accepted_at    timestamptz
);

alter table buddy_connections enable row level security;

create policy "Users see their own buddy connections"
  on buddy_connections for select
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

create policy "Users create buddy invites"
  on buddy_connections for insert
  with check (auth.uid() = user_a_id);

create policy "Acceptor can update connection"
  on buddy_connections for update
  using (auth.uid() = user_b_id or auth.uid() = user_a_id);

-- Anyone can read a pending connection by token (for accept flow)
create policy "Read pending connection by token"
  on buddy_connections for select
  using (status = 'pending');


-- Goals
create table if not exists goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id) on delete cascade not null,
  title          text not null,
  category       text not null default 'habit',  -- habit | social | self-care | growth | custom
  period         text not null default 'daily',   -- daily | weekly
  target_count   int not null default 1,
  active         boolean default true,
  suggested_by   uuid references profiles(id),    -- buddy who suggested it (null = self)
  created_at     timestamptz default now()
);

alter table goals enable row level security;

create policy "Users manage own goals"
  on goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Buddies can read their buddy's goals
create policy "Buddies can view each other's goals"
  on goals for select
  using (
    exists (
      select 1 from buddy_connections bc
      where bc.status = 'active'
        and (
          (bc.user_a_id = auth.uid() and bc.user_b_id = goals.user_id) or
          (bc.user_b_id = auth.uid() and bc.user_a_id = goals.user_id)
        )
    )
  );

-- Buddies can insert goals for their buddy (suggestions)
create policy "Buddies can suggest goals"
  on goals for insert
  with check (
    auth.uid() = user_id
    or (
      suggested_by = auth.uid()
      and exists (
        select 1 from buddy_connections bc
        where bc.status = 'active'
          and (
            (bc.user_a_id = auth.uid() and bc.user_b_id = goals.user_id) or
            (bc.user_b_id = auth.uid() and bc.user_a_id = goals.user_id)
          )
      )
    )
  );


-- Goal check-ins
create table if not exists goal_checkins (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid references goals(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  note        text,
  checked_at  timestamptz default now()
);

alter table goal_checkins enable row level security;

create policy "Users manage own checkins"
  on goal_checkins for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Buddies can view checkins
create policy "Buddies can view checkins"
  on goal_checkins for select
  using (
    exists (
      select 1 from buddy_connections bc
      where bc.status = 'active'
        and (
          (bc.user_a_id = auth.uid() and bc.user_b_id = goal_checkins.user_id) or
          (bc.user_b_id = auth.uid() and bc.user_a_id = goal_checkins.user_id)
        )
    )
  );


-- Buddy messages (short encouragement notes, not full chat)
create table if not exists buddy_messages (
  id             uuid primary key default gen_random_uuid(),
  connection_id  uuid references buddy_connections(id) on delete cascade not null,
  sender_id      uuid references profiles(id) on delete cascade not null,
  body           text not null,
  created_at     timestamptz default now()
);

alter table buddy_messages enable row level security;

create policy "Connection members manage messages"
  on buddy_messages for all
  using (
    exists (
      select 1 from buddy_connections bc
      where bc.id = buddy_messages.connection_id
        and (bc.user_a_id = auth.uid() or bc.user_b_id = auth.uid())
    )
  )
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from buddy_connections bc
      where bc.id = buddy_messages.connection_id
        and (bc.user_a_id = auth.uid() or bc.user_b_id = auth.uid())
    )
  );
