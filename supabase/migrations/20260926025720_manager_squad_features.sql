create table public.manager_team_sheets (
 tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 team_id uuid primary key references public.manager_tournament_teams(id) on delete cascade,
 formation text not null check(formation in ('4-3-3','4-2-3-1','4-4-2','3-5-2','4-1-2-1-2','5-3-2')),
 slots jsonb not null check(jsonb_typeof(slots)='array' and jsonb_array_length(slots)=11),
 bench jsonb not null check(jsonb_typeof(bench)='array'),captain_id uuid references public.manager_tournament_players(id) on delete set null,updated_at timestamptz not null default now()
);
create index manager_sheet_tournament on public.manager_team_sheets(tournament_id);
create table public.manager_match_lineups (
 tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 fixture_id uuid not null references public.manager_fixtures(id) on delete cascade,
 team_id uuid not null references public.manager_tournament_teams(id) on delete cascade,
 starters jsonb not null check(jsonb_typeof(starters)='array'),bench jsonb not null check(jsonb_typeof(bench)='array'),
 eligible_player_ids jsonb not null check(jsonb_typeof(eligible_player_ids)='array'),scorers jsonb not null check(jsonb_typeof(scorers)='array'),
 captured_at timestamptz not null default now(),lineup_available boolean not null,primary key(fixture_id,team_id)
);
create index manager_lineup_tournament on public.manager_match_lineups(tournament_id);
create index manager_lineup_team on public.manager_match_lineups(team_id);
create table public.manager_player_contracts (
 tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 player_id uuid primary key references public.manager_tournament_players(id) on delete cascade,
 team_id uuid not null references public.manager_tournament_teams(id) on delete cascade,
 ownership_token text not null,contract_start timestamptz not null,contract_end timestamptz not null,
 renewal_count integer not null check(renewal_count>0),check(contract_end>contract_start)
);
create index manager_contract_tournament on public.manager_player_contracts(tournament_id);
create index manager_contract_team on public.manager_player_contracts(team_id);
alter table public.manager_team_sheets enable row level security;
alter table public.manager_match_lineups enable row level security;
alter table public.manager_player_contracts enable row level security;
revoke all on public.manager_team_sheets,public.manager_match_lineups,public.manager_player_contracts from anon,authenticated;
grant all on public.manager_team_sheets,public.manager_match_lineups,public.manager_player_contracts to service_role;
