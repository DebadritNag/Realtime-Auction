-- Sequential pre-auction retention: per-turn records and richer retention rows.
-- Additive and idempotent: no UPDATE/DELETE of existing data, 20261001090000 is not modified.
begin;

alter table public.auction_retentions
 add column if not exists acquisition_type text not null default 'RETENTION',
 add column if not exists retention_order integer,
 add column if not exists turn_id uuid,
 add column if not exists confirmed_at timestamptz,
 add column if not exists confirmed_by text;

do $$
declare c record;
begin
 -- Replace the first-pass status check (ACTIVE/FINALIZED) with one that also allows CONFIRMED.
 for c in select conname from pg_constraint
  where conrelid = 'public.auction_retentions'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) like '%status%' and pg_get_constraintdef(oid) not like '%CONFIRMED%'
 loop
  execute format('alter table public.auction_retentions drop constraint %I', c.conname);
 end loop;
 if not exists (select 1 from pg_constraint where conrelid = 'public.auction_retentions'::regclass and conname = 'auction_retentions_status_check') then
  alter table public.auction_retentions add constraint auction_retentions_status_check
   check (status in ('ACTIVE','CONFIRMED','FINALIZED'));
 end if;
 if not exists (select 1 from pg_constraint where conrelid = 'public.auction_retentions'::regclass and conname = 'auction_retentions_acquisition_type_check') then
  alter table public.auction_retentions add constraint auction_retentions_acquisition_type_check
   check (acquisition_type in ('RETENTION'));
 end if;
 if not exists (select 1 from pg_constraint where conrelid = 'public.auction_retentions'::regclass and conname = 'auction_retentions_retention_order_check') then
  alter table public.auction_retentions add constraint auction_retentions_retention_order_check
   check (retention_order is null or retention_order >= 1);
 end if;
end $$;

-- A team cannot retain the same player twice (one player per auction is already unique(room_id, player_id)).
create unique index if not exists auction_retentions_room_team_player_key
 on public.auction_retentions(room_id, team_id, player_id);

-- Database backstop for the 3-player cap; the room lock enforces it first.
-- Rows for the same player are excluded so an idempotent upsert of an existing pick is not counted twice.
create or replace function public.auction_retentions_enforce_limit() returns trigger
language plpgsql set search_path = public as $$
begin
 if (select count(*) from public.auction_retentions
     where room_id = new.room_id and team_id = new.team_id and player_id <> new.player_id) >= 3 then
  raise exception 'A team can retain at most 3 players per auction' using errcode = '23514';
 end if;
 return new;
end $$;
drop trigger if exists auction_retentions_enforce_limit on public.auction_retentions;
create trigger auction_retentions_enforce_limit before insert on public.auction_retentions
 for each row execute function public.auction_retentions_enforce_limit();

-- One row per completed team turn. unique(room_id, team_id) means a turn cannot be confirmed twice.
-- No FK to auction_rooms: live rooms are snapshot-backed (same as auction_retentions).
create table if not exists public.auction_retention_turns (
 id uuid primary key,
 room_id uuid not null,
 team_id uuid not null,
 turn_order integer not null check (turn_order >= 1),
 kind text not null check (kind in ('RETAINED','SKIPPED')),
 event_id uuid not null unique,
 retained_count integer not null check (retained_count between 0 and 3),
 spent_units bigint not null check (spent_units >= 0),
 remaining_units bigint not null check (remaining_units >= 0),
 confirmed_at timestamptz not null,
 confirmed_by text not null,
 unique(room_id, team_id),
 unique(room_id, turn_order)
);
create index if not exists auction_retention_turns_room_idx on public.auction_retention_turns(room_id);

alter table public.auction_retention_turns enable row level security;
revoke all on public.auction_retention_turns from public, anon, authenticated;
grant all on public.auction_retention_turns to service_role;
-- Fastify uses its server-side Postgres connection; browsers have no direct table access.
commit;
