# Environment

Copy .env.example to .env for a local demo. Never commit secrets. Node's built-in environment-file support is used by dev/start scripts.

| Variable | Default / purpose |
| --- | --- |
| PORT | 4000 (Render may inject another port) |
| HOST | 0.0.0.0 for Render/container traffic |
| NODE_ENV | development; production prohibits development auth and requires a catalog |
| FRONTEND_ORIGIN | http://localhost:3000; comma-separated exact origins, no trailing slash |
| LOG_LEVEL | info |
| STORAGE | postgres in production, file otherwise; memory is ephemeral. postgres stores live rooms in public.live_room_snapshots (requires DATABASE_URL and migration 20261003090000) |
| LIVE_ROOM_LOBBY_TTL_DAYS | 14; LOBBY rooms untouched this long are deleted (first run 60 s after boot, then every 6 h); 0 disables. Only LOBBY rows are ever deleted |
| DATA_DIR | ./data, resolved from the server working directory; used only when STORAGE=file |
| FC26_DATA_DIR | Directory holding the FC26 CSV files; default is the repository root |
| FC26_CSV_GK, FC26_CSV_CB, FC26_CSV_FULLBACKS, FC26_CSV_MID, FC26_CSV_ATT, FC26_CSV_UNDERDOG | Optional per-file overrides (absolute, or relative to FC26_DATA_DIR). Defaults: FC26_GK.csv, FC26_CB.csv, FC26_Fullbacks.csv, FC26_Mid.csv, FC26_ATT.csv, FC26_Underdog.csv then FC26_Underdogs.csv |
| FC26_TOP_RATING_THRESHOLD | Overall rating from which a regular FC26 player is Top (5 Cr); default 90, below that is Medium (3 Cr). Underdogs are always 1 Cr |
| AUTH_MODE | jwt; use development explicitly for the static local allowlist |
| DEV_AUTH_TOKENS | JSON token-to-user map; development only |
| JWT_SECRET | At least 32 characters; Legacy HS256; used literally as UTF-8 bytes. Optional when JWKS is configured |
| JWT_JWKS_URL | Remote RS256/ES256 JWKS; derived from SUPABASE_URL when omitted. HTTPS required in production |
| JWT_ISSUER | Exact issuer; defaults to SUPABASE_URL + /auth/v1 |
| JWT_AUDIENCE | Defaults to authenticated |
The production default catalogue always loads the verified bundled `data/default-pool/default-player-pool.csv`. `PLAYER_CATALOG_PATH` is retired and ignored; no JSON, demo or category-file fallback is used.
| DATABASE_URL | Reserved placeholder for future adapter; unused |
| SUPABASE_URL | Supabase project URL; supplies the trusted issuer and public signing-key endpoint |

For tokens issued by a future identity provider, configure its actual issuer/audience and use the generic JWT/JWKS adapter, or inject another AuthService. SUPABASE_URL enables verification against that project’s public signing keys; it does not itself connect database persistence.

Catalog example:

```json
[
  {
    "id": "player-001",
    "name": "Example Footballer",
    "position": "MID",
    "ovr": 87,
    "stats": { "pace": 84, "passing": 91 },
    "basePriceUnits": 4,
    "potId": "marquee"
  }
]
```

basePriceUnits=4 means 2 Cr. Positions: GK, DEF, MID, FWD. OVR 1–99, stats 0–100, unique IDs, maximum 2000 players. Players are queued in catalog order; playerIds/potIds filter that order. An empty/missing selected pool prevents start. The server loads the bundled catalog when no path is configured and fails startup if the catalog is missing or invalid; it does not silently substitute fictional players.

In production use STORAGE=postgres (no persistent disk needed) with a single backend instance (timers are not coordinated across instances), and HTTPS/WSS termination. File storage needs a single writer and a persistent volume. Configure proxy logs to exclude access tokens in /ws query strings. The application already excludes request queries, headers and bodies from logs.
