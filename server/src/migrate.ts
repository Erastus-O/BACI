import { pathToFileURL } from 'node:url';
import { createDb, type Db } from './db.ts';

// Append-only: never edit a migration that has shipped; add a new one.
const migrations: string[] = [
  `
  create table users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now()
  );
  create table sessions (
    token_hash text primary key,
    user_id uuid not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
  );
  create index sessions_user on sessions(user_id);
  create table user_state (
    user_id uuid primary key references users(id) on delete cascade,
    onboarding_step text not null default 'consent',
    consent jsonb,
    consent_revoked_at timestamptz,
    profile jsonb not null default '{}',
    dismissed_insights jsonb not null default '[]',
    updated_at timestamptz not null default now()
  );
  -- What the person agreed to and when (spec 02: "we record when you agree and what you allowed").
  create table consent_events (
    id bigserial primary key,
    user_id uuid not null references users(id) on delete cascade,
    action text not null,
    version text,
    permissions jsonb,
    at timestamptz not null default now()
  );
  create table items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    plaid_item_id text not null unique,
    access_token_enc text not null,
    institution_id text,
    institution_name text not null,
    institution_logo text,
    institution_colour text,
    status text not null default 'active',
    error_code text,
    tx_status text,
    cursor text,
    last_sync_at timestamptz,
    created_at timestamptz not null default now()
  );
  create index items_user on items(user_id);
  create table accounts (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references items(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    plaid_account_id text not null unique,
    name text not null,
    mask text,
    type text,
    subtype text,
    kind text not null,
    balance numeric,
    currency text,
    selected boolean not null default false,
    sync_failed boolean not null default false
  );
  create index accounts_user on accounts(user_id);
  create table transactions (
    plaid_transaction_id text primary key,
    user_id uuid not null references users(id) on delete cascade,
    account_id uuid not null references accounts(id) on delete cascade,
    amount numeric not null,
    date date not null,
    name text not null,
    merchant_name text,
    category text,
    pending boolean not null default false
  );
  create index transactions_user_date on transactions(user_id, date);
  `,
  // Analytics: how each payment was made.
  `
  alter table transactions add column payment_channel text, add column category_detailed text;
  `,
];

export async function migrate(db: Db) {
  await db.query('create table if not exists schema_migrations (version int primary key, applied_at timestamptz not null default now())');
  const done = new Set((await db.query<{ version: number }>('select version from schema_migrations')).map((r) => r.version));
  for (const [i, sql] of migrations.entries()) {
    const version = i + 1;
    if (done.has(version)) continue;
    await db.tx(async (t) => {
      await t.query(sql);
      await t.query('insert into schema_migrations (version) values ($1)', [version]);
    });
    console.log(`Applied migration ${version}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL');
  const db = createDb(url);
  await migrate(db);
  await db.close();
}
