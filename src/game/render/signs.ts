import { Texture } from 'pixi.js';

/**
 * Stencilled wall plates in the style of Soviet export hardware: the Russian word, and
 * the English under it, in a hand-cut 5-pixel font. Rooms say what they are, and the
 * world keeps its accent.
 */

// 5-row glyphs. '#' is ink. Widths vary (3 to 5).
const GLYPHS: Record<string, string[]> = {
  // Cyrillic
  А: ['.#.', '#.#', '###', '#.#', '#.#'],
  Б: ['###', '#..', '###', '#.#', '###'],
  В: ['##.', '#.#', '##.', '#.#', '##.'],
  Г: ['###', '#..', '#..', '#..', '#..'],
  Д: ['.##.', '.#.#', '.#.#', '####', '#..#'],
  Е: ['###', '#..', '##.', '#..', '###'],
  Ж: ['#.#.#', '#.#.#', '.###.', '#.#.#', '#.#.#'],
  З: ['##.', '..#', '.#.', '..#', '##.'],
  И: ['#..#', '#..#', '#.##', '##.#', '#..#'],
  Й: ['#.##', '#..#', '#.##', '##.#', '#..#'],
  К: ['#.#', '#.#', '##.', '#.#', '#.#'],
  Л: ['.###', '.#.#', '.#.#', '.#.#', '#..#'],
  М: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  Н: ['#.#', '#.#', '###', '#.#', '#.#'],
  О: ['###', '#.#', '#.#', '#.#', '###'],
  П: ['###', '#.#', '#.#', '#.#', '#.#'],
  Р: ['###', '#.#', '###', '#..', '#..'],
  С: ['###', '#..', '#..', '#..', '###'],
  Т: ['###', '.#.', '.#.', '.#.', '.#.'],
  У: ['#.#', '#.#', '###', '..#', '###'],
  Ф: ['.###.', '#.#.#', '#.#.#', '.###.', '..#..'],
  Х: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Ц: ['#.#.', '#.#.', '#.#.', '###.', '...#'],
  Ч: ['#.#', '#.#', '###', '..#', '..#'],
  Ш: ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####'],
  Ы: ['#...#', '#...#', '##..#', '#.#.#', '##..#'],
  Ь: ['#..', '#..', '##.', '#.#', '##.'],
  Э: ['##.', '..#', '.##', '..#', '##.'],
  Ю: ['#.##.', '#.#.#', '###.#', '#.#.#', '#.##.'],
  Я: ['###', '#.#', '###', '.##', '#.#'],
  // Latin (the ones that differ from their Cyrillic twins)
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['###', '#..', '#.#', '#.#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  Q: ['###', '#.#', '#.#', '###', '..#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  // Figures
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#', '##', '.#', '.#', '.#'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '..#', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  '№': ['#..#.', '##.#.', '#.##.', '#..#.', '#..##'],
  '-': ['...', '...', '###', '...', '...'],
  '.': ['.', '.', '.', '.', '#'],
  '·': ['.', '.', '#', '.', '.'],
  '!': ['#', '#', '#', '.', '#'],
  ':': ['.', '#', '.', '#', '.'],
  ' ': ['..', '..', '..', '..', '..'],
};

function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += (GLYPHS[ch]?.[0].length ?? 3) + 1;
  return Math.max(0, w - 1);
}

function drawText(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  let cx = x;
  for (const ch of text) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' '];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === '#') g.fillRect(cx + col, y + row, 1, 1);
      }
    }
    cx += glyph[0].length + 1;
  }
}

export interface SignStyle {
  /** Plate colour and its edge. */
  plate: string;
  edge: string;
  /** Stencil paint. */
  ink: string;
  /** The small second line. */
  sub: string;
}

export const SIGN_STYLES: Record<string, SignStyle> = {
  plain: { plate: '#1d1b17', edge: '#4a4236', ink: '#d8cfb4', sub: '#8d8470' },
  warn: { plate: '#c9a227', edge: '#6a5412', ink: '#1a1609', sub: '#3b3011' },
  danger: { plate: '#7a1c14', edge: '#3a0d09', ink: '#f0d8c8', sub: '#d8a090' },
  medical: { plate: '#d8d4c8', edge: '#6a665c', ink: '#9a1e16', sub: '#5a564c' },
};

const cache = new Map<string, Texture>();

/**
 * A wall plate texture for one or two lines of text. Worn: a few pixels of paint are
 * missing, the same ones every time for the same sign.
 */
export function signTexture(main: string, sub: string | null, style: SignStyle): Texture {
  const key = `${main}|${sub}|${style.plate}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = Math.max(textWidth(main), sub ? textWidth(sub) : 0) + 6;
  const h = sub ? 16 : 9;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = style.edge;
  g.fillRect(0, 0, w, h);
  g.fillStyle = style.plate;
  g.fillRect(1, 1, w - 2, h - 2);
  // Rivets.
  g.fillStyle = style.edge;
  g.fillRect(1, 1, 1, 1);
  g.fillRect(w - 2, 1, 1, 1);
  g.fillRect(1, h - 2, 1, 1);
  g.fillRect(w - 2, h - 2, 1, 1);
  g.fillStyle = style.ink;
  drawText(g, main, Math.floor((w - textWidth(main)) / 2), 2);
  if (sub) {
    g.fillStyle = style.sub;
    drawText(g, sub, Math.floor((w - textWidth(sub)) / 2), 9);
  }
  // Wear: knock out a little paint, seeded by the text.
  let seed = 0;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < (w * h) / 14; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const p = seed % (w * h);
    const px = p % w;
    const py = Math.floor(p / w);
    if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) continue;
    const o = p * 4;
    img.data[o] = Math.round(img.data[o] * 0.7);
    img.data[o + 1] = Math.round(img.data[o + 1] * 0.7);
    img.data[o + 2] = Math.round(img.data[o + 2] * 0.7);
  }
  g.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  cache.set(key, t);
  return t;
}

/** What each kind of room says over its door. */
/**
 * A second plate: what the room was for, in the voice of whoever ran it. Hung on the far
 * side of the back wall from the room's name.
 */
export const ROOM_NOTICES: Record<string, { ru: string; en: string; style: keyof typeof SIGN_STYLES }> = {
  storage: { ru: 'НЕ КУРИТЬ', en: 'NO SMOKING', style: 'warn' },
  reactor: { ru: 'РАДИАЦИЯ', en: 'RADIATION', style: 'danger' },
  armory: { ru: 'БОЕПРИПАСЫ', en: 'AMMUNITION', style: 'warn' },
  workshop: { ru: 'ОСТОРОЖНО', en: 'CAUTION', style: 'warn' },
  servers: { ru: 'ТИШИНА', en: 'SILENCE', style: 'plain' },
  medbay: { ru: 'СТЕРИЛЬНО', en: 'STERILE', style: 'medical' },
  barracks: { ru: 'ОТБОЙ 22:00', en: 'LIGHTS OUT 22:00', style: 'plain' },
  mess: { ru: 'МОЙ РУКИ', en: 'WASH HANDS', style: 'plain' },
  office: { ru: 'ПЛАН - ЗАКОН', en: 'THE PLAN IS LAW', style: 'plain' },
};

export const ROOM_SIGNS: Record<string, { ru: string; en: string; style: keyof typeof SIGN_STYLES }> = {
  entry: { ru: 'ШЛЮЗ', en: 'AIRLOCK', style: 'plain' },
  exfil: { ru: 'ПОСАДКА', en: 'LANDING PAD', style: 'warn' },
  vault: { ru: 'СПЕЦХРАН', en: 'NO ENTRY', style: 'danger' },
  storage: { ru: 'СКЛАД', en: 'STORES', style: 'plain' },
  barracks: { ru: 'КАЗАРМА', en: 'BARRACKS', style: 'plain' },
  office: { ru: 'КОНТОРА', en: 'OFFICE', style: 'plain' },
  servers: { ru: 'ВЦ ЭВМ', en: 'COMPUTING', style: 'plain' },
  workshop: { ru: 'ЦЕХ', en: 'WORKSHOP', style: 'plain' },
  medbay: { ru: 'МЕДПУНКТ', en: 'MEDICAL', style: 'medical' },
  mess: { ru: 'СТОЛОВАЯ', en: 'CANTEEN', style: 'plain' },
  reactor: { ru: 'РЕАКТОР', en: 'DANGER', style: 'warn' },
  armory: { ru: 'АРСЕНАЛ', en: 'ARMOURY', style: 'danger' },
  // Aboard the Lastochka.
  ship_common: { ru: 'КУБРИК', en: 'MESS DECK', style: 'plain' },
  ship_cargo: { ru: 'ТРЮМ', en: 'CARGO', style: 'warn' },
  ship_tech: { ru: 'РАДИОРУБКА', en: 'SIGNALS', style: 'plain' },
  ship_med: { ru: 'ЛАЗАРЕТ', en: 'SICKBAY', style: 'medical' },
  ship_quarters: { ru: 'КАЮТЫ', en: 'QUARTERS', style: 'plain' },
  ship_nook: { ru: 'КЛАДОВАЯ', en: 'PANTRY', style: 'plain' },
  ship_armory: { ru: 'АРСЕНАЛ', en: 'ARMOURY', style: 'danger' },
  ship_engine: { ru: 'МАШИННОЕ', en: 'ENGINES', style: 'warn' },
};
