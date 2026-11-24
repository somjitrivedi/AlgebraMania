import { describe, expect, it } from "vitest";
import { EvaluationError, evaluate } from "../src/core/numeric.js";
import { parse } from "../src/core/parser.js";

const at = (input: string, env: Record<string, number> = {}): number => evaluate(parse(input), env);

describe("numeric evaluation", () => {
  it("evaluates arithmetic and precedence", () => {
    expect(at("2 + 3*4")).toBe(14);
    expect(at("2^3^2")).toBe(512);
    expect(at("-2^2")).toBe(-4);
    expect(at("1/2x", { x: 4 })).toBe(2);
    expect(at("x/y/z", { x: 12, y: 2, z: 3 })).toBe(2);
  });

  it("knows constants and functions", () => {
    expect(at("pi")).toBeCloseTo(Math.PI, 15);
    expect(at("e")).toBeCloseTo(Math.E, 15);
    expect(at("sin(pi/2)")).toBeCloseTo(1, 15);
    expect(at("log(2, 8)")).toBeCloseTo(3, 14);
    expect(at("ln(e^3)")).toBeCloseTo(3, 14);
    expect(at("root(27, 3)")).toBeCloseTo(3, 14);
    expect(at("sec(0) + csc(pi/2) + cot(pi/4)")).toBeCloseTo(3, 14);
    expect(at("min(3, 1, 2) + max(3, 1, 2)")).toBe(4);
    expect(at("abs(-3) + floor(2.7) + ceil(2.1) + sign(-5)")).toBe(7);
  });

  it("computes factorials, including non-integers through gamma", () => {
    expect(at("5!")).toBe(120);
    expect(at("0!")).toBe(1);
    expect(at("0.5!")).toBeCloseTo(Math.sqrt(Math.PI) / 2, 12);
    expect(at("(-1)!")).toBeNaN();
  });

  it("takes real odd roots of negative numbers and rejects even ones", () => {
    expect(at("(-8)^(1/3)")).toBeCloseTo(-2, 14);
    expect(at("(-8)^(1/2)")).toBeNaN();
    expect(at("root(-32, 5)")).toBeCloseTo(-2, 14);
  });

  it("refuses unknown symbols and relations", () => {
    expect(() => at("x + 1")).toThrow(EvaluationError);
    expect(() => at("x = 1", { x: 1 })).toThrow(/relation/);
  });
});
