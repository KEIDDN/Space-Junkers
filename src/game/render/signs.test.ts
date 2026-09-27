import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROOM_NOTICES, ROOM_SIGNS } from './signs';

describe('room signs', () => {
  it('only use letters the stencil font has', () => {
    const src = readFileSync(new URL('./signs.ts', import.meta.url), 'utf8');
    const i = src.indexOf('const GLYPHS');
    const glyphs = new Set([...src.slice(i, src.indexOf('};', i)).matchAll(/^\s*'?(.)'?:\s*\[/gm)].map((m) => m[1]));
    for (const v of [...Object.values(ROOM_SIGNS), ...Object.values(ROOM_NOTICES)]) {
      for (const ch of v.ru + v.en) if (ch !== ' ') expect(glyphs.has(ch), `${v.ru} / ${v.en}: "${ch}"`).toBe(true);
    }
  });
});
