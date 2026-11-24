import { describe, expect, it } from "vitest";
import { keyOf } from "../src/core/ast.js";
import { ParseError, formatParseError } from "../src/core/errors.js";
import { MAX_INPUT_LENGTH, parse, tryParse } from "../src/core/parser.js";

describe("parse structure", () => {
  it.each([
    ["42", "n42"],
    ["x", "sx"],
    ["x + 1", "+(sx,n1)"],
    ["x - 1", "+(sx,n-1)"],
    ["1 - x", "+(n1,*(n-1,sx))"],
    ["-x", "*(n-1,sx)"],
    ["--x", "sx"],
    ["+x", "sx"],
    ["3 - -x", "+(n3,sx)"],
    ["a - b - c", "+(sa,*(n-1,sb),*(n-1,sc))"],
    ["a - (b - c)", "+(sa,*(n-1,+(sb,*(n-1,sc))))"],
    ["(a + b) + c", "+(sa,sb,sc)"],
    ["2x", "*(n2,sx)"],
    ["2 x", "*(n2,sx)"],
    ["2 3", "*(n2,n3)"],
    ["2x^2", "*(n2,^(sx,n2))"],
    ["-2x^2", "*(n-2,^(sx,n2))"],
    ["-x^2", "*(n-1,^(sx,n2))"],
    ["(-x)^2", "^(*(n-1,sx),n2)"],
    ["-2^2", "*(n-1,^(n2,n2))"],
    ["(-2)^2", "^(n-2,n2)"],
    ["2^3^2", "^(n2,^(n3,n2))"],
    ["(2^3)^2", "^(^(n2,n3),n2)"],
    ["x^-2", "^(sx,n-2)"],
    ["2^-x^2", "^(n2,*(n-1,^(sx,n2)))"],
    ["x**y", "^(sx,sy)"],
    ["x/y", "*(sx,^(sy,n-1))"],
    ["1/x", "^(sx,n-1)"],
    ["(1)/x", "^(sx,n-1)"],
    ["1/2x", "*(^(n2,n-1),sx)"],
    ["1/(2x)", "^(*(n2,sx),n-1)"],
    ["x/y/z", "*(sx,^(sy,n-1),^(sz,n-1))"],
    ["x/-y", "*(sx,^(*(n-1,sy),n-1))"],
    ["x * -y", "*(sx,n-1,sy)"],
    ["x y", "*(sx,sy)"],
    ["xy", "sxy"],
    ["x(y)", "*(sx,sy)"],
    ["2(x + 1)", "*(n2,+(sx,n1))"],
    ["(x + 1)(x - 1)", "*(+(sx,n1),+(sx,n-1))"],
    ["(((x)))", "sx"],
    ["1.50x", "*(n1.5,sx)"],
    ["pi r^2", "*(spi,^(sr,n2))"],
    ["e^x", "^(se,sx)"],
    ["sin(x)", "fsin(sx)"],
    ["sin(x)cos(x)", "*(fsin(sx),fcos(sx))"],
    ["2sin(x)", "*(n2,fsin(sx))"],
    ["sin(x)^2", "^(fsin(sx),n2)"],
    ["sin x(y)", ""],
    ["sqrt(x)/2", "*(fsqrt(sx),^(n2,n-1))"],
    ["arcsin(x)", "fasin(sx)"],
    ["log(2, 8)", "flog(n2,n8)"],
    ["min(x, y, z)", "fmin(sx,sy,sz)"],
    ["5!", "ffactorial(n5)"],
    ["n!!", "ffactorial(ffactorial(sn))"],
    ["x^2!", "^(sx,ffactorial(n2))"],
    ["-3!", "*(n-1,ffactorial(n3))"],
    ["(x + 1)!", "ffactorial(+(sx,n1))"],
    ["x = 1", "r=(sx,n1)"],
    ["x^2 >= 4", "r>=(^(sx,n2),n4)"],
    ["x ≠ y", "r!=(sx,sy)"],
    ["2x + 1 < 3x == 0", ""],
    ["−x × y ÷ z", "*(n-1,sx,sy,^(sz,n-1))"],
    ["π θ", "*(spi,stheta)"]
  ].filter(([, key]) => key !== ""))("%s", (input, key) => {
    expect(keyOf(parse(input))).toBe(key);
  });

  it("parses long flat sums without deep recursion", () => {
    const input = Array.from({ length: 3000 }, (_, i) => `x${i % 10}`).join("+");
    expect(input.length).toBeLessThanOrEqual(MAX_INPUT_LENGTH);
    const e = parse(input);
    expect(e.type).toBe("add");
    expect(e.type === "add" && e.terms.length).toBe(3000);
  });

  it("accepts nesting up to the limit", () => {
    expect(keyOf(parse("(".repeat(200) + "x" + ")".repeat(200)))).toBe("sx");
  });
});

describe("parse errors", () => {
  it.each([
    ["", "empty expression", 0, 0],
    ["   ", "empty expression", 0, 0],
    ["2 +", "unexpected end of input; expected an operand", 3, 3],
    ["x ^", "unexpected end of input; expected an operand", 3, 3],
    ["(x + 1", 'missing ")" to close this "("', 0, 1],
    ["x + 1)", 'unmatched ")"', 5, 6],
    ["2 3 )", 'unmatched ")"', 4, 5],
    ["()", 'unexpected ")"; expected an operand', 1, 2],
    ["sin x", '"sin" is a function; write sin(...)', 0, 3],
    ["sin x(y)", '"sin" is a function; write sin(...)', 0, 3],
    ["sin()", "sin expects 1 argument, got 0", 0, 5],
    ["log(1, 2, 3)", "log expects 1 to 2 arguments, got 3", 0, 12],
    ["min(x)", "min expects at least 2 arguments, got 1", 0, 6],
    ["sin(x", 'missing ")" to close sin(', 3, 4],
    ["max(x = y)", 'expected "," or ")" but found "="', 6, 7],
    ["f(x = 1)", 'expected ")" but found "="', 4, 5],
    ["x = y = z", "chained relations are not supported", 6, 7],
    ["2x + 1 < 3x == 0", "chained relations are not supported", 12, 14],
    ["x * * y", 'unexpected "*"; expected an operand', 4, 5],
    ["= x", 'unexpected "="; expected an operand', 0, 1],
    ["!x", 'unexpected "!"; expected an operand', 0, 1],
    ["x, y", 'unexpected ","', 1, 2],
    ["1.", "expected digits after the decimal point", 0, 2]
  ])("%j", (input, message, start, end) => {
    const result = tryParse(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(message);
    expect([result.error.start, result.error.end]).toEqual([start, end]);
  });

  it("limits input length", () => {
    const input = "x+".repeat(MAX_INPUT_LENGTH / 2) + "x";
    expect(() => parse(input)).toThrow(`input is longer than ${MAX_INPUT_LENGTH} characters`);
  });

  it("limits nesting depth instead of overflowing the stack", () => {
    expect(() => parse("(".repeat(4000) + "x" + ")".repeat(4000))).toThrow("expression is nested too deeply");
    expect(() => parse("-".repeat(9000) + "x")).toThrow("expression is nested too deeply");
    expect(() => parse("x^".repeat(4900) + "x")).toThrow("expression is nested too deeply");
    expect(() => parse("sin(".repeat(1500) + "x" + ")".repeat(1500))).toThrow("expression is nested too deeply");
  });

  it("returns errors from tryParse and throws them from parse", () => {
    expect(() => parse("(")).toThrow(ParseError);
    const ok = tryParse("x");
    expect(ok.ok && keyOf(ok.expr)).toBe("sx");
  });

  it("formats errors with a caret under the problem", () => {
    const input = "2 + sin x";
    const result = tryParse(input);
    if (result.ok) throw new Error("expected failure");
    expect(formatParseError(input, result.error)).toBe(
      ['error: "sin" is a function; write sin(...)', "  2 + sin x", "      ^^^"].join("\n")
    );
    const eof = tryParse("2 +");
    if (eof.ok) throw new Error("expected failure");
    expect(formatParseError("2 +", eof.error).split("\n")[2]).toBe("     ^");
  });
});
