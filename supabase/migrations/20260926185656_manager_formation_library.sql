begin;
set local lock_timeout = '5s';
alter table public.manager_team_sheets drop constraint manager_team_sheets_formation_check;
alter table public.manager_team_sheets add constraint manager_team_sheets_formation_check check (formation in ('3-1-4-2','3-4-1-2','3-4-2-1','3-4-3 Diamond','3-4-3 Flat','3-5-1-1','3-5-2','4-1-2-1-2 Narrow','4-1-2-1-2 Wide','4-1-3-2','4-1-4-1','4-2-2-2','4-2-3-1 Narrow','4-2-3-1 Wide','4-2-4','4-3-1-2','4-3-2-1','4-3-3 Attack','4-3-3 Defend','4-3-3 False 9','4-3-3 Flat','4-3-3 Holding','4-4-1-1 Attack','4-4-1-1 Midfield','4-4-2 Flat','4-4-2 Holding','4-5-1 Attack','4-5-1 Flat','5-1-2-2','5-2-1-2','5-2-3','5-3-2','5-4-1 Diamond','5-4-1 Flat','4-3-3','4-2-3-1','4-4-2','4-1-2-1-2'));
commit;
