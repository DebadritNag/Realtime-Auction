create table public.manager_seasons (
 id uuid primary key default gen_random_uuid(),tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 season_number integer not null check(season_number>0),status text not null check(status in ('ACTIVE','COMPLETED','ARCHIVED')),
 champion_team_id uuid references public.manager_tournament_teams(id) on delete set null,
 started_at timestamptz not null default now(),completed_at timestamptz,ended_early boolean not null default false,bonuses_awarded_at timestamptz,
 final_standings jsonb not null default '[]'::jsonb check(jsonb_typeof(final_standings)='array'),unique(tournament_id,season_number),unique(id,tournament_id)
);
create index manager_season_champion on public.manager_seasons(champion_team_id);
create unique index manager_one_active_season on public.manager_seasons(tournament_id) where status='ACTIVE';
create table public.manager_season_settings (
 tournament_id uuid primary key references public.manager_tournaments(id) on delete cascade,
 resale_percent integer not null default 50 check(resale_percent between 40 and 60),
 bonus_units jsonb not null default '[60,48,40,32,24,20,16,12,8,4]'::jsonb check(jsonb_typeof(bonus_units)='array')
);
create table public.manager_season_bonuses (
 season_id uuid not null references public.manager_seasons(id) on delete cascade,
 tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 team_id uuid not null references public.manager_tournament_teams(id) on delete cascade,
 position integer not null check(position>0),amount_units bigint not null check(amount_units>=0),awarded_at timestamptz not null default now(),primary key(season_id,team_id),
 foreign key(season_id,tournament_id) references public.manager_seasons(id,tournament_id) on delete cascade
);
create index manager_bonus_tournament on public.manager_season_bonuses(tournament_id);
create index manager_bonus_team on public.manager_season_bonuses(team_id);
alter table public.manager_tournaments add column current_season_id uuid references public.manager_seasons(id) on delete set null;
create index manager_current_season on public.manager_tournaments(current_season_id);
alter table public.manager_tournaments drop constraint mt_status_values;
alter table public.manager_tournaments add constraint mt_status_values check(status in ('SETUP','INVITING','ACTIVE','COMPLETED','ARCHIVED','ENDED'));
-- Backfill season ownership without retroactively crediting bonuses or auction remainder.
insert into public.manager_seasons(tournament_id,season_number,status,started_at,completed_at,ended_early)
 select id,1,case when status in ('ARCHIVED','ENDED') then 'ARCHIVED' when status='COMPLETED' then 'COMPLETED' else 'ACTIVE' end,created_at,case when status in ('COMPLETED','ARCHIVED','ENDED') then updated_at else null end,false from public.manager_tournaments;
update public.manager_tournaments t set current_season_id=s.id from public.manager_seasons s where s.tournament_id=t.id;
insert into public.manager_season_settings(tournament_id) select id from public.manager_tournaments;
alter table public.manager_fixtures add column season_id uuid;
update public.manager_fixtures f set season_id=t.current_season_id from public.manager_tournaments t where t.id=f.tournament_id;
alter table public.manager_fixtures alter column season_id set not null;
alter table public.manager_fixtures add constraint manager_fixture_season_scope foreign key(season_id,tournament_id) references public.manager_seasons(id,tournament_id) on delete cascade;
create index manager_fixture_season on public.manager_fixtures(season_id,matchday);
alter table public.manager_seasons enable row level security;
alter table public.manager_season_settings enable row level security;
alter table public.manager_season_bonuses enable row level security;
revoke all on public.manager_seasons,public.manager_season_settings,public.manager_season_bonuses from anon,authenticated;
grant all on public.manager_seasons,public.manager_season_settings,public.manager_season_bonuses to service_role;
-- Freeze legacy completed/archived tables without issuing historical rewards.
with scores as (
 select s.id as season_id,t.id as team_id,
 count(f.id)::int as played,
 count(f.id) filter(where (f.home_team_id=t.id and f.home_score>f.away_score) or (f.away_team_id=t.id and f.away_score>f.home_score))::int as won,
 count(f.id) filter(where f.home_score=f.away_score)::int as drawn,
 count(f.id) filter(where (f.home_team_id=t.id and f.home_score<f.away_score) or (f.away_team_id=t.id and f.away_score<f.home_score))::int as lost,
 coalesce(sum(case when f.home_team_id=t.id then f.home_score else f.away_score end),0)::int as gf,
 coalesce(sum(case when f.home_team_id=t.id then f.away_score else f.home_score end),0)::int as ga
 from public.manager_seasons s join public.manager_tournament_teams t on t.tournament_id=s.tournament_id
 left join public.manager_fixtures f on f.season_id=s.id and f.status='COMPLETED' and (f.home_team_id=t.id or f.away_team_id=t.id)
 where s.status in ('COMPLETED','ARCHIVED') group by s.id,t.id
), ranked as (
 select *,row_number() over(partition by season_id order by (won*3+drawn) desc,(gf-ga) desc,gf desc,team_id) as position from scores
), summaries as (
 select season_id,jsonb_agg(jsonb_build_object('teamId',team_id,'position',position,'played',played,'won',won,'drawn',drawn,'lost',lost,'gf',gf,'ga',ga,'gd',gf-ga,'points',won*3+drawn) order by position) as final_table,(array_agg(team_id order by position))[1] as champion from ranked group by season_id
)
update public.manager_seasons s set final_standings=x.final_table,champion_team_id=case when s.status='COMPLETED' then x.champion else null end from summaries x where x.season_id=s.id;
