import { VIEW_H, VIEW_W } from './config';

/**
 * Keyboard + mouse state, polled by the game loop.
 * Mouse coordinates are in internal view pixels (0..VIEW_W, 0..VIEW_H).
 */
export class Input {
  mouseX = VIEW_W / 2;
  mouseY = VIEW_H / 2;
  mouseDown = false;

  private held = new Set<string>();
  private pressed = new Set<string>();
  private clicked = false;
  private wheel = 0;

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

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** True only on the frame the key went down. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** True only on the frame the left button went down. */
  wasClicked(): boolean {
    return this.clicked;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Call at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
    this.clicked = false;
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

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.held.has(e.code)) this.pressed.add(e.code);
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
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    this.onMouseMove(e);
    this.mouseDown = true;
    this.clicked = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
  };
  private onWheel = (e: WheelEvent) => {
    this.wheel += Math.sign(e.deltaY);
  };
  private preventMenu = (e: Event) => e.preventDefault();
}
