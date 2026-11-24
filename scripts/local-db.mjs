import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function localDatabase(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout = 5000');
  const { entries } = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  const initialized = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ballots'").get());
  const version = Math.max(db.prepare('PRAGMA user_version').get().user_version, Number(initialized));
  for (const { idx, tag } of entries.slice(version)) {
    const migration = readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8');
    db.exec(`BEGIN; ${migration} PRAGMA user_version = ${idx + 1}; COMMIT;`);
  }

  function statement(sql, params = []) {
    return {
      bind: (...values) => statement(sql, values),
      first: async () => db.prepare(sql).get(...params) || null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...params).changes) } }),
    };
  }

  return {
    prepare: statement,
    batch: statements => Promise.all(statements.map(query => query.all())),
    close: () => db.close(),
  };
}
