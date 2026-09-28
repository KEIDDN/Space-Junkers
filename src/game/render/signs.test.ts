import { describe, expect, it } from 'vitest';
import { ROOM_NOTICES, ROOM_SIGNS, SIGN_LETTERS, ZONE_NOTICES } from './signs';

describe('room signs', () => {
  it('only use letters the stencil font has', () => {
    for (const v of [...Object.values(ROOM_SIGNS), ...Object.values(ROOM_NOTICES), ...Object.values(ZONE_NOTICES).filter((v) => !!v)]) {
      for (const ch of v.ru + v.en) if (ch !== ' ') expect(SIGN_LETTERS.has(ch), `${v.ru} / ${v.en}: "${ch}"`).toBe(true);
    }
  });
});
