-- Manager Secret Heroes pool
-- Each row represents one slot in the hero pool for a tournament.
-- identity (name, position) is kept server-side; the frontend only sees count/status.
create table if not exists public.manager_secret_heroes (
  id                  uuid        primary key default gen_random_uuid(),
  tournament_id       uuid        not null references public.manager_tournaments(id) on delete cascade,
  -- Serialized {name, position} — never exposed before reveal.
  identity            jsonb       not null,
  team_id             uuid        references public.manager_tournament_teams(id),
  player_id           uuid        references public.manager_tournament_players(id),
  claimed_at          timestamptz,
  revealed_at         timestamptz,
  transfer_window_id  uuid        references public.manager_transfer_windows(id),
  -- Stable display order within a tournament (server-assigned random int)
  display_order       int         not null default 0
);

-- Uniqueness: each identity can only be claimed once per tournament
create unique index if not exists manager_secret_heroes_claimed_unique
  on public.manager_secret_heroes(tournament_id, team_id)
  where team_id is not null;

-- Fast lookups
create index if not exists manager_secret_heroes_tournament_idx
  on public.manager_secret_heroes(tournament_id);

-- RLS: managers see only their own revealed hero or anonymous count;
-- the identity column is never included in any RLS-allowed select.
-- Access is fully mediated by the application layer via Postgres roles.
alter table public.manager_secret_heroes enable row level security;

-- No client role can enumerate private identities, including via direct Supabase REST.
revoke all on public.manager_secret_heroes from public, anon, authenticated;
create unique index if not exists manager_secret_heroes_identity_unique on public.manager_secret_heroes(tournament_id, (identity->>'name'));
create unique index if not exists manager_secret_heroes_player_unique on public.manager_secret_heroes(player_id) where player_id is not null;

alter table public.manager_tournament_players alter column overall drop not null;
alter table public.manager_tournament_players drop constraint if exists mtp_source_values;
alter table public.manager_tournament_players add constraint mtp_source_values check(source in ('AUCTION_SQUAD','AUCTION_UNSOLD','EXTERNAL_POOL','SECRET_HERO'));
alter table public.manager_tournament_players add constraint mtp_hero_identity_only check (
 (source='SECRET_HERO' and overall is null and pace is null and shooting is null and passing is null and dribbling is null and defending is null and physical is null and ownership_status='OWNED' and current_team_id is not null)
 or (source<>'SECRET_HERO' and overall is not null)
);
alter table public.manager_transfer_transactions drop constraint if exists mtt_type_values;
alter table public.manager_transfer_transactions add constraint mtt_type_values check(type in ('AUCTION_IMPORT','FREE_AGENT_SIGNING','TRADE','RELEASE','BUYOUT','SECRET_HERO_PURCHASE'));
alter table public.manager_tournament_events drop constraint if exists mte_event_type_values;
alter table public.manager_tournament_events add constraint mte_event_type_values check(event_type in (
 'MANAGER_MODE_CREATED','MEMBER_JOINED','MEMBER_DECLINED','MEMBER_REMOVED','FIXTURES_GENERATED','RESULT_CREATED','RESULT_EDITED','TRANSFER_WINDOW_OPENED','TRANSFER_WINDOW_CLOSED','TRADE_CREATED','TRADE_ACCEPTED','TRADE_REJECTED','TRADE_CANCELLED','TRADE_COUNTERED','PLAYER_TRANSFERRED','PLAYER_RELEASED','TOURNAMENT_STATUS_CHANGED','TOURNAMENT_COMPLETED','SECRET_PLAYER_CLAIMED','SECRET_PLAYER_REVEALED'));

create function public.manager_hero_ownership_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if old.source='SECRET_HERO' and (new.source is distinct from old.source or new.current_team_id is distinct from old.current_team_id or new.ownership_status is distinct from old.ownership_status) then
  raise exception using errcode='23514', message='HERO_UNTRADEABLE', constraint='manager_hero_ownership_guard';
 end if;
 return new;
end $$;
create trigger manager_hero_ownership_guard before update on public.manager_tournament_players for each row execute function public.manager_hero_ownership_guard();
revoke execute on function public.manager_hero_ownership_guard() from public,anon,authenticated;

alter table public.manager_secret_heroes add constraint manager_hero_claim_complete check (
 (team_id is null and player_id is null and claimed_at is null and revealed_at is null and transfer_window_id is null)
 or (team_id is not null and player_id is not null and claimed_at is not null and transfer_window_id is not null)
);
create function public.manager_hero_claim_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if old.identity is distinct from new.identity or old.display_order<>new.display_order or old.tournament_id<>new.tournament_id or
 (old.team_id is not null and (new.team_id is distinct from old.team_id or new.player_id is distinct from old.player_id or new.claimed_at is distinct from old.claimed_at or new.transfer_window_id is distinct from old.transfer_window_id)) or
 (old.revealed_at is not null and new.revealed_at is distinct from old.revealed_at) then
  raise exception using errcode='23514',message='Hero claims are permanent';
 end if;
 return new;
end $$;
create trigger manager_hero_claim_guard before update on public.manager_secret_heroes for each row execute function public.manager_hero_claim_guard();
revoke execute on function public.manager_hero_claim_guard() from public,anon,authenticated;
