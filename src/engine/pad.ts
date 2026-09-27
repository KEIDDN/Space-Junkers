/**
 * Gamepads through the browser Gamepad API ("standard" mapping: Xbox / PlayStation
 * layouts). Only reading and shaping lives here; what the buttons mean is in actions.ts.
 */

/** Standard-mapping button indices. */
export const BTN = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  VIEW: 8, START: 9,
  L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
  HOME: 16,
  /** DualShock 4 / DualSense touchpad click (Chromium's standard mapping). */
  TOUCHPAD: 17,
} as const;

/** Buttons read from a pad (the 16 standard ones, home, and the PlayStation touchpad). */
export const PAD_BUTTON_COUNT = 18;

export type PadFamily = 'xbox' | 'playstation' | 'nintendo';

/** One read of the active controller: button values 0..1 and the four stick axes. */
export interface PadFrame {
  buttons: number[];
  axes: [number, number, number, number];
  family: PadFamily;
  /** The pad reports a touchpad button (PlayStation pads in Chromium). */
  touchpad: boolean;
  /** The browser's pad, for rumble. */
  pad: Gamepad;
}

/** Shared between the game loop and the menu navigator (plain module state, no React). */
export const padShared = {
  /** A menu or overlay has the controller: gameplay ignores it (the keyboard is unaffected). */
  uiCaptured: false,
  /** Index of the pad last used, so a second idle controller never steals input. */
  lastIndex: -1,
};

export function padFamily(id: string): PadFamily {
  const s = id.toLowerCase();
  if (/xbox|xinput|045e/.test(s)) return 'xbox';
  if (/054c|dualshock|dualsense|playstation|wireless controller|ps[345]/.test(s)) return 'playstation';
  if (/057e|nintendo|pro controller|joy-con/.test(s)) return 'nintendo';
  return 'xbox';
}

/** Radial deadzone with an outer saturation ring: returns a 0..1 magnitude and the shaped vector. */
export function shapeStick(x: number, y: number, inner: number, outer = 0.94): { x: number; y: number; mag: number } {
  const m = Math.hypot(x, y);
  if (m <= inner || !Number.isFinite(m)) return { x: 0, y: 0, mag: 0 };
  const k = Math.min(1, (m - inner) / (outer - inner));
  return { x: (x / m) * k, y: (y / m) * k, mag: k };
}

function pads(): Gamepad[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  const out: Gamepad[] = [];
  for (const p of navigator.getGamepads()) if (p && p.connected) out.push(p);
  return out;
}

function busy(p: Gamepad): boolean {
  if (p.buttons.some((b) => b.pressed || b.value > 0.3)) return true;
  return p.axes.some((a) => Math.abs(a) > 0.45);
}

/** The controller in use: the last one touched, else the first connected. */
export function readPad(): PadFrame | null {
  const list = pads();
  if (!list.length) return null;
  let pad = list.find((p) => p.index === padShared.lastIndex) ?? null;
  // Whoever touches a pad takes over.
  const active = list.find(busy);
  if (active && active !== pad && (!pad || !busy(pad))) pad = active;
  pad ??= list[0];
  if (busy(pad)) padShared.lastIndex = pad.index;
  const buttons = new Array<number>(PAD_BUTTON_COUNT).fill(0);
  for (let i = 0; i < Math.min(PAD_BUTTON_COUNT, pad.buttons.length); i++) {
    const b = pad.buttons[i];
    buttons[i] = b.pressed ? Math.max(b.value, 1) : b.value;
  }
  // Triggers report analogue values; some pads only mark them pressed.
  buttons[BTN.LT] = pad.buttons[BTN.LT] ? Math.max(pad.buttons[BTN.LT].value, pad.buttons[BTN.LT].pressed ? 1 : 0) : 0;
  buttons[BTN.RT] = pad.buttons[BTN.RT] ? Math.max(pad.buttons[BTN.RT].value, pad.buttons[BTN.RT].pressed ? 1 : 0) : 0;
  const a = pad.axes;
  const family = padFamily(pad.id);
  return {
    buttons,
    axes: [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0],
    family,
    touchpad: family === 'playstation' && pad.buttons.length > BTN.TOUCHPAD,
    pad,
  };
}

/** True when this frame shows someone actually using the pad (not stick drift). */
export function padTouched(f: PadFrame): boolean {
  if (f.buttons.some((v) => v > 0.35)) return true;
  return Math.hypot(f.axes[0], f.axes[1]) > 0.4 || Math.hypot(f.axes[2], f.axes[3]) > 0.4;
}
