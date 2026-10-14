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
npm run test:revenue-excel
```

The integration test uses an in-memory PostgreSQL engine and synthetic records; it does not connect to the production database. Build the frontend separately:

```powershell
cd frontend
npm ci
npm run build
```

## API deployment

Sales and stock history share a stable `stock_history.sale_id` link. Before deploying an API
that uses this column, apply `supabase/migrations/20261013030000_link_sale_history.sql` to the
existing database. It is additive and repeatable; only unique legacy pairs are linked.
It does not overwrite prices, quantities, dates or other business fields. Audit any unlinked
sales before allowing edits; the API rejects edits/cancellation when the link is missing.
Edits from either screen update both snapshots and the stock delta in one transaction.
History group saves also run in one transaction. Catalog cost changes remain independent
of historical sales costs; wholesale records are not retail sales.

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
- `node scripts/backup-public.mjs` additionally saves a consistent JSON snapshot of all nine business tables, column/constraint metadata and sequence values via the authenticated management CLI. It validates the saved file and prints only counts and a checksum. This contains employee password hashes and must remain private in ignored `backups/`; it supplements, rather than replaces, a full PostgreSQL dump.
- The new and old backends use the same Supabase database. Do not restore or re-import the dump as part of this frontend cutover.
- To revert the frontend, first resume the suspended Render service, then restore the former Render URL in `frontend/.env.production` and redeploy Cloudflare Pages. Render must be running for that rollback path.
- Do not delete the suspended Render service or the checked PostgreSQL dump until the new path has been used long enough to rule out operational regressions.

## Document printing

New documents store shared recipient/items/amounts under neutral type `문서` and an `M` number.
No schema migration or rewrite of existing documents is needed. The preview selects an output
type (quotation, transaction statement, delivery note) locally; printing never creates or
changes a database record. Legacy `Q`, `D` and `T` numbers and issuer information are retained,
and those documents can also be printed in all three formats. The API continues to accept
legacy explicit document types for compatibility. All item rows are printed, including
documents with more than ten lines; logo and stamp images load before the print dialog opens.

## Free-tier hygiene

- Frontend pages load on demand. Excel code is fetched only for export, and SQLite parsing is loaded only for a DB import.
- The Edge Function keeps at most one PostgreSQL connection per isolate and closes idle connections after ten seconds.
- Large imports or growing traffic should be monitored in the Supabase usage dashboard. The SQLite import endpoint rejects files over 20 MB.
