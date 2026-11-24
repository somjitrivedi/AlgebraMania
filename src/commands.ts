import { performance } from "node:perf_hooks";
import { depth, hashOf, size, toJSON } from "./core/ast.js";
import { ParseError, formatParseError } from "./core/errors.js";
import { tryParse } from "./core/parser.js";
import { toLatex } from "./core/print/latex.js";
import { toText } from "./core/print/text.js";
import { toTree } from "./core/print/tree.js";
import { DEFAULT_DB_PATH, Store, type QueryRow } from "./db/store.js";

export interface Io {
  out(line: string): void;
  err(line: string): void;
}

export const consoleIo: Io = {
  out: (line) => process.stdout.write(line + "\n"),
  err: (line) => process.stderr.write(line + "\n")
};

const FORMATS = ["all", "text", "latex", "tree", "json"] as const;
type Format = (typeof FORMATS)[number];

interface Options {
  positional: string[];
  format: Format;
  db: string;
  save: boolean;
  limit: number;
  filter: "all" | "ok" | "errors";
}

class UsageError extends Error {}

export const USAGE = [
  "AlgebraMania",
  "",
  "usage:",
  "  am parse <expression> [--format all|text|latex|tree|json] [--no-save] [--db <path>]",
  "  am history [--limit <n>] [--errors | --ok] [--db <path>]",
  "  am show <query-id> [--db <path>]",
  "  am stats [--db <path>]",
  "  am help",
  "",
  "The expression may be quoted or given as several words: am parse 2x^2 - 3x + 1",
  "The database defaults to $ALGEBRAMANIA_DB, then data/algebramania.db."
].join("\n");

function parseOptions(args: readonly string[], env: Readonly<Record<string, string | undefined>>): Options {
  const options: Options = {
    positional: [],
    format: "all",
    db: env["ALGEBRAMANIA_DB"] ?? DEFAULT_DB_PATH,
    save: true,
    limit: 20,
    filter: "all"
  };
  let literal = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (literal) {
      options.positional.push(a);
      continue;
    }
    const [flag, inline] = a.startsWith("--") && a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    const value = (): string => {
      if (inline !== undefined) return inline;
      const v = args[++i];
      if (v === undefined) throw new UsageError(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case "--":
        literal = true;
        break;
      case "--format": {
        const f = value();
        if (!(FORMATS as readonly string[]).includes(f)) throw new UsageError(`unknown format "${f}"`);
        options.format = f as Format;
        break;
      }
      case "--db":
        options.db = value();
        break;
      case "--no-save":
        options.save = false;
        break;
      case "--limit": {
        const n = Number(value());
        if (!Number.isInteger(n) || n < 1) throw new UsageError("--limit must be a positive integer");
        options.limit = n;
        break;
      }
      case "--errors":
        options.filter = "errors";
        break;
      case "--ok":
        options.filter = "ok";
        break;
      default:
        options.positional.push(a);
    }
  }
  return options;
}

function micros(start: number): number {
  return (performance.now() - start) * 1000;
}

function withStore<T>(options: Options, fn: (store: Store) => T): T {
  const store = Store.open(options.db);
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

function parseCommand(options: Options, io: Io): number {
  const input = options.positional.join(" ");
  if (input.trim() === "") throw new UsageError("parse needs an expression");
  const started = performance.now();
  const result = tryParse(input);
  const elapsed = micros(started);
  let queryId: number | null = null;
  if (options.save) {
    queryId = withStore(options, (store) =>
      result.ok
        ? store.recordSuccess("parse", input, result.expr, elapsed).query.id
        : store.recordFailure("parse", input, result.error, elapsed).id
    );
  }
  if (!result.ok) {
    io.err(formatParseError(input, result.error));
    return 1;
  }
  const e = result.expr;
  switch (options.format) {
    case "text":
      io.out(toText(e));
      break;
    case "latex":
      io.out(toLatex(e));
      break;
    case "tree":
      io.out(toTree(e));
      break;
    case "json":
      io.out(toJSON(e));
      break;
    case "all":
      io.out(`text   ${toText(e)}`);
      io.out(`latex  ${toLatex(e)}`);
      io.out(`hash   ${hashOf(e)}`);
      io.out(`nodes  ${size(e)}  depth ${depth(e)}`);
      if (queryId !== null) io.out(`saved  query #${queryId}`);
      io.out("tree");
      for (const line of toTree(e).split("\n")) io.out(`  ${line}`);
      break;
  }
  return 0;
}

function describeQuery(q: QueryRow): string {
  const status = q.ok ? "ok " : "err";
  const detail = q.ok ? `=> ${q.text}` : `!! ${q.errorMessage}`;
  return `#${String(q.id).padEnd(5)} ${status}  ${q.input}  ${detail}`;
}

function historyCommand(options: Options, io: Io): number {
  const rows = withStore(options, (store) => store.history(options.limit, options.filter));
  if (rows.length === 0) {
    io.out("no queries recorded yet");
    return 0;
  }
  for (const q of rows) io.out(describeQuery(q));
  return 0;
}

function showCommand(options: Options, io: Io): number {
  const id = Number(options.positional[0]);
  if (!Number.isInteger(id) || id < 1) throw new UsageError("show needs a query id");
  return withStore(options, (store) => {
    const q = store.getQuery(id);
    if (q === undefined) {
      io.err(`error: no query #${id}`);
      return 1;
    }
    io.out(`query    #${q.id} (${q.command}) at ${q.createdAt}`);
    io.out(`input    ${q.input}`);
    io.out(`time     ${q.durationUs} us`);
    if (!q.ok) {
      io.out(formatParseError(q.input, new ParseError(q.errorMessage ?? "", q.errorStart ?? 0, q.errorEnd ?? 0)));
      return 0;
    }
    const exprRow = store.getExpression(q.expressionId!)!;
    io.out(`text     ${exprRow.text}`);
    io.out(`latex    ${exprRow.latex}`);
    io.out(`hash     ${exprRow.hash}  seen ${exprRow.hits}x`);
    io.out("tree");
    for (const line of toTree(store.loadExpression(exprRow.id)!).split("\n")) io.out(`  ${line}`);
    return 0;
  });
}

function statsCommand(options: Options, io: Io): number {
  const s = withStore(options, (store) => store.stats());
  io.out(`queries      ${s.queries} (${s.succeeded} ok, ${s.failed} failed)`);
  io.out(`expressions  ${s.expressions} distinct`);
  io.out(`avg parse    ${s.averageDurationUs} us`);
  if (s.top.length > 0) {
    io.out("most seen");
    for (const t of s.top) io.out(`  ${String(t.hits).padStart(4)}x  ${t.text}`);
  }
  return 0;
}

export function run(argv: readonly string[], io: Io = consoleIo, env: Readonly<Record<string, string | undefined>> = process.env): number {
  const [command, ...rest] = argv;
  try {
    const options = parseOptions(rest, env);
    switch (command) {
      case "parse":
        return parseCommand(options, io);
      case "history":
        return historyCommand(options, io);
      case "show":
        return showCommand(options, io);
      case "stats":
        return statsCommand(options, io);
      case undefined:
      case "help":
      case "--help":
      case "-h":
        io.out(USAGE);
        return 0;
      default:
        throw new UsageError(`unknown command "${command}"`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`error: ${error.message}`);
      io.err("");
      io.err(USAGE);
      return 2;
    }
    throw error;
  }
}
