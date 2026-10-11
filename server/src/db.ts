import pg from 'pg';

// numeric → number (balances and amounts are well inside double precision).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
// date → 'YYYY-MM-DD' string, not a JS Date in the server's time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export type Db = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

type Runner = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

function wrap(runner: Runner): Omit<Db, 'tx' | 'close'> {
  return {
    query: async <T>(sql: string, params?: unknown[]) => (await runner.query(sql, params)).rows as T[],
    one: async <T>(sql: string, params?: unknown[]) => (await runner.query(sql, params)).rows[0] as T | undefined,
  };
}

export function createDb(databaseUrl: string): Db {
  const local = /localhost|127\.0\.0\.1|\/tmp|host=\//.test(databaseUrl);
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    // Hosted Postgres (Neon, Render, Supabase) requires TLS.
    ssl: local || /sslmode=disable/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
  });
  return {
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const db: Db = { ...wrap(client), tx: (f) => f(db), close: async () => {} };
        const out = await fn(db);
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback');
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
