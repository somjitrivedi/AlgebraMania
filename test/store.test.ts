import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { equals, hashOf } from "../src/core/ast.js";
import { parse, tryParse } from "../src/core/parser.js";
import { Store } from "../src/db/store.js";

const opened: Store[] = [];
const dirs: string[] = [];

function memory(): Store {
  const s = Store.open(":memory:");
  opened.push(s);
  return s;
}

afterEach(() => {
  for (const s of opened.splice(0)) if (s.db.open) s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("Store", () => {
  it("migrates once and records the schema version", () => {
    const s = memory();
    expect(s.schemaVersion()).toBe(1);
    expect(s.migrate()).toEqual([]);
    const tables = (s.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(
      (t) => t.name
    );
    expect(tables).toEqual(["expressions", "queries", "schema_migrations"]);
  });

  it("stores successful parses and deduplicates identical trees", () => {
    const s = memory();
    const a = s.recordSuccess("parse", "2x+1", parse("2x+1"), 12.4);
    const b = s.recordSuccess("parse", "2 x + 1", parse("2 x + 1"), 8);
    const c = s.recordSuccess("parse", "1 + 2x", parse("1 + 2x"), 9);
    expect(b.expression.id).toBe(a.expression.id);
    expect(c.expression.id).not.toBe(a.expression.id);
    expect(s.getExpression(a.expression.id)!.hits).toBe(2);
    expect(a.query).toMatchObject({ ok: true, input: "2x+1", text: "2x + 1", durationUs: 12, errorMessage: null });
    expect(a.expression).toMatchObject({ text: "2x + 1", latex: "2 x + 1", nodeCount: 5, depth: 3 });
    expect(a.expression.hash).toBe(hashOf(parse("2x+1")));
  });

  it("loads stored trees back into identical expressions", () => {
    const s = memory();
    const e = parse("sin(x)^2 + cos(x)^2 = 1");
    const { expression } = s.recordSuccess("parse", "sin(x)^2 + cos(x)^2 = 1", e, 1);
    expect(equals(s.loadExpression(expression.id)!, e)).toBe(true);
    expect(s.findByHash(hashOf(e)).map((r) => r.id)).toEqual([expression.id]);
    expect(s.loadExpression(9999)).toBeUndefined();
  });

  it("stores failures with their error span", () => {
    const s = memory();
    const r = tryParse("2 + sin x");
    if (r.ok) throw new Error("expected failure");
    const q = s.recordFailure("parse", "2 + sin x", r.error, 3);
    expect(q).toMatchObject({ ok: false, expressionId: null, text: null, errorStart: 4, errorEnd: 7 });
    expect(q.errorMessage).toContain("is a function");
  });

  it("enforces the success/failure shape in the schema", () => {
    const s = memory();
    expect(() => s.db.prepare("INSERT INTO queries (command, input, ok, duration_us) VALUES ('parse', 'x', 1, 0)").run()).toThrow(
      /CHECK/
    );
    expect(() => s.db.prepare("INSERT INTO queries (command, input, ok, duration_us) VALUES ('parse', 'x', 0, 0)").run()).toThrow(
      /CHECK/
    );
  });

  it("lists history newest first with filters, and summarizes stats", () => {
    const s = memory();
    s.recordSuccess("parse", "x", parse("x"), 10);
    s.recordSuccess("parse", "x", parse("x"), 20);
    const bad = tryParse("(");
    if (bad.ok) throw new Error("expected failure");
    s.recordFailure("parse", "(", bad.error, 30);
    s.recordSuccess("parse", "y^2", parse("y^2"), 40);
    expect(s.history(10).map((q) => q.input)).toEqual(["y^2", "(", "x", "x"]);
    expect(s.history(2).map((q) => q.input)).toEqual(["y^2", "("]);
    expect(s.history(10, "errors").map((q) => q.input)).toEqual(["("]);
    expect(s.history(10, "ok")).toHaveLength(3);
    expect(s.stats()).toEqual({
      queries: 4,
      succeeded: 3,
      failed: 1,
      expressions: 2,
      averageDurationUs: 25,
      top: [
        { text: "x", hits: 2 },
        { text: "y^2", hits: 1 }
      ]
    });
  });

  it("persists to a file and reopens without re-migrating", () => {
    const dir = mkdtempSync(join(tmpdir(), "algebramania-"));
    dirs.push(dir);
    const path = join(dir, "nested", "am.db");
    const first = Store.open(path);
    first.recordSuccess("parse", "x^2", parse("x^2"), 5);
    first.close();
    const second = Store.open(path);
    opened.push(second);
    expect(second.migrate()).toEqual([]);
    expect(second.history(5).map((q) => q.text)).toEqual(["x^2"]);
    expect((second.db.pragma("journal_mode", { simple: true }) as string).toLowerCase()).toBe("wal");
  });
});
