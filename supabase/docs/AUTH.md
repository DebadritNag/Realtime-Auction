# Authentication

## Overview

Authentication is handled entirely by **Supabase Auth** (email/password). The frontend uses the standard Supabase client. Fastify validates the JWT issued by Supabase Auth on every WebSocket connection.

---

## Sign Up Flow

```
Frontend
  │
  ├─ supabase.auth.signUp({ email, password, options: { data: { username, display_name } } })
  │
  └─ Supabase Auth creates auth.users row
       │
       └─ trigger: _internal.handle_new_user()
            ├─ reads raw_user_meta_data.username + display_name
            ├─ sanitizes username (strips non-alphanumeric, enforces 3–30 chars)
            ├─ falls back to email prefix if username missing
            ├─ appends 8-char UID suffix on collision
            └─ INSERT INTO profiles (id, username, display_name)
                 │
                 └─ trigger: _internal.handle_new_profile_stats()
                      └─ INSERT INTO user_stats (user_id)
```

### Signup metadata contract

Pass the following in `options.data` during `signUp`:

```typescript
await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secret123',
  options: {
    data: {
      username: 'preet_fc',       // 3–30 chars, [a-zA-Z0-9_]
      display_name: 'Preet FC',   // optional, free text
    }
  }
})
```

**If `username` is omitted or invalid:** The trigger falls back to the email prefix, strips non-alphanumeric characters, and appends a short UID segment if needed. The resulting username may look like `jaiswalpreet12022005` or `user_a3f8b2c1`. The frontend should check and allow the user to update it during onboarding.

**Detecting a placeholder username:**  
If `profiles.username` starts with `user_` followed by 8 hex chars, the onboarding is incomplete.

---

## Sign In

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secret123',
})
// data.session.access_token = JWT to pass to Fastify
```

---

## Sign Out

```typescript
await supabase.auth.signOut()
```

---

## Session Management

The Supabase client handles JWT refresh automatically. The `access_token` in the session is the Supabase JWT that Fastify validates.

```typescript
// Get current session
const { data: { session } } = await supabase.auth.getSession()

// Listen for session changes
supabase.auth.onAuthStateChange((event, session) => {
  // event: SIGNED_IN | SIGNED_OUT | TOKEN_REFRESHED | ...
})
```

---

## Password Reset

```typescript
// Send reset email
await supabase.auth.resetPasswordForEmail('user@example.com', {
  redirectTo: 'https://yourapp.com/reset-password',
})

// After redirect, update the password
await supabase.auth.updateUser({ password: 'newpassword' })
```

---

## Email Verification

Configure in the Supabase dashboard under **Authentication → Email Templates**. When enabled, users must verify before the session is fully active.

---

## Fastify JWT Validation

On WebSocket connection, the frontend sends the Supabase `access_token` in the connection URL or upgrade headers. Fastify validates it using the Supabase JWT secret.

```typescript
// backend — JWT validation (conceptual)
import jwt from '@fastify/jwt'

// The JWT secret is your project's JWT_SECRET from Supabase dashboard
// Authentication → API Settings → JWT Secret
fastify.register(jwt, {
  secret: process.env.SUPABASE_JWT_SECRET,
})

// On WS upgrade or HTTP request
fastify.addHook('onRequest', async (req, reply) => {
  await req.jwtVerify()
  // req.user.sub = auth.users.id (= profiles.id)
})
```

The `sub` claim in the decoded JWT equals `auth.users.id`, which is the same as `profiles.id`. Use this to look up the user's profile, room membership, and team.

---

## Auth Metadata Security

`raw_user_meta_data` from signup is used **only** for profile initialization (username, display_name). It is **never** trusted for:

- Role assignment (HOST/PLAYER comes from `room_members.role`)
- Permission decisions
- Budget or financial values
- Any game-state determination

Roles come exclusively from the database, written by Fastify via service_role.

---

## Environment Variables

| Variable | Where | Value |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | `https://dvhzbkehgnkhernboigi.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | Anon/publishable key from dashboard |
| `SUPABASE_URL` | Backend (Fastify) | Same URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend (Fastify) | Service role key — **never expose to frontend** |
| `SUPABASE_JWT_SECRET` | Backend (Fastify) | JWT secret for token validation |
| `DATABASE_URL` | Backend (Fastify) | Direct Postgres URL for transactions |

---

## Supabase Client Initialization

**Frontend:**
```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/supabase/types/database.types'

export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

**Backend (Fastify) — service role:**
```typescript
// repositories/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../supabase/types/database.types'

export const supabaseAdmin = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
```
