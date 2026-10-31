// ========================================
// Square-1 scramble normalizer.
// Handles decoding, and move simplification
// in one place.
// ========================================

/**
 * Normalizes any scramble input: decodes letter/prime shorthand and
 * simplifies adjacent moves.
 */
export function normalizeScramble(input: string): string {
  if (!input) return '';
  return normalizeScrambleFormat(input);
}

/** Normalizes whitespace and simplifies a scramble into canonical form. */
export function normalizeScrambleFormat(input: string): string {
  if (!input) return '';

  const clean = normalizeInput(input);

  const onlySlashes = /^\/+$/.test(clean);
  if (onlySlashes) {
    return clean.length % 2 === 1 ? '/' : '';
  }

  const tokens = parseSets(clean);
  const simplified = simplifyScramble(tokens);

  return simplified
    .map((token, i) => (token === '/' || i === 0 ? token : ' ' + token))
    .join('')
    .replace(/\/\s*\(/g, '/(');
}

function normalizeInput(str: string): string {
  return str
    .replace(/\\/g, '/')
    .replace(/\+\+/g, '+')
    .trim();
}

/** Decodes letter shortcuts and prime notation into signed numbers. */
function decodeScramble(str: string): string {
  if (!str) return '';

  const letterMap: Record<string, string> = {
    U: '3', D: '3',
    V: '4', E: '4',
    W: '6', B: '6',
    X: '5', F: '5',
    A: '1', O: '1', S: '1',
    T: '2', C: '2',
  };

  const digitMap: Record<string, string> = {
    '7': '-5',
    '8': '-4',
    '9': '-3',
  };

  const normalized = str.replace(/[''`']/g, "'");
  let result = '';
  let i = 0;

  while (i < normalized.length) {
    const char = normalized[i];
    const upperChar = char.toUpperCase();

    if (char === '-' && i + 1 < normalized.length && /\d/.test(normalized[i + 1])) {
      const nextDigit = normalized[i + 1];
      if (digitMap[nextDigit]) {
        result += digitMap[nextDigit].substring(1); // "-7" flips to "5"
        i += 2;
        continue;
      }
      result += '-';
      i++;
      continue;
    }

    if (/\d/.test(char)) {
      result += digitMap[char] ?? char;
      i++;
    } else if (letterMap[upperChar]) {
      result += letterMap[upperChar];
      i++;
    } else if (char === "'") {
      result += "'";
      i++;
    } else if (char === '-') {
      result += '-';
      i++;
    } else if (char === '/' || char === '(' || char === ')' || char === ',' || char === ' ') {
      result += char;
      i++;
    } else {
      i++;
    }
  }

  return result;
}

/** Parses a scramble string into a token array like "/(a,b)/(c,d)/". */
function parseSets(str: string): string[] {
  if (!str || str.trim() === '') return [];
  if (str.trim() === '/') return ['/'];

  str = decodeScramble(str);

  const hasLeadingSlash = str.trimStart().startsWith('/');
  const hasTrailingSlash = str.trimEnd().endsWith('/');

  const chars = [...str].filter((c) => c !== ' ');

  const processed: string[] = [];
  let i = 0;

  while (i < chars.length) {
    const char = chars[i];

    if (char === '-') {
      let j = i + 1;
      while (j < chars.length && !/\d/.test(chars[j])) j++;
      if (j < chars.length) {
        processed.push('-' + chars[j]);
        i = j + 1;
      } else {
        i++;
      }
    } else if (char === "'") {
      const last = processed[processed.length - 1];
      if (/^-?\d+$/.test(last ?? '')) {
        const num = parseInt(last as string);
        if (num === 0) {
          processed[processed.length - 1] = '0';
        } else if (Math.abs(num) === 6) {
          processed[processed.length - 1] = '6';
        } else if (num > 0) {
          processed[processed.length - 1] = '-' + num;
        } else {
          processed[processed.length - 1] = Math.abs(num).toString();
        }
      }
      i++;
    } else if (/\d/.test(char)) {
      processed.push(char);
      i++;
    } else if (char === '/' || char === '(' || char === ')' || char === ',') {
      processed.push(char);
      i++;
    } else {
      i++;
    }
  }

  const numbers: number[] = [];
  for (const item of processed) {
    if (/^-?\d+$/.test(item)) numbers.push(parseInt(item));
  }

  if (numbers.length === 0) return [];

  if (numbers.length % 2 !== 0) {
    console.warn(`Odd number of values (${numbers.length}). Auto-padding with 0.`);
    numbers.push(0);
  }

  const tokens: string[] = [];
  if (hasLeadingSlash) tokens.push('/');

  for (let j = 0; j < numbers.length; j += 2) {
    tokens.push(`(${numbers[j]},${numbers[j + 1]})`);
    if (j + 2 < numbers.length) tokens.push('/');
  }

  if (hasTrailingSlash) tokens.push('/');

  return tokens;
}

/** Sums two "(a,b)" move tokens, normalizing angles into the range -6..6. */
function addSets(a: string, b: string): string {
  const m = /\((-?\d+),(-?\d+)\)/.exec(a);
  const n = /\((-?\d+),(-?\d+)\)/.exec(b);
  const x1 = parseInt(m![1]);
  const y1 = parseInt(m![2]);
  const x2 = parseInt(n![1]);
  const y2 = parseInt(n![2]);

  const norm = (v: number): number => {
    if (v > 6) v -= 12;
    if (v < -6) v += 12;
    return v;
  };

  return `(${norm(x1 + x2)},${norm(y1 + y2)})`;
}

/**
 * Simplifies a token list by removing double slashes, merging adjacent
 * moves, and dropping "(0,0)" moves. Returns a new token list.
 */
function simplifyScramble(tokens: string[]): string[] {
  const result = [...tokens];
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < result.length - 1; i++) {
      if (result[i] === '/' && result[i + 1] === '/') {
        result.splice(i, 2);
        changed = true;
        break;
      }
    }
    if (changed) continue;

    for (let i = 0; i < result.length - 1; i++) {
      if (result[i].startsWith('(') && result[i + 1].startsWith('(')) {
        result.splice(i, 2, addSets(result[i], result[i + 1]));
        changed = true;
        break;
      }
    }
    if (changed) continue;

    for (let i = 0; i < result.length; i++) {
      if (result[i] === '(0,0)') {
        result.splice(i, 1);
        changed = true;
        break;
      }
    }
  }

  return result;
}

/**
 * Builds the "z2" equivalent of a normalized scramble: swaps top/bottom
 * angles on every move, appends "(-1,1)", and simplifies.
 */
export function generateX2Algorithm(normalizedScramble: string): string {
  if (!normalizedScramble) return '';

  let tokens = normalizedScramble
    .split(/(\/)/)
    .map((t) => t.trim())
    .filter((t) => t);

  tokens = tokens.map((token) => {
    const m = token.match(/\((-?\d+),(-?\d+)\)/);
    if (!m) return token;
    return `(${m[2]},${m[1]})`;
  });

  tokens.push('(-1,1)');

  return simplifyScramble(tokens).join(' ');
}
