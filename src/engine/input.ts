import { AIM_DEADZONE, KEY_BINDS, MOVE_DEADZONE, PAD_BINDS, TRIGGER_OFF, TRIGGER_ON, VIEW_HOLD, type Action } from './actions';
import { VIEW_H, VIEW_W } from './config';
import { BTN, padShared, padTouched, readPad, shapeStick, type PadFrame } from './pad';
import { noteDevice } from '../state/deviceStore';

const PAD_BUTTONS = 17;

/**
 * Keyboard, mouse and controller, polled by the game loop and read as actions
 * ("fire", "interact"...). Mouse coordinates are in internal view pixels.
 *
 * Call `poll(dt)` at the start of a frame and `endFrame()` at its end.
 */
export class Input {
  mouseX = VIEW_W / 2;
  mouseY = VIEW_H / 2;
  mouseDown = false;
  /** Where the aim comes from right now: the mouse, or the right stick. */
  aimDevice: 'mouse' | 'pad' = 'mouse';
  /** Shaped right stick (0 when idle or when a menu has the controller). */
  aimStick = { x: 0, y: 0, mag: 0 };
  /** The controller read this frame, if any (for rumble). */
  pad: PadFrame | null = null;

  private held = new Set<string>();
  private keysPressed = new Set<string>();
  private wheel = 0;

  private padDown = new Array<boolean>(PAD_BUTTONS).fill(false);
  /** Buttons that went down while a menu had the controller: ignored until released. */
  private padBlocked = new Array<boolean>(PAD_BUTTONS).fill(false);
  private padPressed = new Set<number>();
  private padMove = { x: 0, y: 0, mag: 0 };
  private synth = new Set<Action>();
  private sprintLatch = false;
  private sprintIdle = 0;
  private viewT = -1;
  private viewMapSent = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    canvas.addEventListener('contextmenu', this.preventMenu);
  }

  /** Read the controller. Call once at the start of every frame. */
  poll(dt: number): void {
    const f = readPad();
    this.pad = f;
    const captured = padShared.uiCaptured;
    if (!f) {
      this.padDown.fill(false);
      this.padBlocked.fill(false);
      this.padMove = { x: 0, y: 0, mag: 0 };
      this.aimStick = { x: 0, y: 0, mag: 0 };
      this.sprintLatch = false;
      this.viewT = -1;
      return;
    }
    if (padTouched(f)) noteDevice('pad', f.family);

    for (let i = 0; i < PAD_BUTTONS; i++) {
      const v = f.buttons[i] ?? 0;
      const was = this.padDown[i];
      const trigger = i === BTN.LT || i === BTN.RT;
      const now = trigger ? (was ? v > TRIGGER_OFF : v > TRIGGER_ON) : v > 0.5;
      if (now && !was) {
        if (captured) this.padBlocked[i] = true;
        else this.padPressed.add(i);
      }
      if (!now) this.padBlocked[i] = false;
      this.padDown[i] = now;
    }

    const ls = shapeStick(f.axes[0], f.axes[1], MOVE_DEADZONE);
    const rs = shapeStick(f.axes[2], f.axes[3], AIM_DEADZONE);
    this.padMove = captured ? { x: 0, y: 0, mag: 0 } : ls;
    this.aimStick = captured ? { x: 0, y: 0, mag: 0 } : rs;
    // Whichever was touched last aims: the mouse, or the pad (any use of it).
    if (!captured && padTouched(f)) this.aimDevice = 'pad';

    // L3 latches sprint until the stick comes back, or the gun comes up.
    if (this.padPressed.has(BTN.L3)) this.sprintLatch = !this.sprintLatch;
    if (this.sprintLatch) {
      this.sprintIdle = this.padMove.mag < 0.3 ? this.sprintIdle + dt : 0;
      if (this.sprintIdle > 0.18 || this.padHeld(BTN.RT) || this.padHeld(BTN.LT) || captured) this.sprintLatch = false;
    }

    // View: a tap is the bag, a hold is the map.
    if (this.padPressed.has(BTN.VIEW)) {
      this.viewT = 0;
      this.viewMapSent = false;
    }
    if (this.viewT >= 0) {
      if (this.padDown[BTN.VIEW]) {
        this.viewT += dt;
        if (this.viewT >= VIEW_HOLD && !this.viewMapSent) {
          this.viewMapSent = true;
          this.synth.add('map');
        }
      } else {
        if (!this.viewMapSent && !captured) this.synth.add('inventory');
        this.viewT = -1;
      }
    }
  }

  /** Held this frame. */
  down(a: Action): boolean {
    for (const k of KEY_BINDS[a]) if (this.held.has(k)) return true;
    if (a === 'sprint') return this.sprintLatch;
    const b = PAD_BINDS[a];
    return b !== undefined && this.padHeld(b);
  }

  /** Went down this frame. */
  pressed(a: Action): boolean {
    for (const k of KEY_BINDS[a]) if (this.keysPressed.has(k)) return true;
    if (this.synth.has(a)) return true;
    if (a === 'sprint') return false;
    const b = PAD_BINDS[a];
    return b !== undefined && this.padPressed.has(b);
  }

  /** Movement intent, magnitude 0..1 (analogue on a stick, full on keys). */
  move(): { x: number; y: number } {
    let ix = 0;
    let iy = 0;
    if (this.held.has('KeyA') || this.held.has('ArrowLeft')) ix -= 1;
    if (this.held.has('KeyD') || this.held.has('ArrowRight')) ix += 1;
    if (this.held.has('KeyW') || this.held.has('ArrowUp')) iy -= 1;
    if (this.held.has('KeyS') || this.held.has('ArrowDown')) iy += 1;
    const len = Math.hypot(ix, iy);
    if (len) return { x: ix / len, y: iy / len };
    return { x: this.padMove.x, y: this.padMove.y };
  }

  /** The controller is aiming (right stick or triggers used since the mouse last moved). */
  get padAiming(): boolean {
    return this.aimDevice === 'pad';
  }

  // Raw access, for the few places that care about a specific key.

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Call at the end of every frame. */
  endFrame(): void {
    this.keysPressed.clear();
    this.padPressed.clear();
    this.synth.clear();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.preventMenu);
  }

  private padHeld(b: number): boolean {
    return this.padDown[b] && !this.padBlocked[b] && !padShared.uiCaptured;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Menus talk to themselves with synthetic keys (controller "back"): not gameplay.
    if (!e.isTrusted) return;
    if (!this.held.has(e.code)) this.keysPressed.add(e.code);
    this.held.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => this.held.delete(e.code);
  private onBlur = () => {
    this.held.clear();
    this.mouseDown = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.mouseX = ((e.clientX - r.left) / r.width) * VIEW_W;
    this.mouseY = ((e.clientY - r.top) / r.height) * VIEW_H;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.aimDevice = 'mouse';
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    this.onMouseMove(e);
    this.aimDevice = 'mouse';
    const code = `Mouse${e.button}`;
    if (!this.held.has(code)) this.keysPressed.add(code);
    this.held.add(code);
    if (e.button === 0) this.mouseDown = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    this.held.delete(`Mouse${e.button}`);
    if (e.button === 0) this.mouseDown = false;
  };
  private onWheel = (e: WheelEvent) => {
    this.wheel += Math.sign(e.deltaY);
  };
  private preventMenu = (e: Event) => e.preventDefault();
}
