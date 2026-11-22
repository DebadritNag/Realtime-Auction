-- Last time each member was connected to a live room. Additive; the server runs without it (in-memory presence).
begin;
create table if not exists public.live_room_presence (
  room_code text not null references public.live_room_snapshots(code) on delete cascade,
  user_id text not null,
  last_seen_at timestamptz not null default now(),
  primary key (room_code, user_id)
);
alter table public.live_room_presence enable row level security;
revoke all on table public.live_room_presence from public, anon, authenticated;
grant all on table public.live_room_presence to service_role;
commit;
