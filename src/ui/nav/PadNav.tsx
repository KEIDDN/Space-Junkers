import { useEffect } from 'react';
import { audio } from '../../engine/audio';
import { BTN, padShared, padTouched, readPad, type PadFrame } from '../../engine/pad';
import { itemDef } from '../../data/items';
import { locate } from '../../core/transfer';
import { installDeviceWatch, noteDevice, useDevice } from '../../state/deviceStore';
import { commitDrop, resolveTarget, validDrop } from '../inventory/drag';
import { useDrag, type DragInfo } from '../inventory/dragStore';
import { CELL, activeInventory } from '../inventory/ops';
import { nearestTo, pickNext, readingOrder, type Box, type Dir } from './spatial';

/**
 * Controller navigation for every menu. Screens mark themselves with `data-nav-scope`
 * (the last visible one on the page has the controller); inside it, buttons, sliders,
 * inventory items and anything marked `data-nav` can take focus.
 *
 *   D-pad / left stick   move focus (spatially)      A      activate / pick up / put down
 *   B                    back (the screen's own Esc)  X      quick-move an item
 *   Y                    item actions / rotate         LB RB  tabs, or jump between panels
 *   right stick          scroll                        START  pause / back
 *
 * While a scope is up the game ignores the pad (`padShared.uiCaptured`).
 */

const FOCUSABLE = 'button:not([disabled]), input[type="range"], [data-nav], [data-item]';
const REPEAT_FIRST = 330;
const REPEAT_NEXT = 85;
const SCROLL_SPEED = 900;

type CarryLoc = { grid: HTMLElement; cx: number; cy: number } | { el: HTMLElement };

interface Carry {
  uid: string;
  item: DragInfo['item'];
  rot: boolean;
  at: CarryLoc;
}

function visible(el: HTMLElement): boolean {
  if (el.closest('[data-nav-skip]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function box(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function sendKey(code: string): void {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
}

function scrollable(el: HTMLElement): boolean {
  const s = getComputedStyle(el);
  return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2;
}

class Navigator {
  private prev = new Array<boolean>(17).fill(false);
  private dirHeld: Dir | null = null;
  private repeatAt = 0;
  private scope: HTMLElement | null = null;
  private focus: HTMLElement | null = null;
  private lastBox: Box | null = null;
  private memory = new WeakMap<HTMLElement, HTMLElement>();
  private groupMemory = new WeakMap<HTMLElement, HTMLElement>();
  private carry: Carry | null = null;
  private pendingUid: string | null = null;
  private hoverSet = false;
  private lastT = performance.now();
  private device = '';

  frame(now: number): void {
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const f = readPad();
    const down = this.buttons(f);
    const pressed = (b: number) => down[b] && !this.prev[b];
    // Picking the controller up shows where focus is; that first press does nothing else.
    const waking = !!f && padTouched(f) && useDevice.getState().device !== 'pad';
    if (f && padTouched(f)) {
      noteDevice('pad', f.family);
      if (down.some((d, i) => d && !this.prev[i])) audio.unlock();
    }
    this.syncDevice();

    const scope = this.findScope();
    padShared.uiCaptured = !!scope;
    if (scope !== this.scope) this.enterScope(scope, f);

    if (!scope || scope.dataset.navScope === 'cover') {
      // No menu: START is the pause key (the screen decides what that means).
      if (!scope && f && pressed(BTN.START)) sendKey('Escape');
      this.prev = down;
      return;
    }
    this.validate(scope);
    if (!f || waking) {
      this.prev = down;
      if (f) this.dirHeld = this.direction(f, down);
      return;
    }

    // --- Direction with auto-repeat
    const dir = this.direction(f, down);
    if (dir !== this.dirHeld) {
      this.dirHeld = dir;
      if (dir) {
        this.move(scope, dir);
        this.repeatAt = now + REPEAT_FIRST;
      }
    } else if (dir && now >= this.repeatAt) {
      this.move(scope, dir);
      this.repeatAt = now + REPEAT_NEXT;
    }

    // --- Buttons
    if (pressed(BTN.A)) this.confirm(scope);
    else if (pressed(BTN.B)) this.back();
    else if (pressed(BTN.X)) this.alt(scope);
    else if (pressed(BTN.Y)) this.more(scope);
    else if (pressed(BTN.LB)) this.tab(scope, -1);
    else if (pressed(BTN.RB)) this.tab(scope, 1);
    else if (pressed(BTN.LT)) this.shortcut(scope, 'LT');
    else if (pressed(BTN.RT)) this.shortcut(scope, 'RT');
    else if (pressed(BTN.START) || pressed(BTN.VIEW)) {
      if (this.carry) this.cancelCarry();
      sendKey('Escape');
    }

    // --- Right stick scrolls whatever is under focus
    const ry = f.axes[3];
    if (Math.abs(ry) > 0.25) this.scroll(scope, Math.sign(ry) * (Math.abs(ry) - 0.25) / 0.75 * SCROLL_SPEED * dt);

    this.prev = down;
  }

  destroy(): void {
    this.setFocus(null, false);
    padShared.uiCaptured = false;
  }

  // ---------------------------------------------------------------------------

  private buttons(f: PadFrame | null): boolean[] {
    if (!f) return new Array<boolean>(17).fill(false);
    return f.buttons.map((v, i) => (i === BTN.LT || i === BTN.RT ? (this.prev[i] ? v > 0.15 : v > 0.3) : v > 0.5));
  }

  private direction(f: PadFrame, down: boolean[]): Dir | null {
    if (down[BTN.UP]) return 'up';
    if (down[BTN.DOWN]) return 'down';
    if (down[BTN.LEFT]) return 'left';
    if (down[BTN.RIGHT]) return 'right';
    const [x, y] = f.axes;
    if (Math.hypot(x, y) < 0.55) return null;
    return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
  }

  private syncDevice(): void {
    const d = useDevice.getState().device;
    if (d === this.device) return;
    this.device = d;
    document.body.dataset.device = d;
    if (this.focus) this.focus.classList.toggle('pad-focus', d === 'pad');
    if (d !== 'pad') {
      if (this.carry) this.cancelCarry();
      if (this.hoverSet) {
        useDrag.setState({ hover: null });
        this.hoverSet = false;
      }
    }
  }

  private findScope(): HTMLElement | null {
    const all = document.querySelectorAll<HTMLElement>('[data-nav-scope]');
    for (let i = all.length - 1; i >= 0; i--) if (all[i].isConnected && visible(all[i])) return all[i];
    return null;
  }

  private focusables(root: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
      // A nested scope (a context menu) belongs to itself, not to the screen under it.
      const own = el.closest('[data-nav-scope]');
      if (own !== root && root.contains(own)) continue;
      if (visible(el)) out.push(el);
    }
    return out;
  }

  private enterScope(scope: HTMLElement | null, f: PadFrame | null): void {
    if (this.scope && this.focus) this.memory.set(this.scope, this.focus);
    if (this.carry && (!scope || !scope.contains(this.carryAnchor()))) this.cancelCarry();
    this.scope = scope;
    // A direction already held (from the game) doesn't start moving the new focus.
    this.dirHeld = f ? this.direction(f, this.buttons(f)) : null;
    if (!scope) {
      this.setFocus(null, false);
      return;
    }
    const remembered = this.memory.get(scope);
    if (remembered?.isConnected && scope.contains(remembered) && visible(remembered)) this.setFocus(remembered, false);
    else this.setFocus(this.defaultFocus(scope), false);
  }

  private defaultFocus(scope: HTMLElement): HTMLElement | null {
    const def = scope.querySelector<HTMLElement>('[data-nav-default]');
    if (def && visible(def) && def.matches(FOCUSABLE)) return def;
    const prefer = scope.querySelector<HTMLElement>('[data-nav-prefer]');
    const pool = (prefer && this.focusables(prefer).length ? this.focusables(prefer) : this.focusables(scope));
    return pool.sort((a, b) => readingOrder(box(a), box(b)))[0] ?? null;
  }

  /** Focus lost its element (it moved, was sold, the view changed): find a sensible new one. */
  private validate(scope: HTMLElement): void {
    if (this.pendingUid) {
      const el = scope.querySelector<HTMLElement>(`[data-item="${CSS.escape(this.pendingUid)}"]`);
      if (el && visible(el)) {
        this.pendingUid = null;
        this.setFocus(el, false);
        return;
      }
    }
    const f = this.focus;
    if (f && f.isConnected && scope.contains(f) && visible(f) && f.matches(FOCUSABLE)) {
      if (f.dataset.item) this.showTooltip(f);
      return;
    }
    const def = scope.querySelector<HTMLElement>('[data-nav-default]');
    if (def && visible(def) && def.matches(FOCUSABLE)) {
      this.setFocus(def, false);
      return;
    }
    const els = this.focusables(scope);
    if (!els.length) {
      this.setFocus(null, false);
      return;
    }
    const b = this.lastBox;
    const i = b ? nearestTo((b.left + b.right) / 2, (b.top + b.bottom) / 2, els.map(box)) : -1;
    this.setFocus(i >= 0 ? els[i] : els.sort((x, y) => readingOrder(box(x), box(y)))[0], false);
  }

  private setFocus(el: HTMLElement | null, sound = true): void {
    if (el === this.focus) return;
    this.focus?.classList.remove('pad-focus');
    this.focus = el;
    if (this.hoverSet && !el?.dataset.item) {
      useDrag.setState({ hover: null });
      this.hoverSet = false;
    }
    if (!el) return;
    if (useDevice.getState().device === 'pad') el.classList.add('pad-focus');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.lastBox = box(el);
    const group = el.closest<HTMLElement>('[data-nav-group]');
    if (group) this.groupMemory.set(group, el);
    if (el.dataset.item) this.showTooltip(el);
    if (sound) audio.ui('hover');
  }

  private showTooltip(el: HTMLElement): void {
    if (useDevice.getState().device !== 'pad' || this.carry || useDrag.getState().menu) return;
    const ops = activeInventory.ops;
    const uid = el.dataset.item!;
    const loc = ops && locate(ops.ws, uid);
    if (!loc) return;
    const r = el.getBoundingClientRect();
    const cur = useDrag.getState().hover;
    if (cur && cur.item === loc.item && cur.x === Math.round(r.right) && cur.y === Math.round(r.top)) return;
    useDrag.setState({ hover: { item: loc.item, x: Math.round(r.right), y: Math.round(r.top) } });
    this.hoverSet = true;
  }

  private move(scope: HTMLElement, dir: Dir): void {
    if (this.carry) {
      this.moveCarry(scope, dir);
      return;
    }
    const f = this.focus;
    if (f instanceof HTMLInputElement && f.type === 'range' && (dir === 'left' || dir === 'right')) {
      this.nudge(f, dir === 'right' ? 1 : -1);
      return;
    }
    const els = this.focusables(scope).filter((e) => e !== f);
    if (!f) {
      this.setFocus(this.defaultFocus(scope));
      return;
    }
    const i = pickNext(box(f), els.map(box), dir);
    if (i >= 0) this.setFocus(els[i]);
  }

  private nudge(input: HTMLInputElement, sign: number): void {
    const step = Number(input.step) || 0.1;
    const min = Number(input.min);
    const max = Number(input.max);
    const v = Math.max(min, Math.min(max, Math.round((Number(input.value) + sign * step) / step) * step));
    if (v === Number(input.value)) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    audio.ui('tick');
  }

  private confirm(scope: HTMLElement): void {
    if (this.carry) {
      this.dropCarry();
      return;
    }
    const f = this.focus;
    if (!f) return;
    if (f.dataset.item && activeInventory.ops) {
      this.startCarry(f);
      return;
    }
    if (f instanceof HTMLInputElement) return;
    f.click();
    // A click can swap the whole view (dialogue pages): re-check next frame.
    if (!f.isConnected) this.validate(scope);
  }

  private back(): void {
    if (this.carry) {
      this.cancelCarry();
      audio.ui('close');
      return;
    }
    if (useDrag.getState().menu) {
      useDrag.setState({ menu: null });
      audio.ui('close');
      return;
    }
    sendKey('Escape');
  }

  private alt(scope: HTMLElement): void {
    const f = this.focus;
    const ops = activeInventory.ops;
    if (!this.carry && f?.dataset.quick !== undefined) {
      // Clear a quick-slot binding (the mouse's right-click).
      f.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      audio.ui('close');
      return;
    }
    if (!this.carry && f?.dataset.item && ops) {
      const uid = f.dataset.item;
      const ok = ops.quick(uid);
      audio.ui(ok ? 'drop' : 'error');
      if (ok) this.pendingUid = uid;
      return;
    }
    this.shortcut(scope, 'X');
  }

  private more(scope: HTMLElement): void {
    if (this.carry) {
      const d = itemDef(this.carry.item.id);
      if (d.w === d.h) {
        audio.ui('error');
        return;
      }
      this.carry.rot = !this.carry.rot;
      this.updateCarry();
      audio.ui('tab');
      return;
    }
    const f = this.focus;
    if (f?.dataset.item && activeInventory.ops) {
      const r = f.getBoundingClientRect();
      useDrag.setState({ menu: { uid: f.dataset.item, x: Math.round(r.right - 8), y: Math.round(r.top + 8) }, hover: null });
      this.hoverSet = false;
      audio.ui('click');
      return;
    }
    this.shortcut(scope, 'Y');
  }

  /** Buttons that declare a controller shortcut (`data-pad-shortcut="RT"`). */
  private shortcut(scope: HTMLElement, name: string): void {
    const el = scope.querySelector<HTMLElement>(`[data-pad-shortcut="${name}"]`);
    if (el && visible(el) && !(el as HTMLButtonElement).disabled) el.click();
  }

  /** LB/RB: switch tabs if the screen has them, else jump between its panels. */
  private tab(scope: HTMLElement, step: number): void {
    const tabs = [...scope.querySelectorAll<HTMLElement>('.tabs .tab')].filter(visible);
    if (tabs.length) {
      const cur = tabs.findIndex((t) => t.classList.contains('on'));
      const next = tabs[(cur + step + tabs.length) % tabs.length];
      if (next && next !== tabs[cur]) next.click();
      return;
    }
    const groups = [...scope.querySelectorAll<HTMLElement>('[data-nav-group]')].filter(visible).sort((a, b) => box(a).left - box(b).left);
    if (groups.length < 2) return;
    const anchor = this.carry ? this.carryAnchor() : this.focus;
    const cur = groups.findIndex((g) => anchor && g.contains(anchor));
    const g = groups[(cur + step + groups.length) % groups.length];
    if (this.carry) {
      const first = this.dropPoints(g)[0];
      if (first) {
        this.carry.at = first.loc;
        this.updateCarry();
        audio.ui('tab');
      }
      return;
    }
    const mem = this.groupMemory.get(g);
    const el = mem?.isConnected && visible(mem) ? mem : this.focusables(g).sort((a, b) => readingOrder(box(a), box(b)))[0];
    if (el) {
      this.setFocus(el, false);
      audio.ui('tab');
    }
  }

  private scroll(scope: HTMLElement, dy: number): void {
    let el: HTMLElement | null = this.focus;
    while (el && el !== scope.parentElement) {
      if (scrollable(el)) break;
      el = el.parentElement;
    }
    if (!el || el === scope.parentElement) el = [...scope.querySelectorAll<HTMLElement>('*')].find(scrollable) ?? null;
    el?.scrollBy(0, dy);
  }

  // --- Carrying an item (the controller's drag and drop) ---------------------

  private carryAnchor(): HTMLElement | null {
    const at = this.carry?.at;
    return at ? ('grid' in at ? at.grid : at.el) : null;
  }

  private startCarry(el: HTMLElement): void {
    const ops = activeInventory.ops!;
    const uid = el.dataset.item!;
    const loc = locate(ops.ws, uid);
    if (!loc) return;
    const grid = el.closest<HTMLElement>('[data-grid]');
    let at: CarryLoc;
    if (grid) {
      const g = grid.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      at = { grid, cx: Math.round((r.left - g.left) / CELL), cy: Math.round((r.top - g.top) / CELL) };
    } else {
      at = { el: el.closest<HTMLElement>('[data-slot]') ?? el };
    }
    this.carry = { uid, item: loc.item, rot: el.dataset.rot === '1', at };
    useDrag.setState({ hover: null, menu: null });
    this.hoverSet = false;
    this.focus?.classList.remove('pad-focus');
    this.updateCarry();
    audio.ui('pickup');
  }

  private carryPoint(): { x: number; y: number } | null {
    const at = this.carry?.at;
    if (!at) return null;
    if ('grid' in at) {
      const g = at.grid.getBoundingClientRect();
      return { x: g.left + at.cx * CELL + CELL / 2, y: g.top + at.cy * CELL + CELL / 2 };
    }
    const r = at.el.getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  }

  private updateCarry(): void {
    const ops = activeInventory.ops;
    const c = this.carry;
    if (!ops || !c) return;
    this.revealCarry();
    const p = this.carryPoint()!;
    const drag: DragInfo = { uid: c.uid, item: c.item, rot: c.rot, grabX: CELL / 2, grabY: CELL / 2, px: p.x, py: p.y };
    const target = resolveTarget(drag, ops);
    useDrag.setState({ drag, target, ok: validDrop(target, drag, ops), hover: null });
  }

  /** Keep the carried item's cell on screen inside a scrolling stash. */
  private revealCarry(): void {
    const at = this.carry?.at;
    if (!at || !('grid' in at)) return;
    const sc = at.grid.closest<HTMLElement>('.grid-scroll');
    if (!sc) return;
    const s = sc.getBoundingClientRect();
    const g = at.grid.getBoundingClientRect();
    const top = g.top + at.cy * CELL;
    if (top < s.top) sc.scrollTop -= s.top - top + 4;
    else if (top + CELL > s.bottom) sc.scrollTop += top + CELL - s.bottom + 4;
  }

  /** Everywhere an item can go: every grid cell, slot, quick slot and the sell counter. */
  private dropPoints(root: HTMLElement): { box: Box; loc: CarryLoc }[] {
    const out: { box: Box; loc: CarryLoc }[] = [];
    for (const grid of root.querySelectorAll<HTMLElement>('[data-grid]')) {
      if (!visible(grid)) continue;
      const g = grid.getBoundingClientRect();
      const cols = Math.round(g.width / CELL);
      const rows = Math.round(g.height / CELL);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          out.push({ box: { left: g.left + x * CELL, top: g.top + y * CELL, right: g.left + (x + 1) * CELL, bottom: g.top + (y + 1) * CELL }, loc: { grid, cx: x, cy: y } });
        }
      }
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-slot], [data-quick], [data-sell]')) {
      if (visible(el)) out.push({ box: box(el), loc: { el } });
    }
    return out;
  }

  private moveCarry(scope: HTMLElement, dir: Dir): void {
    const p = this.carryPoint();
    const c = this.carry;
    if (!p || !c) return;
    const pts = this.dropPoints(scope);
    const at = c.at;
    const from: Box = 'grid' in at
      ? { left: p.x - CELL / 2, top: p.y - CELL / 2, right: p.x + CELL / 2, bottom: p.y + CELL / 2 }
      : box(at.el);
    const others = pts.filter((q) => !('grid' in q.loc && 'grid' in at ? q.loc.grid === at.grid && q.loc.cx === at.cx && q.loc.cy === at.cy : 'el' in q.loc && 'el' in at && q.loc.el === at.el));
    const i = pickNext(from, others.map((q) => q.box), dir);
    if (i < 0) return;
    c.at = others[i].loc;
    this.updateCarry();
    audio.ui('hover');
  }

  private dropCarry(): void {
    const ops = activeInventory.ops;
    const c = this.carry;
    if (!ops || !c) return;
    const st = useDrag.getState();
    if (st.drag && st.target && st.ok && commitDrop(st.target, st.drag, ops)) {
      audio.ui(st.target.kind === 'slot' ? 'equip' : 'drop');
      this.carry = null;
      this.pendingUid = st.target.kind === 'sell' ? null : c.uid;
      useDrag.setState({ drag: null, target: null, ok: false });
      if (this.focus) this.focus.classList.remove('pad-focus');
      this.focus = null;
      return;
    }
    audio.ui('error');
  }

  private cancelCarry(): void {
    const uid = this.carry?.uid ?? null;
    this.carry = null;
    useDrag.setState({ drag: null, target: null, ok: false });
    this.pendingUid = uid;
    if (this.focus && useDevice.getState().device === 'pad') this.focus.classList.add('pad-focus');
  }
}

/** Mounted once for the whole app: polls the controller for menus. */
export function PadNav() {
  useEffect(() => {
    installDeviceWatch();
    const nav = new Navigator();
    let raf = 0;
    const loop = (now: number) => {
      try {
        nav.frame(now);
      } catch (err) {
        // A menu mid-teardown must never take the controller down with it.
        console.error('pad nav', err);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      nav.destroy();
    };
  }, []);
  return null;
}
