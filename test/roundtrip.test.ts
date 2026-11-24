import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { add, call, equals, fromJSON, keyOf, mul, neg, num, pow, rel, toJSON, type Expr } from "../src/core/ast.js";
import { parse } from "../src/core/parser.js";
import { toText } from "../src/core/print/text.js";
import { Random, randomExpr, randomLeaf } from "./helpers.js";

function wrapOnce(r: Random, e: Expr): Expr {
  switch (r.int(0, 6)) {
    case 0:
      return neg(e);
    case 1:
      return pow(e, randomLeaf(r));
    case 2:
      return pow(randomLeaf(r), e);
    case 3:
      return pow(e, num(-1));
    case 4:
      return call(r.pick(["sin", "sqrt", "abs", "factorial"]), [e]);
    case 5:
      return r.chance(0.5) ? mul(randomLeaf(r), e) : mul(e, randomLeaf(r));
    default:
      return r.chance(0.5) ? add(randomLeaf(r), e) : add(e, randomLeaf(r));
  }
}

function assertRoundTrip(e: Expr): void {
  const text = toText(e);
  let back: Expr;
  try {
    back = parse(text);
  } catch (error) {
    throw new Error(`printed text failed to parse: ${text}\n${String(error)}\ntree ${keyOf(e)}`);
  }
  if (!equals(back, e)) {
    throw new Error(`round trip changed the tree\ntext ${text}\nwant ${keyOf(e)}\ngot  ${keyOf(back)}`);
  }
}

describe("print -> parse round trip", () => {
  it("holds for 20,000 random trees", () => {
    const r = new Random(1337);
    for (let i = 0; i < 20000; i++) assertRoundTrip(randomExpr(r, r.int(1, 6)));
  });

  it("holds for random relations", () => {
    const r = new Random(99);
    for (let i = 0; i < 2000; i++) {
      assertRoundTrip(rel(r.pick(["=", "!=", "<", "<=", ">", ">="] as const), randomExpr(r, 4), randomExpr(r, 4)));
    }
  });

  it("holds for deep, narrow trees", () => {
    const r = new Random(7);
    for (let i = 0; i < 300; i++) {
      let e = randomExpr(r, 2);
      for (let level = 0; level < 60; level++) e = wrapOnce(r, e);
      assertRoundTrip(e);
    }
  });

  it("is idempotent on every reference input", () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/reference-parse.json", import.meta.url), "utf8")) as {
      cases: { input: string }[];
    };
    for (const c of fixture.cases) {
      const e = parse(c.input);
      assertRoundTrip(e);
      expect(toText(parse(toText(e)))).toBe(toText(e));
    }
  });
});

describe("JSON round trip", () => {
  it("rebuilds identical trees", () => {
    const r = new Random(4242);
    for (let i = 0; i < 3000; i++) {
      const e = randomExpr(r, 5);
      const back = fromJSON(toJSON(e));
      expect(equals(back, e)).toBe(true);
      expect(toJSON(back)).toBe(toJSON(e));
    }
  });
});
