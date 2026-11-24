import { AstError } from "./errors.js";
import { arityText, functionSpec } from "./functions.js";
import { cyrb53 } from "./hash.js";
import { isNegativeNumeral, negateNumeral, normalizeNumeral } from "./numeral.js";

export type RelOp = "=" | "!=" | "<" | "<=" | ">" | ">=";

export const REL_OPS: readonly RelOp[] = ["=", "!=", "<", "<=", ">", ">="];

export interface Num {
  readonly type: "num";
  readonly value: string;
}

export interface Sym {
  readonly type: "sym";
  readonly name: string;
}

export interface Add {
  readonly type: "add";
  readonly terms: readonly Expr[];
}

export interface Mul {
  readonly type: "mul";
  readonly factors: readonly Expr[];
}

export interface Pow {
  readonly type: "pow";
  readonly base: Expr;
  readonly exp: Expr;
}

export interface Call {
  readonly type: "call";
  readonly name: string;
  readonly args: readonly Expr[];
}

export interface Rel {
  readonly type: "rel";
  readonly op: RelOp;
  readonly lhs: Expr;
  readonly rhs: Expr;
}

export type Expr = Num | Sym | Add | Mul | Pow | Call | Rel;

export type ExprType = Expr["type"];

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function operand(e: Expr, where: string): Expr {
  if (e.type === "rel") throw new AstError(`a relation cannot appear inside ${where}`);
  return e;
}

export function num(value: string | number | bigint): Num {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new AstError(`num() needs a safe integer or a numeral string, got ${value}`);
  }
  return Object.freeze({ type: "num", value: normalizeNumeral(String(value)) });
}

export function sym(name: string): Sym {
  if (!IDENTIFIER.test(name)) throw new AstError(`invalid symbol name "${name}"`);
  return Object.freeze({ type: "sym", name });
}

export function add(...terms: Expr[]): Expr {
  const flat: Expr[] = [];
  for (const t of terms) {
    operand(t, "a sum");
    if (t.type === "add") flat.push(...t.terms);
    else flat.push(t);
  }
  if (flat.length === 0) return num(0);
  if (flat.length === 1) return flat[0]!;
  return Object.freeze({ type: "add", terms: Object.freeze(flat) });
}

export function mul(...factors: Expr[]): Expr {
  const flat: Expr[] = [];
  for (const f of factors) {
    operand(f, "a product");
    if (f.type === "mul") flat.push(...f.factors);
    else flat.push(f);
  }
  if (flat.length === 0) return num(1);
  if (flat.length === 1) return flat[0]!;
  return Object.freeze({ type: "mul", factors: Object.freeze(flat) });
}

export function pow(base: Expr, exp: Expr): Pow {
  operand(base, "a power");
  operand(exp, "a power");
  return Object.freeze({ type: "pow", base, exp });
}

export function call(name: string, args: readonly Expr[]): Call {
  const s = functionSpec(name);
  if (s === undefined) throw new AstError(`unknown function "${name}"`);
  if (args.length < s.minArgs || args.length > s.maxArgs) {
    throw new AstError(`${name} expects ${arityText(s)}, got ${args.length}`);
  }
  for (const a of args) operand(a, `${name}(...)`);
  return Object.freeze({ type: "call", name, args: Object.freeze([...args]) });
}

export function rel(op: RelOp, lhs: Expr, rhs: Expr): Rel {
  if (!REL_OPS.includes(op)) throw new AstError(`unknown relation "${op}"`);
  operand(lhs, "a relation");
  operand(rhs, "a relation");
  return Object.freeze({ type: "rel", op, lhs, rhs });
}

export function neg(e: Expr): Expr {
  operand(e, "a negation");
  if (e.type === "num") return Object.freeze({ type: "num", value: negateNumeral(e.value) });
  if (e.type === "mul") {
    const [first, ...rest] = e.factors;
    if (first !== undefined && first.type === "num") {
      if (first.value === "-1") return mul(...rest);
      return mul(num(negateNumeral(first.value)), ...rest);
    }
  }
  return mul(num(-1), e);
}

export function isNum(e: Expr, value?: string): boolean {
  return e.type === "num" && (value === undefined || e.value === value);
}

export function isNegativeNum(e: Expr): boolean {
  return e.type === "num" && isNegativeNumeral(e.value);
}

export function children(e: Expr): readonly Expr[] {
  switch (e.type) {
    case "num":
    case "sym":
      return [];
    case "add":
      return e.terms;
    case "mul":
      return e.factors;
    case "pow":
      return [e.base, e.exp];
    case "call":
      return e.args;
    case "rel":
      return [e.lhs, e.rhs];
  }
}

export function equals(a: Expr, b: Expr): boolean {
  if (a === b) return true;
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "num":
      return a.value === (b as Num).value;
    case "sym":
      return a.name === (b as Sym).name;
    case "pow":
      return equals(a.base, (b as Pow).base) && equals(a.exp, (b as Pow).exp);
    case "rel": {
      const r = b as Rel;
      return a.op === r.op && equals(a.lhs, r.lhs) && equals(a.rhs, r.rhs);
    }
    case "call":
      return a.name === (b as Call).name && sameList(a.args, (b as Call).args);
    case "add":
      return sameList(a.terms, (b as Add).terms);
    case "mul":
      return sameList(a.factors, (b as Mul).factors);
  }
}

function sameList(xs: readonly Expr[], ys: readonly Expr[]): boolean {
  if (xs.length !== ys.length) return false;
  for (let i = 0; i < xs.length; i++) if (!equals(xs[i]!, ys[i]!)) return false;
  return true;
}

const keyCache = new WeakMap<Expr, string>();
const hashCache = new WeakMap<Expr, string>();

export function keyOf(e: Expr): string {
  const cached = keyCache.get(e);
  if (cached !== undefined) return cached;
  let key: string;
  switch (e.type) {
    case "num":
      key = `n${e.value}`;
      break;
    case "sym":
      key = `s${e.name}`;
      break;
    case "add":
      key = `+(${e.terms.map(keyOf).join(",")})`;
      break;
    case "mul":
      key = `*(${e.factors.map(keyOf).join(",")})`;
      break;
    case "pow":
      key = `^(${keyOf(e.base)},${keyOf(e.exp)})`;
      break;
    case "call":
      key = `f${e.name}(${e.args.map(keyOf).join(",")})`;
      break;
    case "rel":
      key = `r${e.op}(${keyOf(e.lhs)},${keyOf(e.rhs)})`;
      break;
  }
  keyCache.set(e, key);
  return key;
}

export function hashOf(e: Expr): string {
  const cached = hashCache.get(e);
  if (cached !== undefined) return cached;
  const h = cyrb53(keyOf(e));
  hashCache.set(e, h);
  return h;
}

export function size(e: Expr): number {
  let n = 1;
  for (const c of children(e)) n += size(c);
  return n;
}

export function depth(e: Expr): number {
  let d = 0;
  for (const c of children(e)) d = Math.max(d, depth(c));
  return d + 1;
}

export function symbols(e: Expr): string[] {
  const found = new Set<string>();
  const visit = (x: Expr): void => {
    if (x.type === "sym") found.add(x.name);
    for (const c of children(x)) visit(c);
  };
  visit(e);
  return [...found].sort();
}

export function toJSON(e: Expr): string {
  return JSON.stringify(e);
}

const MAX_JSON_DEPTH = 1000;

export function fromJSON(source: unknown): Expr {
  const value: unknown = typeof source === "string" ? JSON.parse(source) : source;
  return build(value, 0);
}

function field(o: Record<string, unknown>, name: string): unknown {
  if (!(name in o)) throw new AstError(`expression node is missing "${name}"`);
  return o[name];
}

function list(o: Record<string, unknown>, name: string, d: number): Expr[] {
  const v = field(o, name);
  if (!Array.isArray(v)) throw new AstError(`"${name}" must be an array`);
  return v.map((x) => build(x, d + 1));
}

function build(value: unknown, d: number): Expr {
  if (d > MAX_JSON_DEPTH) throw new AstError("expression is nested too deeply");
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AstError("expression node must be an object");
  }
  const o = value as Record<string, unknown>;
  const type = field(o, "type");
  switch (type) {
    case "num": {
      const v = field(o, "value");
      if (typeof v !== "string") throw new AstError("num value must be a string");
      const n = num(v);
      if (n.value !== v) throw new AstError(`num value "${v}" is not normalized`);
      return n;
    }
    case "sym": {
      const v = field(o, "name");
      if (typeof v !== "string") throw new AstError("sym name must be a string");
      return sym(v);
    }
    case "add":
    case "mul": {
      const items = list(o, type === "add" ? "terms" : "factors", d);
      if (items.length < 2) throw new AstError(`${type} needs at least 2 operands`);
      if (items.some((x) => x.type === type)) throw new AstError(`${type} must be flat`);
      return type === "add" ? add(...items) : mul(...items);
    }
    case "pow":
      return pow(build(field(o, "base"), d + 1), build(field(o, "exp"), d + 1));
    case "call": {
      const name = field(o, "name");
      if (typeof name !== "string") throw new AstError("call name must be a string");
      return call(name, list(o, "args", d));
    }
    case "rel": {
      const op = field(o, "op");
      if (typeof op !== "string" || !REL_OPS.includes(op as RelOp)) {
        throw new AstError(`unknown relation "${String(op)}"`);
      }
      return rel(op as RelOp, build(field(o, "lhs"), d + 1), build(field(o, "rhs"), d + 1));
    }
    default:
      throw new AstError(`unknown expression type "${String(type)}"`);
  }
}
