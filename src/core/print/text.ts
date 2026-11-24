import { equals, isNegativeNum, isNum, mul, neg, num, type Expr, type Mul, type Pow } from "../ast.js";
import { negateNumeral } from "../numeral.js";

type Context = "top" | "term" | "first" | "factor" | "divisor" | "base" | "exponent";

export function toText(e: Expr): string {
  return print(e, "top");
}

export function minusForm(e: Expr): Expr | null {
  let candidate: Expr | null = null;
  if (e.type === "num" && isNegativeNum(e)) {
    candidate = num(negateNumeral(e.value));
  } else if (e.type === "mul") {
    const [first, ...rest] = e.factors;
    if (first !== undefined && first.type === "num" && isNegativeNum(first)) {
      candidate = first.value === "-1" ? mul(...rest) : mul(num(negateNumeral(first.value)), ...rest);
    }
  }
  if (candidate === null) return null;
  return equals(neg(candidate), e) ? candidate : null;
}

function isReciprocal(e: Expr): e is Pow {
  return e.type === "pow" && isNum(e.exp, "-1");
}

function print(e: Expr, ctx: Context): string {
  switch (e.type) {
    case "num":
      return isNegativeNum(e) && (ctx === "factor" || ctx === "divisor" || ctx === "base" || ctx === "exponent")
        ? `(${e.value})`
        : e.value;
    case "sym":
      return e.name;
    case "call":
      return `${e.name}(${e.args.map((a) => print(a, "top")).join(", ")})`;
    case "rel": {
      const s = `${print(e.lhs, "top")} ${e.op} ${print(e.rhs, "top")}`;
      return ctx === "top" ? s : `(${s})`;
    }
    case "add": {
      const s = printAdd(e.terms);
      return ctx === "top" ? s : `(${s})`;
    }
    case "mul": {
      if (ctx === "factor" || ctx === "divisor" || ctx === "base" || ctx === "exponent" || ctx === "first") {
        return `(${print(e, "top")})`;
      }
      if (ctx === "top") {
        const positive = minusForm(e);
        if (positive !== null) return "-" + print(positive, positive.type === "add" ? "term" : "top");
      }
      return printMul(e);
    }
    case "pow":
      return printPow(e, ctx);
  }
}

function printAdd(terms: readonly Expr[]): string {
  let out = print(terms[0]!, "top");
  for (let i = 1; i < terms.length; i++) {
    const t = terms[i]!;
    const positive = minusForm(t);
    out += positive !== null ? ` - ${print(positive, "term")}` : ` + ${print(t, "term")}`;
  }
  return out;
}

function juxtaposable(f: Expr): boolean {
  if (f.type === "sym" || f.type === "call") return true;
  return f.type === "pow" && (f.base.type === "sym" || f.base.type === "call") && !isNum(f.exp, "-1");
}

function printMul(e: Mul): string {
  const fs = e.factors;
  const first = fs[0]!;
  let out = print(first, "first");
  for (let i = 1; i < fs.length; i++) {
    const f = fs[i]!;
    const afterLiteralOne = i === 1 && isNum(first, "1");
    if (isReciprocal(f) && !afterLiteralOne) {
      out += "/" + print(f.base, "divisor");
    } else if (i === 1 && first.type === "num" && juxtaposable(f)) {
      out += print(f, "factor");
    } else {
      out += "*" + print(f, "factor");
    }
  }
  return out;
}

function printPow(e: Pow, ctx: Context): string {
  if (ctx === "base" || ctx === "exponent") return `(${printPow(e, "top")})`;
  const slashAllowed = ctx === "top" || ctx === "term" || ctx === "first";
  if (slashAllowed && isNum(e.exp, "-1")) return "1/" + print(e.base, "divisor");
  return `${print(e.base, "base")}^${print(e.exp, "exponent")}`;
}
