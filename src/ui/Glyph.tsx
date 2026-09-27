import { Fragment, type ReactNode } from 'react';
import { KEY_BINDS, PAD_BINDS, type Action } from '../engine/actions';
import { BTN, type PadFamily } from '../engine/pad';
import { useDevice } from '../state/deviceStore';

/** Controls that only exist in menus (and a few pad-only gestures). */
export type UiGlyph = 'confirm' | 'back' | 'alt' | 'more' | 'prevTab' | 'nextTab' | 'navigate' | 'scroll' | 'move' | 'aim' | 'mapHold' | 'weapons' | 'quick';

export type GlyphId = Action | UiGlyph;

const KEY_LABEL: Partial<Record<string, string>> = {
  Mouse0: 'LMB', Mouse2: 'RMB', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', Escape: 'ESC', Tab: 'TAB',
};

function keyLabel(code: string): string {
  return KEY_LABEL[code] ?? code.replace(/^Key|^Digit/, '');
}

const KB_UI: Record<UiGlyph, string> = {
  confirm: 'CLICK', back: 'ESC', alt: 'SHIFT+CLICK', more: 'RMB', prevTab: '', nextTab: '', navigate: 'MOUSE',
  scroll: 'WHEEL', move: 'WASD', aim: 'MOUSE', mapHold: 'M', weapons: '1 2 Q', quick: '3–6',
};

/** Face and shoulder names per controller family, indexed by standard button. */
const PAD_NAMES: Record<PadFamily, string[]> = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'L3', 'R3', '↑', '↓', '←', '→'],
  playstation: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'CREATE', 'OPTIONS', 'L3', 'R3', '↑', '↓', '←', '→'],
  nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L3', 'R3', '↑', '↓', '←', '→'],
};

const FACE_TONE: Record<PadFamily, string[]> = {
  xbox: ['#7fd46a', '#e0574a', '#5aa6ff', '#f2c63a'],
  playstation: ['#7aa7ff', '#ff6f6f', '#e58ad8', '#5fd6b0'],
  nintendo: ['#d8d8d8', '#d8d8d8', '#d8d8d8', '#d8d8d8'],
};

const PAD_UI: Record<UiGlyph, number | string> = {
  confirm: BTN.A, back: BTN.B, alt: BTN.X, more: BTN.Y, prevTab: BTN.LB, nextTab: BTN.RB,
  navigate: '✚', scroll: 'RS', move: 'LS', aim: 'RS', mapHold: BTN.VIEW, weapons: BTN.Y, quick: '✚',
};

/** Label text for an action on the current device (for places that can't render a glyph). */
export function glyphText(id: GlyphId, device: 'kbm' | 'pad', family: PadFamily): string {
  if (device === 'kbm') {
    if (id in KB_UI) return KB_UI[id as UiGlyph];
    if (id === 'map') return 'M';
    return keyLabel(KEY_BINDS[id as Action][0]);
  }
  if (id === 'inventory') return PAD_NAMES[family][BTN.VIEW];
  if (id === 'map') return `HOLD ${PAD_NAMES[family][BTN.VIEW]}`;
  const b = id in PAD_UI ? PAD_UI[id as UiGlyph] : PAD_BINDS[id as Action];
  if (typeof b === 'string') return b;
  return b === undefined ? '?' : PAD_NAMES[family][b];
}

/** One control, drawn as a keycap on keyboard or a button face on a controller. */
export function Key({ a, hold }: { a: GlyphId; hold?: boolean }) {
  const device = useDevice((s) => s.device);
  const family = useDevice((s) => s.family);
  const text = glyphText(a, device, family);
  if (!text) return null;
  if (device === 'kbm') {
    return <span className="glyph key-cap">{hold && <span className="glyph-hold">HOLD</span>}{text}</span>;
  }
  const b = a === 'inventory' || a === 'map' ? BTN.VIEW : a in PAD_UI ? PAD_UI[a as UiGlyph] : PAD_BINDS[a as Action];
  const face = typeof b === 'number' && b <= 3;
  const shoulder = typeof b === 'number' && b >= 4 && b <= 7;
  const tone = face ? FACE_TONE[family][b as number] : undefined;
  const label = a === 'map' ? PAD_NAMES[family][BTN.VIEW] : text;
  return (
    <span className={`glyph pad-btn ${face ? 'face' : shoulder ? 'shoulder' : 'misc'}`} style={tone ? { ['--tone' as string]: tone } : undefined}>
      {(hold || a === 'map') && <span className="glyph-hold">HOLD</span>}
      <span className="pad-label">{label}</span>
    </span>
  );
}

/** Picks what to say depending on the device (for hints that read differently on a pad). */
export function ByDevice({ kbm, pad }: { kbm: ReactNode; pad: ReactNode }) {
  const device = useDevice((s) => s.device);
  return <>{device === 'pad' ? pad : kbm}</>;
}

const TOKEN = /\{(hold:)?(\w+)\}/g;

/** Renders prompt text with `{interact}` / `{hold:interact}` tokens as live glyphs. */
export function Prompt({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) parts.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    parts.push(<Key key={i++} a={m[2] as GlyphId} hold={!!m[1]} />);
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

/** Strips tokens to plain key names (for tooltips and logs). */
export function plainPrompt(text: string, device: 'kbm' | 'pad', family: PadFamily): string {
  return text.replace(TOKEN, (_, hold: string | undefined, id: string) => `${hold ? 'HOLD ' : ''}[${glyphText(id as GlyphId, device, family)}]`);
}
