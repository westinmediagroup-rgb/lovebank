-- ============================================================
-- LOVE BANK — Games migration
-- Run in Supabase SQL Editor
-- ============================================================

-- Game responses — stores each partner's answer to Q&A questions
create table public.game_responses (
  id          uuid primary key default uuid_generate_v4(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  player_id   uuid not null references public.profiles(id) on delete cascade,
  game_type   text not null check (game_type in ('qa','match')),
  category    text not null,
  question_idx integer not null,
  answer      text not null,
  created_at  timestamptz default now(),
  unique (couple_id, player_id, game_type, category, question_idx)
);

-- Match game completions — tracks which card pairs have been matched
create table public.match_completions (
  id          uuid primary key default uuid_generate_v4(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  card_id     text not null,
  tokens_awarded integer default 8,
  created_at  timestamptz default now(),
  unique (couple_id, card_id)
);

-- RLS
alter table public.game_responses enable row level security;
alter table public.match_completions enable row level security;

create policy "game_responses_select" on public.game_responses
  for select using (
    couple_id in (
      select id from public.couples
      where partner_a_id = auth.uid() or partner_b_id = auth.uid()
    )
  );

create policy "game_responses_insert" on public.game_responses
  for insert with check (player_id = auth.uid());

create policy "game_responses_update" on public.game_responses
  for update using (player_id = auth.uid());

create policy "match_completions_select" on public.match_completions
  for select using (
    couple_id in (
      select id from public.couples
      where partner_a_id = auth.uid() or partner_b_id = auth.uid()
    )
  );

create policy "match_completions_insert" on public.match_completions
  for insert with check (
    couple_id in (
      select id from public.couples
      where partner_a_id = auth.uid() or partner_b_id = auth.uid()
    )
  );

-- Indexes
create index idx_game_responses_couple on public.game_responses(couple_id);
create index idx_match_completions_couple on public.match_completions(couple_id);
