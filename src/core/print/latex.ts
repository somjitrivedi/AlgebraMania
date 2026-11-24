import { isNegativeNum, isNum, pow, num, type Call, type Expr, type Mul, type Pow } from "../ast.js";
import { functionSpec } from "../functions.js";
import { isIntegerNumeral, negateNumeral } from "../numeral.js";
import { CONSTANTS, GREEK } from "../symbols.js";
import { minusForm } from "./text.js";

type Context = "top" | "term" | "factor" | "base";

const REL_LATEX: Readonly<Record<string, string>> = {
  "=": "=",
  "!=": "\\ne",
  "<": "<",
  "<=": "\\le",
  ">": ">",
  ">=": "\\ge"
};

export function toLatex(e: Expr): string {
  return lx(e, "top");
}

function paren(s: string): string {
  return `\\left(${s}\\right)`;
}

export function symbolLatex(name: string): string {
  const constant = CONSTANTS.get(name);
  if (constant !== undefined) return constant;
  const greek = GREEK.get(name);
  if (greek !== undefined) return greek;
  const sub = /^([A-Za-z]+)_?(\d+)$/.exec(name);
  if (sub !== null) return `${symbolLatex(sub[1]!)}_{${sub[2]}}`;
  if (name.length === 1) return name;
  if (name.includes("_")) {
    const [head, ...tail] = name.split("_");
    if (head !== undefined && head !== "" && tail.length > 0 && tail.every((p) => p !== "")) {
      return `${symbolLatex(head)}_{${tail.join("\\_")}}`;
    }
  }
  return `\\mathrm{${name.replace(/_/g, "\\_")}}`;
}

function lx(e: Expr, ctx: Context): string {
  switch (e.type) {
    case "num":
      return isNegativeNum(e) && (ctx === "factor" || ctx === "base") ? paren(e.value) : e.value;
    case "sym":
      return symbolLatex(e.name);
    case "call":
      return lxCall(e);
    case "rel":
      return `${lx(e.lhs, "top")} ${REL_LATEX[e.op]} ${lx(e.rhs, "top")}`;
    case "add": {
      let out = lx(e.terms[0]!, "top");
      for (let i = 1; i < e.terms.length; i++) {
        const t = e.terms[i]!;
        const positive = minusForm(t);
        out += positive !== null ? ` - ${lx(positive, "term")}` : ` + ${lx(t, "term")}`;
      }
      return ctx === "top" ? out : paren(out);
    }
    case "mul": {
      return ctx === "factor" || ctx === "base" ? paren(lxMul(e, "top")) : lxMul(e, ctx);
    }
    case "pow":
      return lxPow(e, ctx);
  }
}

function lxMul(e: Mul, ctx: Context): string {
  if (ctx === "top") {
    const positive = minusForm(e);
    if (positive !== null) return "-" + lx(positive, "term");
  }
  const numerator: Expr[] = [];
  const denominator: Expr[] = [];
  for (const f of e.factors) {
    if (f.type === "pow" && f.exp.type === "num" && isNegativeNum(f.exp)) {
      denominator.push(isNum(f.exp, "-1") ? f.base : pow(f.base, num(negateNumeral(f.exp.value))));
    } else {
      numerator.push(f);
    }
  }
  if (denominator.length === 0) return product(numerator);
  const top = numerator.length === 0 ? "1" : product(numerator);
  return `\\frac{${top}}{${product(denominator)}}`;
}

function needsDot(f: Expr, text: string): boolean {
  if (f.type === "num") return true;
  if (f.type === "pow" && f.base.type === "num") return true;
  return /^[0-9.]/.test(text);
}

function product(fs: readonly Expr[]): string {
  if (fs.length === 1) return lx(fs[0]!, "top");
  const parts = fs.map((f, i) => (i === 0 && f.type === "num" && isNegativeNum(f) ? f.value : lx(f, "factor")));
  let out = parts[0]!;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]!;
    out += needsDot(fs[i]!, p) ? ` \\cdot ${p}` : ` ${p}`;
  }
  return out;
}

function rootIndex(exp: Expr): string | null {
  if (exp.type !== "pow" || !isNum(exp.exp, "-1")) return null;
  const b = exp.base;
  if (b.type !== "num" || !isIntegerNumeral(b.value) || isNegativeNum(b) || b.value === "0" || b.value === "1") return null;
  return b.value;
}

function lxPow(e: Pow, ctx: Context): string {
  let s: string;
  const index = rootIndex(e.exp);
  if (isNum(e.exp, "-1")) {
    s = `\\frac{1}{${lx(e.base, "top")}}`;
    return s;
  }
  if (index !== null) {
    s = index === "2" ? `\\sqrt{${lx(e.base, "top")}}` : `\\sqrt[${index}]{${lx(e.base, "top")}}`;
    return s;
  }
  const b = e.base;
  if (b.type === "call" && b.args.length === 1 && e.exp.type === "num" && !isNegativeNum(e.exp) && isIntegerNumeral(e.exp.value)) {
    const spec = functionSpec(b.name);
    if (spec !== undefined && spec.operatorStyle && spec.latex !== null) {
      s = `${spec.latex}^{${e.exp.value}}${paren(lx(b.args[0]!, "top"))}`;
      return ctx === "base" ? paren(s) : s;
    }
  }
  const baseText = b.type === "call" && b.name !== "abs" && b.name !== "floor" && b.name !== "ceil" ? paren(lx(b, "top")) : lx(b, "base");
  s = `${baseText}^{${lx(e.exp, "top")}}`;
  return ctx === "base" ? paren(s) : s;
}

function lxCall(e: Call): string {
  const args = e.args.map((a) => lx(a, "top"));
  const [a0, a1] = args;
  switch (e.name) {
    case "sqrt":
      return `\\sqrt{${a0}}`;
    case "root":
      return `\\sqrt[${a1}]{${a0}}`;
    case "abs":
      return `\\left|${a0}\\right|`;
    case "floor":
      return `\\left\\lfloor ${a0} \\right\\rfloor`;
    case "ceil":
      return `\\left\\lceil ${a0} \\right\\rceil`;
    case "exp":
      return `e^{${a0}}`;
    case "factorial": {
      const inner = e.args[0]!;
      const simple = inner.type === "sym" || (inner.type === "num" && !isNegativeNum(inner));
      return `${simple ? a0 : paren(a0!)}!`;
    }
    case "log":
      if (args.length === 2) return `\\log_{${a0}}${paren(a1!)}`;
      return `\\log${paren(a0!)}`;
    default: {
      const spec = functionSpec(e.name);
      const head = spec?.latex ?? `\\operatorname{${e.name}}`;
      return `${head}${paren(args.join(", "))}`;
    }
  }
}
