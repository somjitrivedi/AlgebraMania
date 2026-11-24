import { add, call, mul, neg, num, pow, sym, type Expr } from "../src/core/ast.js";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Random {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  float(): number {
    return this.next();
  }

  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

const NUMERALS = ["0", "1", "2", "3", "7", "10", "-1", "-2", "-7", "0.5", "2.25", "-0.5", "-3.75", "100"];
const NAMES = ["x", "y", "z", "a", "theta", "pi", "e", "x1", "r_0"];
const UNARY_FUNCS = ["sin", "cos", "ln", "sqrt", "exp", "abs", "atan", "factorial"];

export function randomLeaf(r: Random): Expr {
  return r.chance(0.5) ? num(r.pick(NUMERALS)) : sym(r.pick(NAMES));
}

export function randomExpr(r: Random, budget: number): Expr {
  if (budget <= 0 || r.chance(0.15)) return randomLeaf(r);
  const sub = (): Expr => randomExpr(r, budget - 1);
  const kind = r.pick(["add", "mul", "pow", "neg", "call", "recip", "log", "minmax"] as const);
  switch (kind) {
    case "add":
      return add(...Array.from({ length: r.int(2, 4) }, sub));
    case "mul":
      return mul(...Array.from({ length: r.int(2, 4) }, sub));
    case "pow":
      return pow(sub(), r.chance(0.3) ? num(r.pick(["-1", "-2", "2", "0.5"])) : sub());
    case "neg":
      return neg(sub());
    case "call":
      return call(r.pick(UNARY_FUNCS), [sub()]);
    case "recip":
      return pow(sub(), num(-1));
    case "log":
      return call("log", r.chance(0.5) ? [sub()] : [sub(), sub()]);
    case "minmax":
      return call(r.pick(["min", "max"]), Array.from({ length: r.int(2, 3) }, sub));
  }
}

export const n = num;
export const s = sym;
