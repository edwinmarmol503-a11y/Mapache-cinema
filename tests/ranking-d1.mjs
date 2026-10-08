// Real SQLite adapter for the small subset of D1 used by the production Worker.
// This runs the actual migration and SQL, including transactions and constraints.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function createTestDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../migrations/0001_ranking.sql', import.meta.url), 'utf8'));
  class Statement {
    constructor(sql, values = []) { this.sql = sql; this.values = values; }
    bind(...values) { return new Statement(this.sql, values); }
    async first(column) {
      const row = sqlite.prepare(this.sql).get(...this.values) || null;
      return column ? row?.[column] ?? null : row;
    }
    async all() { return { success: true, results: sqlite.prepare(this.sql).all(...this.values) }; }
    async run() { return this.execute(); }
    execute() {
      const statement = sqlite.prepare(this.sql);
      if (statement.columns().length) return { success: true, results: statement.all(...this.values) };
      const info = statement.run(...this.values);
      return { success: true, results: [], meta: { changes: info.changes } };
    }
  }
  return {
    sqlite,
    prepare(sql) { return new Statement(sql); },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const result = statements.map((s) => s.execute()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}
