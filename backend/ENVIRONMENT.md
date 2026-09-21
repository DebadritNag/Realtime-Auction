# Environment

Copy .env.example to .env for a local demo. Never commit secrets. Node's built-in environment-file support is used by dev/start scripts.

| Variable | Default / purpose |
| --- | --- |
| PORT | 4000 (Render may inject another port) |
| HOST | 0.0.0.0 for Render/container traffic |
| NODE_ENV | development; production prohibits development auth and requires a catalog |
| FRONTEND_ORIGIN | http://localhost:3000; comma-separated exact origins, no trailing slash |
| LOG_LEVEL | info |
| STORAGE | file; memory is ephemeral |
| DATA_DIR | ./data, resolved from the server working directory |
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

In production use a single writer for file storage, persistent volume and HTTPS/WSS termination. Configure proxy logs to exclude access tokens in /ws query strings. The application already excludes request queries, headers and bodies from logs.
