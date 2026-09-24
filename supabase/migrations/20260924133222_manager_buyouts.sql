-- Human manager buyouts. Existing auction timing/logic and cash-free trade RPC stay unchanged.
create table public.manager_buyout_offers (
 id uuid primary key default gen_random_uuid(),
 tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 from_team_id uuid not null references public.manager_tournament_teams(id) on delete cascade,
 to_team_id uuid not null references public.manager_tournament_teams(id) on delete cascade,
 target_player_id uuid not null references public.manager_tournament_players(id) on delete cascade,
 offer_type text not null check(offer_type in ('CASH','CASH_PLUS_PLAYER')),
 cash_amount_units bigint not null check(cash_amount_units>=0),
 included_player_id uuid references public.manager_tournament_players(id) on delete cascade,
 status text not null default 'PENDING' check(status in ('PENDING','ACCEPTED','REJECTED','COUNTERED','CANCELLED','EXPIRED')),
 parent_buyout_id uuid references public.manager_buyout_offers(id) on delete set null,
 responding_team_id uuid not null references public.manager_tournament_teams(id) on delete cascade,
 created_by uuid not null references public.profiles(id),
 target_ownership_token text not null,included_ownership_token text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),resolved_at timestamptz,
 check(from_team_id<>to_team_id),check(target_player_id is distinct from included_player_id),
 check(responding_team_id in (from_team_id,to_team_id)),
 check((offer_type='CASH' and cash_amount_units>0 and included_player_id is null) or (offer_type='CASH_PLUS_PLAYER' and included_player_id is not null))
);
create index manager_buyouts_tournament on public.manager_buyout_offers(tournament_id,created_at);
create index manager_buyouts_receiver on public.manager_buyout_offers(responding_team_id,status);
create index manager_buyouts_from on public.manager_buyout_offers(from_team_id);
create index manager_buyouts_to on public.manager_buyout_offers(to_team_id);
create index manager_buyouts_target on public.manager_buyout_offers(target_player_id);
create index manager_buyouts_included on public.manager_buyout_offers(included_player_id);
create index manager_buyouts_parent on public.manager_buyout_offers(parent_buyout_id);
create index manager_buyouts_creator on public.manager_buyout_offers(created_by);
create unique index manager_buyouts_pending_pair on public.manager_buyout_offers(tournament_id,from_team_id,to_team_id,target_player_id) where status='PENDING';
create table public.manager_buyout_cash_movements (
 buyout_id uuid primary key references public.manager_buyout_offers(id) on delete cascade,
 tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 from_team_id uuid not null references public.manager_tournament_teams(id) on delete cascade,
 to_team_id uuid not null references public.manager_tournament_teams(id) on delete cascade,
 amount_units bigint not null check(amount_units>=0),created_at timestamptz not null default now(),check(from_team_id<>to_team_id)
);
create index manager_buyout_cash_tournament on public.manager_buyout_cash_movements(tournament_id);
create index manager_buyout_cash_from on public.manager_buyout_cash_movements(from_team_id);
create index manager_buyout_cash_to on public.manager_buyout_cash_movements(to_team_id);
alter table public.manager_transfer_transactions drop constraint mtt_type_values;
alter table public.manager_transfer_transactions add constraint mtt_type_values check(type in ('AUCTION_IMPORT','FREE_AGENT_SIGNING','TRADE','RELEASE','BUYOUT'));
alter table public.manager_transfer_transactions add column related_buyout_id uuid references public.manager_buyout_offers(id) on delete set null;
create index manager_transfer_buyout on public.manager_transfer_transactions(related_buyout_id);
alter table public.manager_buyout_offers enable row level security;
alter table public.manager_buyout_cash_movements enable row level security;
revoke all on public.manager_buyout_offers,public.manager_buyout_cash_movements from anon,authenticated;
grant all on public.manager_buyout_offers,public.manager_buyout_cash_movements to service_role;
