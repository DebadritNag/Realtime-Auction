# Authentication and catalog integration fix

## Root cause and changes

The Supabase project signs new access tokens with ES256. The backend previously selected only a legacy HS256 secret and also incorrectly base64-decoded that secret. Both cases rejected valid sessions with 401 before the profile handlers ran.

`JwtAuthService` now accepts ES256/RS256 through the trusted project's JWKS endpoint and legacy HS256 using the literal secret. Signature, issuer, audience, subject and expiry checks remain mandatory. `server.ts` derives JWKS and issuer from `SUPABASE_URL` unless explicitly configured. No authorization is based on editable user metadata.

Frontend authentication now uses one cookie-backed `@supabase/ssr` singleton for services and Next.js session refresh. Protected API requests refuse to run without a session token. `NEXT_PUBLIC_API_URL` supports both an origin and a base ending in `/api`.

## Catalog

The source is `backend/data/default-pool/default-player-pool.csv` (760 players). The four category CSVs are legacy fallback files; the combined file is preferred. These files were excluded by `backend/.gitignore`; they are now eligible for version control and deployment. Runtime room snapshots in the rest of `data` remain ignored.

- `GET /api/players` requires a Bearer access token. Returns `{ total, catalogTotal, offset, pots, players }`.
- Optional query: `potId`, `search`, `offset`, `limit` (1–2000).
- Monetary fields in responses are Cr (`basePriceCr`); the backend calculates in integer half-Cr units.
- Create Room includes a searchable server catalog preview. Actual room pools still follow the server's team-count selection and room settings.
- Missing/invalid catalog files fail startup instead of silently falling back to demo footballers.

## Deployment

Redeploy **both** backend and frontend with these changes, including the newly unignored CSV files. The deployed Render service was tested with a real Supabase ES256 session and still returned 401 before deployment; the fixed local app returned 200 with that same token.

Render backend:

```dotenv
AUTH_MODE=jwt
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
JWT_ISSUER=https://YOUR_PROJECT.supabase.co/auth/v1
JWT_AUDIENCE=authenticated
PLAYER_CATALOG_PATH=./data/default-pool/default-player-pool.csv
FRONTEND_ORIGIN=https://YOUR_FRONTEND_DOMAIN
```

`JWT_JWKS_URL` can be omitted: it is derived as `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Remove an existing override if it points at a different project. Keep `JWT_SECRET` only for legacy HS256 token compatibility. Never expose it or the service role key to the frontend. Run the backend with `backend` as the working directory when using the relative catalog path.

Frontend variables remain `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Sign in once after upgrading from the old localStorage client to cookie-backed sessions. No Supabase Realtime is used.

## Verification

- 47 automated backend tests pass, including dual-algorithm JWT authentication, issuer rejection, authenticated profile routes, catalog preview, catalog auction start, and existing multiplayer/timer/budget tests.
- Backend TypeScript build and frontend TypeScript check pass. Production frontend build passes with `next build --webpack`; local Turbopack hits a Windows subprocess access error.
- Live Supabase check verifies password sign-in, all four profile endpoints, 760-player catalog and authenticated WebSocket. It deletes its temporary account afterward.
- Headless Chrome against the production frontend build verifies real Supabase sign-in, refresh restoration, all four profile requests without 401, and catalog search. API requests are routed to the fixed local Fastify app; this does not claim the Render deployment is updated. Set TEST_FRONTEND_URL to a running local frontend to include this browser check.
- Repeat live auth verification from `backend`: set `RUN_LIVE_AUTH_TEST=1`, then run `node --env-file=.env --import tsx scripts/verify-supabase-auth.mjs`. Optional `CHECK_DEPLOYED_API=https://your-backend` reports deployed status as well. This requires server-only admin credentials and intentionally creates one disposable confirmed test user without sending email.

## Persistence limitation

Current `server.ts` selects file/memory room storage and does not attach the PostgreSQL adapter to profile routes. Fixing authentication does not change that architecture: file-backed auction statistics work, but database profile fields/achievements require the PostgreSQL adapter to be wired separately. On Render, file storage needs a persistent disk and a single writer. This patch does not provision or modify Supabase schema.
