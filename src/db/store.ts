import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { depth, fromJSON, hashOf, size, toJSON, type Expr } from "../core/ast.js";
import type { ParseError } from "../core/errors.js";
import { toLatex } from "../core/print/latex.js";
import { toText } from "../core/print/text.js";
import { MIGRATIONS } from "./migrations.js";

export const DEFAULT_DB_PATH = "data/algebramania.db";

export interface ExpressionRow {
  readonly id: number;
  readonly hash: string;
  readonly treeJson: string;
  readonly text: string;
  readonly latex: string;
  readonly nodeCount: number;
  readonly depth: number;
  readonly hits: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
}

export interface QueryRow {
  readonly id: number;
  readonly command: string;
  readonly input: string;
  readonly ok: boolean;
  readonly expressionId: number | null;
  readonly text: string | null;
  readonly errorMessage: string | null;
  readonly errorStart: number | null;
  readonly errorEnd: number | null;
  readonly durationUs: number;
  readonly createdAt: string;
}

export interface Stats {
  readonly queries: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly expressions: number;
  readonly averageDurationUs: number;
  readonly top: readonly { readonly text: string; readonly hits: number }[];
}

interface RawQuery {
  id: number;
  command: string;
  input: string;
  ok: number;
  expression_id: number | null;
  text: string | null;
  error_message: string | null;
  error_start: number | null;
  error_end: number | null;
  duration_us: number;
  created_at: string;
}

interface RawExpression {
  id: number;
  hash: string;
  tree_json: string;
  text: string;
  latex: string;
  node_count: number;
  depth: number;
  hits: number;
  first_seen: string;
  last_seen: string;
}

function toQuery(r: RawQuery): QueryRow {
  return {
    id: r.id,
    command: r.command,
    input: r.input,
    ok: r.ok === 1,
    expressionId: r.expression_id,
    text: r.text,
    errorMessage: r.error_message,
    errorStart: r.error_start,
    errorEnd: r.error_end,
    durationUs: r.duration_us,
    createdAt: r.created_at
  };
}

function toExpression(r: RawExpression): ExpressionRow {
  return {
    id: r.id,
    hash: r.hash,
    treeJson: r.tree_json,
    text: r.text,
    latex: r.latex,
    nodeCount: r.node_count,
    depth: r.depth,
    hits: r.hits,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen
  };
}

const QUERY_SELECT = `
  SELECT q.id, q.command, q.input, q.ok, q.expression_id, e.text, q.error_message, q.error_start, q.error_end,
         q.duration_us, q.created_at
  FROM queries q LEFT JOIN expressions e ON e.id = q.expression_id
`;

export class Store {
  readonly db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static open(path: string = DEFAULT_DB_PATH): Store {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    const db = new Database(path);
    if (path !== ":memory:") db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    const store = new Store(db);
    store.migrate();
    return store;
  }

  migrate(): number[] {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
    const applied = new Set(
      (this.db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version)
    );
    const ran: number[] = [];
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue;
      this.db.transaction(() => {
        this.db.exec(m.sql);
        this.db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(m.version, m.name);
      })();
      ran.push(m.version);
    }
    return ran;
  }

  schemaVersion(): number {
    const row = this.db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
    return row.v ?? 0;
  }

  saveExpression(expr: Expr): ExpressionRow {
    const json = toJSON(expr);
    this.db
      .prepare(
        `INSERT INTO expressions (hash, tree_json, text, latex, node_count, depth, hits)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT (tree_json) DO UPDATE SET hits = hits + 1,
           last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
      )
      .run(hashOf(expr), json, toText(expr), toLatex(expr), size(expr), depth(expr));
    const row = this.db.prepare("SELECT * FROM expressions WHERE tree_json = ?").get(json) as RawExpression;
    return toExpression(row);
  }

  recordSuccess(command: string, input: string, expr: Expr, durationUs: number): { query: QueryRow; expression: ExpressionRow } {
    return this.db.transaction(() => {
      const expression = this.saveExpression(expr);
      const info = this.db
        .prepare("INSERT INTO queries (command, input, expression_id, ok, duration_us) VALUES (?, ?, ?, 1, ?)")
        .run(command, input, expression.id, Math.max(0, Math.round(durationUs)));
      return { query: this.getQuery(Number(info.lastInsertRowid))!, expression };
    })();
  }

  recordFailure(command: string, input: string, error: ParseError, durationUs: number): QueryRow {
    const info = this.db
      .prepare(
        `INSERT INTO queries (command, input, ok, error_message, error_start, error_end, duration_us)
         VALUES (?, ?, 0, ?, ?, ?, ?)`
      )
      .run(command, input, error.message, error.start, error.end, Math.max(0, Math.round(durationUs)));
    return this.getQuery(Number(info.lastInsertRowid))!;
  }

  getQuery(id: number): QueryRow | undefined {
    const row = this.db.prepare(`${QUERY_SELECT} WHERE q.id = ?`).get(id) as RawQuery | undefined;
    return row === undefined ? undefined : toQuery(row);
  }

  getExpression(id: number): ExpressionRow | undefined {
    const row = this.db.prepare("SELECT * FROM expressions WHERE id = ?").get(id) as RawExpression | undefined;
    return row === undefined ? undefined : toExpression(row);
  }

  loadExpression(id: number): Expr | undefined {
    const row = this.getExpression(id);
    return row === undefined ? undefined : fromJSON(row.treeJson);
  }

  findByHash(hash: string): ExpressionRow[] {
    const rows = this.db.prepare("SELECT * FROM expressions WHERE hash = ? ORDER BY id").all(hash) as RawExpression[];
    return rows.map(toExpression);
  }

  history(limit = 20, filter: "all" | "ok" | "errors" = "all"): QueryRow[] {
    const where = filter === "ok" ? "WHERE q.ok = 1" : filter === "errors" ? "WHERE q.ok = 0" : "";
    const rows = this.db.prepare(`${QUERY_SELECT} ${where} ORDER BY q.id DESC LIMIT ?`).all(Math.max(1, limit)) as RawQuery[];
    return rows.map(toQuery);
  }

  stats(topN = 5): Stats {
    const q = this.db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(ok), 0) AS ok, COALESCE(AVG(duration_us), 0) AS avg FROM queries`
      )
      .get() as { n: number; ok: number; avg: number };
    const e = this.db.prepare("SELECT COUNT(*) AS n FROM expressions").get() as { n: number };
    const top = this.db
      .prepare("SELECT text, hits FROM expressions ORDER BY hits DESC, id ASC LIMIT ?")
      .all(Math.max(0, topN)) as { text: string; hits: number }[];
    return {
      queries: q.n,
      succeeded: q.ok,
      failed: q.n - q.ok,
      expressions: e.n,
      averageDurationUs: Math.round(q.avg),
      top
    };
  }

  close(): void {
    this.db.close();
  }
}
