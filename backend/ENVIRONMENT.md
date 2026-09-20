# Environment

Copy .env.example to .env for a local demo. Never commit secrets. Node's built-in environment-file support is used by dev/start scripts.

| Variable | Default / purpose |
| --- | --- |
| PORT | 3001 |
| HOST | 127.0.0.1; set 0.0.0.0 intentionally for a container/network service |
| NODE_ENV | development; production prohibits development auth and requires a catalog |
| FRONTEND_ORIGIN | http://localhost:5173; comma-separated exact origins, no trailing slash |
| LOG_LEVEL | info |
| STORAGE | file; memory is ephemeral |
| DATA_DIR | ./data, resolved from the server working directory |
| AUTH_MODE | jwt; use development explicitly for the static local allowlist |
| DEV_AUTH_TOKENS | JSON token-to-user map; development only |
| JWT_SECRET | At least 32 characters; HS256, mutually exclusive with JWKS |
| JWT_JWKS_URL | Remote RS256/ES256 JWKS; HTTPS required in production |
| JWT_ISSUER | Required exact issuer for JWT mode |
| JWT_AUDIENCE | Required exact audience for JWT mode |
| PLAYER_CATALOG_PATH | JSON catalog file; required in production |
| DATABASE_URL | Reserved placeholder for future adapter; unused |
| SUPABASE_URL / SUPABASE_JWT_SECRET | Reserved placeholders, unused by this backend |

For tokens issued by a future identity provider, configure its actual issuer/audience and use the generic JWT/JWKS adapter, or inject another AuthService. Merely setting SUPABASE_URL does not connect a database or authenticate tokens.

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

basePriceUnits=4 means 2 Cr. Positions: GK, DEF, MID, FWD. OVR 1–99, stats 0–100, unique IDs, maximum 2000 players. Players are queued in catalog order; playerIds/potIds filter that order. An empty/missing selected pool prevents start. An unconfigured development catalog uses explicitly named fictional players.

In production use a single writer for file storage, persistent volume and HTTPS/WSS termination. Configure proxy logs to exclude access tokens in /ws query strings. The application already excludes request queries, headers and bodies from logs.
