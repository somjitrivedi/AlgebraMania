import { describe, expect, it } from "vitest";
import {
  add,
  call,
  children,
  depth,
  equals,
  fromJSON,
  hashOf,
  keyOf,
  mul,
  neg,
  num,
  pow,
  rel,
  size,
  sym,
  symbols,
  toJSON
} from "../src/core/ast.js";
import { AstError } from "../src/core/errors.js";
import { isIntegerNumeral, negateNumeral, normalizeNumeral } from "../src/core/numeral.js";

const x = sym("x");
const y = sym("y");

describe("numerals", () => {
  it.each([
    ["0", "0"],
    ["007", "7"],
    ["-0", "0"],
    ["1.500", "1.5"],
    ["2.0", "2.0"],
    ["0.000", "0.0"],
    ["-0.0", "0.0"],
    ["-12.340", "-12.34"],
    ["00.25", "0.25"],
    ["123456789012345678901234567890", "123456789012345678901234567890"]
  ])("normalizes %s to %s", (raw, want) => {
    expect(normalizeNumeral(raw)).toBe(want);
  });

  it.each(["", "-", ".", "1.", "1.2.3", "abc", "1e5", "+3", " 1"])("rejects %j", (raw) => {
    expect(() => normalizeNumeral(raw)).toThrow(AstError);
  });

  it("negates without producing negative zero", () => {
    expect(negateNumeral("3")).toBe("-3");
    expect(negateNumeral("-3.5")).toBe("3.5");
    expect(negateNumeral("0")).toBe("0");
    expect(negateNumeral("0.0")).toBe("0.0");
  });

  it("tells integers from decimals", () => {
    expect(isIntegerNumeral("-12")).toBe(true);
    expect(isIntegerNumeral("1.0")).toBe(false);
  });

  it("accepts bigint and safe integers, rejects unsafe numbers", () => {
    expect(num(10n ** 30n).value).toBe("1" + "0".repeat(30));
    expect(num(-5).value).toBe("-5");
    expect(() => num(0.5)).toThrow(AstError);
    expect(() => num(2 ** 60)).toThrow(AstError);
  });
});

describe("constructors", () => {
  it("flattens nested sums and products", () => {
    const e = add(x, add(y, add(num(1), num(2))));
    expect(e.type).toBe("add");
    expect(children(e)).toHaveLength(4);
    const p = mul(mul(x, y), mul(num(2), x));
    expect(children(p)).toHaveLength(4);
  });

  it("collapses empty and single-operand sums and products", () => {
    expect(equals(add(), num(0))).toBe(true);
    expect(equals(mul(), num(1))).toBe(true);
    expect(add(x)).toBe(x);
    expect(mul(y)).toBe(y);
  });

  it("does not simplify", () => {
    expect(keyOf(add(x, x))).toBe("+(sx,sx)");
    expect(keyOf(mul(num(2), num(3)))).toBe("*(n2,n3)");
    expect(keyOf(pow(x, num(1)))).toBe("^(sx,n1)");
  });

  it("negates numbers, coefficients and everything else", () => {
    expect(keyOf(neg(num(3)))).toBe("n-3");
    expect(keyOf(neg(num(-3)))).toBe("n3");
    expect(keyOf(neg(x))).toBe("*(n-1,sx)");
    expect(keyOf(neg(neg(x)))).toBe("sx");
    expect(keyOf(neg(mul(num(2), x)))).toBe("*(n-2,sx)");
    expect(keyOf(neg(mul(x, y)))).toBe("*(n-1,sx,sy)");
    expect(keyOf(neg(add(x, y)))).toBe("*(n-1,+(sx,sy))");
  });

  it("validates symbols, functions and arity", () => {
    expect(() => sym("2x")).toThrow(AstError);
    expect(() => sym("")).toThrow(AstError);
    expect(() => call("nope", [x])).toThrow(/unknown function/);
    expect(() => call("sin", [])).toThrow(/sin expects 1 argument, got 0/);
    expect(() => call("log", [x, y, x])).toThrow(/log expects 1 to 2 arguments/);
    expect(() => call("min", [x])).toThrow(/at least 2/);
    expect(call("max", [x, y, num(1), num(2)]).args).toHaveLength(4);
  });

  it("keeps relations at the top level", () => {
    const r = rel("=", x, y);
    expect(() => add(r, x)).toThrow(/relation/);
    expect(() => mul(x, r)).toThrow(/relation/);
    expect(() => pow(r, x)).toThrow(/relation/);
    expect(() => call("sin", [r])).toThrow(/relation/);
    expect(() => rel("<", r, x)).toThrow(/relation/);
    expect(() => neg(r)).toThrow(/relation/);
  });

  it("freezes every node", () => {
    const e = add(x, mul(num(2), y));
    expect(Object.isFrozen(e)).toBe(true);
    expect(Object.isFrozen(children(e))).toBe(true);
    expect(Object.isFrozen(children(e)[1])).toBe(true);
  });
});

describe("structural identity", () => {
  it("compares structure, not object identity", () => {
    expect(equals(add(x, num(1)), add(sym("x"), num(1)))).toBe(true);
    expect(equals(add(x, num(1)), add(num(1), x))).toBe(false);
    expect(equals(num("1.0"), num(1))).toBe(false);
    expect(equals(call("log", [x]), call("log", [x, num(10)]))).toBe(false);
    expect(equals(rel("<", x, y), rel("<=", x, y))).toBe(false);
  });

  it("hashes equal trees equally and different trees differently", () => {
    const a = pow(add(x, num(1)), num(2));
    const b = pow(add(sym("x"), num(1)), num(2));
    expect(hashOf(a)).toBe(hashOf(b));
    expect(hashOf(a)).toMatch(/^[0-9a-f]{14}$/);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(hashOf(add(x, num(i))));
    expect(seen.size).toBe(2000);
  });

  it("measures size, depth and free symbols", () => {
    const e = add(mul(num(2), x), call("sin", [y]), num(1));
    expect(size(e)).toBe(7);
    expect(depth(e)).toBe(3);
    expect(symbols(e)).toEqual(["x", "y"]);
  });
});

describe("JSON", () => {
  it("serializes deterministically", () => {
    expect(toJSON(add(x, num(1)))).toBe('{"type":"add","terms":[{"type":"sym","name":"x"},{"type":"num","value":"1"}]}');
  });

  it("rejects malformed documents", () => {
    expect(() => fromJSON('{"type":"num","value":"007"}')).toThrow(/not normalized/);
    expect(() => fromJSON('{"type":"add","terms":[{"type":"num","value":"1"}]}')).toThrow(/at least 2/);
    expect(() =>
      fromJSON('{"type":"add","terms":[{"type":"sym","name":"x"},{"type":"add","terms":[{"type":"sym","name":"y"},{"type":"sym","name":"z"}]}]}')
    ).toThrow(/flat/);
    expect(() => fromJSON('{"type":"call","name":"sin","args":[]}')).toThrow(/expects/);
    expect(() => fromJSON('{"type":"wat"}')).toThrow(/unknown expression type/);
    expect(() => fromJSON('{"type":"pow","base":{"type":"sym","name":"x"}}')).toThrow(/missing "exp"/);
    expect(() => fromJSON("[1,2]")).toThrow(/object/);
    expect(() => fromJSON('{"type":"rel","op":"~","lhs":{"type":"sym","name":"x"},"rhs":{"type":"sym","name":"y"}}')).toThrow(
      /unknown relation/
    );
  });

  it("refuses absurdly deep documents", () => {
    let doc = '{"type":"sym","name":"x"}';
    for (let i = 0; i < 1100; i++) doc = `{"type":"call","name":"sin","args":[${doc}]}`;
    expect(() => fromJSON(doc)).toThrow(/nested too deeply/);
  });
});
