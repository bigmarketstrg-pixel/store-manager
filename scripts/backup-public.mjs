import { spawnSync } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const tables = ['users', 'products', 'sales', 'stock_history', 'wholesale_outbounds',
  'wholesale_outbound_items', 'documents', 'deliveries', 'handover_notes']
const query = `SELECT jsonb_build_object('captured_at', now(), 'tables', jsonb_build_object(
  ${tables.map(name => `'${name}', (SELECT COALESCE(jsonb_agg(t ORDER BY id), '[]'::jsonb) FROM public.${name} t)`).join(',')}
), 'columns', (SELECT jsonb_agg(c) FROM information_schema.columns c WHERE table_schema='public'),
'constraints', (SELECT jsonb_agg(jsonb_build_object('table', conrelid::regclass::text,
'name', conname, 'definition', pg_get_constraintdef(oid))) FROM pg_constraint
WHERE connamespace='public'::regnamespace),
'sequences', (SELECT jsonb_agg(s) FROM pg_sequences s WHERE schemaname='public')) AS snapshot`
const result = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'db', 'query',
  '--linked', '--project-ref', 'tejsmczzzsmoxmpuuzai', '--output-format', 'json', query],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
if (result.status !== 0) throw new Error('Backup query failed; no database changes were made.')
const parsed = JSON.parse(result.stdout)
const snapshot = parsed.rows?.[0]?.snapshot
if (!snapshot?.tables || tables.some(name => !Array.isArray(snapshot.tables[name]))) {
  throw new Error('Incomplete backup response')
}
await mkdir('backups', { recursive: true })
const file = `backups/public-data-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`
const data = JSON.stringify(snapshot, null, 2)
await writeFile(file, data, { mode: 0o600 })
const verified = JSON.parse(await readFile(file, 'utf8'))
for (const name of tables) {
  if (verified.tables[name].length !== snapshot.tables[name].length) throw new Error('Backup verification failed')
}
console.log(JSON.stringify({ file, sha256: createHash('sha256').update(data).digest('hex'),
  counts: Object.fromEntries(tables.map(name => [name, snapshot.tables[name].length])) }))
