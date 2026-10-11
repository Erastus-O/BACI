import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDb } from './db.ts';
import { migrate } from './migrate.ts';
import { createPlaid } from './plaid.ts';

const config = loadConfig();
const db = createDb(config.databaseUrl);
await migrate(db);
const app = createApp({ db, plaid: createPlaid(config.plaid), config });

// Expired sessions are cleaned up hourly.
setInterval(() => db.query('delete from sessions where expires_at < now()').catch(console.error), 3600_000).unref();

serve({ fetch: app.fetch, port: config.port }, ({ port }) => console.log(`BACI API on :${port} (Plaid ${config.plaid.env})`));
