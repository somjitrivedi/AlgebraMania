import { describe, expect, it } from "vitest";
import { ParseError } from "../src/core/errors.js";
import { tokenize } from "../src/core/lexer.js";

function texts(input: string): string[] {
  return tokenize(input)
    .filter((t) => t.kind !== "eof")
    .map((t) => `${t.kind}:${t.text}`);
}

describe("tokenize", () => {
  it("splits operators, numbers, identifiers and punctuation", () => {
    expect(texts("2x^2 + sin(y, 3.5)")).toEqual([
      "num:2",
      "ident:x",
      "op:^",
      "num:2",
      "op:+",
      "ident:sin",
      "lparen:(",
      "ident:y",
      "comma:,",
      "num:3.5",
      "rparen:)"
    ]);
  });

  it("records source positions", () => {
    const [a, b, c] = tokenize("  ab + 12");
    expect([a!.start, a!.end, b!.start, c!.start, c!.end]).toEqual([2, 4, 5, 7, 9]);
    expect(tokenize("x").at(-1)).toMatchObject({ kind: "eof", start: 1, end: 1 });
  });

  it("normalizes numbers", () => {
    expect(texts(".5 007 1.250")).toEqual(["num:0.5", "num:7", "num:1.25"]);
  });

  it("keeps multi-letter identifiers whole", () => {
    expect(texts("xy x_1 theta2")).toEqual(["ident:xy", "ident:x_1", "ident:theta2"]);
  });

  it("maps two-character and alternative operators", () => {
    expect(texts("a**b <= c >= d != e == f")).toEqual([
      "ident:a",
      "op:^",
      "ident:b",
      "op:<=",
      "ident:c",
      "op:>=",
      "ident:d",
      "op:!=",
      "ident:e",
      "op:=",
      "ident:f"
    ]);
  });

  it("maps unicode operators and symbols", () => {
    expect(texts("−x × y ÷ z · w")).toEqual([
      "op:-",
      "ident:x",
      "op:*",
      "ident:y",
      "op:/",
      "ident:z",
      "op:*",
      "ident:w"
    ]);
    expect(texts("π θ ∞ oo")).toEqual(["ident:pi", "ident:theta", "ident:inf", "ident:inf"]);
    expect(texts("a ≤ b ≥ c ≠ d")).toEqual(["ident:a", "op:<=", "ident:b", "op:>=", "ident:c", "op:!=", "ident:d"]);
  });

  it("treats factorial bang separately from not-equals", () => {
    expect(texts("n! != 3")).toEqual(["ident:n", "op:!", "op:!=", "num:3"]);
  });

  it.each([
    ["1.", "expected digits after the decimal point", 0, 2],
    ["1.2.3", "malformed number", 0, 5],
    ["x # y", 'unexpected character "#"', 2, 3],
    ["x $", 'unexpected character "$"', 2, 3],
    ["a \u{1F600}", 'unexpected character "\u{1F600}"', 2, 4]
  ])("rejects %j", (input, message, start, end) => {
    try {
      tokenize(input);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).message).toBe(message);
      expect([(error as ParseError).start, (error as ParseError).end]).toEqual([start, end]);
    }
  });
});
