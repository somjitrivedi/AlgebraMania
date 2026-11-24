export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "expressions_and_queries",
    sql: `
      CREATE TABLE expressions (
        id INTEGER PRIMARY KEY,
        hash TEXT NOT NULL,
        tree_json TEXT NOT NULL UNIQUE,
        text TEXT NOT NULL,
        latex TEXT NOT NULL,
        node_count INTEGER NOT NULL CHECK (node_count > 0),
        depth INTEGER NOT NULL CHECK (depth > 0),
        hits INTEGER NOT NULL DEFAULT 0,
        first_seen TEXT NOT NULL DEFAULT ${NOW},
        last_seen TEXT NOT NULL DEFAULT ${NOW}
      );
      CREATE INDEX idx_expressions_hash ON expressions(hash);

      CREATE TABLE queries (
        id INTEGER PRIMARY KEY,
        command TEXT NOT NULL,
        input TEXT NOT NULL,
        expression_id INTEGER REFERENCES expressions(id) ON DELETE SET NULL,
        ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
        error_message TEXT,
        error_start INTEGER,
        error_end INTEGER,
        duration_us INTEGER NOT NULL CHECK (duration_us >= 0),
        created_at TEXT NOT NULL DEFAULT ${NOW},
        CHECK ((ok = 1 AND expression_id IS NOT NULL AND error_message IS NULL)
            OR (ok = 0 AND expression_id IS NULL AND error_message IS NOT NULL))
      );
      CREATE INDEX idx_queries_expression ON queries(expression_id);
      CREATE INDEX idx_queries_ok ON queries(ok, id);
    `
  }
];
