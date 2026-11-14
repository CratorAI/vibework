/**
 * Shell-style argument splitting and quoting, for the connector form's
 * single "Arguments" field. No variable expansion or globbing.
 */

/**
 * Split on whitespace, respecting 'single' and "double" quotes and backslash escapes.
 * Throws an Error with a readable message on an unterminated quote.
 */
export function splitShellArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let inToken = false;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quote === "'") {
      if (ch === "'") quote = null;
      else current += ch;
      continue;
    }

    if (quote === '"') {
      if (ch === '"') {
        quote = null;
      } else if (ch === "\\" && i + 1 < input.length && /["\\$`]/.test(input[i + 1])) {
        current += input[++i];
      } else {
        current += ch;
      }
      continue;
    }

    if (/\s/.test(ch)) {
      if (inToken) {
        args.push(current);
        current = "";
        inToken = false;
      }
      continue;
    }

    inToken = true;
    if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === "\\" && i + 1 < input.length) {
      current += input[++i];
    } else {
      current += ch;
    }
  }

  if (quote) {
    throw new Error(`Arguments have an unclosed ${quote === "'" ? "single" : "double"} quote.`);
  }
  if (inToken) args.push(current);
  return args;
}

/** Quote an argument for display only when it needs it. */
export function quoteShellArg(arg: string): string {
  if (arg !== "" && /^[A-Za-z0-9_\-./:=@%+,~]+$/.test(arg)) return arg;
  return `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
}

/** "npx -y @scope/server \"/path with spaces\"" */
export function formatCommandLine(command: string, args: readonly string[]): string {
  return [quoteShellArg(command), ...args.map(quoteShellArg)].join(" ");
}
