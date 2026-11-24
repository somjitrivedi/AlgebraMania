import { describe, expect, it } from "vitest";
import { add, call, mul, neg, num, pow, sym } from "../src/core/ast.js";
import { parse } from "../src/core/parser.js";
import { toLatex, symbolLatex } from "../src/core/print/latex.js";
import { minusForm, toText } from "../src/core/print/text.js";
import { toTree } from "../src/core/print/tree.js";

const x = sym("x");
const y = sym("y");

describe("text printer", () => {
  it.each([
    ["2x^2 - 3x + 1", "2x^2 - 3x + 1"],
    ["x+1", "x + 1"],
    ["-x^2", "-x^2"],
    ["a - b - c", "a - b - c"],
    ["a - (b - c)", "a - (b - c)"],
    ["-(a + b)", "-(a + b)"],
    ["1/2x", "1/2*x"],
    ["x/y", "x/y"],
    ["x/(y z)", "x/(y*z)"],
    ["1/x", "1/x"],
    ["1/x*y", "1/x*y"],
    ["-1/x", "-1/x"],
    ["x^-2", "x^(-2)"],
    ["2^3^2", "2^(3^2)"],
    ["(2^3)^2", "(2^3)^2"],
    ["(-2)^x", "(-2)^x"],
    ["2.5^x", "2.5^x"],
    ["x^(1/2)", "x^(1/2)"],
    ["(x+1)(x-1)", "(x + 1)*(x - 1)"],
    ["x y", "x*y"],
    ["2 sin(x)", "2sin(x)"],
    ["sin(x)^2 + cos(x)^2 = 1", "sin(x)^2 + cos(x)^2 = 1"],
    ["sqrt(x)/(x+1)", "sqrt(x)/(x + 1)"],
    ["e^(-x^2/2)", "e^(-x^2/2)"],
    ["5!", "factorial(5)"],
    ["log(2,8)", "log(2, 8)"],
    ["-2*3", "-2*3"],
    ["x*(-1)*y", "x*(-1)*y"],
    ["−x × y ÷ z", "-x*y/z"],
    ["π r^2", "pi*r^2"],
    ["x^2 >= 4", "x^2 >= 4"],
    ["1.500", "1.5"],
    ["a/b^2", "a/b^2"]
  ])("%s -> %s", (input, want) => {
    expect(toText(parse(input))).toBe(want);
  });

  it("prints trees that the parser cannot produce directly", () => {
    expect(toText(mul(num(1), pow(x, num(-1))))).toBe("1*x^(-1)");
    expect(toText(mul(num(-1), num(3)))).toBe("-1*3");
    expect(toText(add(x, mul(num(-1), num(3))))).toBe("x + -1*3");
    expect(toText(mul(x, num(-2)))).toBe("x*(-2)");
    expect(toText(pow(pow(x, num(-1)), num(2)))).toBe("(1/x)^2");
    expect(toText(pow(x, pow(y, num(-1))))).toBe("x^(1/y)");
    expect(toText(mul(x, pow(pow(y, num(-1)), num(-1))))).toBe("x/y^(-1)");
    expect(toText(add(num(-3), x))).toBe("-3 + x");
    expect(toText(neg(call("sin", [x])))).toBe("-sin(x)");
  });

  it("finds the positive form of a negative-looking term", () => {
    expect(minusForm(num(-3))).toEqual(num(3));
    expect(toText(minusForm(neg(mul(x, y)))!)).toBe("x*y");
    expect(toText(minusForm(mul(num(-2), x))!)).toBe("2x");
    expect(minusForm(mul(num(-1), num(3)))).toBeNull();
    expect(minusForm(x)).toBeNull();
    expect(minusForm(mul(x, num(-1)))).toBeNull();
  });
});

describe("latex printer", () => {
  it.each([
    ["2x^2 - 3x + 1", "2 x^{2} - 3 x + 1"],
    ["1/2x", "\\frac{x}{2}"],
    ["x/y", "\\frac{x}{y}"],
    ["-x/y", "-\\frac{x}{y}"],
    ["1/x", "\\frac{1}{x}"],
    ["(x+1)/(x-1)", "\\frac{x + 1}{x - 1}"],
    ["x^-2", "x^{-2}"],
    ["x/y^2", "\\frac{x}{y^{2}}"],
    ["x y^-3", "\\frac{x}{y^{3}}"],
    ["2^3^2", "2^{3^{2}}"],
    ["(x^2)^3", "\\left(x^{2}\\right)^{3}"],
    ["(x+1)^2", "\\left(x + 1\\right)^{2}"],
    ["(-2)^x", "\\left(-2\\right)^{x}"],
    ["(x+1)(x-1)", "\\left(x + 1\\right) \\left(x - 1\\right)"],
    ["2*3", "2 \\cdot 3"],
    ["x*2", "x \\cdot 2"],
    ["x*(-1)", "x \\cdot \\left(-1\\right)"],
    ["x^(1/2)", "\\sqrt{x}"],
    ["x^(1/3)", "\\sqrt[3]{x}"],
    ["sqrt(x^2 + 1)", "\\sqrt{x^{2} + 1}"],
    ["root(x, 5)", "\\sqrt[5]{x}"],
    ["sin(x)", "\\sin\\left(x\\right)"],
    ["sin(x)^2 + cos(x)^2 = 1", "\\sin^{2}\\left(x\\right) + \\cos^{2}\\left(x\\right) = 1"],
    ["asin(x)", "\\arcsin\\left(x\\right)"],
    ["sech(x)", "\\operatorname{sech}\\left(x\\right)"],
    ["sqrt(x)^3", "\\left(\\sqrt{x}\\right)^{3}"],
    ["exp(x)", "e^{x}"],
    ["e^(-x^2/2)", "e^{-\\frac{x^{2}}{2}}"],
    ["ln(x)", "\\ln\\left(x\\right)"],
    ["log(x)", "\\log\\left(x\\right)"],
    ["log(2, x)", "\\log_{2}\\left(x\\right)"],
    ["abs(x - 1)", "\\left|x - 1\\right|"],
    ["abs(x)^2", "\\left|x\\right|^{2}"],
    ["floor(x)", "\\left\\lfloor x \\right\\rfloor"],
    ["ceil(x)", "\\left\\lceil x \\right\\rceil"],
    ["n!", "n!"],
    ["(n + 1)!", "\\left(n + 1\\right)!"],
    ["min(x, y)", "\\min\\left(x, y\\right)"],
    ["pi r^2", "\\pi r^{2}"],
    ["theta + alpha_1", "\\theta + \\alpha_{1}"],
    ["x <= y", "x \\le y"],
    ["x != y", "x \\ne y"],
    ["x >= y", "x \\ge y"],
    ["a - (b - c)", "a - \\left(b - c\\right)"],
    ["oo", "\\infty"]
  ])("%s -> %s", (input, want) => {
    expect(toLatex(parse(input))).toBe(want);
  });

  it("renders symbol names", () => {
    expect(symbolLatex("x")).toBe("x");
    expect(symbolLatex("x1")).toBe("x_{1}");
    expect(symbolLatex("x_12")).toBe("x_{12}");
    expect(symbolLatex("Omega")).toBe("\\Omega");
    expect(symbolLatex("speed")).toBe("\\mathrm{speed}");
    expect(symbolLatex("v_max")).toBe("v_{max}");
    expect(symbolLatex("_tmp")).toBe("\\mathrm{\\_tmp}");
  });
});

describe("tree printer", () => {
  it("draws the tree with box characters", () => {
    expect(toTree(parse("2x^2 + sin(y)"))).toBe(
      [
        "add",
        "├─ mul",
        "│  ├─ num 2",
        "│  └─ pow",
        "│     ├─ sym x",
        "│     └─ num 2",
        "└─ call sin",
        "   └─ sym y"
      ].join("\n")
    );
  });

  it("labels relations and leaves", () => {
    expect(toTree(parse("x = 1"))).toBe(["rel =", "├─ sym x", "└─ num 1"].join("\n"));
    expect(toTree(num(3))).toBe("num 3");
  });
});
