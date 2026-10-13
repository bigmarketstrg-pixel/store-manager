import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const db = await PGlite.create()
const schema = `
CREATE TABLE users (id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL,
  hashed_password VARCHAR(200) NOT NULL, name VARCHAR(50) NOT NULL,
  role VARCHAR(20) DEFAULT 'staff', is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT now());
CREATE TABLE products (id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL,
  business VARCHAR(20) NOT NULL, category VARCHAR(100), subcategory VARCHAR(100),
  brand VARCHAR(100), product_code VARCHAR(100), cost_price INTEGER DEFAULT 0,
  sale_price INTEGER DEFAULT 0, stock INTEGER DEFAULT 0, note VARCHAR(200), memo TEXT,
  updated_at TIMESTAMP);
CREATE TABLE sales (id SERIAL PRIMARY KEY, transaction_no VARCHAR(20) NOT NULL,
  sale_date DATE NOT NULL, product_id INTEGER REFERENCES products(id),
  product_name VARCHAR(200), business VARCHAR(20), category VARCHAR(100),
  subcategory VARCHAR(100), brand VARCHAR(100), cost_price INTEGER DEFAULT 0,
  sale_price INTEGER NOT NULL, quantity INTEGER NOT NULL, total INTEGER NOT NULL,
  channel VARCHAR(50), payment VARCHAR(50), memo TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT now());
CREATE TABLE wholesale_outbounds (id SERIAL PRIMARY KEY,
  transaction_no VARCHAR(20) UNIQUE NOT NULL, outbound_date DATE NOT NULL,
  dealer_name VARCHAR(100) NOT NULL, total INTEGER DEFAULT 0,
  paid_amount INTEGER DEFAULT 0, payment_status VARCHAR(20) DEFAULT '미수',
  memo TEXT, created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now());
CREATE TABLE wholesale_outbound_items (id SERIAL PRIMARY KEY,
  outbound_id INTEGER REFERENCES wholesale_outbounds(id),
  product_id INTEGER REFERENCES products(id), product_name VARCHAR(200),
  business VARCHAR(20), category VARCHAR(100), subcategory VARCHAR(100),
  brand VARCHAR(100), cost_price INTEGER DEFAULT 0, sale_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL, total INTEGER NOT NULL);
CREATE TABLE stock_history (id SERIAL PRIMARY KEY, transaction_no VARCHAR(20),
  record_date DATE NOT NULL, product_id INTEGER REFERENCES products(id),
  product_name VARCHAR(200), business VARCHAR(20), category VARCHAR(100),
  subcategory VARCHAR(100), brand VARCHAR(100), io_type VARCHAR(10),
  quantity INTEGER, cost_price INTEGER DEFAULT 0, memo TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT now());
CREATE TABLE documents (id SERIAL PRIMARY KEY, doc_type VARCHAR(20),
  doc_no VARCHAR(30) UNIQUE, business VARCHAR(20), doc_date DATE,
  recipient VARCHAR(100), total INTEGER DEFAULT 0, memo TEXT, items_json TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT now());
CREATE TABLE deliveries (id SERIAL PRIMARY KEY, delivery_date DATE NOT NULL,
  business VARCHAR(20) NOT NULL, recipient VARCHAR(100),
  shipping_fee INTEGER DEFAULT 0, memo TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT now());
CREATE TABLE handover_notes (id SERIAL PRIMARY KEY, note_date DATE NOT NULL,
  business VARCHAR(20) NOT NULL, memo VARCHAR(500) NOT NULL,
  is_done INTEGER DEFAULT 0, created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now());
`
await db.exec(schema)
const migration = await readFile('supabase/migrations/20261013030000_link_sale_history.sql', 'utf8')
await db.exec(`INSERT INTO sales (transaction_no, sale_date, product_name, cost_price, sale_price, quantity, total)
  VALUES ('LEGACY-UNIQUE', '2026-01-01', 'Legacy', 100, 300, 1, 300),
    ('LEGACY-AMBIGUOUS', '2026-01-01', 'Duplicate', 100, 300, 1, 300),
    ('LEGACY-AMBIGUOUS', '2026-01-01', 'Duplicate', 100, 300, 1, 300);
  INSERT INTO stock_history (transaction_no, record_date, product_name, io_type, quantity, cost_price)
  VALUES ('LEGACY-UNIQUE', '2026-01-01', 'Legacy', '출고', 1, 200),
    ('LEGACY-AMBIGUOUS', '2026-01-01', 'Duplicate', '출고', 1, 100),
    ('LEGACY-AMBIGUOUS', '2026-01-01', 'Duplicate', '출고', 1, 100),
    ('LEGACY-UNIQUE', '2026-01-01', 'Legacy', '입고', 1, 100);`)
await db.exec(migration)
await db.exec(migration)
const linked = (await db.query('SELECT sale_id, cost_price FROM stock_history WHERE sale_id IS NOT NULL')).rows
if (linked.length !== 1 || linked[0].sale_id !== 1 || linked[0].cost_price !== 200) {
  throw new Error('Legacy backfill guessed an ambiguous link or overwrote history')
}
await db.exec('TRUNCATE sales, stock_history RESTART IDENTITY')
console.log('Legacy migration: unique links, ambiguity safety, data preservation and repeatability passed')

const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55433 })
await server.start()
try {
  const child = spawn(resolve('node_modules/deno/deno.exe'), [
    'test', '--node-modules-dir=manual', '--allow-env', '--allow-net',
    'supabase/functions/store-manager-api-v2/integration.test.ts',
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:55433/postgres',
      SECRET_KEY: 'local-integration-test-only',
    },
  })
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', resolve)
  })
  if (code !== 0) process.exitCode = code || 1
} finally {
  await server.stop()
  await db.close()
}
