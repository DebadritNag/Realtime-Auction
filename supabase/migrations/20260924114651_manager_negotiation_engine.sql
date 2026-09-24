-- Adds only the new negotiation subsystem. Existing Kiro Manager Mode tables/RPCs are unchanged.
create table public.manager_transfer_rules (
 tournament_id uuid primary key references public.manager_tournaments(id) on delete cascade,
 difficulty text not null default 'NORMAL' check(difficulty in ('RELAXED','NORMAL','HARD')),
 visibility text not null default 'SEMI_TRANSPARENT' check(visibility in ('PRIVATE','SEMI_TRANSPARENT','TRANSPARENT')),
 offer_cooldown_ms integer not null default 3000 check(offer_cooldown_ms between 2000 and 5000),
 walk_away_cooldown_ms integer not null default 180000 check(walk_away_cooldown_ms between 10000 and 3600000)
);
create table public.manager_player_negotiation_profiles (
 player_id uuid primary key references public.manager_tournament_players(id) on delete cascade,
 tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 archetype text not null check(archetype in ('BALANCED','MONEY_DRIVEN','AMBITIOUS','PLAYING_TIME_FOCUSED','PRESTIGE_DRIVEN','LOYAL','STUBBORN','OPPORTUNISTIC','COMPETITIVE','RELAXED')),
 money_importance real not null check(money_importance between 0 and 1),prestige_importance real not null check(prestige_importance between 0 and 1),playing_time_importance real not null check(playing_time_importance between 0 and 1),squad_strength_importance real not null check(squad_strength_importance between 0 and 1),
 patience real not null check(patience between 0 and 1),ego real not null check(ego between 0 and 1),loyalty real not null check(loyalty between 0 and 1),competitiveness real not null check(competitiveness between 0 and 1),negotiation_aggression real not null check(negotiation_aggression between 0 and 1),compromise_willingness real not null check(compromise_willingness between 0 and 1),
 market_value_units bigint not null check(market_value_units>0),minimum_value_units bigint not null check(minimum_value_units>0),preferred_value_units bigint not null,ideal_value_units bigint not null,
 created_at timestamptz not null default now(),check(minimum_value_units<=preferred_value_units and preferred_value_units<=ideal_value_units)
);
create index manager_profiles_tournament on public.manager_player_negotiation_profiles(tournament_id);
create table public.manager_negotiation_sessions (
 id uuid primary key default gen_random_uuid(),tournament_id uuid not null references public.manager_tournaments(id) on delete cascade,
 player_id uuid not null references public.manager_tournament_players(id) on delete cascade,team_id uuid not null references public.manager_tournament_teams(id) on delete cascade,manager_user_id uuid not null references public.profiles(id),
 status text not null check(status in ('ACTIVE','ACCEPTED','REJECTED','WALKED_AWAY','SIGNED','CLOSED_LOST_PLAYER','PAUSED_WINDOW_CLOSED')),
 resume_status text check(resume_status in ('ACTIVE','ACCEPTED')),
 interest integer not null check(interest between 0 and 100),trust integer not null check(trust between 0 and 100),frustration integer not null check(frustration between 0 and 100),excitement integer not null check(excitement between 0 and 100),patience_remaining integer not null check(patience_remaining between 0 and 100),confidence integer not null check(confidence between 0 and 100),
 last_offer_units bigint check(last_offer_units>0),last_counter_units bigint check(last_counter_units>0),last_offer_at timestamptz,cooldown_until timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),closed_at timestamptz,
 unique(tournament_id,team_id,player_id)
);
create index manager_sessions_player on public.manager_negotiation_sessions(player_id,status);
create index manager_sessions_user on public.manager_negotiation_sessions(manager_user_id,tournament_id);
create table public.manager_free_agent_offers (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.manager_negotiation_sessions(id) on delete cascade,
 player_id uuid not null references public.manager_tournament_players(id),team_id uuid not null references public.manager_tournament_teams(id),
 offer_units bigint not null check(offer_units>0),decision text not null check(decision in ('REJECT','COUNTER','CONSIDER','ACCEPT','WAIT','WALK_AWAY')),
 counter_units bigint check(counter_units>0),emotion text not null,created_at timestamptz not null default now()
);
create index manager_offers_session on public.manager_free_agent_offers(session_id,created_at);
create table public.manager_negotiation_messages (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.manager_negotiation_sessions(id) on delete cascade,
 sender text not null check(sender in ('PLAYER','MANAGER','SYSTEM')),message text not null check(length(message) between 1 and 600),emotion text,decision text,provider text not null default 'TEMPLATE' check(provider in ('TEMPLATE','LLM')),created_at timestamptz not null default now()
);
create index manager_messages_session on public.manager_negotiation_messages(session_id,created_at);
-- Fastify is the sole data path. Hidden profiles must never be readable via browser credentials.
alter table public.manager_transfer_rules enable row level security;
alter table public.manager_player_negotiation_profiles enable row level security;
alter table public.manager_negotiation_sessions enable row level security;
alter table public.manager_free_agent_offers enable row level security;
alter table public.manager_negotiation_messages enable row level security;
revoke all on public.manager_transfer_rules,public.manager_player_negotiation_profiles,public.manager_negotiation_sessions,public.manager_free_agent_offers,public.manager_negotiation_messages from anon,authenticated;
grant all on public.manager_transfer_rules,public.manager_player_negotiation_profiles,public.manager_negotiation_sessions,public.manager_free_agent_offers,public.manager_negotiation_messages to service_role;
