import { ParseError } from "./errors.js";
import { normalizeNumeral } from "./numeral.js";
import { IDENTIFIER_ALIASES, UNICODE_IDENTIFIERS } from "./symbols.js";

export type TokenKind = "num" | "ident" | "op" | "lparen" | "rparen" | "comma" | "eof";

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const UNICODE_OPERATORS: ReadonlyMap<string, string> = new Map([
  ["−", "-"],
  ["–", "-"],
  ["×", "*"],
  ["·", "*"],
  ["⋅", "*"],
  ["∗", "*"],
  ["÷", "/"],
  ["≤", "<="],
  ["≥", ">="],
  ["≠", "!="]
]);

const SINGLE = new Set(["+", "-", "*", "/", "^", "="]);

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

function isIdentStart(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_");
}

function isIdentPart(ch: string | undefined): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, text: string, start: number, end: number): void => {
    tokens.push({ kind, text, start, end });
  };
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === " ") {
      i++;
      continue;
    }
    const start = i;
    if (isDigit(ch) || (ch === "." && isDigit(input[i + 1]))) {
      while (isDigit(input[i])) i++;
      if (input[i] === ".") {
        i++;
        if (!isDigit(input[i])) throw new ParseError("expected digits after the decimal point", start, i);
        while (isDigit(input[i])) i++;
        if (input[i] === "." && (isDigit(input[i + 1]) || input[i + 1] === ".")) {
          let j = i + 1;
          while (isDigit(input[j]) || input[j] === ".") j++;
          throw new ParseError("malformed number", start, j);
        }
      }
      const raw = input.slice(start, i);
      push("num", normalizeNumeral(raw.startsWith(".") ? "0" + raw : raw), start, i);
      continue;
    }
    if (isIdentStart(ch)) {
      while (isIdentPart(input[i])) i++;
      const word = input.slice(start, i);
      push("ident", IDENTIFIER_ALIASES.get(word) ?? word, start, i);
      continue;
    }
    const unicodeIdent = UNICODE_IDENTIFIERS.get(ch);
    if (unicodeIdent !== undefined) {
      i++;
      push("ident", unicodeIdent, start, i);
      continue;
    }
    const unicodeOp = UNICODE_OPERATORS.get(ch);
    if (unicodeOp !== undefined) {
      i++;
      push("op", unicodeOp, start, i);
      continue;
    }
    const two = input.slice(i, i + 2);
    if (two === "**") {
      i += 2;
      push("op", "^", start, i);
      continue;
    }
    if (two === "<=" || two === ">=" || two === "!=") {
      i += 2;
      push("op", two, start, i);
      continue;
    }
    if (two === "==") {
      i += 2;
      push("op", "=", start, i);
      continue;
    }
    if (ch === "<" || ch === ">" || ch === "!" || SINGLE.has(ch)) {
      i++;
      push("op", ch, start, i);
      continue;
    }
    if (ch === "(") {
      i++;
      push("lparen", ch, start, i);
      continue;
    }
    if (ch === ")") {
      i++;
      push("rparen", ch, start, i);
      continue;
    }
    if (ch === ",") {
      i++;
      push("comma", ch, start, i);
      continue;
    }
    const cp = input.codePointAt(i)!;
    const width = cp > 0xffff ? 2 : 1;
    throw new ParseError(`unexpected character "${String.fromCodePoint(cp)}"`, start, start + width);
  }
  push("eof", "", input.length, input.length);
  return tokens;
}
