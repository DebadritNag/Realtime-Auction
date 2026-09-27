begin;
set local lock_timeout = '5s';
alter table public.manager_transfer_windows add column window_number integer;
alter table public.manager_transfer_windows add column season_id uuid references public.manager_seasons(id);
alter table public.manager_transfer_windows add column audit_available boolean not null default false;
with numbered as (select id,row_number() over(partition by tournament_id order by opened_at,id) as n from public.manager_transfer_windows)
update public.manager_transfer_windows w set window_number=n.n from numbered n where w.id=n.id;
alter table public.manager_transfer_windows alter column window_number set not null;
alter table public.manager_transfer_windows add constraint manager_window_number_positive check(window_number>0);
create unique index manager_window_number on public.manager_transfer_windows(tournament_id,window_number);
create unique index manager_window_identity on public.manager_transfer_windows(tournament_id,id);
create unique index manager_single_open_window on public.manager_transfer_windows(tournament_id) where status='OPEN';
create table public.manager_transfer_window_team_snapshots (
 transfer_window_id uuid not null,
 tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 team_id uuid not null references public.manager_tournament_teams(id) on delete cascade,
 team_name text not null,
 manager_name text not null,
 opening_budget_units bigint not null check(opening_budget_units>=0),
 closing_budget_units bigint check(closing_budget_units>=0),
 primary key(transfer_window_id,team_id),
 foreign key(tournament_id,transfer_window_id) references public.manager_transfer_windows(tournament_id,id) on delete cascade
);
create index manager_window_snapshot_tournament on public.manager_transfer_window_team_snapshots(tournament_id);
alter table public.manager_transfer_window_team_snapshots enable row level security;
revoke all on public.manager_transfer_window_team_snapshots from public,anon,authenticated;
-- Capture authoritative budget boundaries, also for an older server during rolling deployment.
create function public.manager_window_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform id from public.manager_tournaments where id=new.tournament_id for update;
 if new.window_number is null then select coalesce(max(window_number),0)+1 into new.window_number from public.manager_transfer_windows where tournament_id=new.tournament_id; end if;
 if new.season_id is null then select current_season_id into new.season_id from public.manager_tournaments where id=new.tournament_id; end if;
 new.audit_available=true;
 return new;
end $$;
create trigger window_identity before insert on public.manager_transfer_windows for each row execute function public.manager_window_identity();
create function public.manager_capture_window_budgets() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  insert into public.manager_transfer_window_team_snapshots(transfer_window_id,tournament_id,team_id,team_name,manager_name,opening_budget_units)
  select new.id,new.tournament_id,t.id,t.team_name,coalesce(p.username,'Manager'),t.current_transfer_budget_units from public.manager_tournament_teams t left join public.profiles p on p.id=t.manager_user_id where t.tournament_id=new.tournament_id;
 elsif old.status='OPEN' and new.status='CLOSED' then
  update public.manager_transfer_window_team_snapshots s set closing_budget_units=t.current_transfer_budget_units from public.manager_tournament_teams t where s.transfer_window_id=new.id and s.team_id=t.id and s.closing_budget_units is null;
 end if;
 return new;
end $$;
create trigger capture_window_budgets after insert or update on public.manager_transfer_windows for each row execute function public.manager_capture_window_budgets();
create function public.manager_frozen_window() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.status='CLOSED' and new is distinct from old then raise exception 'Closed transfer windows are immutable'; end if;
 return new;
end $$;
create trigger frozen_window before update on public.manager_transfer_windows for each row execute function public.manager_frozen_window();
create function public.manager_frozen_budget_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (to_jsonb(new)-'closing_budget_units') is distinct from (to_jsonb(old)-'closing_budget_units') or (old.closing_budget_units is not null and new.closing_budget_units is distinct from old.closing_budget_units) then raise exception 'Transfer budget snapshots are immutable'; end if;
 return new;
end $$;
create trigger frozen_window_budget before update on public.manager_transfer_window_team_snapshots for each row execute function public.manager_frozen_budget_snapshot();
revoke all on function public.manager_window_identity(),public.manager_capture_window_budgets(),public.manager_frozen_window(),public.manager_frozen_budget_snapshot() from public,anon,authenticated;
-- Triggers also cover existing ownership/trade RPCs, whose ledger IDs are generated in SQL.
-- Auction imports are intentionally outside transfer windows. No history is guessed by timestamps.
create function public.manager_assign_transfer_window() returns trigger language plpgsql security invoker set search_path='' as $$
declare active_id uuid;
begin
 if TG_TABLE_NAME='manager_transfer_transactions' and to_jsonb(new)->>'type'='AUCTION_IMPORT' then return new; end if;
 select id into active_id from public.manager_transfer_windows where tournament_id=new.tournament_id and status='OPEN';
 if active_id is null then raise exception 'An active transfer window is required'; end if;
 if new.transfer_window_id is not null and new.transfer_window_id<>active_id then raise exception 'Transfer window mismatch'; end if;
 new.transfer_window_id=active_id;
 return new;
end $$;
revoke all on function public.manager_assign_transfer_window() from public,anon,authenticated;
do $$ declare tab text; begin
 foreach tab in array array['manager_transfer_transactions','manager_trade_offers','manager_buyout_offers','manager_buyout_cash_movements','manager_negotiation_sessions'] loop
  execute format('alter table public.%I add column transfer_window_id uuid',tab);
  execute format('alter table public.%I add foreign key(tournament_id,transfer_window_id) references public.manager_transfer_windows(tournament_id,id)',tab);
  execute format('create index %I on public.%I(transfer_window_id)',tab||'_window_idx',tab);
  execute format('create trigger assign_transfer_window before insert on public.%I for each row execute function public.manager_assign_transfer_window()',tab);
 end loop;
end $$;
alter table public.manager_free_agent_offers add column transfer_window_id uuid references public.manager_transfer_windows(id);
create index manager_free_agent_offers_window on public.manager_free_agent_offers(transfer_window_id);
create function public.manager_assign_offer_window() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 select w.id into new.transfer_window_id from public.manager_negotiation_sessions s join public.manager_transfer_windows w on w.tournament_id=s.tournament_id and w.status='OPEN' where s.id=new.session_id;
 if new.transfer_window_id is null then raise exception 'An active transfer window is required'; end if;
 return new;
end $$;
revoke all on function public.manager_assign_offer_window() from public,anon,authenticated;
create trigger assign_transfer_window before insert on public.manager_free_agent_offers for each row execute function public.manager_assign_offer_window();
commit;
