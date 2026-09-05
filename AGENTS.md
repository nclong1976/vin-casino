# AGENTS.md — Base44 sandbox notes for VinClub

## Architecture (single origin, no local DB)

`npm run dev` = `tsx server.ts`. The Express server in `server.ts` serves EVERYTHING
on `:3000`: the API + socket.io, and (when `NODE_ENV !== "production"`) the Vite
dev server in middleware mode. There is no separate frontend/backend service and
**no local database** — Supabase (Postgres/Auth/Realtime) is an external managed
project. `supabase/migrations/` is the source of truth for the Supabase schema;
migrations are applied on the Supabase project, not in the sandbox.

Run/verify with docker compose:

```sh
docker compose -f docker-compose.base44.yml up -d
docker compose -f docker-compose.base44.yml logs web
curl -sf -H "Host: external.example.com" http://localhost:3000/   # must return the app
```

Success signal in logs: `Server running on http://0.0.0.0:3000`.

## Non-obvious findings

- **Node ≥ 22 is required.** With real service-role credentials present,
  `@supabase/realtime-js` needs the global `WebSocket` (Node 22+) — on Node 20
  the server crashes at boot inside `createClient` (server.ts:27). `node:22` is
  pinned in `docker-compose.base44.yml`.
- **Secret name remap.** The user's Supabase credentials are stored under their
  own names (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`),
  but the code reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
  (browser) and `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (server.ts).
  `.base44/dev.sh` remaps them at container startup with the POSIX `:-` idiom,
  so a value later stored under the code's own name always wins. **Never add a
  `VITE_SUPABASE_*` placeholder to `.env.base44-defaults`** — it would shadow
  the remap, because the platform env file does not define the `VITE_` names.
- **Vite host check applies in middleware mode.** `vite.config.js` sets
  `server.allowedHosts: true` — without it the preview proxy hostname gets
  "Blocked request. This host is not allowed" even though Express owns the port.
- **Hot reload scope.** Frontend edits HMR live (Vite middleware). `server.ts`
  edits need `docker compose -f docker-compose.base44.yml restart web`.
- **Optional integrations degrade gracefully**: Telegram bridge, Gemini
  `/api/market-search`, and the daily-interest job all self-disable (warn, no
  crash) when their env vars are missing.
- **Supabase project restriction**: as of 2026-09-05 the user's Supabase
  project answers `exceed_egress_quota` (free-tier egress cap). Server-side RPC
  fails and the browser Supabase Realtime WebSocket logs "WebSocket closed
  without opened" until the user lifts the cap on their Supabase dashboard. The
  app itself boots and renders the login/welcome flow regardless.

## Tests

```sh
docker compose -f docker-compose.base44.yml exec -T web sh -c "npm test"   # vitest run
```
