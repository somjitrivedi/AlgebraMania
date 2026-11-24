export class ParseError extends Error {
  readonly start: number;
  readonly end: number;

  constructor(message: string, start: number, end: number) {
    super(message);
    this.name = "ParseError";
    this.start = start;
    this.end = Math.max(end, start);
  }
}

export class AstError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AstError";
  }
}

export function formatParseError(input: string, error: ParseError): string {
  const shown = input.replace(/[\r\n\t]/g, " ");
  const start = Math.min(error.start, shown.length);
  const width = Math.max(1, Math.min(error.end, shown.length + 1) - start);
  return `error: ${error.message}\n  ${shown}\n  ${" ".repeat(start)}${"^".repeat(width)}`;
}
