-- Preserve within-season duplicate protection while allowing recurring league opponents.
drop index public.mf_unique_pairing_per_matchday;
create unique index mf_unique_pairing_per_matchday on public.manager_fixtures
 (tournament_id, season_id, matchday, least(home_team_id::text,away_team_id::text), greatest(home_team_id::text,away_team_id::text));
