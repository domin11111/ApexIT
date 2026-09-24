import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cssVariables } from './tokens';

/** Достаёт пары `--name: value;` из первого блока `:root { … }` в tokens.css. */
function parseRootBlock(css: string): Map<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = withoutComments.indexOf(':root {');
  const end = withoutComments.indexOf('}', start);
  const block = withoutComments.slice(start, end);
  const vars = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (name && value) vars.set(name, value.trim().replace(/\s+/g, ' '));
  }
  return vars;
}

describe('tokens.css ↔ tokens.ts', () => {
  const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
  const fromCss = parseRootBlock(css);

  it('содержит ровно те же переменные', () => {
    expect([...fromCss.keys()].sort()).toEqual(Object.keys(cssVariables).sort());
  });

  it('значения совпадают', () => {
    for (const [name, value] of Object.entries(cssVariables)) {
      expect(fromCss.get(name), name).toBe(value);
    }
  });
});
