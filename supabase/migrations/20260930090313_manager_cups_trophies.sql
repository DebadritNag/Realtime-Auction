-- Additive, no UPDATE/DELETE/reseed of any existing tournament data.
begin;
create table if not exists public.manager_cup_competitions (
 id uuid primary key,
 tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 season_id uuid not null references public.manager_seasons(id) on delete cascade,
 state jsonb not null check(jsonb_typeof(state)='object'),
 updated_at timestamptz not null default now(),
 unique(tournament_id,season_id)
);
create table if not exists public.manager_trophies (
 id uuid primary key,
 tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 season_id uuid not null references public.manager_seasons(id) on delete cascade,
 team_id uuid not null references public.manager_tournament_teams(id) on delete cascade,
 trophy_type text not null check(trophy_type in ('LEAGUE_SHIELD','CUP')),
 competition_id uuid references public.manager_cup_competitions(id) on delete cascade,
 name text not null,
 won_at timestamptz,
 unique(tournament_id,season_id,trophy_type)
);
create index if not exists manager_trophies_team_idx on public.manager_trophies(team_id);
create index if not exists manager_trophies_season_idx on public.manager_trophies(season_id);
create index if not exists manager_trophies_competition_idx on public.manager_trophies(competition_id);
create index if not exists manager_cup_season_idx on public.manager_cup_competitions(season_id);
alter table public.manager_cup_competitions enable row level security;
alter table public.manager_trophies enable row level security;
revoke all on public.manager_cup_competitions,public.manager_trophies from public,anon,authenticated;
grant all on public.manager_cup_competitions,public.manager_trophies to service_role;
-- Fastify uses its server-side Postgres connection and validates host/membership.
-- Browsers have no direct table access; no Supabase Realtime dependency.
commit;
