import { Container, Sprite } from 'pixi.js';
import { tex } from '../../engine/assets';
import type { AudioService } from '../../engine/audio';
import { TILE } from '../../engine/config';
import type { DoorDef, TileMap } from './tilemap';

const OPEN_TIME = 0.22; // seconds to slide fully open
const TRIGGER_DIST = 44; // px from door centre
const CLOSE_DELAY = 1.4;
/** Door is walkable once this far open. */
const PASSABLE_AT = 0.55;

interface DoorState {
  def: DoorDef;
  cx: number;
  cy: number;
  open: number; // 0..1
  wantOpen: boolean;
  idle: number;
  leaves: [Sprite, Sprite];
}

export interface DoorUser {
  x: number;
  y: number;
  alive: boolean;
}

/**
 * Automatic sliding doors. They open when anyone is near and close after a delay.
 * The hiss is an audio cue, and a door the player opens can be heard by nearby enemies.
 */
export class Doors {
  readonly container = new Container();
  private doors: DoorState[] = [];

  constructor(
    private map: TileMap,
    private audio: AudioService,
    private onPlayerNoise: (x: number, y: number, radius: number) => void,
  ) {
    for (const def of map.doors) {
      const [a, b] = def.tiles;
      const kind = def.vertical ? 'v' : 'h';
      const la = new Sprite(tex(`door_${kind}_a`));
      const lb = new Sprite(tex(`door_${kind}_b`));
      la.position.set(a.tx * TILE, a.ty * TILE);
      lb.position.set(b.tx * TILE, b.ty * TILE);
      // Leaves retract toward the outer edges.
      if (def.vertical) {
        lb.anchor.set(0, 1);
        lb.y += TILE;
      } else {
        lb.anchor.set(1, 0);
        lb.x += TILE;
      }
      this.container.addChild(la, lb);
      this.doors.push({
        def,
        cx: ((a.tx + b.tx) / 2 + 0.5) * TILE,
        cy: ((a.ty + b.ty) / 2 + 0.5) * TILE,
        open: 0,
        wantOpen: false,
        idle: 0,
        leaves: [la, lb],
      });
    }
  }

  update(dt: number, player: DoorUser, others: readonly DoorUser[]): void {
    for (const d of this.doors) {
      const near = (u: DoorUser) => u.alive && Math.hypot(u.x - d.cx, u.y - d.cy) < TRIGGER_DIST;
      const playerNear = near(player);
      const anyone = playerNear || others.some(near);
      if (anyone) {
        d.idle = 0;
        if (!d.wantOpen) {
          d.wantOpen = true;
          this.audio.sfx('door', d.cx, d.cy);
          if (playerNear) this.onPlayerNoise(d.cx, d.cy, 140);
        }
      } else if (d.wantOpen) {
        d.idle += dt;
        if (d.idle > CLOSE_DELAY && !this.occupied(d, player, others)) {
          d.wantOpen = false;
          this.audio.sfx('door', d.cx, d.cy);
        }
      }
      const target = d.wantOpen ? 1 : 0;
      const step = dt / OPEN_TIME;
      d.open = d.open < target ? Math.min(target, d.open + step) : Math.max(target, d.open - step);

      const passable = d.open >= PASSABLE_AT;
      for (const t of d.def.tiles) this.map.setDoorOpen(t.tx, t.ty, passable);

      const s = 1 - d.open * 0.82;
      for (const leaf of d.leaves) {
        if (d.def.vertical) leaf.scale.y = s;
        else leaf.scale.x = s;
      }
    }
  }

  /** Something is standing in the doorway: never close on it. */
  private occupied(d: DoorState, player: DoorUser, others: readonly DoorUser[]): boolean {
    const inside = (u: DoorUser) => u.alive && d.def.tiles.some((t) =>
      u.x > t.tx * TILE - 8 && u.x < (t.tx + 1) * TILE + 8 && u.y > t.ty * TILE - 8 && u.y < (t.ty + 1) * TILE + 8);
    return inside(player) || others.some(inside);
  }
}
