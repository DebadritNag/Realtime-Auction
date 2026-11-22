-- Durable live auction rooms. One upserted row per room; the archive tables are untouched.
begin;

create table if not exists public.live_room_snapshots (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  room_id uuid not null unique,
  host_user_id text not null,
  status text not null,
  sequence bigint not null check (sequence >= 1),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_room_snapshots_status_updated_idx on public.live_room_snapshots (status, updated_at);
create index if not exists live_room_snapshots_host_idx on public.live_room_snapshots (host_user_id);

alter table public.live_room_snapshots enable row level security;
revoke all on table public.live_room_snapshots from public, anon, authenticated;
grant all on table public.live_room_snapshots to service_role;

commit;
