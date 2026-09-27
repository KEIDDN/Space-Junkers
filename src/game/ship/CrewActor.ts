import { Container, Graphics } from 'pixi.js';
import type { CrewStation } from '../../data/shipLayout';
import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DIR_UP, LayeredSprite, dirOf, type Dir } from '../entities/layers';
import { crewLook } from '../entities/look';

/**
 * How each of the crew spends time at their station. Kept small and grounded: the
 * hacker hunched at the console, the medic working over the bed or reading her notes,
 * the trader sorting stock with a cigarette going, the smuggler never quite settled or
 * crouched over her crates, the merc at the bench going over his kit or down on one knee
 * checking a plate.
 */
interface Routine {
  /** The pose they hold at their station, and which way they face. */
  rest: 'idle' | 'sit';
  facing: Dir;
  /** What they do now and then. */
  busy: 'type' | 'work' | 'sort' | 'glance' | 'kit';
  /** Seconds between bouts, and how long a bout lasts. */
  every: [number, number];
  lasts: [number, number];
  /** Sometimes they do this instead (a second small loop). */
  other?: { busy: 'crouch' | 'read'; chance: number };
  /** A cigarette going: an ember that brightens on a draw, a thread of smoke. */
  smokes?: boolean;
}

const ROUTINES: Record<string, Routine> = {
  hacker: { rest: 'sit', facing: DIR_UP, busy: 'type', every: [1.5, 4], lasts: [3, 7] },
  medic: { rest: 'idle', facing: DIR_LEFT, busy: 'work', every: [3, 6], lasts: [2.5, 5], other: { busy: 'read', chance: 0.3 } },
  trader: { rest: 'sit', facing: DIR_DOWN, busy: 'sort', every: [5, 9], lasts: [2, 3.5], smokes: true },
  smuggler: { rest: 'idle', facing: DIR_DOWN, busy: 'glance', every: [1.5, 4], lasts: [0.8, 1.6], other: { busy: 'crouch', chance: 0.3 } },
  merc: { rest: 'idle', facing: DIR_DOWN, busy: 'kit', every: [6, 11], lasts: [4, 8], other: { busy: 'crouch', chance: 0.35 } },
};

const rand = ([a, b]: [number, number]) => a + Math.random() * (b - a);

/**
 * A crew member at their station. Breathes, keeps busy in character, turns to face the
 * operator when they come close, and talks with their hands in conversation.
 */
export class CrewActor {
  readonly container = new Container();
  private body: LayeredSprite;
  private routine: Routine;
  private t = Math.random() * 3;
  private busyT = 0;
  private busyLeft = 0;
  private glanceDir: Dir = DIR_DOWN;
  private talkT = 0;
  /** This bout is the second loop (see Routine.other). */
  private alt = false;
  private smoke: Graphics | null = null;
  private puffs: { x: number; y: number; life: number }[] = [];
  private drag = 3 + Math.random() * 5;
  /** Set on the frame they start fiddling with their station (for its sound). */
  busied = false;

  constructor(readonly station: CrewStation, sprite: string) {
    this.routine = ROUTINES[sprite] ?? ROUTINES.smuggler;
    if (station.anim === 'sit') this.routine = { ...this.routine, rest: 'sit' };
    const shadow = new Graphics().ellipse(0, 0, 10, 3.5).fill({ color: 0x000000, alpha: 0.4 });
    this.body = new LayeredSprite(crewLook(sprite));
    this.container.addChild(shadow, this.body.container);
    if (this.routine.smokes) {
      this.smoke = new Graphics();
      this.container.addChild(this.smoke);
    }
    this.container.position.set(Math.round(station.x), Math.round(station.y));
    this.container.zIndex = station.y;
    this.busyT = rand(this.routine.every);
  }

  update(dt: number, px: number, py: number, talking: boolean): void {
    this.busied = false;
    this.t += dt;
    const r = this.routine;
    const seated = r.rest === 'sit';
    const near = Math.hypot(px - this.station.x, py - this.station.y) < 90;
    const toPlayer = dirOf(Math.atan2(py - (this.station.y - 16), px - this.station.x));
    let bob = 0;

    if (talking) {
      // Face you and talk with the hands (seated crew turn in their seat).
      this.talkT += dt;
      if (seated) this.body.show('sit', toPlayer, 0);
      else {
        const f = [1, 2, 3, 2][Math.floor(this.talkT * 4) % 4];
        this.body.show('spellcast', toPlayer, f);
      }
      this.container.y = Math.round(this.station.y);
      return;
    }
    this.talkT = 0;

    // Keep busy now and then (not while someone stands right there).
    if (this.busyLeft > 0) this.busyLeft -= dt;
    else if (!near) {
      this.busyT -= dt;
      if (this.busyT <= 0) {
        this.busyLeft = rand(r.lasts);
        this.busyT = rand(r.every);
        this.alt = !!r.other && Math.random() < r.other.chance;
        this.busied = r.busy !== 'glance' && !this.alt;
        const sides: Dir[] = [DIR_LEFT, DIR_RIGHT, DIR_DOWN];
        this.glanceDir = sides[Math.floor(Math.random() * sides.length)];
      }
    }
    const busy = this.busyLeft > 0 && !near;
    const breathe = Math.sin(this.t * 1.9) > 0.3 ? 1 : 0;

    if (near) {
      if (seated) this.body.show('sit', toPlayer, 0);
      else this.body.show('idle', toPlayer, breathe);
    } else if (!busy) {
      if (seated) this.body.show('sit', r.facing, 0);
      else this.body.show('idle', r.facing, breathe);
    } else if (this.alt && r.other) {
      if (r.other.busy === 'crouch') {
        // Down on one knee at the crates or the bench: counting, checking, repacking.
        this.body.show('kneel', r.busy === 'glance' ? DIR_DOWN : DIR_RIGHT, 0);
      } else {
        // Reading: still, head down over the notes, a page turned now and then.
        this.body.show('idle', DIR_DOWN, Math.sin(this.t * 0.7) > 0.95 ? 1 : 0);
        bob = 1;
      }
    } else {
      switch (r.busy) {
        case 'type':
          // Hunched over the keys: small, quick jolts.
          this.body.show('sit', r.facing, 0);
          bob = Math.sin(this.t * 22) > 0.4 && Math.sin(this.t * 3.1) > -0.2 ? 1 : 0;
          break;
        case 'work': {
          // Hands busy at the bed: reach, check, set down.
          const f = [2, 3, 4, 3][Math.floor(this.t * 2.6) % 4];
          this.body.show('spellcast', r.facing, f);
          break;
        }
        case 'sort':
          // Turns to one crate, then the other, shifting stock.
          this.body.show('sit', this.glanceDir === DIR_DOWN ? DIR_LEFT : this.glanceDir, 0);
          bob = Math.sin(this.t * 5) > 0.5 ? 1 : 0;
          break;
        case 'glance':
          // Never quite still: a look over one shoulder, then the other.
          this.body.show('idle', this.glanceDir, breathe);
          break;
        case 'kit': {
          // Turned to the bench, stripping and checking the gear: slow, practised hands.
          const f = [2, 2, 3, 4, 3, 2][Math.floor(this.t * 1.8) % 6];
          this.body.show('spellcast', DIR_RIGHT, f);
          break;
        }
      }
    }
    this.container.y = Math.round(this.station.y) + bob;
    this.smokeTick(dt, seated);
  }

  /** Fedya's cigarette: the ember glows up on a draw, then a little smoke rises and thins. */
  private smokeTick(dt: number, seated: boolean): void {
    const g = this.smoke;
    if (!g) return;
    this.drag -= dt;
    const drawing = this.drag < 0.8 && this.drag > 0;
    if (this.drag <= 0) {
      this.drag = 4 + Math.random() * 6;
      for (let i = 0; i < 3; i++) this.puffs.push({ x: 3 + Math.random() * 2, y: (seated ? -31 : -32) - i * 2, life: 1.6 + i * 0.4 });
    }
    g.clear();
    // At the corner of the mouth (the drawn head's mouth sits ~30 px above the feet).
    const ex = 3;
    const ey = seated ? -29 : -30;
    g.rect(ex, ey, 1, 1).fill({ color: drawing ? 0xffb04a : 0xb0502a, alpha: drawing ? 1 : 0.8 });
    for (const p of this.puffs) {
      p.life -= dt;
      p.y -= dt * 7;
      p.x += Math.sin(p.life * 3) * dt * 3;
      if (p.life > 0) g.rect(Math.round(p.x), Math.round(p.y), 1, 1).fill({ color: 0xb8b4ac, alpha: Math.min(0.45, p.life * 0.25) });
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
  }
}
