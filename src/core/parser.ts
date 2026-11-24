import { add, call, mul, neg, num, pow, rel, sym, type Expr, type RelOp } from "./ast.js";
import { ParseError } from "./errors.js";
import { arityText, functionSpec, resolveFunctionName } from "./functions.js";
import { tokenize, type Token } from "./lexer.js";

export const MAX_INPUT_LENGTH = 10000;
export const MAX_NESTING = 250;

const REL_TOKENS = new Set(["=", "!=", "<", "<=", ">", ">="]);

export type ParseResult = { ok: true; expr: Expr } | { ok: false; error: ParseError };

export function parse(input: string): Expr {
  if (input.length > MAX_INPUT_LENGTH) {
    throw new ParseError(`input is longer than ${MAX_INPUT_LENGTH} characters`, MAX_INPUT_LENGTH, input.length);
  }
  return new Parser(tokenize(input)).parseInput();
}

export function tryParse(input: string): ParseResult {
  try {
    return { ok: true, expr: parse(input) };
  } catch (error) {
    if (error instanceof ParseError) return { ok: false, error };
    throw error;
  }
}

function describe(t: Token): string {
  return t.kind === "eof" ? "end of input" : `"${t.text}"`;
}

class Parser {
  private pos = 0;
  private nesting = 0;

  constructor(private readonly tokens: Token[]) {}

  parseInput(): Expr {
    if (this.peek().kind === "eof") throw new ParseError("empty expression", 0, 0);
    const result = this.parseRelation();
    const t = this.peek();
    if (t.kind !== "eof") {
      if (t.kind === "rparen") throw new ParseError('unmatched ")"', t.start, t.end);
      throw new ParseError(`unexpected ${describe(t)}`, t.start, t.end);
    }
    return result;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const t = this.peek();
    if (t.kind !== "eof") this.pos++;
    return t;
  }

  private isOp(text: string): boolean {
    const t = this.peek();
    return t.kind === "op" && t.text === text;
  }

  private enter(t: Token): void {
    this.nesting++;
    if (this.nesting > MAX_NESTING) throw new ParseError("expression is nested too deeply", t.start, t.end);
  }

  private leave(): void {
    this.nesting--;
  }

  private parseRelation(): Expr {
    const lhs = this.parseSum();
    const t = this.peek();
    if (t.kind !== "op" || !REL_TOKENS.has(t.text)) return lhs;
    this.next();
    const rhs = this.parseSum();
    const after = this.peek();
    if (after.kind === "op" && REL_TOKENS.has(after.text)) {
      throw new ParseError("chained relations are not supported", after.start, after.end);
    }
    return rel(t.text as RelOp, lhs, rhs);
  }

  private parseSum(): Expr {
    let left = this.parseProduct();
    for (;;) {
      if (this.isOp("+")) {
        this.next();
        left = add(left, this.parseProduct());
      } else if (this.isOp("-")) {
        this.next();
        left = add(left, neg(this.parseProduct()));
      } else {
        return left;
      }
    }
  }

  private parseProduct(): Expr {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (this.isOp("*")) {
        this.next();
        left = mul(left, this.parseUnary());
      } else if (this.isOp("/")) {
        this.next();
        const divisor = pow(this.parseUnary(), num(-1));
        left = left.type === "num" && left.value === "1" ? divisor : mul(left, divisor);
      } else if (t.kind === "num" || t.kind === "ident" || t.kind === "lparen") {
        left = mul(left, this.parseUnary());
      } else {
        return left;
      }
    }
  }

  private parseUnary(): Expr {
    const t = this.peek();
    this.enter(t);
    try {
      if (this.isOp("-")) {
        this.next();
        return neg(this.parseUnary());
      }
      if (this.isOp("+")) {
        this.next();
        return this.parseUnary();
      }
      return this.parsePower();
    } finally {
      this.leave();
    }
  }

  private parsePower(): Expr {
    const base = this.parsePostfix();
    if (!this.isOp("^")) return base;
    this.next();
    return pow(base, this.parseUnary());
  }

  private parsePostfix(): Expr {
    let e = this.parsePrimary();
    while (this.isOp("!")) {
      this.next();
      e = call("factorial", [e]);
    }
    return e;
  }

  private parsePrimary(): Expr {
    const t = this.next();
    switch (t.kind) {
      case "num":
        return num(t.text);
      case "ident":
        return this.parseIdentifier(t);
      case "lparen": {
        const inner = this.parseSum();
        const close = this.peek();
        if (close.kind !== "rparen") {
          if (close.kind === "eof") throw new ParseError('missing ")" to close this "("', t.start, t.end);
          throw new ParseError(`expected ")" but found ${describe(close)}`, close.start, close.end);
        }
        this.next();
        return inner;
      }
      case "rparen":
        throw new ParseError('unexpected ")"; expected an operand', t.start, t.end);
      case "eof":
        throw new ParseError("unexpected end of input; expected an operand", t.start, t.end);
      default:
        throw new ParseError(`unexpected ${describe(t)}; expected an operand`, t.start, t.end);
    }
  }

  private parseIdentifier(t: Token): Expr {
    const fn = resolveFunctionName(t.text);
    if (fn === null) return sym(t.text);
    if (this.peek().kind !== "lparen") {
      throw new ParseError(`"${t.text}" is a function; write ${t.text}(...)`, t.start, t.end);
    }
    const open = this.next();
    const args: Expr[] = [];
    if (this.peek().kind !== "rparen") {
      for (;;) {
        args.push(this.parseSum());
        const sep = this.peek();
        if (sep.kind === "comma") {
          this.next();
          continue;
        }
        if (sep.kind === "rparen") break;
        if (sep.kind === "eof") throw new ParseError(`missing ")" to close ${t.text}(`, open.start, open.end);
        throw new ParseError(`expected "," or ")" but found ${describe(sep)}`, sep.start, sep.end);
      }
    }
    const close = this.next();
    const spec = functionSpec(fn)!;
    if (args.length < spec.minArgs || args.length > spec.maxArgs) {
      throw new ParseError(`${fn} expects ${arityText(spec)}, got ${args.length}`, t.start, close.end);
    }
    return call(fn, args);
  }
}
