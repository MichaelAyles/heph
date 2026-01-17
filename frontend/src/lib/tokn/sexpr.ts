/**
 * Simple S-expression parser for KiCad files.
 */

export type SExpr = string | SExpr[];

/**
 * Parse an S-expression string into a nested array structure.
 */
export function parse(text: string): SExpr {
  const tokens = tokenize(text);
  const [result] = parseTokens(tokens, 0);
  return result;
}

/**
 * Tokenize S-expression text into a list of tokens.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    // Skip whitespace
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    // Parentheses
    if (c === '(') {
      tokens.push('(');
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push(')');
      i++;
      continue;
    }

    // Quoted string
    if (c === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\' && j + 1 < text.length) {
          j += 2; // Skip escaped char
        } else if (text[j] === '"') {
          break;
        } else {
          j++;
        }
      }
      tokens.push(text.slice(i, j + 1)); // Include quotes
      i = j + 1;
      continue;
    }

    // Atom (unquoted token)
    let j = i;
    while (j < text.length && !' \t\n\r()'.includes(text[j])) {
      j++;
    }
    tokens.push(text.slice(i, j));
    i = j;
  }

  return tokens;
}

/**
 * Parse tokens starting at pos, return [result, newPos].
 */
function parseTokens(tokens: string[], pos: number): [SExpr, number] {
  if (pos >= tokens.length) {
    throw new Error('Unexpected end of input');
  }

  const token = tokens[pos];

  if (token === '(') {
    // Parse list
    const result: SExpr[] = [];
    pos++;
    while (pos < tokens.length && tokens[pos] !== ')') {
      const [item, newPos] = parseTokens(tokens, pos);
      result.push(item);
      pos = newPos;
    }
    if (pos >= tokens.length) {
      throw new Error('Missing closing parenthesis');
    }
    return [result, pos + 1]; // Skip ')'
  }

  if (token === ')') {
    throw new Error('Unexpected closing parenthesis');
  }

  // Atom - strip quotes if present
  if (token.startsWith('"') && token.endsWith('"')) {
    // Unescape the string
    let s = token.slice(1, -1);
    s = s.replace(/\\n/g, '\n');
    s = s.replace(/\\r/g, '\r');
    s = s.replace(/\\t/g, '\t');
    s = s.replace(/\\"/g, '"');
    s = s.replace(/\\\\/g, '\\');
    return [s, pos + 1];
  }

  return [token, pos + 1];
}

/**
 * Get the first child list starting with key, or undefined.
 */
export function get(expr: SExpr, key: string): SExpr[] | undefined {
  if (!Array.isArray(expr)) {
    return undefined;
  }
  for (const item of expr) {
    if (Array.isArray(item) && item.length > 0 && item[0] === key) {
      return item;
    }
  }
  return undefined;
}

/**
 * Get all child lists starting with key.
 */
export function getAll(expr: SExpr, key: string): SExpr[][] {
  if (!Array.isArray(expr)) {
    return [];
  }
  return expr.filter(
    (item): item is SExpr[] =>
      Array.isArray(item) && item.length > 0 && item[0] === key
  );
}

/**
 * Get the value of a (key value) pair.
 */
export function getValue(expr: SExpr, key: string): string | undefined {
  const child = get(expr, key);
  if (child && child.length > 1 && typeof child[1] === 'string') {
    return child[1];
  }
  return undefined;
}
