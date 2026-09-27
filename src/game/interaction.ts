import { Container, Graphics, Sprite } from 'pixi.js';
import { tex } from '../engine/assets';
import type { AudioService } from '../engine/audio';
import { TILE } from '../engine/config';
import type { Input } from '../engine/input';
import { Rng } from '../engine/rng';
import { CONTAINERS, rollContainer } from '../data/loot';
import type { Grid } from '../core/inventory';
import { raid, useRaid } from '../state/raidStore';
import type { TileMap } from './world/tilemap';

const REACH = 40; // px from player to lootable
const CLOSE_DIST = 64; // walking this far from an open container closes it
const EXTRACT_TIME = 12; // seconds holding the zone
const ALARM_INTERVAL = 4;
const ALARM_RADIUS = 720;

export type LootKind = 'container' | 'body' | 'pile';

interface Lootable {
  id: string;
  kind: LootKind;
  label: string;
  /** Current interaction point (bodies can slide). */
  pos(): { x: number; y: number };
  /** Seconds to search the first time (0 = open immediately). */
  searchTime: number;
  searched: boolean;
  sprite: Sprite | null;
  /** Rolls the contents the first time it's opened. */
  roll(): Grid;
}

export interface InteractionEvents {
  onNoise(x: number, y: number, radius: number): void;
  onLight(x: number, y: number, radius: number, color: number, intensity: number): void;
  onExtracted(): void;
}

export interface InteractionView {
  prompt: string | null;
  countdown: number | null;
  inZone: boolean;
}

/**
 * Player-world interactions: searching containers and bodies (hold E), opening searched
 * ones and item piles (E), and extraction (E in the zone starts a countdown that sounds an
 * alarm; stay in the zone to leave).
 */
export class Interactions {
  /** World-space UI (progress bars, zone markings) drawn above the darkness. */
  readonly overlay = new Container();

  private lootables: Lootable[] = [];
  private bar = new Graphics();
  private searching: Lootable | null = null;
  private progress = 0;
  private rummageTimer = 0;
  private extractRemaining: number | null = null;
  private alarmTimer = 0;
  private beaconTimer = 0;
  private done = false;
  private pileCount = 0;

  /** @param layer depth-sorted actor layer; container and pile sprites go in it. */
  constructor(private map: TileMap, private audio: AudioService, private ev: InteractionEvents, private layer: Container) {
    map.containers.forEach((place, i) => {
      const def = CONTAINERS[place.type];
      const sprite = new Sprite(tex(def.sprite));
      sprite.anchor.set(0.5, 1);
      const x = place.tx * TILE + TILE / 2;
      const y = place.ty * TILE + TILE - 3;
      sprite.position.set(x, y);
      sprite.zIndex = y;
      this.layer.addChild(sprite);
      const seed = (map.seed * 7919 + i * 104729) >>> 0;
      this.lootables.push({
        id: `c${i}`, kind: 'container', label: def.label, pos: () => ({ x, y: y - 10 }),
        searchTime: def.searchTime, searched: false, sprite,
        roll: () => rollContainer(new Rng(seed), def, place.risk),
      });
    });
    this.overlay.addChild(this.zoneMarkings(), this.bar);
  }

  get extracting(): boolean {
    return this.extractRemaining !== null;
  }

  /** A body becomes lootable when its owner dies. */
  addBody(id: string, pos: () => { x: number; y: number }, contents: Grid): void {
    this.lootables.push({ id, kind: 'body', label: 'BODY', pos, searchTime: 1.1, searched: false, sprite: null, roll: () => contents });
  }

  /**
   * Drop items at a spot: joins a pile within reach, or starts a new one.
   * @returns the pile's container id (contents are managed by the raid store).
   */
  dropPile(x: number, y: number): string {
    for (const l of this.lootables) {
      if (l.kind !== 'pile') continue;
      const p = l.pos();
      if (Math.hypot(p.x - x, p.y - y) < 24) return l.id;
    }
    const id = `pile${this.pileCount++}`;
    const sprite = new Sprite(tex('item_sack'));
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(0.5);
    sprite.position.set(Math.round(x), Math.round(y + 4));
    sprite.zIndex = y;
    this.layer.addChild(sprite);
    this.lootables.push({ id, kind: 'pile', label: 'DROPPED ITEMS', pos: () => ({ x, y }), searchTime: 0, searched: true, sprite, roll: () => ({ w: 6, h: 5, items: [] }) });
    return id;
  }

  /**
   * @param busy player can't interact right now (dead)
   * @param moving player is moving (cancels searching)
   * @param menuOpen the inventory is open: E closes it instead of interacting
   */
  update(dt: number, input: Input, px: number, py: number, busy: boolean, moving: boolean, menuOpen: boolean): InteractionView {
    this.bar.clear();
    this.refreshPiles();
    if (this.done) return { prompt: null, countdown: null, inZone: false };

    const inZone = this.map.inExtraction(px, py);
    const extracting = this.extractRemaining !== null;

    // Walking away from an open container closes it.
    const open = useRaid.getState().open;
    if (open) {
      const l = this.lootables.find((q) => q.id === open.id);
      if (l) {
        const p = l.pos();
        if (Math.hypot(p.x - px, p.y - py) > CLOSE_DIST) raid.patch({ open: null });
      }
    }

    // --- Extraction countdown
    if (this.extractRemaining !== null) {
      this.beaconTimer -= dt;
      this.alarmTimer -= dt;
      const e = this.map.extraction!;
      const zx = (e.x + e.w / 2) * TILE;
      const zy = (e.y + e.h / 2) * TILE;
      if (this.beaconTimer <= 0) {
        this.beaconTimer = inZone ? 1 : 0.5;
        this.audio.sfx('beacon', zx, zy);
        this.ev.onLight(zx, zy, 140, 0x7dff9a, 0.7);
      }
      if (this.alarmTimer <= 0) {
        this.alarmTimer = ALARM_INTERVAL;
        this.audio.sfx('alarm', zx, zy);
        this.ev.onNoise(zx, zy, ALARM_RADIUS);
      }
      if (inZone && !busy) this.extractRemaining -= dt;
      if (this.extractRemaining <= 0) {
        this.done = true;
        this.audio.sfx('extracted', px, py);
        this.ev.onExtracted();
        return { prompt: null, countdown: 0, inZone };
      }
    }

    if (busy || menuOpen) {
      this.searching = null;
      return { prompt: null, countdown: this.extractRemaining, inZone };
    }

    if (inZone && !extracting) {
      if (input.wasPressed('KeyE')) {
        this.extractRemaining = EXTRACT_TIME;
        this.alarmTimer = 0;
        this.beaconTimer = 0;
      }
      return { prompt: '[E] SIGNAL EXTRACTION. The alarm will sound', countdown: null, inZone };
    }

    // --- Lootables
    let nearest: Lootable | null = null;
    let best = REACH;
    for (const l of this.lootables) {
      if (l.kind === 'pile' && !this.pileHasItems(l)) continue;
      const p = l.pos();
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < best) {
        best = d;
        nearest = l;
      }
    }
    if (this.searching && this.searching !== nearest) this.searching = null;
    if (!nearest) return { prompt: null, countdown: this.extractRemaining, inZone };

    if (nearest.searched) {
      if (input.wasPressed('KeyE')) this.open(nearest);
      const n = useRaid.getState().containers[nearest.id]?.items.length ?? 0;
      return { prompt: `[E] OPEN ${nearest.label}${n ? '' : ' (EMPTY)'}`, countdown: this.extractRemaining, inZone };
    }

    const holding = input.isDown('KeyE');
    if (holding && !moving) {
      if (this.searching !== nearest) {
        this.searching = nearest;
        this.progress = 0;
      }
      this.progress += dt / nearest.searchTime;
      this.rummageTimer -= dt;
      const p = nearest.pos();
      if (this.rummageTimer <= 0) {
        this.rummageTimer = 0.28;
        this.audio.sfx('rummage', p.x, p.y);
        this.ev.onNoise(p.x, p.y, 70);
      }
      this.drawBar(p.x, p.y, Math.min(1, this.progress));
      if (this.progress >= 1) this.finishSearch(nearest);
    } else {
      this.searching = null;
      this.progress = 0;
    }
    return { prompt: `[HOLD E] SEARCH ${nearest.label}`, countdown: this.extractRemaining, inZone };
  }

  private finishSearch(l: Lootable): void {
    l.searched = true;
    this.searching = null;
    if (!raid.hasContainer(l.id)) raid.setContainer(l.id, l.roll());
    if (l.kind === 'container') raid.searched();
    const p = l.pos();
    const n = useRaid.getState().containers[l.id].items.length;
    this.audio.sfx(n ? 'loot' : 'dryfire', p.x, p.y);
    this.open(l);
  }

  private open(l: Lootable): void {
    if (!raid.hasContainer(l.id)) raid.setContainer(l.id, l.roll());
    raid.openContainer(l.id, l.label);
    this.audio.sfx('rummage', l.pos().x, l.pos().y);
  }

  private pileHasItems(l: Lootable): boolean {
    return (useRaid.getState().containers[l.id]?.items.length ?? 0) > 0;
  }

  /** Searched containers go dark when empty; empty piles disappear. */
  private refreshPiles(): void {
    const containers = useRaid.getState().containers;
    for (const l of this.lootables) {
      if (!l.sprite || !l.searched) continue;
      const empty = (containers[l.id]?.items.length ?? 0) === 0;
      if (l.kind === 'pile') l.sprite.visible = !empty;
      else l.sprite.tint = empty ? 0x4a4642 : 0x8a847c;
    }
  }

  private drawBar(bx: number, by: number, p: number): void {
    const x = Math.round(bx - 12);
    const y = Math.round(by - 26);
    this.bar.rect(x - 1, y - 1, 26, 4).fill({ color: 0x000000, alpha: 0.8 });
    this.bar.rect(x, y, Math.round(24 * p), 2).fill({ color: 0xf2a33a });
  }

  /** Hazard-striped floor outline so the zone reads even in the dark. */
  private zoneMarkings(): Graphics {
    const g = new Graphics();
    const e = this.map.extraction;
    if (!e) return g;
    const x0 = e.x * TILE;
    const y0 = e.y * TILE;
    const w = e.w * TILE;
    const h = e.h * TILE;
    for (let i = 0; i < w; i += 8) {
      const c = (i / 8) % 2 === 0 ? 0xe0b030 : 0x1a1a1a;
      g.rect(x0 + i, y0, 4, 2).fill({ color: c, alpha: 0.7 });
      g.rect(x0 + i, y0 + h - 2, 4, 2).fill({ color: c, alpha: 0.7 });
    }
    for (let i = 0; i < h; i += 8) {
      const c = (i / 8) % 2 === 0 ? 0xe0b030 : 0x1a1a1a;
      g.rect(x0, y0 + i, 2, 4).fill({ color: c, alpha: 0.7 });
      g.rect(x0 + w - 2, y0 + i, 2, 4).fill({ color: c, alpha: 0.7 });
    }
    g.rect(x0 + w / 2 - 6, y0 + h / 2 - 1, 12, 2).fill({ color: 0x7dff9a, alpha: 0.5 });
    g.rect(x0 + w / 2 - 1, y0 + h / 2 - 6, 2, 12).fill({ color: 0x7dff9a, alpha: 0.5 });
    return g;
  }
}
