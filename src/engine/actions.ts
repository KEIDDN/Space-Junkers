import { BTN } from './pad';

/**
 * What the player can do, independent of the device. Gameplay asks for actions; the
 * bindings below decide which keys and buttons mean them.
 */
export type Action =
  | 'fire' | 'steady' | 'reload' | 'interact' | 'sprint' | 'sneak'
  | 'switchWeapon' | 'weapon1' | 'weapon2' | 'flashlight' | 'grenade' | 'heal'
  | 'quick1' | 'quick2' | 'quick3' | 'quick4'
  | 'inventory' | 'map' | 'pause';

/** Keyboard and mouse. `Mouse0` is the left button, `Mouse2` the right. */
export const KEY_BINDS: Record<Action, string[]> = {
  fire: ['Mouse0'],
  steady: ['Mouse2'],
  reload: ['KeyR'],
  interact: ['KeyE'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  sneak: ['KeyC'],
  switchWeapon: ['KeyQ'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  flashlight: ['KeyF'],
  grenade: ['KeyG'],
  heal: ['KeyH'],
  quick1: ['Digit3'],
  quick2: ['Digit4'],
  quick3: ['Digit5'],
  quick4: ['Digit6'],
  inventory: ['Tab'],
  map: ['KeyM'],
  pause: ['Escape'],
};

/**
 * Controller layout. Triggers fire and steady the aim; the right thumb stays on the aim
 * stick for everything urgent (shoulders), face buttons are for deliberate actions.
 * The view button is shared: tap for the bag, hold for the map. Sprint on L3 latches.
 */
export const PAD_BINDS: Partial<Record<Action, number>> = {
  fire: BTN.RT,
  steady: BTN.LT,
  reload: BTN.X,
  interact: BTN.A,
  sneak: BTN.B,
  switchWeapon: BTN.Y,
  sprint: BTN.L3,
  flashlight: BTN.R3,
  grenade: BTN.RB,
  heal: BTN.LB,
  quick1: BTN.LEFT,
  quick2: BTN.UP,
  quick3: BTN.RIGHT,
  quick4: BTN.DOWN,
  pause: BTN.START,
};

/** Seconds the view button must be held to open the map instead of the bag. */
export const VIEW_HOLD = 0.35;

/** Trigger thresholds with hysteresis, so a half-pulled trigger never chatters. */
export const TRIGGER_ON = 0.3;
export const TRIGGER_OFF = 0.15;

/** Stick shaping. */
export const MOVE_DEADZONE = 0.2;
export const AIM_DEADZONE = 0.22;
