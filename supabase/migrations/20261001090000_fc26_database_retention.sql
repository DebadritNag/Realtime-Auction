-- FC26 database source, Underdog tagging and pre-auction retentions.
-- Additive and idempotent: no UPDATE/DELETE/reseed of existing data.
begin;

alter table public.football_players
 add column if not exists fc26_player_id text,
 add column if not exists full_name text,
 add column if not exists potential integer,
 add column if not exists draft_pool text,
 add column if not exists player_tag text,
 add column if not exists source_category text,
 add column if not exists source_categories text[] not null default '{}',
 add column if not exists auction_pot text;

do $$ begin
 if not exists (select 1 from pg_constraint where conname='football_players_draft_pool_check') then
  alter table public.football_players add constraint football_players_draft_pool_check
   check (draft_pool is null or draft_pool in ('REGULAR','UNDERDOG'));
 end if;
 if not exists (select 1 from pg_constraint where conname='football_players_player_tag_check') then
  alter table public.football_players add constraint football_players_player_tag_check
   check (player_tag is null or player_tag = 'UNDERDOG');
 end if;
 if not exists (select 1 from pg_constraint where conname='football_players_auction_pot_check') then
  alter table public.football_players add constraint football_players_auction_pot_check
   check (auction_pot is null or auction_pot in ('GK','CB','FB','MID','ATT'));
 end if;
end $$;

create unique index if not exists football_players_fc26_player_id_key
 on public.football_players(fc26_player_id) where fc26_player_id is not null;
create index if not exists football_players_draft_pool_idx on public.football_players(draft_pool) where draft_pool is not null;
create index if not exists football_players_auction_pot_idx on public.football_players(auction_pot) where auction_pot is not null;

alter table public.auction_rooms
 add column if not exists retention_enabled boolean not null default false,
 add column if not exists player_pool_source text not null default 'DEFAULT';

-- No FK to auction_rooms/room_members: live rooms are snapshot-backed and only archived at completion.
create table if not exists public.auction_retentions (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null,
 team_id uuid not null,
 player_id uuid not null references public.football_players(id) on delete restrict,
 fc26_player_id text not null,
 retention_price_units bigint not null check (retention_price_units = 30),
 status text not null check (status in ('ACTIVE','FINALIZED')),
 created_at timestamptz not null default now(),
 finalized_at timestamptz,
 unique(room_id, player_id),
 unique(room_id, fc26_player_id)
);
create index if not exists auction_retentions_room_idx on public.auction_retentions(room_id);
create index if not exists auction_retentions_team_idx on public.auction_retentions(team_id);

alter table public.auction_retentions enable row level security;
revoke all on public.auction_retentions from public, anon, authenticated;
grant all on public.auction_retentions to service_role;
-- Fastify uses its server-side Postgres connection; browsers have no direct table access.
commit;
