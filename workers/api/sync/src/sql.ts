/**
 * SQL plumbing shared by the D1 targets: statements with bound parameters and a splitter for
 * migration files.
 */

export type SqlValue = string | number | null;

export interface Stmt {
  sql: string;
  params: SqlValue[];
}

export const stmt = (sql: string, ...params: SqlValue[]): Stmt => ({ sql, params });

/** Where the D1 sync reads and writes. */
export interface SqlTarget {
  readonly name: string;
  /** One read query with bound parameters. */
  all<T extends Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /**
   * Run the statements in order. Locally a group is one transaction (D1 batch); remotely each
   * statement is one request.
   */
  write(groups: readonly (readonly Stmt[])[]): Promise<void>;
  close(): Promise<void>;
}

/** Split a .sql file into statements: `;` ends a statement outside quotes and comments. */
export function splitSql(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let quote: string | null = null;
  while (i < text.length) {
    const ch = text[i] as string;
    const next = text[i + 1];
    if (quote !== null) {
      cur += ch;
      if (ch === quote) {
        if (next === quote) {
          cur += next;
          i += 2;
          continue;
        }
        quote = null;
      }
      i++;
      continue;
    }
    if (ch === "-" && next === "-") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end + 1;
      cur += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      cur += " ";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    if (ch === ";") {
      if (cur.trim().length > 0) out.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.trim().length > 0) out.push(cur.trim());
  return out;
}
