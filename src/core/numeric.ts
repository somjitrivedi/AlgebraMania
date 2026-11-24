import type { Expr } from "./ast.js";

export type Environment = Readonly<Record<string, number>>;

const CONSTANT_VALUES: Readonly<Record<string, number>> = {
  pi: Math.PI,
  e: Math.E,
  inf: Number.POSITIVE_INFINITY
};

export class EvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationError";
  }
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
];

function gamma(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  const z = x - 1;
  let a = LANCZOS[0]!;
  const t = z + 7.5;
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i]! / (z + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a;
}

function factorial(n: number): number {
  if (Number.isInteger(n)) {
    if (n < 0) return Number.NaN;
    let r = 1;
    for (let k = 2; k <= n; k++) r *= k;
    return r;
  }
  return gamma(n + 1);
}

function power(b: number, e: number): number {
  if (b < 0 && !Number.isInteger(e)) {
    const r = 1 / e;
    if (Number.isInteger(r) && Math.abs(r) % 2 === 1) return -Math.pow(-b, e);
    return Number.NaN;
  }
  return Math.pow(b, e);
}

const UNARY: Readonly<Record<string, (x: number) => number>> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (x) => 1 / Math.tan(x),
  sec: (x) => 1 / Math.cos(x),
  csc: (x) => 1 / Math.sin(x),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  acot: (x) => Math.atan(1 / x),
  asec: (x) => Math.acos(1 / x),
  acsc: (x) => Math.asin(1 / x),
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  coth: (x) => 1 / Math.tanh(x),
  sech: (x) => 1 / Math.cosh(x),
  csch: (x) => 1 / Math.sinh(x),
  asinh: Math.asinh,
  acosh: Math.acosh,
  atanh: Math.atanh,
  exp: Math.exp,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
  factorial
};

export function evaluate(e: Expr, env: Environment = {}): number {
  switch (e.type) {
    case "num":
      return Number(e.value);
    case "sym": {
      if (Object.hasOwn(env, e.name)) return env[e.name]!;
      if (Object.hasOwn(CONSTANT_VALUES, e.name)) return CONSTANT_VALUES[e.name]!;
      throw new EvaluationError(`no value for symbol "${e.name}"`);
    }
    case "add":
      return e.terms.reduce((s, t) => s + evaluate(t, env), 0);
    case "mul":
      return e.factors.reduce((p, f) => p * evaluate(f, env), 1);
    case "pow":
      return power(evaluate(e.base, env), evaluate(e.exp, env));
    case "rel":
      throw new EvaluationError("cannot evaluate a relation to a number");
    case "call": {
      const args = e.args.map((a) => evaluate(a, env));
      switch (e.name) {
        case "log":
          return args.length === 1 ? Math.log(args[0]!) : Math.log(args[1]!) / Math.log(args[0]!);
        case "root":
          return power(args[0]!, 1 / args[1]!);
        case "min":
          return Math.min(...args);
        case "max":
          return Math.max(...args);
        default: {
          const f = UNARY[e.name];
          if (f === undefined) throw new EvaluationError(`no numeric implementation for "${e.name}"`);
          return f(args[0]!);
        }
      }
    }
  }
}
