# Store Manager deployment

## Services

- Cloudflare Pages serves the React/Vite frontend from `frontend/`.
- Supabase Edge Function `store-manager-api-v2` serves the existing `/api/*` contract from `supabase/functions/`.
- Supabase PostgreSQL stores the nine existing business tables. The migration does not copy or reset their data.
- Production site: `https://store-manager-3q1.pages.dev`. Cloudflare Pages builds `main` from GitHub.
- Render is the legacy backend. After the production login and core lists were verified, its automatic deploys were disabled and the service was suspended. Keep it suspended for a reversible rollback; it is not in the live request path.
- The former Vercel project is disconnected from GitHub and its production traffic is paused. Old Vercel URLs return an error; use the Cloudflare Pages URL above.

## Local checks

From the repository root:

```powershell
npm ci
npm run check:api
npm run test:api
npm run test:integration
```

The integration test uses an in-memory PostgreSQL engine and synthetic records; it does not connect to the production database. Build the frontend separately:

```powershell
cd frontend
npm ci
npm run build
```

## API deployment

Use the Supabase CLI on an authenticated maintenance computer:

```powershell
npx supabase functions deploy store-manager-api-v2 --project-ref tejsmczzzsmoxmpuuzai
```

Supabase injects `SUPABASE_DB_URL` into the function environment. Set `SECRET_KEY` only in the Supabase Edge Function secrets dashboard; its value must match the former Render backend to keep existing employee tokens valid. Never commit either value. `verify_jwt = false` in `supabase/config.toml` is intentional: the function's public login route uses the application's existing employee accounts, and every business route validates the app token in `index.ts`.

The production frontend API URL is configured in `frontend/.env.production`. Test the function with the local frontend before changing that file. The new value is:

```text
https://tejsmczzzsmoxmpuuzai.supabase.co/functions/v1/store-manager-api-v2
```

Cloudflare Pages builds the frontend from GitHub after a push. Its build command is `npm run build` in `frontend/`, with `dist` as output. After each deployment, verify login, stock, sales, wholesale, documents, deliveries, and handover screens. The production login and stock, sales, wholesale, and document lists were verified during the cutover.

## Data and rollback

- Before infrastructure changes, create an external PostgreSQL dump and check it can be read with `pg_restore --list`. Keep dumps outside Git; `backups/` is ignored.
- The new and old backends use the same Supabase database. Do not restore or re-import the dump as part of this frontend cutover.
- To revert the frontend, first resume the suspended Render service, then restore the former Render URL in `frontend/.env.production` and redeploy Cloudflare Pages. Render must be running for that rollback path.
- Do not delete the suspended Render service or the checked PostgreSQL dump until the new path has been used long enough to rule out operational regressions.

## Free-tier hygiene

- Frontend pages load on demand. Excel code is fetched only for export, and SQLite parsing is loaded only for a DB import.
- The Edge Function keeps at most one PostgreSQL connection per isolate and closes idle connections after ten seconds.
- Large imports or growing traffic should be monitored in the Supabase usage dashboard. The SQLite import endpoint rejects files over 20 MB.
